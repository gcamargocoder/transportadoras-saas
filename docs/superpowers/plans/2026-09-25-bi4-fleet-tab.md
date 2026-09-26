# BI 4 — Aba Frota da Central de Inteligência — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a aba "Frota" (hoje placeholder) da Central de Inteligência (`/dashboard`) numa
visão gerencial real de utilização/disponibilidade/ociosidade/evolução/desempenho por veículo,
usando exclusivamente os KPIs oficiais já existentes (`fleet_utilization`, `fleet_availability`,
`idle_hours`, `trips_completed`, `distance_km`).

**Architecture:** Nenhuma fórmula de KPI muda. O trabalho novo é (1) expor **por veículo** o que os
coletores do BI 1–3 já calculam agregado (`FleetIdleTimeService.loadVehicleIdleData` já é por
veículo; `FleetCostTotals.distance.vehicleDistances` já é um mapa por veículo), estendendo
`GET /bi/kpis/breakdown` com `dimension=vehicle`; e (2) montar `fleet-tab.tsx` reaproveitando 100%
dos componentes de apresentação já existentes (`KpiCard`, `TrendLineChart`, `FleetTimeBand`,
`DataTable`, `SearchCombobox`, `EntitySelect`).

**Tech Stack:** NestJS + Prisma (API), Next.js App Router + React Query + Tailwind (admin-web),
Jest (unit + e2e).

**Spec:** `docs/superpowers/specs/2026-09-25-bi4-fleet-tab-design.md`

## Global Constraints

- Nenhuma fórmula do catálogo (`apps/api/src/bi/kpis/kpi-catalog.ts`) muda; `KPI_CATALOG_VERSION`
  não incrementa.
- Todo cálculo por veículo reaproveita os MESMOS coletores/where do KPI equivalente
  (`FleetIdleTimeService.loadVehicleIdleData`, `FleetOperationsMetricsService.computeCostTotals`,
  `buildCompletedTripWhere`) — nunca uma segunda query independente por linha (zero N+1: o número
  de queries por chamada é fixo, independente do número de veículos).
- Qualquer indicador por veículo sem base confiável retorna `value: null` +
  `unavailableReason` explícito — nunca 0 nem estimativa/rateio.
- `fleet_utilization`/`fleet_availability` são razões (PERCENT): nunca somadas nem entre veículos
  nem entre baldes de tempo. `total` do breakdown, para essas duas, é o valor oficial do KPI
  (recalculado com a MESMA função pura do catálogo sobre o agregado), não a soma dos itens; `share`
  e `others` são sempre `null` para elas.
- Isolamento multi-tenant idêntico ao BI 1–3: todo veículo/frota do escopo vem de
  `BiKpisService.resolveScope` (404 cross-tenant), nunca aceito sem validar `tenantId`.
- Sem filtro de veículo/frota selecionado na aba, os cards reaproveitam o `summary` global da
  página (mesma chamada de Visão Geral/Operação) — nunca uma segunda consulta redundante.
- Tabela "Desempenho por veículo": nunca rotula linha como "melhor"/"pior veículo"; ordenação e
  busca são ferramentas do usuário, não um veredito do sistema.
- Responder/comentar em código e commits em português; strings de UI em pt-BR.

## Review Focus

- **Vendido/cadastrado fora da janela do período**: um veículo com `capacityMinutes = 0` no
  período (vendido antes, cadastrado depois) precisa aparecer como `UNAVAILABLE` com motivo na
  tabela por veículo — nunca 0% de utilização nem ausente silenciosamente (Task 5, Task 7).
- **Veículo removido com dado histórico**: uma viagem concluída ou leitura de odômetro cujo veículo
  foi excluído (`deletedAt`) depois do fato não pode ser descartada silenciosamente — a soma dos
  itens do breakdown por veículo precisa continuar batendo com o valor do KPI no summary
  (Task 5, Task 7).
- **Período sem nenhum veículo no escopo (frota vazia ou filtro por veículo inexistente)**: os 5
  cards, a série e a tabela precisam mostrar `UNAVAILABLE`/vazio de forma coerente entre si, nunca
  card com número e tabela vazia sem explicação (Task 12, Task 14).
- **Alternar entre filtro de veículo e de frota**: trocar de um veículo específico para "todos" (ou
  para outra frota) precisa invalidar exatamente as consultas da aba Frota, sem tocar no summary
  global das outras abas nem deixar dado do filtro anterior na tela (Task 12, Task 14).
- **`fleet_utilization`/`fleet_availability` nunca aparecem com `share`/`others` preenchidos** no
  breakdown por veículo, mesmo quando o cliente pede `limit` baixo — é fácil copiar o padrão de
  `revenueByCustomer` (que soma e agrupa em "others") por engano para essas duas (Task 5, Task 7).

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `apps/api/src/bi/utils/fleet-time.util.ts` | Modificar | Extrai `computeVehicleFleetTime`/`computeFleetTimeByVehicle`; `computeFleetTimeTotals` passa a somar por cima delas |
| `apps/api/src/bi/utils/fleet-time.util.spec.ts` | Modificar | Novo `describe` de soma por veículo == agregado |
| `apps/api/src/common/utils/vehicle-distance.util.ts` | Modificar | `countOdometerReadingsByVehicle` (evidência por veículo, sem query nova) |
| `apps/api/src/common/utils/vehicle-distance.util.spec.ts` | Modificar | Testes da nova função |
| `apps/api/src/fleet-operations/services/fleet-operations-metrics.service.ts` | Modificar | `FleetDistanceTotals.readingCounts` populado a partir do mesmo `odometerPoints` |
| `apps/api/src/bi/dto/bi-kpi-query.dto.ts` | Modificar | `BREAKDOWN_DIMENSIONS` ganha `'vehicle'`; `limit` até 500 |
| `apps/api/src/bi/entities/bi-kpi.entity.ts` | Modificar | `KpiBreakdownItemEntity.value`/`total` nullable, `unavailableReason` no item, `dimension` união |
| `apps/api/src/bi/services/bi-kpi-breakdown.service.ts` | Modificar | 5 novos métodos `*ByVehicle` |
| `apps/api/src/bi/services/bi-kpis.service.ts` | Modificar | `getBreakdown` despacha por `(kpiId, dimension)` |
| `apps/api/test/bi-kpis.e2e-spec.ts` | Modificar | `describe('recorte por veiculo (BI 4)')` |
| `apps/admin-web/src/types/entities.ts` | Modificar | Espelha os tipos acima |
| `apps/admin-web/src/lib/api/bi.api.ts` | Modificar | `BiKpiBreakdownQuery.dimension` união |
| `apps/admin-web/src/features/intelligence/financial-tab.tsx` | Modificar | Ajuste de tipo por causa do `value` nullable (2 linhas) |
| `apps/admin-web/src/features/intelligence/fleet-time-band.tsx` | Modificar | Rótulo "Não registrado / cobertura insuficiente" |
| `apps/admin-web/src/features/intelligence/operation-tab.tsx` | Modificar | Remove bloco de frota (migrado) |
| `apps/admin-web/src/features/intelligence/fleet-vehicle-picker.tsx` | Criar | Busca de veículo por placa (`SearchCombobox`) |
| `apps/admin-web/src/features/intelligence/fleet-vehicle-table.tsx` | Criar | Tabela "Desempenho por veículo" (5 breakdowns + `DataTable`) |
| `apps/admin-web/src/features/intelligence/fleet-tab.tsx` | Criar | Aba Frota completa |
| `apps/admin-web/src/features/intelligence/intelligence-config.ts` | Modificar | Aba `fleet` sai de `upcoming` |
| `apps/admin-web/src/app/(app)/dashboard/page.tsx` | Modificar | Renderiza `<FleetTab>`, inclui `fleet` em `DATA_TABS` |
| `apps/admin-web/src/app/(app)/dashboard/page.test.tsx` | Modificar | Novo describe da aba Frota + regressão Operação |
| `docs/bi-kpis.md` | Modificar | Seção "14. BI 4 — Aba Frota" |

---

### Task 1: `fleet-time.util.ts` — extrair cálculo por veículo

**Files:**
- Modify: `apps/api/src/bi/utils/fleet-time.util.ts`
- Test: `apps/api/src/bi/utils/fleet-time.util.spec.ts`

**Interfaces:**
- Produces: `export interface VehicleFleetTime { vehicleId: string; considered: boolean; capacityMinutes: number; tripMinutes: number; maintenanceMinutes: number; idleNetMinutes: number; tripsConsidered: number; idleSegmentsConsidered: number; }`, `export function computeVehicleFleetTime(vehicle: FleetTimeVehicleInput, period: KpiPeriod, now: Date): VehicleFleetTime`, `export function computeFleetTimeByVehicle(vehicles: FleetTimeVehicleInput[], period: KpiPeriod, now: Date): Map<string, VehicleFleetTime>`. `computeFleetTimeTotals` mantém a assinatura atual (consumida por `BiKpiSnapshotService`, sem mudança nos chamadores).

- [ ] **Step 1: Escrever o teste de equivalência (falhando)**

Adicionar ao fim de `apps/api/src/bi/utils/fleet-time.util.spec.ts` (mantendo os `describe`s
existentes intactos):

```ts
import { computeFleetTimeByVehicle, computeFleetTimeTotals, computeVehicleFleetTime, FleetTimeVehicleInput } from './fleet-time.util';
// (ajustar o import no topo do arquivo para incluir os 2 novos nomes)

describe('computeFleetTimeByVehicle', () => {
  it('a soma dos campos por veiculo bate exatamente com o agregado', () => {
    const vehicles: FleetTimeVehicleInput[] = [
      vehicle({ vehicleId: 'a', trips: [trip('t1', '2026-03-01T00:00:00Z', '2026-03-02T00:00:00Z')] }),
      vehicle({ vehicleId: 'b', status: VehicleStatus.SOLD }),
      vehicle({
        vehicleId: 'c',
        trips: [trip('t2', '2026-03-04T00:00:00Z', '2026-03-05T00:00:00Z')],
        maintenanceIntervals: [{ start: d('2026-03-03T00:00:00Z'), end: d('2026-03-03T12:00:00Z') }],
      }),
    ];
    const perVehicle = computeFleetTimeByVehicle(vehicles, period, now);
    const totals = computeFleetTimeTotals(vehicles, period, now);

    expect(perVehicle.size).toBe(3);
    expect(perVehicle.get('b')?.considered).toBe(false);

    const consideredRows = [...perVehicle.values()].filter((r) => r.considered);
    expect(consideredRows.length).toBe(totals.vehiclesConsidered);
    const sum = (key: keyof typeof totals extends string ? 'capacityMinutes' | 'tripMinutes' | 'maintenanceMinutes' | 'idleNetMinutes' | 'tripsConsidered' | 'idleSegmentsConsidered' : never) =>
      consideredRows.reduce((acc, r) => acc + r[key], 0);
    expect(sum('capacityMinutes')).toBeCloseTo(totals.capacityMinutes, 5);
    expect(sum('tripMinutes')).toBeCloseTo(totals.tripMinutes, 5);
    expect(sum('maintenanceMinutes')).toBeCloseTo(totals.maintenanceMinutes, 5);
    expect(sum('idleNetMinutes')).toBeCloseTo(totals.idleNetMinutes, 5);
    expect(sum('tripsConsidered')).toBe(totals.tripsConsidered);
    expect(sum('idleSegmentsConsidered')).toBe(totals.idleSegmentsConsidered);
  });

  it('veiculo fora de operacao ou fora da janela do periodo: considered=false, todos os campos zerados', () => {
    const perVehicle = computeFleetTimeByVehicle(
      [vehicle({ vehicleId: 'sold', status: VehicleStatus.SOLD }), vehicle({ vehicleId: 'future', createdAt: d('2026-04-01T00:00:00Z') })],
      period,
      now,
    );
    expect(perVehicle.get('sold')).toMatchObject({ considered: false, capacityMinutes: 0, tripMinutes: 0 });
    expect(perVehicle.get('future')).toMatchObject({ considered: false, capacityMinutes: 0 });
  });
});

describe('computeVehicleFleetTime', () => {
  it('e a mesma funcao usada por computeFleetTimeByVehicle (chamada direta produz a mesma linha)', () => {
    const v = vehicle({ vehicleId: 'x', trips: [trip('t1', '2026-03-01T00:00:00Z', '2026-03-02T00:00:00Z')] });
    expect(computeVehicleFleetTime(v, period, now)).toEqual(computeFleetTimeByVehicle([v], period, now).get('x'));
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd apps/api && npx jest src/bi/utils/fleet-time.util.spec.ts`
Expected: FAIL — `computeFleetTimeByVehicle`/`computeVehicleFleetTime` não existem.

- [ ] **Step 3: Refatorar `fleet-time.util.ts`**

Substituir o corpo de `fleet-time.util.ts` a partir da assinatura de `computeFleetTimeTotals`
(mantendo tudo antes dela — imports, `OUT_OF_OPERATION_STATUSES`, `ACTIVE_TRIP_STATUSES`,
`MS_PER_MINUTE`, `FleetTimeVehicleInput`, `FleetTimeTotals`, `clip`, `minutesOf` — sem alteração):

```ts
export interface VehicleFleetTime {
  vehicleId: string;
  /// false = fora de operacao (status atual SOLD/INACTIVE) ou fora da janela
  /// do periodo (vendido antes / cadastrado depois) -- todos os campos abaixo
  /// ficam 0 e o chamador NUNCA deve tratar isso como "0% de utilizacao".
  considered: boolean;
  capacityMinutes: number;
  tripMinutes: number;
  maintenanceMinutes: number;
  idleNetMinutes: number;
  tripsConsidered: number;
  idleSegmentsConsidered: number;
}

const EMPTY_VEHICLE_ROW = (vehicleId: string): VehicleFleetTime => ({
  vehicleId,
  considered: false,
  capacityMinutes: 0,
  tripMinutes: 0,
  maintenanceMinutes: 0,
  idleNetMinutes: 0,
  tripsConsidered: 0,
  idleSegmentsConsidered: 0,
});

// BI 4 -- calculo POR VEICULO, extraido do loop que antes so agregava (nunca
// uma segunda formula: computeFleetTimeTotals abaixo soma exatamente esta
// funcao). Usado tanto pelo agregado (utilizacao/disponibilidade/ociosidade
// da frota inteira) quanto pelo recorte por veiculo (GET /bi/kpis/breakdown
// ?dimension=vehicle).
export function computeVehicleFleetTime(vehicle: FleetTimeVehicleInput, period: KpiPeriod, now: Date): VehicleFleetTime {
  const effectiveEnd = new Date(Math.min(period.end.getTime(), now.getTime()));
  if (OUT_OF_OPERATION_STATUSES.includes(vehicle.status)) return EMPTY_VEHICLE_ROW(vehicle.vehicleId);

  const windowStart = new Date(Math.max(period.start.getTime(), vehicle.createdAt.getTime()));
  if (effectiveEnd.getTime() <= windowStart.getTime()) return EMPTY_VEHICLE_ROW(vehicle.vehicleId);

  const row: VehicleFleetTime = {
    ...EMPTY_VEHICLE_ROW(vehicle.vehicleId),
    considered: true,
    capacityMinutes: (effectiveEnd.getTime() - windowStart.getTime()) / MS_PER_MINUTE,
  };

  const tripIntervals: { start: Date; end: Date }[] = [];
  for (const trip of vehicle.trips) {
    if (!trip.actualDeparture) continue;
    const end = trip.actualArrival ?? (ACTIVE_TRIP_STATUSES.includes(trip.status) ? now : null);
    if (!end) continue;
    const clipped = clip(trip.actualDeparture, end, windowStart, effectiveEnd);
    if (!clipped) continue;
    tripIntervals.push(clipped);
    row.tripsConsidered += 1;
  }
  row.tripMinutes = mergeIntervals(tripIntervals).reduce((sum, i) => sum + minutesOf(i), 0);

  row.maintenanceMinutes = computeMaintenanceOverlapMinutes(windowStart, effectiveEnd, vehicle.maintenanceIntervals);

  for (const segment of computeIdleSegments(vehicle.trips, now)) {
    const clipped = clip(segment.idleStart, segment.idleEnd ?? now, windowStart, effectiveEnd);
    if (!clipped) continue;
    row.idleSegmentsConsidered += 1;
    const maintenance = computeMaintenanceOverlapMinutes(clipped.start, clipped.end, vehicle.maintenanceIntervals);
    row.idleNetMinutes += Math.max(0, minutesOf(clipped) - maintenance);
  }

  return row;
}

// BI 4 -- mapa por veiculo (chave = vehicleId), mesma regra acima aplicada a
// cada veiculo do escopo. Base do recorte por veiculo.
export function computeFleetTimeByVehicle(
  vehicles: FleetTimeVehicleInput[],
  period: KpiPeriod,
  now: Date,
): Map<string, VehicleFleetTime> {
  const map = new Map<string, VehicleFleetTime>();
  for (const vehicle of vehicles) map.set(vehicle.vehicleId, computeVehicleFleetTime(vehicle, period, now));
  return map;
}

export function computeFleetTimeTotals(vehicles: FleetTimeVehicleInput[], period: KpiPeriod, now: Date): FleetTimeTotals {
  const effectiveEnd = new Date(Math.min(period.end.getTime(), now.getTime()));
  const totals: FleetTimeTotals = {
    vehiclesConsidered: 0,
    capacityMinutes: 0,
    tripMinutes: 0,
    maintenanceMinutes: 0,
    idleNetMinutes: 0,
    tripsConsidered: 0,
    idleSegmentsConsidered: 0,
    effectiveEnd,
  };
  for (const row of computeFleetTimeByVehicle(vehicles, period, now).values()) {
    if (!row.considered) continue;
    totals.vehiclesConsidered += 1;
    totals.capacityMinutes += row.capacityMinutes;
    totals.tripMinutes += row.tripMinutes;
    totals.maintenanceMinutes += row.maintenanceMinutes;
    totals.idleNetMinutes += row.idleNetMinutes;
    totals.tripsConsidered += row.tripsConsidered;
    totals.idleSegmentsConsidered += row.idleSegmentsConsidered;
  }
  return totals;
}
```

- [ ] **Step 4: Rodar e confirmar sucesso (arquivo inteiro, inclusive os testes antigos)**

Run: `cd apps/api && npx jest src/bi/utils/fleet-time.util.spec.ts`
Expected: PASS — todos os testes antigos de `computeFleetTimeTotals` continuam passando
(comportamento externo idêntico) e os 3 novos também passam.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bi/utils/fleet-time.util.ts apps/api/src/bi/utils/fleet-time.util.spec.ts
git commit -m "refactor(bi): extrai calculo de tempo de frota por veiculo (BI 4)"
```

---

### Task 2: Distância por veículo — contagem de leituras (evidência)

**Files:**
- Modify: `apps/api/src/common/utils/vehicle-distance.util.ts`
- Modify: `apps/api/src/common/utils/vehicle-distance.util.spec.ts`
- Modify: `apps/api/src/fleet-operations/services/fleet-operations-metrics.service.ts:248-274,539-558` (interface `FleetDistanceTotals` e montagem de `distance`)

**Interfaces:**
- Produces: `export function countOdometerReadingsByVehicle(points: OdometerReadingPoint[]): Map<string, number>`. `FleetDistanceTotals` ganha `readingCounts: Map<string, number>`.

- [ ] **Step 1: Escrever o teste (falhando)**

Adicionar ao fim de `apps/api/src/common/utils/vehicle-distance.util.spec.ts`:

```ts
import { computeVehicleDistancesKm, countOdometerReadingsByVehicle, sumVehicleDistancesKm } from './vehicle-distance.util';
// (ajustar import no topo)

describe('countOdometerReadingsByVehicle', () => {
  it('conta so leituras nao nulas, por veiculo', () => {
    const result = countOdometerReadingsByVehicle([
      { vehicleId: 'v1', odometerKm: 100000 },
      { vehicleId: 'v1', odometerKm: null },
      { vehicleId: 'v1', odometerKm: 105000 },
      { vehicleId: 'v2', odometerKm: 50000 },
    ]);
    expect(result.get('v1')).toBe(2);
    expect(result.get('v2')).toBe(1);
  });

  it('mapa vazio sem pontos', () => {
    expect(countOdometerReadingsByVehicle([]).size).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd apps/api && npx jest src/common/utils/vehicle-distance.util.spec.ts`
Expected: FAIL — `countOdometerReadingsByVehicle` não existe.

- [ ] **Step 3: Implementar em `vehicle-distance.util.ts`**

Adicionar ao fim do arquivo:

```ts
// BI 4 -- contagem de leituras validas por veiculo, do MESMO pool de pontos
// usado por computeVehicleDistancesKm (nenhuma query nova). Evidencia do
// recorte de distancia por veiculo (GET /bi/kpis/breakdown?kpiId=distance_km
// &dimension=vehicle) -- nunca conta leitura nula.
export function countOdometerReadingsByVehicle(points: OdometerReadingPoint[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const point of points) {
    if (point.odometerKm === null) continue;
    counts.set(point.vehicleId, (counts.get(point.vehicleId) ?? 0) + 1);
  }
  return counts;
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd apps/api && npx jest src/common/utils/vehicle-distance.util.spec.ts`
Expected: PASS.

- [ ] **Step 5: Popular `FleetDistanceTotals.readingCounts` em `fleet-operations-metrics.service.ts`**

Em `fleet-operations-metrics.service.ts`, localizar `export interface FleetDistanceTotals` (linha
~270) e adicionar o campo:

```ts
export interface FleetDistanceTotals {
  vehicleDistances: Map<string, number>;
  totalDistanceKm: number | null;
  odometerReadings: number;
  /// BI 4 -- leituras validas por veiculo (mesmo pool de odometerPoints
  /// acima). Evidencia do recorte de distancia por veiculo.
  readingCounts: Map<string, number>;
}
```

Adicionar o import de `countOdometerReadingsByVehicle` ao lado do já existente
`computeVehicleDistancesKm` (linha ~32) e, no bloco `if (includeDistance) { ... }` (linha ~539),
adicionar o campo à montagem de `distance`:

```ts
import { computeVehicleDistancesKm, countOdometerReadingsByVehicle, OdometerReadingPoint } from '../../common/utils/vehicle-distance.util';
```

```ts
      const vehicleDistances = computeVehicleDistancesKm(odometerPoints);
      distance = {
        vehicleDistances,
        totalDistanceKm:
          vehicleDistances.size > 0 ? [...vehicleDistances.values()].reduce((sum, d) => sum + d, 0) : null,
        odometerReadings: odometerPoints.filter((p) => p.odometerKm !== null).length,
        readingCounts: countOdometerReadingsByVehicle(odometerPoints),
      };
```

- [ ] **Step 6: Rodar a suíte do fleet-operations e confirmar que nada quebrou**

Run: `cd apps/api && npx jest src/fleet-operations`
Expected: PASS (nenhum teste existente lê `distance` por igualdade estrita de objeto que quebraria
com o campo novo; se algum `toEqual`/`toMatchObject` comparar o objeto `distance` inteiro, ajustar
esse teste para incluir `readingCounts` no objeto esperado).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/common/utils/vehicle-distance.util.ts apps/api/src/common/utils/vehicle-distance.util.spec.ts apps/api/src/fleet-operations/services/fleet-operations-metrics.service.ts
git commit -m "feat(bi): conta leituras de odometro por veiculo (evidencia da distancia por veiculo, BI 4)"
```

---

### Task 3: DTO e entidades do breakdown — `dimension=vehicle`, valores nuláveis

**Files:**
- Modify: `apps/api/src/bi/dto/bi-kpi-query.dto.ts:139-157`
- Modify: `apps/api/src/bi/entities/bi-kpi.entity.ts:329-367`

**Interfaces:**
- Produces: `export type BreakdownDimension = 'customer' | 'vehicle'`. `KpiBreakdownItemEntity.value: number | null`, `.unavailableReason: string | null`. `KpiBreakdownEntity.total: number | null`, `.dimension: BreakdownDimension`.

- [ ] **Step 1: Atualizar o DTO**

Em `bi-kpi-query.dto.ts`, substituir:

```ts
export const BREAKDOWN_DIMENSIONS = ['customer'] as const;

export class BiKpiBreakdownQueryDto extends BiKpiScopeQueryDto {
  @ApiProperty({ example: 'revenue' })
  @IsString()
  kpiId!: string;

  @ApiProperty({ enum: BREAKDOWN_DIMENSIONS })
  @IsIn(BREAKDOWN_DIMENSIONS, { message: 'dimension invalida.' })
  dimension!: (typeof BREAKDOWN_DIMENSIONS)[number];

  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 5;
}
```

por:

```ts
// BI 4 -- 'vehicle' cobre os 5 KPIs de frota (fleet_utilization,
// fleet_availability, idle_hours, trips_completed, distance_km).
export const BREAKDOWN_DIMENSIONS = ['customer', 'vehicle'] as const;
export type BreakdownDimension = (typeof BREAKDOWN_DIMENSIONS)[number];

export class BiKpiBreakdownQueryDto extends BiKpiScopeQueryDto {
  @ApiProperty({ example: 'revenue' })
  @IsString()
  kpiId!: string;

  @ApiProperty({ enum: BREAKDOWN_DIMENSIONS })
  @IsIn(BREAKDOWN_DIMENSIONS, { message: 'dimension invalida.' })
  dimension!: BreakdownDimension;

  @ApiPropertyOptional({
    default: 5,
    minimum: 1,
    maximum: 500,
    description: 'Teto maior que o de customer (20) para suportar a tabela investigativa por veiculo (BI 4), que nao trunca em "outros".',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit = 5;
}
```

- [ ] **Step 2: Atualizar as entidades**

Em `bi-kpi.entity.ts`, substituir o bloco final (a partir de `KpiBreakdownItemEntity`):

```ts
export class KpiBreakdownItemEntity {
  @ApiProperty({ nullable: true, type: String, description: 'Id do cliente/veiculo; null = sem vinculo (ex: receita sem cliente) ou registro de veiculo removido.' })
  key!: string | null;

  @ApiProperty()
  label!: string;

  @ApiProperty({ nullable: true, type: Number, description: 'null quando o item e UNAVAILABLE -- ver unavailableReason.' })
  value!: number | null;

  @ApiProperty({ nullable: true, type: String })
  unavailableReason!: string | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'Participacao no total (%). null quando o total e 0, o item e UNAVAILABLE, ou o KPI nao e somavel entre itens ' +
      '(fleet_utilization/fleet_availability, ambos em PERCENT: cada item ja e uma razao propria).',
  })
  share!: number | null;

  @ApiProperty()
  recordCount!: number;
}

export class KpiBreakdownEntity {
  @ApiProperty()
  kpiId!: string;

  @ApiProperty({ enum: ['customer', 'vehicle'] })
  dimension!: 'customer' | 'vehicle';

  @ApiProperty({ type: KpiScopeEntity })
  scope!: KpiScopeEntity;

  @ApiProperty({ type: KpiPeriodEntity })
  period!: KpiPeriodEntity;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'Para KPIs somaveis entre itens (revenue, idle_hours, trips_completed, distance_km) = soma de items + others. ' +
      'Para razoes (fleet_utilization/fleet_availability) e o valor OFICIAL do KPI no periodo, calculado pela mesma ' +
      'formula do catalogo -- nunca a soma/media dos itens. null quando o KPI esta UNAVAILABLE no periodo inteiro.',
  })
  total!: number | null;

  @ApiProperty({ type: [KpiBreakdownItemEntity] })
  items!: KpiBreakdownItemEntity[];

  @ApiProperty({
    type: KpiBreakdownItemEntity,
    nullable: true,
    description: 'Demais valores fora do limite pedido. Sempre null para fleet_utilization/fleet_availability (nao existe soma/media valida de "restante" para uma razao).',
  })
  others!: KpiBreakdownItemEntity | null;
}
```

- [ ] **Step 3: Compilar**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: erros apontando `bi-kpi-breakdown.service.ts` (retorna `value: number` onde a entidade
agora aceita `number | null` — isso é covariante, não deve quebrar; o erro esperado, se houver, é
em `bi-kpis.service.ts` atribuindo `result.total` de tipo `number` a um campo agora `number|null` —
também covariante, não quebra). Se não houver erro nenhum, ok — a Task 4 é quem de fato muda o
retorno do service.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/bi/dto/bi-kpi-query.dto.ts apps/api/src/bi/entities/bi-kpi.entity.ts
git commit -m "feat(bi): dimension=vehicle e valores nulaveis no breakdown (BI 4)"
```

---

### Task 4: `BiKpiBreakdownService` — 5 métodos por veículo

**Files:**
- Modify: `apps/api/src/bi/services/bi-kpi-breakdown.service.ts`
- Test: `apps/api/src/bi/services/bi-kpi-breakdown.service.spec.ts` (criar)

**Interfaces:**
- Consumes: `computeFleetTimeByVehicle`, `computeFleetTimeTotals` (Task 1, `../utils/fleet-time.util`); `findKpiDefinition` (`../kpis/kpi-catalog`); `EMPTY_SNAPSHOT` (`../kpis/empty-snapshot`); `BiPeriodSnapshot` (`../kpis/kpi.types`); `FleetIdleTimeService.loadVehicleIdleData` (`../../fleet-operations/services/fleet-idle-time.service`); `buildCompletedTripWhere` (`../utils/bi-where.util`); `FleetOperationsMetricsService.computeCostTotals` (já injetado).
- Produces: `fleetUtilizationByVehicle`, `fleetAvailabilityByVehicle`, `idleHoursByVehicle`, `tripsCompletedByVehicle`, `distanceByVehicle`, todas `(tenantId: string, scope: BiScope, period: KpiPeriod, limit: number) => Promise<BreakdownResult>` (mesma assinatura de `revenueByCustomer`).

Este service passa a depender de `FleetIdleTimeService` — nenhuma mudança de módulo necessária
(`BiModule` já importa `FleetOperationsModule`, que já exporta `FleetIdleTimeService`).

- [ ] **Step 1: Escrever o spec unitário (falhando)**

Criar `apps/api/src/bi/services/bi-kpi-breakdown.service.spec.ts`. Usa um `PrismaService` e
`FleetOperationsMetricsService` mockados via `jest.fn()` (não é e2e — isolamento multi-tenant real
fica no Task 6, e2e) e um `FleetIdleTimeService` mockado devolvendo dados fixos:

```ts
import { Test } from '@nestjs/testing';
import { FleetIdleTimeService } from '../../fleet-operations/services/fleet-idle-time.service';
import { FleetOperationsMetricsService } from '../../fleet-operations/services/fleet-operations-metrics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BiKpiBreakdownService } from './bi-kpi-breakdown.service';

describe('BiKpiBreakdownService -- recorte por veiculo (BI 4)', () => {
  const period = { start: new Date('2026-03-01T00:00:00Z'), end: new Date('2026-03-10T23:59:59.999Z') };

  const idleTimeData = [
    {
      vehicleId: 'v1',
      plate: 'AAA1111',
      status: 'ACTIVE',
      createdAt: new Date('2025-01-01T00:00:00Z'),
      trips: [{ tripId: 't1', status: 'COMPLETED', actualDeparture: new Date('2026-03-01T00:00:00Z'), actualArrival: new Date('2026-03-02T00:00:00Z'), destinationLabel: null }],
      maintenanceIntervals: [],
    },
    {
      vehicleId: 'v2',
      plate: 'BBB2222',
      status: 'SOLD', // fora de operacao -- deve virar UNAVAILABLE, nunca 0%
      createdAt: new Date('2025-01-01T00:00:00Z'),
      trips: [],
      maintenanceIntervals: [],
    },
  ];

  async function buildService(prismaOverrides: Record<string, unknown> = {}) {
    const idleTime = { loadVehicleIdleData: jest.fn().mockResolvedValue(idleTimeData) };
    const fleetMetrics = {
      computeCostTotals: jest.fn().mockResolvedValue({
        distance: {
          vehicleDistances: new Map([['v1', 500]]),
          readingCounts: new Map([['v1', 3]]),
          totalDistanceKm: 500,
          odometerReadings: 3,
        },
      }),
    };
    const prisma = { trip: { findMany: jest.fn().mockResolvedValue([{ composition: { vehicleId: 'v1' } }, { composition: { vehicleId: 'v1' } }]) }, ...prismaOverrides };
    const moduleRef = await Test.createTestingModule({
      providers: [
        BiKpiBreakdownService,
        { provide: PrismaService, useValue: prisma },
        { provide: FleetOperationsMetricsService, useValue: fleetMetrics },
        { provide: FleetIdleTimeService, useValue: idleTime },
      ],
    }).compile();
    return moduleRef.get(BiKpiBreakdownService);
  }

  it('fleet_utilization: veiculo SOLD fica UNAVAILABLE, nunca 0%; total = valor oficial do KPI, share sempre null', async () => {
    const service = await buildService();
    const result = await service.fleetUtilizationByVehicle('t1', {}, period, 10);
    const v1 = result.items.find((i) => i.key === 'v1')!;
    const v2 = result.items.find((i) => i.key === 'v2')!;
    expect(v1.value).toBeCloseTo(10, 1); // 24h em viagem / 240h de capacidade
    expect(v1.share).toBeNull();
    expect(v2.value).toBeNull();
    expect(v2.unavailableReason).toMatch(/fora de operacao/i);
    expect(result.others).toBeNull();
    expect(result.total).toBeCloseTo(5, 1); // agregado: 24h / 480h (so v1 tem capacidade -- v2 nao conta)
  });

  it('idle_hours: e somavel -- share preenchido e total = soma dos itens', async () => {
    const service = await buildService();
    const result = await service.idleHoursByVehicle('t1', {}, period, 10);
    const total = result.items.reduce((sum, i) => sum + (i.value ?? 0), 0);
    expect(result.total).toBeCloseTo(total, 5);
    const v1 = result.items.find((i) => i.key === 'v1')!;
    if (v1.value && result.total) expect(v1.share).toBeCloseTo((v1.value / result.total) * 100, 5);
  });

  it('trips_completed: soma dos itens = numero de viagens retornadas pelo where', async () => {
    const service = await buildService();
    const result = await service.tripsCompletedByVehicle('t1', {}, period, 10);
    expect(result.total).toBe(2);
    expect(result.items.find((i) => i.key === 'v1')?.value).toBe(2);
    expect(result.items.find((i) => i.key === 'v2')?.value).toBe(0); // veiculo sem viagem = 0 real, nao UNAVAILABLE
  });

  it('trips_completed: viagem de veiculo fora do escopo atual (removido) nunca some do total', async () => {
    const service = await buildService({
      trip: { findMany: jest.fn().mockResolvedValue([{ composition: { vehicleId: 'v1' } }, { composition: { vehicleId: 'removido' } }]) },
    });
    const result = await service.tripsCompletedByVehicle('t1', {}, period, 10);
    expect(result.total).toBe(2);
    expect(result.items.find((i) => i.key === null)).toMatchObject({ label: 'Veiculo removido', value: 1 });
  });

  it('distance_km: veiculo sem 2 leituras fica UNAVAILABLE; total bate com a soma do mapa de distancias', async () => {
    const service = await buildService();
    const result = await service.distanceByVehicle('t1', {}, period, 10);
    expect(result.items.find((i) => i.key === 'v1')).toMatchObject({ value: 500, recordCount: 3 });
    expect(result.items.find((i) => i.key === 'v2')).toMatchObject({ value: null });
    expect(result.items.find((i) => i.key === 'v2')?.unavailableReason).toMatch(/leituras de odometro/i);
    expect(result.total).toBe(500);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd apps/api && npx jest src/bi/services/bi-kpi-breakdown.service.spec.ts`
Expected: FAIL — os métodos `*ByVehicle` não existem.

- [ ] **Step 3: Implementar em `bi-kpi-breakdown.service.ts`**

Substituir o arquivo inteiro por:

```ts
import { Injectable } from '@nestjs/common';
import { compact } from '../../common/utils/compact.util';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { FleetIdleTimeService } from '../../fleet-operations/services/fleet-idle-time.service';
import { FleetOperationsMetricsService } from '../../fleet-operations/services/fleet-operations-metrics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { KpiBreakdownItemEntity } from '../entities/bi-kpi.entity';
import { EMPTY_SNAPSHOT } from '../kpis/empty-snapshot';
import { findKpiDefinition } from '../kpis/kpi-catalog';
import { BiPeriodSnapshot } from '../kpis/kpi.types';
import { BiScope, buildCompletedTripWhere } from '../utils/bi-where.util';
import { computeFleetTimeByVehicle, computeFleetTimeTotals, FleetTimeTotals } from '../utils/fleet-time.util';
import { KpiPeriod } from '../utils/kpi-period.util';

export interface BreakdownResult {
  total: number | null;
  items: KpiBreakdownItemEntity[];
  others: KpiBreakdownItemEntity | null;
}

// key=null -- receita sem cliente, ou (BI 4) registro de veiculo ja removido
// do escopo atual. unavailableReason=null quando o item tem valor valido
// (mesmo 0, que e um valor REAL, nao um "sem dado").
function item(
  key: string | null,
  label: string,
  value: number | null,
  recordCount: number,
  shareBase: number | null,
  unavailableReason: string | null = null,
): KpiBreakdownItemEntity {
  const entity = new KpiBreakdownItemEntity();
  entity.key = key;
  entity.label = label;
  entity.value = value;
  entity.unavailableReason = unavailableReason;
  entity.recordCount = recordCount;
  entity.share = value !== null && shareBase !== null && shareBase > 0 ? (value / shareBase) * 100 : null;
  return entity;
}

function byValueDesc(a: KpiBreakdownItemEntity, b: KpiBreakdownItemEntity): number {
  if (a.value === null && b.value === null) return 0;
  if (a.value === null) return 1;
  if (b.value === null) return -1;
  return b.value - a.value || a.label.localeCompare(b.label);
}

// BI 4 -- motivos por veiculo, mesma regra dos KPIs agregados equivalentes
// (NO_FLEET_CAPACITY/NO_DISTANCE no catalogo), so que aplicada por linha.
const VEHICLE_OUT_OF_OPERATION =
  'Veiculo fora de operacao (status atual) ou fora do periodo de cadastro no intervalo pedido.';
const NO_DISTANCE_VEHICLE =
  'Menos de 2 leituras de odometro (abastecimento ou manutencao) no periodo para este veiculo.';
const REMOVED_VEHICLE_LABEL = 'Veiculo removido';

// BI 3 -- receita por cliente. O where e EXATAMENTE o do KPI `revenue`
// (FleetOperationsMetricsService.buildRevenueSourceWhere); o groupBy so
// particiona o mesmo conjunto de registros por TripRevenue.customerId --
// a soma das partes e o valor do KPI (testado no e2e). Custos nao entram:
// suas fontes nao tem vinculo direto e confiavel com cliente.
//
// BI 4 -- recorte por VEICULO dos 5 KPIs de frota, abaixo. Mesmos coletores
// do catalogo (loadVehicleIdleData, computeCostTotals, buildCompletedTripWhere)
// -- nenhuma query nem formula nova. fleet_utilization/fleet_availability sao
// razoes: "total" e o valor OFICIAL do KPI (recalculado pela mesma funcao pura
// do catalogo sobre o agregado), share e others sao sempre null para elas --
// nao existe soma/media valida de percentuais entre veiculos.
@Injectable()
export class BiKpiBreakdownService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fleetMetrics: FleetOperationsMetricsService,
    private readonly idleTime: FleetIdleTimeService,
  ) {}

  async revenueByCustomer(tenantId: string, scope: BiScope, period: KpiPeriod, limit: number): Promise<BreakdownResult> {
    const where = this.fleetMetrics.buildRevenueSourceWhere(
      tenantId,
      compact({ startDate: period.start, endDate: period.end, ...scope }),
    );
    const groups = await this.prisma.tripRevenue.groupBy({
      by: ['customerId'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    });

    const rows = groups
      .map((g) => ({ customerId: g.customerId, value: toNumberOrNull(g._sum.amount) ?? 0, count: g._count._all }))
      .sort((a, b) => b.value - a.value || String(a.customerId).localeCompare(String(b.customerId)));
    const total = rows.reduce((sum, r) => sum + r.value, 0);
    const top = rows.slice(0, limit);
    const rest = rows.slice(limit);

    const ids = top.map((r) => r.customerId).filter((id): id is string => id !== null);
    const customers =
      ids.length > 0
        ? await this.prisma.customer.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true } })
        : [];
    const nameById = new Map(customers.map((c) => [c.id, c.name]));

    return {
      total,
      items: top.map((r) =>
        item(r.customerId, r.customerId ? (nameById.get(r.customerId) ?? 'Cliente removido') : 'Sem cliente', r.value, r.count, total),
      ),
      others:
        rest.length > 0
          ? item(
              null,
              `Demais (${rest.length})`,
              rest.reduce((sum, r) => sum + r.value, 0),
              rest.reduce((sum, r) => sum + r.count, 0),
              total,
            )
          : null,
    };
  }

  // --------------------------------------------------------------------------
  // BI 4 -- recorte por veiculo
  // --------------------------------------------------------------------------

  private async loadFleetTimeRows(tenantId: string, scope: BiScope, period: KpiPeriod) {
    const vehicles = await this.idleTime.loadVehicleIdleData(tenantId, scope);
    const now = new Date();
    return { vehicles, rows: computeFleetTimeByVehicle(vehicles, period, now), aggregate: computeFleetTimeTotals(vehicles, period, now) };
  }

  // Reusa a MESMA funcao pura do catalogo (findKpiDefinition(id).compute) para
  // o "total" de uma razao -- nunca uma segunda formula de utilizacao/
  // disponibilidade da frota.
  private ratioTotal(kpiId: 'fleet_utilization' | 'fleet_availability', aggregate: FleetTimeTotals, period: KpiPeriod): number | null {
    const definition = findKpiDefinition(kpiId);
    if (!definition) return null;
    const snapshot: BiPeriodSnapshot = { ...EMPTY_SNAPSHOT, period, fleetTime: aggregate };
    return definition.compute(snapshot).value;
  }

  async fleetUtilizationByVehicle(tenantId: string, scope: BiScope, period: KpiPeriod, limit: number): Promise<BreakdownResult> {
    const { vehicles, rows, aggregate } = await this.loadFleetTimeRows(tenantId, scope, period);
    const items = vehicles
      .map((v) => {
        const row = rows.get(v.vehicleId);
        const value = row?.considered ? (row.tripMinutes / row.capacityMinutes) * 100 : null;
        return item(v.vehicleId, v.plate, value, row?.tripsConsidered ?? 0, null, value === null ? VEHICLE_OUT_OF_OPERATION : null);
      })
      .sort(byValueDesc);
    return { total: this.ratioTotal('fleet_utilization', aggregate, period), items: items.slice(0, limit), others: null };
  }

  async fleetAvailabilityByVehicle(tenantId: string, scope: BiScope, period: KpiPeriod, limit: number): Promise<BreakdownResult> {
    const { vehicles, rows, aggregate } = await this.loadFleetTimeRows(tenantId, scope, period);
    const items = vehicles
      .map((v) => {
        const row = rows.get(v.vehicleId);
        const value = row?.considered ? ((row.capacityMinutes - row.maintenanceMinutes) / row.capacityMinutes) * 100 : null;
        return item(v.vehicleId, v.plate, value, row?.tripsConsidered ?? 0, null, value === null ? VEHICLE_OUT_OF_OPERATION : null);
      })
      .sort(byValueDesc);
    return { total: this.ratioTotal('fleet_availability', aggregate, period), items: items.slice(0, limit), others: null };
  }

  async idleHoursByVehicle(tenantId: string, scope: BiScope, period: KpiPeriod, limit: number): Promise<BreakdownResult> {
    const { vehicles, rows } = await this.loadFleetTimeRows(tenantId, scope, period);
    const raw = vehicles.map((v) => {
      const row = rows.get(v.vehicleId);
      return { vehicleId: v.vehicleId, label: v.plate, value: row?.considered ? row.idleNetMinutes / 60 : null, segments: row?.idleSegmentsConsidered ?? 0 };
    });
    const total = raw.reduce((sum, r) => sum + (r.value ?? 0), 0);
    const items = raw
      .map((r) => item(r.vehicleId, r.label, r.value, r.segments, total, r.value === null ? VEHICLE_OUT_OF_OPERATION : null))
      .sort(byValueDesc);
    return { total, items: items.slice(0, limit), others: null };
  }

  async tripsCompletedByVehicle(tenantId: string, scope: BiScope, period: KpiPeriod, limit: number): Promise<BreakdownResult> {
    const [vehicles, trips] = await Promise.all([
      this.idleTime.loadVehicleIdleData(tenantId, scope),
      this.prisma.trip.findMany({
        where: buildCompletedTripWhere(tenantId, scope, period),
        select: { composition: { select: { vehicleId: true } } },
      }),
    ]);
    const countByVehicle = new Map<string, number>();
    for (const trip of trips) {
      const vehicleId = trip.composition?.vehicleId;
      if (!vehicleId) continue;
      countByVehicle.set(vehicleId, (countByVehicle.get(vehicleId) ?? 0) + 1);
    }
    const raw: { vehicleId: string | null; label: string; value: number }[] = vehicles.map((v) => {
      const count = countByVehicle.get(v.vehicleId) ?? 0;
      countByVehicle.delete(v.vehicleId);
      return { vehicleId: v.vehicleId, label: v.plate, value: count };
    });
    // Viagens cujo veiculo saiu do escopo atual (removido) desde entao --
    // nunca descartadas silenciosamente: mesmo padrao de "Sem cliente".
    const orphan = [...countByVehicle.values()].reduce((sum, c) => sum + c, 0);
    if (orphan > 0) raw.push({ vehicleId: null, label: REMOVED_VEHICLE_LABEL, value: orphan });
    const total = raw.reduce((sum, r) => sum + r.value, 0);
    const items = raw.map((r) => item(r.vehicleId, r.label, r.value, r.value, total)).sort(byValueDesc);
    return { total, items: items.slice(0, limit), others: null };
  }

  async distanceByVehicle(tenantId: string, scope: BiScope, period: KpiPeriod, limit: number): Promise<BreakdownResult> {
    const [vehicles, costs] = await Promise.all([
      this.idleTime.loadVehicleIdleData(tenantId, scope),
      this.fleetMetrics.computeCostTotals(tenantId, compact({ startDate: period.start, endDate: period.end, ...scope }), { includeDistance: true }),
    ]);
    const distances = new Map(costs.distance?.vehicleDistances ?? []);
    const readingCounts = costs.distance?.readingCounts ?? new Map<string, number>();
    const raw: { vehicleId: string | null; label: string; value: number | null; readings: number }[] = vehicles.map((v) => {
      const value = distances.get(v.vehicleId) ?? null;
      distances.delete(v.vehicleId);
      return { vehicleId: v.vehicleId, label: v.plate, value, readings: readingCounts.get(v.vehicleId) ?? 0 };
    });
    // Leituras de veiculo removido do escopo atual -- mesmo padrao acima.
    if (distances.size > 0) {
      let orphanKm = 0;
      let orphanReadings = 0;
      for (const [vehicleId, value] of distances) {
        orphanKm += value;
        orphanReadings += readingCounts.get(vehicleId) ?? 0;
      }
      raw.push({ vehicleId: null, label: REMOVED_VEHICLE_LABEL, value: orphanKm, readings: orphanReadings });
    }
    const total = raw.reduce((sum, r) => sum + (r.value ?? 0), 0);
    const items = raw
      .map((r) => item(r.vehicleId, r.label, r.value, r.readings, total, r.value === null ? NO_DISTANCE_VEHICLE : null))
      .sort(byValueDesc);
    return { total, items: items.slice(0, limit), others: null };
  }
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd apps/api && npx jest src/bi/services/bi-kpi-breakdown.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bi/services/bi-kpi-breakdown.service.ts apps/api/src/bi/services/bi-kpi-breakdown.service.spec.ts
git commit -m "feat(bi): recorte por veiculo dos 5 KPIs de frota (BI 4)"
```

---

### Task 5: `BiKpisService.getBreakdown` — despacho por `(kpiId, dimension)`

**Files:**
- Modify: `apps/api/src/bi/services/bi-kpis.service.ts:174-194`
- Modify: `apps/api/src/bi/controllers/bi-kpis.controller.ts:74-84` (texto do `@ApiOperation`)

**Interfaces:**
- Consumes: `BreakdownDimension` (Task 3, `../dto/bi-kpi-query.dto`); os 5 métodos `*ByVehicle` (Task 4).

- [ ] **Step 1: Escrever o teste (falhando)** — feito no Task 6 (e2e), que exercita o dispatcher
  fim-a-fim; aqui a implementação é pequena o bastante para seguir direto (o Task 4 já cobre a
  lógica de cálculo isoladamente). Antes de implementar, rodar a suíte atual para ter uma
  baseline verde:

Run: `cd apps/api && npx jest src/bi/services/bi-kpis.service.spec.ts 2>/dev/null; echo done` (o
arquivo pode não existir — o service hoje só é coberto pelo e2e; nesse caso o comando so imprime
"done", sem problema).

- [ ] **Step 2: Implementar o dispatcher**

Em `bi-kpis.service.ts`, importar `BreakdownDimension` junto dos demais tipos do DTO (linha ~6-11)
e substituir o método `getBreakdown`:

```ts
  // BI 3/4 -- recorte de KPI por dimensao: receita x cliente (BI 3) e os 5
  // KPIs de frota x veiculo (BI 4). Cada combinacao (kpiId, dimension) mapeia
  // para um unico metodo do BiKpiBreakdownService -- nunca uma segunda forma
  // de calculo.
  async getBreakdown(tenantId: string, query: BiKpiBreakdownQueryDto): Promise<KpiBreakdownEntity> {
    const definition = this.requireDefinition(query.kpiId);
    const period = this.parsePeriod(query.startDate, query.endDate);
    const scope = await this.resolveScope(tenantId, query);
    const result = await this.computeBreakdown(tenantId, definition.id, query.dimension, scope, period, query.limit);

    const entity = new KpiBreakdownEntity();
    entity.kpiId = definition.id;
    entity.dimension = query.dimension;
    entity.scope = this.toScopeEntity(tenantId, scope);
    entity.period = this.toPeriodEntity(period);
    entity.total = result.total;
    entity.items = result.items;
    entity.others = result.others;
    return entity;
  }

  private async computeBreakdown(
    tenantId: string,
    kpiId: string,
    dimension: BreakdownDimension,
    scope: BiScope,
    period: KpiPeriod,
    limit: number,
  ) {
    if (kpiId === 'revenue' && dimension === 'customer') {
      return this.breakdown.revenueByCustomer(tenantId, scope, period, limit);
    }
    if (dimension === 'vehicle') {
      switch (kpiId) {
        case 'fleet_utilization':
          return this.breakdown.fleetUtilizationByVehicle(tenantId, scope, period, limit);
        case 'fleet_availability':
          return this.breakdown.fleetAvailabilityByVehicle(tenantId, scope, period, limit);
        case 'idle_hours':
          return this.breakdown.idleHoursByVehicle(tenantId, scope, period, limit);
        case 'trips_completed':
          return this.breakdown.tripsCompletedByVehicle(tenantId, scope, period, limit);
        case 'distance_km':
          return this.breakdown.distanceByVehicle(tenantId, scope, period, limit);
      }
    }
    throw new BadRequestException(`Recorte por ${dimension} nao disponivel para o KPI ${kpiId}.`);
  }
```

Adicionar `BreakdownDimension` ao import existente de `'../dto/bi-kpi-query.dto'`.

- [ ] **Step 3: Atualizar a doc do controller**

Em `bi-kpis.controller.ts`, atualizar o texto do `@ApiOperation` do `getBreakdown`:

```ts
  @ApiOperation({
    summary:
      'Recorte de um KPI por dimensao: revenue x customer (BI 3), ou fleet_utilization/' +
      'fleet_availability/idle_hours/trips_completed/distance_km x vehicle (BI 4). Mesmo where do ' +
      'KPI; para KPIs somaveis, soma dos itens + others = valor do KPI -- para razoes (PERCENT), ' +
      '"total" e o valor oficial do KPI, nao a soma dos itens.',
  })
```

- [ ] **Step 4: Compilar**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bi/services/bi-kpis.service.ts apps/api/src/bi/controllers/bi-kpis.controller.ts
git commit -m "feat(bi): getBreakdown despacha dimension=vehicle para os KPIs de frota (BI 4)"
```

---

### Task 6: e2e — `recorte por veiculo (BI 4)`

**Files:**
- Modify: `apps/api/test/bi-kpis.e2e-spec.ts`

**Interfaces:**
- Consumes: helpers já existentes no arquivo (`seedTenant`, `seedJanuaryOperation`, `post`,
  `createFuelSupply`, `createLocation`, `getSummary`, `kpi`, `a`, `b`).

- [ ] **Step 1: Adicionar um segundo veículo ao tenant A (helper novo)**

Adicionar, próximo a `seedJanuaryOperation` (mesma seção de helpers), uma função que cria um
segundo veículo/composição/viagem no MESMO fleet de `a`, necessária para os testes de soma
multi-veículo:

```ts
  interface SecondVehicle {
    vehicleId: string;
    tripId: string;
  }

  // Segundo veiculo da mesma frota de A, com sua propria viagem concluida em
  // janeiro -- necessario para os testes de recorte por veiculo (BI 4): um
  // unico veiculo nao prova que a soma das partes bate com o total.
  async function seedSecondVehicle(s: Seed): Promise<SecondVehicle> {
    const vehicleId = await post(s.auth, '/vehicles', {
      plate: randomPlate(),
      brand: 'Scania',
      model: 'R450',
      type: 'TRACTOR_UNIT',
      fleetId: s.fleetId,
      odometerKm: 50000,
    });
    await prisma.vehicle.update({ where: { id: vehicleId }, data: { createdAt: new Date('2025-01-01T00:00:00Z') } });
    const compositionId = await post(s.auth, '/trip-compositions', { vehicleId, trailers: [] });
    const tripId = await post(s.auth, '/trips', {
      driverId: s.driverId,
      compositionId,
      originLocationId: await createLocation(s.auth),
      destinationLocationId: await createLocation(s.auth),
      plannedDeparture: '2026-01-15T00:00:00.000Z',
      plannedArrival: '2026-01-16T00:00:00.000Z',
    });
    await prisma.trip.update({
      where: { id: tripId },
      data: { status: 'COMPLETED', actualDeparture: new Date('2026-01-15T00:00:00.000Z'), actualArrival: new Date('2026-01-16T00:00:00.000Z') },
    });
    await createFuelSupply(s.auth, { ...s, vehicleId }, 50000, 400, '2026-01-14T10:00:00.000Z');
    await createFuelSupply(s.auth, { ...s, vehicleId }, 50600, 400, '2026-01-20T10:00:00.000Z');
    return { vehicleId, tripId };
  }
```

- [ ] **Step 2: Escrever o describe (falhando)**

Adicionar ao fim do arquivo, depois de `describe('recorte por cliente (BI 3)', ...)` (antes do
`});` final que fecha o describe raiz):

```ts
  describe('recorte por veiculo (BI 4)', () => {
    const JAN = JANUARY;
    let second: SecondVehicle;

    beforeAll(async () => {
      second = await seedSecondVehicle(a);
    }, 60000);

    function getBreakdown(auth: string, query: Record<string, string>) {
      return request(app.getHttpServer()).get('/api/v1/bi/kpis/breakdown').query(query).set('Authorization', auth);
    }

    it('trips_completed: soma dos itens = valor do summary', async () => {
      const [breakdown, summary] = await Promise.all([
        getBreakdown(a.auth, { ...JAN, kpiId: 'trips_completed', dimension: 'vehicle' }).expect(200),
        getSummary(a.auth, { ...JAN, comparison: 'NONE', kpis: 'trips_completed' }).expect(200),
      ]);
      const total = breakdown.body.data.items.reduce((sum: number, i: { value: number }) => sum + i.value, 0);
      expect(total).toBe(kpi(summary.body, 'trips_completed').value);
      expect(breakdown.body.data.items.find((i: { key: string }) => i.key === a.vehicleId)).toMatchObject({ value: 1 });
      expect(breakdown.body.data.items.find((i: { key: string }) => i.key === second.vehicleId)).toMatchObject({ value: 1 });
    });

    it('distance_km: soma dos itens = valor do summary', async () => {
      const [breakdown, summary] = await Promise.all([
        getBreakdown(a.auth, { ...JAN, kpiId: 'distance_km', dimension: 'vehicle' }).expect(200),
        getSummary(a.auth, { ...JAN, comparison: 'NONE', kpis: 'distance_km' }).expect(200),
      ]);
      const total = breakdown.body.data.items.reduce((sum: number, i: { value: number | null }) => sum + (i.value ?? 0), 0);
      expect(total).toBeCloseTo(kpi(summary.body, 'distance_km').value ?? NaN, 2);
      expect(breakdown.body.data.items.find((i: { key: string }) => i.key === a.vehicleId)).toMatchObject({ value: 1000 });
      expect(breakdown.body.data.items.find((i: { key: string }) => i.key === second.vehicleId)).toMatchObject({ value: 600 });
    });

    it('fleet_utilization/fleet_availability: item por veiculo nunca tem "share", "total" e o valor oficial do summary', async () => {
      const [breakdown, summary] = await Promise.all([
        getBreakdown(a.auth, { ...JAN, kpiId: 'fleet_utilization', dimension: 'vehicle' }).expect(200),
        getSummary(a.auth, { ...JAN, comparison: 'NONE', kpis: 'fleet_utilization' }).expect(200),
      ]);
      expect(breakdown.body.data.total).toBeCloseTo(kpi(summary.body, 'fleet_utilization').value ?? NaN, 5);
      expect(breakdown.body.data.others).toBeNull();
      for (const row of breakdown.body.data.items) expect(row.share).toBeNull();
    });

    it('idle_hours: e somavel -- share preenchido e total = soma dos itens (nunca o valor de fleet_utilization)', async () => {
      const res = await getBreakdown(a.auth, { ...JAN, kpiId: 'idle_hours', dimension: 'vehicle' }).expect(200);
      const total = res.body.data.items.reduce((sum: number, i: { value: number | null }) => sum + (i.value ?? 0), 0);
      expect(res.body.data.total).toBeCloseTo(total, 5);
    });

    it('veiculo vendido antes do periodo: UNAVAILABLE com motivo, nunca 0% inventado', async () => {
      const soldVehicleId = await post(a.auth, '/vehicles', { plate: randomPlate(), brand: 'Volvo', model: 'FH', type: 'TRACTOR_UNIT', fleetId: a.fleetId, odometerKm: 10000 });
      await prisma.vehicle.update({ where: { id: soldVehicleId }, data: { status: 'SOLD', createdAt: new Date('2025-01-01T00:00:00Z') } });
      const res = await getBreakdown(a.auth, { ...JAN, kpiId: 'fleet_utilization', dimension: 'vehicle' }).expect(200);
      const row = res.body.data.items.find((i: { key: string }) => i.key === soldVehicleId);
      expect(row.value).toBeNull();
      expect(row.unavailableReason).toMatch(/fora de operacao/i);
    });

    it('filtro por veiculo: recorta para 1 unico item, igual ao summary escopado', async () => {
      const res = await getBreakdown(a.auth, { ...JAN, kpiId: 'trips_completed', dimension: 'vehicle', vehicleId: a.vehicleId }).expect(200);
      expect(res.body.data.items).toEqual([expect.objectContaining({ key: a.vehicleId, value: 1 })]);
    });

    it('veiculo/frota de outro tenant => 404; dimensao "fleet" nao suportada => 400', async () => {
      await getBreakdown(a.auth, { ...JAN, kpiId: 'trips_completed', dimension: 'vehicle', vehicleId: b.vehicleId }).expect(404);
      await getBreakdown(a.auth, { ...JAN, kpiId: 'trips_completed', dimension: 'fleet' }).expect(400);
      await getBreakdown(a.auth, { ...JAN, kpiId: 'revenue', dimension: 'vehicle' }).expect(400);
    });

    it('isolamento: recorte de B nunca mostra veiculos de A', async () => {
      const res = await getBreakdown(b.auth, { ...JAN, kpiId: 'trips_completed', dimension: 'vehicle' }).expect(200);
      expect(res.body.data.items.every((i: { key: string | null }) => i.key !== a.vehicleId && i.key !== second.vehicleId)).toBe(true);
    });

    it('consistencia summary x breakdown: mesmo escopo, mesmo total (idle_hours)', async () => {
      const [breakdown, summary] = await Promise.all([
        getBreakdown(a.auth, { ...JAN, kpiId: 'idle_hours', dimension: 'vehicle', vehicleId: a.vehicleId }).expect(200),
        getSummary(a.auth, { ...JAN, comparison: 'NONE', kpis: 'idle_hours', vehicleId: a.vehicleId }).expect(200),
      ]);
      expect(breakdown.body.data.total).toBeCloseTo(kpi(summary.body, 'idle_hours').value ?? NaN, 2);
    });
  });
```

- [ ] **Step 3: Rodar e confirmar falha**

Run: `cd apps/api && npx jest test/bi-kpis.e2e-spec.ts -t "recorte por veiculo"`
Expected: FAIL antes das Tasks 1–5 estarem completas (se rodado depois delas, deve já passar em
sua maioria — este describe serve como a rede de segurança fim-a-fim de tudo isso).

- [ ] **Step 4: Rodar a suíte inteira do arquivo e confirmar sucesso**

Run: `cd apps/api && npx jest test/bi-kpis.e2e-spec.ts`
Expected: PASS — inclusive todos os describes de BI 1/2/3 já existentes (nenhuma regressão).

- [ ] **Step 5: Commit**

```bash
git add apps/api/test/bi-kpis.e2e-spec.ts
git commit -m "test(bi): e2e do recorte por veiculo dos 5 KPIs de frota (BI 4)"
```

---

### Task 7: Frontend — tipos espelho + rótulo do `FleetTimeBand`

**Files:**
- Modify: `apps/admin-web/src/types/entities.ts:4392-4408`
- Modify: `apps/admin-web/src/lib/api/bi.api.ts:61-65`
- Modify: `apps/admin-web/src/features/intelligence/financial-tab.tsx` (2 pontos, ver Step 3)
- Modify: `apps/admin-web/src/features/intelligence/fleet-time-band.tsx`

**Interfaces:**
- Produces: `KpiBreakdownItemEntity.value: number | null`, `.unavailableReason: string | null`;
  `KpiBreakdownEntity.total: number | null`, `.dimension: 'customer' | 'vehicle'`;
  `BiKpiBreakdownQuery.dimension: 'customer' | 'vehicle'`.

- [ ] **Step 1: Atualizar `types/entities.ts`**

Substituir o bloco final (a partir de `KpiBreakdownItemEntity`):

```ts
export interface KpiBreakdownItemEntity {
  key: string | null;
  label: string;
  value: number | null;
  unavailableReason: string | null;
  share: number | null;
  recordCount: number;
}

export interface KpiBreakdownEntity {
  kpiId: string;
  dimension: 'customer' | 'vehicle';
  scope: KpiScopeEntity;
  period: KpiPeriodEntity;
  total: number | null;
  items: KpiBreakdownItemEntity[];
  others: KpiBreakdownItemEntity | null;
}
```

- [ ] **Step 2: Atualizar `bi.api.ts`**

```ts
export interface BiKpiBreakdownQuery extends BiKpiScopeQuery {
  kpiId: string;
  dimension: 'customer' | 'vehicle';
  limit?: number | undefined;
}
```

- [ ] **Step 3: Corrigir `financial-tab.tsx` para o `value` agora nulável**

O componente `RevenueByCustomer` já trata `share === null`, mas `Math.max(...rows.map((r) =>
r.value))` quebra o typecheck com `value: number | null`. Localizar a linha (dentro de
`RevenueByCustomer`):

```ts
  const rows = data.others ? [...data.items, data.others] : data.items;
  const max = Math.max(...rows.map((r) => r.value));
```

e trocar por:

```ts
  const rows = data.others ? [...data.items, data.others] : data.items;
  const max = Math.max(...rows.map((r) => r.value ?? 0));
```

(receita por cliente nunca é de fato `null` na prática — `??0` é só para satisfazer o tipo agora
compartilhado com o recorte por veículo, sem mudar nenhum resultado visível.) Na renderização da
lista, `formatKpiValue('BRL', row.value)` já aceita `number | null`, sem mudança.

- [ ] **Step 4: Rodar o typecheck do admin-web**

Run: `cd apps/admin-web && npx tsc --noEmit -p tsconfig.json`
Expected: sem erros relacionados a `KpiBreakdownItemEntity`/`KpiBreakdownEntity`.

- [ ] **Step 5: Renomear o rótulo do `FleetTimeBand`**

Em `fleet-time-band.tsx`, trocar:

```ts
    { key: 'unclassified', label: 'Sem registro de operação', hours: unclassified, className: 'bg-slate-200' },
```

por:

```ts
    { key: 'unclassified', label: 'Não registrado / cobertura insuficiente', hours: unclassified, className: 'bg-slate-200' },
```

- [ ] **Step 6: Rodar os testes que tocam a Central e ajustar textos quebrados**

Run: `cd apps/admin-web && npx jest src/app/\(app\)/dashboard/page.test.tsx`
Expected: se algum teste comparar o texto antigo "Sem registro de operação", ele vai falhar —
localizar essa asserção (é a que cobre "aba Operacao: ... horas da frota") e trocar a string
esperada para "Não registrado / cobertura insuficiente". Esse teste será movido para a aba Frota
no Task 12; por ora, só corrigir o texto para manter a suíte verde neste ponto do plano.

- [ ] **Step 7: Commit**

```bash
git add apps/admin-web/src/types/entities.ts apps/admin-web/src/lib/api/bi.api.ts apps/admin-web/src/features/intelligence/financial-tab.tsx apps/admin-web/src/features/intelligence/fleet-time-band.tsx apps/admin-web/src/app/\(app\)/dashboard/page.test.tsx
git commit -m "feat(bi): espelha dimension=vehicle e rotulo 'nao registrado' no frontend (BI 4)"
```

---

### Task 8: `fleet-vehicle-picker.tsx` — busca de veículo por placa

**Files:**
- Create: `apps/admin-web/src/features/intelligence/fleet-vehicle-picker.tsx`

**Interfaces:**
- Consumes: `SearchCombobox` (`../../components/ui/search-combobox`), `listVehicles`
  (`../../lib/api/fleet.api`), `VehicleEntity` (`../../types/entities`).
- Produces: `export function FleetVehiclePicker({ id, selectedVehicle, onSelect, onClear, disabled }: {...}): JSX.Element`.

- [ ] **Step 1: Criar o componente**

Modelo direto de `apps/admin-web/src/features/tolls/plaza-picker.tsx` (mesmo padrão já usado no
projeto para busca assíncrona por texto):

```tsx
'use client';

import { SearchCombobox } from '../../components/ui/search-combobox';
import { listVehicles } from '../../lib/api/fleet.api';
import type { VehicleEntity } from '../../types/entities';

const PAGE_SIZE = 20;

// Mesmo padrao de PlazaPicker (features/tolls): busca real por placa/marca/
// modelo, em vez de um <select> com pageSize fixo -- uma frota pode ter mais
// veiculos do que uma pagina carregaria de uma vez.
export function FleetVehiclePicker({
  id,
  selectedVehicle,
  onSelect,
  onClear,
  disabled,
}: {
  id?: string;
  selectedVehicle: VehicleEntity | null;
  onSelect: (vehicle: VehicleEntity) => void;
  onClear: () => void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <SearchCombobox<VehicleEntity>
      id={id}
      selectedItem={selectedVehicle}
      onSelect={onSelect}
      onClear={onClear}
      disabled={disabled}
      placeholder="Buscar por placa, marca, modelo..."
      emptyLabel="Nenhum veículo encontrado."
      queryKey={(search) => ['vehicles', 'picker', search]}
      queryFn={async (search) => listVehicles({ search: search || undefined, pageSize: PAGE_SIZE })}
      getOptionValue={(vehicle) => vehicle.id}
      getDisplayText={(vehicle) => `${vehicle.plate} · ${vehicle.brand} ${vehicle.model}`}
      renderOption={(vehicle) => (
        <div>
          <p className="font-medium text-ink">{vehicle.plate}</p>
          <p className="text-xs text-ink-subtle">
            {vehicle.brand} {vehicle.model}
          </p>
        </div>
      )}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/admin-web && npx tsc --noEmit -p tsconfig.json`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add apps/admin-web/src/features/intelligence/fleet-vehicle-picker.tsx
git commit -m "feat(bi): seletor de veiculo por busca para a aba Frota (BI 4)"
```

---

### Task 9: `fleet-vehicle-table.tsx` — desempenho por veículo

**Files:**
- Create: `apps/admin-web/src/features/intelligence/fleet-vehicle-table.tsx`
- Test: `apps/admin-web/src/features/intelligence/fleet-vehicle-table.test.tsx` (criar)

**Interfaces:**
- Consumes: `getKpiBreakdown` (`../../lib/api/bi.api`), `DataTable` (`../../components/ui/data-table`), `SearchInput` (`../../components/ui/search-input`), `useDebounce` (`../../hooks/use-debounce`), `formatKpiValue` (`./kpi-format`), `PeriodRange` (`./period`), `KpiBreakdownEntity` (`../../types/entities`).
- Produces: `export function FleetVehicleTable({ range, fleetId }: { range: PeriodRange; fleetId: string | null }): JSX.Element`.

- [ ] **Step 1: Escrever o teste (falhando)**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as biApi from '../../lib/api/bi.api';
import { FleetVehicleTable } from './fleet-vehicle-table';

jest.mock('../../lib/api/bi.api');

const range = { startDate: '2026-01-01', endDate: '2026-01-31' };

function breakdown(items: { key: string | null; label: string; value: number | null; unavailableReason?: string | null }[]) {
  return {
    kpiId: 'x',
    dimension: 'vehicle' as const,
    scope: { tenantId: 't', vehicleId: null, fleetId: null, customerId: null },
    period: { start: range.startDate, end: range.endDate },
    total: null,
    others: null,
    items: items.map((i) => ({ share: null, recordCount: 0, unavailableReason: i.unavailableReason ?? null, ...i })),
  };
}

function renderTable(fleetId: string | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FleetVehicleTable range={range} fleetId={fleetId} />
    </QueryClientProvider>,
  );
}

describe('FleetVehicleTable', () => {
  beforeEach(() => {
    jest.mocked(biApi.getKpiBreakdown).mockImplementation(async (query) => {
      if (query.kpiId === 'fleet_utilization') return breakdown([{ key: 'v1', label: 'AAA1111', value: 80 }, { key: 'v2', label: 'BBB2222', value: null, unavailableReason: 'Fora de operacao.' }]);
      if (query.kpiId === 'distance_km') return breakdown([{ key: 'v1', label: 'AAA1111', value: 1200 }, { key: 'v2', label: 'BBB2222', value: 300 }]);
      return breakdown([{ key: 'v1', label: 'AAA1111', value: 5 }, { key: 'v2', label: 'BBB2222', value: 2 }]);
    });
  });

  it('mostra uma linha por veiculo com as 5 metricas, sem rotular melhor/pior', async () => {
    renderTable();
    await waitFor(() => expect(screen.getByText('AAA1111')).toBeInTheDocument());
    expect(screen.getByText('BBB2222')).toBeInTheDocument();
    expect(screen.queryByText(/melhor veiculo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pior veiculo/i)).not.toBeInTheDocument();
  });

  it('celula UNAVAILABLE mostra travessao e o motivo, nunca 0', async () => {
    renderTable();
    await waitFor(() => expect(screen.getByText('BBB2222')).toBeInTheDocument());
    const row = screen.getByText('BBB2222').closest('tr');
    expect(row).toHaveTextContent('—');
    expect(row).not.toHaveTextContent(/^0%$/);
  });

  it('busca por placa filtra as linhas', async () => {
    renderTable();
    await waitFor(() => expect(screen.getByText('AAA1111')).toBeInTheDocument());
    await userEvent.type(screen.getByPlaceholderText(/placa/i), 'BBB');
    await waitFor(() => expect(screen.queryByText('AAA1111')).not.toBeInTheDocument());
    expect(screen.getByText('BBB2222')).toBeInTheDocument();
  });

  it('ordenar por distancia inverte a ordem das linhas', async () => {
    renderTable();
    await waitFor(() => expect(screen.getByText('AAA1111')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /distância/i }));
    const rowsBefore = screen.getAllByRole('row').map((r) => r.textContent);
    await userEvent.click(screen.getByRole('button', { name: /distância/i }));
    const rowsAfter = screen.getAllByRole('row').map((r) => r.textContent);
    expect(rowsBefore).not.toEqual(rowsAfter);
  });

  it('com fleetId, propaga o filtro para as 5 chamadas de breakdown', async () => {
    renderTable('frota-1');
    await waitFor(() => expect(biApi.getKpiBreakdown).toHaveBeenCalled());
    for (const call of jest.mocked(biApi.getKpiBreakdown).mock.calls) {
      expect(call[0]).toMatchObject({ fleetId: 'frota-1', dimension: 'vehicle' });
    }
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd apps/admin-web && npx jest src/features/intelligence/fleet-vehicle-table.test.tsx`
Expected: FAIL — o módulo `fleet-vehicle-table.tsx` não existe.

- [ ] **Step 3: Implementar o componente**

```tsx
'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { useQueries } from '@tanstack/react-query';
import { ArrowUpDown } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { DataTable } from '../../components/ui/data-table';
import { SearchInput } from '../../components/ui/search-input';
import { useDebounce } from '../../hooks/use-debounce';
import { getKpiBreakdown } from '../../lib/api/bi.api';
import type { KpiBreakdownEntity } from '../../types/entities';
import { formatKpiValue } from './kpi-format';
import type { PeriodRange } from './period';

// BI 4 -- 5 KPIs oficiais de frota, cada um com sua propria chamada de
// breakdown?dimension=vehicle (mesmo endpoint da receita por cliente, so a
// dimensao muda). limit alto: esta tabela e investigativa (todos os
// veiculos), nao um "top N" como a receita por cliente.
const VEHICLE_TABLE_LIMIT = 500;

interface MetricConfig {
  kpiId: string;
  unit: 'PERCENT' | 'HOURS' | 'COUNT' | 'KM';
  header: string;
}

const METRICS: MetricConfig[] = [
  { kpiId: 'fleet_utilization', unit: 'PERCENT', header: 'Utilização' },
  { kpiId: 'fleet_availability', unit: 'PERCENT', header: 'Disponibilidade' },
  { kpiId: 'idle_hours', unit: 'HOURS', header: 'Ociosidade' },
  { kpiId: 'trips_completed', unit: 'COUNT', header: 'Viagens' },
  { kpiId: 'distance_km', unit: 'KM', header: 'Distância' },
];

interface Cell {
  value: number | null;
  unavailableReason: string | null;
}

interface VehicleRow {
  vehicleId: string | null;
  label: string;
  cells: Record<string, Cell>;
}

const EMPTY_CELL: Cell = { value: null, unavailableReason: null };

function mergeRows(results: (KpiBreakdownEntity | undefined)[]): VehicleRow[] {
  const byKey = new Map<string, VehicleRow>();
  const order: string[] = [];
  METRICS.forEach((metric, index) => {
    for (const it of results[index]?.items ?? []) {
      const rowKey = it.key ?? `__removed__${it.label}`;
      if (!byKey.has(rowKey)) {
        const row: VehicleRow = { vehicleId: it.key, label: it.label, cells: {} };
        for (const m of METRICS) row.cells[m.kpiId] = EMPTY_CELL;
        byKey.set(rowKey, row);
        order.push(rowKey);
      }
      byKey.get(rowKey)!.cells[metric.kpiId] = { value: it.value, unavailableReason: it.unavailableReason };
    }
  });
  return order.map((key) => byKey.get(key)!);
}

function MetricCell({ cell, unit }: { cell: Cell; unit: MetricConfig['unit'] }): JSX.Element {
  if (cell.value === null) {
    return (
      <span className="text-ink-subtle" title={cell.unavailableReason ?? 'Sem dado suficiente no período.'}>
        —
      </span>
    );
  }
  return <span className="tabular-nums">{formatKpiValue(unit, cell.value)}</span>;
}

function SortableHeader({ label, active, direction, onClick }: { label: string; active: boolean; direction: 'asc' | 'desc'; onClick: () => void }): JSX.Element {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 font-medium text-ink-muted hover:text-ink">
      {label}
      <ArrowUpDown size={12} className={active ? 'text-brand-600' : 'text-ink-subtle'} aria-hidden />
      <span className="sr-only">{active ? (direction === 'asc' ? '(crescente)' : '(decrescente)') : ''}</span>
    </button>
  );
}

// BI 4 -- tabela investigativa: ordenacao e busca sao ferramentas do
// usuario, nunca um ranking do sistema (sem rotulo de "melhor"/"pior
// veiculo"). Uma linha por veiculo que aparece em QUALQUER um dos 5
// breakdowns; celula sem dado mostra "-" + motivo, nunca 0.
export function FleetVehicleTable({ range, fleetId }: { range: PeriodRange; fleetId: string | null }): JSX.Element {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [sortBy, setSortBy] = useState<string>('fleet_utilization');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const queries = useQueries({
    queries: METRICS.map((metric) => ({
      queryKey: ['bi', 'kpis', 'breakdown', 'vehicle', metric.kpiId, range, fleetId],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getKpiBreakdown({ ...range, kpiId: metric.kpiId, dimension: 'vehicle' as const, limit: VEHICLE_TABLE_LIMIT, fleetId: fleetId ?? undefined }, signal),
      staleTime: 60_000,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);
  const rows = useMemo(() => mergeRows(queries.map((q) => q.data)), [queries]);

  const filtered = rows.filter((r) => r.label.toLowerCase().includes(debouncedSearch.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => {
    const av = sortBy === 'label' ? a.label : a.cells[sortBy]?.value;
    const bv = sortBy === 'label' ? b.label : b.cells[sortBy]?.value;
    if (typeof av === 'string' || typeof bv === 'string') {
      const cmp = String(av ?? '').localeCompare(String(bv ?? ''));
      return sortDir === 'asc' ? cmp : -cmp;
    }
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  function toggleSort(key: string) {
    if (sortBy === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(key);
      setSortDir('desc');
    }
  }

  const columns: ColumnDef<VehicleRow, unknown>[] = [
    {
      header: () => <SortableHeader label="Veículo" active={sortBy === 'label'} direction={sortDir} onClick={() => toggleSort('label')} />,
      cell: ({ row }) =>
        row.original.vehicleId ? (
          <Link href={`/vehicles/${row.original.vehicleId}`} className="font-medium text-brand-700 hover:text-brand-900">
            {row.original.label}
          </Link>
        ) : (
          <span className="text-ink-subtle">{row.original.label}</span>
        ),
    },
    ...METRICS.map((metric): ColumnDef<VehicleRow, unknown> => ({
      header: () => <SortableHeader label={metric.header} active={sortBy === metric.kpiId} direction={sortDir} onClick={() => toggleSort(metric.kpiId)} />,
      cell: ({ row }) => <MetricCell cell={row.original.cells[metric.kpiId] ?? EMPTY_CELL} unit={metric.unit} />,
    })),
  ];

  return (
    <div className="flex flex-col gap-3">
      <SearchInput value={search} onChange={setSearch} placeholder="Buscar por placa..." />
      <DataTable
        columns={columns}
        data={sorted}
        isLoading={isLoading}
        isError={isError}
        getRowId={(row) => row.vehicleId ?? row.label}
        emptyTitle="Nenhum veículo encontrado"
        emptyDescription={debouncedSearch ? 'Ajuste a busca por placa.' : 'Nenhum veículo no escopo selecionado.'}
      />
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd apps/admin-web && npx jest src/features/intelligence/fleet-vehicle-table.test.tsx`
Expected: PASS. Se `SearchInput` não expuser `placeholder` diretamente ou `DataTable` não aceitar
`header` como função (checar a assinatura real de `ColumnDef` usada em `vehicles/page.tsx` — lá os
headers são strings; `@tanstack/react-table` aceita `header` como string OU função render), ajustar
a chamada para bater com a API real desses componentes, mantendo o comportamento (ordenação por
clique, busca por texto, célula "—" com motivo) — o teste acima guia a correção.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/features/intelligence/fleet-vehicle-table.tsx apps/admin-web/src/features/intelligence/fleet-vehicle-table.test.tsx
git commit -m "feat(bi): tabela de desempenho por veiculo na aba Frota (BI 4)"
```

---

### Task 10: `fleet-tab.tsx` — monta a aba

**Files:**
- Create: `apps/admin-web/src/features/intelligence/fleet-tab.tsx`
- Modify: `apps/admin-web/src/features/intelligence/operation-tab.tsx` (remove bloco migrado)

**Interfaces:**
- Consumes: `FleetVehiclePicker` (Task 8), `FleetVehicleTable` (Task 9), `FleetTimeBand`,
  `KpiCard`, `TrendLineChart`, `toSeriesRows`, `EntitySelect`, `getKpiSummary`/`getKpiSeries`
  (`../../lib/api/bi.api`), `listFleets` (`../../lib/api/fleet.api`), `PeriodRange` (`./period`).
- Produces: `export function FleetTab({ kpis, range, granularity, onGranularityChange, onExplain }: { kpis: Map<string, KpiResultEntity>; range: PeriodRange; granularity: KpiGranularity | null; onGranularityChange: (v: KpiGranularity) => void; onExplain: (kpi: KpiResultEntity) => void }): JSX.Element` (mesma assinatura de `FinancialTab`, para o `page.tsx` tratar as duas abas de forma simétrica).

- [ ] **Step 1: Remover o bloco de frota de `operation-tab.tsx`**

Remover o import `import { FleetTimeBand } from './fleet-time-band';` (linha 9) e, dentro de
`OperationTab`, todo o `<Block title="Distância e tempo da frota" ...>` (linhas ~132-147),
deixando só os blocos "Viagens e entregas" e "Ocorrências". Remover também os ícones que ficaram
sem uso no import de `lucide-react` (`Gauge`, `Milestone`, `Timer`, `Wrench` — conferir se algum
ainda é usado em outro lugar do arquivo antes de remover; `RouteIcon` continua em uso).

- [ ] **Step 2: Criar `fleet-tab.tsx`**

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { Gauge, Milestone, Route as RouteIcon, Timer, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Card, CardBody, CardHeader } from '../../components/ui/card';
import { EmptyState } from '../../components/ui/empty-state';
import { EntitySelect } from '../../components/ui/entity-select';
import { ErrorState } from '../../components/ui/error-state';
import { Skeleton } from '../../components/ui/skeleton';
import { listFleets } from '../../lib/api/fleet.api';
import { getKpiSeries, getKpiSummary } from '../../lib/api/bi.api';
import type { KpiGranularity, KpiResultEntity, VehicleEntity } from '../../types/entities';
import { FleetTimeBand } from './fleet-time-band';
import { FleetVehiclePicker } from './fleet-vehicle-picker';
import { FleetVehicleTable } from './fleet-vehicle-table';
import { TrendLineChart } from './financial-charts';
import { KpiCard } from './kpi-card';
import { indexKpis } from './kpi-format';
import type { PeriodRange } from './period';
import { GRANULARITY_LABELS, isGranularityAllowed, toSeriesRows } from './series-format';

const SUMMARY_KPIS = ['fleet_utilization', 'fleet_availability', 'idle_hours', 'trips_completed', 'distance_km'];
const TREND_KPIS = ['fleet_utilization', 'fleet_availability', 'idle_hours', 'trips_completed'];

function Block({ title, description, action, children }: { title: string; description: string; action?: React.ReactNode; children: React.ReactNode }): JSX.Element {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <p className="text-sm text-ink-muted">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function GranularityControl({ value, range, onChange }: { value: KpiGranularity; range: PeriodRange; onChange: (v: KpiGranularity) => void }): JSX.Element {
  const options: KpiGranularity[] = ['day', 'week', 'month'];
  return (
    <div role="radiogroup" aria-label="Agrupar evolução por" className="flex rounded-lg border border-border bg-surface-muted p-0.5">
      {options.map((option) => {
        const allowed = isGranularityAllowed(option, range.startDate, range.endDate);
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            disabled={!allowed}
            onClick={() => onChange(option)}
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${value === option ? 'bg-white text-ink shadow-xs' : 'text-ink-muted hover:text-ink'}`}
          >
            {GRANULARITY_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}

// BI 4 -- filtro local a ESTA aba (a Central hoje nao tem filtro de
// veiculo/frota em nenhum lugar). Sem selecao, reaproveita o summary global
// da pagina (mesmo dado de Visao geral/Operacao); com selecao, dispara UM
// summary adicional escopado -- nunca uma segunda formula, so um `vehicleId`/
// `fleetId` a mais no MESMO GET /bi/kpis/summary.
export function FleetTab({
  kpis,
  range,
  granularity,
  onGranularityChange,
  onExplain,
}: {
  kpis: Map<string, KpiResultEntity>;
  range: PeriodRange;
  granularity: KpiGranularity | null;
  onGranularityChange: (value: KpiGranularity) => void;
  onExplain: (kpi: KpiResultEntity) => void;
}): JSX.Element {
  const [vehicle, setVehicle] = useState<VehicleEntity | null>(null);
  const [fleetId, setFleetId] = useState('');
  const hasFilter = Boolean(vehicle || fleetId);
  const requestedGranularity = granularity && isGranularityAllowed(granularity, range.startDate, range.endDate) ? granularity : undefined;

  const scopedSummary = useQuery({
    queryKey: ['bi', 'kpis', 'summary', 'fleet-scope', range, vehicle?.id, fleetId],
    queryFn: ({ signal }) =>
      getKpiSummary({ ...range, kpis: SUMMARY_KPIS.join(','), vehicleId: vehicle?.id, fleetId: fleetId || undefined }, signal),
    enabled: hasFilter,
    staleTime: 60_000,
  });
  const activeKpis = hasFilter ? indexKpis(scopedSummary.data?.kpis) : kpis;

  const series = useQuery({
    queryKey: ['bi', 'kpis', 'series', 'fleet', range, requestedGranularity ?? 'auto', vehicle?.id, fleetId],
    queryFn: ({ signal }) =>
      getKpiSeries(
        { ...range, kpis: TREND_KPIS.join(','), granularity: requestedGranularity, comparison: 'PREVIOUS_PERIOD', vehicleId: vehicle?.id, fleetId: fleetId || undefined },
        signal,
      ),
    staleTime: 60_000,
  });
  const seriesData = series.data;
  const effectiveGranularity = seriesData?.granularity ?? requestedGranularity ?? 'day';
  const byId = new Map((seriesData?.series ?? []).map((s) => [s.id, s]));
  const pointCount = seriesData?.series[0]?.points.length ?? 0;

  const card = (id: string, icon: typeof RouteIcon) => {
    const kpi = activeKpis.get(id);
    return kpi ? <KpiCard key={id} kpi={kpi} icon={icon} onExplain={onExplain} /> : null;
  };

  return (
    <div className="flex flex-col gap-10">
      <Block
        title="Filtro da frota"
        description="Restringe os indicadores desta aba a um veículo ou frota. Sem seleção, mostra a frota inteira."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <FleetVehiclePicker
              selectedVehicle={vehicle}
              onSelect={(v) => {
                setVehicle(v);
                setFleetId('');
              }}
              onClear={() => setVehicle(null)}
            />
            <EntitySelect<{ id: string; name: string }>
              queryKey={['fleets', 'picker']}
              queryFn={() => listFleets({ pageSize: 100 })}
              getOptionValue={(f) => f.id}
              getOptionLabel={(f) => f.name}
              value={fleetId}
              onChange={(value) => {
                setFleetId(value);
                setVehicle(null);
              }}
              placeholder="Todas as frotas"
              disabled={Boolean(vehicle)}
            />
          </div>
        }
      >
        <></>
      </Block>

      <Block title="Resumo da frota" description="Utilização, disponibilidade, ociosidade, viagens e distância no período.">
        {hasFilter && scopedSummary.isLoading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-busy="true" aria-label="Carregando indicadores da frota">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        )}
        {hasFilter && scopedSummary.isError && <ErrorState title="Não foi possível carregar os indicadores do filtro." onRetry={() => scopedSummary.refetch()} />}
        {(!hasFilter || scopedSummary.data) && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {card('fleet_utilization', Gauge)}
            {card('fleet_availability', Wrench)}
            {card('idle_hours', Timer)}
            {card('trips_completed', RouteIcon)}
            {card('distance_km', Milestone)}
          </div>
        )}
      </Block>

      <Block
        title="Evolução da frota"
        description="Cada ponto usa o mesmo cálculo dos indicadores acima, aplicado ao intervalo."
        action={<GranularityControl value={effectiveGranularity} range={range} onChange={onGranularityChange} />}
      >
        {series.isLoading && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Carregando evolução da frota">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-72 w-full" />
            ))}
          </div>
        )}
        {series.isError && <ErrorState title="Não foi possível carregar a evolução." onRetry={() => series.refetch()} />}
        {seriesData && pointCount < 2 && (
          <EmptyState title="Período curto demais para mostrar evolução" description="Escolha 7 dias ou mais, ou agrupe por um intervalo menor." />
        )}
        {seriesData && pointCount >= 2 && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {TREND_KPIS.map((id) => {
              const s = byId.get(id);
              if (!s) return null;
              return (
                <Card key={id}>
                  <CardHeader title={s.name} />
                  <CardBody>
                    <TrendLineChart rows={toSeriesRows(s, effectiveGranularity)} unit={s.unit} name={s.name} showPrevious />
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
        {seriesData && seriesData.series.some((s) => s.points.some((p) => p.partial)) && (
          <p className="text-xs text-ink-subtle">Intervalos marcados como incompletos começaram antes do período ou ainda estão em andamento.</p>
        )}
      </Block>

      <Block title="Composição do tempo da frota" description="Como as horas dos veículos no escopo se distribuíram: viagem, manutenção, ociosidade e o que não tem registro suficiente para ser classificado.">
        {activeKpis.get('fleet_utilization')?.value != null ? (
          <Card>
            <CardBody>
              <FleetTimeBand kpi={activeKpis.get('fleet_utilization')} />
            </CardBody>
          </Card>
        ) : (
          <EmptyState title="Sem dado de tempo de frota no período" description="Nenhum veículo com capacidade calculável no escopo e período selecionados." />
        )}
      </Block>

      <Block title="Desempenho por veículo" description="Utilização, disponibilidade, ociosidade, viagens e distância de cada veículo do escopo. Ordene ou busque para investigar — não é um ranking.">
        {vehicle ? (
          <EmptyState title="Filtro já restrito a 1 veículo" description="Limpe o filtro de veículo acima para comparar todos os veículos da frota." />
        ) : (
          <FleetVehicleTable range={range} fleetId={fleetId || null} />
        )}
      </Block>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/admin-web && npx tsc --noEmit -p tsconfig.json`
Expected: sem erros. Se `EntitySelect<{id,name}>` reclamar do tipo do retorno de `listFleets`
(que devolve `Paginated<FleetEntity>`, compatível estruturalmente com `{items: T[]}`), trocar o
genérico por `FleetEntity` (import de `../../types/entities`) em vez do tipo inline.

- [ ] **Step 3: Commit**

```bash
git add apps/admin-web/src/features/intelligence/fleet-tab.tsx apps/admin-web/src/features/intelligence/operation-tab.tsx
git commit -m "feat(bi): monta a aba Frota da Central de Inteligencia (BI 4)"
```

---

### Task 11: Ligar a aba na Central (`intelligence-config.ts` + `page.tsx`)

**Files:**
- Modify: `apps/admin-web/src/features/intelligence/intelligence-config.ts:36-48`
- Modify: `apps/admin-web/src/app/(app)/dashboard/page.tsx:19,39,187-198`

**Interfaces:**
- Consumes: `FleetTab` (Task 10).

- [ ] **Step 1: Remover o `upcoming` da aba `fleet`**

Em `intelligence-config.ts`, trocar:

```ts
  {
    value: 'fleet',
    label: 'Frota',
    upcoming: {
      phase: 'BI 4',
      summary: 'Utilização, disponibilidade, consumo e desempenho por veículo.',
      screens: [
        { label: 'Gestão da frota', href: '/operations/fleet' },
        { label: 'Abastecimento', href: '/operations/fleet/fuel' },
        { label: 'Manutenção', href: '/operations/fleet/maintenance' },
      ],
    },
  },
```

por:

```ts
  { value: 'fleet', label: 'Frota' },
```

- [ ] **Step 2: Renderizar `FleetTab` em `page.tsx`**

Adicionar o import (junto dos demais de `features/intelligence`):

```ts
import { FleetTab } from '../../../features/intelligence/fleet-tab';
```

Incluir `'fleet'` em `DATA_TABS`:

```ts
const DATA_TABS: IntelligenceTab[] = ['overview', 'operation', 'financial', 'fleet'];
```

E, ao lado do bloco da aba Financeiro, adicionar:

```tsx
        {tab === 'fleet' && summary.data && range && (
          <FleetTab
            kpis={kpis}
            range={range}
            granularity={granularity}
            onGranularityChange={(value) => updateParams({ agrupar: value })}
            onExplain={setExplained}
          />
        )}
```

- [ ] **Step 2: Rodar o build**

Run: `cd apps/admin-web && npx next build`
Expected: build sem erros (avisos pré-existentes não relacionados a este trabalho são aceitáveis).

- [ ] **Step 3: Commit**

```bash
git add apps/admin-web/src/features/intelligence/intelligence-config.ts apps/admin-web/src/app/\(app\)/dashboard/page.tsx
git commit -m "feat(bi): ativa a aba Frota na Central de Inteligencia (BI 4)"
```

---

### Task 12: Testes de regressão e da aba Frota em `page.test.tsx`

**Files:**
- Modify: `apps/admin-web/src/app/(app)/dashboard/page.test.tsx`

**Interfaces:**
- Consumes: mocks já existentes no arquivo para `getKpiSummary`/`getKpiSeries`/`getKpiBreakdown`
  (mesmo padrão usado no `describe('Central -- aba Financeiro (BI 3)')`).

- [ ] **Step 1: Ajustar o teste "aba Operacao: pontualidade com cobertura baixa e horas da frota"**

Esse teste (linha ~288) hoje verifica os cards de frota dentro da aba Operação. Como o bloco foi
migrado (Task 10), remover dele as asserções sobre `distance_km`/`fleet_utilization`/
`fleet_availability`/`idle_hours`/`FleetTimeBand`, mantendo só a parte de pontualidade — e renomear
para refletir o escopo reduzido:

```ts
  it('aba Operacao: pontualidade com cobertura baixa', async () => {
    // (manter so as asserções de OnTimePanel/cobertura; remover as de
    // distance_km/fleet_utilization/fleet_availability/idle_hours/FleetTimeBand,
    // que agora pertencem ao describe da aba Frota abaixo)
  });
```

(Ler o corpo atual do teste antes de editar e preservar exatamente as asserções de pontualidade que
já existem, só removendo as de frota.)

- [ ] **Step 2: Escrever o describe da aba Frota (falhando antes da Task 11, passando depois)**

Adicionar, depois do `describe('Central -- aba Financeiro (BI 3)', ...)`, um novo describe
completo. Reaproveitar os helpers de mock já definidos no topo do arquivo (`mockSummary`,
`mockSeries`, `renderDashboard` ou equivalente — usar exatamente os nomes que o arquivo já define
para os describes de Financeiro; ler `financial-tab` describe em detalhe antes de escrever este
para copiar o padrão de setup/mocks/render):

```ts
describe('Central -- aba Frota (BI 4)', () => {
  // setup espelhando o describe da aba Financeiro: mock de getKpiSummary com os
  // 5 KPIs de frota, mock de getKpiSeries com fleet_utilization/fleet_availability/
  // idle_hours/trips_completed, mock de getKpiBreakdown por kpiId (5 chamadas).

  it('resumo com os 5 KPIs de frota, do mesmo summary das outras abas quando sem filtro', async () => {
    // renderiza a aba fleet, confirma que getKpiSummary NAO foi chamado de novo
    // (reaproveita o summary global) e que os 5 cards aparecem.
  });

  it('selecionar um veiculo dispara um summary escopado; limpar o filtro volta ao summary global', async () => {
    // seleciona um veiculo no FleetVehiclePicker, confirma um novo getKpiSummary
    // com vehicleId; limpa o filtro, confirma que os cards voltam ao summary global
    // sem nova chamada.
  });

  it('composicao do tempo mostra "Não registrado / cobertura insuficiente", nunca rotula como ocioso', async () => {
    // asserção de texto no FleetTimeBand renderizado dentro da aba.
  });

  it('tabela por veiculo: UNAVAILABLE nunca vira 0; busca e ordenacao funcionam', async () => {
    // reaproveita o mesmo cenario de fleet-vehicle-table.test.tsx, agora dentro da pagina inteira.
  });

  it('filtrar por 1 veiculo esconde a tabela por veiculo e explica o motivo', async () => {
  });

  it('drill-down dos 5 cards de frota para as telas existentes', async () => {
    // fleet_utilization/fleet_availability -> /operations/fleet; idle_hours ->
    // /operations/control-tower; trips_completed -> /trips; distance_km ->
    // /operations/fleet/costs (KPI_DRILL_DOWN ja existente, sem mudanca).
  });

  it('"Como é calculado" funciona nos 5 KPIs de frota', async () => {
  });

  it('loading, erro e retry do resumo escopado e da evolucao', async () => {
  });

  it('regressao: aba Operacao nao mostra mais o bloco de frota', async () => {
    // renderiza tab=operation, confirma ausencia de FleetTimeBand/cards de frota.
  });
});
```

Escrever cada `it` com as asserções reais (`expect(...)`), seguindo literalmente o estilo dos `it`s
já existentes no describe da aba Financeiro (mocks de `../../../lib/api/bi.api` via
`jest.mock`, `render` + `waitFor` + `screen.getByText`/`getByRole`, clique com `userEvent`) — não
deixar nenhum teste vazio.

- [ ] **Step 3: Rodar a suíte inteira do arquivo**

Run: `cd apps/admin-web && npx jest src/app/\(app\)/dashboard/page.test.tsx`
Expected: PASS — incluindo Visão Geral/Operação/Financeiro (regressão) e o novo describe da Frota.

- [ ] **Step 4: Commit**

```bash
git add apps/admin-web/src/app/\(app\)/dashboard/page.test.tsx
git commit -m "test(bi): cobre a aba Frota e a regressao da aba Operacao (BI 4)"
```

---

### Task 13: Verificação final e documentação

**Files:**
- Modify: `docs/bi-kpis.md` (adicionar seção 14)

- [ ] **Step 1: Suíte completa da API**

Run: `cd apps/api && npx jest`
Expected: PASS (toda a suíte, não só os arquivos tocados neste plano).

- [ ] **Step 2: Suíte completa do admin-web**

Run: `cd apps/admin-web && npx jest`
Expected: PASS, exceto a falha pré-existente conhecida em `parts/page.test.tsx` (se ainda
presente) — confirmar que ela já falhava ANTES deste plano (`git stash` + rodar só esse arquivo, ou
checar histórico) antes de ignorá-la no relatório final.

- [ ] **Step 3: Build, typecheck e lint do admin-web**

Run: `cd apps/admin-web && npx next build && npx tsc --noEmit -p tsconfig.json && npx eslint src/features/intelligence src/app/\(app\)/dashboard`
Expected: sem erros.

- [ ] **Step 4: Typecheck e lint da API**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx eslint src/bi src/fleet-operations src/common/utils/vehicle-distance.util.ts`
Expected: sem erros.

- [ ] **Step 5: Documentar no `docs/bi-kpis.md`**

Adicionar, ao final do arquivo (depois da seção "13.5 Legado GET /dashboard"), uma seção nova
seguindo o MESMO formato das seções 12/13 (contexto, o que já existia, o que foi criado, endpoints,
arquivos, decisões, limitações), cobrindo exatamente o conteúdo do relatório técnico final (Task
14) — não duplicar o texto da spec, resumir e linkar `docs/superpowers/specs/2026-09-25-bi4-fleet-tab-design.md`.

- [ ] **Step 6: Commit**

```bash
git add docs/bi-kpis.md
git commit -m "docs(bi): documenta a BI 4 (aba Frota) em docs/bi-kpis.md"
```

- [ ] **Step 7: Relatório técnico final**

Entregar ao usuário (fora do plano, na conversa) o relatório pedido no brief original: implementado,
arquivos criados/alterados, endpoints, KPIs utilizados, regras reutilizadas, testes e resultados,
limitações, decisões arquiteturais, pontos para BI 5/BI 7. Não avançar para a BI 5.

---

## Self-Review (executado ao escrever este plano)

1. **Cobertura da spec**: seções 1–3 (auditoria, catálogo, série) cobertas pela Task Map + Tasks
   1–7; seção 4 (composição do tempo) na Task 10; seção 5 (por veículo) nas Tasks 1–2, 4, 9;
   seção 6 (filtros) na Task 10 (2.1 do design); seção 7 (drill-down) reaproveita
   `KPI_DRILL_DOWN` sem mudança, testado na Task 12; seção 8 ("como é calculado") reaproveita
   `kpi-detail-drawer.tsx` sem mudança, testado na Task 12; seção 9 (UX) coberta pela Task 10 (cores/
   estados já herdados de `KpiCard`/`EmptyState`/`ErrorState`/`Skeleton`); seção 10 (segurança) —
   ver Review Focus e Task 6; seção 11 (performance) — ver Global Constraints e Task 4 (queries
   fixas); seções 12–13 (testes) — Tasks 6 e 12; seção 15 (critério de conclusão) — Task 13.
2. **Placeholder scan**: nenhum "TBD"/"implementar depois" nos passos de código; os únicos pontos
   deliberadamente abertos (Task 9 Step 4, Task 12 Steps 1–2) pedem para o implementador LER o
   arquivo real antes de ajustar — não são lacunas de especificação, são pontos que dependem do
   texto exato já existente no arquivo a ser modificado.
3. **Consistência de tipos**: `BreakdownResult`, `VehicleFleetTime`, `KpiBreakdownItemEntity`,
   `BiScope`, `KpiPeriod` usados com os mesmos nomes/formas em Tasks 1, 4, 5, 6, 9, 10 — conferido
   contra as assinaturas reais lidas do código antes de escrever o plano.
4. **Review Focus**: as 5 entradas do topo têm teste dedicado: vendido/cadastrado fora da janela
   (Task 4 Step 1, Task 6 Step 2 "veiculo vendido"), veículo removido (Task 4 Step 1 "removido",
   Task 6 Step 2 "trips_completed"), frota vazia (Task 12 Step 2 "loading, erro e retry"; reforçar
   também um teste de tenant sem nenhum veículo se o tempo permitir — não crítico o bastante para
   virar uma 6ª entrada), alternar filtro (Task 12 Step 2 "selecionar um veiculo... limpar o
   filtro"), share/others sempre null nas razões (Task 4 Step 1, Task 6 Step 2).
