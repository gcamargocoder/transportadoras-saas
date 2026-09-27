import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KpiBreakdownEntity } from '../../types/entities';
import { FuelTankTable } from './fuel-tank-table';

const getKpiBreakdownMock = vi.fn();

vi.mock('../../lib/api/bi.api', () => ({
  getKpiBreakdown: (...args: unknown[]) => getKpiBreakdownMock(...args),
}));

const range = { startDate: '2026-01-01', endDate: '2026-01-31' };

function breakdown(
  items: { key: string | null; label: string; value: number | null; unavailableReason?: string | null }[],
): KpiBreakdownEntity {
  return {
    kpiId: 'x',
    dimension: 'tank',
    scope: { tenantId: 't', vehicleId: null, fleetId: null, customerId: null, tankId: null },
    period: { start: range.startDate, end: range.endDate },
    total: null,
    others: null,
    items: items.map((i) => ({ share: null, recordCount: 0, unavailableReason: i.unavailableReason ?? null, ...i })),
  };
}

function renderTable() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FuelTankTable range={range} />
    </QueryClientProvider>,
  );
}

describe('FuelTankTable', () => {
  beforeEach(() => {
    getKpiBreakdownMock.mockReset();
    getKpiBreakdownMock.mockImplementation(async (query: { kpiId: string }) => {
      if (query.kpiId === 'fuel_tank_stock') {
        return breakdown([
          { key: 'tank1', label: 'Tanque matriz', value: 1500 },
          { key: 'tank2', label: 'Tanque filial', value: null, unavailableReason: 'Tanque sem movimentacao registrada ate o fim do periodo.' },
        ]);
      }
      return breakdown([
        { key: 'tank1', label: 'Tanque matriz', value: 500 },
        { key: 'tank2', label: 'Tanque filial', value: 0 },
      ]);
    });
  });

  it('mostra uma linha por tanque com as 5 metricas (nunca assume um unico tanque)', async () => {
    renderTable();
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('Tanque matriz')).toBeInTheDocument());
    expect(within(table).getByText('Tanque filial')).toBeInTheDocument();
  });

  it('celula UNAVAILABLE (estoque sem movimentacao ate o periodo) mostra travessao e o motivo, nunca 0', async () => {
    renderTable();
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('Tanque filial')).toBeInTheDocument());
    const row = within(table).getByText('Tanque filial').closest('tr') as HTMLElement;
    expect(row).toHaveTextContent('—');
  });

  it('busca por nome do tanque filtra as linhas', async () => {
    renderTable();
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('Tanque matriz')).toBeInTheDocument());
    await userEvent.type(screen.getByPlaceholderText('Buscar por tanque...'), 'filial');
    await waitFor(() => expect(within(table).queryByText('Tanque matriz')).not.toBeInTheDocument());
    expect(within(table).getByText('Tanque filial')).toBeInTheDocument();
  });

  it('dispara as 5 chamadas de breakdown por tanque', async () => {
    renderTable();
    await waitFor(() => expect(getKpiBreakdownMock).toHaveBeenCalledTimes(5));
    for (const call of getKpiBreakdownMock.mock.calls) {
      expect(call[0]).toMatchObject({ dimension: 'tank' });
    }
  });
});
