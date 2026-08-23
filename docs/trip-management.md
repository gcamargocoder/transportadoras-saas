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

## 2. Pré-requisitos de início (`assertCanStart`) — sem alteração

Já bloqueava, antes desta fase: motorista inativo, motorista já em outra
viagem ativa, veículo inexistente, veículo em `MAINTENANCE`, veículo não
`ACTIVE`, veículo já em outra viagem ativa. Reaproveitado integralmente —
nenhuma validação nova foi adicionada aqui (checklist/documentos
permanecem sem obrigatoriedade de bloqueio, pois o projeto não tem essa
regra de negócio definida; inventar isso violaria a seção 3 do pedido,
"não criar obrigação de documento fiscal onde o projeto ainda não possui
regra de obrigatoriedade").

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
