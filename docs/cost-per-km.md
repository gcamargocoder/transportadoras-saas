# Custo por Km (Fase 85)

## 1. Contexto e auditoria prévia

Antes de escrever qualquer código, foram auditados: `packages/database/prisma/schema.prisma`,
`apps/api/src/fleet-operations/services/fleet-operations-metrics.service.ts` (em especial
`computeCosts()`, já responsável por todos os custos REALIZADOS da frota desde a Fase 40),
`apps/api/src/fleet-operations/utils/maintenance-cost-per-km.util.ts` (Fase 45, já calculava
custo/km especificamente para manutenção) e `apps/api/src/common/utils/fuel-consumption.util.ts`
(Fase 18, mesma ideia de distância via odômetro para consumo de combustível).

**Conclusão da auditoria**: não havia nenhum endpoint nem cálculo de custo/km em nível de
frota inteira, mas **duas peças-chave já existiam e foram reaproveitadas integralmente**:

1. `computeCosts()` já agregava, sem dupla contagem, todos os custos operacionais
   (combustível, manutenção, pneus, pedágio, outras despesas) — a Fase 85 **não recalcula
   nenhum custo**, apenas divide os totais já existentes pela distância.
2. A metodologia de distância "maior menos menor odômetro, por veículo, somada entre
   veículos antes de dividir" já existia em `maintenance-cost-per-km.util.ts` (Fase 45) —
   generalizada nesta fase para um utilitário compartilhado (seção 3).

**Fato crítico confirmado na auditoria (e já documentado em `vehicle-management.md`)**:
`TripMetrics.actualDistanceKm` **nunca é escrito por nenhum service** em todo o
`apps/api/src`. Por isso essa coluna nunca é usada como fonte de distância — usar um campo
que nunca é populado inventaria uma distância que não existe.

## 2. Origem de cada custo (reaproveitado, Fase 40 — inalterado)

| Custo | Fonte | Observação |
|---|---|---|
| Combustível | `FuelSupply.totalAmount` | Soma direta, sem estimativa |
| Manutenção | `VehicleMaintenance.totalCost` | Inclui peças consumidas (Fase 83 — `PartsService.consumePartsForMaintenance`) e mão de obra |
| Pneus | `Tire.purchasePrice` + `TireRetread.cost` | Custo de aquisição/recapagem, não depreciação |
| Pedágio | `TollTransaction.chargedAmount` | Cobrança **real**, nunca `RoutePlanToll.estimatedAmount` |
| Outras despesas | `TripExpense.amount` | **Exclui** categorias `FUEL`/`MAINTENANCE`/`TIRES` (já contabilizadas pela fonte primária acima) — evita dupla contagem |

Nenhuma dessas fontes foi duplicada ou reescrita. O custo/km é uma **projeção/divisão**
sobre os mesmos totais que já alimentam `GET /fleet-operations/costs`.

## 3. Origem da distância (novo nesta fase)

`apps/api/src/common/utils/vehicle-distance.util.ts` (novo, extraído/generalizado de
`maintenance-cost-per-km.util.ts`):

```
distanciaPorVeiculo = max(odômetro) - min(odômetro)   // só se houver >= 2 leituras
distanciaTotal = soma da distância de cada veículo qualificado
```

Leituras de odômetro usadas (pool, de **duas fontes já existentes**, nunca uma terceira
tabela nova):
- `FuelSupply.odometerKm` (todo abastecimento já registra o odômetro no momento do
  abastecimento)
- `VehicleMaintenance.odometerKm` (odômetro na abertura da OS) e
  `VehicleMaintenance.completionOdometerKm` (odômetro na conclusão, Fase 82)

**Por que somar a distância por veículo antes de dividir, e não fazer uma média de
razões**: um veículo com 10.000 km rodados e custo de R$5.000 e outro com 100 km e
R$50 devem produzir R$0,50/km consolidado (5.050 / 10.100), não a média simples de
(0,50 + 0,50)/2 — que coincide aqui mas divergiria caso os veículos tivessem
proporções diferentes. Mesma decisão já validada e testada desde a Fase 45.

## 4. Fórmula

```
custo/km (frota)      = totalCost      / distanciaTotal
combustível/km         = fuelCost       / distanciaTotal
manutenção/km          = maintenanceCost/ distanciaTotal
pneus/km               = tireCost       / distanciaTotal
pedágio/km             = tollCost       / distanciaTotal
outras despesas/km     = otherCost      / distanciaTotal
```

Todas as categorias usam o **mesmo denominador** (`distanciaTotal`), garantindo que a
soma das categorias por km sempre bate com o custo/km total (verificado pelo teste
"componentes do custo/km somam o valor total").

Para o ranking por veículo (`topVehiclesByCostPerKm`), o divisor é a distância
**daquele veículo especificamente** (não a distância total da frota), e só entram
veículos com **custo conhecido E distância qualificada** simultaneamente — um veículo
com custo mas sem >= 2 leituras de odômetro fica de fora do ranking (nunca usa a
distância de outro veículo por engano).

## 5. Dados insuficientes — nunca um valor inventado

Segue o padrão `available`/`reason` já usado em outras métricas incertas do sistema
(ex.: `FleetFuelCostPerKmEntity`). Quando **nenhum veículo do escopo filtrado** tem pelo
menos 2 leituras de odômetro (de qualquer uma das duas fontes), `costPerKm.available =
false`, com um `reason` textual explicando o motivo, e todos os valores numéricos
(`value`, `distanceKm`, `fuelCostPerKm`, etc.) retornam `null` — nunca `0` ou uma
distância/custo estimados.

Odômetros iguais entre duas leituras (distância calculada = 0) também são excluídos —
nunca uma divisão por zero, nunca `Infinity`.

## 6. Prevenção de dupla contagem

O custo/km reaproveita **os mesmos totais já calculados por `computeCosts()`** — não
soma nada em paralelo. A prevenção de dupla contagem específica de "outras despesas"
(exclusão de `FUEL`/`MAINTENANCE`/`TIRES` de `TripExpense`) já existia desde a Fase 40 e
não foi alterada. O custo de manutenção usado no custo/km é o mesmo `VehicleMaintenance.totalCost`
que já inclui peças consumidas desde a Fase 83 — não há um segundo cálculo de custo de
peças.

## 7. Escopo por veículo/frota/período

`GET /fleet-operations/costs` (endpoint existente, **nenhum endpoint novo**) já aceita
`vehicleId`, `fleetId`, `startDate`, `endDate` — os mesmos filtros agora também recortam
as leituras de odômetro usadas no cálculo de distância (mesmo `fuelWhere`/`maintenanceWhere`
já usados para os custos, reaproveitados sem duplicar lógica de filtro).

## 8. Nenhuma persistência nova

`costPerKm` é sempre calculado on-the-fly a partir de dados já persistidos
(`FuelSupply`, `VehicleMaintenance`, `TollTransaction`, `TripExpense`, `Tire`,
`TireRetread`) — nenhuma tabela, coluna ou ledger financeiro novo. `FleetCostPerKmEntity`
é um DTO de resposta, não uma entidade de banco.

## 9. Separação operacional × financeiro

`costPerKm` é explicitamente um indicador **operacional** — não cria, altera ou lê
`FinancialTransaction`/`FinancialAccount`, não representa pagamento nem é uma conta a
pagar/receber. Uso futuro em dashboards executivos ou no módulo financeiro (ex.: como
insumo de precificação de frete) é responsabilidade de fases futuras, não desta.

## 10. Arquivos criados/alterados

**Criados**:
- `apps/api/src/common/utils/vehicle-distance.util.ts` — `computeVehicleDistancesKm`/`sumVehicleDistancesKm`, extraído/generalizado de `maintenance-cost-per-km.util.ts`
- `apps/api/src/common/utils/vehicle-distance.util.spec.ts` (8 testes)
- `apps/api/test/cost-per-km.e2e-spec.ts` (8 testes e2e)
- `docs/cost-per-km.md` (este arquivo)

**Alterados**:
- `apps/api/src/fleet-operations/utils/maintenance-cost-per-km.util.ts` — passa a reutilizar `computeVehicleDistancesKm` (comportamento externo idêntico, confirmado pelos 6 testes originais sem alteração)
- `apps/api/src/fleet-operations/entities/fleet-costs.entity.ts` — novo `FleetCostPerKmEntity` + campos `costPerKm`/`topVehiclesByCostPerKm` em `FleetCostsEntity`
- `apps/api/src/fleet-operations/services/fleet-operations-metrics.service.ts` — `computeCosts()` passa a calcular distância (2 queries adicionais no mesmo `Promise.all` já existente) e o custo/km
- `apps/admin-web/src/types/entities.ts` — espelho TS de `FleetCostPerKmEntity`
- `apps/admin-web/src/app/(app)/operations/fleet/costs/page.tsx` — seção "Custo por km" (StatCards reaproveitados) + ranking (reaproveita `BarRankingChart`)
- `apps/admin-web/src/app/(app)/operations/fleet/costs/page.test.tsx` e `.../operations/fleet/page.test.tsx` — mocks/fixtures atualizados com os novos campos + 2 testes novos

**Migrations**: nenhuma — nenhuma alteração de schema.

## 11. APIs

Nenhum endpoint novo. `GET /fleet-operations/costs` (existente desde a Fase 40) passa a
retornar dois campos adicionais no payload: `costPerKm` (`FleetCostPerKmEntity`) e
`topVehiclesByCostPerKm` (`FleetVehicleRankingEntryEntity[]`, `value` = custo/km,
`count` = distância em km). RBAC inalterado (`FLEET_OPERATIONS_READ_ROLES`, Fase 40).

## 12. Performance / N+1

A distância é calculada a partir de 2 queries agregadas adicionais
(`fuelSupply.findMany`/`vehicleMaintenance.findMany` com `select` mínimo), inseridas no
mesmo `Promise.all` que já buscava os outros dados de custo — **não adiciona uma query
por veículo**. Teste e2e dedicado (`performance / N+1`) confirma que o número de queries
de `GET /fleet-operations/costs` não cresce entre 3 e 15 veículos com abastecimento.

## 13. Testes executados

- **Unitário** (novo): `vehicle-distance.util.spec.ts` — 8/8.
- **Unitário** (regressão): `maintenance-cost-per-km.util.spec.ts` — 6/6, comportamento
  externo preservado após o refactor.
- **E2e** (novo): `cost-per-km.e2e-spec.ts` — 8/8 (cálculo via odômetro, indisponibilidade
  com 1 leitura, divisão por zero nunca ocorre, composição das categorias soma o total,
  manutenção com peças consumidas entra no custo/km, isolamento multi-tenant, RBAC,
  N+1).
- **E2e** (regressão): `fleet-operations.e2e-spec.ts` — 31/31, sem alteração no arquivo de
  teste (campos aditivos não quebram nenhuma asserção existente).
- **Frontend**: `costs/page.test.tsx` — 9/9 (7 existentes + 2 novos); `fleet/page.test.tsx`
  — 16/16 (fixture atualizada).
- **Typecheck**: `apps/api` e `apps/admin-web` (`tsc --noEmit`) — limpos.
- **Lint**: todos os arquivos alterados/criados — limpo.

Não foi executada a suíte completa do monorepo nem build — sem alteração de schema, o
escopo desta fase não justificava uma regressão ampla.

## 14. Limitações reais

- O `costPerKm.value` (custo/km da frota) usa o `totalCost` **global** do filtro
  aplicado, mesmo que apenas um subconjunto dos veículos tenha distância qualificada —
  é uma decisão deliberada (custo real, dividido pela melhor distância real disponível
  no agregado) e não a alternativa mais estrita (só somar custo dos veículos que também
  têm distância), que é a usada em `topVehiclesByCostPerKm`. Essa divergência de
  metodologia entre o indicador agregado e o ranking por veículo é intencional e deve
  ser considerada ao interpretar os dois números lado a lado.
- Pneus e outras despesas não são quebrados por veículo no ranking — mesma limitação
  pré-existente de `topVehiclesByCost` (Fase 40), não introduzida nesta fase.
- Veículos sem nenhum abastecimento nem manutenção registrada no período nunca têm
  distância conhecida — não há fallback (hodômetro do cadastro do veículo não é uma
  série temporal, não permite calcular "km rodados no período").
- Custo/km por período de tendência mensal (equivalente ao `monthlyTrend` de custo
  total) não foi implementado — o pedido da Fase 85 pedia granularidade por
  veículo/frota/período de filtro, não uma série temporal adicional; ampliar exigiria
  repetir o cálculo de distância por mês, fora do escopo desta fase.
