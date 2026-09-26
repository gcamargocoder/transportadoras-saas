import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KpiBreakdownEntity } from '../../types/entities';
import { DeadlineVehicleTable } from './deadline-vehicle-table';

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
      <DeadlineVehicleTable range={range} fleetId={fleetId} />
    </QueryClientProvider>,
  );
}

describe('DeadlineVehicleTable', () => {
  beforeEach(() => {
    getKpiBreakdownMock.mockReset();
    getKpiBreakdownMock.mockImplementation(async (query: { kpiId: string }) => {
      if (query.kpiId === 'on_time_delivery_rate') {
        return breakdown([
          { key: 'v1', label: 'AAA1111', value: 91.2 },
          { key: 'v2', label: 'BBB2222', value: null, unavailableReason: 'Nenhuma entrega concluida no periodo com previsao de chegada.' },
        ]);
      }
      return breakdown([
        { key: 'v1', label: 'AAA1111', value: 3 },
        { key: 'v2', label: 'BBB2222', value: 0 },
      ]);
    });
  });

  it('mostra uma linha por veiculo com as 4 metricas, sem rotular melhor/pior', async () => {
    renderTable();
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('AAA1111')).toBeInTheDocument());
    expect(within(table).getByText('BBB2222')).toBeInTheDocument();
    expect(within(table).queryByText(/melhor veiculo/i)).not.toBeInTheDocument();
    expect(within(table).queryByText(/pior veiculo/i)).not.toBeInTheDocument();
  });

  it('celula UNAVAILABLE (sem entrega com previsao) mostra travessao e o motivo, nunca 0%', async () => {
    renderTable();
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('BBB2222')).toBeInTheDocument());
    const row = within(table).getByText('BBB2222').closest('tr') as HTMLElement;
    expect(row).toHaveTextContent('—');
    expect(row).not.toHaveTextContent(/^0%$/);
    // ocorrencias de v2 sao 0 real (aparece formatado, nunca travessao la)
    expect(within(row).getAllByText('0').length).toBeGreaterThan(0);
  });

  it('busca por placa filtra as linhas', async () => {
    renderTable();
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('AAA1111')).toBeInTheDocument());
    await userEvent.type(screen.getByPlaceholderText('Buscar por placa...'), 'BBB');
    await waitFor(() => expect(within(table).queryByText('AAA1111')).not.toBeInTheDocument());
    expect(within(table).getByText('BBB2222')).toBeInTheDocument();
  });

  it('com fleetId, propaga o filtro para as 4 chamadas de breakdown', async () => {
    renderTable('frota-1');
    await waitFor(() => expect(getKpiBreakdownMock).toHaveBeenCalled());
    for (const call of getKpiBreakdownMock.mock.calls) {
      expect(call[0]).toMatchObject({ fleetId: 'frota-1', dimension: 'vehicle' });
    }
  });
});
