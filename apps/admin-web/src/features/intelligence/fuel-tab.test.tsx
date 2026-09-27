import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FuelTankEntity, KpiResultEntity, KpiSeriesResponseEntity, KpiSummaryEntity } from '../../types/entities';
import { FuelTab } from './fuel-tab';
import { indexKpis } from './kpi-format';

const getKpiSummaryMock = vi.fn();
const getKpiSeriesMock = vi.fn();
const listFuelTanksMock = vi.fn();

vi.mock('../../lib/api/fuel-tanks.api', () => ({
  listFuelTanks: (...args: unknown[]) => listFuelTanksMock(...args),
}));

// Tabelas por tanque/veiculo usam getKpiBreakdown -- fora do escopo deste
// teste de aba (ja cobertas em fuel-tank-table.test.tsx e
// fuel-vehicle-table.test.tsx). Mockada aqui so para nao gerar chamadas
// reais/erros de rede durante a renderizacao da aba inteira.
vi.mock('../../lib/api/bi.api', () => ({
  getKpiSummary: (...args: unknown[]) => getKpiSummaryMock(...args),
  getKpiSeries: (...args: unknown[]) => getKpiSeriesMock(...args),
  getKpiBreakdown: vi.fn().mockResolvedValue({
    kpiId: 'x',
    dimension: 'tank',
    scope: { tenantId: 't', vehicleId: null, fleetId: null, customerId: null, tankId: null },
    period: { start: '2026-01-01', end: '2026-01-31' },
    total: null,
    items: [],
    others: null,
  }),
}));

const range = { startDate: '2026-01-01', endDate: '2026-01-31' };
const PERIOD = { start: '2026-01-01T00:00:00.000Z', end: '2026-01-31T23:59:59.999Z' };

function kpi(id: string, overrides: Partial<KpiResultEntity> = {}): KpiResultEntity {
  return {
    id,
    name: id,
    description: `Descricao ${id}`,
    category: 'OPERATIONAL',
    unit: 'LITERS',
    direction: 'NEUTRAL',
    formula: `formula de ${id}`,
    sources: [{ entity: 'FuelTankMovement', field: 'quantityLiters', dateField: 'effectiveDate', rule: 'regra' }],
    dimensions: ['period', 'tank'],
    limitations: [],
    additive: true,
    status: 'AVAILABLE',
    unavailableReason: null,
    value: 0,
    period: PERIOD,
    comparison: null,
    inputs: [],
    evidence: [],
    ...overrides,
  };
}

function fuelTank(overrides: Partial<FuelTankEntity> = {}): FuelTankEntity {
  return {
    id: 'tank1',
    tenantId: 't1',
    name: 'Tanque matriz',
    fuelType: 'DIESEL_S10',
    capacityLiters: 20000,
    initialStockLiters: 1000,
    currentStockLiters: 1500,
    minStockLiters: null,
    occupancyPercent: 7.5,
    isLowStock: false,
    location: null,
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as FuelTankEntity;
}

function globalKpis(): Map<string, KpiResultEntity> {
  return indexKpis([
    kpi('fuel_tank_stock', { value: 1500 }),
    kpi('fuel_received_liters', { value: 800 }),
    kpi('fuel_internal_liters', { value: 200 }),
    kpi('fuel_adjustment_liters', { value: -50 }),
    kpi('fuel_received_cost', { category: 'FINANCIAL', unit: 'BRL', value: 4300, direction: 'LOWER_IS_BETTER' }),
    kpi('fuel_average_purchase_price', { category: 'FINANCIAL', unit: 'BRL_PER_LITER', value: 5.375, additive: false, direction: 'LOWER_IS_BETTER' }),
    kpi('fuel_movements_count', { unit: 'COUNT', value: 4 }),
    kpi('fuel_reconciliation_divergence_liters', { value: 0 }),
  ]);
}

function scopedSummary(): KpiSummaryEntity {
  return {
    catalogVersion: '3',
    calculatedAt: '2026-01-31T18:00:00.000Z',
    scope: { tenantId: 't1', vehicleId: null, fleetId: null, customerId: null, tankId: 'tank1' },
    period: PERIOD,
    comparisonMode: 'NONE',
    comparisonPeriod: null,
    kpis: [kpi('fuel_tank_stock', { value: 1500 })],
  };
}

function emptySeries(): KpiSeriesResponseEntity {
  return {
    catalogVersion: '3',
    calculatedAt: '2026-01-31T18:00:00.000Z',
    scope: { tenantId: 't1', vehicleId: null, fleetId: null, customerId: null, tankId: null },
    period: PERIOD,
    granularity: 'day',
    timezone: 'America/Sao_Paulo',
    comparisonMode: 'NONE',
    comparisonPeriod: null,
    series: [],
  };
}

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FuelTab kpis={globalKpis()} range={range} granularity={null} onGranularityChange={vi.fn()} onExplain={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('FuelTab', () => {
  beforeEach(() => {
    getKpiSummaryMock.mockReset();
    getKpiSeriesMock.mockReset();
    listFuelTanksMock.mockReset();
    listFuelTanksMock.mockResolvedValue({ items: [fuelTank()], meta: { total: 1, page: 1, pageSize: 100 } });
    getKpiSeriesMock.mockResolvedValue(emptySeries());
    getKpiSummaryMock.mockResolvedValue(scopedSummary());
  });

  it('sem filtro: mostra os 8 KPIs do summary global, sem disparar um summary escopado', async () => {
    renderTab();
    for (const name of [
      'fuel_tank_stock',
      'fuel_received_liters',
      'fuel_internal_liters',
      'fuel_adjustment_liters',
      'fuel_received_cost',
      'fuel_average_purchase_price',
      'fuel_movements_count',
      'fuel_reconciliation_divergence_liters',
    ]) {
      expect(await screen.findByRole('article', { name })).toBeInTheDocument();
    }
    expect(getKpiSummaryMock).not.toHaveBeenCalled();
  });

  it('vazio: nenhum tanque proprio cadastrado mostra estado vazio, nunca uma tela de erro', async () => {
    listFuelTanksMock.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pageSize: 100 } });
    renderTab();
    expect(await screen.findByText('Nenhum tanque próprio cadastrado')).toBeInTheDocument();
  });

  it('selecionar um tanque dispara um summary escopado por tankId', async () => {
    renderTab();
    const select = await screen.findByDisplayValue('Todos os tanques');
    await userEvent.selectOptions(select, 'tank1');
    await waitFor(() => expect(getKpiSummaryMock).toHaveBeenCalledWith(expect.objectContaining({ tankId: 'tank1' }), expect.anything()));
  });

  it('erro no summary escopado mostra ErrorState com retry', async () => {
    getKpiSummaryMock.mockRejectedValue(new Error('falhou'));
    renderTab();
    const select = await screen.findByDisplayValue('Todos os tanques');
    await userEvent.selectOptions(select, 'tank1');
    expect(await screen.findByText('Não foi possível carregar os indicadores do filtro.')).toBeInTheDocument();
  });

  it('série curta demais (menos de 2 pontos) mostra estado vazio, nunca um gráfico quebrado', async () => {
    renderTab();
    expect(await screen.findByText('Período curto demais para mostrar evolução')).toBeInTheDocument();
  });
});
