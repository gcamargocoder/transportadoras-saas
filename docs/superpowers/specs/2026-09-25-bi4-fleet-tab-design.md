# BI 4 — Aba Frota da Central de Inteligência (design)

## 0. Objetivo

Transformar a aba "Frota" da Central de Inteligência (`/dashboard`), hoje um placeholder
(`UpcomingTab`, fase "BI 4"), numa visão gerencial real do desempenho da frota, seguindo a
sequência VER → ENTENDER → INVESTIGAR: utilização, disponibilidade, ociosidade, evolução no
tempo, composição do tempo da frota e — quando os dados sustentarem com confiabilidade —
desempenho por veículo.

KPIs oficiais usados (já existentes no catálogo, nenhuma fórmula nova): `fleet_utilization`,
`fleet_availability`, `idle_hours`, `trips_completed`, `distance_km`.

## 1. Auditoria prévia — o que já existia

Antes de desenhar qualquer coisa nova, foi inspecionado o que o BI 1–3 já entrega. A conclusão
muda bastante o escopo real do BI 4: a maior parte do cálculo já existe, o trabalho novo é
essencialmente **expor por veículo** o que já é calculado agregado, e **montar a tela**.

| Item | Já existia | Onde |
|---|---|---|
| Catálogo dos 5 KPIs de frota (fórmula, fontes, `additive`, dimensões `period/vehicle/fleet`) | Sim, desde BI 1 | `apps/api/src/bi/kpis/kpi-catalog.ts` |
| Cálculo de tempo da frota (capacidade/viagem/manutenção/ociosidade) | Sim — `computeFleetTimeTotals`, já opera **por veículo** dentro do loop antes de agregar | `apps/api/src/bi/utils/fleet-time.util.ts` |
| Carga de dados por veículo (viagens + manutenções) | Sim — `FleetIdleTimeService.loadVehicleIdleData` retorna um array por veículo, 3 queries fixas (nunca 1 por veículo) | `apps/api/src/fleet-operations/services/fleet-idle-time.service.ts` |
| Distância por veículo | Sim — `FleetCostTotals.distance.vehicleDistances: Map<vehicleId, km>`, já calculado sempre que a parte `distance` do snapshot é pedida | `apps/api/src/fleet-operations/services/fleet-operations-metrics.service.ts` |
| Where oficial de viagens concluídas (usado por `trips_completed`) | Sim — `buildCompletedTripWhere` (tenant + `COMPLETED` + `actualArrival` no período + escopo veículo/frota via `TripComposition`) | `apps/api/src/bi/utils/bi-where.util.ts` |
| Série temporal (`GET /bi/kpis/series`), com granularidade dia/semana/mês, timezone do tenant, baldes parciais, `UNAVAILABLE`, comparação | Sim, BI 3 completo | `apps/api/src/bi/services/bi-kpi-series.service.ts` |
| Recorte por dimensão (`GET /bi/kpis/breakdown`) | Sim, mas só `kpiId=revenue&dimension=customer` | `apps/api/src/bi/services/bi-kpi-breakdown.service.ts`, `bi-kpi-query.dto.ts` |
| Painel "Como é calculado" | Sim, genérico, já usado por todas as abas | `kpi-detail-drawer.tsx` |
| Cards de KPI (valor, unidade, comparação, `UNAVAILABLE`, drill-down, "como é calculado") | Sim, genérico | `kpi-card.tsx` |
| Composição do tempo (Viagem/Manutenção/Ocioso/Sem registro) | Sim — `FleetTimeBand`, já renderizada hoje **dentro da aba Operação**, a partir dos `inputs` de `fleet_utilization` | `fleet-time-band.tsx`, usado em `operation-tab.tsx` |
| Drill-downs `fleet_utilization`/`fleet_availability` → `/operations/fleet`, `idle_hours` → `/operations/control-tower`, `trips_completed` → `/trips`, `distance_km` → `/operations/fleet/costs` | Sim | `intelligence-config.ts` (`KPI_DRILL_DOWN`) |
| Detalhe de veículo (destino de drill-down por linha da tabela) | Sim | `/vehicles/[id]` |
| Aba "Frota" cadastrada na navegação | Sim, como `upcoming` | `intelligence-config.ts` |
| Filtro de veículo/frota na Central (UI) | **Não existe.** A API já aceita `vehicleId`/`fleetId` (`BiKpiScopeQueryDto`), mas `page.tsx` nunca os envia — só período. | `apps/admin-web/src/app/(app)/dashboard/page.tsx` |
| Seletor genérico para veículo (busca) e frota (lista pequena) | Sim — `SearchCombobox` e `EntitySelect`, e `listVehicles`/`listFleets` no client de API | `components/ui/search-combobox.tsx`, `entity-select.tsx`, `lib/api/fleet.api.ts` |
| Tabela com busca/ordenação/estado vazio/erro/loading | Sim, genérica | `components/ui/data-table.tsx` |

**Nada disso será recriado.** O trabalho novo do BI 4 é:

1. Expor por veículo o que os coletores já computam agregado (refino de
   `fleet-time.util.ts`, projeção do `vehicleDistances` já existente, agrupamento em memória do
   mesmo `where` de `trips_completed`).
2. Estender `GET /bi/kpis/breakdown` para aceitar `dimension=vehicle` nesses 5 KPIs.
3. Construir a aba Frota (`fleet-tab.tsx`) reaproveitando 100% dos componentes de apresentação
   já existentes.
4. Mover o bloco de frota hoje duplicável (Operação) para a aba Frota.
5. Adicionar um filtro de veículo/frota **local à aba Frota**.

## 2. Decisões arquiteturais (aprovadas)

### 2.1 Filtro de veículo/frota é local à aba Frota, mas usa a MESMA camada oficial

A Central hoje não tem filtro de veículo/frota em nenhuma aba — só período. Em vez de introduzir
esse filtro no `page.tsx` compartilhado (risco de regressão nas abas Visão Geral/Operação/
Financeiro, vedado pela seção 15.9 do pedido), o filtro fica **dentro da aba Frota**, do mesmo
jeito que a aba Financeiro já tem controles próprios (granularidade, comparação) além do filtro
global de período.

Importante (ajuste pedido pelo usuário): isso **não é uma segunda lógica de filtro**. O filtro da
aba Frota monta os mesmos parâmetros `vehicleId`/`fleetId` que `BiKpiScopeQueryDto` já aceita, e
todas as chamadas da aba (summary específico da aba, série, breakdown) passam por
`BiKpisService.resolveScope` — a mesma validação de tenant/404 cross-tenant do BI 1. Sem filtro
selecionado, a aba **reaproveita o summary global da página** (a mesma chamada que Visão
Geral/Operação já usam, sem refazer a consulta); com filtro selecionado, a aba dispara **um
summary adicional só dela**, escopado, usando a mesma `BiKpisService.getSummary`. Cards, gráfico
de evolução e tabela por veículo sempre leem desse único resultado — nunca há dois caminhos de
cálculo para o mesmo número.

### 2.2 Bloco de frota migra de Operação para Frota (sem duplicar)

`operation-tab.tsx` remove o bloco "Distância e tempo da frota" (cards de
`distance_km`/`fleet_utilization`/`fleet_availability`/`idle_hours` + `FleetTimeBand`). Ele passa
a viver só na aba Frota. Operação fica focada em viagens/entregas/ocorrências. Mesmo componente
(`FleetTimeBand`), mesmo KPI, um único lugar — sem números repetidos em duas abas.

### 2.3 Breakdown por veículo reaproveita o endpoint único `GET /bi/kpis/breakdown`

`dimension` passa a aceitar `'vehicle'` (além de `'customer'`) para os 5 KPIs de frota. A tabela
"Desempenho por veículo" dispara até 5 chamadas paralelas (uma por KPI), com cache do
react-query — não um endpoint novo, não uma segunda forma de resposta. Cada chamada já é
totalmente batelada (sem N+1 por veículo: `loadVehicleIdleData` é sempre 3 queries fixas,
independente do tamanho da frota). Não há breakdown por `fleet` nesta fase — só por `vehicle`,
que é o que a seção 5 do pedido descreve; fica registrado como extensão possível para BI 5/7.

### 2.4 `KpiBreakdownItemEntity.value` aceita `null` (aditivo)

Hoje `value: number` (receita por cliente nunca é null — soma sempre existe, mesmo que 0). Para
veículo, um veículo pode não ter capacidade no período (vendido antes, cadastrado depois, ou sem
nenhuma leitura de odômetro para `distance_km`). Esse veículo aparece na lista com
`value: null` + `unavailableReason`, nunca omitido silenciosamente nem com valor estimado. Mudança
aditiva: `customer` continua sempre preenchendo `value`.

### 2.5 Sem ranking implícito

A tabela por veículo permite ordenar por qualquer coluna, buscar por placa e comparar valores
lado a lado — mas não rotula nenhuma linha como "melhor" ou "pior veículo", nem calcula um score
composto. Ordenar por uma coluna é uma ferramenta de investigação do usuário, não um veredito do
sistema.

## 3. Backend

### 3.1 `apps/api/src/bi/utils/fleet-time.util.ts`

Extrair o corpo do loop de `computeFleetTimeTotals` (hoje por veículo, mas descartado após a
soma) para uma função pura:

```ts
export interface VehicleFleetTime {
  vehicleId: string;
  considered: boolean; // false = fora de operação/sem capacidade no período
  capacityMinutes: number;
  tripMinutes: number;
  maintenanceMinutes: number;
  idleNetMinutes: number;
  tripsConsidered: number;
  idleSegmentsConsidered: number;
}

export function computeVehicleFleetTime(vehicle: FleetTimeVehicleInput, period: KpiPeriod, now: Date): VehicleFleetTime
export function computeFleetTimeByVehicle(vehicles: FleetTimeVehicleInput[], period: KpiPeriod, now: Date): Map<string, VehicleFleetTime>
```

`computeFleetTimeTotals` passa a ser implementado por cima de `computeFleetTimeByVehicle`
(soma os campos do Map) — **uma única implementação da regra**, dois pontos de consumo (agregado
e por veículo). Testado por igualdade: soma dos valores por veículo == totais agregados (mesma
garantia que já existe para a série temporal com KPIs `additive`).

### 3.2 `apps/api/src/bi/services/bi-kpi-breakdown.service.ts`

Novos métodos, cada um reaproveitando exatamente as fontes/regras do KPI equivalente:

- `fleetUtilizationByVehicle` / `fleetAvailabilityByVehicle` / `idleHoursByVehicle`: chamam
  `FleetIdleTimeService.loadVehicleIdleData` + `computeFleetTimeByVehicle`, aplicam a MESMA razão
  do catálogo (`tripMinutes/capacityMinutes`, `(capacity-maintenance)/capacity`,
  `idleNetMinutes/60`) por linha. `considered=false` ou `capacityMinutes=0` → `value: null` +
  `unavailableReason` (mesmo texto `NO_FLEET_CAPACITY` do catálogo, reaproveitado).
- `tripsCompletedByVehicle`: `prisma.trip.findMany({ where: buildCompletedTripWhere(...), select: { composition: { select: { vehicleId: true } } } })`, agrupado em memória. Mesmo `where` do KPI — não é uma consulta paralela.
- `distanceByVehicle`: projeta `snapshot.costs.distance.vehicleDistances` (nenhuma query nova —
  o dado já vem carregado quando a parte `distance` é pedida). Veículo fora do Map →
  `value: null` + o mesmo `NO_DISTANCE` do catálogo.

Todos os métodos: filtram por `scope` (vehicleId/fleetId) do mesmo jeito que
`loadVehicleIdleData`/`buildCompletedTripWhere` já fazem, buscam nome/placa via
`prisma.vehicle.findMany({ where: { tenantId, id: { in }, deletedAt: null } })` (mesmo padrão de
`revenueByCustomer`), ordenam por valor desc (nulls por último) e aplicam limit/others.

### 3.3 `apps/api/src/bi/dto/bi-kpi-query.dto.ts` e `bi-kpis.service.ts`

- `BREAKDOWN_DIMENSIONS`: `['customer', 'vehicle']`.
- `getBreakdown`: dispatcher por `(kpiId, dimension)` — `revenue×customer` (existente,
  inalterado) e os 5 KPIs de frota `×vehicle` (novo). Qualquer outra combinação continua 400.
- `limit`: mantém default 5 (preserva o comportamento de `customer`); teto sobe de 20 para um
  valor que cubra frotas reais sem truncar a investigação (a decidir o número exato na
  implementação, documentado no plano) quando `dimension=vehicle`.

### 3.4 `apps/api/src/bi/entities/bi-kpi.entity.ts`

- `KpiBreakdownItemEntity.value`: `number` → `number | null` (nullable, aditivo) +
  `unavailableReason?: string | null`.
- `KpiBreakdownEntity.dimension`: `'customer'` → `'customer' | 'vehicle'`.

### 3.5 Sem mudança em `kpi-catalog.ts` nem `KPI_CATALOG_VERSION`

Nenhuma fórmula de KPI muda. `additive` de cada KPI continua governando a semântica da série
(idle_hours/trips_completed somáveis; fleet_utilization/fleet_availability/distance_km não —
distance_km em particular nunca é somado entre baldes, cada balde é uma apuração independente,
já garantido pelo BI 3).

## 4. Frontend (`apps/admin-web/src`)

### 4.1 `features/intelligence/fleet-tab.tsx` (novo)

Estrutura (VER → ENTENDER → INVESTIGAR):

1. **Resumo** — 5 `KpiCard` (fleet_utilization, fleet_availability, idle_hours, trips_completed,
   distance_km), do summary da aba (global ou escopado — ver 2.1).
2. **Evolução temporal** — `getKpiSeries` com os 4 KPIs prioritários (utilização,
   disponibilidade, horas ociosas, viagens concluídas; distância entra como card + breakdown, não
   como linha de tendência somada, dado que não é somável), controle de granularidade
   dia/semana/mês e comparação com período anterior — mesmo padrão de `financial-tab.tsx`
   (`TrendLineChart`, `toSeriesRows`, `SeriesTable` para a tabela equivalente).
3. **Composição do tempo da frota** — `FleetTimeBand` (rótulo do último segmento ajustado para
   "Não registrado / cobertura insuficiente"), com nota explícita de que ausência de dado não é
   ociosidade.
4. **Desempenho por veículo** — `DataTable` com colunas Veículo (placa, link `/vehicles/[id]`),
   Utilização, Disponibilidade, Ociosidade, Viagens, Distância; busca por placa (`SearchInput` +
   `useDebounce`, mesmo padrão de `vehicles/page.tsx`), ordenação client-side por coluna (sem
   rótulo de ranking), célula `UNAVAILABLE` mostra "—" + motivo em tooltip/legenda (nunca 0).
5. **Filtro local** — `SearchCombobox` (veículo, busca por placa via `listVehicles`) +
   `EntitySelect` (frota, via `listFleets`), acima do bloco 1, aplicando a todos os 4 blocos.

### 4.2 `features/intelligence/operation-tab.tsx`

Remove o bloco "Distância e tempo da frota" (cards + `FleetTimeBand`) e o import correspondente.

### 4.3 `features/intelligence/intelligence-config.ts`

Aba `fleet` perde `upcoming`; drill-downs existentes (`fleet_utilization`, `fleet_availability`,
`idle_hours`, `trips_completed`, `distance_km`) não mudam.

### 4.4 `lib/api/bi.api.ts`

`BiKpiBreakdownQuery.dimension`: `'customer'` → `'customer' | 'vehicle'`.

### 4.5 `app/(app)/dashboard/page.tsx`

Passa a renderizar `<FleetTab>` quando `tab === 'fleet'`, incluindo `fleet` em `DATA_TABS`. O
summary global da página continua sendo pedido uma vez só; a aba Frota decide internamente se
usa esse resultado ou dispara um summary escopado (2.1).

## 5. Testes

### 5.1 API (`apps/api/test/bi-kpis.e2e-spec.ts` + specs unitários)

- `fleet-time.util.spec.ts`: soma por veículo (`computeFleetTimeByVehicle`) bate com o agregado
  (`computeFleetTimeTotals`), veículo sem capacidade no período fica de fora/considered=false,
  veículo vendido no meio do período.
- Novo `describe('recorte por veiculo (BI 4)')`, espelhando `describe('recorte por cliente')`:
  soma dos itens = valor do KPI no summary; `UNAVAILABLE` por veículo com motivo (sem
  capacidade/sem odômetro), nunca 0 inventado; filtro por veículo/frota recorta igual ao summary;
  isolamento entre tenants (404 cross-tenant, nunca lista veículo de outro tenant); dimensão não
  suportada (`fleet`, ou KPI fora da lista) → 400; consistência summary × breakdown (mesmo
  `where`); ausência de N+1 (contagem de queries fixa independente do nº de veículos).
- Divisão por zero / período vazio para os 5 KPIs (já parcialmente coberto por BI 1, reforçar
  para o recorte por veículo).

### 5.2 Frontend

- `fleet-tab`: cards com valor/unidade/comparação, evolução (loading/erro/vazio/`partial`),
  composição do tempo (rótulo "Não registrado", nunca ocioso por padrão), tabela por veículo
  (busca, ordenação, `UNAVAILABLE` por célula, link para o veículo), filtro local (com e sem
  seleção, reaproveitando/não reaproveitando o summary global), "Como é calculado" nos 5 KPIs,
  drill-down para as telas já existentes.
- Regressão: `operation-tab` sem o bloco de frota; `page.test.tsx` (abas Visão Geral/Operação/
  Financeiro inalteradas, cache compartilhado entre abas).
- Suíte completa, `next build`, `typecheck`, `lint`. Falha pré-existente conhecida em
  `parts/page.test.tsx` permanece separada, se persistir.

## 6. Fora de escopo nesta fase

Custos/rentabilidade (BI 5), IA, alertas/anomalias, relatórios inteligentes, mapa de ocorrências,
previsões, metas, breakdown por `fleet`, alteração de qualquer fórmula oficial existente, remoção
do `/dashboard` legado.

## 7. Documentação

Ao final, acrescentar seção "## 14. BI 4 — Aba Frota" em `docs/bi-kpis.md`, no mesmo formato das
seções de BI 2/BI 3 já existentes nesse arquivo.
