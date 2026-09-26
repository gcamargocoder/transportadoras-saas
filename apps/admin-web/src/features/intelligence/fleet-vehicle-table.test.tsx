import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KpiBreakdownEntity } from '../../types/entities';
import { FleetVehicleTable } from './fleet-vehicle-table';

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
    dimension: 'vehicle',
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
    getKpiBreakdownMock.mockReset();
    getKpiBreakdownMock.mockImplementation(async (query: { kpiId: string }) => {
      if (query.kpiId === 'fleet_utilization') {
        return breakdown([
          { key: 'v1', label: 'AAA1111', value: 80 },
          { key: 'v2', label: 'BBB2222', value: null, unavailableReason: 'Fora de operacao.' },
        ]);
      }
      if (query.kpiId === 'distance_km') {
        return breakdown([
          { key: 'v1', label: 'AAA1111', value: 1200 },
          { key: 'v2', label: 'BBB2222', value: 300 },
        ]);
      }
      return breakdown([
        { key: 'v1', label: 'AAA1111', value: 5 },
        { key: 'v2', label: 'BBB2222', value: 2 },
      ]);
    });
  });

  it('mostra uma linha por veiculo com as 5 metricas, sem rotular melhor/pior', async () => {
    renderTable();
    // DataTable renderiza tabela (desktop) e cartoes (mobile) ao mesmo tempo
    // -- so o CSS (hidden md:block / md:hidden) decide qual aparece, entao no
    // jsdom os dois existem no DOM. Escopar em <table> evita duplicidade.
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('AAA1111')).toBeInTheDocument());
    expect(within(table).getByText('BBB2222')).toBeInTheDocument();
    expect(within(table).queryByText(/melhor veiculo/i)).not.toBeInTheDocument();
    expect(within(table).queryByText(/pior veiculo/i)).not.toBeInTheDocument();
  });

  it('celula UNAVAILABLE mostra travessao e o motivo, nunca 0', async () => {
    renderTable();
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('BBB2222')).toBeInTheDocument());
    const row = within(table).getByText('BBB2222').closest('tr');
    expect(row).toHaveTextContent('—');
    expect(row).not.toHaveTextContent(/^0%$/);
  });

  it('busca por placa filtra as linhas', async () => {
    renderTable();
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('AAA1111')).toBeInTheDocument());
    await userEvent.type(screen.getByPlaceholderText(/placa/i), 'BBB');
    await waitFor(() => expect(within(table).queryByText('AAA1111')).not.toBeInTheDocument());
    expect(within(table).getByText('BBB2222')).toBeInTheDocument();
  });

  it('ordenar por distancia inverte a ordem das linhas', async () => {
    renderTable();
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('AAA1111')).toBeInTheDocument());
    await userEvent.click(within(table).getByRole('button', { name: /distância/i }));
    const rowsBefore = within(table).getAllByRole('row').map((r) => r.textContent);
    await userEvent.click(within(table).getByRole('button', { name: /distância/i }));
    const rowsAfter = within(table).getAllByRole('row').map((r) => r.textContent);
    expect(rowsBefore).not.toEqual(rowsAfter);
  });

  it('com fleetId, propaga o filtro para as 5 chamadas de breakdown', async () => {
    renderTable('frota-1');
    await waitFor(() => expect(getKpiBreakdownMock).toHaveBeenCalled());
    for (const call of getKpiBreakdownMock.mock.calls) {
      expect(call[0]).toMatchObject({ fleetId: 'frota-1', dimension: 'vehicle' });
    }
  });
});
