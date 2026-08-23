# Resultado financeiro da viagem (Fase 71)

## Objetivo

Consolidar em um único endpoint o "resultado financeiro real" da viagem —
quanto faturou, quanto recebeu, quanto custou operar e qual foi a margem —
**reaproveitando integralmente** o financeiro já existente (Fases 17/51/59/
60/66). Nenhum motor de cálculo novo foi criado; este endpoint é uma
projeção calculada ao vivo sobre dados já persistidos em outros módulos.

## Endpoint

`GET /trips/:id/financial-result`

- Controller: `TripsController.findFinancialResult` (`apps/api/src/trips/controllers/trips.controller.ts`).
- Serviço: `TripSettlementsService.getFinancialResult` (`apps/api/src/trip-settlements/services/trip-settlements.service.ts`).
- Entity: `TripFinancialResultEntity` (`apps/api/src/trip-settlements/entities/trip-financial-result.entity.ts`).
- RBAC: `TRIP_SETTLEMENT_READ_ROLES` (SUPER_ADMIN, ADMIN, MANAGER, OPERATOR,
  DISPATCHER, AUDITOR) — mesmo grupo de `/trips/:id/settlement` e
  `/trips/:id/financial-dashboard`. Motorista (Driver App) nunca tem acesso.
- Nunca persistido: calculado ao vivo a cada chamada, a partir das fontes
  abaixo. Número fixo de queries (nunca por item): 1 (trip) + 5 (agregações
  do dashboard) + 3 (freight/billing/metrics, em paralelo) = 9 queries
  fixas por chamada.

## Fontes de verdade (nada foi duplicado)

| Campo | Fonte | Onde já era calculado |
|---|---|---|
| `fuelCost`, `tollCost`, `expenseCost` (=`totalExpenses`), `totalCost` | `TripSettlementsService.getFinancialDashboard` | Fase 51/66 — mesma agregação usada por `TripMetrics.actualTotalCost` e por `FreightPricingService.getProfitability` |
| `contractedRevenue` | `TripFreight`: `contractedAmount → finalAmount → estimatedAmount` (`resolveTripFreightBestAmount`) | Fase 59, mesma prioridade usada pelo faturamento operacional (Fase 60) |
| `invoicedRevenue` | `TripBilling.invoicedAmount` | Fase 60 |
| `receivedRevenue` | `TripBilling.invoicedAmount` quando `status = PAID`, senão `0` | Fase 60 (status `PAID`, confirmação manual) |
| `distanceKm` | `TripMetrics.actualDistanceKm` | Fase 66 |

Nenhum custo é resomado com uma regra diferente da já existente em
`getFinancialDashboard` — `fuelCost`/`tollCost`/`expenseCost` deste
endpoint **são exatamente** os mesmos campos já expostos em
`GET /trips/:id/financial-dashboard` (`fuelCost`, `tollCost`,
`totalExpenses`).

## Fórmulas

```
totalCost          = fuelCost + tollCost + expenseCost
operatingResult     = contractedRevenue - totalCost        (null se contractedRevenue indisponível)
invoicedResult      = invoicedRevenue - totalCost
receivedResult      = receivedRevenue - totalCost

profitMarginPercent    = (operatingResult / contractedRevenue) * 100   (null se contractedRevenue <= 0 ou indisponível)
invoicedMarginPercent  = (invoicedResult / invoicedRevenue) * 100      (null se invoicedRevenue <= 0)
receivedMarginPercent  = (receivedResult / receivedRevenue) * 100      (null se receivedRevenue <= 0)

revenuePerKm = contractedRevenue / distanceKm   (null se distanceKm ausente/0 ou contractedRevenue indisponível)
costPerKm    = totalCost / distanceKm           (null se distanceKm ausente/0)
profitPerKm  = operatingResult / distanceKm     (null se distanceKm ausente/0 ou operatingResult indisponível)
```

## Tratamento de null / zero (nunca inventa valor)

- **`contractedRevenue = null`**: viagem sem `TripFreight` aplicado, ou
  aplicado sem nenhum valor calculado. `operatingResult`,
  `profitMarginPercent`, `revenuePerKm` e `profitPerKm` também ficam `null`
  em cascata — nunca um valor estimado no lugar.
- **`distanceKm = null` (ou `0`)**: viagem ainda não concluída com odômetro
  final informado (ver Fase 66 — `actualDistanceKm` só é calculado quando
  há `initialOdometerKm` e `finalOdometerKm` na conclusão). Todas as
  métricas por km ficam `null`, nunca dividido por zero.
- **`invoicedRevenue = 0` / `receivedRevenue = 0`**: viagem sem nenhum
  faturamento iniciado (`TripBilling` inexistente) ou ainda não confirmado
  como recebido. `invoicedMarginPercent`/`receivedMarginPercent` ficam
  `null` (nunca `0%` mascarando ausência de receita).

## Regra de pedágio (sem dupla contagem)

`tollCost` soma exclusivamente `TollTransaction.chargedAmount` vinculado à
viagem (fonte de verdade real de pedágio, `tripId` sempre presente no
schema). A categoria `TOLL_EXTRA` de `TripExpense` é **conceitualmente
distinta** (pedágio não coberto pela tag, lançado manualmente como
despesa) e entra apenas em `expenseCost` — nunca somada de novo em
`tollCost`. Coberto pelo teste "nunca soma o pedágio em duplicidade" em
`trip-finance.e2e-spec.ts`.

## Regra de combustível

`fuelCost` soma exclusivamente `FuelSupply.totalAmount` vinculado à
viagem (`tripId`). Uma despesa manual com categoria `FUEL` em
`TripExpense` (ex.: abastecimento registrado como despesa avulsa, sem
passar pelo fluxo de `FuelSupply`) entra em `expenseCost`, não em
`fuelCost` — mesma limitação já existente em `getFinancialDashboard`
desde a Fase 51 (não é um comportamento novo desta fase).

## Regra de despesas

`expenseCost` = soma de `TripExpense.amount` com `status = APPROVED`, em
**todas** as categorias (mesma regra de `getFinancialDashboard`/Fase 51).
Despesas `PENDING`/`REJECTED`/`CANCELLED` nunca entram no custo.

## Diferença entre "resultado" e "saldo a receber"

`operatingResult`/`invoicedResult` refletem o resultado **econômico** da
viagem (o que foi contratado/faturado contra o custo real), enquanto
`receivedResult` reflete o que **efetivamente entrou** (gate pelo status
`PAID`). Uma viagem pode ter `invoicedResult` positivo com `receivedResult`
negativo (ou ambos positivos, mas de magnitudes diferentes) enquanto o
faturamento não foi confirmado como pago — isso é esperado e não é um bug.

## Limitações conhecidas

1. **`receivedRevenue` depende de confirmação manual.** O projeto não tem
   nenhuma integração de gateway de pagamento (Stripe/PIX/débito
   automático) — `TripBilling.status = PAID` é sempre setado por um
   humano via `PATCH /operational-billing/trips/:tripId`. Enquanto isso
   não acontece, `receivedRevenue` permanece `0` mesmo que o cliente já
   tenha pago na prática. Isto é diferente da semântica de
   `TripBillingEntity.receivedAmount` (Fase 60), que sempre espelha
   `invoicedAmount` independente do status — usada ali por ser a
   "situação de faturamento", não um resultado financeiro. Este endpoint
   propositalmente diverge desse campo para refletir de fato "quanto foi
   recebido" em vez de "quanto foi faturado".
2. **`contractedRevenue` cai para o valor estimado quando não há
   negociação registrada.** Segue a mesma prioridade já usada em toda a
   Fase 59/60 (`contractedAmount → finalAmount → estimatedAmount`); não é
   uma limitação nova desta fase.
3. **`fuelCost`/`expenseCost` podem divergir da intenção do usuário** se a
   operação lançar o mesmo abastecimento tanto como `FuelSupply` quanto
   como `TripExpense` categoria `FUEL` — nesse caso ambos entram
   (`fuelCost` + `expenseCost`), pois não há vínculo no schema que
   permita deduplicar automaticamente. Este é um comportamento herdado de
   `getFinancialDashboard` desde a Fase 51 (não introduzido nesta fase);
   corrigi-lo exigiria mudar a regra de negócio de um endpoint já usado
   por `TripMetrics.actualTotalCost` e por `FreightPricingService.
   getProfitability`, fora do escopo de consolidação desta fase.
4. **`totalCost` não inclui manutenção** — `VehicleMaintenance` não tem
   vínculo com `Trip` no schema atual (mesma limitação documentada em
   `TripFinancialDashboardEntity.maintenanceCost`, sempre `null` ali).

## Frontend

`FinancialTab` (`apps/admin-web/src/features/trips/tabs/financial-tab.tsx`),
aba "Financeiro" existente na página `/trips/[id]` — nova seção "Resultado
financeiro" adicionada acima do card de "Acerto da viagem" já existente.
Nenhuma aba nova, nenhuma página nova, nenhum componente visual novo
(reaproveita `Card`/`CardHeader`/`CardBody`/`StatCard`).

## Dashboard operacional (`/operations/fleet`)

Não alterado nesta fase — `/operations/fleet/financial` já expõe receita
total, custo total, resultado e margem média das viagens no escopo
filtrado (`FleetFinancialDashboardEntity`, Fase 51), cobrindo o pedido da
seção 11 sem necessidade de nenhuma mudança.

## Driver App

Não alterado. O Driver App não expõe nenhuma rota financeira administrativa
(mesmo padrão já estabelecido pelos módulos de faturamento/frete/
fechamento).
