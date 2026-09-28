import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  FuelTankEntity,
  KpiEvidencePageEntity,
  KpiResultEntity,
  KpiSeriesResponseEntity,
  KpiSummaryEntity,
} from '../../types/entities';
import { FuelTab } from './fuel-tab';
import { indexKpis } from './kpi-format';

const getKpiSummaryMock = vi.fn();
const getKpiSeriesMock = vi.fn();
const getKpiEvidenceMock = vi.fn();
const listFuelTanksMock = vi.fn();
const getFuelDashboardMock = vi.fn();

vi.mock('../../lib/api/fuel-tanks.api', () => ({
  listFuelTanks: (...args: unknown[]) => listFuelTanksMock(...args),
}));

vi.mock('../../lib/api/fuel.api', () => ({
  getFuelDashboard: (...args: unknown[]) => getFuelDashboardMock(...args),
}));

// Tabelas por tanque/veiculo usam getKpiBreakdown -- fora do escopo deste
// teste de aba (ja cobertas em fuel-tank-table.test.tsx e
// fuel-vehicle-table.test.tsx). Mockada aqui so para nao gerar chamadas
// reais/erros de rede durante a renderizacao da aba inteira.
vi.mock('../../lib/api/bi.api', () => ({
  getKpiSummary: (...args: unknown[]) => getKpiSummaryMock(...args),
  getKpiSeries: (...args: unknown[]) => getKpiSeriesMock(...args),
  getKpiEvidence: (...args: unknown[]) => getKpiEvidenceMock(...args),
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
    minStockLiters: 500,
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
    kpi('fuel_cost', { category: 'FINANCIAL', unit: 'BRL', value: 9000, direction: 'LOWER_IS_BETTER', dimensions: ['period', 'vehicle', 'fleet'] }),
    kpi('cost_per_km', { category: 'OPERATIONAL', unit: 'BRL_PER_KM', value: 3.2, direction: 'LOWER_IS_BETTER', dimensions: ['period', 'vehicle', 'fleet'] }),
    kpi('fuel_liters', { value: 1000, dimensions: ['period', 'vehicle', 'fleet'] }),
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

function emptyEvidence(): KpiEvidencePageEntity {
  return {
    kpiId: 'fuel_reconciliation_divergence_liters',
    source: 'FUEL_TANK_INVENTORY_CHECK',
    scope: { tenantId: 't1', vehicleId: null, fleetId: null, customerId: null, tankId: null },
    period: PERIOD,
    items: [],
    meta: { total: 0, page: 1, pageSize: 1, totalPages: 0 },
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

describe('FuelTab (Fase 8 -- painel final)', () => {
  beforeEach(() => {
    getKpiSummaryMock.mockReset();
    getKpiSeriesMock.mockReset();
    getKpiEvidenceMock.mockReset();
    listFuelTanksMock.mockReset();
    getFuelDashboardMock.mockReset();
    listFuelTanksMock.mockResolvedValue({ items: [fuelTank()], meta: { total: 1, page: 1, pageSize: 100 } });
    getKpiSeriesMock.mockResolvedValue(emptySeries());
    getKpiSummaryMock.mockResolvedValue(scopedSummary());
    getKpiEvidenceMock.mockResolvedValue(emptyEvidence());
    getFuelDashboardMock.mockResolvedValue({
      suppliesCount: 6,
      totalLiters: 1000,
      totalAmount: 9000,
      averageConsumptionKmL: 2.8,
      costPerKm: 3.2,
      mostUsedStation: null,
      topVehicle: null,
      topDriver: null,
    });
  });

  it('sem filtro: mostra os KPIs do summary global (tanque + custo operacional), sem disparar um summary escopado', async () => {
    renderTab();
    for (const name of [
      'fuel_tank_stock',
      'fuel_received_liters',
      'fuel_internal_liters',
      'fuel_adjustment_liters',
      'fuel_received_cost',
      'fuel_average_purchase_price',
      'fuel_reconciliation_divergence_liters',
      'fuel_cost', // Bloco 4 -- Custo operacional (FuelSupply, sempre global)
      'cost_per_km',
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

  it('selecionar um tanque dispara um summary escopado por tankId (nunca afeta o custo operacional, sempre global)', async () => {
    renderTab();
    const select = await screen.findByDisplayValue('Todos os tanques');
    await userEvent.selectOptions(select, 'tank1');
    await waitFor(() => expect(getKpiSummaryMock).toHaveBeenCalledWith(expect.objectContaining({ tankId: 'tank1' }), expect.anything()));
    // fuel_cost/cost_per_km continuam vindo do summary global (kpis prop) --
    // nunca some so porque um tanque foi selecionado.
    expect(await screen.findByRole('article', { name: 'fuel_cost' })).toBeInTheDocument();
  });

  it('erro no summary escopado mostra ErrorState com retry', async () => {
    getKpiSummaryMock.mockRejectedValue(new Error('falhou'));
    renderTab();
    const select = await screen.findByDisplayValue('Todos os tanques');
    await userEvent.selectOptions(select, 'tank1');
    expect(await screen.findByText('Não foi possível carregar os indicadores do filtro.')).toBeInTheDocument();
  });

  it('série curta demais (menos de 2 pontos) mostra estado vazio em cada bloco de evolução, nunca um gráfico quebrado', async () => {
    renderTab();
    const empties = await screen.findAllByText('Período curto demais para mostrar evolução');
    expect(empties.length).toBeGreaterThan(0);
  });

  it('"O que mudou" mostra insight clicavel quando ha comparacao valida', async () => {
    const kpisWithComparison = indexKpis([
      ...globalKpis().values(),
    ]);
    kpisWithComparison.set(
      'fuel_received_liters',
      kpi('fuel_received_liters', { value: 900, comparison: { period: PERIOD, value: 800, absoluteChange: 100, percentChange: 12.5, unavailableReason: null } }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <FuelTab kpis={kpisWithComparison} range={range} granularity={null} onGranularityChange={vi.fn()} onExplain={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('fuel_received_liters aumentou 12,5% em relação ao período anterior.')).toBeInTheDocument();
  });

  it('interno x externo: mostra a divisão quando ha litros totais e internos disponiveis', async () => {
    renderTab();
    expect(await screen.findByText('Interno (tanque próprio)')).toBeInTheDocument();
    expect(screen.getByText('Externo (posto/fornecedor)')).toBeInTheDocument();
  });

  it('bloco de controle mostra a contagem de conferencias vinda da evidencia (sem novo endpoint)', async () => {
    getKpiEvidenceMock.mockResolvedValue({
      ...emptyEvidence(),
      items: [{ id: 'chk1', date: '2026-01-15T10:00:00.000Z', amount: -20, vehicleId: null, tripId: null, description: 'Tanque matriz: divergência -20 L', latitude: null, longitude: null, locationLabel: null, severity: null }],
      meta: { total: 3, page: 1, pageSize: 1, totalPages: 3 },
    });
    renderTab();
    expect(await screen.findByText(/3 conferência\(s\) no período/)).toBeInTheDocument();
  });

  it('consumo medio da frota reaproveita GET /fuel-supplies/dashboard (uma unica chamada)', async () => {
    renderTab();
    expect(await screen.findByText('2,8 km/L')).toBeInTheDocument();
    expect(getFuelDashboardMock).toHaveBeenCalledTimes(1);
  });
});
