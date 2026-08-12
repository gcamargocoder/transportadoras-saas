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

`FLEET_OPERATIONS_READ_ROLES = [SUPER_ADMIN, ADMIN, MANAGER, OPERATOR, DISPATCHER, AUDITOR]`
— mesmo grupo amplo já usado por `GET /tires/dashboard` e
`GET /fuel-supplies/dashboard` (leitura operacional do dia a dia).
**Deliberadamente distinto** do `DASHBOARD_ROLES` mais restrito
(`SUPER_ADMIN/ADMIN/MANAGER`) do dashboard executivo (`GET /dashboard`),
que é propositalmente mais fechado por expor dado financeiro consolidado a
nível de diretoria. `DRIVER` é o único papel bloqueado (403) em todas as 5
rotas.

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

## 6. Fora de escopo / indisponível (declarado)

Sem cache/Redis (convenção do projeto: sempre live aggregate). Sem
websocket. Sem novo módulo de pneus/manutenção além do que já existia. Sem
página administrativa de checklist no admin-web (Fase 38/39 só cobriram
backend + Driver App). "Km rodados"/"custo por km" (fleet-wide, por
veículo, por frota), ranking de consumo por veículo e distribuição de
pneus por posição/eixo — todos **auditados e confirmados indisponíveis**
nesta fase (ver tabela de indicadores acima), nunca inventados ou
aproximados por heurística.
