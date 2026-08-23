# Timeline Operacional, Ocorrências e Jornada da Viagem (Fase 67)

## Escopo

Resolve as 3 limitações reais deixadas pela Fase 66 (`docs/trip-management.md`,
seções 10/16): ausência de timeline unificada, `DriverShift`/`ShiftBreak`
órfãos, comprovante de entrega sem contexto de eventos correlatos. Adiciona
`TripOccurrence` (registro de incidentes durante a viagem) como quarto pilar.

## Auditoria prévia (o que já existia vs. o que foi criado)

- `GET /trips/:id/timeline` já existia (Fase 28), mas devolvia só `AuditLog`
  filtrado por `entityName: 'Trip'` — **evoluído** (mesma rota, resposta
  nova), nunca substituído por um segundo endpoint.
- `DriverShift`/`ShiftBreak` já existiam no schema (zero uso em código) —
  **ativados**: campos `cancelledAt`/`updatedAt` adicionados a `DriverShift`
  e `type` (reaproveitando o enum `TripStopType`) a `ShiftBreak`, migration
  aditiva `20260822151613_trip_occurrences_and_shift_extensions`.
- Comprovante de entrega **já tinha** uma seção dedicada em
  `fiscal-tab.tsx` (status/lista/detalhe) desde a Fase 56 — a limitação
  real confirmada foi só a ausência de preview/download do arquivo.
- `TripOccurrence` não existia — modelo novo, mínimo (sem workflow
  complexo, sem SLA, sem escalonamento automático).
- Notification/Alert (model `Notification`) confirmados órfãos (zero
  consumidor ativo) — nenhuma integração de push foi construída (não havia
  infraestrutura funcional para integrar).

## 1. `TripOccurrence`

Registro do incidente em si — nunca uma segunda fonte dos eventos já
existentes (paradas, eventos de rota etc.), que continuam vivendo em suas
próprias tabelas e são apenas agregados pela timeline (seção 3).

Campos: `id`, `tenantId`, `tripId` (obrigatório), `driverShiftId?` (jornada
aberta do motorista no momento do registro, resolvida automaticamente),
`driverId?`, `vehicleId?`, `type` (`ACCIDENT`/`BREAKDOWN`/`DELAY`/
`ROUTE_DEVIATION`/`DELIVERY_PROBLEM`/`DOCUMENT_PROBLEM`/`VEHICLE_PROBLEM`/
`FUEL_PROBLEM`/`TIRE_PROBLEM`/`OTHER`), `severity` (`INFO`/`WARNING`/
`CRITICAL`), `description`, `occurredAt`, `latitude?`/`longitude?`/
`locationLabel?`, `resolvedAt?`/`resolvedBy?`, `cancelledAt?`,
`attachmentId?` (evidência — reaproveita `Attachment` via FK direta, mesmo
padrão de `FuelSupply.attachmentId`/`TripExpense.attachmentId`, nunca um
sistema de arquivos novo), `metadata?` (Json, extensibilidade livre),
`deviceEventId?` (idempotência do driver-app, nulo para criação
administrativa), `createdBy`.

`status` (`OPEN`/`RESOLVED`/`CANCELLED`) é **sempre derivado** de
`resolvedAt`/`cancelledAt` no mapper (`computeTripOccurrenceStatus`) —
nunca uma coluna própria, mesmo princípio de `TripStop.status`.
`CANCELLED` tem prioridade sobre `RESOLVED` (correção administrativa de um
registro indevido mesmo já resolvido).

Serviço: `TripOccurrencesService` (`apps/api/src/trip-operations/services/
trip-occurrences.service.ts`), espelha exatamente `TripStopsService`:
`create` (administrativo), `createFromDriverApp` (idempotente por
`deviceEventId`), `resolve`/`cancel` (idempotentes), `findAllForTrip`,
`findOne`.

Endpoints administrativos (`TripsController`, roles `TRIP_READ_ROLES`/
`TRIP_WRITE_ROLES` reaproveitados — sem constantes novas):
`GET/POST /trips/:id/occurrences`,
`PATCH /trips/:id/occurrences/:occurrenceId/resolve`,
`PATCH /trips/:id/occurrences/:occurrenceId/cancel`.

Endpoints do driver-app (`DriverTripsController`, role `DRIVER` via
`DriverGuard`): `POST/GET /driver/trips/:id/occurrences`. O motorista só
cria a própria ocorrência (RBAC): não há rota de resolver/cancelar exposta
ao app — essas ações são exclusivamente administrativas.

Auditoria: `trip.occurrence_created`, `trip.occurrence_resolved`,
`trip.occurrence_cancelled` (via `AuditService.log`, nunca bloqueia a
operação).

## 2. `DriverShift` / `ShiftBreak`

Jornada mínima do motorista — cálculos de duração são **apenas
aritméticos** (`endedAt - startedAt`, pausas subtraídas), nunca uma
apuração de jornada legal (sem eSocial, sem intervalos obrigatórios por
lei, sem hora extra). `status` (`OPEN`/`CLOSED`/`CANCELLED`) é sempre
derivado de `endedAt`/`cancelledAt` (`computeDriverShiftStatus`), mesmo
princípio de `TripStop`/`TripOccurrence` — `cancelledAt` foi adicionado à
migration exatamente para viabilizar esse desenho (sem ele, cancelar uma
jornada aberta por engano exigiria uma coluna `status` redundante).
`ShiftBreak.type` reaproveita o enum `TripStopType` (já contém
`REST`/`MEAL`/`FUEL`/`MAINTENANCE`/`OTHER`, os 5 tipos pedidos — nenhum
enum novo foi criado).

Idempotência: **por estado**, nunca por `deviceEventId` (o schema não tem
esse campo em `DriverShift`/`ShiftBreak`) — mesmo princípio já usado por
`DriverTripsService.pause/resume/complete`. Iniciar jornada com uma já
aberta devolve a mesma; pausar com uma pausa já aberta devolve o mesmo
estado; encerrar/cancelar já concluído/cancelado é no-op.

Serviço: `DriverShiftsService` — `start`, `end` (fecha automaticamente uma
pausa em aberto, se houver), `cancel`, `startBreak`, `endBreak`,
`getActive`, `findAllForTrip` (leitura administrativa).

Endpoints driver-app: `GET /driver/shifts/active`, `POST /driver/shifts/
start`, `POST /driver/shifts/:id/end`, `POST /driver/shifts/:id/cancel`,
`POST /driver/shifts/:id/breaks` (pausar), `POST /driver/shifts/:id/
breaks/end` (retomar). Endpoint administrativo: `GET /trips/:id/shifts`.

Auditoria: `shift.started`, `shift.closed`, `shift.cancelled`,
`break.started`, `break.ended`.

## 3. Timeline unificada (`TripTimelineService`)

Evolui `GET /trips/:id/timeline` (mesma rota, nunca um segundo endpoint)
de "só `AuditLog`" para uma **projeção em memória** que agrega, sem
persistir nada novo: `TripStop`, `RouteEvent`, `FuelSupply`,
`TollTransaction`, `AxleEvent`, `ChecklistExecution`, `FiscalDocument`
(inclusive `DELIVERY_PROOF`, com origem própria), `TripExpense`,
`TripRevenue`, `TripOccurrence` e `AuditLog` (eventos de ciclo de vida da
viagem — `trip.started`/`paused`/etc.).

Cada item normalizado (`TripTimelineEventEntity`): `id` (do registro de
origem), `origin` (enum `TripTimelineOrigin`: `STOP`/`ROUTE_EVENT`/`FUEL`/
`TOLL`/`AXLE`/`CHECKLIST`/`FISCAL`/`DELIVERY_PROOF`/`EXPENSE`/`REVENUE`/
`OCCURRENCE`/`AUDIT`), `type` (subtipo bruto do registro original, quando
existir), `label` (rótulo pt-BR gerado no backend), `description?`,
`severity?` (só para `OCCURRENCE`), `occurredAt` (**sempre** um timestamp
real do registro de origem — `startedAt`, `chargedAt`, `expenseDate`,
`issueDate ?? createdAt` etc., nunca inventado).

Sem um `origin` `TRIP` separado de `AUDIT`: os dois viriam da mesma tabela
`AuditLog`, uma distinção não corresponderia a nenhuma fonte de dado
diferente (evitado por instrução explícita de "enum só se necessário").

Filtros (`FindTripTimelineQueryDto`): `origin`, `type`, `from`/`to`
(por `occurredAt`), `order` (`asc`/`desc`, padrão `desc`), paginação
padrão (`page`/`pageSize`). Ordenação com desempate determinístico
(`origin` depois `id`) quando dois eventos têm o mesmo instante.

**N+1**: sempre um número **fixo** de queries em paralelo (uma por
origem agregada + a checagem de existência da viagem, ~12 no total),
nunca uma consulta por evento — comprovado em
`test/trip-occurrences-shifts-timeline.e2e-spec.ts` (10 vs. 50 eventos,
contagem de queries via `$extends` instrumentado, mesmo padrão já usado em
`fleet-operations-fuel.e2e-spec.ts`). O volume de **linhas** cresce com o
total de eventos da viagem (esperado, uma viagem real tem no máximo
algumas centenas), a contagem de queries não.

## 4. Frontend (`admin-web`)

`/trips/[id]`, novas abas sem remover nenhuma existente:

- **Linha do tempo** (evoluída): renderiza `label`/`description`/
  `origin`/`severity` prontos do backend, filtro por origem. Antes exibia
  só ações de `AuditLog` mapeadas localmente (`ACTION_LABELS`) — esse
  mapeamento migrou para o backend (`TripTimelineService`).
- **Ocorrências** (nova): listagem + criação (modal) + resolver/cancelar
  (RBAC `TRIP_WRITE_ROLES`), reaproveitando `DataTable`/`Dropdown`/`Badge`
  já existentes.
- **Jornada** (nova): leitura administrativa das jornadas/pausas
  vinculadas à viagem — controle (iniciar/pausar/retomar/encerrar) é
  exclusivo do app do motorista.

Nenhum componente visual novo foi instalado.

## 5. Driver App

- **Ocorrências**: nova tela (`OccurrenceScreen`), offline-first via
  `syncQueue.ts` (`kind: 'occurrence-create'`), idempotente por
  `deviceEventId` — mesmo mecanismo de `stop-open`/`fuel-supply`.
- **Jornada**: nova tela (`ShiftScreen`). `shift-start` **não** entra na
  fila offline (mesmo motivo estrutural de `checklist-create`: as ações
  seguintes — pausar/retomar/encerrar — precisam do id gerado pelo
  servidor, que a fila não resolve de forma encadeada) — é sempre tentado
  online, com mensagem de retry se falhar. Uma vez com o id em mãos,
  pausar/retomar/encerrar/cancelar reaproveitam a **mesma** fila offline
  (`kind`s `shift-break-start`/`shift-break-end`/`shift-end`/
  `shift-cancel`), idempotentes por estado no backend.
- Nenhuma alteração no mecanismo de fila/retry/`deviceEventId` em si —
  só novos `kind`s de `PendingAction`, seguindo o desenho já existente.

## 6. RBAC / multi-tenant / auditoria

- `TripOccurrence`: leitura `TRIP_READ_ROLES` (inclui `AUDITOR`), escrita
  administrativa `TRIP_WRITE_ROLES` (exclui `AUDITOR`) — reaproveitados de
  `trip-roles.constants.ts`, nenhuma constante nova. Motorista cria a
  própria ocorrência via `DriverGuard`; nunca resolve/cancela (rota não
  exposta ao app).
- `DriverShift`/`ShiftBreak`: escrita exclusiva do próprio motorista
  (`DriverGuard` + `findOwnedOrThrow` filtrando por `driverId` do
  contexto) — testado que um motorista nunca altera a jornada de outro.
  Leitura administrativa (`GET /trips/:id/shifts`) usa `TRIP_READ_ROLES`.
- Todas as entidades novas levam `tenantId` e foram testadas
  cross-tenant (404 ao tentar acessar recurso de outro tenant).
- `AuditService.log` para todas as ações novas (seção 1/2) — nunca um
  segundo sistema de auditoria.

## 7. Testes

- **Unit**: `trip-occurrence.mapper.spec.ts` (derivação de status),
  `driver-shift.mapper.spec.ts` (derivação de status + cálculo de
  duração/pausas).
- **E2E**: `test/trip-occurrences-shifts-timeline.e2e-spec.ts` — CRUD e
  idempotência de ocorrência (admin e driver-app), RBAC (auditor só
  leitura), isolamento multi-tenant; ciclo completo de jornada (iniciar/
  pausar/retomar/encerrar, todos idempotentes), encerramento fechando
  pausa em aberto automaticamente, cancelamento, isolamento entre
  motoristas; timeline agregando múltiplas origens, filtros, paginação,
  isolamento multi-tenant, e verificação real de ausência de N+1 (10 vs.
  50 eventos).
- **Regressão confirmada verde**: `trips.e2e-spec.ts` (timeline ajustada
  ao novo formato), `driver-trips.e2e-spec.ts`, `trip-stops.e2e-spec.ts`,
  `trip-operational-consolidation.e2e-spec.ts`, `fiscal-documents.e2e-spec.ts`,
  `drivers.e2e-spec.ts`, suíte unitária completa da API, suíte completa
  do `admin-web` (Vitest), typecheck/build de `apps/api` e `apps/admin-web`,
  typecheck/jest de `apps/driver-app`.

## 8. Performance / N+1

Ver seção 3 — número fixo de queries na timeline. `TripOccurrencesService`/
`DriverShiftsService` seguem o mesmo padrão de `TripStopsService`: nenhuma
consulta por linha em listagens.

## 9. Limitações reais (Fase 67 — ver seção 11 para o que a Fase 68 resolveu)

- ~~Comprovante de entrega continua sem preview/download do arquivo~~ —
  **resolvido na Fase 68** (`GET /fiscal/documents/:id/file`), ver seção 11.
- Notification/Alert (infraestrutura de push) confirmados órfãos — nenhuma
  integração de ocorrência crítica com notificação foi construída (não há
  infraestrutura funcional para integrar; construir uma do zero estaria
  fora do escopo pedido, que exclui push explicitamente). Continua
  pendente após a Fase 68 pelo mesmo motivo.
- ~~Dashboard de ocorrências... e integração com FleetAlert... não foram
  implementados~~ — **resolvido na Fase 68**, ver seção 11.
- `EntitySelect` (usado no modal de nova ocorrência) carrega só a primeira
  página (até 100 registros) de motoristas/veículos — mesma limitação
  pré-existente documentada no próprio componente, não uma regressão desta
  fase.

## 10. Pendências reais (Fase 67 — todas resolvidas na Fase 68, ver seção 11)

- ~~`GET /fleet-operations/occurrences`~~ — implementado.
- ~~Extensão de `FleetAlertType`/`FleetAlertEntity` para ocorrência crítica
  em aberto~~ — implementado.
- ~~Preview/download do arquivo do comprovante de entrega~~ — implementado.

## 11. Fase 68 — Dashboard de Ocorrências, Alertas Críticos e Comprovantes de Entrega

Fecha as 3 pendências da Fase 67 (seção 10 acima). Nenhuma migration —
`FleetAlertType` é um union type TypeScript, não uma coluna de banco.

### 11.1 `GET /fleet-operations/occurrences`

Serviço próprio `FleetOccurrencesMetricsService` (não adicionado ao já
grande `FleetOperationsMetricsService`), injetado diretamente em
`FleetOperationsController` — mesmo padrão de múltiplos services irmãos
já usado por `TripsController`. DTO próprio `FindFleetOccurrencesQueryDto`
(`from`/`to`/`vehicleId`/`driverId`/`type`/`severity`/`status`) — não
reaproveita `FleetOperationsQueryDto` porque `from`/`to`/`type`/`status`
já têm outro significado ali (`startDate`/`endDate`, `TripStopType`,
`TripStopStatus` sem `RESOLVED`).

Indicadores: `totalCount`, `openCount`, `criticalOpenCount`,
`resolvedCount`, `cancelledCount` (todos via `count()` com `where`
explícito sobre `resolvedAt`/`cancelledAt` — status continua **sempre
derivado**, nunca uma coluna/`groupBy(['status'])`, que não existiria),
`byType`/`bySeverity` (`groupBy`), `byVehicle`/`byDriver` (`groupBy` +
resolução de placa/nome em lote — reaproveita `mergeVehicleAmounts`/
`rankTopVehicles` de `fleet-operations-metrics.util.ts`), `monthlyTrend`
(`aggregateMonthlySeries`, janela fixa de 12 meses, mesmo padrão de
`FleetStopsDashboardEntity`).

### 11.2 `FleetAlert` — ocorrência crítica

Dois novos valores em `FleetAlertType` (`fleet-alert.entity.ts`), mesmo
par fleet-wide/per-vehicle já usado para manutenção/pneu/hodômetro:

- `TRIP_OCCURRENCE_CRITICAL` — `FleetOperationsMetricsService.computeAlerts`
  (alimenta `GET /fleet-operations/dashboard`), consulta `TripOccurrence`
  com `severity=CRITICAL, resolvedAt=null, cancelledAt=null,
  vehicleId≠null` (ocorrência sem veículo nunca vira alerta — ver
  limitação abaixo).
- `VEHICLE_OCCURRENCE_CRITICAL` — `VehicleOverviewService.buildAlerts`
  (`GET /vehicles/:id/overview`), mesma consulta com `vehicleId` fixo (1
  query bounded a um veículo, nunca 1 por ocorrência).

O alerta deixa de existir automaticamente assim que `resolvedAt` OU
`cancelledAt` é preenchido — a query já filtra por esses campos, não há
"remoção" de um alerta persistido porque nada é persistido (nenhuma
máquina de estados nova). Regra pura testada isoladamente em
`isCriticalOpenOccurrence` (`trip-occurrence.mapper.ts`).

`FleetOverviewEntity` (visão geral do dashboard consolidado) também ganha
`openOccurrences`/`criticalOpenOccurrences`/`resolvedOccurrences`/
`cancelledOccurrences` (4 `count()` em paralelo,
`countOccurrencesByDerivedStatus`); `VehicleMetricsEntity` ganha
`criticalOpenOccurrences` (contagem bounded ao veículo).

### 11.3 Preview/download do comprovante de entrega

`GET /fiscal/documents/:id/file` (`FiscalDocumentsController`, mesmo RBAC
de leitura já usado pelo módulo Fiscal). Implementação em
`FiscalDocumentsService.getFile`:

1. `findOwnedOrThrow` (já existente) garante tenant + existência do
   documento.
2. Exige `document.attachmentId` (404 com mensagem clara se ausente — ex:
   documento importado por XML sem arquivo físico).
3. Busca o `Attachment` (`id + tenantId`) para obter `storageKey` — **nunca
   confia em nome/caminho vindo do cliente**: `storageKey` é sempre um
   UUID+extensão gerado pelo servidor no upload (nunca o nome original do
   arquivo), então `join(storageDir, storageKey)` nunca sofre path
   traversal.
4. Resolve `storageDir` via `ConfigService` (`fiscalDocuments.storageDir`
   — **mesma** variável de ambiente/diretório já usado pelos uploads
   administrativo e do driver-app desde as Fases 52/56, nenhum storage
   novo).
5. Content-Type = `FiscalDocument.mimeType` (já coletado no upload, cujo
   arquivo já passou por `assertValidFileSignature` na criação — nunca
   re-detectado aqui). `inline` (preview) quando `image/*` ou
   `application/pdf`; caso contrário, `attachment` (download).
6. Resposta via `StreamableFile` (nativo do Nest) — nunca lê o arquivo
   inteiro em memória antes de responder.

Sem auditoria de leitura: o padrão do projeto audita apenas mutações
(`AuditService.log` em creates/updates/deletes), nunca reads — mantido.

### 11.4 Frontend

- `/operations/fleet` (dashboard executivo): 2 novos `StatCard`s na visão
  geral (`Ocorrências abertas`/`Ocorrências críticas`) + novo card-seção
  "Ocorrências" com link para o dashboard dedicado — todos usando os
  campos já vindos de `GET /fleet-operations/dashboard` (nenhuma query
  extra nesta página).
- `/operations/fleet/occurrences` (nova página): KPIs, filtros
  (período/veículo/motorista/tipo/severidade/status), tabelas por
  tipo/severidade, gráfico de evolução mensal (`MonthlyChartCard`),
  ranking de veículos (`BarRankingChart`) e motoristas (`DataTable`) — 100%
  componentes já existentes, nenhuma biblioteca nova.
- `fiscal-document-detail-drawer.tsx`: botões "Visualizar" (só quando
  `image/*`/`application/pdf`) e "Baixar" quando o documento tem
  `attachmentId`. Busca o arquivo via `fetch` autenticado (novo
  `apiFetchBlob` em `lib/api/http.ts`, mesmo mecanismo de token/refresh de
  `apiFetch`) e usa `URL.createObjectURL` — mimeType/nome do arquivo vêm
  da própria `FiscalDocumentEntity` já carregada, nunca de
  `Content-Disposition` da resposta (evitaria depender de expor esse
  header no CORS, desnecessário quando o dado já está disponível).

### 11.5 Driver App

Não alterado — o preview/download é administrativo por natureza (RBAC do
módulo Fiscal exclui `DRIVER`). Fluxo de captura/offline/`syncQueue`/
`deviceEventId` do comprovante de entrega (Fase 56) permanece intocado.

### 11.6 Testes

- Unit: `isCriticalOpenOccurrence` (6 casos — classificação, exclusão após
  resolução, exclusão após cancelamento, INFO/WARNING nunca críticos).
- E2E (`test/fleet-occurrences-dashboard.e2e-spec.ts`, 14 casos):
  dashboard de ocorrências (agregações, filtros, isolamento multi-tenant,
  RBAC), `TRIP_OCCURRENCE_CRITICAL` aparecendo/desaparecendo ao
  resolver/cancelar, INFO/WARNING nunca viram alerta crítico, integração
  com `VehicleOverview`, download de `DELIVERY_PROOF` (Content-Type/
  Content-Disposition corretos), autorização (401 sem token), isolamento
  multi-tenant do arquivo (404), documento sem attachment (404), documento
  inexistente (404), e verificação real de ausência de N+1 (10 → 50
  ocorrências, contagem de queries constante).
- Regressão confirmada verde: suíte unitária completa da API,
  `trip-occurrences-shifts-timeline.e2e-spec.ts`, `trips.e2e-spec.ts`,
  `driver-trips.e2e-spec.ts`, `fiscal-documents.e2e-spec.ts`,
  `vehicle-management.e2e-spec.ts`, `fleet-operations*.e2e-spec.ts`,
  `fleet-maintenance`/`maintenances`/`maintenance-vehicle-integration`,
  `tire-management`/`tire-vehicle-integration`, `fuel-management`/
  `fuel-vehicle-integration`, `freight.e2e-spec.ts`, `billing*.e2e-spec.ts`,
  suíte completa do `admin-web` (Vitest), typecheck/build de `apps/api` e
  `apps/admin-web`.

### 11.7 Limitações reais (Fase 68)

- Ocorrência **sem** `vehicleId` nunca vira `TRIP_OCCURRENCE_CRITICAL`
  (`FleetAlertEntity.vehicleId` é obrigatório em todo o módulo
  `fleet-operations`, convenção pré-existente — não alterada nesta fase).
  Continua contando normalmente em `criticalOpenCount`/`openOccurrences`
  no dashboard, só não vira um `FleetAlertEntity`.
- Notification/push continua sem integração (infraestrutura órfã, fora de
  escopo — ver seção 9).

### 11.8 Pendências reais (Fase 68)

Nenhuma pendência de escopo desta fase.
