# Ocorrências de Entrega (Fase 101)

## 1. Contexto e auditoria prévia

Antes de codificar, foi auditado tudo que já existia sobre ocorrências, entregas e mecanismos correlatos:
`TripOccurrence` (Fase 67 — já com tipo/severidade/motivo/anexo/quem-abriu-quando/quem-resolveu-quando,
criação administrativa e pelo Driver App, resolução/cancelamento, timeline agregada, auditoria e um
coletor de notificação `CRITICAL_OCCURRENCE`), `TripDeliveryStop` (Fase 88/99 — parada/entrega planejada),
`FiscalDocument`/`Attachment` (Fase 100 — POD), `NotificationsService.collectCriticalOccurrences`,
`AuditService`, `FleetOccurrencesMetricsService` (dashboard cross-fleet **geral**, em
`/operations/fleet/occurrences` — todas as ocorrências, não só as de entrega) e o Driver App
(`OccurrenceScreen`, `createOccurrence`/`getOccurrences`). **Não havia nenhuma lacuna de estrutura de
ocorrência** — o sistema já tinha um fluxo de registro/resolução/cancelamento funcional, testado e usado
tanto pelo Driver App quanto pelo painel administrativo.

As lacunas reais identificadas, e os únicos pontos que esta fase evolui, foram:

1. **A ocorrência não tinha vínculo com a parada/entrega específica (`TripDeliveryStop`)** — só com a
   viagem inteira (`tripId`), mesma lacuna já resolvida para o POD na Fase 100.
2. **Faltava um estado intermediário "sendo tratada"** — só existiam `OPEN`/`RESOLVED`/`CANCELLED`.
3. **O catálogo de tipos não cobria categorias específicas de entrega** (destinatário ausente, endereço
   incorreto, recusa, avaria de carga).
4. **A escala de severidade pedida (`LOW`/`MEDIUM`/`HIGH`/`CRITICAL`) não existia** — só
   `INFO`/`WARNING`/`CRITICAL`.
5. **Não havia uma listagem cross-trip dedicada** a ocorrências vinculadas a entregas, com indicadores.

### Reaproveitado sem duplicação

- **`TripOccurrence`** — nenhum model novo. A ocorrência de entrega continua sendo exatamente a mesma
  `TripOccurrence` de sempre, só com um vínculo opcional a mais (`tripDeliveryStopId`).
- **`POST /trips/:id/occurrences`** (administrativo) e **`POST /driver/trips/:id/occurrences`** (Driver
  App) — os dois pontos de escrita já existentes, ambos apenas evoluídos com um campo novo
  (`tripDeliveryStopId`), nenhum endpoint novo.
- **`Attachment` (`TripOccurrence.attachmentId`)** — evidência da ocorrência já era um vínculo direto ao
  mecanismo genérico de anexo desde a Fase 67; "permitir anexar evidências utilizando exclusivamente
  Document/Attachment já existente" já estava plenamente satisfeito, sem necessidade de nenhuma mudança.
- **`NotificationsService.collectCriticalOccurrences`** — o mesmo coletor que já gera `CRITICAL_OCCURRENCE`
  para qualquer `TripOccurrence` crítica em aberto (`severity=CRITICAL`, `resolvedAt`/`cancelledAt` nulos)
  cobre automaticamente as novas ocorrências de entrega, sem nenhuma lógica de coleta nova — só passou a
  incluir `tripDeliveryStopId` no `metadata` da notificação, quando houver.
- **`AuditService`** — as mesmas ações já auditadas (`trip.occurrence_created`, `trip.occurrence_resolved`,
  `trip.occurrence_cancelled`) passam a incluir `tripDeliveryStopId` no payload; uma ação nova
  (`trip.occurrence_in_progress`) foi adicionada exclusivamente para a nova transição `IN_PROGRESS`.
- **RBAC** (`TRIP_READ_ROLES`/`TRIP_WRITE_ROLES`, os mesmos de `TripStopsController`/`DeliveryStopsController`
  das Fases 99/100) e o `DriverGuard` do Driver App — reaproveitados sem alteração.
- **`GET /trips/:id/occurrences`** (listagem por viagem) e a aba "Ocorrências" da viagem — inalterados no
  comportamento, só passam a exibir/aceitar o novo vínculo.

### Estrutura genuinamente nova

- **`TripOccurrence.tripDeliveryStopId`** (opcional, `SetNull` ao remover a parada) + índice
  `(tenantId, tripDeliveryStopId)` — mesmo padrão de `FiscalDocument.tripDeliveryStopId` (Fase 100).
- **`TripOccurrence.inProgressAt`** (opcional) — o novo sinal persistido que sustenta o status
  `IN_PROGRESS` (ver seção 2).
- **4 novos valores em `TripOccurrenceType`**: `RECIPIENT_ABSENT`, `WRONG_ADDRESS`, `DELIVERY_REFUSED`,
  `CARGO_DAMAGE`.
- **3 novos valores em `TripOccurrenceSeverity`**: `LOW`, `MEDIUM`, `HIGH`.
- **1 novo valor em `TripOccurrenceStatus`** (derivado, nunca uma coluna): `IN_PROGRESS`.
- **`GET /delivery-occurrences`, `GET /delivery-occurrences/dashboard`, `GET /delivery-occurrences/:id`,
  `PATCH /delivery-occurrences/:id/{start,resolve,cancel}`** — a nova visão cross-trip, mesmo padrão do
  `DeliveryStopsController`/`FiscalDocumentsController` (Fases 99/100): reaproveita o mesmo
  `TripOccurrencesService`, nunca um segundo serviço/lógica de negócio.
- **`PATCH /trips/:id/occurrences/:occurrenceId/start`** — mesma transição `IN_PROGRESS`, disponível
  também no escopo da viagem (não só cross-trip).

## 2. Catálogo de tipos, escala de severidade e status `IN_PROGRESS`

**Tipos**: das 8 categorias pedidas, 4 já tinham equivalente direto no catálogo existente desde a Fase 67
(atraso → `DELAY`, documentação → `DOCUMENT_PROBLEM`, outros → `OTHER`, veículo/rota →
`VEHICLE_PROBLEM`/`ROUTE_DEVIATION`) e 4 eram genuinamente novas (destinatário ausente, endereço incorreto,
recusa, avaria — `CARGO_DAMAGE`, distinta de `BREAKDOWN`, que é pane mecânica do veículo). Os 10 valores
antigos permanecem válidos e usados por ocorrências não vinculadas a entrega (acidente, pane etc.).

**Severidade**: em vez de substituir a escala de 3 níveis já usada desde a Fase 67 em notificações/alertas
de frota/`VehicleOverview` por uma nova de 4 níveis, os 3 valores novos (`LOW`/`MEDIUM`/`HIGH`) foram
**adicionados** ao mesmo enum — as duas escalas convivem no mesmo campo, sem redefinição. Ocorrências que
não são de entrega continuam livres para usar `INFO`/`WARNING`/`CRITICAL`; o critério de "alerta crítico"
(`isCriticalOpenOccurrence`) e todo consumidor existente (`NotificationsService`,
`FleetOperationsMetricsService`, `FleetOccurrencesMetricsService`, `VehicleOverviewService`) foram auditados
e nenhum faz `switch` exaustivo sobre severidade — todos tratam `CRITICAL` diretamente ou usam
`groupBy(['severity'])`, que acomoda os novos valores automaticamente, sem qualquer alteração de código.

**Status `IN_PROGRESS`**: como `TripOccurrenceStatus` sempre foi **derivado** (nunca uma coluna
persistida) de `resolvedAt`/`cancelledAt`, introduzir um terceiro estado real exigiu um novo sinal
persistido: `inProgressAt`, seguindo a mesma convenção ("timestamp de evento, nunca uma coluna de status
redundante"). Prioridade de derivação: `cancelledAt` > `resolvedAt` > `inProgressAt` > `OPEN`.

`isCriticalOpenOccurrence` foi deliberadamente mantida **sem** depender de `inProgressAt` — verifica
`resolvedAt`/`cancelledAt` nulos diretamente, o mesmo critério já usado pelas consultas reais (`WHERE`
clauses) em `NotificationsService`/`FleetOperationsMetricsService`/`VehicleOverviewService`. Isso garante
que uma ocorrência crítica marcada como "em andamento" **continua** contando como alerta em aberto — só
sai do alerta quando de fato resolvida ou cancelada.

## 3. Vínculo com `TripDeliveryStop` e `Trip`

`tripDeliveryStopId` é opcional — ocorrências sem parada específica (fluxo já existente desde a Fase 67,
vinculadas só à viagem via `tripId`) continuam funcionando exatamente como antes (regressão coberta por
teste). Quando informado, a parada precisa existir neste tenant e pertencer à mesma viagem da ocorrência —
`404` se a parada não existir no tenant, `400` se existir mas pertencer a **outra** viagem (distinção
deliberada entre "nunca existiu" e "referência inválida do chamador").

Ao contrário do POD (Fase 100, que exige a parada `COMPLETED`), **nenhuma exigência de status da parada**
foi aplicada aqui: uma ocorrência documenta um *problema*, que pode legitimamente acontecer antes, durante
ou depois da tentativa de entrega — e pode inclusive ser o motivo pelo qual uma parada mais tarde se torna
`FAILED`. Gatear a criação por status da parada seria ativamente incorreto para este domínio.

A validação está centralizada em `TripOccurrencesService.assertTripDeliveryStopBelongsToTrip`, chamada
pelos dois pontos de escrita (`create` administrativo e `createFromDriverApp`) — nunca duplicada.

## 4. Transições de status

`OPEN → IN_PROGRESS → RESOLVED` ou `OPEN → RESOLVED` diretamente (marcar "em andamento" não é obrigatório
antes de resolver); `CANCELLED` é possível a partir de `OPEN` ou `IN_PROGRESS`. Todas as transições são
**idempotentes** por estado (chamar `start` numa ocorrência já `IN_PROGRESS` não gera erro nem duplica o
timestamp) e **bloqueadas** (`409`) a partir de `RESOLVED`/`CANCELLED` — um registro finalizado não pode
voltar a ser tratado. A mesma lógica (`applyMarkInProgress`/`applyResolve`/`applyCancel`) é compartilhada
entre as rotas de escopo de viagem (`/trips/:id/occurrences/:occId/...`) e as rotas cross-trip
(`/delivery-occurrences/:id/...`) — nunca duas implementações.

**Ocorrência e status de entrega permanecem conceitos separados**: nenhuma mutação de `TripOccurrence`
(criação, `start`, `resolve`, `cancel`) altera `TripDeliveryStop.status` — essa transição continua
exclusiva dos endpoints de status da própria parada (Fase 88/99), acionada manualmente pelo operador (ou,
no caso de `FAILED`, com motivo obrigatório).

## 5. Notificações

Nenhum coletor novo: `NotificationsService.collectCriticalOccurrences` (Fase 68/69) já processa **qualquer**
`TripOccurrence` com `severity=CRITICAL` e ainda aberta (`resolvedAt`/`cancelledAt` nulos) — o mesmo
critério de `isCriticalOpenOccurrence`. Uma ocorrência de entrega crítica é automaticamente elegível, sem
nenhuma lógica adicional; o único ajuste foi incluir `tripDeliveryStopId` no `metadata` da notificação
gerada, quando a ocorrência tiver esse vínculo.

## 6. Auditoria, multi-tenant e RBAC

Reaproveitados integralmente: `AuditService` (ações já existentes `trip.occurrence_created`/
`_resolved`/`_cancelled`, mais a nova `trip.occurrence_in_progress`, todas com `tripDeliveryStopId` no
payload quando presente), isolamento por `tenantId` em todas as consultas/mutações (inclusive nas novas
rotas cross-trip), e `TRIP_READ_ROLES`/`TRIP_WRITE_ROLES` (os mesmos papéis já usados por
`TripStopsController`/`DeliveryStopsController`) — nenhum papel novo foi criado.

## 7. Preparação para o Driver App

`POST /driver/trips/:id/occurrences` (já existente) ganhou o campo opcional `tripDeliveryStopId` no corpo
JSON — mesma rota, mesma idempotência por `deviceEventId`, mesma validação (a parada precisa pertencer à
viagem do motorista autenticado). Uma ocorrência aberta pelo app aparece automaticamente na listagem
cross-trip administrativa (`/delivery-occurrences`) e pode ser marcada em andamento/resolvida/cancelada
pelo painel — "permitir que uma ocorrência originada no aplicativo seja tratada no administrativo" já
funciona hoje, sem nenhum mecanismo adicional. Os tipos/cliente HTTP e a tela do app
(`driverTrips.types.ts`, `OccurrenceScreen.tsx`) foram atualizados com o catálogo/escala/status novos e o
campo `tripDeliveryStopId` — nenhuma tela nova foi construída (seleção de parada específica na UI do app,
se desejada, fica para fase futura).

## 8. APIs alteradas/criadas (`apps/api/src/trip-operations`)

| Método | Rota | O que mudou |
|---|---|---|
| `POST` | `/trips/:id/occurrences` | Aceita `tripDeliveryStopId` opcional |
| `PATCH` | `/trips/:id/occurrences/:occurrenceId/start` | **Nova** — transição para `IN_PROGRESS` |
| `POST` | `/driver/trips/:id/occurrences` | Aceita `tripDeliveryStopId` opcional |
| `GET` | `/delivery-occurrences` | **Nova** — listagem cross-trip, sempre filtrada a `tripDeliveryStopId != null` |
| `GET` | `/delivery-occurrences/dashboard` | **Nova** — indicadores (contagem por status/severidade/tipo, críticas em aberto) |
| `GET` | `/delivery-occurrences/:id` | **Nova** — detalhe cross-trip |
| `PATCH` | `/delivery-occurrences/:id/start` | **Nova** — mesma transição, sem precisar navegar até a viagem |
| `PATCH` | `/delivery-occurrences/:id/resolve` | **Nova** — idem |
| `PATCH` | `/delivery-occurrences/:id/cancel` | **Nova** — idem |

Todas as rotas novas reaproveitam o mesmo `TripOccurrencesService` das rotas de escopo de viagem — nenhum
serviço/lógica duplicada.

**Fase 115** -- as rotas `/delivery-occurrences` acima permanecem **inalteradas** (mesmo contrato, mesmo
comportamento, sempre restritas a `tripDeliveryStopId != null`). Uma nova família de rotas irmã,
`GET/PATCH /trip-occurrences...`, reaproveita o MESMO service/entidade/mapper para cobrir também as
ocorrências GERAIS da viagem (sem parada vinculada) -- ver `docs/trip-occurrences.md` seção 12.

## 9. Frontend (`apps/admin-web`)

- **`CreateOccurrenceModal`**: catálogo de tipo/severidade estendido; aceita `tripDeliveryStopId` opcional
  (pré-vinculado quando aberto a partir de uma parada específica).
- **`OccurrencesTab`** (aba "Ocorrências" da viagem): nova ação "Marcar em andamento"; ações de
  resolver/cancelar agora também disponíveis em `IN_PROGRESS`; badge "Parada #N" quando vinculada.
- **`DeliveryStopsTab`** (aba "Entregas" da viagem, Fase 99): nova coluna "Ocorrências" — contagem por
  parada (buscada uma única vez para a aba inteira via `GET /delivery-occurrences?tripId=X` e agrupada em
  memória, nunca uma consulta por linha), disponível para **qualquer** status de parada (ao contrário de
  Comprovantes, que só se aplica a `COMPLETED`), com um modal (`DeliveryStopOccurrencesModal`) para
  consultar/tratar as ocorrências daquela parada especificamente.
- **`/operations/delivery-occurrences`** (nova página): visão cross-trip com busca, filtros
  (tipo/severidade/status), paginação, indicadores (total/aberta/em andamento/resolvida/cancelada/crítica
  em aberto) e ações inline (marcar em andamento/resolver/cancelar), mesmo padrão de
  `/operations/deliveries` (Fase 99). Distinta do dashboard geral de ocorrências de frota já existente em
  `/operations/fleet/occurrences` (todas as ocorrências, não só as vinculadas a uma entrega) — nenhuma
  duplicação, páginas com propósitos diferentes.
- **Navegação**: novo item "Ocorrências de Entrega" no menu, mesmo módulo/papéis de "Entregas"/"Viagens".

## 10. Performance / N+1

- Todas as consultas de `TripOccurrence` continuam usando um único `include` centralizado
  (`DELIVERY_OCCURRENCE_INCLUDE`), com o contexto de viagem/parada/motorista/veículo/criador/resolvedor
  trazido no mesmo `JOIN` — nunca uma consulta adicional por ocorrência.
- A nova coluna "Ocorrências" na aba de entregas busca as ocorrências da viagem **uma única vez** para a
  aba inteira (`GET /delivery-occurrences?tripId=X`) e agrupa por parada em memória no frontend.
- O dashboard (`GET /delivery-occurrences/dashboard`) calcula as 4 contagens de status + crítica em aberto
  + `groupBy` de severidade/tipo em `Promise.all`, nunca sequencialmente.
- Testado: contagem de queries de `GET /delivery-occurrences` fixa entre 5 e 20 ocorrências vinculadas a
  paradas crescentes.

## 11. Limitações reais

- **Sem seleção de parada específica na tela do Driver App** — só a API foi preparada (campo aceito e
  validado), como pedido explicitamente; a UI do app continua registrando a ocorrência no nível da viagem
  por padrão.
- **Nenhuma exigência de status da parada para vincular uma ocorrência** — decisão deliberada (ver seção
  3), distinta da regra do POD (Fase 100).
- **A escala `LOW`/`MEDIUM`/`HIGH`/`CRITICAL` não é imposta por tipo de ocorrência** — a validação
  (`@IsEnum`) aceita qualquer um dos 6 valores de severidade para qualquer tipo, sem uma matriz de
  "severidade permitida por categoria" (não pedida, não inventada).

## 12. Testes

`apps/api/test/trip-occurrences-shifts-timeline.e2e-spec.ts`, bloco "Fase 101 — Ocorrências de Entrega"
(13 testes novos, requests reais contra o Postgres): criação vinculada a `tripDeliveryStopId`; as 4 novas
categorias e as 3 novas severidades; bloqueio (400) de parada de outra viagem e rejeição (404) de parada
inexistente; criação pelo Driver App vinculada a parada; transição `OPEN → IN_PROGRESS → RESOLVED` com
idempotência e bloqueio após finalizada; auditoria (`trip.occurrence_created` com `tripDeliveryStopId`,
`trip.occurrence_in_progress`); notificação `CRITICAL_OCCURRENCE` com `tripDeliveryStopId` no metadata;
listagem cross-trip excluindo ocorrências sem parada; filtros/busca/paginação completos; ações cross-trip
(start/resolve/cancel); isolamento multi-tenant; RBAC (`DRIVER` bloqueado, `AUDITOR` só leitura); dashboard
com contagem por status/severidade/tipo. Mais um teste de ausência de N+1 dedicado no mesmo arquivo.

Regressão executada: suíte completa de `trip-occurrences-shifts-timeline.e2e-spec.ts` (27 testes — inclui
`TripOccurrence` legado, `DriverShift`/`ShiftBreak` e `GET /trips/:id/timeline`),
`trip-delivery-stops.e2e-spec.ts`, `fiscal-documents.e2e-spec.ts`, `driver-trips.e2e-spec.ts`,
`trips.e2e-spec.ts` e `fleet-occurrences-dashboard.e2e-spec.ts` (dashboard cross-fleet **geral**,
pré-existente — confirmado sem regressão com a extensão aditiva dos enums) — todos passando sem alteração
de comportamento pré-existente.
