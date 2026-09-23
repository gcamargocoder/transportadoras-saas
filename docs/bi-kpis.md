# BI 1 — Fundação dos indicadores

Primeira fase do roadmap de BI (BI 1 → BI 11, até a Central de Inteligência). Esta fase cria a
**camada oficial de KPIs**: uma fonte única, multi-tenant e rastreável que os próximos módulos de BI
vão consumir. Não há UI nova nem IA nesta fase.

## 1. O que já existia (auditoria)

| Onde | O que calcula | Situação no BI 1 |
|---|---|---|
| `GET /dashboard` (`DashboardService`, Fase 19) | Receita, despesas aprovadas, lucro/margem, km (TripMetrics), combustível, manutenção, gráficos 12 meses | **Inalterado.** Usa regras próprias (ver §7) |
| `GET /fleet-operations/costs` (`computeCosts`, Fases 40/85) | Custo realizado completo (combustível, manutenção, pneus, pedágio, outras despesas), distância por odômetro, custo/km | **Núcleo extraído** para `computeCostTotals()` — BI e `/costs` usam a mesma função |
| `GET /fleet-operations/financial` (Fase 51) | Receita, resultado = receita − custo total, margem | Mesmo where de receita reaproveitado (`buildRevenueSourceWhere`) |
| `GET /fleet-operations/operations` (Fase 41) | Viagens por status, utilização aproximada | Mantido; BI define a utilização oficial (§7) |
| `GET /fleet-operations/idle-time` (Fase A) | Períodos ociosos entre viagens, líquidos de manutenção | **Carga extraída** para `loadVehicleIdleData()` e utils puras reaproveitadas |
| `GET /fleet-operations/occurrences` (Fase 68) | Ocorrências por status/tipo/severidade | Mesma regra (canceladas fora) |
| `GET /delivery-stops/dashboard` (Fase 99) | Entregas por status, atrasadas em aberto | Base para “entregas no prazo” |

Isolamento de tenant: **controle na aplicação** (`tenantId` em todo `where`, vindo de
`TenantContext.requireTenantId()`). Não há políticas de Row-Level Security no banco hoje
(apesar de `docs/architecture.md` §4 mencioná-las) — o BI segue o padrão real do projeto.

## 2. Arquitetura

```
BiKpisController  (GET /bi/kpis, /bi/kpis/summary, /bi/kpis/:kpiId/evidence)
  └─ BiKpisService            valida período/escopo, escolhe KPIs, monta resposta
       ├─ BiKpiSnapshotService   coleta dados BRUTOS por período (sem calcular KPI)
       │    ├─ FleetOperationsMetricsService.computeCostTotals / computeRevenueTotals
       │    ├─ FleetIdleTimeService.loadVehicleIdleData  (1 carga, recortada por período)
       │    └─ Prisma: viagens concluídas, entregas, ocorrências (bi-where.util)
       ├─ KPI_CATALOG (kpis/kpi-catalog.ts)   metadados + compute PURO por KPI
       ├─ build-kpi-results.util              KPI atual + comparação (mesmo compute)
       └─ BiKpiEvidenceService                registros de origem (mesmos where do total)
```

Decisões:

1. **Snapshot bruto + cálculo puro.** O service só busca totais; cada KPI é uma função pura
   `compute(snapshot)` no catálogo, ao lado da sua fórmula textual. O mesmo `compute` roda para o
   período atual e o de comparação — nunca duas implementações do mesmo KPI.
2. **Sem arquitetura paralela.** Custos, receita, distância e tempo de frota vêm das funções já
   existentes em `fleet-operations` (extraídas, sem mudança de regra). `/fleet-operations/costs` passou
   a usar o mesmo núcleo, então BI e tela existente não podem divergir.
3. **Período sempre explícito** (`startDate`/`endDate` obrigatórios); data sem hora no fim = dia inteiro
   (`23:59:59.999Z`). Janela máxima 731 dias.
4. **Indisponível ≠ zero.** Sem denominador confiável o KPI volta `status: UNAVAILABLE`, `value: null`
   e `unavailableReason`.
5. **Sem persistência nova, sem migration.** Tudo calculado on-the-fly.
6. **RBAC** igual ao dashboard executivo (`DASHBOARD_ROLES`: SUPER_ADMIN/ADMIN/MANAGER) e módulo de
   plano `DASHBOARDS` — receita/margem são dado financeiro sensível.

## 3. Contrato do KPI (preparado para IA futura)

Cada item de `kpis[]` em `/bi/kpis/summary`:

| Campo | Conteúdo |
|---|---|
| `id`, `name`, `description`, `category`, `unit`, `direction` | Identificação; `direction` diz se subir é bom/ruim/neutro |
| `formula`, `sources[]`, `dimensions[]`, `limitations[]` | Regra de cálculo, tabela/campo/campo de data/regra de cada fonte |
| `status`, `value`, `unavailableReason` | Valor apurado |
| `period` | Período de apuração |
| `comparison` | `{ period, value, absoluteChange, percentChange, unavailableReason }` (p.p. para `PERCENT`) |
| `inputs[]` | Componentes usados no cálculo (ex.: custo/km → custos por categoria + distância + veículos qualificados) |
| `evidence[]` | Fonte de registros + contagem + `listable` (drill-down disponível) |

O envelope traz `catalogVersion`, `calculatedAt`, `scope { tenantId, vehicleId, fleetId }`,
`period`, `comparisonMode`, `comparisonPeriod`. Uma IA futura deve **ler** esses campos para
interpretar/explicar — nunca recalcular.

Cadeia de rastreabilidade: **KPI → inputs → evidence (contagens) → `GET /bi/kpis/:kpiId/evidence?source=`
→ registros de origem** (id, data, valor, veículo, viagem, descrição), com o mesmo where do total —
a soma dos registros listados bate com o KPI (testado).

## 4. KPIs implementados

| id | Unidade | Fórmula | Fonte (campo de data) |
|---|---|---|---|
| `revenue` | BRL | Σ `TripRevenue.amount` | `receivedAt` |
| `operating_cost` | BRL | combustível + manutenção + pneus + pedágio + outras despesas | ver §5 |
| `operating_result` | BRL | revenue − operating_cost | — |
| `operating_margin` | % | (revenue − operating_cost) / revenue × 100 | indisponível sem receita |
| `fuel_cost` | BRL | Σ `FuelSupply.totalAmount` | `supplyDate` |
| `toll_cost` | BRL | Σ `TollTransaction.chargedAmount` (cobrança real) | `chargedAt` |
| `maintenance_cost` | BRL | Σ `VehicleMaintenance.totalCost`, exceto CANCELLED | `openedAt` |
| `trips_completed` | un. | COUNT `Trip` COMPLETED, não excluída | `actualArrival` |
| `deliveries_completed` | un. | COUNT `TripDeliveryStop` COMPLETED | `deliveredAt` |
| `distance_km` | km | Σ por veículo (máx − mín odômetro), ≥ 2 leituras | `FuelSupply`/`VehicleMaintenance` |
| `cost_per_km` | R$/km | operating_cost / distance_km | = `costPerKm.value` de `/costs` |
| `revenue_per_km` | R$/km | revenue / distance_km | — |
| `fuel_liters` | L | Σ `FuelSupply.liters` | `supplyDate` |
| `occurrences_total` | un. | COUNT `TripOccurrence` não cancelada | `occurredAt` |
| `occurrences_critical` | un. | idem, severity CRITICAL | `occurredAt` |
| `on_time_delivery_rate` | % | entregas com chegada real ≤ `plannedArrival` / entregas COMPLETED com `plannedArrival` × 100 | `deliveredAt`; input `coverage` |
| `fleet_utilization` | % | horas em viagem recortadas ao período / (veículos × horas do período) × 100 | `Trip.actualDeparture→actualArrival` |
| `fleet_availability` | % | (capacidade − horas em manutenção) / capacidade × 100 | `VehicleMaintenance (startedAt??openedAt)→completedAt` |
| `idle_hours` | h | Σ períodos ociosos entre viagens recortados ao período − manutenção | regra de `/idle-time` |

Detalhes das regras de tempo de frota (`bi/utils/fleet-time.util.ts`):
- capacidade = por veículo com status atual ≠ SOLD/INACTIVE, de `max(início, createdAt)` até
  `min(fim, agora)` — período em andamento nunca conta o futuro;
- viagens: intervalos unidos por veículo (sem minuto duplicado); viagem ativa conta até agora;
- manutenção: OS aberta vai até o fim efetivo; sobreposições unidas (`mergeIntervals`).

Dimensões aceitas hoje por todos os KPIs: `period`, `vehicle` (`vehicleId`), `fleet` (`fleetId`).

## 5. Composição de `operating_cost` (reaproveitada da Fase 40/85, sem alteração)

| Componente | Fonte | Regra |
|---|---|---|
| Combustível | `FuelSupply.totalAmount` | — |
| Manutenção | `VehicleMaintenance.totalCost` | exclui CANCELLED; inclui peças/mão de obra |
| Pneus | `Tire.purchasePrice` + `TireRetread.cost` | aquisição/recapagem |
| Pedágio | `TollTransaction.chargedAmount` | cobrança real, nunca estimativa |
| Outras despesas | `TripExpense.amount` | só APPROVED; exclui FUEL/MAINTENANCE/TIRES (sem dupla contagem) |

## 6. Comparação entre períodos

`comparison` = `PREVIOUS_PERIOD` (padrão; mesmo `computePreviousPeriodRange` de `/costs` e `/fuel`),
`PREVIOUS_YEAR`, `CUSTOM` (`compareStartDate`/`compareEndDate` obrigatórios) ou `NONE`.
`percentChange` é `null` quando o valor de comparação é 0 ou indisponível (nunca `Infinity`).
A estrutura aceita qualquer par de períodos, preparando tendências (BI 7).

## 7. Divergências conhecidas com telas existentes (não alteradas nesta fase)

| Tela | Indicador | Diferença | Recomendação |
|---|---|---|---|
| `GET /dashboard` | `financial.profit`/`margin` | receita − `TripExpense` aprovada (não soma `FuelSupply`/pedágio/manutenção) | migrar para `operating_result` no BI 3 |
| `GET /dashboard` | contadores de viagens | recortados por `createdAt` (viagens criadas) | usar `trips_completed` no BI 2 |
| `GET /dashboard` | `operational.kmDriven` | `TripMetrics.actualDistanceKm` (só preenchido quando a viagem é concluída com odômetro final) | usar `distance_km` no BI 2 |
| `GET /fleet-operations/operations` | `utilizationPercent` | duração total de viagens *criadas* no período / veículos ACTIVE | usar `fleet_utilization` no BI 4 |

As telas antigas foram preservadas para não quebrar contratos testados; a camada de BI é a fonte
oficial daqui em diante.

## 8. Dependências para fases futuras (`pending` no catálogo)

- **Consumo km/L** — já existe em `/fleet-operations/fuel`; entra no catálogo no BI 4.
- **Disponibilidade por status administrativo** — exige histórico de `Vehicle.status`.
- **Km carregado × km vazio** — exige `TripMetrics.actualDistanceKm` preenchido de forma consistente.
- Dimensões **motorista/cliente** e **série mensal por KPI** — não expostas ainda (as fontes nem
  sempre têm o vínculo direto); previstas para BI 2/3/7.

## 9. Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/bi/kpis` | Catálogo (fórmula, fontes, unidades, limitações) + KPIs pendentes |
| GET | `/bi/kpis/summary` | `startDate`, `endDate` (obrig.), `comparison`, `compareStartDate`, `compareEndDate`, `vehicleId`, `fleetId`, `kpis` (csv) |
| GET | `/bi/kpis/:kpiId/evidence` | `source`, `startDate`, `endDate`, `vehicleId`, `fleetId`, `page`, `pageSize` |

Erros: 400 (período inválido/invertido/> 731 dias, KPI desconhecido na lista, `CUSTOM` sem datas,
fonte que não compõe o KPI ou derivada `FLEET_TIME`), 404 (KPI desconhecido no path; `vehicleId`/
`fleetId` inexistente **no tenant** — nunca revela existência em outro tenant), 403 (perfil fora de
`DASHBOARD_ROLES`), 401 (sem token).

## 10. Arquivos

**Criados (API)** — `apps/api/src/bi/`: `bi.module.ts`, `controllers/bi-kpis.controller.ts`,
`dto/bi-kpi-query.dto.ts`, `entities/bi-kpi.entity.ts`, `kpis/kpi.types.ts`, `kpis/kpi-catalog.ts`,
`services/bi-kpis.service.ts`, `services/bi-kpi-snapshot.service.ts`, `services/bi-kpi-evidence.service.ts`,
`utils/kpi-period.util.ts`, `utils/fleet-time.util.ts`, `utils/bi-where.util.ts`,
`utils/build-kpi-results.util.ts`, `utils/kpi-evidence-sources.util.ts` + 3 specs;
`apps/api/test/bi-kpis.e2e-spec.ts`.

**Alterados (API)**:
- `fleet-operations/services/fleet-operations-metrics.service.ts` — extrai `computeCostTotals()`,
  `computeRevenueTotals()`, `buildCostSourceWheres()`, `buildRevenueSourceWhere()`; `computeCosts()` e o
  período anterior de `/costs` passam a usá-los (mesmas queries/regras).
- `fleet-operations/services/fleet-idle-time.service.ts` — extrai `loadVehicleIdleData()` (aceita
  também `fleetId`); `getIdleTime()` inalterado externamente.
- `fleet-operations/fleet-operations.module.ts` — exporta `FleetIdleTimeService`.
- `app.module.ts` — registra `BiModule`.

**Front-end (mínimo)** — `apps/admin-web/src/types/entities.ts` (tipos `Kpi*`),
`apps/admin-web/src/lib/api/bi.api.ts` (+ teste). Nenhuma tela alterada.

**Migrations**: nenhuma.

## 11. Estratégia de testes

- **Unitários (puros)**: `kpi-period.util.spec.ts` (limites de período, comparação, variação, divisão
  por zero), `fleet-time.util.spec.ts` (recorte, sobreposição, viagem ativa, manutenção aberta,
  cadastro no meio do período, período em andamento), `build-kpi-results.util.spec.ts` (todas as
  fórmulas, snapshot vazio sem NaN/Infinity, comparação, p.p., evidências, entrega no prazo).
- **E2E** (`bi-kpis.e2e-spec.ts`, banco real): valores de cada família de KPI, fim de período
  inclusivo, período sem dados, **consistência com `/fleet-operations/costs` e `/financial`**,
  comparação PREVIOUS_PERIOD/PREVIOUS_YEAR/CUSTOM, soma das evidências = KPI, isolamento entre
  tenants (valores, evidências, ids de outro tenant → 404), RBAC (OPERATOR/DISPATCHER/AUDITOR → 403,
  MANAGER → 200, sem token → 401), validação.
- **Regressão**: e2e de `cost-per-km`, `fleet-operations-financial`, `fleet-operations-fuel`,
  `fleet-operations-idle-time`, `dashboard`, `fleet-operations`.

## 12. BI 2 — Central de Inteligência (`/dashboard`)

O `/dashboard` do admin-web passou a ser a **Central de Inteligência** e consome **somente**
`GET /bi/kpis/summary` (uma chamada por período, compartilhada entre as abas de dados via cache do
React Query). O endpoint antigo `GET /dashboard` continua na API (sem alteração, com seus e2e), mas
não é mais usado pela tela — com isso saíram da visão os indicadores divergentes listados no §7
(`profit`, contadores por `createdAt`, `kmDriven`); a utilização exibida é `fleet_utilization`.

- **Abas** (`?aba=`): Visão geral e Operação com dados; Financeiro (BI 3), Frota (BI 4), Custos (BI 5),
  Prazos (BI 6) e Ocorrências (BI 8) só com navegação e atalhos para as telas detalhadas existentes —
  sem números fictícios e sem chamada à API.
- **Período único** (`?periodo=today|7d|30d|3m|custom&de=&ate=`), em dias locais, enviado como ISO;
  comparação padrão com o período anterior equivalente.
- **Cor = significado**: verde/vermelho seguem o `direction` do KPI (melhora/piora, não subida/descida),
  azul para variação neutra, amarelo para indisponível/cobertura baixa, roxo para “Como é calculado”.
- **Contexto do KPI** (“Como é calculado”): fórmula, valores considerados (`inputs`), contagem de
  registros de origem (`evidence`), fontes e limitações — tudo da resposta do summary, sem chamada extra.
- **Drill-down**: cada KPI com tela detalhada já existente recebe link (mapa em
  `apps/admin-web/src/features/intelligence/intelligence-config.ts`).
- Perfis fora de `DASHBOARD_ROLES` veem “Acesso restrito” e a tela não chama a API (o backend continua
  sendo a autoridade: 403).

**Dependência para fases seguintes**: não existe série temporal por KPI na API (ex.: viagens por
semana/mês com a regra oficial). Por isso a “evolução” da aba Operação é a comparação período atual ×
anterior. Um endpoint de série (`/bi/kpis/series`, mesmo `compute` do catálogo por intervalo) é
pré-requisito para gráficos de evolução no BI 3 e para o BI 7.
