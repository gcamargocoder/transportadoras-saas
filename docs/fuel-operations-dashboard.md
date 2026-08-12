# Gestão Avançada de Abastecimento (Fase 42)

Camada de **leitura agregada** sobre o domínio de abastecimento já
existente (`FuelSupply`) — sem tabela nova, sem service paralelo, sem
duplicar `FuelSuppliesService`. Estende o mesmo read-model de
`FleetOperationsMetricsService` (Fases 40/41) com um endpoint novo:
breakdown por veículo/frota, 8 rankings, evolução mensal, comparação com
período anterior e alertas de abastecimento.

## 1. Arquitetura

```
FleetOperationsMetricsService
  └─ getFuelAnalytics()            -- [Fase 42] agregação própria (FuelSupply), Prisma direto
       ├─ reaproveita computeConsumptionTotals()   (common/utils/fuel-consumption.util.ts, Fase 18)
       ├─ reaproveita aggregateMonthlySeries()     (common/utils/monthly-series.util.ts, Fase 19)
       ├─ reaproveita computePreviousPeriodRange() (fleet-operations-metrics.util.ts, Fase 41)
       └─ nova função pura: detectOdometerRegression() (fuel-consumption.util.ts)
```

Não injeta `FuelSuppliesService` — como nas demais seções de
`FleetOperationsMetricsService` (custos, manutenção, paradas), a leitura é
Prisma direto porque o formato de agregação necessário
(`groupBy`/breakdown por veículo com pontos de hodômetro individuais) não
é exposto de forma reutilizável pelo service original. `FuelSuppliesService`
continua sendo a única fonte de escrita e a única dona da tabela
`FuelSupply` — este módulo nunca escreve, nunca duplica sua lógica de
criação/validação (`assertOdometerNotBelowVehicle` etc.), apenas lê os
mesmos dados com outra forma de agregação.

Todas as leituras usam o mesmo padrão O(1)-em-nº-de-veículos já
estabelecido nas Fases 40/41: 1 `findMany` projetando só os campos
necessários (`vehicleId`, `supplyDate`, `odometerKm`, `liters`,
`totalAmount`) para o escopo filtrado, agregação em memória por veículo, e
no máximo mais 2 lookups em lote (`vehicle.findMany`/`fleet.findMany`) —
nunca 1 query por veículo. Verificado formalmente por um e2e que conta
queries reais via `prisma.$extends` (ver seção 8).

## 2. Endpoint

| Rota | RBAC | Descrição |
|---|---|---|
| `GET /fleet-operations/fuel` | `FLEET_OPERATIONS_READ_ROLES` | Resumo, consumo/custo-por-km da frota, breakdown por veículo/frota, 8 rankings, evolução mensal (3 séries), comparação com período anterior, alertas |

Mesmo `FleetOperationsQueryDto` das demais rotas do módulo — sem mudança
de contrato (`startDate`/`endDate`/`vehicleId`/`fleetId`, todos opcionais).
Mesmo RBAC amplo (`SUPER_ADMIN/ADMIN/MANAGER/OPERATOR/DISPATCHER/AUDITOR`);
`DRIVER` bloqueado com 403.

## 3. Metodologia de consumo e custo por km — a distinção central desta fase

**"Custo de combustível por km" (implementado, disponível) ≠ "custo TOTAL
da frota por km" (Fase 41, ainda indisponível).**

| | Custo de combustível por km (esta fase) | Custo total da frota por km (Fase 41) |
|---|---|---|
| Fonte de distância | `FuelSupply.odometerKm` (hodômetro no momento de cada abastecimento) | `TripMetrics.actualDistanceKm` |
| Cobre quais custos | Só combustível | Combustível + manutenção + pneus + pedágio + outras despesas |
| Status | ✅ Real, calculado a partir de dados já gravados hoje | ❌ Indisponível — `TripMetrics.actualDistanceKm` **nunca é escrito por nenhum service** (auditado e confirmado na Fase 41, reconfirmado nesta fase) |

O cálculo (**mesma fórmula já usada por `FuelSuppliesService.getDashboard()`
desde a Fase 18**, aqui apenas estendida com breakdown por veículo/frota):

1. Para cada veículo no escopo filtrado, ordena os abastecimentos por
   `odometerKm` (não por data — ver nota sobre hodômetro regressivo abaixo).
2. `distância = último odometerKm − primeiro odometerKm` do veículo no
   escopo.
3. `litros consumidos = soma dos litros de todos os abastecimentos exceto
   o primeiro` (o primeiro abastecimento só estabelece o ponto de partida
   do hodômetro, não representa consumo de um trajeto medido).
4. `consumo (km/L) = distância / litros consumidos`.
5. `custo por km = custo total do veículo no escopo / distância`.

**Disponível somente com ≥ 2 abastecimentos no escopo filtrado** (menos
que isso não há segmento de distância medível). Caso contrário:
`{ value: null, available: false, reason: 'INSUFFICIENT_ODOMETER_READINGS' }`
— nunca `0`, nunca `NaN`, nunca uma estimativa. O mesmo par
`available`/`reason` é usado em 3 níveis: frota inteira (`consumption`/
`costPerKm` na raiz), por veículo (`vehicleBreakdown[].consumption`/
`costPerKm`) e por frota (`fleetBreakdown[].consumption`).

**Nunca assumido**: tanque cheio, litros do período = consumo do período,
ou qualquer valor de distância fora do que os próprios registros de
`odometerKm` sustentam.

## 4. Resumo (`summary`)

| Campo | Cálculo | Nulo quando |
|---|---|---|
| `totalCost`/`totalLiters`/`supplyCount` | Soma/contagem simples sobre os abastecimentos do escopo | Nunca (sempre `0` se vazio) |
| `averagePricePerLiter` | `totalCost / totalLiters` | `totalLiters = 0` → `null` |
| `averageCostPerSupply` | `totalCost / supplyCount` | `supplyCount = 0` → `null` |
| `vehiclesSupplied` | Nº de veículos distintos com ≥ 1 abastecimento no escopo | — |
| `fleetsSupplied` | Nº de **frotas reais** distintas (`Vehicle.fleetId` não nulo) representadas no escopo | O balde "Sem frota" (`fleetId=null`) **nunca conta** como frota real aqui |

## 5. Breakdown por veículo e por frota

`vehicleBreakdown`: todos os veículos com abastecimento no escopo,
ordenados por custo total decrescente (`rankPosition` = posição 1-indexada
nesse ranking). Cada linha inclui `consumption`/`costPerKm` individuais
(seção 3) e `hasOdometerAnomaly` (seção 7).

`fleetBreakdown`: mesmo agregado, reagrupado por `Vehicle.fleetId` em
memória (1 lookup em lote, sem query extra por veículo). `fleetId=null`
vira o balde explícito **"Sem frota"** — nunca omitido, nunca miscontado
como uma frota com nome.

## 6. Rankings (8, campo `rankings`)

| Ranking | `"value"` representa | Observação |
|---|---|---|
| `topCost`/`bottomCost` | Custo total (R$) | — |
| `topVolume`/`bottomVolume` | Litros | — |
| `bestConsumption`/`worstConsumption` | km/L | **Só inclui veículos com `consumption.available=true`** — um veículo sem dado suficiente nunca aparece artificialmente como "melhor"/"pior" consumo |
| `topPricePerLiter` | Preço médio/litro (R$) | — |
| `topSupplyCount` | Nº de abastecimentos | `"value"="count"` aqui de propósito, mesma convenção de `topVehiclesByTripCount` (Fase 41) |

## 7. Evolução mensal, período anterior e alertas

**Evolução mensal** (`monthlyTrendCost`/`monthlyTrendLiters`/
`monthlyTrendSupplyCount`): reaproveita `aggregateMonthlySeries` — sempre
os **últimos 12 meses a partir de agora**, ignora `startDate`/`endDate`
(mas respeita `vehicleId`/`fleetId`), mesmo comportamento de todas as
demais séries mensais do módulo.

**Período anterior** (`previousPeriod`): só calculado quando `startDate`
**e** `endDate` são ambos informados — reaproveita
`computePreviousPeriodRange`/`computeDeltaPercent` (Fase 41). `null` caso
contrário (nunca um período anterior inventado).

**Alertas** (computados em memória a cada request, nunca persistidos —
mesmo padrão da Fase 41; o model `Alert` real é de outro domínio):

| Tipo | Condição | Severidade |
|---|---|---|
| `FUEL_PRICE_OUTLIER` | Preço médio/litro do veículo > 1,2× a média da frota | Atenção |
| `CONSUMPTION_OUTLIER_HIGH` | Consumo (km/L) do veículo > 1,5× a média da frota (só veículos com consumo disponível) | Informativo |
| `CONSUMPTION_OUTLIER_LOW` | Consumo (km/L) do veículo < média da frota / 1,5 (só veículos com consumo disponível) | Atenção |
| `SUPPLY_VOLUME_OUTLIER` | Um abastecimento individual > 2× a média de litros/abastecimento da frota | Atenção |
| `ODOMETER_REGRESSION` | Hodômetro do veículo cai ao ordenar os abastecimentos por **data** (`supplyDate`), não por valor do odômetro | Crítico |

### Por que "registro sem quilometragem" não é implementado

O pedido original cogita um alerta para abastecimento sem hodômetro
registrado. **Não implementado** porque é estruturalmente impossível neste
domínio: `FuelSupply.odometerKm` é campo **obrigatório** no schema
(`packages/database/prisma/schema.prisma`), nunca nulo. Implementar esse
alerta seria código morto (uma condição que a própria API nunca permite
existir). Documentado aqui em vez de codificado como um `if` que nunca
dispara.

### Por que "abastecimentos incompatíveis entre si" não é um alerta próprio

Em vez de inventar uma categoria vaga, esse cenário fica coberto pela
combinação de dois alertas já concretos e verificáveis:
`ODOMETER_REGRESSION` (a sequência de abastecimentos é fisicamente
inconsistente) e os outliers de consumo/preço (um abastecimento
"destoante" dos demais do mesmo veículo). Um terceiro alerta genérico
"incompatível" duplicaria essas duas verificações sem adicionar sinal
novo.

### Detecção de hodômetro regressivo — por que precisou de uma função nova

`common/utils/fuel-consumption.util.ts` já ordenava abastecimentos por
**valor do odômetro** (`sortByOdometer`) para o cálculo de consumo — por
construção, isso nunca produz distância negativa, mas por isso também
**nunca detecta** uma regressão real (só reordena silenciosamente). A
Fase 42 adicionou `detectOdometerRegression(pontos)`, que ordena pelos
mesmos abastecimentos por **`supplyDate`** e sinaliza qualquer par onde o
hodômetro cai na ordem cronológica — uma verificação genuinamente
diferente, testada isoladamente (`fuel-consumption.util.spec.ts`).

## 8. Performance — ausência de N+1 (verificação real)

Diferente das Fases 40/41 (que usaram tempo de execução como proxy),
nesta fase a ausência de N+1 foi **provada por contagem real de queries**:
um e2e dedicado (`fleet-operations-fuel.e2e-spec.ts`, suíte "verificação
de ausência de N+1") instancia um `TestingModule` próprio com
`PrismaService` substituído por um client `prisma.$extends({ query: {
$allModels: { $allOperations(...) } } })` que incrementa um contador a
cada operação Prisma executada — **nunca altera `prisma.service.ts` real**
(só usado dentro daquele teste). O teste popula 10 e depois 50 veículos
com abastecimento e compara a contagem de queries de
`GET /fleet-operations/fuel` nos dois momentos: a contagem fica
constante (tolerância de ±1 para a query condicional de `Fleet`, que só
roda quando algum veículo tem `fleetId`), provando O(1) em vez de O(n).

## 9. Frontend (`apps/admin-web`)

```
/operations/fleet         -- seção "Abastecimento" (resumo) consome GET /fleet-operations/fuel + link "Ver detalhes"
/operations/fleet/fuel    -- [Fase 42, nova] detalhe completo: resumo, evolução mensal, alertas, breakdown por veículo/frota, 8 rankings
```

A rota sugerida no pedido original era `/operations/fuel`; a auditoria
confirmou que a convenção real já estabelecida (Fases 40/41) é
`/operations/fleet/{costs,maintenance,stops}` — por consistência,
esta fase usa `/operations/fleet/fuel`.

`/fuel-supplies` (cadastro/listagem de abastecimentos, Fase 18) permanece
intocado — este módulo é somente leitura agregada, nunca duplica a
tela de CRUD existente. A seção "Abastecimento" do dashboard executivo
(`/operations/fleet`) trocou sua fonte de dados do card `fuel` (resumo
simples da Fase 18/40) para o novo endpoint — o campo `fuel` no contrato
de `GET /fleet-operations/dashboard` **continua existindo, inalterado**
(nenhum campo removido), apenas deixou de ser a fonte usada por essa
seção específica do frontend.

Reaproveita integralmente `FleetFilters`/`useFleetOperationsFilters`,
`MonthlyChartCard`, `DataTable`, `Badge` — nenhum componente visual novo.
Consumo/custo-por-km indisponíveis renderizam **"Indisponível"**, nunca
"R$ 0,00", "0 km/L" ou "NaN".

## 10. Testes

- **Unitário**: `detectOdometerRegression` (5 casos, incl. o caso que
  prova que a função difere da ordenação por odômetro) e
  `mergeFuelByFleet` (4 casos) em seus respectivos `*.spec.ts`.
- **E2e** (`fleet-operations-fuel.e2e-spec.ts`, 13 suítes cobrindo os
  cenários pedidos): dashboard vazio; cenário com abastecimentos
  conhecidos (resumo/consumo/custo-por-km exatos, incl. veículo com dado
  insuficiente); filtros (período/veículo/frota); rankings (incl. exclusão
  de veículo sem consumo disponível); evolução mensal; período anterior
  (com e sem filtro); hodômetro regressivo → alerta; preço/consumo/volume
  outlier → alertas; isolamento multi-tenant; RBAC; escala prática (10,
  25, 50 veículos reais); verificação real de ausência de N+1 (seção 8).
- **Frontend**: `fuel/page.test.tsx` (11 testes: loading/erro/resumo/
  indisponibilidade/breakdown por veículo e frota/rankings/alertas/período
  anterior) + `page.test.tsx` da raiz estendido (2 testes novos: seção
  "Abastecimento" consumindo o endpoint próprio com link "Ver detalhes",
  e "Indisponível" nunca "R$ 0,00" quando sem dado).

## 11. Fora de escopo / indisponível (declarado)

"Custo TOTAL da frota por km" (todas as categorias de custo, não só
combustível) continua indisponível — depende de `TripMetrics.
actualDistanceKm`, nunca escrito (ver seção 3 e `docs/fleet-operations-
dashboard.md`, Fase 41). Alerta de "registro sem quilometragem" não
implementado por ser estruturalmente impossível (seção 7). Nenhuma
alteração no Driver App — não existe gap real que justifique nova coleta
automática de dados nesta fase.
