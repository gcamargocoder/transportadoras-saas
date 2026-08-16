# Gestão Financeira Operacional da Transportadora (Fase 51)

Centraliza receitas, despesas, adiantamentos e o custo/resultado por viagem,
veículo, frota, cliente e motorista — **sem criar nenhum domínio novo**.
Receitas (`TripRevenue`), despesas (`TripExpense`), adiantamentos
(`TripAdvance`) e custo realizado (`FuelSupply`/`VehicleMaintenance`/
`Tire`+`TireRetread`/`TollTransaction`) já existiam integralmente (Fases
17-20, 34); esta fase adiciona apenas **consolidação** sobre eles:

1. `TripSettlementsService.getFinancialDashboard()` (`GET
   /trips/:id/financial-dashboard`, Fase 34) estendido — adiciona
   `fuelCost`/`tollCost`/`maintenanceCost`/`totalCost`/`grossResult`/
   `finalResult` aos campos `profit`/`netResult`/`marginPercentage`
   já existentes (**nunca alterados** — servem o fechamento financeiro
   do motorista via `TripSettlement`, uso distinto).
2. `FleetOperationsMetricsService.getFinancialDashboard()` (`GET
   /fleet-operations/financial`, novo método na mesma service class das
   Fases 40-45) — visão financeira **da frota inteira**, com o mesmo
   escopo de filtro dos demais dashboards da série.

## 1. `GET /trips/:id/financial-dashboard` — campos novos

| Campo | Fonte | Cálculo | Disponibilidade |
|---|---|---|---|
| `fuelCost` | `FuelSupply.totalAmount` | `_sum` onde `tripId` = esta viagem (campo opcional, mas quando presente é um vínculo real e confiável) | ✅ |
| `tollCost` | `TollTransaction.chargedAmount` | `_sum` onde `tripId` = esta viagem (`tripId` é **obrigatório** no schema — sempre confiável, nunca `RoutePlanToll.estimatedAmount`) | ✅ |
| `maintenanceCost` | — | — | ❌ **Sempre `null`** — `VehicleMaintenance` não tem campo `tripId` no schema (confirmado por auditoria direta); nunca estimado/inferido por proximidade de data |
| `totalCost` | `totalExpenses + fuelCost + tollCost` | `maintenanceCost` fica de fora da soma por ser indisponível — nunca um `0` mascarado | ✅ |
| `grossResult` | `totalRevenue − totalCost` | | ✅ |
| `finalResult` | `grossResult − totalAdvances` | | ✅ |

`profit`/`netResult`/`marginPercentage`/`entryCount`/`largestRevenue`/
`largestExpense` (Fase 34) permanecem exatamente como estavam — `profit`
usa só `totalExpenses` (sem fuel/toll), é o número usado no fechamento
(`TripSettlement`) e continua sendo a fonte de verdade para esse fluxo.
Os campos novos desta fase são uma visão **operacional mais completa**,
paralela e aditiva, nunca um substituto.

## 2. `GET /fleet-operations/financial`

Mesma classe (`FleetOperationsMetricsService`) e mesmo controller
(`FleetOperationsController`) das Fases 40-45 — método e rota novos,
nenhum service/endpoint paralelo. RBAC: `FLEET_OPERATIONS_READ_ROLES`
(mesmo grupo amplo dos demais 10 dashboards da série; `DRIVER` bloqueado).
Filtros: `FleetOperationsQueryDto` (mesmo DTO compartilhado), com 4 campos
novos aplicados **somente** por esta rota — `customerId`, `revenueCategory`,
`expenseCategory`, `expenseStatus` (além de `startDate`/`endDate`/
`vehicleId`/`fleetId`/`driverId` já existentes). Todos os indicadores/
rankings/detalhamentos da resposta usam o **mesmo** escopo de filtro.

### `summary`

| Campo | Fonte | Cálculo |
|---|---|---|
| `totalRevenue` | `TripRevenue.amount` | `_sum` no escopo filtrado |
| `totalExpenses` | `TripExpense.amount` | `_sum`, `status` = `expenseStatus` do filtro (default `APPROVED`), **qualquer categoria** (mais amplo que `otherCost` de `GET /fleet-operations/costs`, que exclui `FUEL`/`MAINTENANCE`/`TIRES` por já terem fonte primária própria) |
| `totalCost` | `FleetCostsEntity.totalCost` | **Reaproveitado literalmente** de `computeCosts()` (mesmo método privado já usado por `GET /fleet-operations/costs`) — nunca recalculado em paralelo |
| `totalAdvances` | `TripAdvance.amount` | `_sum` no escopo filtrado |
| `pendingExpenses` | `TripExpense.amount` | `_sum`, `status = PENDING` sempre (independente do `expenseStatus` do filtro) — nunca contado em `totalCost`/`result` |
| `result` | `totalRevenue − totalCost` | |
| `marginPercent` | `(result / totalRevenue) × 100` | `null` quando `totalRevenue = 0` — nunca `0` falso |

### Evolução mensal, rankings, detalhamento

- `monthlyRevenue`/`monthlyExpenses` — últimos 12 meses sempre (ignora
  `startDate`/`endDate`, respeita os demais filtros), via
  `aggregateMonthlySeries` (mesmo util de todo o módulo). `monthlyResult`
  é a subtração ponto a ponto, sem query adicional.
- `topVehiclesByRevenue` — `TripRevenue` não tem `vehicleId` direto;
  junção via `trip.composition.vehicleId` (1 `findMany` projetando só o
  necessário, reduzido em memória — mesmo padrão já usado por
  `getOperationalIndicators`, nunca 1 query por veículo).
- `topVehiclesByExpense`/`topExpenseCategories`/`costByFleet` —
  reaproveitados diretamente do retorno de `computeCosts()` (mesmos
  valores de `GET /fleet-operations/costs`, comprovado por teste que
  compara os dois endpoints).
- `topTripsByCost`/`bestTripsByResult`/`worstTripsByResult` — **custo por
  viagem aqui é só `TripExpense`** (não soma fuel/toll por viagem, o que
  exigiria 2 `groupBy` adicionais por `tripId`); para o custo completo de
  UMA viagem específica (incl. combustível/pedágio), usar `GET
  /trips/:id/financial-dashboard` (seção 1). Rótulo de cada viagem
  (`"origem → destino"`) resolvido em 1 única query em lote
  (`resolveTripLabels`), nunca 1 por viagem.
- `revenueByFleet` — mesmo princípio de `costByFleet`: `fleetId = null`
  vira o balde explícito "Sem frota".
- `revenueByCustomer` — `TripRevenue.customerId` é opcional;
  `customerId = null` vira "Sem cliente".
- `byDriver` — despesas via `TripExpense.driverId` (opcional, sempre
  derivado da viagem no momento da criação) + adiantamentos via
  `TripAdvance.driverId` (obrigatório).

## 3. Performance

Toda a consolidação roda em `Promise.all` com um número fixo de queries
independente do volume de dados (mesmo princípio de todo o módulo desde a
Fase 40) — 5 queries principais (`computeCosts` + `TripRevenue.findMany` +
`TripExpense.findMany` + `TripExpense.aggregate` (pendentes) +
`TripAdvance.findMany`) + até 2 lookups em lote (clientes/motoristas
citados nos rankings) + 1 lookup em lote para rótulos de viagem ranqueada.
Testado com 10 e 50 registros (`fleet-operations-financial.e2e-spec.ts`,
contagem real de queries via `$extends`) — sem crescimento.

## 4. Frontend

Nova página `/operations/fleet/financial`, aba "Financeiro" adicionada à
barra compartilhada (`fleet-section-tabs.tsx`, agora 10 abas). Reaproveita
`useFleetOperationsFilters` (período/veículo/frota) + `EntitySelect`
(mesmo componente de `FleetFilters`) para os filtros novos de
cliente/motorista/categoria/status — filtro próprio construído com os
mesmos átomos (`DatePicker`/`FormField`/`FilterBar`/`Select`) em vez de
estender o hook/componente compartilhado, para não arriscar as outras 9
páginas que os usam. `StatCard`×7 para o resumo, `MonthlyChartCard`×3 para
evolução, `BarRankingChart`×6 para os rankings, `Card`+lista para os 4
detalhamentos — mesmos componentes já usados em `/operations/fleet/costs`.
Margem `null` renderiza "—", nunca "0%".

## 5. Testes

- **E2e** (`fleet-operations-financial.e2e-spec.ts`, novo, 9 cenários):
  estado vazio, cálculo consolidado (fixture com valores exatos, cobrindo
  veículo/frota/cliente/motorista/viagem), `totalCost` idêntico ao de
  `GET /fleet-operations/costs`, filtros (vehicleId/fleetId/driverId/
  customerId/categoria/status/período), isolamento multi-tenant (incl.
  tentativa de forjar `tenantId` via query string — rejeitada com 400 pelo
  `ValidationPipe` `forbidNonWhitelisted`), RBAC, `marginPercent = null`
  sem receita, empate em ranking de veículos, N+1 (10 vs. 50 registros).
- **E2e** (`trip-finance.e2e-spec.ts`, estendido): 2 cenários novos para
  `fuelCost`/`tollCost`/`maintenanceCost`/`totalCost`/`grossResult`/
  `finalResult` — com vínculo real (combustível + pedágio) e sem nenhum
  vínculo (tudo zero/`null`, nunca inventado).
- **Frontend**: typecheck/lint verificados; página nova segue o mesmo
  padrão já coberto pelos testes de `costs/page.test.tsx` e
  `fleet-section-tabs.test.tsx` (este último não assume uma lista fixa de
  abas, continuou passando sem alteração).

## 6. Fora de escopo / indisponível (declarado)

`maintenanceCost` por viagem — indisponível de forma permanente (schema
não tem o vínculo), documentado na seção 1, nunca estimado. Custo por
viagem nos rankings da frota (`topTripsByCost` etc.) é só `TripExpense` —
decisão de escopo para evitar 2 queries `groupBy` adicionais em uma rota
já com 5 queries paralelas; o dado completo por viagem já existe em `GET
/trips/:id/financial-dashboard`. Nenhuma outra limitação nova introduzida
por esta fase — as já documentadas em `fleet-operations-dashboard.md`
(custo médio por viagem como aproximação, km rodados indisponível, etc.)
continuam válidas e não são repetidas aqui.
