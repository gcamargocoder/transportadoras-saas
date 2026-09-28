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
  kpiId: string,
  items: { key: string | null; label: string; value: number | null; recordCount?: number }[],
): KpiBreakdownEntity {
  return {
    kpiId,
    dimension: 'vehicle',
    scope: { tenantId: 't', vehicleId: null, fleetId: null, customerId: null, tankId: null },
    period: { start: range.startDate, end: range.endDate },
    total: null,
    others: null,
    items: items.map((i) => ({ share: null, unavailableReason: null, recordCount: 0, ...i })),
  };
}

function renderTable() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FuelVehicleTable range={range} />
    </QueryClientProvider>,
  );
}

describe('FuelVehicleTable (Fase 8 -- ranking de veiculos)', () => {
  beforeEach(() => {
    getKpiBreakdownMock.mockReset();
    getKpiBreakdownMock.mockImplementation(async (query: { kpiId: string }) => {
      if (query.kpiId === 'fuel_liters') {
        return breakdown('fuel_liters', [
          { key: 'v1', label: 'AAA1111', value: 500, recordCount: 4 },
          { key: null, label: 'Sem veículo', value: 90, recordCount: 1 },
        ]);
      }
      if (query.kpiId === 'fuel_cost') {
        return breakdown('fuel_cost', [{ key: 'v1', label: 'AAA1111', value: 2500, recordCount: 4 }]);
      }
      return breakdown('fuel_internal_liters', [{ key: 'v1', label: 'AAA1111', value: 200, recordCount: 2 }]);
    });
  });

  it('mostra litros totais, custo, litros internos e numero de abastecimentos por veiculo', async () => {
    renderTable();
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('AAA1111')).toBeInTheDocument());
    const row = within(table).getByText('AAA1111').closest('tr') as HTMLElement;
    expect(row).toHaveTextContent('500 L'); // litros totais
    expect(row).toHaveTextContent('R$'); // custo
    expect(row).toHaveTextContent('200 L'); // interno
    expect(row).toHaveTextContent('4'); // abastecimentos
  });

  it('inclui "Sem veículo" quando o abastecimento nao tem vinculo', async () => {
    renderTable();
    const table = await screen.findByRole('table');
    expect(await within(table).findByText('Sem veículo')).toBeInTheDocument();
  });

  it('dispara as 3 chamadas de breakdown (litros, custo, interno), sempre sem tankId', async () => {
    renderTable();
    await waitFor(() => expect(getKpiBreakdownMock).toHaveBeenCalledTimes(3));
    const calledKpiIds = getKpiBreakdownMock.mock.calls.map((call) => (call[0] as { kpiId: string }).kpiId).sort();
    expect(calledKpiIds).toEqual(['fuel_cost', 'fuel_internal_liters', 'fuel_liters']);
    for (const call of getKpiBreakdownMock.mock.calls) {
      expect(call[0]).toMatchObject({ dimension: 'vehicle' });
      expect((call[0] as Record<string, unknown>).tankId).toBeUndefined();
    }
  });

  it('vazio: nenhum abastecimento no periodo', async () => {
    getKpiBreakdownMock.mockResolvedValue(breakdown('fuel_liters', []));
    renderTable();
    expect(await screen.findByText('Nenhum veículo encontrado')).toBeInTheDocument();
  });

  it('busca por placa filtra as linhas', async () => {
    renderTable();
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('AAA1111')).toBeInTheDocument());
    await userEvent.type(screen.getByPlaceholderText('Buscar por placa...'), 'ZZZ');
    await waitFor(() => expect(within(table).queryByText('AAA1111')).not.toBeInTheDocument());
  });
});
