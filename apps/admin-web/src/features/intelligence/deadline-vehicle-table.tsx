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

// BI 6 -- mesmo padrao de CostVehicleTable (BI 5): cada KPI tem sua propria
// chamada de breakdown?dimension=vehicle. limit alto: tabela investigativa
// (todos os veiculos), nao um "top N".
const VEHICLE_TABLE_LIMIT = 500;

interface MetricConfig {
  kpiId: string;
  unit: 'COUNT' | 'PERCENT';
  header: string;
}

const METRICS: MetricConfig[] = [
  { kpiId: 'deliveries_completed', unit: 'COUNT', header: 'Entregas' },
  { kpiId: 'on_time_delivery_rate', unit: 'PERCENT', header: 'No prazo' },
  { kpiId: 'occurrences_total', unit: 'COUNT', header: 'Ocorrências' },
  { kpiId: 'occurrences_critical', unit: 'COUNT', header: 'Críticas' },
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
      const rowKey = it.key ?? `__unassigned__${it.label}`;
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

function SortableHeader({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: 'asc' | 'desc';
  onClick: () => void;
}): JSX.Element {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 font-medium text-ink-muted hover:text-ink">
      {label}
      <ArrowUpDown size={12} className={active ? 'text-brand-600' : 'text-ink-subtle'} aria-hidden />
      <span className="sr-only">{active ? (direction === 'asc' ? '(crescente)' : '(decrescente)') : ''}</span>
    </button>
  );
}

// BI 6 -- tabela investigativa de prazos por veiculo: ordenacao e busca sao
// ferramentas do usuario, nunca um ranking do sistema. Celula sem dado
// mostra "-" + motivo (nunca 0%/0 inventado); 0 real (veiculo sem ocorrencia
// na categoria) aparece como "0".
export function DeadlineVehicleTable({ range, fleetId }: { range: PeriodRange; fleetId: string | null }): JSX.Element {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [sortBy, setSortBy] = useState<string>('deliveries_completed');
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
    const an = av ?? null;
    const bn = bv ?? null;
    if (an === null && bn === null) return 0;
    if (an === null) return 1;
    if (bn === null) return -1;
    return sortDir === 'asc' ? an - bn : bn - an;
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
      id: 'label',
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
    ...METRICS.map(
      (metric): ColumnDef<VehicleRow, unknown> => ({
        id: metric.kpiId,
        header: () => <SortableHeader label={metric.header} active={sortBy === metric.kpiId} direction={sortDir} onClick={() => toggleSort(metric.kpiId)} />,
        cell: ({ row }) => <MetricCell cell={row.original.cells[metric.kpiId] ?? EMPTY_CELL} unit={metric.unit} />,
      }),
    ),
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
