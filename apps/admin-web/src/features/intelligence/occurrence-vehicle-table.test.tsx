import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KpiBreakdownEntity } from '../../types/entities';
import { OccurrenceVehicleTable } from './occurrence-vehicle-table';

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
    scope: { tenantId: 't', vehicleId: null, fleetId: null, customerId: null, tankId: null },
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
      <OccurrenceVehicleTable range={range} fleetId={fleetId} />
    </QueryClientProvider>,
  );
}

describe('OccurrenceVehicleTable', () => {
  beforeEach(() => {
    getKpiBreakdownMock.mockReset();
    getKpiBreakdownMock.mockImplementation(async (query: { kpiId: string }) => {
      if (query.kpiId === 'occurrences_critical') {
        return breakdown([
          { key: 'v1', label: 'AAA1111', value: 1 },
          { key: 'v2', label: 'BBB2222', value: 0 },
        ]);
      }
      if (query.kpiId === 'trips_completed') {
        return breakdown([
          { key: 'v1', label: 'AAA1111', value: 6 },
          { key: 'v2', label: 'BBB2222', value: 40 },
        ]);
      }
      return breakdown([
        { key: 'v1', label: 'AAA1111', value: 3 },
        { key: 'v2', label: 'BBB2222', value: 1 },
      ]);
    });
  });

  it('mostra uma linha por veiculo com ocorrencias/criticas/viagens de contexto, sem rotular melhor/pior', async () => {
    renderTable();
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('AAA1111')).toBeInTheDocument());
    expect(within(table).getByText('BBB2222')).toBeInTheDocument();
    expect(within(table).queryByText(/problematic|problematico/i)).not.toBeInTheDocument();
    expect(within(table).queryByText(/melhor veiculo/i)).not.toBeInTheDocument();
  });

  it('veiculo com muitas viagens (mais exposicao) nao e rotulado -- so o valor absoluto aparece', async () => {
    renderTable();
    const table = await screen.findByRole('table');
    const row = within(table).getByText('BBB2222').closest('tr') as HTMLElement;
    await waitFor(() => expect(row).toHaveTextContent('40'));
    expect(row).not.toHaveTextContent(/\/viagem|por viagem/i);
  });

  it('busca por placa filtra as linhas', async () => {
    renderTable();
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('AAA1111')).toBeInTheDocument());
    await userEvent.type(screen.getByPlaceholderText('Buscar por placa...'), 'BBB');
    await waitFor(() => expect(within(table).queryByText('AAA1111')).not.toBeInTheDocument());
    expect(within(table).getByText('BBB2222')).toBeInTheDocument();
  });

  it('com fleetId, propaga o filtro para as 3 chamadas de breakdown', async () => {
    renderTable('frota-1');
    await waitFor(() => expect(getKpiBreakdownMock).toHaveBeenCalled());
    for (const call of getKpiBreakdownMock.mock.calls) {
      expect(call[0]).toMatchObject({ fleetId: 'frota-1', dimension: 'vehicle' });
    }
  });
});
