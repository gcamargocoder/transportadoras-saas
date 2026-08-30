# Gestão Avançada de Rotas, Viagens e Execução Operacional (Fase 66)

## Escopo

| Item | Status |
|---|---|
| Ciclo de vida da viagem (máquina de estados) | ✅ (reaproveitado, já muito maduro) |
| Pré-requisitos de início (`assertCanStart`) | ✅ (reaproveitado) |
| Composição da viagem (veículo/implementos/eixos) | ✅ (reaproveitado) |
| Imutabilidade histórica da composição após a viagem partir | ❌ → ✅ (novo, gap real) |
| Origem/destino (`Location`) | ✅ (reaproveitado) |
| Rota planejada (`RoutePlan`, provider externo) e operacional (`RouteVersion`) | ✅ (reaproveitado) |
| Paradas (`TripStop`) | ✅ (reaproveitado) |
| Eventos de rota (`RouteEvent`, manual + automático por desvio) | ✅ (reaproveitado) |
| Driver App (ciclo completo: início→operação→entrega→fim) | ✅ (reaproveitado, já completo) |
| Offline-first / idempotência (`syncQueue`/`deviceEventId`) | ✅ (reaproveitado, não alterado) |
| Fiscal, pedágio, combustível, checklist, entrega, financeiro na viagem | ✅ (reaproveitado, quase tudo já existia) |
| `TripMetrics.actual*` ("resultado operacional": distância/litros/pedágio/custo executado) | ❌ → ✅ (novo, gap real — era o maior buraco do sistema) |
| Abastecimentos/checklists visíveis na tela da viagem | ❌ → ✅ (novo, dados já existiam, sem visibilidade) |
| Dashboard operacional com funil completo de status | ❌ → ✅ (novo, gap real) |
| Filtros de veículo/cliente/origem/destino na listagem de viagens | ❌ → ✅ (novo — backend já suportava, UI não expunha) |
| `DriverShift`/`ShiftBreak` (jornada de trabalho) | ❌ (limitação real, ver seção 10) |

## Auditoria prévia (o que já existia vs. o que foi criado)

Esta é a fase mais ampla do projeto até agora — o núcleo de viagens
(`trips.service.ts`, 916 linhas) nasceu no commit inicial do sistema e foi
evoluído ao longo de praticamente todas as fases anteriores (25, 27, 28, 38,
40-43, 52-65). Antes de qualquer alteração, a auditoria confirmou que o
ciclo completo (planejamento → composição → rota → início → execução →
paradas → eventos → entrega → finalização) **já estava implementado e
testado extensivamente** (`trips.e2e-spec.ts`, `driver-trips.e2e-spec.ts`
com ~1250 linhas, `trip-stops.e2e-spec.ts`, `trip-operations-load.e2e-spec.ts`,
`trip-operations-monitor.e2e-spec.ts`, `routing.e2e-spec.ts`, entre outros).
A Fase 66 não recriou nada disso — apenas preencheu 5 gaps genuínos,
descritos abaixo, e corrigiu 2 comentários de código que ficaram
desatualizados por mudanças de fases anteriores.

## 1. Ciclo de vida da viagem — sem alteração

`Trip.status` (`TripStatus`): `PLANNED → WAITING_DRIVER → WAITING_DEPARTURE
→ IN_PROGRESS → PAUSED → COMPLETED`, com `CANCELLED` alcançável de qualquer
estado não-terminal. A máquina de estados (`ALLOWED_TRANSITIONS`,
`TripsService.updateStatus`) já valida toda transição no backend — o
frontend nunca decide se uma transição é válida, só reflete o erro 409
quando o backend rejeita.

## 2. Pré-requisitos de início (`assertCanStart`)

Já bloqueava, antes da Fase 111: motorista inativo, motorista já em outra
viagem ativa, veículo inexistente, veículo em `MAINTENANCE`, veículo não
`ACTIVE`, veículo já em outra viagem ativa.

**Fase 111 -- checklist pré-viagem obrigatório (opt-in por tenant, NOVO)**:
fecha o gap "bloqueio de início de viagem somente quando houver regra
operacional realmente necessária" (Fase 111). Novo método
`assertPreTripChecklistSatisfied`, chamado ao final de `assertCanStart`:
lido `TenantSettings.preferences.requirePreTripChecklist` (JSON livre já
existente, mesmo padrão de `stopDurationThresholdsMinutes` da Fase 44,
`resolveRequirePreTripChecklist`, `trips/utils/trip-preferences.util.ts`) --
**default `false`**, nenhum tenant existente é afetado a menos que ative
explicitamente via `PATCH /tenant-settings`. Quando ligado e a viagem tem
veículo vinculado (composição), bloqueia com `409` em 2 casos:

- não existe nenhum `ChecklistExecution` do tipo `PRE_TRIP` para aquela
  viagem, ou existe mas ainda não está `COMPLETED`;
- existe e está `COMPLETED`, mas tem não-conformidade crítica
  (`hasCriticalNonConformity`, mesma função pura já usada em
  `GET /checklists/executions` e no coletor de notificações, ver
  `docs/checklist-module.md`).

Sem veículo vinculado, nada é checado (nunca inventa um veículo). Mesmo
método usado tanto por `PATCH /trips/:id/status` (admin) quanto por
`POST driver/trips/:id/start` (Driver App, via
`DriverTripsService.start → TripsService.updateStatus`) -- um único ponto
de checagem, nunca duas regras.

## 3. Composição da viagem — imutabilidade histórica (NOVO)

**Gap real confirmado pela auditoria**: `TripCompositionsService.update()`
e `.upsertAxleConfiguration()` permitiam trocar o veículo/implementos ou a
configuração de eixos de uma composição **a qualquer momento**, mesmo já
vinculada a uma viagem `IN_PROGRESS`/`PAUSED`/`COMPLETED` — corrompendo
silenciosamente dados históricos usados em conciliação de pedágio,
relatórios e auditoria.

**Regra implementada**: uma composição fica protegida (`ConflictException`
409 em `update()`/`upsertAxleConfiguration()`) assim que a viagem vinculada
efetivamente partiu — usando `Trip.actualDeparture !== null` como sinal,
o **mesmo campo já gravado** por `TripsService.updateStatus` na primeira
transição para `IN_PROGRESS` (nunca sobrescrito depois, mesmo após
PAUSED/COMPLETED/CANCELLED-depois-de-iniciada). Nenhum campo novo, nenhuma
migration — reaproveita um dado que já existia.

Continuam livremente editáveis: composições ainda sem viagem vinculada
(`tripId` null), e composições de viagens que nunca partiram (canceladas
ainda em `PLANNED`/`WAITING_DRIVER`/`WAITING_DEPARTURE`).

## 4. Origem/destino/rota — sem alteração

`Location` já representa origem/destino/cliente/endereço/referência
suficientemente. `RoutePlan` (rota geográfica, calculada por provider
externo real — Google Routes API, com fallback `not-configured` explícito
quando a integração não está disponível) e `RouteVersion` (rota
operacional, versão imutável, criada uma vez no planejamento) já cobrem a
seção 6 do pedido integralmente. Distância/duração nunca são inventadas —
vêm sempre do provider ou ficam `null`/indisponível.

## 5. Paradas e eventos — sem alteração

`TripStop` já tem tipo, chegada/saída, duração **sempre calculada no
backend** (nunca aceita do cliente), evidências (via app), e bloqueio de
duas paradas abertas simultâneas no mesmo veículo. `RouteEvent` já cobre
desvio/acidente/obra/interdição/mudança de destino, com CRUD manual **e**
geração automática (`RoutingService.checkDeviation()`, a cada lote de
`TrackingPoint`, cria um evento `DEVIATION` + alerta + tentativa de
recálculo automático de rota) — corrigido nesta fase um comentário
desatualizado em `route-events.service.ts` que ainda dizia "nenhuma geração
automática de evento nesta fase" (verdade quando escrito, defasado desde
que `checkDeviation` foi implementado em fase posterior).

## 6. `TripMetrics.actual*` — "resultado operacional" (NOVO, gap central da fase)

**Gap real confirmado pela auditoria**: `TripMetrics` (modelo 1:1 com Trip,
já existente desde a criação da viagem) tem campos `planned*` (sempre
preenchidos) e `actual*` (distância/duração/litros/pedágio/custo
executados) — mas **só `actualDurationMin` era calculado**. Os outros
quatro (`actualDistanceKm`, `actualFuelLiters`, `actualTollAmount`,
`actualTotalCost`) nunca eram escritos por nenhum service, apesar do
próprio schema chamar isso de "o maior diferencial do sistema" (planejado
x executado).

**Implementado em `TripsService.updateActualTripMetrics`** (chamado
automaticamente ao concluir a viagem, `PATCH /trips/:id/status` com
`status: COMPLETED`, tanto pelo fluxo administrativo quanto pelo
`POST /driver/trips/:id/complete`, que delega para o mesmo método):

- `actualDistanceKm = finalOdometerKm − Trip.initialOdometerKm`, somente
  quando ambos existem e `finalOdometerKm >= initialOdometerKm` — nunca
  uma distância estimada. `initialOdometerKm` só é gravado pelo app do
  motorista na largada (`POST /driver/trips/:id/start`); uma viagem
  concluída só pelo fluxo administrativo, sem essa origem, fica com
  `actualDistanceKm = null` (documentado, não mascarado).
- `actualFuelLiters` = soma de `FuelSupply.liters` vinculados à viagem
  (`tripId`) — única agregação nova (quantidade física, não financeira).
- `actualTollAmount`/`actualTotalCost` = **reaproveitam integralmente**
  `TripSettlementsService.getFinancialDashboard()` (`tollCost`/`totalCost`)
  — os MESMOS números já mostrados em `GET /trips/:id/financial-dashboard`
  e usados no fechamento da viagem. Nunca um segundo motor financeiro com
  resultado divergente.

`TripMetricsService` (que já existia, só para os campos `planned*` via
`PATCH /trips/:id/metrics`) continua sem escrita manual dos campos
`actual*` — eles são sempre derivados automaticamente, nunca aceitos do
cliente.

## 7. Visibilidade de combustível/checklist na tela da viagem (NOVO)

**Gap real confirmado pela auditoria**: `FuelSupply.tripId` e
`ChecklistExecution.tripId` já existiam desde as Fases 25/38, mas a aba
"Operação" de `/trips/[id]` só mostrava posição/paradas/exceções de eixo —
nenhuma seção de abastecimentos nem checklists da viagem.

Adicionadas duas novas seções na aba **Operação** (`OperacaoTab`),
reaproveitando os endpoints administrativos já existentes com filtro
`?tripId=` (`GET /fuel-supplies?tripId=`, `GET /checklists/executions?tripId=`)
— **nenhum sub-recurso novo** criado em `TripsController` (a seção 27 do
pedido só pede criar o que faltar; um filtro já existente resolve o mesmo
caso de uso).

**Fase 111**: a tabela de checklists desta aba passou a ser clicável --
cada linha navega para `/checklists/:id` (novo, ver
`docs/checklist-module.md`), a primeira tela administrativa de
detalhe/drill-down do módulo (antes só listagem, sem visão de respostas/
evidências).

## 8. Fiscal, pedágio, financeiro — sem alteração

Já muito completos antes desta fase: `GET /fiscal/documents/trip/:id/status`
(matriz de conformidade por tipo de documento + status do comprovante de
entrega), aba "Documentos fiscais" no frontend com upload/importação/vínculo;
`GET /trips/:id/toll-reconciliation` + aba "Pedágios"/"Conciliação de
Pedágios"; `TripRevenue`/`TripExpense`/`TripAdvance`/`TripSettlement` +
`GET /trips/:id/financial-dashboard` + aba "Financeiro". A tela
`/trips/[id]` já tinha 12 abas (Visão geral, Linha do tempo, Rota
planejada, Operação, Pedágios, Conciliação de Pedágios, Despesas,
Receitas, Adiantamentos, Financeiro, Documentos fiscais, Comercial) —
nenhuma aba nova foi criada, e nenhuma das 12 foi removida ou duplicada.

## 9. Dashboard operacional — funil completo (NOVO)

**Gap real confirmado pela auditoria**: `GET /fleet-operations/operations`
(`FleetOperationalIndicatorsEntity`) já tinha `completedTrips`,
`inProgressTrips` (IN_PROGRESS+PAUSED combinados), `cancelledTrips`,
duração/custo médio, utilização — mas nunca separava planejadas/aguardando
motorista/aguardando saída/pausadas isoladamente, nem contava viagens sem
motorista/sem veículo/atrasadas.

Adicionados 7 campos aditivos, todos `count()` agregados adicionais (sem
N+1, independentes do volume de viagens):

- `plannedTrips`, `waitingDriverTrips`, `waitingDepartureTrips`,
  `pausedTrips` (status isolados).
- `tripsWithoutDriver`/`tripsWithoutVehicle`: viagens não finalizadas
  (`PLANNED`/`WAITING_DRIVER`/`WAITING_DEPARTURE`/`IN_PROGRESS`/`PAUSED`)
  sem `driverId`/sem `composition` vinculados.
- `delayedTrips`: viagens não finalizadas com `Trip.plannedArrival` no
  passado — única base temporal confiável disponível (nunca uma
  estimativa de ETA/previsão).

Frontend (`/operations/fleet`): nova linha de `StatCard`s exibindo os 7
indicadores, no mesmo card "Operação" já existente.

## 10. `DriverShift`/`ShiftBreak` — implementado na Fase 67

**Atualização (Fase 67):** os modelos `DriverShift`/`ShiftBreak`, órfãos
desde sua criação, foram ativados. Ver `docs/trip-occurrences.md` para o
desenho completo (jornada, pausas, timeline unificada e ocorrências). Este
documento (Fase 66) permanece como registro histórico do estado da Fase 66;
as seções 10, 16 (itens de timeline/`DriverShift`/comprovante de entrega)
e 12 abaixo estão **desatualizadas** nesse ponto específico — as 3
limitações que aqui apontavam ficaram resolvidas na Fase 67.

## 11. Frontend

- `/trips` (listagem): filtros de veículo, cliente, origem e destino
  adicionados (`EntitySelect`, mesmo padrão já usado para motorista) — o
  backend (`FindTripsQueryDto`) já suportava `vehicleId`/`customerId`/
  `originLocationId`/`destinationLocationId`, só a UI não os expunha.
- `/trips/[id]` → aba Operação: seções "Abastecimentos" e "Checklists"
  (ver seção 7).
- `/operations/fleet`: 7 novos `StatCard`s no card "Operação" (ver seção 9).

Nenhum componente visual novo foi instalado — tudo reaproveita
`DataTable`/`StatCard`/`EntitySelect`/`Badge`/`Card` já existentes.

## 12. Driver App — sem alteração

Confirmado que o motorista já consegue completar o ciclo inteiro pelo app
(visualizar viagens atribuídas, iniciar, pausar/retomar, registrar parada,
abastecer, registrar exceção de eixo, checklist, comprovante de entrega,
finalizar), todos usando o mesmo mecanismo genérico de fila offline-first
(`syncQueue.ts`) e idempotência (`deviceEventId`) — nada foi tocado, pois
nada estava faltando.

## 13. RBAC / multi-tenant / auditoria

Sem alteração — `TenantGuard`/`RolesGuard`/`RequireModuleGuard`/`DriverGuard`
preservados. Ação de auditoria reaproveitada para os novos cálculos:
`trip_metrics.updated` (mesma ação já usada por `PATCH /trips/:id/metrics`,
agora também disparada automaticamente ao concluir a viagem, com
`previousValue`/`newValue` do snapshot de `TripMetrics`), e
`trip_composition.updated`/`axle_configuration.updated` continuam
disparando normalmente quando a edição é permitida (nunca chegam a
acontecer quando bloqueadas pela trava de imutabilidade, que lança antes
de qualquer mutação).

## 14. Performance / N+1

- `TripCompositionsService.assertCompositionNotLocked`: 1 query leve
  adicional (`trip.findFirst` só com `select: {actualDeparture: true}`),
  só quando a composição já tem `tripId` — nunca escala com o histórico da
  viagem.
- `TripsService.updateActualTripMetrics`: 2 queries adicionais
  (`fuelSupply.aggregate` + `getFinancialDashboard`, que já é 5 agregações
  paralelas), executadas **uma única vez por viagem**, só na transição
  para `COMPLETED` — nunca num caminho de listagem/dashboard.
- `GET /fleet-operations/operations`: 7 `count()` adicionais, todos em
  paralelo (`Promise.all`), independentes do número de viagens — mesma
  garantia de bounded queries já comprovada pelos testes de N+1 existentes
  neste módulo.

## 15. Testes

- **E2E (novo)**: `apps/api/test/trip-operational-consolidation.e2e-spec.ts`
  — imutabilidade da composição (livre antes de partir, bloqueada depois,
  livre para viagem cancelada que nunca partiu), `TripMetrics.actual*`
  (cálculo completo reaproveitando `FuelSupply`/`getFinancialDashboard`,
  e o caso `null` quando `finalOdometerKm` não é informado), KPIs do
  dashboard operacional (funil completo + isolamento multi-tenant).
- **Regressão confirmada verde**: `trips.e2e-spec.ts`, `driver-trips.e2e-spec.ts`,
  `trip-stops.e2e-spec.ts`, `trip-operations-load.e2e-spec.ts`,
  `trip-operations-monitor.e2e-spec.ts`, `routing.e2e-spec.ts`,
  `trip-expenses.e2e-spec.ts`, `trip-finance.e2e-spec.ts`, `fleet.e2e-spec.ts`,
  além da regressão ampla das Fases 61-65 (drivers, vehicles, maintenance,
  tires, fuel, fiscal, freight, billing).

## 16. Limitações reais

- ~~`DriverShift`/`ShiftBreak` continuam sem nenhuma implementação~~ —
  **resolvido na Fase 67**, ver `docs/trip-occurrences.md`.
- `actualDistanceKm` só é calculável quando a viagem foi iniciada pelo app
  do motorista (única origem de `Trip.initialOdometerKm`) — viagens
  concluídas só pelo fluxo administrativo, sem essa origem, ficam com
  `actualDistanceKm = null`.
- ~~Não existe uma timeline operacional unificada~~ — **resolvido na Fase
  67**: `GET /trips/:id/timeline` evoluiu para uma agregação real
  (`TripTimelineService`), ver `docs/trip-occurrences.md`.
- Comprovante de entrega **já tinha** uma seção visual dedicada na aba
  "Documentos fiscais" antes da Fase 67 (status, lista, detalhe) — a
  afirmação acima estava desatualizada quando escrita; a única lacuna
  real confirmada pela auditoria da Fase 67 é a ausência de
  preview/download do arquivo em si (permanece pendente, ver
  `docs/trip-occurrences.md`).

## 17. Pendências reais

Nenhuma pendência de escopo desta fase.

## 18. Fase 112 — Planejamento de Viagens

Consolida o planejamento operacional (antes do início da viagem),
reaproveitando integralmente `Trip`, `RouteVersion`/`RoutePlan`,
`TripDeliveryStop` e os motores já existentes — nenhuma estrutura nova.

**Auditoria prévia — o que já cobria o escopo pedido, sem alteração:**

- Seleção/validação de veículo, carreta, motorista e composição: já
  resolvido pela Fase 14/87/90 (`assertCanStart`, `assertDriverAvailable`,
  imutabilidade da composição da Fase 66 seção 3).
- Definição/organização de entregas e paradas antes da partida: já
  resolvido pela Fase 88/99 (`TripDeliveryStop`, bloqueia só
  `COMPLETED`/`CANCELLED`, PLANNED sempre editável).
- Previsão de rota/distância/duração/pedágio: já resolvido pela Fase
  23/26 (`RoutingService`, sub-recurso `trips/:tripId/route-plan`), já
  funcional em qualquer status da viagem, sem gate para `IN_PROGRESS`.
- Conflito de jornada: `DriverShift` é um relógio de ponto em tempo real,
  sem dados de escala/horas legais a validar contra — a única validação
  possível sem inventar uma regra de negócio é a sobreposição
  motorista×viagem já feita por `assertDriverAvailable`. Nenhum gap real
  aqui.

**Gaps reais implementados:**

1. **`POST /trips/:id/metrics/sync-from-route` (NOVO)** —
   `TripMetricsService.syncPlannedFromRoute`. Antes da Fase 112,
   `TripMetrics.planned*` (distância/duração/combustível/pedágio/custo)
   só existia via preenchimento manual (`PATCH /trips/:id/metrics`),
   nunca derivado da rota já calculada — o gap central da fase. O novo
   endpoint deriva:
   - distância/duração/pedágio: direto do `RoutePlan` selecionado
     (`distanceMeters`, `durationSeconds`, `totalTollAmount`);
   - combustível previsto: `distanciaKm / consumoMédioKm/L`, usando
     `computeAverageConsumptionKmL` (Fase 18, mesma função já usada no
     histórico de consumo do veículo) sobre o histórico real de
     `FuelSupply` do veículo — nunca um consumo médio de mercado
     inventado; fica `null` sem histórico suficiente;
   - custo previsto: pedágio + (combustível × preço médio/litro pago
     historicamente pelo veículo).

   Bloqueado com `409` (a) sem `RoutePlan` calculado, e (b) a partir do
   momento em que a viagem sai de `PLANNED`/`WAITING_DRIVER`/
   `WAITING_DEPARTURE` — o planejado é uma baseline congelada, nunca
   reescrita silenciosamente após a partida (mesmo princípio já central
   ao par `planned`/`actual` da Fase 66 seção 6). Auditado como
   `trip_metrics.synced_from_route`.

2. **`GET /trips/:id/summary` — resumo de prontidão (NOVO)**. Estendida
   (não duplicada) a entidade já existente com campos só-leitura que
   consolidam a liberação da viagem para aprovação:
   - `readyToStart`/`notReadyReason`: chama o próprio
     `assertCanStart` (try/catch) e reflete o resultado — nunca
     reimplementa a regra, garante zero divergência com o que acontece
     de fato ao iniciar a viagem;
   - `hasComposition`, `routePlanComputed`, `plannedMetricsSynced`:
     flags de progresso do planejamento;
   - `preTripChecklistRequired`/`preTripChecklistStatus`/
     `preTripChecklistHasCriticalNonConformity`: mesmos dados/regra da
     Fase 111 (`resolveRequirePreTripChecklist`,
     `hasCriticalNonConformity`), agora também visíveis no resumo;
   - `plannedWeightKg`/`vehicleCapacityKg`/`withinCapacity`: validação
     de capacidade **informativa** (nunca bloqueia o início). Peso
     previsto lido de `TripFreight.calculationInput.weightKg` (Fase 59,
     já gravado quando o frete é precificado — nenhum campo novo) contra
     `Vehicle.cargoCapacityKg`. Como `Trailer` não tem campo de
     capacidade no schema, uma validação bloqueante marcaria
     incorretamente carga transportada na carreta como "acima da
     capacidade" do cavalo — por isso o resultado é só um indicador
     (`withinCapacity = null` quando falta um dos dois dados reais).

3. **Frontend (`apps/admin-web`)** — sem tela nova, dados plugados nas
   abas já existentes da viagem:
   - aba "Rota": botão "Sincronizar métricas previstas" ao lado de
     "Recalcular rota" (visível só com rota calculada e planejamento
     ainda aberto, mesma regra `planningAllowed` já usada pela aba de
     entregas);
   - aba "Visão geral": novo card "Prontidão do planejamento" (badges de
     prontidão/composição/rota/métricas/checklist/capacidade), visível
     só antes da partida real (`!trip.actualDeparture`). O checklist
     pré-viagem continua tendo sua tabela completa só na aba "Operação"
     (Fase 66 seção 7) — o card novo mostra apenas o status mais
     recente, sem duplicar a listagem.

**Torre de Controle / Driver App**: auditado, sem alteração. A Torre de
Controle já expõe `operationalStatus`/`TripStatus` por trip — nenhum
sub-recurso novo foi necessário para refletir prontidão de planejamento
ali. O Driver App não referencia `GET /trips/:id/summary` nem
`TripMetrics` (confirmado por busca no código-fonte) — é uma tela
administrativa/despacho, o fluxo de execução do app não foi tocado.

**RBAC/multi-tenant/N+1**: `syncPlannedFromRoute` usa os mesmos guards
(`TRIP_WRITE_ROLES`) e `tenantId` de todo o módulo de viagens. O resumo
(`getSummary`) é uma leitura de um único registro — as consultas
adicionais (settings, checklist, frete, mais as internas de
`assertCanStart`) são um número fixo pequeno por chamada, não crescem
com o tamanho de nenhuma lista — não é um caso de N+1.

**Testes**: `test/routing.e2e-spec.ts` ganhou 10 novos testes cobrindo
sync-from-route (bloqueio sem rota, com/sem histórico de combustível,
resincronização após recálculo, bloqueio após partida) e o resumo de
prontidão (`readyToStart` refletindo `assertCanStart`, flags de
progresso, capacidade dentro/fora/sem dado). Regressão completa
executada: `trips.e2e-spec.ts`, `routing.e2e-spec.ts`,
`checklists.e2e-spec.ts`, `drivers*.e2e-spec.ts`, `fleet*.e2e-spec.ts`,
`maintenance*.e2e-spec.ts`, `tire*.e2e-spec.ts`, `trip-*.e2e-spec.ts` —
sem regressões.

## 19. Fase 116 — Fechamento Operacional da Viagem

Auditoria de fechamento: percorrido o fluxo completo planejamento →
execução → entrega → encerramento (`Trip`/status, composição, `RoutePlan`/
`RouteVersion`, `TripDeliveryStop`, ETA, POD/documentos fiscais,
`TripOccurrence`, checklist, abastecimento, manutenção/OS, pneus, despesas/
receitas/adiantamentos, `TripMetrics`, Torre de Controle, Driver App,
auditoria) — nada foi alterado além dos gaps reais listados abaixo (regra
explícita da fase: item já correto permanece intocado).

### 19.1 Auditado e já correto — sem alteração

- **Composição** (veículo/carreta/motorista): já imutável após a partida
  desde a Fase 66 (seção 3) — cobre também viagens já `COMPLETED`.
- **`TripDeliveryStop`**: transição de status já bloqueada (409) quando a
  viagem está `COMPLETED`/`CANCELLED` (`TripDeliveryStopsService.
  updateStatus`) — nenhuma mudança necessária.
- **ETA**: `TripEtaService.compute` já devolve a mensagem "viagem já
  concluída/cancelada" e nenhuma previsão para `COMPLETED`/`CANCELLED`
  desde a Fase 91.
- **`TripExpense`/`TripRevenue`/`TripAdvance`**: já bloqueiam só viagens
  `CANCELLED` (nunca ocorreram) e continuam aceitando lançamentos numa
  viagem `COMPLETED` (comprovante/pedágio chegam depois na vida real) —
  comportamento correto, não uma lacuna.
- **`TripSettlement`** (fechamento financeiro, Fase 71): nunca leu
  `Trip.status`, por desenho — é um workflow financeiro independente e
  auto-contido. Nenhuma integração nova criada aqui (regra 6 do pedido:
  só com gap comprovado, e nenhum foi encontrado).
- **Checklist pós-viagem** (`ChecklistType.POST_TRIP`, já existe no
  enum): **nenhuma** `TenantSettings.preferences` equivalente a
  `requirePreTripChecklist` (Fase 111) existe para exigi-lo no
  encerramento — diferente do checklist pré-viagem, não há nenhum
  modelo/config já existente para reaproveitar. Criar essa exigência
  agora seria inventar uma regra operacional nova (regra 7 do pedido) —
  não implementado.
- **Pendências documentais no encerramento**: buscado no código inteiro
  qualquer conceito de "documento obrigatório" (fiscal ou POD) — não
  existe nenhum (nem campo, nem enum, nem preferência de tenant). Não há
  o que consolidar sem inventar uma regra fiscal/documental (regra 7).
- **Torre de Controle**: exclusão de viagens terminadas de
  `GET /trips/operations/active` é intencional (painel de operação
  ATIVA) — o histórico completo já existe em `GET /trips` (listagem).
- **Driver App**: `FinishTripScreen` já é deliberadamente minimalista
  desde a Fase 28 ("não pede nada que o sistema já saiba", "nunca
  bloqueia o encerramento") — o motorista já reporta entregas/ocorrências
  nas próprias telas antes de finalizar; nenhuma lacuna real que exija
  ação adicional dele foi encontrada, então o app não foi alterado.
  Confirmado também que o Driver App nunca leu `GET /trips/:id/summary`
  nem os campos alterados nesta fase — admin-web e Driver App continuam
  lendo os mesmos `Trip`/`TripDeliveryStop`/`TripOccurrence`, sem
  divergência de estado.
- **Manutenção/OS e pneus**: sem vínculo direto com o encerramento da
  viagem (são por veículo, não por viagem) além do já existente
  (checklist crítico → OS, Fase 111) — nada a consolidar aqui.
- **Auditoria**: `AuditService.log` já cobre toda mutação relevante do
  ciclo de vida (`trip.arrived`, transições de status, criação/resolução
  de ocorrências etc.) — nenhum gap.

### 19.2 Gaps reais encontrados e corrigidos

1. **`GET /trips/:id/summary` não consolidava o estado das entregas/
   ocorrências no encerramento.** A mesma tela que já mostra "prontidão
   para iniciar" (Fase 112) não tinha o equivalente para "o que falta
   resolver antes/depois de encerrar" — só disponível navegando para as
   abas Entregas/Ocorrências. Adicionados `deliverySummary`
   (`TripOperationDeliverySummaryEntity`, MESMA entidade/fórmula já usada
   na Torre de Controle, Fase 105) e `openOccurrencesCount`/
   `criticalOpenOccurrencesCount` — 3 queries em lote a mais (1
   `groupBy`, 2 `count`), sempre um número fixo por viagem, nunca N+1.
   **Puramente informativo — não bloqueia a conclusão da viagem.**
   Frontend: novo card "Consolidação do encerramento" em
   `overview-tab.tsx`, visível a partir da partida real (espelha a
   condição inversa do card de planejamento).
2. **Bug real: `readyToStart` chamava `assertCanStart` mesmo para
   viagens que já partiram.** Uma viagem `COMPLETED`/`IN_PROGRESS`/
   `PAUSED` podia mostrar `notReadyReason` enganoso (ex.: "motorista já
   está em outra viagem ativa", só porque ele foi despachado de novo
   depois). Corrigido: `assertCanStart` só é chamado quando
   `assertTripPlanningAllowed` (mesmo critério já usado em toda a
   trava de planejamento) confirma que a viagem ainda não partiu; depois
   disso, `readyToStart` fica sempre `true`/`notReadyReason` sempre
   `null` (nada mais a validar). Efeito colateral positivo: menos 2
   queries desperdiçadas por consulta de resumo de uma viagem já
   iniciada/concluída.
3. **`PATCH /trips/:id/metrics` (métricas previstas, entrada manual)
   nunca teve a trava de "planejamento encerrado".** Desde a Fase 112,
   `POST .../metrics/sync-from-route` já bloqueia reescrever
   `TripMetrics.planned*` depois da partida (é um snapshot congelado,
   ver seção 6/`docs/trip-financial-result.md`) — mas o endpoint manual,
   que existe desde a criação do módulo, nunca teve essa trava. Um admin
   podia reescrever a baseline prevista de uma viagem já `COMPLETED`,
   contradizendo o próprio conceito de "previsto x executado" depois do
   fechamento. Corrigido reaproveitando a MESMA trava/mensagem de
   `syncPlannedFromRoute` — nenhuma regra nova, só a consistência entre
   as duas formas de escrever o mesmo dado.
4. **`RoutingService` nunca impedia recalcular/trocar a rota de uma
   viagem já `COMPLETED`/`CANCELLED`.** As 4 escritas
   (`computePrimary`/`computeAlternatives`/`select`/`recalculate`, esta
   última também usada pelo recálculo automático por desvio) não tinham
   nenhuma verificação de status — um dispatcher podia clicar
   "Recalcular rota" (botão sempre visível em `rota-tab.tsx`, sem
   nenhuma trava) numa viagem já encerrada e reescrever silenciosamente
   `Trip.routePlanId`/o histórico de rota usado durante a execução real.
   Corrigido com `RoutingService.assertRouteWritable` (novo guard
   privado, chamado nas 4 escritas) — leitura (`getCurrent`/`getTolls`/
   `getDriverView`) continua sempre permitida, preservando o histórico
   visível. Frontend: `rota-tab.tsx` recebeu a prop `tripFinished` (MESMO
   `TERMINAL_STATUSES` já calculado em `page.tsx`) e oculta os botões de
   calcular/recalcular/alternativas/selecionar quando a viagem já
   terminou.

### 19.3 Regras seguidas

Nenhuma entidade nova (todas as 4 correções reaproveitam models/telas já
existentes); nenhuma emissão de documento fiscal; nenhum Portal do
Cliente; nenhuma segunda Torre de Controle; nenhum motor de cálculo novo
(`deliverySummary` reaproveita a fórmula já usada na Fase 105); nenhuma
integração financeira/ledger nova (`TripSettlement` permanece
intocado); nenhuma regra de SLA/fiscal/trabalhista/operacional inventada
(checklist pós-viagem e pendência documental foram explicitamente
descartados por falta de modelo/config já existente); RBAC, multi-tenant,
auditoria e N+1 preservados; nenhuma migration (nenhum campo novo
persistido); comportamento já correto preservado sem alteração
cosmética.

### 19.4 Testes (Fase 116)

`test/trips.e2e-spec.ts` (+5 cenários): `deliverySummary`/
`openOccurrencesCount` corretos com a viagem ativa E depois de
`COMPLETED`; contagens zeradas quando não há entregas/ocorrências;
`readyToStart=true`/`notReadyReason=null` numa viagem já concluída
mesmo com o motorista ocupado depois em outra viagem (reproduz e prova a
correção do bug); `PATCH /trips/:id/metrics` permitido em `PLANNED` e
bloqueado (409) após `IN_PROGRESS`/`COMPLETED`. `test/routing.e2e-spec.ts`
(+2 cenários): as 4 escritas de rota bloqueadas (409) numa viagem
`COMPLETED` e numa `CANCELLED`, leitura confirmada ainda permitida.
Regressão completa sem alteração de asserções pré-existentes: `trips`,
`routing` + `trip-routing`, `trip-delivery-stops`, `trip-eta`,
`trip-operations-monitor`, `driver-trips`, `trip-occurrences-shifts-
timeline`, `checklists`, `notifications`.

### 19.5 Limitações reais (Fase 116)

- Checklist pós-viagem e "documento obrigatório no encerramento"
  continuam sem nenhuma exigência automática — exigiriam inventar uma
  regra/configuração que não existe hoje (fora do escopo desta fase por
  regra explícita).
- `TripMetrics.actualDistanceKm` continua `null` quando `COMPLETED` sem
  `finalOdometerKm` informado (limitação já documentada na seção 16,
  reconfirmada nesta auditoria — não é uma regressão nem uma lacuna
  nova).
