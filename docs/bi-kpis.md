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
| `tire_cost` (BI 3) | BRL | Σ `Tire.purchasePrice` + Σ `TireRetread.cost` | `purchaseDate` / `retreadDate` |
| `other_cost` (BI 3) | BRL | Σ `TripExpense.amount` APPROVED, exceto FUEL/MAINTENANCE/TIRES (inputs por categoria) | `expenseDate` |
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
BI 3: `customer` (`customerId`) só em `revenue` — ver §13.

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

- **Abas** (`?aba=`): Visão geral, Operação e — desde o BI 3 — Financeiro com dados (§13.4); Frota (BI 4),
  Custos (BI 5), Prazos (BI 6) e Ocorrências (BI 8) só com navegação e atalhos para as telas detalhadas
  existentes — sem números fictícios e sem chamada à API.
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
pré-requisito para gráficos de evolução no BI 3 e para o BI 7. **Atendido no BI 3 (§13.2)**; a aba
Operação ainda usa só a comparação — adotar a série nela fica para o BI 4/7.

## 13. BI 3 — Série temporal, recorte por cliente e aba Financeiro

### 13.1 Catálogo v2

`KPI_CATALOG_VERSION = '2'`. **Nenhuma fórmula mudou.** Entraram `tire_cost` e `other_cost` (as
duas parcelas de `operating_cost` que ainda não eram KPI) e dois metadados por KPI:

- `requires` — partes do snapshot que o `compute` lê (`revenue`, `costs`, `distance`, `trips`,
  `deliveries`, `occurrences`, `fleetTime`). Um teste roda cada KPI com as partes não declaradas
  “envenenadas” (lançam erro se lidas), garantindo que a série pode pular a coleta delas.
- `additive` — `true` quando a soma dos pontos da série = valor do período (somas e contagens).
  Razões (`*_per_km`, margem, pontualidade, utilização, disponibilidade) e `distance_km` são `false`.

### 13.2 `GET /bi/kpis/series`

Parâmetros: `kpis` (1..12, CSV), `startDate`, `endDate`, `granularity` (`day|week|month`; omitido =
automático: ≤45 dias → dia, ≤190 → semana, senão mês), `comparison` (`PREVIOUS_PERIOD|PREVIOUS_YEAR|NONE`,
padrão `NONE`), `vehicleId`, `fleetId`, `customerId`. Mesmo RBAC/módulo do summary.

```
BiKpisService.getSeries
  ├─ parsePeriod / resolveScope (mesmas validações do summary; ids de outro tenant → 404)
  ├─ timezone = TenantSettings.timezone (lido no servidor; inválido → America/Sao_Paulo)
  ├─ buildKpiBuckets(período, granularidade, fuso)   dia / semana ISO / mês do calendário do tenant
  └─ BiKpiSeriesService.build
       ├─ requiredParts(KPIs)                          união de `requires`
       ├─ BiKpiSnapshotService.collect(baldes, parts)  MESMO coletor do summary, 4 baldes por vez
       └─ computeKpi(definição, snapshot do balde)     MESMO compute do catálogo
```

- **Uma única fórmula**: cada balde é tratado como um período comum; não existe cálculo “de gráfico”.
  Testado: para KPIs aditivos, soma dos pontos = valor do summary no mesmo período.
- **Pontos**: `label` (início do balde no fuso do tenant: `AAAA-MM-DD` ou `AAAA-MM`), `start`/`end`,
  `partial` (balde recortado pelo período ou ainda em andamento), `status`, `value`,
  `unavailableReason`, `inputs`, `evidence` (contagem de registros de origem por ponto; o drill até os
  registros usa `GET /bi/kpis/:kpiId/evidence` com `start`/`end` do ponto).
- **Sem pontos artificiais**: balde sem registros tem o valor real (0 para somas, com `recordCount: 0`);
  razão sem denominador é `null`/`UNAVAILABLE`.
- **Comparação**: `comparisonPoints` = mesmo recorte de baldes no período de comparação, pareados por
  posição (ex.: PREVIOUS_YEAR mensal alinha nov↔nov).
- **Limites**: dia ≤ 62 pontos, semana ≤ 53, mês ≤ 25 (período máximo continua 731 dias) → 400 com
  orientação para aumentar a granularidade.
- **Custo de consulta**: por balde, só as agregações das partes pedidas (receita = 1 aggregate; custos =
  6 aggregates + 2 leituras de odômetro quando há KPI por km). Sem N+1 por registro: o número de queries
  cresce com o número de baldes, não com o volume de dados. Nenhum índice/migration novo foi necessário;
  se o volume crescer, a evolução natural é um agregado diário materializado alimentado pelas mesmas funções.
- **Distância por balde**: `distance_km`/`*_per_km` usam o odômetro DENTRO de cada balde; a soma das
  distâncias dos baldes é menor que a do período inteiro (o trecho entre a última leitura de um balde e a
  primeira do seguinte não pertence a nenhum). Por isso são `additive: false`.

### 13.3 Dimensões

| Dimensão | Situação | Motivo |
|---|---|---|
| período, veículo, frota | Todos os KPIs | Já existiam (BI 1) |
| **cliente** | **Só `revenue`** (`customerId` no summary/série/evidências + `GET /bi/kpis/breakdown`) | `TripRevenue.customerId` é vínculo direto, indexado `(tenantId, customerId)`. KPIs sem a dimensão voltam `UNAVAILABLE` com motivo (nunca receita do cliente − custo da frota inteira) |
| custo por cliente | Não implementado | Manutenção/pneus não têm viagem; combustível tem `tripId` opcional. Atribuir custo a cliente exige regra de rateio — decisão de negócio para o BI 5 |
| rota | Não implementado | Não existe entidade “rota” estável (origem/destino são `Location` por viagem); agrupar exige definição de rota — BI 5/7 |
| viagem | Coberto por drill-down | O resultado por viagem já existe em `GET /trips/:id/financial-result` |
| motorista | Fora do escopo do BI 3 | — |

`GET /bi/kpis/breakdown?kpiId=revenue&dimension=customer&limit=5`: mesmo where do KPI `revenue`,
particionado por `TripRevenue.customerId` (`null` = “Sem cliente”); o que passa do `limit` vira `others`.
Testado: soma(items) + others = revenue. Nomes resolvidos com `tenantId` no filtro.

### 13.4 Aba Financeiro (admin-web)

- **Resumo** (mesmo summary das outras abas, sem nova chamada): `revenue`, `operating_cost`,
  `operating_result`, `operating_margin`, `cost_per_km`, `revenue_per_km`, com comparação,
  “Como é calculado” e drill-down para `/operations/fleet/financial` e `/operations/fleet/costs`.
- **Evolução** (1 chamada a `/series` com 9 KPIs e `PREVIOUS_PERIOD`): receita, despesas operacionais e
  margem (linha atual × anterior tracejada) e resultado (barras verde/vermelho pelo sinal). Agrupamento
  dia/semana/mês na URL (`?agrupar=`); opções que a API recusaria ficam desabilitadas. Tabela acessível
  com os mesmos pontos.
- **Composição dos custos**: barras empilhadas por balde (`fuel_cost`, `maintenance_cost`, `tire_cost`,
  `toll_cost`, `other_cost`) + lista do período com valores e participação (entradas oficiais de
  `operating_cost`). Paleta categórica validada (CVD/visão normal); o contraste baixo de 3 cores é
  compensado por legenda e valores em texto.
- **Receita por cliente**: top 5 + demais, com link para `/customers/:id`.

Escopo financeiro × BI 5: o BI 3 cobre o **resultado operacional** (receita de viagem − custos
realizados da frota). Ficam para o BI 5: rentabilidade por cliente/rota/veículo com rateio de custos,
custo por viagem consolidado e a ponte com o financeiro contábil.

**Operacional × contábil**: os KPIs do BI são operacionais (data do evento: `receivedAt`, `supplyDate`...).
Contas a receber/pagar, fluxo de caixa (`/finance/cash-flow`) e o fechamento mensal (`FinancialPeriod`,
Fase 76) são o mundo contábil e **não** foram misturados aqui — os números podem divergir legitimamente.

### 13.5 Legado `GET /dashboard`

- admin-web: nenhuma tela chama o endpoint; resta só o cliente `lib/api/dashboard.api.ts`, sem uso.
- driver-app: não usa.
- API: `dashboard.e2e-spec.ts` o testa, e **`DashboardChartPointEntity` (dashboard/entities) é importada
  por `fleet-operations`** (`computeCostsMonthlyTrend`) — remover o módulo quebraria esse import.

Recomendação: descontinuar em fase própria — mover `DashboardChartPointEntity` para `common/`, marcar o
endpoint como deprecated no Swagger por um ciclo, remover `dashboard.api.ts` e só então o módulo.
Nada foi removido no BI 3.

## 14. BI 4 — Aba Frota

Spec completa: `docs/superpowers/specs/2026-09-25-bi4-fleet-tab-design.md`. Plano de implementação
(TDD, task a task): `docs/superpowers/plans/2026-09-25-bi4-fleet-tab.md`.

**Auditoria prévia — o que já existia**: os 5 KPIs de frota (`fleet_utilization`,
`fleet_availability`, `idle_hours`, `trips_completed`, `distance_km`) já estavam completos no
catálogo desde o BI 1; `FleetIdleTimeService.loadVehicleIdleData` já carregava os dados **por
veículo**; `FleetCostTotals.distance.vehicleDistances` já era um mapa por veículo; os cards + a
`FleetTimeBand` (composição do tempo) já existiam, só que dentro da aba Operação; a aba `fleet` já
estava cadastrada na Central como `upcoming`. O trabalho do BI 4 foi expor por veículo o que já
era calculado agregado, e montar a tela.

### 14.1 O que foi criado

- **`GET /bi/kpis/breakdown` ganha `dimension=vehicle`** para os 5 KPIs de frota (além de
  `dimension=customer`, já existente para `revenue`). Mesmo endpoint, mesmo contrato — `dimension`
  e `limit` (agora até 500, para não truncar a tabela investigativa) são os únicos parâmetros novos.
- **`fleet-time.util.ts`** ganhou `computeVehicleFleetTime`/`computeFleetTimeByVehicle`: o cálculo
  por veículo que já existia dentro do loop de `computeFleetTimeTotals`, extraído para uma função
  pura própria. `computeFleetTimeTotals` passou a somar por cima dela — nenhuma fórmula mudou,
  testado por igualdade (soma dos veículos == agregado).
- **`vehicle-distance.util.ts`** ganhou `countOdometerReadingsByVehicle` (evidência do recorte de
  distância por veículo, do mesmo pool de leituras já carregado — nenhuma query nova).
- **`BiKpiBreakdownService`** ganhou 5 métodos (`fleetUtilizationByVehicle`,
  `fleetAvailabilityByVehicle`, `idleHoursByVehicle`, `tripsCompletedByVehicle`,
  `distanceByVehicle`), todos reaproveitando os coletores oficiais (`loadVehicleIdleData`,
  `computeCostTotals`, `buildCompletedTripWhere`).
- **Aba Frota** (`fleet-tab.tsx`): filtro local de veículo/frota, resumo (5 cards), evolução
  temporal (`fleet_utilization`/`fleet_availability`/`idle_hours`/`trips_completed` via
  `GET /bi/kpis/series`, `distance_km` fica só como card — não é somável entre baldes),
  composição do tempo (`FleetTimeBand`, migrada da aba Operação) e tabela "Desempenho por veículo"
  (`FleetVehicleTable`, com busca e ordenação, 5 chamadas paralelas ao breakdown).
- Bloco de frota **removido da aba Operação** (migrado, não duplicado).

### 14.2 Decisões de cálculo e agregação

- **Razões nunca são somadas nem entre veículos, nem entre baldes de tempo.** Para
  `fleet_utilization`/`fleet_availability`, o campo `total` do breakdown é o valor **oficial** do
  KPI (recalculado pela mesma função pura do catálogo, `findKpiDefinition(id).compute(...)`, sobre
  o agregado) — nunca a soma dos itens. `share` e `others` são sempre `null` para essas duas: não
  existe uma soma/média válida de percentuais entre veículos.
- **`idle_hours`, `trips_completed` e `distance_km` são somáveis entre veículos** (ainda que
  `distance_km` não seja somável entre baldes de tempo — são eixos diferentes): `total` = soma dos
  itens, `share` é a participação de cada veículo nesse total.
- **Veículo fora de operação ou fora da janela do período** (vendido antes, cadastrado depois,
  status atual SOLD/INACTIVE) → `value: null` + `unavailableReason`, nunca 0% inventado. Veículo
  com capacidade real e zero atividade (ex.: 0 viagens no período) → `0` de verdade, não
  `UNAVAILABLE`.
- **Registro histórico de veículo já removido do escopo atual** (viagem ou leitura de odômetro de
  um veículo que deixou de existir no filtro) nunca é descartado silenciosamente: entra como uma
  linha `"Veículo removido"` (`key: null`), preservando a soma = valor do KPI no summary.

### 14.3 Endpoints e contratos alterados

- `GET /bi/kpis/breakdown`: `dimension` aceita `'customer' | 'vehicle'`; `limit` até 500.
  `KpiBreakdownItemEntity.value`/`KpiBreakdownEntity.total` passam a aceitar `null`;
  `KpiBreakdownItemEntity` ganha `unavailableReason`. Mudança aditiva — `dimension=customer`
  (receita) nunca retorna `null` na prática, comportamento inalterado.
- Nenhum endpoint novo. `GET /bi/kpis/summary` e `GET /bi/kpis/series` não mudaram — a aba Frota só
  passa `vehicleId`/`fleetId` a mais, parâmetros que os DTOs já aceitavam desde o BI 1.
- `KPI_CATALOG_VERSION` não incrementou: nenhuma fórmula de KPI mudou.

### 14.4 Regras reutilizadas (nenhuma duplicada)

`loadVehicleIdleData`, `computeCostTotals`, `buildCompletedTripWhere`, `computeFleetTimeTotals`/
`computeVehicleFleetTime` (agora a mesma função pura por trás do agregado e do recorte),
`findKpiDefinition(id).compute` (fonte do `total` das razões), `KpiCard`, `TrendLineChart`,
`FleetTimeBand`, `DataTable`, `SearchCombobox`, `EntitySelect`, `kpi-detail-drawer.tsx`,
`KPI_DRILL_DOWN`.

### 14.5 Testes e resultados

- Unitário: `fleet-time.util.spec.ts` (equivalência agregado × por veículo),
  `vehicle-distance.util.spec.ts` (contagem de leituras), `bi-kpi-breakdown.service.spec.ts` (5
  métodos, mocks).
- e2e (`bi-kpis.e2e-spec.ts`, novo describe `recorte por veiculo (BI 4)`): soma dos itens = valor
  do summary (`trips_completed`, `distance_km`), `total`/`share`/`others` corretos para razões
  (`fleet_utilization`), veículo vendido antes do período (`UNAVAILABLE` com motivo), filtro por
  veículo, isolamento multi-tenant (404 cross-tenant, nunca vaza veículo de outro tenant),
  dimensão/KPI não suportados (400), consistência summary × breakdown.
- Frontend (`page.test.tsx`, novo describe `Central -- aba Frota (BI 4)`): resumo reaproveitando o
  summary global sem filtro, summary escopado ao selecionar veículo (e retorno ao global ao
  limpar), rótulo "Não registrado / cobertura insuficiente" na composição do tempo, tabela por
  veículo (célula `UNAVAILABLE` nunca vira 0, busca), ocultação da tabela com 1 veículo já
  filtrado, drill-down dos 5 cards, "Como é calculado", loading/erro/retry, e regressão da aba
  Operação (bloco de frota não aparece mais lá).
- Resultado: suíte unitária da API 93/93 arquivos, 864/864 testes; e2e da API completo; admin-web
  412/413 testes (a falha em `parts/page.test.tsx` é pré-existente, não relacionada a este
  trabalho); `next build`, `tsc --noEmit` (API e admin-web) e `eslint` das áreas alteradas sem
  erros.

### 14.6 Limitações e pontos para BI 5/BI 7

- Sem breakdown por `fleet` (só por `vehicle`) — extensão possível quando houver demanda.
- A tabela por veículo dispara 5 chamadas paralelas ao breakdown (uma por KPI) em vez de uma única
  chamada agregada — decisão deliberada para reaproveitar o contrato existente de
  `GET /bi/kpis/breakdown` sem criar uma segunda forma de resposta; aceitável dado que cada chamada
  já é totalmente batelada (sem N+1 por veículo).
- Filtro de veículo/frota continua **local à aba Frota** — a Central ainda não tem esse filtro em
  nenhuma outra aba; generalizá-lo (se algum dia fizer sentido para Financeiro/Custos) é trabalho
  futuro, não estrutural.
- Custos/rentabilidade por veículo (BI 5), alertas de anomalia na composição do tempo, comparação
  formal entre veículos com regra de negócio (não implementada de propósito — a tabela é
  investigativa) ficam para fases seguintes.
