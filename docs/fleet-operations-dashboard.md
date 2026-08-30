# Gestão Operacional da Frota + Dashboards (Fases 40-41)

Camada de **leitura agregada** sobre dados operacionais já existentes
(viagens, frota, abastecimento, manutenção, pneus, checklist, pedágio) —
sem duplicar nenhum domínio. Todo o módulo é somente leitura: nenhuma
tabela nova, nenhuma escrita, nenhum endpoint de criação/edição.

A **Fase 40** entregou a primeira camada consolidada (dashboard geral +
custos + manutenção + paradas). A **Fase 41** evoluiu essa camada a nível
executivo — mais KPIs, rankings, evolução mensal, comparação com período
anterior e uma camada de alertas computados — sem quebrar nenhum campo do
contrato da Fase 40 (toda adição é um campo **novo**).

## 1. Arquitetura

```
FleetOperationsMetricsService
  ├─ getOverview()                 -- agregação própria (Vehicle/Trip/Driver/Alert)
  ├─ getCosts()                    -- agregação própria (FuelSupply/VehicleMaintenance/Tire/TireRetread/TollTransaction/TripExpense)
  ├─ getMaintenanceDashboard()     -- agregação própria (VehicleMaintenance)
  ├─ getStopsDashboard()           -- agregação própria (TripStop)
  ├─ getChecklistSummary()         -- agregação própria (ChecklistExecution/ChecklistAnswer)
  ├─ getOperationalIndicators()    -- agregação própria (Trip/TripMetrics) [Fase 41]
  ├─ computeAlerts()               -- computado em memória, nunca persistido [Fase 41]
  └─ getConsolidatedDashboard()    -- compõe tudo acima + reaproveita:
       ├─ FuelSuppliesService.getDashboard()  (Fase 18, intocado)
       └─ TiresService.getDashboard()         (Fase 20, intocado)
```

Mesmo padrão de agregação já estabelecido por `DashboardService` (Fase 19):
Prisma direto (`aggregate`/`groupBy`/`count` via `Promise.all`), nunca loop
por registro, nunca 1 query por veículo (rankings usam `groupBy(['vehicleId'])`
+ 1 única query em lote `vehicle.findMany({ where: { id: { in: [...] } } })`
para buscar as placas). Nenhuma tabela/serviço/cache novo — `PrismaService`
é a única dependência de dados própria; `FuelSuppliesService`/`TiresService`
são apenas **injetados e chamados**, nunca reimplementados.

Evolução mensal (`monthlyTrend`) reusa `common/utils/monthly-series.util.ts`
(`buildMonthlyRange`/`aggregateMonthlySeries`), o mesmo util já usado por
`DashboardService.getCharts` (Fase 19) — sempre os **últimos 12 meses a
partir de agora**, ignora `startDate`/`endDate` do filtro (mas respeita
`vehicleId`/`fleetId`), mesmo comportamento do dashboard executivo.

## 2. Endpoints

| Rota | RBAC | Descrição |
|---|---|---|
| `GET /fleet-operations/dashboard` | `FLEET_OPERATIONS_READ_ROLES` | Consolidado (Camada A): overview + costs + fuel + tires + maintenance + stops + checklist + operational + alerts |
| `GET /fleet-operations/costs` | `FLEET_OPERATIONS_READ_ROLES` | Custos realizados: breakdown por categoria/frota, ranking de veículos, evolução mensal, comparação com período anterior |
| `GET /fleet-operations/maintenance` | `FLEET_OPERATIONS_READ_ROLES` | Manutenção: breakdown por tipo/prioridade/oficina/veículo, evolução mensal |
| `GET /fleet-operations/stops` | `FLEET_OPERATIONS_READ_ROLES` | Paradas/ociosidade: breakdown por tipo e ranking de veículos, evolução mensal |
| `GET /fleet-operations/operations` | `FLEET_OPERATIONS_READ_ROLES` | **[Fase 41]** Indicadores operacionais: viagens concluídas/andamento/canceladas, tempo médio de viagem, custo médio por viagem, utilização da frota, ranking de viagens por veículo |
| `GET /fleet-operations/fuel` | `FLEET_OPERATIONS_READ_ROLES` | **[Fase 42]** Abastecimento: consumo/custo-por-km, breakdown por veículo/frota, rankings, evolução mensal, período anterior, alertas, nível de tanque estimado (`tankLevels`/`tankFleetAverage`) |
| `GET /fleet-operations/vehicles` | `FLEET_OPERATIONS_READ_ROLES` | Composição da frota (estado atual, ignora `startDate`/`endDate`): contagem por status/tipo/combustível/frota, disponibilidade, idade/odômetro médios, rankings de idade/odômetro |
| `GET /fleet-operations/tires` | `FLEET_OPERATIONS_READ_ROLES` | Pneus: composição por status/frota, custo investido/recapagem (com período), evolução mensal, gauge de desgaste por pneu (leitura direta de inspeção), ranking de veículos por custo de pneu, alertas de proximidade de troca |
| `GET /fleet-operations/downtime-cost` | `FLEET_OPERATIONS_READ_ROLES` | Tempo parado por veículo (manutenção/quebra/abastecimento/outras, via `TripStop`) e receita perdida ESTIMADA (taxa de receita/hora do próprio veículo × horas paradas) |
| `GET /fleet-operations/compositions` | `FLEET_OPERATIONS_READ_ROLES` | Uso de veículo+carreta por viagem: composição atual da frota de carretas (tipo/disponibilidade, ignora `startDate`/`endDate`), configuração de eixos das composições no período, ranking de carretas (nº de viagens/tempo em uso) e tempo parado vs. em uso por carreta |
| `GET /fleet-operations/financial` | `FLEET_OPERATIONS_READ_ROLES` | **[Fase 51]** Gestão financeira: receita/despesa/custo total (reaproveita `costs`)/adiantamentos/resultado/margem, evolução mensal, rankings (veículo/categoria/viagem) e detalhamento por frota/cliente/motorista — ver `fleet-operations-financial.md` |

`FLEET_OPERATIONS_READ_ROLES = [SUPER_ADMIN, ADMIN, MANAGER, OPERATOR, DISPATCHER, AUDITOR]`
— mesmo grupo amplo já usado por `GET /tires/dashboard` e
`GET /fuel-supplies/dashboard` (leitura operacional do dia a dia).
**Deliberadamente distinto** do `DASHBOARD_ROLES` mais restrito
(`SUPER_ADMIN/ADMIN/MANAGER`) do dashboard executivo (`GET /dashboard`),
que é propositalmente mais fechado por expor dado financeiro consolidado a
nível de diretoria. `DRIVER` é o único papel bloqueado (403) em todas as
rotas acima.

### Filtros (`FleetOperationsQueryDto` — inalterado desde a Fase 40)

| Campo | Tipo | Aplica-se a |
|---|---|---|
| `startDate`/`endDate` | ISO date | Todas as agregações próprias (`overview` não usa data — é sempre snapshot atual; `monthlyTrend` ignora e sempre cobre os últimos 12 meses). Filtra pela **data do evento real** de cada domínio (`supplyDate`/`openedAt`/`chargedAt`/`expenseDate`/`startedAt`/`createdAt` da viagem), nunca `createdAt` dos registros de custo. |
| `vehicleId` | UUID | Todas as agregações próprias + repassado ao card `fuel` (FuelSuppliesService aceita `vehicleId`). **Não filtra o card `tires`** — `TiresService.getDashboard(tenantId)` não aceita nenhum filtro hoje, limitação pré-existente do serviço reaproveitado. |
| `fleetId` | UUID | Todas as agregações próprias, via relação `Vehicle.fleetId` (`vehicle: { fleetId }` nos `where` de cada domínio, incluindo `Trip` via `composition.vehicle.fleetId`). **Não filtra `fuel` nem `tires`** — nenhum dos dois serviços reaproveitados aceita `fleetId` hoje. |

`previousPeriod` (em `costs`) e `utilizationPercent` (em `operational`) só
são calculados quando **`startDate` E `endDate` são ambos informados** —
sem um período de referência real, esses campos ficam `null` (nunca um
"período anterior" ou uma "utilização" inventados).

## 3. Indicadores

| Indicador | Fonte | Cálculo | Disponibilidade |
|---|---|---|---|
| Veículos ativos/inativos/manutenção/vendidos | `Vehicle.status` | `groupBy(['status'])` | ✅ |
| Viagens ativas | `Trip.status` | `count` onde `status IN (IN_PROGRESS, PAUSED)` | ✅ |
| **[Fase 41]** Veículos em viagem / disponíveis | `Vehicle.tripCompositions.trip.status` | `count` relacional (`tripCompositions.some.trip.status IN (...)`) — subconjunto de `activeVehicles`, sem N+1 | ✅ |
| Motoristas ativos | `Driver.isActive` | `count` onde `isActive=true, deletedAt=null` | ✅ |
| Alertas em aberto (Fase 29) | `Alert.acknowledgedAt` | `count` onde `acknowledgedAt=null` | ✅ |
| Custo de combustível/manutenção/pneus/pedágio/outros | `FuelSupply`/`VehicleMaintenance`/`Tire`+`TireRetread`/`TollTransaction`/`TripExpense` | `_sum`, categorias `FUEL`/`MAINTENANCE`/`TIRES` de `TripExpense` excluídas (evita dupla contagem) | ✅ |
| Custo médio por veículo | `totalCost / nº de veículos com custo` | Guarda de divisão por zero → `null` | ✅ |
| **[Fase 41]** Custo por frota (`costByFleet`) | `Vehicle.fleetId` | Ranking por veículo já agregado, reagrupado por `fleetId` em memória (1 lookup em lote); `fleetId=null` vira o balde explícito "Sem frota" | ✅ |
| **[Fase 41]** Evolução mensal do custo (`monthlyTrend`) | Mesmas 6 fontes de custo | `aggregateMonthlySeries` sobre os últimos 12 meses (sempre, ignora `startDate`/`endDate`) | ✅ |
| **[Fase 41]** Comparação com período anterior (`previousPeriod`) | Mesmas 6 fontes de custo, reagregadas sobre o intervalo anterior de mesma duração | `computePreviousPeriodRange` + mesma agregação; `deltaPercent=null` se o total anterior for zero | ✅ (só com `startDate`+`endDate`) |
| Top 5 veículos por custo total | `FuelSupply`+`VehicleMaintenance`+`TollTransaction` por `vehicleId` | `groupBy` de cada fonte, somados em memória | ⚠️ Parcial — `TireRetread` fora do ranking (sem `vehicleId` direto, ver Fase 40) |
| Manutenções abertas/concluídas, custo médio, tempo médio | `VehicleMaintenance.status`/`totalCost`/`openedAt`/`completedAt` | `count`/`_sum`/média em memória sobre projeção mínima | ✅ |
| **[Fase 41]** Top 5 veículos por nº de manutenções (`topVehiclesByCount`) | `VehicleMaintenance` agrupado por `vehicleId` | Mesmo mapa agregado de custo, ranqueado por `count` em vez de `value` | ✅ |
| "Componente com maior custo" de manutenção | — | — | ❌ **INDISPONÍVEL** — não existe como campo estruturado (só texto livre em `description`/`notes`); nunca inferido por heurística de texto |
| Paradas totais/duração, por tipo, ranking por veículo | `TripStop` | `aggregate`/`groupBy` | ✅ |
| Paradas por tipo "carga"/"descarga"/"abastecimento" | — | — | ⚠️ Parcial — `TripStopType` só tem `UNKNOWN/FUEL/REST/MEAL/MAINTENANCE/OTHER`; "carga"/"descarga" **nunca inventadas**, ficam implícitas em `OTHER`/`UNKNOWN` |
| Checklists totais/concluídos/pendentes, não-conformidades críticas | `ChecklistExecution`/`ChecklistAnswer` | `count`/1 query `distinct` | ✅ |
| Abastecimento (litros, valor, consumo médio, custo/km) | `FuelSuppliesService.getDashboard()` | Reaproveitado 100% (Fase 18) | ✅ (sem filtro `fleetId`) |
| Pneus (contagem por status, valor investido, vida útil) | `TiresService.getDashboard()` | Reaproveitado 100% (Fase 20) | ✅ (sem filtro `vehicleId`/`fleetId`/período) |
| **[Fase 41]** Viagens concluídas/em andamento/canceladas | `Trip.status` | `count` via junção com `composition` (`vehicleId`/`fleetId`) | ✅ |
| **[Fase 41]** Tempo médio de viagem | `TripMetrics.actualDurationMin` | `_avg` — campo **real**, gravado por `TripsService` ao concluir a viagem (`PATCH /trips/:id/status {status: COMPLETED}`) | ✅ |
| **[Fase 41]** Custo médio por viagem | `totalCost (Costs) / viagens concluídas no mesmo escopo` | Divisão simples com guarda | ⚠️ **Aproximação documentada** — nem todo registro de custo tem `tripId` (ex: compra de pneu em estoque), então não é um "custo real daquela viagem específica", é uma média do período |
| **[Fase 41]** Utilização da frota | `Σ TripMetrics.actualDurationMin / (duração do período × nº de veículos ativos no escopo)` | Normalizado pela capacidade da frota no período (nunca uma razão bruta que passaria de 100% com mais de 1 veículo) | ✅ (só com `startDate`+`endDate` — sem período, `null`) |
| **[Fase 41]** Ranking de viagens por veículo | `Trip` concluídas, agrupadas por `composition.vehicleId` | 1 `findMany` projetando só o `vehicleId` (mesmo padrão de `DashboardService.getCharts`), reduzido em memória | ✅ |
| **[Fase 41]** "Km rodados" / "custo por km" (frota, por veículo, por frota) | `TripMetrics.actualDistanceKm` | — | ❌ **INDISPONÍVEL — auditado e confirmado**: nenhum service em todo o `apps/api/src` jamais escreve este campo (`TripMetricsService` só atualiza os campos `planned*`; comentário explícito no código confirma). `DashboardService` (Fase 19) já soma esse campo e hoje sempre resulta em `0`, mas mascara isso retornando `0` em vez de `null` — decisão pré-existente da Fase 19, fora do escopo desta fase alterar; este módulo **nunca repete esse mascaramento** em campo novo. |
| **[Fase 41]** Ranking/alerta de consumo (km/L) por veículo | `FuelSuppliesService.getDashboard()` só expõe UM `topVehicle`/`mostUsedStation` globais | — | ❌ **INDISPONÍVEL nesta fase** — exigiria estender o breakdown por veículo do próprio domínio de abastecimento (fora do escopo "não duplicar/recriar"), documentado como pendência real para fase futura |
| **[Fase 41]** Distribuição de pneus por posição/eixo | `Tire.position` é texto livre, sem taxonomia fixa | — | ❌ **INDISPONÍVEL** — não inventar categorias sobre texto livre |

### Nível de tanque (estimado) — `GET /fleet-operations/fuel` → `tankLevels`/`tankFleetAverage`

Iteração de redesign visual do dashboard de combustível (gauge por
veículo). **Nunca é uma leitura de sensor real** — `Telemetry.fuelLevel`
existe no schema mas não é escrito/lido em lugar nenhum do sistema hoje
(nenhuma integração de telemetria popula esse campo). A estimativa segue
duas premissas explícitas:

1. Cada abastecimento enche o tanque até `Vehicle.tankCapacityLiters`
   (comportamento típico do setor).
2. A partir daí, desconta-se o consumo estimado desde então: `litros
   consumidos = (Vehicle.odometerKm atual − odômetro do último
   abastecimento) / Vehicle.averageConsumptionKmL`.

Só é calculado quando **todos** os dados existem — `tankCapacityLiters`,
`averageConsumptionKmL`, pelo menos 1 abastecimento e `Vehicle.odometerKm`
atual; caso contrário `available=false` com um `reason` explícito
(`TANK_CAPACITY_NOT_CONFIGURED` / `AVERAGE_CONSUMPTION_NOT_CONFIGURED` /
`NO_SUPPLY_RECORDED` / `VEHICLE_ODOMETER_NOT_AVAILABLE`) — nunca um número
inventado. Odômetro atual menor que o do último abastecimento
(inconsistência de cadastro) é tratado como "0 km rodado desde então"
(tanque cheio), nunca como consumo negativo.

Estado **atual**, não histórico: ignora `startDate`/`endDate` do filtro
(mesmo princípio de `monthlyTrendCost`), respeita só `vehicleId`/`fleetId`.
Calculado com 2 queries (nunca 1 por veículo): veículos do escopo, e o
último abastecimento de cada um em uma única query via
`distinct(['vehicleId']) + orderBy(supplyDate desc)`. Lista `tankLevels`
ordenada por `percentage` ascendente (mais urgente primeiro), indisponíveis
por último; `tankFleetAverage` é a média simples só entre os disponíveis.

### Composição da frota — `GET /fleet-operations/vehicles`

Dashboard novo (iteração de redesign visual), distinto de
`FleetOverviewEntity` (dentro do consolidado, só contagem por status):
aqui entram tipo/combustível/frota/idade/odômetro. `vehiclesOnTrip`/
`vehiclesAvailable` reaproveitam a **mesma** lógica de `computeOverview`
(extraída para `countVehiclesOnTrip`, nunca duplicada). Estado **atual**
da frota — ignora `startDate`/`endDate` (mesmo princípio de
`monthlyTrendCost`/`tankLevels`); filtra por `vehicleId`/`fleetId`
(campos já existentes) e pelos novos `vehicleType`/`vehicleStatus`
(nomes distintos de `type`/`status`, já reservados a `TripStopType`/
`TripStopStatus` pela Fase 44 no mesmo DTO compartilhado).

`averageAgeYears` = média de `(ano atual − manufactureYear)`,
`averageOdometerKm` = média de `odometerKm` — ambas **só entre veículos
com o campo preenchido** (`safeAverage`, nunca dividir por zero, nunca
tratar ausência como zero). Rankings `oldestVehicles`/`newestVehicles`
(por `manufactureYear`) e `topVehiclesByOdometer` reaproveitam
`FleetVehicleRankingEntryEntity`/`rankTopVehicles` já existentes (mesma
entity genérica usada em custos/manutenção/paradas/combustível) — nunca
incluem veículo sem o campo correspondente preenchido.

**Sem alertas nesta entity**: os únicos sinais de risco plausíveis (frota
em manutenção, custo, downtime) já têm alerta dedicado nos dashboards de
manutenção/combustível — não inventar um threshold novo sem precedente
operacional.

**Fora de escopo, documentado**: alertas de documento/CRLV/seguro/
licenciamento de veículo. O model `Document`/`DocumentType.CRLV`/
`DocumentOwnerType.VEHICLE` existe no schema, mas **nunca é populado
para veículo** hoje (só há `DriverDocumentsService`, nada equivalente
para `Vehicle`) — implementar isso exigiria criar um domínio novo de
documentos de veículo, pendência real para fase futura, não feito aqui
para não inventar uma fonte de dado que não existe.

### Pneus — `GET /fleet-operations/tires`

Dashboard novo (iteração de redesign visual), distinto de
`TireDashboardEntity` (`GET /tires/dashboard`, sem filtro nenhum, ainda
reaproveitado tal como está no card "Pneus" do dashboard executivo — **não
alterado**). Aqui entram filtros (`vehicleId`/`fleetId`/`tireStatus`/
período), breakdown por frota, evolução mensal, gauge de desgaste por pneu
e ranking de veículos por custo de pneu.

`investedValue`/`retreadValue`/`monthlyTrendCost` respeitam
`startDate`/`endDate` (via `purchaseDate`/`retreadDate`, reaproveitando
`buildTireWhere`/`buildTireRetreadWhere` já usados por `GET
/fleet-operations/costs`); `monthlyTrendCost` sempre cobre os últimos 12
meses (ignora o período, mesmo princípio de `monthlyTrendCost` do
combustível). As demais contagens/breakdowns/gauge de desgaste são
**estado atual** da frota.

**Desgaste (`tireWear`) — leitura DIRETA, não estimada**: diferente do
nível de tanque (que precisou de uma premissa de cálculo),
`wearPercentRemaining = currentTreadDepthMm / initialTreadDepthMm × 100`
é uma medição real — `currentTreadDepthMm` é sincronizado automaticamente
pela inspeção mais recente (`TireInspection`). Só calculado para pneus
`IN_USE`; `available=false` com `reason` (`INITIAL_TREAD_DEPTH_NOT_CONFIGURED`
| `NO_INSPECTION_RECORDED`) quando falta dado — nunca um valor inventado.
Ordenado por desgaste ascendente (mais gasto primeiro), indisponíveis por
último.

**`nearReplacementCount`/alerta `TIRE_NEAR_REPLACEMENT`**: reaproveitam o
mesmo limiar já existente `NEAR_REPLACEMENT_THRESHOLD_MM = 3` (exportado
de `TiresService`, não duplicado como número mágico novo).

**Fase 110 — também reage a distância percorrida, não só a sulco**: um
pneu `IN_USE` agora conta em `nearReplacementCount`/gera alerta
`TIRE_NEAR_REPLACEMENT` também quando os km rodados desde a instalação
(`Vehicle.odometerKm` atual − `odometerKm` da movimentação de instalação)
atingem `NEAR_REPLACEMENT_LIFESPAN_USED_PERCENT = 90`% de
`Tire.expectedLifespanKm` (quando cadastrado) — mesma fórmula
(`computeTireDistanceLifespan`, `tires/utils/tire-lifecycle.util.ts`)
reaproveitada por `GET /tires/:id` (indicadores de vida útil, ver
`docs/tire-management.md`) e pelo coletor de notificações
(`collectTireLifespanNearReplacement`, ver `docs/notifications.md`). Um
pneu que atende aos 2 critérios (sulco E distância) conta uma única vez;
quando o sulco já disparou o alerta, o alerta por distância não é gerado
para o mesmo pneu (nunca 2 alertas para o mesmo pneu). Sem
`expectedLifespanKm` cadastrado ou sem as 2 leituras de odômetro
necessárias, o critério por distância fica indisponível (nunca inventa um
limite) — só o critério por sulco continua valendo.

**`byFleet`/`topVehiclesByTireCost` — só `Tire.purchasePrice`, nunca
recapagem**: ambos cobrem só pneus **atualmente montados** em veículo
(`tire.vehicleId` setado); pneus em estoque já estão cobertos por
`stockCount`. `TireRetread` não tem `vehicleId` direto — atribuí-lo pela
localização ATUAL do pneu seria uma aproximação (a recapagem pode ter
ocorrido enquanto o pneu estava em outro veículo), **mesma limitação já
documentada** para o ranking de custos gerais (`GET /fleet-operations/costs`,
seção 3 acima). `retreadValue` continua exato no resumo geral — só não é
atribuído a um veículo/frota específico.

**Fora de escopo, confirmado por auditoria (já documentado antes desta
iteração)**: distribuição por posição/eixo — `Tire.position` é texto
livre, sem taxonomia fixa, e não existe campo de eixo em lugar nenhum do
schema; não inventar categorias sobre texto livre.

### Tempo parado e receita perdida — `GET /fleet-operations/downtime-cost`

Dashboard novo, financeiramente sensível — auditado antes de implementar
para garantir que nada fosse inventado. Duas decisões estruturais:

**1. Tempo parado vem SOMENTE de `TripStop`.** `VehicleMaintenance.
downtimeMinutes` (Fase 45) existe mas **nunca é somado aqui** — as duas
fontes não têm nenhum vínculo entre si (nenhuma FK, nenhum service cria
uma a partir da outra), então somar as duas contaria a mesma parada real
duas vezes. Cada `TripStop.type` é mapeado para 1 dos 4 baldes pedidos:
`MAINTENANCE`→Manutenção, `BREAKDOWN`→Quebra ("quebra" é um tipo distinto
de `MAINTENANCE` no schema, desde a Fase 43), `FUEL`→Abastecimento, os
demais ~15 tipos (`REST`, `MEAL`, `LOADING`, `TIRE`, `CONGESTION` etc.)
→ Outras. Respeita `startDate`/`endDate` (via `TripStop.startedAt`,
reaproveitando `buildStopWhere` tal como já existe para o dashboard de
Paradas).

**2. Receita perdida é uma ESTIMATIVA, nunca um valor exato**: `horas
paradas × taxa de receita/hora do PRÓPRIO veículo`. A taxa vem do
histórico **completo** de viagens `COMPLETED` do veículo (ignora
`startDate`/`endDate` — uma taxa de capacidade de geração de receita não
deveria variar conforme a janela do relatório, mesmo princípio já usado
em `tankLevels`/`vehicles overview`): `soma(TripRevenue.amount) /
(soma(TripMetrics.actualDurationMin) / 60)`. **Nunca R$/km** — auditoria
confirmou que `TripMetrics.actualDistanceKm` nunca é escrito por nenhum
service em todo o `apps/api/src` (mesma limitação já documentada acima
para "km rodados"/"custo por km"); `actualDurationMin`, ao contrário, é
real e gravado por `TripsService` ao concluir a viagem.

`available=false` (`reason: INSUFFICIENT_TRIP_HISTORY`) quando o veículo
tem menos de `MIN_TRIPS_FOR_REVENUE_RATE` (2) viagens concluídas —
mesmo princípio estrutural de `MIN_SUPPLIES_FOR_CONSUMPTION`, evita uma
taxa baseada em 1 viagem atípica. `reason: NO_OPERATING_HOURS_RECORDED`
se, apesar de viagens suficientes, a soma de duração for zero. Receita
real zero (viagens concluídas sem nenhum `TripRevenue` lançado) resulta
numa taxa `0` legítima — nunca confundida com indisponível.
`totalEstimatedLostRevenue` (resumo da frota) soma só os veículos com
taxa disponível (`reason: NO_VEHICLE_WITH_REVENUE_RATE` se nenhum) —
nunca trata um veículo indisponível como R$0.

Alerta `DOWNTIME_COST_OUTLIER` reaproveita o multiplicador 2x padrão já
usado em todo o módulo (`DOWNTIME_COST_OUTLIER_MULTIPLIER`), só entre
veículos com taxa disponível.

### Pedágios — `GET /toll-transactions/dashboard` (reaproveitado, não é rota nova em `/fleet-operations`)

Diferente dos demais dashboards desta série, o domínio de pedágio já
tinha **dois endpoints de dashboard maduros** antes desta iteração —
`GET /toll-transactions/dashboard` (`TollDashboardEntity`: totais,
conformidade da cobrança, breakdown por status/operadora/veículo/
motorista/praça) e `GET /toll-routes/dashboard`
(`TollReconciliationDashboardEntity`: conciliação de rota planejada vs.
pedágios efetivamente cobrados). A página `/operations/fleet/tolls`
reaproveita os dois **quase 100% como estão** — nenhum endpoint novo,
nenhum cálculo duplicado — com apenas 2 extensões pequenas em
`TollTransactionsService.getDashboard()` para consistência com os
outros 6 dashboards da série:

1. **Filtro `fleetId`** (`Vehicle.fleetId`, via `buildWhere`) — antes só
   existia `vehicleId`; sem isso o seletor de frota compartilhado
   (`FleetFilters`) apareceria na tela sem filtrar de verdade.
2. **`monthlyTrendChargedAmount`** — evolução mensal do valor cobrado,
   últimos 12 meses sempre (ignora `chargedFrom`/`chargedTo`, mesmo
   princípio de `monthlyTrend` usado em todo o módulo), via
   `aggregateMonthlySeries`, respeitando `vehicleId`/`fleetId`.

`conformityPercentage` (correta/cobrança a maior/a menor/não
conferível, via `computeAuditVerdict`/`DIVERGENCE_TOLERANCE=0.01`, já
existente) alimenta o gauge de conformidade da página.

**Conciliação de rotas continua sem filtro** — limitação real e
pré-existente do `TollReconciliationService` (não estendida nesta
iteração); a página exibe essa seção com um aviso explícito de "dado
consolidado do tenant, não filtrado por veículo/frota/período", mesmo
comportamento que a página `/tolls` já tinha antes.

`costs.tollCost` (dashboard de custos, `GET /fleet-operations/costs`)
**não muda** — continua sua própria agregação direta sobre
`TollTransaction`, independente desta página de detalhe.

### Composição — `GET /fleet-operations/compositions`

Dashboard novo, último item da série — uso de veículo+carreta por viagem
(configuração de eixos, ranking de carretas, tempo parado vs. tempo em uso).
Auditoria do schema confirmou 3 limitações estruturais, nunca contornadas por
aproximação:

1. **`Trailer` não tem campo de eixo próprio.** Eixo é atributo de
   `AxleConfiguration`, 1:1 com `TripComposition` (`totalAxles`,
   `raisedAxles`/`loweredAxles`/`suspendedAxles`/`steeringAxles`/
   `tractionAxles`, `billableCategory`) — `axleCategoryBreakdown` agrupa as
   composições das viagens no escopo do filtro (qualquer status), não as
   carretas isoladas.
2. **`TripStop` não tem `trailerId`.** Atribuição de parada a carreta só via
   `TripStop.tripId → Trip.composition.trailers`; paradas administrativas/de
   pátio sem `tripId` **nunca são atribuídas a nenhuma carreta** (mesma
   classe de limitação já documentada para `downtime-cost` por veículo,
   acima). `TripComposition.tripId` é estritamente 1:1 — troca de composição
   no meio da viagem desvincula a antiga sem manter histórico, então tempo
   parado/em uso por carreta sempre reflete a composição **atual** da
   viagem, nunca reconstrói qual carreta estava em uso num trecho passado.
3. **Composição com várias carretas (bitrem/rodotrem, via
   `TripCompositionTrailer.positionOrder`) atribui a duração INTEIRA a cada
   carreta**, nunca dividida — elas se movem/param juntas como uma unidade
   física real, dividir seria inventar uma fração.

**Sem estimativa de receita perdida por carreta** (diferente do
`downtime-cost` por veículo) — ratear a receita da viagem entre várias
carretas da mesma composição não tem nenhuma base real de divisão, seria uma
alocação inventada.

Composição atual da frota de carretas (`totalTrailers`/`activeCount`/
`inactiveCount`/`byType`, via `Trailer.isActive`/`Trailer.type`) é uma foto
do estado **atual**, ignora `startDate`/`endDate` (mesmo princípio de
`tankLevels`/`vehicles overview`). `trailersOnTrip`/`trailersAvailable`
espelham `vehiclesOnTrip`/`vehiclesAvailable` (relação
`trailer.tripCompositionTrailers.some({tripComposition:{trip:{status:{in:
ACTIVE_TRIP_STATUSES}}}})`). Ranking (`topTrailersByTripCount`/
`topTrailersByInUseMinutes`) e a lista `trailers` (tempo parado vs. em uso)
respeitam o período do filtro, reaproveitando `rankTopVehicles`/
`VehicleRankingAccumulator` já existentes (o campo `vehicleId` do retorno é
remapeado para `trailerId` na montagem da entity — sem criar uma função
paralela só por causa do nome do campo). `fleetId` filtra `Vehicle`/`Trip`
normalmente, mas **não filtra `Trailer` em si** (sem campo `fleetId`, mesma
classe de limitação já documentada para `fuel`/`tires`).

### Alertas operacionais (`alerts`, dentro do dashboard consolidado)

Camada **computada inteiramente em memória** a partir de dados já
agregados nas seções acima (sem query pesada extra) + 2 queries leves
(parada em aberto, checklist pendente por veículo). **Nunca persistida** —
o model `Alert` existente é de outro domínio (só `AlertType.ROUTE_DEVIATION`
é criado, por `RoutingService.checkDeviation`); reusá-lo aqui exigiria um
`AlertType` novo e conflitaria semanticamente, fora do escopo desta fase.

| Tipo | Condição | Severidade |
|---|---|---|
| `COST_OUTLIER` | Custo total do veículo > `COST_OUTLIER_MULTIPLIER` (2×) × custo médio da frota | Atenção |
| `MAINTENANCE_OUTLIER` | Nº de manutenções do veículo > `MAINTENANCE_COUNT_OUTLIER_MULTIPLIER` (2×) × média da frota | Atenção |
| `STOP_TIME_OUTLIER` | Minutos parado do veículo > `STOP_TIME_OUTLIER_MULTIPLIER` (2×) × média da frota | Atenção |
| `STALLED_VEHICLE` | `TripStop` aberta (`endedAt=null`) há mais de `STALLED_STOP_MINUTES` (240min) | Crítico |
| `PENDING_CHECKLIST` | Veículo com `ChecklistExecution` em `DRAFT`/`IN_PROGRESS` | Informativo |

Todos os limiares (multiplicadores/minutos) são **constantes de
visualização**, centralizadas em
`fleet-operations/constants/fleet-operations-alerts.constants.ts` (mesmo
padrão de `trips/constants/monitoring.constants.ts`, Fase 29) — nunca regra
de negócio persistida, nunca número mágico espalhado pelo código.

## 4. Frontend (`apps/admin-web`)

```
/operations/fleet             -- Camada A: painel executivo (KPIs, custos, operação, alertas, rankings)
/operations/fleet/costs       -- custos (categoria, frota, evolução mensal, período anterior, ranking)
/operations/fleet/maintenance -- manutenção (tipo/prioridade/oficina, evolução mensal, 2 rankings)
/operations/fleet/stops       -- paradas (tipo, evolução mensal, ranking)
/operations/fleet/tolls       -- pedágios (conformidade da cobrança, rankings, evolução mensal, conciliação de rotas)
/operations/fleet/compositions -- composição (uso de veículo+carreta, configuração de eixos, ranking de carretas, tempo parado vs. em uso)
/operations/fleet/financial   -- [Fase 51] financeiro (receita/despesa/custo/adiantamentos/resultado, rankings, detalhamento)
```

`/operations` (monitoramento ao vivo, Fase 29) permanece intocado. `/fuel-supplies`
e `/tires` continuam sem alteração — dashboards equivalentes já existem
(confirmado na auditoria da Fase 40, reconfirmado na Fase 41: não foram
criadas `/operations/fleet/fuel` nem `/operations/fleet/tires`).

**[Fase 41]** Filtro compartilhado extraído para
`features/fleet-operations/fleet-filters.tsx` (+ hook
`use-fleet-operations-filters.ts`) — elimina a duplicação verbatim do bloco
período/veículo/frota que existia nas 4 páginas desde a Fase 40; todas as
páginas agora usam o mesmo contrato.

Navegação entre as 9 páginas desta seção via barra de abas compartilhada
(`features/fleet-operations/fleet-section-tabs.tsx`, renderizada pelo
`layout.tsx` de `operations/fleet/`) — cada aba linka direto para o
dashboard detalhado de um domínio (Custos/Manutenção/Paradas/Tempo parado/
Abastecimento/Veículos/Composição/Pneus/Pedágios), sem depender de navegar
até o executivo e clicar no link "Ver detalhes" de cada cartão.

Gráfico de evolução mensal reusa `MonthlyChartCard` (o mesmo componente do
dashboard executivo, Fase 19) — nenhum componente de gráfico novo além do
`BarRankingChart` já criado na Fase 40. Badge de variação vs período
anterior usa o mesmo `StatCard` com tom `success`/`danger` conforme o sinal
do `deltaPercent`.

Campos com denominador que pode ser inválido (`averageCostPerVehicle`,
`averageCostPerOccurrence`, `averageDurationHours`, `averageDurationMinutes`,
`averageTripDurationMinutes`, `averageCostPerTrip`, `utilizationPercent`)
chegam `null` do backend e o frontend renderiza **"—"**, nunca "R$ 0,00"
ou "0 min"/"0%".

## 5. Testes

- **Unitário** (`fleet-operations-metrics.util.spec.ts`, 25 testes):
  funções puras do service — `safeAverage`, `mergeVehicleAmounts`,
  `rankTopVehicles` (incl. `sortBy: 'count'`), `computeAverageDurationHours`,
  `mergeByFleet`, `computePreviousPeriodRange`, `computeDeltaPercent`,
  `isOutlier`. Mesmo padrão de `checklist-non-conformity.util.spec.ts`
  (único precedente de teste unitário no backend — **não existe teste
  unitário com `PrismaService` mockado em todo o `apps/api`**, a
  verificação real de agregação é sempre via e2e contra banco real).
- **E2e** (`fleet-operations.e2e-spec.ts`, 18 cenários): os 10 da Fase 40
  (estado vazio, cenário de consistência conhecido, filtros, anti-dupla-
  contagem, breakdown, isolamento multi-tenant, RBAC, escala com 15
  veículos) + 8 novos da Fase 41 — endpoint `/operations` (populado e
  vazio), evolução mensal, período anterior (com e sem filtro), ranking
  por frota (incl. "Sem frota"), e 2 cenários de alertas (custo/frequência
  de manutenção outlier; parada parada há muito tempo + checklist
  pendente). `vehiclesOnTrip`/`vehiclesAvailable` cobertos no cenário de
  consistência conhecido. RBAC e isolamento multi-tenant estendidos para
  incluir o endpoint novo.
- **Frontend** (`vitest` + Testing Library, 31 testes): os 4 arquivos de
  página existentes estendidos com os campos/seções novos + novo arquivo
  de teste do componente de filtro compartilhado (`fleet-filters.test.tsx`).
- **Pedágios** (`apps/api/test/tolls.e2e-spec.ts`, estendido): 2 cenários
  novos (filtro `fleetId`, `monthlyTrendChargedAmount` com 12 posições) —
  regressão completa do domínio (`tolls`/`toll-routes`/`toll-data`/
  `toll-import`/`toll-reconciliation-official-tariff`, 90 testes).
  Frontend: novo `operations/fleet/tolls/page.test.tsx` (6 testes) + seção
  nova coberta em `operations/fleet/page.test.tsx`.
- **Composição** (`apps/api/test/fleet-operations-compositions.e2e-spec.ts`,
  novo, 8 cenários): estado vazio, composição/disponibilidade da frota de
  carretas, configuração de eixos por composição, ranking + tempo parado vs.
  em uso (incl. parada sem `tripId` nunca atribuída, e composição com 2
  carretas atribuindo a duração inteira a ambas), isolamento multi-tenant,
  RBAC, N+1 (10 vs. 50 carretas). Frontend: novo
  `operations/fleet/compositions/page.test.tsx` (6 testes) + seção nova em
  `operations/fleet/page.test.tsx` + aba nova em
  `fleet-section-tabs.test.tsx`.

## 6. Fora de escopo / indisponível (declarado)

Sem cache/Redis (convenção do projeto: sempre live aggregate). Sem
websocket. Sem novo módulo de pneus/manutenção além do que já existia. Sem
página administrativa de checklist no admin-web (Fase 38/39 só cobriram
backend + Driver App). "Km rodados"/"custo por km" (fleet-wide, por
veículo, por frota), ranking de consumo por veículo e distribuição de
pneus por posição/eixo — todos **auditados e confirmados indisponíveis**
nesta fase (ver tabela de indicadores acima), nunca inventados ou
aproximados por heurística.
