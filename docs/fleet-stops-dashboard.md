# Controle de Paradas e Tempos Operacionais da Frota (Fase 43)

Módulo de **eventos operacionais de tempo**: início/fim de parada, duração
sempre calculada pelo backend, classificação por tipo, e uma camada de
indicadores/rankings/alertas sobre esses eventos. Não duplica nenhum
domínio existente — reaproveita `TripStop` (modelo já criado na Fase 25) e
`FleetOperationsMetricsService` (Fase 40/41).

## 1. O que já existia antes desta fase

Uma auditoria do repositório no início da Fase 43 encontrou trabalho de uma
sessão anterior já em andamento, também identificado como "Fase 43" nos
comentários do código:

- **Schema**: `TripStop` já com todos os campos necessários (`source`,
  `notes`, `cancelledAt`, `tripId`/`driverId`/`latitude`/`longitude`
  opcionais), catálogo `TripStopType` já ampliado (21 valores) e
  `TripStopSource` já criado (migration
  `20260812002658_fleet_stops_operational_time_control`).
- **Backend**: `TripStopsService` já com `open`/`close`/`closeByDeviceEvent`/
  `createAdministrative`/`closeById`/`cancel`/`findAllPaginated`/`findOne`
  implementados, DTOs prontos (`CreateAdminTripStopDto`,
  `FindTripStopsQueryDto`, `CloseTripStopByDeviceEventDto` etc.), roles
  dedicadas (`TRIP_STOP_READ_ROLES`/`TRIP_STOP_WRITE_ROLES`), agrupamento de
  categorias (`trip-stop-type-groups.constants.ts`).
- **Dashboard agregado**: `GET /fleet-operations/stops` já existente desde a
  Fase 40, com `totalStops`/`totalDurationMinutes`/`averageDurationMinutes`/
  `byType`/`topVehiclesByDuration`/`monthlyTrend`.
- **Admin-web**: página `/operations/fleet/stops` já existente (cards +
  tabela por tipo + gráfico mensal + ranking de veículos).
- **Driver App**: `StopsScreen.tsx` (Fase 25) já permitia abrir/fechar
  parada manualmente.

## 2. Lacunas reais encontradas (e por que cada uma foi corrigida)

| Lacuna | Evidência | Correção |
|---|---|---|
| **Endpoints administrativos inalcançáveis** | `TripStopsService.createAdministrative`/`findAllPaginated`/`closeById`/`cancel`/`closeByDeviceEvent` existiam mas nenhum `@Controller` os expunha — código morto, sem rota HTTP. | Criado `TripStopsController` (`/trip-stops`) e adicionada a rota `POST driver/trips/:id/stops/close-by-device-event` no `DriverTripsController`. |
| **Bug real: parada cancelada contava no dashboard** | `FleetOperationsMetricsService.buildStopWhere` não filtrava `cancelledAt: null`, apesar do comentário em `TripStopsService.cancel()` afirmar o contrário. Só foi possível provar isso (e escrever o teste que falhou) depois que o endpoint de cancelamento passou a ser alcançável via HTTP. | `buildStopWhere` e a query de `STALLED_VEHICLE` agora excluem paradas canceladas. |
| **Driver App não funcionava offline para paradas** | `StopsScreen.tsx` chamava `driverTripsApi.openStop`/`closeStop` diretamente — nunca passava por `syncQueue.submitOrQueue`, apesar do kind `stop-open` já existir na fila (não utilizado por nenhuma tela) e do backend já ter criado `closeByDeviceEvent` especificamente para viabilizar isso. | Novo kind `stop-close` na fila; `StopsScreen` reescrita para usar `submitOrQueue` em abertura e fechamento; novo `activeStopPointer.ts` (mesmo padrão de `checklistPointer.ts`) para sobreviver a fechar/reabrir o app com a abertura ainda não sincronizada. |
| **Motorista não seleciona o motivo da parada** | `StopsScreen.tsx` sempre abria com `type: UNKNOWN`. | Grade de motivos (1 toque = seleciona o tipo E abre a parada), catálogo completo espelhado em `driverTrips.types.ts`. |
| **Catálogo de tipos desatualizado no admin-web** | `apps/admin-web/src/types/enums.ts` e `lib/labels.ts` só tinham os 6 valores da Fase 25 — o `Record<TripStopType, ...>` ficaria incompleto/quebraria o typecheck ao tentar usar o catálogo novo. | `TripStopType`/`TripStopSource`/`TripStopStatus` atualizados em `types/enums.ts`, labels e tons (`TRIP_STOP_TYPE_TONE`) completados. |
| **Sem listagem/tabela de paradas individuais na tela administrativa** | `/operations/fleet/stops` só mostrava agregados (spec pedia tabela paginada com filtros e detalhe). | Nova seção "Paradas registradas": tabela paginada (`GET /trip-stops`), filtros por motorista/tipo/status (além dos já existentes período/veículo/frota), modal de detalhe ao clicar na linha. |
| **Sem "maior"/"menor parada"** | `FleetStopsDashboardEntity` só tinha total/média. | `_max`/`_min` adicionados na mesma query `aggregate` já existente (sem query extra). |
| **Dashboard executivo sem seção própria de paradas** | `GET /operations/fleet` (executivo) só tinha um ranking "Top tempo parado" solto, sem card consolidado nem link "Ver detalhes". | Nova seção "Paradas" com total/tempo total/tempo médio/principal motivo/veículo mais parado/paradas em aberto há muito tempo + link para `/operations/fleet/stops`. |
| **Sem testes unitários/e2e para o fluxo de paradas** | Nenhum `*.spec.ts` para `TripStopsService`, nenhum e2e cobrindo os endpoints administrativos, nenhum teste de N+1 específico para paradas. | `trip-stop-duration.util.spec.ts`, `trip-stop.mapper.spec.ts`, `trip-stops.e2e-spec.ts` (18 casos, incluindo N+1 em 10/25/50/100 veículos para `GET /fleet-operations/stops` e `GET /trip-stops`). |
| **Sem testes do Driver App para o fluxo offline de paradas** | Nenhum teste cobria `stop-open`/`stop-close` na fila, nem a tela. | Casos novos em `syncQueue.test.ts` + `StopsScreen.test.tsx` (8 casos). |
| **`deviceEventId` não exposto na entity** | Pedido explícito (seção 24) de mostrar o `deviceEventId` no detalhe, mas `TripStopEntity` não o incluía. | Campo adicionado (`deviceEventId`, `updatedAt`) na entity e no mapper. |
| **Documentação da fase inexistente** | `docs/fleet-stops-dashboard.md` não existia. | Este arquivo. |

## 3. Arquitetura — eventos operacionais de tempo

```
TripStopsService
  ├─ open()                 -- POST driver/trips/:id/stops (driver-app, sempre vinculado a uma Trip)
  ├─ close()                -- PATCH driver/trips/:id/stops/:stopId/close
  ├─ closeByDeviceEvent()   -- POST driver/trips/:id/stops/close-by-device-event [Fase 43 -- fechamento offline]
  ├─ createAdministrative() -- POST trip-stops (admin-web, SEM exigir viagem ativa) [Fase 43]
  ├─ closeById()            -- PATCH trip-stops/:id/close [Fase 43]
  ├─ cancel()                -- PATCH trip-stops/:id/cancel [Fase 43]
  ├─ findAll()               -- GET trips/:id/stops (paradas de UMA viagem)
  ├─ findAllPaginated()      -- GET trip-stops (cross-frota, paginado, com filtros) [Fase 43]
  └─ findOne()               -- GET trip-stops/:id [Fase 43]

FleetOperationsMetricsService.computeStopsDashboard()
  └─ GET /fleet-operations/stops -- agregados (total/média/max/min/byType/topVehiclesByDuration/monthlyTrend)
```

### Modelo (`TripStop`)

Campos: `id`, `tenantId`, `vehicleId`, `driverId?`, `tripId?`, `type`,
`source`, `startedAt`, `endedAt?`, `durationMinutes?`, `latitude?`,
`longitude?`, `locationLabel?`, `notes?`, `cancelledAt?`, `deviceEventId`,
`syncStatus`, `syncedAt`, `createdAt`, `updatedAt`.

`status` (`OPEN`/`COMPLETED`/`CANCELLED`) **nunca é uma coluna** — é sempre
derivado de `endedAt`/`cancelledAt` (`computeTripStopStatus`, testado em
`trip-stop.mapper.spec.ts`). `cancelledAt` tem prioridade sobre `endedAt`: um
evento pode ter sido fechado e depois cancelado (correção administrativa),
o cancelamento é a palavra final.

`durationMinutes` é **sempre calculado pelo backend**
(`computeDurationMinutesOrThrow`, `apps/api/src/trip-operations/utils/
trip-stop-duration.util.ts`) — nunca aceito do cliente, nunca negativo
(`BadRequestException` se `endedAt < startedAt`).

### Fontes (`TripStopSource`)

| Valor | Uso real nesta fase |
|---|---|
| `DRIVER_APP` | Abertura/fechamento pelo motorista (`StopsScreen.tsx`) — o único fluxo realmente usado hoje pelo app. |
| `ADMIN` | Sempre atribuído pelo backend em `POST /trip-stops` — **nunca aceito do corpo da requisição**. |
| `GPS` | Reservado para detecção automática futura (ver seção 8) — **não implementado nesta fase**. |
| `MANUAL`, `SYSTEM`, `IMPORT` | Definidos no enum para evolução futura (fechamento automático ao concluir viagem, importação de dados externos) — **não utilizados nesta fase**, nenhum fluxo falso foi criado só para "existir". |

## 4. Endpoints

| Rota | RBAC | Descrição |
|---|---|---|
| `POST driver/trips/:id/stops` | `DRIVER` (+ `DriverGuard`) | Abre parada vinculada à viagem ativa do motorista. Idempotente por `deviceEventId`. |
| `PATCH driver/trips/:id/stops/:stopId/close` | `DRIVER` | Fecha pelo id do servidor. |
| `POST driver/trips/:id/stops/close-by-device-event` **[novo]** | `DRIVER` | Fecha pelo `deviceEventId` da abertura — viabiliza fechamento enfileirado offline. |
| `GET trips/:id/stops` | `TRIP_READ_ROLES` | Paradas de uma viagem específica. |
| `GET trip-stops` **[novo]** | `TRIP_STOP_READ_ROLES` | Lista paginada cross-frota, filtros `from`/`to`/`vehicleId`/`driverId`/`tripId`/`type`/`status`. |
| `GET trip-stops/:id` **[novo]** | `TRIP_STOP_READ_ROLES` | Detalhe de uma parada. |
| `POST trip-stops` **[novo]** | `TRIP_STOP_WRITE_ROLES` | Criação administrativa (pátio/garagem/quebra), sem exigir viagem ativa. `source` sempre `ADMIN`. |
| `PATCH trip-stops/:id/close` **[novo]** | `TRIP_STOP_WRITE_ROLES` | Fecha qualquer parada (administrativa ou do driver-app) pelo id. |
| `PATCH trip-stops/:id/cancel` **[novo]** | `TRIP_STOP_WRITE_ROLES` | Cancela um registro indevido. Idempotente. |
| `GET fleet-operations/stops` | `FLEET_OPERATIONS_READ_ROLES` | Dashboard agregado (analytics). |

`TRIP_STOP_READ_ROLES = [SUPER_ADMIN, ADMIN, MANAGER, OPERATOR, DISPATCHER,
AUDITOR]`; `TRIP_STOP_WRITE_ROLES` = o mesmo grupo **sem** `AUDITOR` (que é
só leitura por definição, mesma política de `TRIP_WRITE_ROLES`). `DRIVER`
nunca acessa `/trip-stops` (só as rotas `driver/trips/:id/stops/*`, sempre
restritas às próprias viagens via `DriverGuard` + `DriverTripsService.getOne`).

Nenhum `tenantId` é aceito do cliente em nenhuma rota — sempre resolvido via
`TenantContext.requireTenantId()` a partir do token.

## 5. Regras de negócio

- Um veículo não pode ter duas paradas `OPEN` simultâneas
  (`assertNoOpenStopForVehicle`) — vale tanto para o fluxo do driver-app
  quanto para o administrativo.
- `endedAt < startedAt` é sempre rejeitado (`400`).
- Fechar uma parada já fechada é **idempotente** (devolve o estado atual,
  nunca recalcula a duração com o novo `endedAt`).
- Cancelar é idempotente; uma parada cancelada **nunca pode ser fechada**
  (`409`) e **nunca entra em indicadores/rankings/alertas**
  (`buildStopWhere` filtra `cancelledAt: null` — bug corrigido nesta fase,
  ver seção 2).
- `POST /trip-stops` e `POST driver/trips/:id/stops` são idempotentes por
  `deviceEventId`: reenviar o mesmo evento nunca duplica.

### Comportamentos não determinados pelo domínio existente (decisões desta fase)

- **App fechar/reabrir com abertura offline pendente**: o `activeStopPointer`
  local (AsyncStorage) é a única fonte de verdade até a abertura sincronizar
  — o servidor não sabe da parada ainda, então a tela confia no ponteiro
  local (mesmo princípio de `checklistPointer.ts`, Fase 39).
- **Viagem terminar com parada aberta**: nenhum fechamento automático foi
  implementado (não solicitado explicitamente e não haveria uma "duração"
  real para calcular sem um evento de fechamento genuíno) — a parada
  permanece `OPEN` até ser fechada manualmente ou cancelada por um admin.
- **Troca de motorista/veículo**: fora do escopo desta fase — o domínio de
  `Trip`/`TripComposition` não foi alterado.

## 6. Catálogo de tipos (`TripStopType`)

21 valores, agrupados apenas para **apresentação** (nunca uma coluna) em
`trip-stop-type-groups.constants.ts` (backend) e espelhado em
`operation-status.ts`/`labels.ts` (admin-web) e `StopsScreen.tsx`
(driver-app):

| Categoria | Tipos |
|---|---|
| OPERACIONAL | `LOADING`, `UNLOADING`, `WAITING_LOADING`, `WAITING_UNLOADING`, `YARD`, `CUSTOMER`, `GARAGE` |
| VEÍCULO | `FUEL`, `MAINTENANCE`, `BREAKDOWN`, `TIRE` |
| TRÂNSITO | `CONGESTION`, `ACCIDENT`, `ROAD_CLOSURE`, `INSPECTION` |
| MOTORISTA | `REST`, `MEAL`, `PERSONAL_NEED` |
| ADMINISTRATIVO | `DOCUMENTATION`, `WAITING_AUTHORIZATION` |
| OUTROS | `OTHER`, `UNKNOWN` |

`UNKNOWN` é o padrão quando o motorista ainda não classificou — nunca
bloqueia o registro da parada.

## 7. Offline-first (Driver App)

Reaproveita **integralmente** `syncQueue.ts` (nenhuma fila paralela):

```ts
{ kind: 'stop-open'; tripId; deviceEventId; type?; latitude; longitude; startedAt }
{ kind: 'stop-close'; tripId; deviceEventId; endedAt; type? }
```

- `stop-open` já existia no tipo da fila desde a Fase 25, mas **nenhuma
  tela o utilizava** — `StopsScreen.tsx` chamava a API diretamente. Corrigido
  nesta fase.
- `stop-close` é novo e fecha pelo **mesmo `deviceEventId` usado na
  abertura** (rota `close-by-device-event`), não pelo id do servidor — por
  isso funciona mesmo quando a própria abertura ainda está pendente na
  fila (a fila processa em ordem, `flushQueue` nunca reordena).
- `activeStopPointer.ts` (novo, mesmo padrão de `checklistPointer.ts`)
  persiste `{ tripId, deviceEventId, type, startedAt }` localmente —
  garante que fechar/reabrir o app não perde o estado de "há uma parada em
  andamento" enquanto a abertura não sincronizou.
- Testado em `syncQueue.test.ts` (fila) e `StopsScreen.test.tsx` (tela,
  incluindo o cenário de fechar o app e reabrir com a abertura ainda
  offline).

## 8. Integração futura com GPS (não implementada nesta fase)

`TripStopSource.GPS` existe no enum para permitir, no futuro, detecção
automática de parada por geolocalização (veículo parado por X minutos).
**Não implementado nesta fase** porque o sistema ainda não possui uma fonte
de GPS contínua e confiável o suficiente para gerar esses eventos sem
inventar dado. A arquitetura já suporta a evolução: basta um novo
`source: GPS` sendo gravado por um job/serviço que hoje não existe — nenhuma
mudança de schema ou de contrato seria necessária.

## 9. Analytics (`GET /fleet-operations/stops`)

| Campo | Cálculo | `available`/`null` quando |
|---|---|---|
| `totalStops` | `count` (exclui `cancelledAt != null`) | — |
| `totalDurationMinutes` | `sum(durationMinutes)` | — |
| `averageDurationMinutes` | `totalDurationMinutes / totalStops` | `null` se `totalStops = 0` |
| `maxDurationMinutes` / `minDurationMinutes` **[novo]** | `aggregate._max`/`_min(durationMinutes)` | `null` se não há nenhuma parada `COMPLETED` no escopo (Prisma ignora `null` automaticamente — uma parada `OPEN` nunca entra nesta conta) |
| `byType` | `groupBy(['type'])` | lista vazia se não há dado |
| `topVehiclesByDuration` | `groupBy(['vehicleId'])` + placas resolvidas em lote | lista vazia |
| `driverRanking` **[novo, Fase 44]** | `groupBy(['driverId'])` + nomes resolvidos em lote — ver seção 15 | lista vazia se não há dado |
| `durationAlerts` **[novo, Fase 44]** | paradas `COMPLETED` acima do limite configurado por tipo — ver seção 15 | lista vazia se não há dado/threshold |
| `monthlyTrend` | últimos 12 meses, sempre (ignora `startDate`/`endDate`, respeita `vehicleId`/`fleetId`) | — |

**Não implementado nesta fase** (documentado como limitação real, nunca
mascarado): percentual do tempo total em viagem vs. parado, tempo médio de
carga/descarga isolado por tipo específico (`LOADING`/`UNLOADING` já
aparecem em `byType`, mas não há campo dedicado), ranking por local/cliente
(não há agregação de `locationLabel`). Exigiriam uma fonte de dado (tempo
total em viagem por trecho, ou volume real de `locationLabel` preenchido)
que a auditoria não confirmou existir de forma confiável — evitado por
"nunca calcular percentual usando denominador inexistente" e "nunca
inventar dado". Ranking por motorista foi implementado na Fase 44 (seção 15).

## 10. `GET /trip-stops` — listagem administrativa

Retorna `TripStopListItemEntity` (estende `TripStopEntity` com
`vehiclePlate`, `driverName`, `tripReference`), resolvidos em **lote** (3
queries a mais no total — `vehicle.findMany`/`driver.findMany`/
`trip.findMany` com `id: { in: [...] }` — nunca 1 por linha). Bounded pelo
tamanho da página (`pageSize` máx. 100, ver `PaginationQueryDto`), nunca
cresce com o total de registros da tabela. Verificado por teste de
contagem real de queries em 10/25/50/100 veículos
(`trip-stops.e2e-spec.ts`).

## 11. Alertas (calculados em memória, nunca persistidos)

`STALLED_VEHICLE`: parada aberta (`endedAt = null`, `cancelledAt = null`)
há mais de `STALLED_STOP_MINUTES` (240 min, constante em
`fleet-operations-alerts.constants.ts`). `STOP_TIME_OUTLIER`: veículo com
tempo total parado no período acima de `STOP_TIME_OUTLIER_MULTIPLIER` (2x)
a média da frota.

**Alertas de duração longa por tipo** (`LONG_LOADING_TIME`,
`LONG_MAINTENANCE` etc. do pedido original) foram implementados na Fase 44
como `durationAlerts` (um único mecanismo genérico por tipo, não um enum
por categoria) — ver seção 15. **Ainda não implementado**: `EXCESSIVE_STOPS`
(quantidade excessiva de paradas por veículo/motorista no período) —
nenhum threshold de "quantidade normal de paradas" foi definido pelo
negócio.

## 12. Dados geolocalizados

`latitude`/`longitude` são sempre os que o driver-app enviou (ou `null`
quando não informado/parada administrativa retroativa) — nunca inventados.
Nenhum serviço de geocodificação/mapas foi criado nesta fase; o admin-web
mostra as coordenadas brutas (ou "Não informado") no detalhe da parada.

## 13. Testes

- **Unitários**: `trip-stop-duration.util.spec.ts` (cálculo/validação de
  duração), `trip-stop.mapper.spec.ts` (derivação de status).
- **E2E** (`trip-stops.e2e-spec.ts`, 18 casos, Postgres real): criação
  administrativa, duração calculada, validação de intervalo, idempotência
  (criação e fechamento), conflito de parada aberta, fechamento idempotente,
  cancelamento idempotente + bloqueio de fechamento pós-cancelamento,
  exclusão de cancelada dos indicadores, listagem paginada + filtros,
  integração com viagem (sem duplicar `Trip`), fechamento offline por
  `deviceEventId`, isolamento multi-tenant, RBAC (leitura e escrita),
  ausência de N+1 em 10/25/50/100 veículos (dashboard **e** listagem).
- **E2E existente estendido**: `fleet-operations.e2e-spec.ts` (assserções de
  `maxDurationMinutes`/`minDurationMinutes`).
- **Frontend** (`apps/admin-web`): `stops/page.test.tsx` reescrito (8 casos)
  — cards, tabela por tipo, tabela de paradas individuais, detalhe ao
  clicar na linha, estados vazio/erro/loading.
- **Driver App**: `syncQueue.test.ts` (+4 casos `stop-open`/`stop-close`,
  incluindo fechamento offline com abertura ainda pendente),
  `StopsScreen.test.tsx` (novo, 6 casos — seleção de motivo em 1 toque,
  abertura/fechamento online e offline, persistência ao reabrir a tela,
  listagem de paradas concluídas).

## 14. Limitações reais (documentadas, não mascaradas)

- Percentual do tempo total em parada vs. viagem: **indisponível** (sem
  fonte confiável de tempo total em viagem por veículo/período).
- Ranking por local/cliente: **indisponível** (`locationLabel` é texto
  livre opcional, sem volume/estrutura suficiente para agregação
  confiável nesta fase).
- Detecção automática de parada por GPS: **não implementada** (ver seção 8).
- Troca de motorista/veículo durante uma parada aberta: comportamento não
  modelado nesta fase (fora do escopo do domínio `TripStop` atual).
- Ranking por motorista e alertas de duração longa por tipo: **implementados
  na Fase 44** — ver seção 15. `EXCESSIVE_STOPS` (quantidade excessiva de
  paradas) continua **não implementado** (sem threshold de negócio
  definido).

## 15. Fase 44 — Ranking de motoristas + alertas de duração longa

Estende `FleetOperationsMetricsService`/`GET /fleet-operations/stops`
(nenhum service/endpoint novo). `TripStopsController` e o modelo `TripStop`
não foram alterados.

### 15.1 Ranking por motorista (`driverRanking`)

`groupBy(['driverId'], where, _count, _sum, _max, _min)` — **1 única query**
adicional, mesmo padrão já usado para veículo/tipo. Nomes resolvidos em
lote (`driver.findMany({ id: { in: [...] } })`). Ordenação:
`totalDurationMinutes` desc → empate: `stopsCount` desc → empate:
`averageDurationMinutes` desc → empate: `driverName` asc (`localeCompare`
pt-BR). Lógica pura e testada isoladamente em
`buildDriverStopRanking` (`fleet-operations-metrics.util.ts`). Motorista sem
nenhuma parada no escopo filtrado **não aparece** (nunca uma linha com 0
inventado). Paradas administrativas sem `driverId` nunca entram no ranking.
Sem corte de "top N" — o ranking completo é devolvido (volume de motoristas
por tenant é tipicamente pequeno).

### 15.2 Alertas de duração longa (`durationAlerts`)

Uma parada **`COMPLETED`** (nunca `OPEN`/`CANCELLED` — `buildStopWhere` já
exclui cancelada, e o filtro exige `endedAt` preenchido) cujo
`durationMinutes` excede o limite configurado **para o seu tipo**. Parada
ainda aberta nunca é avaliada aqui — o domínio não tem um conceito de
"duração em andamento" persistido (`durationMinutes` só existe após o
fechamento); quem cobre parada aberta longa é o alerta genérico já existente
`STALLED_VEHICLE` (seção 11), não alterado.

Implementação em `computeStopDurationAlerts`: pré-filtra por
`durationMinutes > MIN(limites configurados)` (1 query, nunca carrega a
tabela inteira) e refina em memória por tipo; placas/nomes/referência de
viagem resolvidos em lote (mesmo padrão de `GET /trip-stops`). Sem nenhum
limite configurado (nem padrão nem tenant), a query nem roda. Lista
ordenada por `excessMinutes` desc, limitada a
`LONG_STOP_DURATION_ALERTS_LIMIT` (20).

### 15.3 Thresholds configuráveis por tenant (sem tabela nova)

Reaproveita `TenantSettings.preferences` (coluna JSON já existente desde a
Fase 8, até então sem nenhum uso) — **nenhuma migration**. Chave
`preferences.stopDurationThresholdsMinutes: Record<TripStopType, number>`.
Lida/validada por `resolveStopDurationThresholds`
(`stop-duration-thresholds.util.ts`): mescla com os padrões
(`DEFAULT_STOP_DURATION_THRESHOLDS_MINUTES`), ignora chaves que não são um
`TripStopType` válido e valores que não são número positivo finito — um
`preferences` malformado nunca derruba o dashboard.

Padrões (`FUEL: 30`, `LOADING: 120`, `UNLOADING: 120`, `MAINTENANCE: 180`,
`REST: 60`, `DOCUMENTATION: 30`, minutos) são **valores de partida
configuráveis, não uma regra de negócio oficial da transportadora** — o
pedido original os deu como exemplo conceitual. Tipos sem exemplo de
negócio conhecido (`OTHER`, `WAITING_LOADING` etc.) **não têm padrão** —
só geram alerta se o tenant configurar um limite explicitamente.

Leitura/escrita usam o recurso REST **já existente** `GET`/`PATCH
/tenant-settings` (Fase 8, RBAC inalterado: leitura para qualquer usuário
autenticado, escrita restrita a `ADMIN`/`SUPER_ADMIN`) — nenhum endpoint
novo. `PATCH` substitui `preferences` por inteiro (comportamento já
existente); o admin-web mescla no cliente antes de enviar.

### 15.4 Filtros

`driverId`/`type`/`status` adicionados a `FleetOperationsQueryDto`
(aplicados **apenas** por `GET /fleet-operations/stops`, ignorados pelos
demais endpoints que compartilham o DTO — mesmo princípio já usado para
`fleetId` × fuel/tires). O ranking e os alertas usam o **mesmo**
`buildStopWhere` que os demais indicadores da página — nunca uma segunda
interpretação de período/escopo. Pedir `status=CANCELLED` sempre resulta em
0 linhas (contradição proposital com o `cancelledAt: null` fixo do
dashboard).

### 15.5 Frontend (`/operations/fleet/stops`)

Seções "🏆 Ranking de motoristas por tempo parado" e "⚠️ Alertas de
paradas" (com badge de contagem), tabelas via `DataTable` já existente.
Editor de limites (`StopDurationThresholdsEditor`,
`features/fleet-operations/`) — visível só para `ADMIN`/`SUPER_ADMIN`
(`ADMIN_ROLES`, mesmo RBAC do backend), campo vazio = sem limite
configurado. Filtro de motorista/tipo/status (já existente desde a Fase 43
para a tabela de paradas individuais) passou a alimentar **também** a
query do dashboard (ranking/alertas incluídos), unificando o escopo.
Dashboard executivo (`/operations/fleet`) ganhou "Motorista mais parado" e
"Alertas de duração longa" na seção "Paradas" já existente.

### 15.6 Performance

Nenhuma consulta por linha/motorista/parada introduzida — todas as novas
queries (`groupBy` por motorista, `tenantSettings.findUnique`, candidatos a
alerta, resolução em lote de nomes/placas/viagens) são O(1) em relação ao
volume de veículos/paradas. Verificado reexecutando o teste de contagem
real de queries já existente (`trip-stops.e2e-spec.ts`, 10/25/50/100
veículos) — sem regressão.

### 15.7 Limitações desta fase

- Sem drill-down dedicado a partir do ranking/alertas (clique não abre
  detalhe) — a tabela de paradas individuais (já existente) permite filtrar
  por motorista para chegar ao mesmo dado.
- `EXCESSIVE_STOPS` (quantidade excessiva de paradas) não implementado —
  sem threshold de negócio definido.
- Motorista não recebe os alertas no Driver App (fora do escopo — são
  informações gerenciais, conforme o pedido).
