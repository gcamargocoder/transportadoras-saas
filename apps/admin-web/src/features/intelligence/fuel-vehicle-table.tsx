'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpDown } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { DataTable } from '../../components/ui/data-table';
import { SearchInput } from '../../components/ui/search-input';
import { useDebounce } from '../../hooks/use-debounce';
import { getKpiBreakdown } from '../../lib/api/bi.api';
import type { KpiBreakdownItemEntity } from '../../types/entities';
import { formatKpiValue } from './kpi-format';
import type { PeriodRange } from './period';

const VEHICLE_TABLE_LIMIT = 500;

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

// Fase 6, secao 6 -- abastecimento interno por veiculo: litros e contagem
// (mesmo GET /bi/kpis/breakdown?kpiId=fuel_internal_liters&dimension=vehicle
// -- recordCount ja vem no item, sem uma segunda chamada). Custo nunca
// aparece aqui -- abastecimento interno nao tem preco/total registrado
// (litros saem do proprio estoque, sem uma compra associada a ELE).
export function FuelVehicleTable({ range, tankId }: { range: PeriodRange; tankId: string | null }): JSX.Element {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [sortBy, setSortBy] = useState<'label' | 'liters' | 'count'>('liters');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const query = useQuery({
    queryKey: ['bi', 'kpis', 'breakdown', 'vehicle', 'fuel_internal_liters', range, tankId],
    queryFn: ({ signal }) =>
      getKpiBreakdown(
        { ...range, kpiId: 'fuel_internal_liters', dimension: 'vehicle', limit: VEHICLE_TABLE_LIMIT, tankId: tankId ?? undefined },
        signal,
      ),
    staleTime: 60_000,
  });

  const rows = query.data?.items ?? [];
  const filtered = rows.filter((r) => r.label.toLowerCase().includes(debouncedSearch.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'label') {
      const cmp = a.label.localeCompare(b.label);
      return sortDir === 'asc' ? cmp : -cmp;
    }
    const av = sortBy === 'liters' ? a.value : a.recordCount;
    const bv = sortBy === 'liters' ? b.value : b.recordCount;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  function toggleSort(key: typeof sortBy) {
    if (sortBy === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(key);
      setSortDir('desc');
    }
  }

  const columns: ColumnDef<KpiBreakdownItemEntity, unknown>[] = [
    {
      id: 'label',
      header: () => <SortableHeader label="Veículo" active={sortBy === 'label'} direction={sortDir} onClick={() => toggleSort('label')} />,
      cell: ({ row }) =>
        row.original.key ? (
          <Link href={`/vehicles/${row.original.key}`} className="font-medium text-brand-700 hover:text-brand-900">
            {row.original.label}
          </Link>
        ) : (
          <span className="text-ink-subtle">{row.original.label}</span>
        ),
    },
    {
      id: 'liters',
      header: () => <SortableHeader label="Litros abastecidos" active={sortBy === 'liters'} direction={sortDir} onClick={() => toggleSort('liters')} />,
      cell: ({ row }) => <span className="tabular-nums">{formatKpiValue('LITERS', row.original.value)}</span>,
    },
    {
      id: 'count',
      header: () => <SortableHeader label="Abastecimentos" active={sortBy === 'count'} direction={sortDir} onClick={() => toggleSort('count')} />,
      cell: ({ row }) => <span className="tabular-nums">{formatKpiValue('COUNT', row.original.recordCount)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <SearchInput value={search} onChange={setSearch} placeholder="Buscar por placa..." />
      <DataTable
        columns={columns}
        data={sorted}
        isLoading={query.isLoading}
        isError={query.isError}
        getRowId={(row) => row.key ?? row.label}
        emptyTitle="Nenhum abastecimento interno no período"
        emptyDescription={
          debouncedSearch ? 'Ajuste a busca por placa.' : 'Quando um motorista abastecer pelo Driver App a partir de um tanque próprio, o registro aparece aqui.'
        }
      />
    </div>
  );
}
