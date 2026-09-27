import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KpiBreakdownEntity } from '../../types/entities';
import { FuelVehicleTable } from './fuel-vehicle-table';

const getKpiBreakdownMock = vi.fn();

vi.mock('../../lib/api/bi.api', () => ({
  getKpiBreakdown: (...args: unknown[]) => getKpiBreakdownMock(...args),
}));

const range = { startDate: '2026-01-01', endDate: '2026-01-31' };

function breakdown(
  items: { key: string | null; label: string; value: number | null; recordCount?: number }[],
): KpiBreakdownEntity {
  return {
    kpiId: 'fuel_internal_liters',
    dimension: 'vehicle',
    scope: { tenantId: 't', vehicleId: null, fleetId: null, customerId: null, tankId: null },
    period: { start: range.startDate, end: range.endDate },
    total: null,
    others: null,
    items: items.map((i) => ({ share: null, unavailableReason: null, recordCount: 0, ...i })),
  };
}

function renderTable(tankId: string | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FuelVehicleTable range={range} tankId={tankId} />
    </QueryClientProvider>,
  );
}

describe('FuelVehicleTable', () => {
  beforeEach(() => {
    getKpiBreakdownMock.mockReset();
    getKpiBreakdownMock.mockResolvedValue(
      breakdown([
        { key: 'v1', label: 'AAA1111', value: 200, recordCount: 2 },
        { key: null, label: 'Sem veículo', value: 90, recordCount: 1 },
      ]),
    );
  });

  it('mostra litros e numero de abastecimentos por veiculo, incluindo "Sem veículo"', async () => {
    renderTable();
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('AAA1111')).toBeInTheDocument());
    expect(within(table).getByText('Sem veículo')).toBeInTheDocument();
    const row = within(table).getByText('AAA1111').closest('tr') as HTMLElement;
    expect(row).toHaveTextContent('200 L');
    expect(row).toHaveTextContent('2');
  });

  it('nunca mostra uma coluna de custo (abastecimento interno nao tem preco proprio)', async () => {
    renderTable();
    await screen.findByRole('table');
    expect(screen.queryByText(/custo/i)).not.toBeInTheDocument();
  });

  it('vazio: nenhum abastecimento interno no periodo', async () => {
    getKpiBreakdownMock.mockResolvedValue(breakdown([]));
    renderTable();
    expect(await screen.findByText('Nenhum abastecimento interno no período')).toBeInTheDocument();
  });

  it('busca por placa filtra as linhas', async () => {
    renderTable();
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('AAA1111')).toBeInTheDocument());
    await userEvent.type(screen.getByPlaceholderText('Buscar por placa...'), 'ZZZ');
    await waitFor(() => expect(within(table).queryByText('AAA1111')).not.toBeInTheDocument());
  });

  it('com tankId, propaga o filtro para o breakdown', async () => {
    renderTable('tank-1');
    await waitFor(() => expect(getKpiBreakdownMock).toHaveBeenCalledWith(expect.objectContaining({ tankId: 'tank-1' }), expect.anything()));
  });
});
