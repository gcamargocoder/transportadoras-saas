# Torre de Controle Operacional (Fase 105)

Painel operacional central para acompanhamento em tempo real das viagens em
andamento e identificação rápida de problemas que exigem intervenção.
Auditoria prévia confirmou que a Fase 29 já havia entregue a base correta
para isso — `GET /trips/operations/active` (painel "Monitoramento",
`/operations`) — então esta fase **enriquece o mesmo endpoint/entidade**, sem
criar uma segunda fonte de dados, e adiciona uma **página nova** de
apresentação dedicada, sem alterar a página de Monitoramento existente.

## 1. Decisão de arquitetura: enriquecer, não duplicar

`TripsService.getActiveOperations(tenantId)` (Fase 29) já cobria: viagens
ativas, veículo/motorista, origem/destino, status operacional, posição,
desvio de rota, resumo de pedágio e alertas — tudo já calculado em lote
(`Promise.all` com queries `IN tripIds`, nunca 1 por viagem). As lacunas reais
encontradas na auditoria eram apenas:

* entregas pendentes/em andamento/concluídas/com falha/canceladas por viagem;
* ocorrências em aberto e ocorrências críticas em aberto por viagem;
* sinal de atraso (previsão de chegada x agora).

Essas 3 lacunas foram fechadas **estendendo o mesmo `Promise.all`** de
`getActiveOperations` com mais 2 queries em lote (de 5 para 7 — nunca 1 por
viagem):

```
trip.findMany(...)                                   -- ja existia
Promise.all([
  trackingPoint (distinct por viagem)                 -- ja existia
  routeEvent (desvios em aberto)                       -- ja existia
  tollReconciliation.getSummaries (2 queries)          -- ja existia
  alert                                                -- ja existia
  tenantSettings                                       -- ja existia
  tripDeliveryStop.groupBy(['tripId','status'])         -- Fase 105 (novo)
  tripOccurrence.groupBy(['tripId','severity'],         -- Fase 105 (novo)
    where: { resolvedAt: null, cancelledAt: null })
  checklistExecution.findMany(                          -- Fase 111 (novo)
    where: { tripId IN, template: { type: PRE_TRIP } })
])
```

Nenhum endpoint novo foi criado no backend — `GET /trips/operations/active`
continua a mesma rota, mesmo RBAC (`TRIP_READ_ROLES`), mesmo isolamento
multi-tenant (`tenantId` em todas as queries, herdado do endpoint original).

### Campos novos em `TripOperationEntity`

| Campo | Fonte | Cálculo |
|---|---|---|
| `deliverySummary` | `TripDeliveryStop` (Fase 88/99) | `groupBy(['tripId','status'])` reduzido com `buildDeliveryStopCountsByTrip` — **mesma função já usada** por `FleetOperationsMetricsService`/`EmptyTripsService`, nunca uma segunda fórmula |
| `openOccurrencesCount` | `TripOccurrence` (Fase 68) | `groupBy(['tripId','severity'])` com `resolvedAt: null, cancelledAt: null` — mesmo critério de "ocorrência em aberto" já usado por `NotificationsService.collectCriticalOccurrences` |
| `criticalOpenOccurrencesCount` | idem | Subconjunto do acima com `severity: 'CRITICAL'` |
| `plannedArrival` | `Trip.plannedArrival` | Campo escalar já trazido pela query original (`include`, não `select` — nunca uma query extra) |
| `isDelayed` | `Trip.plannedArrival` vs. agora | **Mesmo critério já usado por `FleetOperationsMetricsService.delayedTrips`**: `plannedArrival < agora` e a viagem ainda não terminou (garantido aqui porque `getActiveOperations` só retorna viagens em `NON_TERMINAL_STATUSES`). `plannedArrival = null` nunca é tratado como atraso. |
| `preTripChecklistStatus` **(Fase 111)** | `ChecklistExecution` (tipo `PRE_TRIP`) | Status da execução mais recente da viagem (`orderBy startedAt desc`, 1ª por `tripId` vence) — `null` quando nenhuma foi iniciada |
| `preTripChecklistHasCriticalNonConformity` **(Fase 111)** | idem | **Mesma** `hasCriticalNonConformity` já usada em `GET /checklists/executions`/`TripsService.assertPreTripChecklistSatisfied` — só calculada quando a execução mais recente está `COMPLETED` (nunca calculada sobre uma execução ainda em andamento) |

### Por que o ETA completo (rota/trânsito) não entra na lista

`TripEtaService.compute(tenantId, tripId)` (Fase 91) executa ~5-6 queries
**por viagem** (viagem, paradas, `RoutePlan`, `TrackingPoint` etc.).
Integrá-lo em lote na lista de operações ativas reintroduziria N+1 — direto
contra o requisito "evitar N+1 e consultas repetitivas" desta fase. Decisão:
a lista usa apenas o sinal barato `isDelayed` (zero queries extras); o ETA
completo (estimativa de chegada, variância, próxima parada, limitações)
continua disponível sob demanda no endpoint já existente
`GET /trips/:tripId/eta`, acessível a partir de um link por viagem na Torre
de Controle — nunca pré-calculado em massa.

### "Progresso da viagem"

Interpretado como o já existente `operationalStatus` (situação derivada:
em movimento/parado/parado há muito tempo/fora de rota/pausada/concluída)
somado ao novo `deliverySummary` ("3 de 5 entregas concluídas"). Uma barra
de progresso por distância percorrida exigiria integrar
`TripMetrics.actualDistanceKm`, campo **auditado e confirmado como nunca
escrito por nenhum service** (mesma limitação já documentada em
`fleet-operations-dashboard.md`) — não implementado para não inventar um
dado que não existe.

## 2. Frontend

### Página nova: `/operations/control-tower`

`apps/admin-web/src/app/(app)/operations/control-tower/page.tsx` —
componente novo, mas construído inteiramente com blocos visuais já
existentes (`PageHeader`, `StatCard`, `Tabs`, `FilterBar`, `FormField`,
`EntitySelect`, `DataTable`, `Badge`, `DatePicker`), no mesmo padrão visual
das demais páginas operacionais. A página de Monitoramento (`/operations`,
Fase 29) permanece **totalmente inalterada** — a Torre de Controle é uma
apresentação adicional sobre os mesmos dados, não uma substituição.

* **Atualização**: mesmo mecanismo de polling já estabelecido na Fase 29
  (`OPERATIONS_POLL_INTERVAL_MS = 10_000`, `refetchIntervalInBackground:
  false`, via React Query) — não há WebSocket/SSE na infraestrutura atual
  (auditoria da Fase 29, reconfirmada aqui); nenhum segundo sistema de tempo
  real foi criado.
* **Indicadores no topo** (`StatCard`): viagens em andamento, atrasadas, com
  ocorrência crítica, que exigem intervenção, entregas com falha, entregas
  pendentes/em andamento, alertas em aberto — todos derivados **em memória**
  do mesmo array já buscado (`items`), sem nenhuma chamada adicional ao
  backend.
* **Filtros**: status (abas "Todas"/"Atrasadas"/"Ocorrência crítica"/"Exigem
  intervenção", mesmo padrão de abas client-side já usado em
  `/operations`), veículo e motorista (`EntitySelect`, mesmo componente já
  usado em outras páginas), período de chegada prevista (`DatePicker` sobre
  `plannedArrival`). Todos os filtros são aplicados **inteiramente no
  cliente** sobre a lista já carregada — `GET /trips/operations/active` não
  ganhou nenhum parâmetro de query novo, pois a lista de operações ativas já
  é naturalmente pequena (só viagens não terminadas) e cada tenant só vê a
  sua própria (isolamento multi-tenant herdado do endpoint).
* **"Exige intervenção"**: predicado local que combina os sinais já
  existentes por viagem — desvio de rota não resolvido, ocorrência crítica
  em aberto, atraso, entrega com falha, GPS offline, conciliação de pedágio
  em atenção/crítica, alerta de severidade alta/crítica, e **(Fase 111)**
  checklist pré-viagem concluído com não-conformidade crítica. Nenhum
  cálculo novo no backend; apenas composição em memória dos campos já
  retornados.
* **Coluna "Checklist pré-viagem" (Fase 111)**: badge por viagem —
  "Item crítico" (vermelho, quando `preTripChecklistHasCriticalNonConformity`),
  "Concluído" (verde), "Pendente" (amarelo, quando iniciado mas não
  concluído), ou `—` quando nenhum foi iniciado.
* **Links rápidos**: cada linha oferece links diretos para o veículo
  (`/vehicles/:id`), e para a viagem já na aba de entregas
  (`/trips/:id?tab=delivery-stops`) ou de ocorrências
  (`/trips/:id?tab=occurrences`); clicar na linha abre a viagem
  (`/trips/:id`, aba padrão).

### Deep-link `?tab=` na página de detalhe da viagem

`apps/admin-web/src/app/(app)/trips/[id]/page.tsx` passou a ler um parâmetro
opcional `?tab=` (via `useSearchParams`) para definir a aba **inicial**
exibida, validado contra a união `TabValue` já existente — cai para
`'overview'` (comportamento anterior, inalterado) quando ausente ou
inválido. Não sincroniza de volta na URL durante a navegação por abas
(mudança puramente aditiva, sem efeito em nenhum fluxo existente). Permite
que a Torre de Controle e qualquer outro ponto do sistema linkem direto para
`/trips/:id?tab=delivery-stops` ou `/trips/:id?tab=occurrences`.

### Navegação

Item novo "Torre de Controle" adicionado ao grupo "Operação" do menu
(`nav-config.ts`), logo abaixo de "Monitoramento" — mesmas
`roles: TRIP_READ_ROLES` e `module: TenantModule.TRIPS` já usados por
"Viagens"/"Entregas"/"Ocorrências de Entrega".

## 3. RBAC e multi-tenant

Sem mudança de política: `GET /trips/operations/active` continua exigindo
`TRIP_READ_ROLES` (bloqueia `DRIVER`, 403), e o isolamento por tenant é
herdado integralmente do endpoint já existente — todas as queries novas
(`tripDeliveryStop.groupBy`, `tripOccurrence.groupBy`) são escopadas por
`tenantId` como as demais.

## 4. Testes

* **Backend** (`test/trip-operations-monitor.e2e-spec.ts`, estendido com 7
  cenários novos): `deliverySummary` por status (pending/in_progress/
  completed/failed/cancelled), viagem sem paradas planejadas (zerado, nunca
  omitido), `openOccurrencesCount`/`criticalOpenOccurrencesCount` (excluindo
  ocorrências resolvidas/canceladas), `isDelayed` true (`plannedArrival` no
  passado), false (no futuro) e false (`plannedArrival` nulo — nunca inventa
  atraso), isolamento multi-tenant dos novos campos. Os 10 cenários
  pré-existentes da Fase 29 (posição, movimento, pausa, conclusão, desvio,
  recálculo de rota, pedágio, isolamento, RBAC) continuam passando sem
  alteração.
* **Fase 111** (`test/trip-operations-monitor.e2e-spec.ts`, +4 cenários):
  `preTripChecklistStatus`/`preTripChecklistHasCriticalNonConformity` --
  null/false sem nenhum checklist iniciado, `true` quando `COMPLETED` com
  item crítico respondido NÃO, `false` quando `COMPLETED` sem
  não-conformidade, e `IN_PROGRESS` quando iniciado mas não concluído.
* **N+1** (`test/trip-operations-load.e2e-spec.ts`, Fase 32): reconfirmado
  que o número de queries permanece **fixo** (12, antes 11, antes 10, antes 8)
  independente do número de viagens ativas (10/25/50/100 viagens testadas) —
  cada query nova entrou no mesmo `Promise.all`/lote seguinte, sem crescer
  proporcionalmente a N. O teste em si verifica a RAZÃO de crescimento
  (≤3x entre 10 e 100 viagens), não um número absoluto — não precisou de
  alteração nesta fase.
* **Frontend** (`operations/control-tower/page.test.tsx`, 6 testes da Fase
  105 + 2 novos da Fase 111): estado vazio, indicadores resumidos no topo,
  badges de entrega/ocorrência/atraso por linha, filtro por aba
  "Atrasadas", filtro por veículo, links rápidos de entrega/ocorrência e
  navegação ao clicar na linha, badge de checklist crítico contando em
  "Exigem intervenção", badge "Concluído" sem pendência.
  `operations/page.test.tsx` (Monitoramento, Fase 29) precisou apenas de um
  ajuste mecânico no mock `buildItem()` para incluir os campos novos agora
  obrigatórios na entidade compartilhada (5 da Fase 105, 2 da Fase 111) —
  nenhuma mudança de comportamento da página em si.

## 4.1 Fase 114 — evolução para uma visão realmente acionável

Auditoria prévia (`TripsService.getActiveOperations`, `TripOperationEntity`,
`control-tower/page.tsx`, e a integração já existente com entregas/ETA/
ocorrências/POD/documentos/checklist/motorista/veículo/manutenção/
abastecimento/pneus/rota/métricas) confirmou que a Fase 105/111 já cobria a
quase totalidade do pedido: consolidação em lote, atraso, ocorrência crítica,
entrega com falha, checklist crítico, drill-down para entregas/ocorrências,
filtros por veículo/motorista/período, atualização por polling (sem
push/tempo real, mesma decisão já tomada na Fase 29/105). ETA completo
continua propositalmente fora do lote (seção 1) — evitaria N+1.

Dois gaps reais, ambos usando **dados já existentes** (nenhum SLA/prioridade/
risco inventado):

1. **`Trip.priority`** (`LOW`/`NORMAL`/`HIGH`/`URGENT`, definida no
   planejamento desde a criação da viagem, Fase 1) nunca aparecia na Torre de
   Controle — um campo real já configurável pelo usuário (mesmo
   `TRIP_PRIORITY_LABELS` já usado em `create-trip-modal`/
   `update-trip-plan-modal`) que simplesmente não era exposto. Adicionado a
   `TripOperationEntity.priority` **sem nenhuma query nova** (já vinha junto
   com `Trip` no `include` existente) — badge na tabela (oculta quando
   `NORMAL`, o valor mais comum) e filtro dedicado, mesmo padrão dos filtros
   de veículo/motorista já existentes.
2. **Risco de manutenção do veículo em viagem agora** — `MaintenancePlan`
   (Fase 45) já tem uma avaliação real de vencimento
   (`evaluateMaintenancePlan`, mesma função pura já usada no dashboard de
   frota — `FleetOperationsMetricsService.computeMaintenancePlanStatus` — e
   nas notificações de plano vencido — `NotificationsService.
   collectMaintenancePlansDue`), mas nunca era cruzada com "este veículo está
   numa viagem ativa agora". Adicionado `TripOperationEntity.maintenanceStatus`
   (`OK`/`DUE_SOON`/`OVERDUE`/`UNKNOWN`, pior status entre os planos ativos do
   veículo) via 2 queries novas em lote, escopadas aos veículos das viagens
   ativas (nunca o catálogo inteiro do tenant, nunca 1 query por veículo):
   `maintenancePlan.findMany({ vehicleId: { in: vehicleIds } })` e, só quando
   há planos, `vehicleMaintenance.findMany({ maintenancePlanId: { in: planIds
   }, status: COMPLETED })` (o odômetro atual já vinha no `include` existente
   de `Trip.composition.vehicle`, sem query extra). `OVERDUE` passou a contar
   também em "Exigem intervenção" — um caminhão com preventiva vencida
   rodando é um risco operacional real, não só informativo.

**Auditados e sem gap real encontrado** (para não inventar sinais que os
dados atuais não sustentam):

* **Abastecimento** — a única anomalia detectável já existente
  (`FUEL_ODOMETER_REGRESSION`) é uma inconsistência de cadastro, não um
  risco operacional da viagem em curso; não haveria o que mostrar aqui sem
  inventar uma regra nova.
* **Pneus** — `TIRE_NEAR_REPLACEMENT` (Fase 64/108) é por pneu individual,
  não por veículo/viagem, e já é uma preocupação de planejamento de frota
  (dashboard de pneus), não de intervenção imediata numa viagem em
  andamento; cruzá-lo aqui exigiria uma nova agregação por veículo sem
  precedente em nenhum outro lugar do sistema — evitado.
* **Entrega sem comprovante (POD)** — não existe, em nenhum lugar do
  sistema, uma regra "entrega COMPLETED sem `DELIVERY_PROOF` é uma
  pendência" (nem notificação, nem dashboard). Inventar essa regra aqui
  seria criar uma "segunda fonte da verdade" de conformidade documental sem
  base — em vez disso, o **drill-down para documentos** (abaixo) resolve o
  acesso rápido sem afirmar uma pendência que o sistema não define
  formalmente.

**Acesso rápido ao contexto — 3 links novos** (nenhum endpoint novo; todas
as rotas já existiam):

* **Motorista** → `/drivers/:driverId` (já existia para o veículo, faltava
  para o motorista, mostrado com o mesmo destaque na tabela).
* **Documentos** → `/trips/:id?tab=fiscal` (mesmo mecanismo de deep-link
  `?tab=` já criado na Fase 105 para entregas/ocorrências — reaproveitado,
  não duplicado).

Nenhuma migration, nenhuma integração financeira nova, nenhum mecanismo de
push/tempo real novo (polling continua sendo o único mecanismo, mesma
decisão da Fase 29/105).

### Testes (Fase 114)

* **Backend** (`test/trip-operations-monitor.e2e-spec.ts`, +5 cenários):
  `priority` refletindo `Trip.priority`, `maintenanceStatus` `UNKNOWN` sem
  plano ativo, `OVERDUE`/`DUE_SOON`/`OK` por km (mesmos cenários numéricos já
  usados em `notifications.e2e-spec.ts` para `evaluateMaintenancePlan`).
  `test/trip-operations-load.e2e-spec.ts` reconfirma ausência de N+1 (queries
  fixas, 12 agora, independente de 10/25/50/100 viagens).
* **Frontend** (`control-tower/page.test.tsx`, +2 testes): badge de
  prioridade (oculto em NORMAL) e filtro por prioridade; badge "Vencida" de
  manutenção contando em "Exigem intervenção". `operations/page.test.tsx`
  (Monitoramento) recebeu o mesmo ajuste mecânico de mock já feito nas
  fases anteriores (2 campos novos obrigatórios na entidade compartilhada).
* Regressão completa sem alteração de asserções: `trips`, `trip-delivery-
  stops`, `trip-routing`, `trip-eta`, `checklists`, `notifications`,
  `maintenances`, `fleet-maintenance`, `maintenance-providers`,
  `maintenance-vehicle-integration`, `tire-management`,
  `tire-vehicle-integration`, `fuel-management`, `fleet-operations-fuel`,
  `fleet`, `fleet-availability`, `driver-trips`.

## 5. Fora de escopo / indisponível (declarado)

* ETA completo (rota/trânsito) por viagem **não é** pré-calculado em massa
  na Torre de Controle — ver seção 1. Disponível sob demanda via
  `GET /trips/:tripId/eta`.
* Barra de progresso por distância percorrida — indisponível pela mesma
  limitação de `TripMetrics.actualDistanceKm` já documentada em
  `fleet-operations-dashboard.md`.
* Nenhuma migration foi necessária — todos os campos novos são derivados de
  tabelas/colunas já existentes (`TripDeliveryStop`, `TripOccurrence`,
  `Trip.plannedArrival`).

## 6. Fase 115 — relação com a Gestão de Exceções Operacionais

A Torre de Controle continua sendo a única fonte de "quais viagens exigem
atenção agora" (`openOccurrencesCount`/`criticalOpenOccurrencesCount` por
viagem, seção 1). A Fase 115 (`docs/trip-occurrences.md` seção 12) adicionou
`/operations/occurrences`, uma tela **complementar**, não uma segunda Torre
de Controle: escopo de um único tipo de entidade (`TripOccurrence`), com
lista individual por item, filtros e tratamento (start/resolve/cancel) —
para quando o dispatcher precisa triar as exceções em si, não as viagens.
Nenhum dado novo, nenhuma consulta nova nesta página; os dois painéis leem
a mesma `TripOccurrence` de sempre.
