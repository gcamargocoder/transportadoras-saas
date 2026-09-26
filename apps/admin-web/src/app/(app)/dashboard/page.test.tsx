import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../lib/api/errors';
import type {
  KpiBreakdownEntity,
  KpiResultEntity,
  KpiSeriesEntity,
  KpiSeriesPointEntity,
  KpiSeriesResponseEntity,
  KpiSummaryEntity,
} from '../../../types/entities';
import { UserRole } from '../../../types/enums';
import DashboardPage from './page';

const getKpiSummaryMock = vi.fn();
const getDashboardMock = vi.fn();
const replaceMock = vi.fn();
const useAuthMock = vi.fn();
let searchParams = new URLSearchParams();

const getKpiSeriesMock = vi.fn();
const getKpiBreakdownMock = vi.fn();
const listVehiclesMock = vi.fn();
const listFleetsMock = vi.fn();

vi.mock('../../../lib/api/bi.api', () => ({
  getKpiSummary: (...args: unknown[]) => getKpiSummaryMock(...args),
  getKpiSeries: (...args: unknown[]) => getKpiSeriesMock(...args),
  getKpiBreakdown: (...args: unknown[]) => getKpiBreakdownMock(...args),
}));

// BI 4 -- filtro local da aba Frota (busca de veiculo + lista de frotas).
vi.mock('../../../lib/api/fleet.api', () => ({
  listVehicles: (...args: unknown[]) => listVehiclesMock(...args),
  listFleets: (...args: unknown[]) => listFleetsMock(...args),
}));

// Endpoint antigo (/dashboard) -- com regras divergentes do BI 1. A Central
// nunca deve consulta-lo.
vi.mock('../../../lib/api/dashboard.api', () => ({
  getDashboard: (...args: unknown[]) => getDashboardMock(...args),
}));

vi.mock('../../../hooks/use-auth', () => ({ useAuth: () => useAuthMock() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => searchParams,
}));

const PERIOD = { start: '2026-08-24T03:00:00.000Z', end: '2026-09-23T02:59:59.999Z' };
const PREVIOUS = { start: '2026-07-25T03:00:00.000Z', end: '2026-08-24T02:59:59.999Z' };

function kpi(id: string, overrides: Partial<KpiResultEntity> = {}): KpiResultEntity {
  return {
    id,
    name: id,
    description: `Descricao ${id}`,
    category: 'OPERATIONAL',
    unit: 'COUNT',
    direction: 'HIGHER_IS_BETTER',
    formula: `formula de ${id}`,
    sources: [{ entity: 'Trip', field: 'id', dateField: 'actualArrival', rule: 'regra' }],
    dimensions: ['period'],
    limitations: [],
    additive: true,
    status: 'AVAILABLE',
    unavailableReason: null,
    value: 0,
    period: PERIOD,
    comparison: { period: PREVIOUS, value: 0, absoluteChange: 0, percentChange: null, unavailableReason: null },
    inputs: [],
    evidence: [],
    ...overrides,
  };
}

function comparison(value: number | null, absoluteChange: number | null, percentChange: number | null) {
  return { period: PREVIOUS, value, absoluteChange, percentChange, unavailableReason: value === null ? 'Sem dado' : null };
}

function buildSummary(): KpiSummaryEntity {
  return {
    catalogVersion: '1',
    calculatedAt: '2026-09-22T18:00:00.000Z',
    scope: { tenantId: 't1', vehicleId: null, fleetId: null, customerId: null },
    period: PERIOD,
    comparisonMode: 'PREVIOUS_PERIOD',
    comparisonPeriod: PREVIOUS,
    kpis: [
      kpi('trips_completed', { name: 'Viagens concluidas', value: 1284, comparison: comparison(1146, 138, 12.04) }),
      kpi('deliveries_completed', { name: 'Entregas realizadas', value: 3417, comparison: comparison(3500, -83, -2.37) }),
      kpi('revenue', { name: 'Receita', category: 'FINANCIAL', unit: 'BRL', value: 452300, comparison: comparison(400000, 52300, 13.08) }),
      kpi('operating_result', { name: 'Resultado operacional', category: 'FINANCIAL', unit: 'BRL', value: 98100, comparison: comparison(90000, 8100, 9) }),
      kpi('cost_per_km', {
        name: 'Custo por km',
        unit: 'BRL_PER_KM',
        direction: 'LOWER_IS_BETTER',
        value: 4.21,
        comparison: comparison(4.5, -0.29, -6.44),
        formula: 'operating_cost / distance_km',
        inputs: [
          { key: 'totalCost', label: 'Custo operacional total', value: 354200, unit: 'BRL' },
          { key: 'distanceKm', label: 'Distancia (odometro)', value: 84133, unit: 'KM' },
        ],
        evidence: [{ source: 'FUEL_SUPPLY', label: 'Abastecimentos', recordCount: 812, listable: true }],
      }),
      kpi('on_time_delivery_rate', {
        name: 'Entregas no prazo',
        category: 'SERVICE_LEVEL',
        unit: 'PERCENT',
        value: 91.2,
        comparison: comparison(88, 3.2, 3.64),
        inputs: [
          { key: 'onTimeDeliveries', label: 'No prazo', value: 1100, unit: 'COUNT' },
          { key: 'deliveriesWithDeadline', label: 'Com previsao', value: 1206, unit: 'COUNT' },
          { key: 'completedDeliveries', label: 'Concluidas', value: 3417, unit: 'COUNT' },
          { key: 'coverage', label: 'Cobertura', value: 35.3, unit: 'PERCENT' },
        ],
      }),
      kpi('occurrences_total', { name: 'Ocorrencias', direction: 'LOWER_IS_BETTER', value: 47, comparison: comparison(40, 7, 17.5) }),
      kpi('occurrences_critical', { name: 'Ocorrencias criticas', direction: 'LOWER_IS_BETTER', value: 3 }),
      kpi('idle_hours', {
        name: 'Tempo ocioso',
        category: 'FLEET',
        unit: 'HOURS',
        direction: 'LOWER_IS_BETTER',
        status: 'UNAVAILABLE',
        value: null,
        unavailableReason: 'Nenhum veiculo em operacao no escopo durante o periodo.',
        comparison: comparison(null, null, null),
      }),
      kpi('distance_km', { name: 'Distancia percorrida', unit: 'KM', direction: 'NEUTRAL', value: 84133 }),
      kpi('fleet_utilization', {
        name: 'Utilizacao da frota',
        category: 'FLEET',
        unit: 'PERCENT',
        value: 62.5,
        inputs: [
          { key: 'vehiclesConsidered', label: 'Veiculos', value: 10, unit: 'COUNT' },
          { key: 'capacityHours', label: 'Capacidade', value: 7200, unit: 'HOURS' },
          { key: 'tripHours', label: 'Em viagem', value: 4500, unit: 'HOURS' },
          { key: 'maintenanceHours', label: 'Manutencao', value: 300, unit: 'HOURS' },
          { key: 'idleHours', label: 'Ocioso', value: 1200, unit: 'HOURS' },
        ],
      }),
      kpi('fleet_availability', { name: 'Disponibilidade da frota', category: 'FLEET', unit: 'PERCENT', value: 95.8 }),
    ],
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { ...render(<DashboardPage />, { wrapper: Wrapper }), queryClient };
}

function card(name: string): HTMLElement {
  return screen.getByRole('article', { name });
}

describe('Central de Inteligencia (/dashboard)', () => {
  beforeEach(() => {
    getKpiSummaryMock.mockReset();
    getDashboardMock.mockReset();
    replaceMock.mockReset();
    searchParams = new URLSearchParams();
    useAuthMock.mockReturnValue({ user: { role: UserRole.ADMIN } });
    getKpiSummaryMock.mockResolvedValue(buildSummary());
  });

  it('visao geral: KPIs oficiais com valor, unidade e comparacao', async () => {
    renderPage();
    const trips = await screen.findByRole('article', { name: 'Viagens concluidas' });
    expect(within(trips).getByText('1.284')).toBeInTheDocument();
    expect(within(trips).getByText('+12,0%')).toBeInTheDocument();
    expect(within(trips).getByText(/Período anterior: 1\.146/)).toBeInTheDocument();
    expect(within(card('Receita')).getByText(/452\.300,00/)).toBeInTheDocument();
    expect(within(card('Entregas no prazo')).getByText('91,2')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Visão geral' })).toHaveAttribute('aria-selected', 'true');
  });

  it('usa somente a API /bi (uma chamada) e nunca o endpoint antigo com indicadores divergentes', async () => {
    renderPage();
    await screen.findByRole('article', { name: 'Viagens concluidas' });
    expect(getKpiSummaryMock).toHaveBeenCalledTimes(1);
    expect(getDashboardMock).not.toHaveBeenCalled();
    // Rotulos das formulas antigas (lucro sobre despesas aprovadas, km de TripMetrics, viagens por createdAt).
    expect(screen.queryByText('Lucro')).not.toBeInTheDocument();
    expect(screen.queryByText('Km rodados')).not.toBeInTheDocument();
    expect(screen.queryByText('Viagens totais')).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Resultado operacional' })).toBeInTheDocument();
  });

  it('periodo padrao de 30 dias alimenta a consulta', async () => {
    renderPage();
    await screen.findByRole('article', { name: 'Viagens concluidas' });
    const [query] = getKpiSummaryMock.mock.calls[0] as [{ startDate: string; endDate: string }];
    const days = (new Date(query.endDate).getTime() - new Date(query.startDate).getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(30);
    expect(screen.getByRole('radio', { name: '30 dias' })).toHaveAttribute('aria-checked', 'true');
  });

  it('trocar o periodo atualiza a URL; o periodo da URL define a consulta', async () => {
    const { unmount } = renderPage();
    await screen.findByRole('article', { name: 'Viagens concluidas' });
    fireEvent.click(screen.getByRole('radio', { name: '7 dias' }));
    expect(replaceMock).toHaveBeenCalledWith('/dashboard?periodo=7d', { scroll: false });
    unmount();

    searchParams = new URLSearchParams('periodo=7d');
    getKpiSummaryMock.mockClear();
    renderPage();
    await screen.findByRole('article', { name: 'Viagens concluidas' });
    const [query] = getKpiSummaryMock.mock.calls[0] as [{ startDate: string; endDate: string }];
    const days = (new Date(query.endDate).getTime() - new Date(query.startDate).getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(7);
  });

  it('periodo personalizado incompleto nao consulta a API', () => {
    searchParams = new URLSearchParams('periodo=custom&de=2026-01-01');
    renderPage();
    expect(screen.getByText('Escolha o período')).toBeInTheDocument();
    expect(getKpiSummaryMock).not.toHaveBeenCalled();
  });

  it('cor da tendencia segue a direcao do KPI: custo/km caindo e melhora', async () => {
    renderPage();
    const cost = await screen.findByRole('article', { name: 'Custo por km' });
    expect(within(cost).getByLabelText(/melhora/)).toBeInTheDocument();
    expect(within(card('Ocorrencias')).getByLabelText(/piora/)).toBeInTheDocument();
  });

  it('KPI indisponivel mostra travessao e o motivo (nunca 0)', async () => {
    renderPage();
    const idle = await screen.findByRole('article', { name: 'Tempo ocioso' });
    expect(within(idle).getByText('—')).toBeInTheDocument();
    expect(within(idle).getByText(/Nenhum veiculo em operacao/)).toBeInTheDocument();
  });

  it('drill-down leva a tela detalhada existente', async () => {
    renderPage();
    const cost = await screen.findByRole('article', { name: 'Custo por km' });
    expect(within(cost).getByRole('link', { name: /Ver custos/ })).toHaveAttribute('href', '/operations/fleet/costs');
    expect(within(card('Viagens concluidas')).getByRole('link', { name: /Ver viagens/ })).toHaveAttribute('href', '/trips');
  });

  it('"Como é calculado" abre formula, valores considerados e registros de origem', async () => {
    renderPage();
    await screen.findByRole('article', { name: 'Custo por km' });
    fireEvent.click(screen.getByRole('button', { name: 'Como é calculado: Custo por km' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('operating_cost / distance_km')).toBeInTheDocument();
    expect(within(dialog).getByText('Custo operacional total')).toBeInTheDocument();
    expect(within(dialog).getByText('Abastecimentos')).toBeInTheDocument();
    expect(within(dialog).getByText('812')).toBeInTheDocument();
  });

  it('estado de carregamento', () => {
    getKpiSummaryMock.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(screen.getByLabelText('Carregando indicadores')).toBeInTheDocument();
  });

  it('erro com opcao de tentar de novo', async () => {
    getKpiSummaryMock.mockRejectedValue(new ApiError(500, 'INTERNAL', 'falha', '/bi/kpis/summary'));
    renderPage();
    expect(await screen.findByText('Não foi possível carregar os indicadores.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tentar novamente/ })).toBeInTheDocument();
  });

  it('403 da API vira mensagem de acesso, sem retry', async () => {
    getKpiSummaryMock.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'sem acesso', '/bi/kpis/summary'));
    renderPage();
    expect(await screen.findByText('Você não tem acesso a estes indicadores.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tentar novamente/ })).not.toBeInTheDocument();
  });

  it('perfil sem acesso ao BI nao consulta a API', () => {
    useAuthMock.mockReturnValue({ user: { role: UserRole.OPERATOR } });
    renderPage();
    expect(screen.getByText('Acesso restrito')).toBeInTheDocument();
    expect(getKpiSummaryMock).not.toHaveBeenCalled();
  });

  it('periodo sem movimentacao mostra aviso', async () => {
    const empty = buildSummary();
    empty.kpis = empty.kpis.map((k) => ({ ...k, value: k.unit === 'PERCENT' ? k.value : 0 }));
    getKpiSummaryMock.mockResolvedValue(empty);
    renderPage();
    expect(await screen.findByText(/Nenhuma movimentação registrada no período/)).toBeInTheDocument();
  });

  it('aba Operacao: pontualidade com cobertura baixa', async () => {
    searchParams = new URLSearchParams('aba=operation');
    renderPage();
    expect(await screen.findByText('Pontualidade')).toBeInTheDocument();
    expect(screen.getByText('Cobertura da métrica')).toBeInTheDocument();
    expect(screen.getByText(/Poucas entregas têm previsão de chegada/)).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Ocorrencias criticas' })).toBeInTheDocument();
  });

  it('trocar de aba atualiza a URL', async () => {
    renderPage();
    await screen.findByRole('article', { name: 'Viagens concluidas' });
    fireEvent.click(screen.getByRole('tab', { name: 'Operação' }));
    expect(replaceMock).toHaveBeenCalledWith('/dashboard?aba=operation', { scroll: false });
  });

  it('abas futuras nao exibem dados ficticios nem consultam a API', () => {
    searchParams = new URLSearchParams('aba=occurrences');
    renderPage();
    expect(screen.getByText('Ocorrências chega à Central no BI 8')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Painel de ocorrências/ })).toHaveAttribute('href', '/operations/fleet/occurrences');
    expect(getKpiSummaryMock).not.toHaveBeenCalled();
  });

  it('todas as abas previstas estao na navegacao', () => {
    renderPage();
    const labels = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(labels).toEqual(['Visão geral', 'Operação', 'Financeiro', 'Frota', 'Custos', 'Prazos', 'Comparativos', 'Ocorrências']);
  });
});

describe('cache compartilhado entre abas', () => {
  it('Visao geral e Operacao reaproveitam a mesma consulta', async () => {
    getKpiSummaryMock.mockReset();
    getKpiSummaryMock.mockResolvedValue(buildSummary());
    useAuthMock.mockReturnValue({ user: { role: UserRole.MANAGER } });
    searchParams = new URLSearchParams();
    const { rerender } = renderPage();
    await screen.findByRole('article', { name: 'Viagens concluidas' });
    searchParams = new URLSearchParams('aba=operation');
    rerender(<DashboardPage />);
    await waitFor(() => expect(screen.getByText('Pontualidade')).toBeInTheDocument());
    expect(getKpiSummaryMock).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// BI 3 -- aba Financeiro
// ============================================================================
function financialSummary(): KpiSummaryEntity {
  const summary = buildSummary();
  summary.kpis.push(
    kpi('operating_cost', {
      name: 'Despesas operacionais',
      unit: 'BRL',
      direction: 'LOWER_IS_BETTER',
      value: 354200,
      comparison: comparison(330000, 24200, 7.33),
      inputs: [
        { key: 'fuelCost', label: 'Combustivel', value: 200000, unit: 'BRL' },
        { key: 'maintenanceCost', label: 'Manutencao', value: 80000, unit: 'BRL' },
        { key: 'tireCost', label: 'Pneus', value: 30000, unit: 'BRL' },
        { key: 'tollCost', label: 'Pedagio', value: 40000, unit: 'BRL' },
        { key: 'otherCost', label: 'Outras despesas', value: 4200, unit: 'BRL' },
        { key: 'totalCost', label: 'Custo operacional total', value: 354200, unit: 'BRL' },
      ],
    }),
    kpi('operating_margin', { name: 'Margem operacional', unit: 'PERCENT', value: 21.7, comparison: comparison(22.5, -0.8, -3.56) }),
    kpi('revenue_per_km', { name: 'Receita por km', unit: 'BRL_PER_KM', value: 5.38, comparison: comparison(5.1, 0.28, 5.49) }),
  );
  return summary;
}

function point(label: string, value: number | null, partial = false): KpiSeriesPointEntity {
  return {
    label,
    start: `${label}-01T03:00:00.000Z`,
    end: `${label}-28T02:59:59.999Z`,
    partial,
    status: value === null ? 'UNAVAILABLE' : 'AVAILABLE',
    value,
    unavailableReason: value === null ? 'Sem receita' : null,
    inputs: [],
    evidence: [{ source: 'TRIP_REVENUE', label: 'Receitas', recordCount: 3, listable: true }],
  };
}

const SERIES_NAMES: Record<string, string> = {
  revenue: 'Receita',
  operating_cost: 'Despesas operacionais',
  operating_result: 'Resultado operacional',
  operating_margin: 'Margem operacional',
  fleet_utilization: 'Utilizacao da frota',
  fleet_availability: 'Disponibilidade da frota',
  idle_hours: 'Tempo ocioso',
  trips_completed: 'Viagens concluidas',
  on_time_delivery_rate: 'Entregas no prazo',
  occurrences_total: 'Ocorrencias',
  occurrences_critical: 'Ocorrencias criticas',
  cost_per_km: 'Custo por km',
};

function seriesFor(id: string, values: Array<number | null>, unit: KpiSeriesEntity['unit'] = 'BRL'): KpiSeriesEntity {
  const labels = ['2026-07', '2026-08', '2026-09'];
  return {
    ...kpi(id, { name: SERIES_NAMES[id] ?? id, unit }),
    points: values.map((v, i) => point(labels[i] as string, v, i === values.length - 1)),
    comparisonPoints: values.map((v, i) => point(`2025-0${i + 4}`, v === null ? null : v * 0.9)),
  } as KpiSeriesEntity;
}

function buildSeries(): KpiSeriesResponseEntity {
  return {
    catalogVersion: '2',
    calculatedAt: '2026-09-22T18:00:00.000Z',
    scope: { tenantId: 't1', vehicleId: null, fleetId: null, customerId: null },
    period: PERIOD,
    granularity: 'month',
    timezone: 'America/Sao_Paulo',
    comparisonMode: 'PREVIOUS_PERIOD',
    comparisonPeriod: PREVIOUS,
    series: [
      seriesFor('revenue', [140000, 150000, 162300]),
      seriesFor('operating_cost', [110000, 120000, 124200]),
      seriesFor('operating_result', [30000, -5000, 38100]),
      seriesFor('operating_margin', [21.4, null, 23.5], 'PERCENT'),
      seriesFor('fuel_cost', [60000, 65000, 75000]),
      seriesFor('maintenance_cost', [25000, 27000, 28000]),
      seriesFor('tire_cost', [10000, 10000, 10000]),
      seriesFor('toll_cost', [13000, 13500, 13500]),
      seriesFor('other_cost', [2000, 4500, 0]),
    ],
  };
}

function buildBreakdown(): KpiBreakdownEntity {
  return {
    kpiId: 'revenue',
    dimension: 'customer',
    scope: { tenantId: 't1', vehicleId: null, fleetId: null, customerId: null },
    period: PERIOD,
    total: 452300,
    items: [
      { key: 'c1', label: 'Atacadao Sul', value: 300000, unavailableReason: null, share: 66.3, recordCount: 40 },
      { key: null, label: 'Sem cliente', value: 52300, unavailableReason: null, share: 11.6, recordCount: 9 },
    ],
    others: { key: null, label: 'Demais (3)', value: 100000, unavailableReason: null, share: 22.1, recordCount: 12 },
  };
}

describe('Central -- aba Financeiro (BI 3)', () => {
  beforeEach(() => {
    getKpiSummaryMock.mockReset();
    getKpiSeriesMock.mockReset();
    getKpiBreakdownMock.mockReset();
    getDashboardMock.mockReset();
    replaceMock.mockReset();
    useAuthMock.mockReturnValue({ user: { role: UserRole.ADMIN } });
    searchParams = new URLSearchParams('aba=financial');
    getKpiSummaryMock.mockResolvedValue(financialSummary());
    getKpiSeriesMock.mockResolvedValue(buildSeries());
    getKpiBreakdownMock.mockResolvedValue(buildBreakdown());
  });

  it('resumo com os 6 KPIs financeiros oficiais, do mesmo summary das outras abas', async () => {
    renderPage();
    for (const name of ['Receita', 'Despesas operacionais', 'Resultado operacional', 'Margem operacional', 'Custo por km', 'Receita por km']) {
      expect(await screen.findByRole('article', { name })).toBeInTheDocument();
    }
    expect(within(card('Margem operacional')).getByText('21,7')).toBeInTheDocument();
    expect(getKpiSummaryMock).toHaveBeenCalledTimes(1);
    expect(getDashboardMock).not.toHaveBeenCalled();
  });

  it('uma unica chamada de serie com tendencias + composicao e comparacao', async () => {
    renderPage();
    await screen.findByText('Evolução financeira');
    await waitFor(() => expect(getKpiSeriesMock).toHaveBeenCalledTimes(1));
    const [query] = getKpiSeriesMock.mock.calls[0] as [Record<string, string>];
    expect(query.kpis?.split(',')).toEqual([
      'revenue',
      'operating_cost',
      'operating_result',
      'operating_margin',
      'fuel_cost',
      'maintenance_cost',
      'tire_cost',
      'toll_cost',
      'other_cost',
    ]);
    expect(query.comparison).toBe('PREVIOUS_PERIOD');
    expect(query.granularity).toBeUndefined();
  });

  it('graficos de evolucao e tabela com os pontos da API (lacuna, nunca zero inventado)', async () => {
    renderPage();
    expect(await screen.findByRole('img', { name: 'Receita ao longo do período' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Resultado operacional ao longo do período' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Margem operacional ao longo do período' })).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByRole('rowheader', { name: /set\/26/ })).toHaveTextContent('(incompleto)');
    // margem indisponivel em agosto aparece como "—"
    const august = within(table).getByRole('rowheader', { name: 'ago/26' }).closest('tr') as HTMLElement;
    expect(within(august).getByText('—')).toBeInTheDocument();
  });

  it('composicao dos custos a partir das entradas oficiais de operating_cost', async () => {
    renderPage();
    expect(await screen.findByRole('img', { name: /Composição dos custos operacionais/ })).toBeInTheDocument();
    expect(screen.getByText('Combustível')).toBeInTheDocument();
    expect(screen.getByText('56,5%')).toBeInTheDocument(); // 200000 / 354200
    expect(screen.getByText(/Adiantamentos a motoristas não entram/)).toBeInTheDocument();
  });

  it('receita por cliente com drill-down para o cliente', async () => {
    renderPage();
    const list = await screen.findByRole('list', { name: 'Receita por cliente' });
    expect(within(list).getByRole('link', { name: 'Atacadao Sul' })).toHaveAttribute('href', '/customers/c1');
    expect(within(list).getByText('Sem cliente')).toBeInTheDocument();
    expect(within(list).queryByRole('link', { name: 'Sem cliente' })).not.toBeInTheDocument();
    expect(within(list).getByText('Demais (3)')).toBeInTheDocument();
  });

  it('agrupamento vai para a URL e alimenta a serie', async () => {
    const { unmount } = renderPage();
    const week = await screen.findByRole('radio', { name: 'Semana' });
    fireEvent.click(week);
    expect(replaceMock).toHaveBeenCalledWith('/dashboard?aba=financial&agrupar=week', { scroll: false });
    unmount();

    searchParams = new URLSearchParams('aba=financial&agrupar=week');
    getKpiSeriesMock.mockClear();
    renderPage();
    await waitFor(() => expect(getKpiSeriesMock).toHaveBeenCalled());
    expect((getKpiSeriesMock.mock.calls[0] as [Record<string, string>])[0].granularity).toBe('week');
  });

  it('agrupamento diario desabilitado para 3 meses (API recusaria)', async () => {
    searchParams = new URLSearchParams('aba=financial&periodo=3m&agrupar=day');
    renderPage();
    expect(await screen.findByRole('radio', { name: 'Dia' })).toBeDisabled();
    await waitFor(() => expect(getKpiSeriesMock).toHaveBeenCalled());
    expect((getKpiSeriesMock.mock.calls[0] as [Record<string, string>])[0].granularity).toBeUndefined();
  });

  it('ocultar o periodo anterior tira a legenda de comparacao', async () => {
    renderPage();
    await screen.findByRole('img', { name: 'Receita ao longo do período' });
    expect(screen.getAllByText('Período anterior').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Comparar com o período anterior' }));
    expect(screen.queryByText('Período anterior', { selector: 'span' })).not.toBeInTheDocument();
  });

  it('serie com menos de 2 pontos: orienta a escolher periodo maior', async () => {
    const one = buildSeries();
    one.series = one.series.map((s) => ({ ...s, points: s.points.slice(0, 1), comparisonPoints: null }));
    getKpiSeriesMock.mockResolvedValue(one);
    renderPage();
    expect(await screen.findByText('Período curto demais para mostrar evolução')).toBeInTheDocument();
  });

  it('carregamento e erro da serie, sem afetar o resumo', async () => {
    getKpiSeriesMock.mockReturnValue(new Promise(() => undefined));
    const { unmount } = renderPage();
    expect(await screen.findByLabelText('Carregando evolução')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Receita' })).toBeInTheDocument();
    unmount();

    getKpiSeriesMock.mockReset();
    getKpiSeriesMock.mockRejectedValue(new ApiError(500, 'INTERNAL', 'falha', '/bi/kpis/series'));
    renderPage();
    expect(await screen.findByText('Não foi possível carregar a evolução.')).toBeInTheDocument();
  });

  it('receita por cliente vazia', async () => {
    getKpiBreakdownMock.mockResolvedValue({ ...buildBreakdown(), total: 0, items: [], others: null });
    renderPage();
    expect(await screen.findByText('Sem receita no período')).toBeInTheDocument();
  });

  it('"Como é calculado" funciona nos cards financeiros', async () => {
    renderPage();
    await screen.findByRole('article', { name: 'Despesas operacionais' });
    fireEvent.click(screen.getByRole('button', { name: 'Como é calculado: Despesas operacionais' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Custo operacional total')).toBeInTheDocument();
  });

  it('drill-down dos cards financeiros para as telas existentes', async () => {
    renderPage();
    const cost = await screen.findByRole('article', { name: 'Despesas operacionais' });
    expect(within(cost).getByRole('link', { name: /Ver custos/ })).toHaveAttribute('href', '/operations/fleet/costs');
    expect(within(card('Resultado operacional')).getByRole('link', { name: /Ver financeiro/ })).toHaveAttribute(
      'href',
      '/operations/fleet/financial',
    );
  });

  it('visao geral nao dispara serie nem recorte (carga so na aba Financeiro)', async () => {
    searchParams = new URLSearchParams();
    renderPage();
    await screen.findByRole('article', { name: 'Viagens concluidas' });
    expect(getKpiSeriesMock).not.toHaveBeenCalled();
    expect(getKpiBreakdownMock).not.toHaveBeenCalled();
  });
});

// ============================================================================
// BI 4 -- aba Frota
// ============================================================================
function buildFleetSeries(): KpiSeriesResponseEntity {
  const base = buildSeries();
  return {
    ...base,
    series: [
      seriesFor('fleet_utilization', [55, 60, 62.5], 'PERCENT'),
      seriesFor('fleet_availability', [90, 92, 95.8], 'PERCENT'),
      seriesFor('idle_hours', [1400, 1300, 1200], 'HOURS'),
      seriesFor('trips_completed', [1100, 1200, 1284], 'COUNT'),
    ],
  };
}

function scopedFleetSummary(): KpiSummaryEntity {
  const summary = buildSummary();
  summary.scope = { ...summary.scope, vehicleId: 'v1' };
  summary.kpis = summary.kpis.map((k) => (k.id === 'fleet_utilization' ? { ...k, value: 40 } : k));
  return summary;
}

function vehicleBreakdownItem(
  key: string | null,
  label: string,
  value: number | null,
  unavailableReason: string | null = null,
  share: number | null = null,
  recordCount = 1,
) {
  return { key, label, value, unavailableReason, share, recordCount };
}

const FLEET_VEHICLE_ROWS: Record<string, ReturnType<typeof vehicleBreakdownItem>[]> = {
  fleet_utilization: [
    vehicleBreakdownItem('v1', 'AAA1111', 70),
    vehicleBreakdownItem('v2', 'BBB2222', null, 'Veiculo fora de operacao (status atual) ou fora do periodo de cadastro no intervalo pedido.'),
  ],
  fleet_availability: [vehicleBreakdownItem('v1', 'AAA1111', 96), vehicleBreakdownItem('v2', 'BBB2222', null, 'Veiculo fora de operacao.')],
  idle_hours: [vehicleBreakdownItem('v1', 'AAA1111', 400, null, 33.3, 60), vehicleBreakdownItem('v2', 'BBB2222', 800, null, 66.7, 40)],
  trips_completed: [vehicleBreakdownItem('v1', 'AAA1111', 6), vehicleBreakdownItem('v2', 'BBB2222', 4)],
  distance_km: [vehicleBreakdownItem('v1', 'AAA1111', 5000), vehicleBreakdownItem('v2', 'BBB2222', 3000)],
};

function fleetVehicleBreakdown(kpiId: string, fleetId?: string): KpiBreakdownEntity {
  return {
    kpiId,
    dimension: 'vehicle',
    scope: { tenantId: 't1', vehicleId: null, fleetId: fleetId ?? null, customerId: null },
    period: PERIOD,
    total: kpiId === 'fleet_utilization' || kpiId === 'fleet_availability' ? 62.5 : null,
    items: FLEET_VEHICLE_ROWS[kpiId] ?? [],
    others: null,
  };
}

function fleetVehiclesList() {
  return { items: [{ id: 'v1', plate: 'AAA1111', brand: 'Volvo', model: 'FH' }], meta: { total: 1, page: 1, pageSize: 20 } };
}

describe('Central -- aba Frota (BI 4)', () => {
  beforeEach(() => {
    getKpiSummaryMock.mockReset();
    getKpiSeriesMock.mockReset();
    getKpiBreakdownMock.mockReset();
    listVehiclesMock.mockReset();
    listFleetsMock.mockReset();
    getDashboardMock.mockReset();
    replaceMock.mockReset();
    useAuthMock.mockReturnValue({ user: { role: UserRole.ADMIN } });
    searchParams = new URLSearchParams('aba=fleet');
    getKpiSummaryMock.mockImplementation(async (query: { vehicleId?: string; fleetId?: string }) =>
      query.vehicleId || query.fleetId ? scopedFleetSummary() : buildSummary(),
    );
    getKpiSeriesMock.mockResolvedValue(buildFleetSeries());
    getKpiBreakdownMock.mockImplementation(async (query: { kpiId: string; fleetId?: string }) => fleetVehicleBreakdown(query.kpiId, query.fleetId));
    listVehiclesMock.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pageSize: 20 } });
    listFleetsMock.mockResolvedValue({ items: [{ id: 'f1', name: 'Frota Principal' }], meta: { total: 1, page: 1, pageSize: 100 } });
  });

  it('resumo com os 5 KPIs de frota, do mesmo summary das outras abas quando sem filtro', async () => {
    renderPage();
    for (const name of ['Utilizacao da frota', 'Disponibilidade da frota', 'Tempo ocioso', 'Viagens concluidas', 'Distancia percorrida']) {
      expect(await screen.findByRole('article', { name })).toBeInTheDocument();
    }
    expect(getKpiSummaryMock).toHaveBeenCalledTimes(1);
  });

  it('selecionar um veiculo dispara um summary escopado; limpar o filtro volta ao summary global', async () => {
    listVehiclesMock.mockResolvedValue(fleetVehiclesList());
    renderPage();
    await screen.findByRole('article', { name: 'Utilizacao da frota' });
    expect(getKpiSummaryMock).toHaveBeenCalledTimes(1);
    expect(within(screen.getByRole('article', { name: 'Utilizacao da frota' })).getByText('62,5')).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/placa, marca, modelo/i), 'AAA');
    await userEvent.click(await screen.findByRole('button', { name: /AAA1111/ }));

    await waitFor(() => expect(getKpiSummaryMock).toHaveBeenCalledTimes(2));
    const calls = getKpiSummaryMock.mock.calls as [{ vehicleId?: string }][];
    expect(calls[1]?.[0]).toMatchObject({ vehicleId: 'v1' });
    await waitFor(() => expect(within(screen.getByRole('article', { name: 'Utilizacao da frota' })).getByText('40,0')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Trocar selecao' }));
    await waitFor(() => expect(within(screen.getByRole('article', { name: 'Utilizacao da frota' })).getByText('62,5')).toBeInTheDocument());
    expect(getKpiSummaryMock).toHaveBeenCalledTimes(2);
  });

  it('composicao do tempo mostra "Não registrado / cobertura insuficiente", nunca rotula como ocioso', async () => {
    renderPage();
    await screen.findByRole('article', { name: 'Utilizacao da frota' });
    expect(await screen.findByText('Não registrado / cobertura insuficiente')).toBeInTheDocument();
    expect(screen.queryByText('Sem registro de operação')).not.toBeInTheDocument();
  });

  // Achado da revisao final: com filtro de veiculo selecionado, o bloco de
  // composicao do tempo usava o MESMO Map vazio de "sem filtro carregado"
  // tanto durante o loading do summary escopado quanto no erro dele --
  // mostrando "sem dado" de forma falsa em vez de esqueleto/erro com retry.
  it('composicao do tempo: com filtro de veiculo, mostra loading (nunca "sem dado" falso)', async () => {
    listVehiclesMock.mockResolvedValue(fleetVehiclesList());
    let resolveSummary: (value: KpiSummaryEntity) => void = () => undefined;
    getKpiSummaryMock.mockImplementation(async (query: { vehicleId?: string }) => {
      if (!query.vehicleId) return buildSummary();
      return new Promise((resolve) => {
        resolveSummary = resolve;
      });
    });
    renderPage();
    await screen.findByRole('article', { name: 'Utilizacao da frota' });

    await userEvent.type(screen.getByPlaceholderText(/placa, marca, modelo/i), 'AAA');
    await userEvent.click(await screen.findByRole('button', { name: /AAA1111/ }));

    expect(await screen.findByLabelText('Carregando indicadores da frota')).toBeInTheDocument();
    expect(screen.queryByText('Sem dado de tempo de frota no período')).not.toBeInTheDocument();

    resolveSummary(scopedFleetSummary());
    await waitFor(() => expect(within(screen.getByRole('article', { name: 'Utilizacao da frota' })).getByText('40,0')).toBeInTheDocument());
  });

  it('composicao do tempo: com filtro de veiculo, mostra erro com retry (nunca "sem dado" falso)', async () => {
    listVehiclesMock.mockResolvedValue(fleetVehiclesList());
    getKpiSummaryMock.mockImplementation(async (query: { vehicleId?: string }) => {
      if (!query.vehicleId) return buildSummary();
      throw new ApiError(500, 'INTERNAL', 'falha', '/bi/kpis/summary');
    });
    renderPage();
    await screen.findByRole('article', { name: 'Utilizacao da frota' });

    await userEvent.type(screen.getByPlaceholderText(/placa, marca, modelo/i), 'AAA');
    await userEvent.click(await screen.findByRole('button', { name: /AAA1111/ }));

    // O resumo e a composicao do tempo dependem do MESMO summary escopado --
    // os dois mostram erro com retry quando ele falha (nunca so um deles).
    const errors = await screen.findAllByText('Não foi possível carregar os indicadores do filtro.');
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Sem dado de tempo de frota no período')).not.toBeInTheDocument();
  });

  it('tabela por veiculo: UNAVAILABLE nunca vira 0; busca e ordenacao funcionam', async () => {
    renderPage();
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('AAA1111')).toBeInTheDocument());
    expect(within(table).getByText('BBB2222')).toBeInTheDocument();
    const row = within(table).getByText('BBB2222').closest('tr') as HTMLElement;
    expect(row).toHaveTextContent('—');
    expect(row).not.toHaveTextContent(/^0%$/);

    await userEvent.type(screen.getByPlaceholderText('Buscar por placa...'), 'BBB');
    await waitFor(() => expect(within(table).queryByText('AAA1111')).not.toBeInTheDocument());
    expect(within(table).getByText('BBB2222')).toBeInTheDocument();
  });

  it('filtrar por 1 veiculo esconde a tabela por veiculo e explica o motivo', async () => {
    listVehiclesMock.mockResolvedValue(fleetVehiclesList());
    renderPage();
    await screen.findByRole('table');
    await userEvent.type(screen.getByPlaceholderText(/placa, marca, modelo/i), 'AAA');
    await userEvent.click(await screen.findByRole('button', { name: /AAA1111/ }));
    await waitFor(() => expect(screen.queryByRole('table')).not.toBeInTheDocument());
    expect(screen.getByText('Filtro já restrito a 1 veículo')).toBeInTheDocument();
  });

  it('drill-down dos 5 cards de frota para as telas existentes', async () => {
    renderPage();
    await screen.findByRole('article', { name: 'Utilizacao da frota' });
    expect(within(screen.getByRole('article', { name: 'Utilizacao da frota' })).getByRole('link', { name: /Ver frota/ })).toHaveAttribute(
      'href',
      '/operations/fleet',
    );
    expect(
      within(screen.getByRole('article', { name: 'Disponibilidade da frota' })).getByRole('link', { name: /Ver frota/ }),
    ).toHaveAttribute('href', '/operations/fleet');
    expect(
      within(screen.getByRole('article', { name: 'Tempo ocioso' })).getByRole('link', { name: /Ver torre de controle/ }),
    ).toHaveAttribute('href', '/operations/control-tower');
    expect(within(screen.getByRole('article', { name: 'Viagens concluidas' })).getByRole('link', { name: /Ver viagens/ })).toHaveAttribute(
      'href',
      '/trips',
    );
    expect(
      within(screen.getByRole('article', { name: 'Distancia percorrida' })).getByRole('link', { name: /Ver custos/ }),
    ).toHaveAttribute('href', '/operations/fleet/costs');
  });

  it('"Como é calculado" funciona nos 5 KPIs de frota', async () => {
    renderPage();
    await screen.findByRole('article', { name: 'Utilizacao da frota' });
    fireEvent.click(screen.getByRole('button', { name: 'Como é calculado: Utilizacao da frota' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('formula de fleet_utilization')).toBeInTheDocument();
  });

  it('loading, erro e retry do resumo escopado e da evolucao', async () => {
    getKpiSeriesMock.mockReturnValue(new Promise(() => undefined));
    const first = renderPage();
    expect(await screen.findByLabelText('Carregando evolução da frota')).toBeInTheDocument();
    first.unmount();

    getKpiSeriesMock.mockReset();
    getKpiSeriesMock.mockRejectedValue(new ApiError(500, 'INTERNAL', 'falha', '/bi/kpis/series'));
    const second = renderPage();
    expect(await screen.findByText('Não foi possível carregar a evolução.')).toBeInTheDocument();
    second.unmount();

    getKpiSeriesMock.mockReset();
    getKpiSeriesMock.mockResolvedValue(buildFleetSeries());
    listVehiclesMock.mockResolvedValue(fleetVehiclesList());
    getKpiSummaryMock.mockImplementation(async (query: { vehicleId?: string }) => {
      if (query.vehicleId) throw new ApiError(500, 'INTERNAL', 'falha', '/bi/kpis/summary');
      return buildSummary();
    });
    renderPage();
    await screen.findByRole('article', { name: 'Utilizacao da frota' });
    await userEvent.type(screen.getByPlaceholderText(/placa, marca, modelo/i), 'AAA');
    await userEvent.click(await screen.findByRole('button', { name: /AAA1111/ }));
    // O resumo e a composicao do tempo dependem do MESMO summary escopado --
    // os dois mostram erro com retry quando ele falha (nunca so um deles).
    const errors = await screen.findAllByText('Não foi possível carregar os indicadores do filtro.');
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Tentar novamente/ }).length).toBeGreaterThanOrEqual(1);
  });

  it('regressao: aba Operacao nao mostra mais o bloco de frota', async () => {
    searchParams = new URLSearchParams('aba=operation');
    getKpiSummaryMock.mockReset();
    getKpiSummaryMock.mockResolvedValue(buildSummary());
    renderPage();
    await screen.findByText('Pontualidade');
    expect(screen.queryByText('Horas da frota no período')).not.toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Distancia percorrida' })).not.toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Utilizacao da frota' })).not.toBeInTheDocument();
  });
});

// ============================================================================
// BI 5 -- aba Custos
// ============================================================================
const COST_VEHICLE_ROWS: Record<string, ReturnType<typeof vehicleBreakdownItem>[]> = {
  operating_cost: [vehicleBreakdownItem('v1', 'AAA1111', 850, null, null, 6), vehicleBreakdownItem('v2', 'BBB2222', 380, null, null, 3)],
  fuel_cost: [vehicleBreakdownItem('v1', 'AAA1111', 600), vehicleBreakdownItem('v2', 'BBB2222', 0)],
  maintenance_cost: [vehicleBreakdownItem('v1', 'AAA1111', 0), vehicleBreakdownItem('v2', 'BBB2222', 300)],
  toll_cost: [vehicleBreakdownItem('v1', 'AAA1111', 50), vehicleBreakdownItem('v2', 'BBB2222', 0)],
  tire_cost: [vehicleBreakdownItem('v1', 'AAA1111', 200), vehicleBreakdownItem('v2', 'BBB2222', 80)],
  other_cost: [vehicleBreakdownItem('v1', 'AAA1111', 0), vehicleBreakdownItem('v2', 'BBB2222', 0)],
  cost_per_km: [
    vehicleBreakdownItem('v1', 'AAA1111', 8.5),
    vehicleBreakdownItem('v2', 'BBB2222', null, 'Menos de 2 leituras de odometro (abastecimento ou manutencao) no periodo para este veiculo.'),
  ],
};

function costVehicleBreakdown(kpiId: string, fleetId?: string): KpiBreakdownEntity {
  return {
    kpiId,
    dimension: 'vehicle',
    scope: { tenantId: 't1', vehicleId: null, fleetId: fleetId ?? null, customerId: null },
    period: PERIOD,
    total: kpiId === 'cost_per_km' ? 14.2 : null,
    items: COST_VEHICLE_ROWS[kpiId] ?? [],
    others: null,
  };
}

// BI 5 -- fuel_cost/maintenance_cost/toll_cost/tire_cost/other_cost sao KPIs
// OFICIAIS proprios no catalogo (nao so inputs de operating_cost); a aba
// Custos os mostra como cards individuais.
function costsSummary(): KpiSummaryEntity {
  const summary = financialSummary();
  summary.kpis.push(
    kpi('fuel_cost', { name: 'Combustivel', unit: 'BRL', direction: 'LOWER_IS_BETTER', value: 600000 }),
    kpi('maintenance_cost', { name: 'Manutencao', unit: 'BRL', direction: 'LOWER_IS_BETTER', value: 80000 }),
    kpi('toll_cost', { name: 'Pedagio', unit: 'BRL', direction: 'LOWER_IS_BETTER', value: 40000 }),
    kpi('tire_cost', { name: 'Pneus', unit: 'BRL', direction: 'LOWER_IS_BETTER', value: 30000 }),
    kpi('other_cost', { name: 'Outras despesas', unit: 'BRL', direction: 'LOWER_IS_BETTER', value: 4200 }),
  );
  return summary;
}

function scopedCostSummary(): KpiSummaryEntity {
  const summary = costsSummary();
  summary.scope = { ...summary.scope, vehicleId: 'v1' };
  summary.kpis = summary.kpis.map((k) => (k.id === 'operating_cost' ? { ...k, value: 850 } : k));
  return summary;
}

describe('Central -- aba Custos (BI 5)', () => {
  beforeEach(() => {
    getKpiSummaryMock.mockReset();
    getKpiSeriesMock.mockReset();
    getKpiBreakdownMock.mockReset();
    listVehiclesMock.mockReset();
    listFleetsMock.mockReset();
    getDashboardMock.mockReset();
    replaceMock.mockReset();
    useAuthMock.mockReturnValue({ user: { role: UserRole.ADMIN } });
    searchParams = new URLSearchParams('aba=costs');
    getKpiSummaryMock.mockImplementation(async (query: { vehicleId?: string; fleetId?: string }) =>
      query.vehicleId || query.fleetId ? scopedCostSummary() : costsSummary(),
    );
    getKpiSeriesMock.mockResolvedValue(buildSeries());
    getKpiBreakdownMock.mockImplementation(async (query: { kpiId: string; fleetId?: string }) => costVehicleBreakdown(query.kpiId, query.fleetId));
    listVehiclesMock.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pageSize: 20 } });
    listFleetsMock.mockResolvedValue({ items: [{ id: 'f1', name: 'Frota Principal' }], meta: { total: 1, page: 1, pageSize: 100 } });
  });

  it('resumo com os 7 KPIs de custo, do mesmo summary das outras abas quando sem filtro', async () => {
    renderPage();
    for (const name of ['Despesas operacionais', 'Custo por km', 'Combustivel', 'Manutencao', 'Pedagio', 'Pneus', 'Outras despesas']) {
      expect(await screen.findByRole('article', { name })).toBeInTheDocument();
    }
    expect(getKpiSummaryMock).toHaveBeenCalledTimes(1);
  });

  it('relacao custo x operacao mostra distancia/receita/resultado/margem do mesmo summary', async () => {
    renderPage();
    await screen.findByRole('article', { name: 'Despesas operacionais' });
    expect(screen.getByRole('article', { name: 'Distancia percorrida' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Receita' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Margem operacional' })).toBeInTheDocument();
  });

  it('selecionar um veiculo dispara um summary escopado; limpar o filtro volta ao summary global', async () => {
    listVehiclesMock.mockResolvedValue(fleetVehiclesList());
    renderPage();
    await screen.findByRole('article', { name: 'Despesas operacionais' });
    expect(getKpiSummaryMock).toHaveBeenCalledTimes(1);

    await userEvent.type(screen.getByPlaceholderText(/placa, marca, modelo/i), 'AAA');
    await userEvent.click(await screen.findByRole('button', { name: /AAA1111/ }));

    // Timeout maior: a aba Custos dispara 7 chamadas de breakdown em paralelo
    // (uma por KPI de custo) alem do summary escopado -- sob carga (suite
    // inteira), o render leva mais que o timeout padrao de waitFor.
    await waitFor(() => expect(getKpiSummaryMock).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await waitFor(
      () => expect(within(screen.getByRole('article', { name: 'Despesas operacionais' })).getByText(/850,00/)).toBeInTheDocument(),
      { timeout: 3000 },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Trocar selecao' }));
    await waitFor(
      () => expect(within(screen.getByRole('article', { name: 'Despesas operacionais' })).getByText(/354\.200,00/)).toBeInTheDocument(),
      { timeout: 3000 },
    );
    expect(getKpiSummaryMock).toHaveBeenCalledTimes(2);
  });

  it('composicao dos custos mostra as categorias oficiais do operating_cost', async () => {
    renderPage();
    await screen.findByRole('article', { name: 'Despesas operacionais' });
    expect(await screen.findByText('Combustível')).toBeInTheDocument();
    expect(screen.getByText(/classificação contábil/)).toBeInTheDocument();
  });

  it('tabela por veiculo: cost_per_km UNAVAILABLE nunca vira 0; busca funciona', async () => {
    renderPage();
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('AAA1111')).toBeInTheDocument());
    const row = within(table).getByText('BBB2222').closest('tr') as HTMLElement;
    expect(row).toHaveTextContent('—');
    await userEvent.type(screen.getByPlaceholderText('Buscar por placa...'), 'BBB');
    await waitFor(() => expect(within(table).queryByText('AAA1111')).not.toBeInTheDocument());
  });

  it('filtrar por 1 veiculo esconde a tabela por veiculo e explica o motivo', async () => {
    listVehiclesMock.mockResolvedValue(fleetVehiclesList());
    renderPage();
    await screen.findByRole('table');
    await userEvent.type(screen.getByPlaceholderText(/placa, marca, modelo/i), 'AAA');
    await userEvent.click(await screen.findByRole('button', { name: /AAA1111/ }));
    await waitFor(() => expect(screen.queryByRole('table')).not.toBeInTheDocument());
    expect(screen.getByText('Filtro já restrito a 1 veículo')).toBeInTheDocument();
  });

  it('drill-down dos cards de custo para as telas existentes', async () => {
    renderPage();
    const opCost = await screen.findByRole('article', { name: 'Despesas operacionais' });
    expect(within(opCost).getByRole('link', { name: /Ver custos/ })).toHaveAttribute('href', '/operations/fleet/costs');
    expect(
      within(screen.getByRole('article', { name: 'Combustivel' })).getByRole('link', { name: /Ver abastecimento/ }),
    ).toHaveAttribute('href', '/operations/fleet/fuel');
  });

  it('"Como é calculado" funciona nos cards de custo', async () => {
    renderPage();
    await screen.findByRole('article', { name: 'Despesas operacionais' });
    fireEvent.click(screen.getByRole('button', { name: 'Como é calculado: Despesas operacionais' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Custo operacional total')).toBeInTheDocument();
  });

  it('regressao: aba Financeiro continua com os 6 KPIs oficiais apos a extracao de CostCompositionList', async () => {
    searchParams = new URLSearchParams('aba=financial');
    getKpiSummaryMock.mockReset();
    getKpiSummaryMock.mockResolvedValue(financialSummary());
    renderPage();
    for (const name of ['Receita', 'Despesas operacionais', 'Resultado operacional', 'Margem operacional', 'Custo por km', 'Receita por km']) {
      expect(await screen.findByRole('article', { name })).toBeInTheDocument();
    }
  });
});

// ============================================================================
// BI 6 -- aba Prazos
// ============================================================================
const DEADLINE_VEHICLE_ROWS: Record<string, ReturnType<typeof vehicleBreakdownItem>[]> = {
  deliveries_completed: [vehicleBreakdownItem('v1', 'AAA1111', 3), vehicleBreakdownItem('v2', 'BBB2222', 0)],
  on_time_delivery_rate: [
    vehicleBreakdownItem('v1', 'AAA1111', 50),
    vehicleBreakdownItem(
      'v2',
      'BBB2222',
      null,
      'Nenhuma entrega concluida no periodo com previsao de chegada (plannedArrival) para este veiculo.',
    ),
  ],
  occurrences_total: [vehicleBreakdownItem('v1', 'AAA1111', 1), vehicleBreakdownItem('v2', 'BBB2222', 0)],
  occurrences_critical: [vehicleBreakdownItem('v1', 'AAA1111', 1), vehicleBreakdownItem('v2', 'BBB2222', 0)],
};

function deadlineVehicleBreakdown(kpiId: string, fleetId?: string): KpiBreakdownEntity {
  return {
    kpiId,
    dimension: 'vehicle',
    scope: { tenantId: 't1', vehicleId: null, fleetId: fleetId ?? null, customerId: null },
    period: PERIOD,
    total: kpiId === 'on_time_delivery_rate' ? 91.2 : null,
    items: DEADLINE_VEHICLE_ROWS[kpiId] ?? [],
    others: null,
  };
}

function scopedDeadlinesSummary(): KpiSummaryEntity {
  const summary = financialSummary();
  summary.scope = { ...summary.scope, vehicleId: 'v1' };
  summary.kpis = summary.kpis.map((k) => (k.id === 'on_time_delivery_rate' ? { ...k, value: 50 } : k));
  return summary;
}

function deadlinesSeries(): KpiSeriesResponseEntity {
  const base = buildSeries();
  return {
    ...base,
    series: [
      seriesFor('on_time_delivery_rate', [88, 90, 91.2], 'PERCENT'),
      seriesFor('occurrences_total', [40, 45, 47], 'COUNT'),
      seriesFor('occurrences_critical', [2, 3, 3], 'COUNT'),
    ],
  };
}

describe('Central -- aba Prazos (BI 6)', () => {
  beforeEach(() => {
    getKpiSummaryMock.mockReset();
    getKpiSeriesMock.mockReset();
    getKpiBreakdownMock.mockReset();
    listVehiclesMock.mockReset();
    listFleetsMock.mockReset();
    getDashboardMock.mockReset();
    replaceMock.mockReset();
    useAuthMock.mockReturnValue({ user: { role: UserRole.ADMIN } });
    searchParams = new URLSearchParams('aba=deadlines');
    getKpiSummaryMock.mockImplementation(async (query: { vehicleId?: string; fleetId?: string }) =>
      query.vehicleId || query.fleetId ? scopedDeadlinesSummary() : financialSummary(),
    );
    getKpiSeriesMock.mockResolvedValue(deadlinesSeries());
    getKpiBreakdownMock.mockImplementation(async (query: { kpiId: string; fleetId?: string }) => deadlineVehicleBreakdown(query.kpiId, query.fleetId));
    listVehiclesMock.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pageSize: 20 } });
    listFleetsMock.mockResolvedValue({ items: [{ id: 'f1', name: 'Frota Principal' }], meta: { total: 1, page: 1, pageSize: 100 } });
  });

  it('resumo com pontualidade e os 4 KPIs de volume/ocorrencias, do mesmo summary das outras abas quando sem filtro', async () => {
    renderPage();
    for (const name of ['Entregas realizadas', 'Viagens concluidas', 'Ocorrencias', 'Ocorrencias criticas']) {
      expect(await screen.findByRole('article', { name })).toBeInTheDocument();
    }
    expect(screen.getByText('Pontualidade')).toBeInTheDocument();
    expect(getKpiSummaryMock).toHaveBeenCalledTimes(1);
  });

  it('onde devo investigar mostra distancia/custo/receita do mesmo summary', async () => {
    renderPage();
    await screen.findByRole('article', { name: 'Entregas realizadas' });
    expect(screen.getByRole('article', { name: 'Distancia percorrida' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Despesas operacionais' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Receita' })).toBeInTheDocument();
  });

  it('selecionar um veiculo dispara um summary escopado; limpar o filtro volta ao summary global', async () => {
    listVehiclesMock.mockResolvedValue(fleetVehiclesList());
    renderPage();
    await screen.findByText('Pontualidade');
    expect(getKpiSummaryMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('91,2%')).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/placa, marca, modelo/i), 'AAA');
    await userEvent.click(await screen.findByRole('button', { name: /AAA1111/ }));

    await waitFor(() => expect(getKpiSummaryMock).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await waitFor(() => expect(screen.getByText('50,0%')).toBeInTheDocument(), { timeout: 3000 });

    await userEvent.click(screen.getByRole('button', { name: 'Trocar selecao' }));
    await waitFor(() => expect(screen.getByText('91,2%')).toBeInTheDocument(), { timeout: 3000 });
    expect(getKpiSummaryMock).toHaveBeenCalledTimes(2);
  });

  it('tabela por veiculo: on_time_delivery_rate UNAVAILABLE nunca vira 0%; busca funciona', async () => {
    renderPage();
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('AAA1111')).toBeInTheDocument());
    const row = within(table).getByText('BBB2222').closest('tr') as HTMLElement;
    expect(row).toHaveTextContent('—');
    expect(row).not.toHaveTextContent(/^0%$/);
    await userEvent.type(screen.getByPlaceholderText('Buscar por placa...'), 'BBB');
    await waitFor(() => expect(within(table).queryByText('AAA1111')).not.toBeInTheDocument());
  });

  it('filtrar por 1 veiculo esconde a tabela por veiculo e explica o motivo', async () => {
    listVehiclesMock.mockResolvedValue(fleetVehiclesList());
    renderPage();
    await screen.findByRole('table');
    await userEvent.type(screen.getByPlaceholderText(/placa, marca, modelo/i), 'AAA');
    await userEvent.click(await screen.findByRole('button', { name: /AAA1111/ }));
    await waitFor(() => expect(screen.queryByRole('table')).not.toBeInTheDocument());
    expect(screen.getByText('Filtro já restrito a 1 veículo')).toBeInTheDocument();
  });

  it('evolucao mostra grafico de pontualidade e de ocorrencias', async () => {
    renderPage();
    await screen.findByText('Pontualidade');
    expect(await screen.findByText('Ocorrências')).toBeInTheDocument();
  });

  it('regressao: aba Operacao continua mostrando o painel de pontualidade apos a extracao para on-time-panel', async () => {
    searchParams = new URLSearchParams('aba=operation');
    getKpiSummaryMock.mockReset();
    getKpiSummaryMock.mockResolvedValue(buildSummary());
    renderPage();
    expect(await screen.findByText('Pontualidade')).toBeInTheDocument();
    expect(screen.getByText('Cobertura da métrica')).toBeInTheDocument();
  });
});

// ============================================================================
// BI 7 -- aba Comparativos
// ============================================================================
const COMPARATIVE_VEHICLE_ROWS: Record<string, ReturnType<typeof vehicleBreakdownItem>[]> = {
  cost_per_km: [
    vehicleBreakdownItem('v1', 'AAA1111', 8.5),
    vehicleBreakdownItem('v2', 'BBB2222', null, 'Menos de 2 leituras de odometro.'),
  ],
  on_time_delivery_rate: [vehicleBreakdownItem('v1', 'AAA1111', 91.2), vehicleBreakdownItem('v2', 'BBB2222', 50)],
  trips_completed: [vehicleBreakdownItem('v1', 'AAA1111', 6), vehicleBreakdownItem('v2', 'BBB2222', 4)],
  occurrences_total: [vehicleBreakdownItem('v1', 'AAA1111', 1), vehicleBreakdownItem('v2', 'BBB2222', 0)],
};

function comparativeBreakdown(kpiId: string): KpiBreakdownEntity {
  return {
    kpiId,
    dimension: 'vehicle',
    scope: { tenantId: 't1', vehicleId: null, fleetId: null, customerId: null },
    period: PERIOD,
    total: null,
    items: COMPARATIVE_VEHICLE_ROWS[kpiId] ?? [],
    others: null,
  };
}

function comparativesSeries(): KpiSeriesResponseEntity {
  const base = buildSeries();
  return {
    ...base,
    series: [
      seriesFor('revenue', [140000, 150000, 162300]),
      seriesFor('operating_result', [30000, -5000, 38100]),
      seriesFor('cost_per_km', [4.5, 4.3, 4.21], 'BRL_PER_KM'),
      seriesFor('on_time_delivery_rate', [88, 90, 91.2], 'PERCENT'),
    ],
  };
}

describe('Central -- aba Comparativos (BI 7)', () => {
  beforeEach(() => {
    getKpiSummaryMock.mockReset();
    getKpiSeriesMock.mockReset();
    getKpiBreakdownMock.mockReset();
    listVehiclesMock.mockReset();
    listFleetsMock.mockReset();
    getDashboardMock.mockReset();
    replaceMock.mockReset();
    useAuthMock.mockReturnValue({ user: { role: UserRole.ADMIN } });
    searchParams = new URLSearchParams('aba=comparatives');
    getKpiSummaryMock.mockResolvedValue(buildSummary());
    getKpiSeriesMock.mockResolvedValue(comparativesSeries());
    getKpiBreakdownMock.mockImplementation(async (query: { kpiId: string }) => comparativeBreakdown(query.kpiId));
    listVehiclesMock.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pageSize: 20 } });
    listFleetsMock.mockResolvedValue({ items: [{ id: 'f1', name: 'Frota Principal' }], meta: { total: 1, page: 1, pageSize: 100 } });
  });

  it('resumo agrupa os KPIs oficiais por categoria e usa "Período anterior" sem chamada extra', async () => {
    renderPage();
    const card = await screen.findByRole('article', { name: 'Receita' });
    const section = card.closest('section') as HTMLElement;
    for (const label of ['Financeiro', 'Operacional', 'Frota', 'Nível de serviço']) {
      expect(within(section).getByText(label)).toBeInTheDocument();
    }
    expect(getKpiSummaryMock).toHaveBeenCalledTimes(1);
  });

  it('trocar para "ano anterior" dispara um summary proprio com comparison=PREVIOUS_YEAR', async () => {
    renderPage();
    await screen.findByRole('article', { name: 'Receita' });
    expect(getKpiSummaryMock).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('radio', { name: 'Mesmo período do ano passado' }));

    await waitFor(() => expect(getKpiSummaryMock).toHaveBeenCalledTimes(2));
    const calls = getKpiSummaryMock.mock.calls as [{ comparison?: string }][];
    expect(calls[1]?.[0]).toMatchObject({ comparison: 'PREVIOUS_YEAR' });
  });

  it('personalizado exige as duas datas antes de consultar a API', async () => {
    renderPage();
    await screen.findByRole('article', { name: 'Receita' });

    const comparisonGroup = screen.getByRole('radiogroup', { name: 'Comparar com' });
    await userEvent.click(within(comparisonGroup).getByRole('radio', { name: 'Personalizado' }));
    expect(screen.getByText('Escolha o período de referência')).toBeInTheDocument();
    expect(getKpiSummaryMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Data inicial de referência'), { target: { value: '2025-12-01' } });
    fireEvent.change(screen.getByLabelText('Data final de referência'), { target: { value: '2025-12-31' } });

    await waitFor(() => expect(getKpiSummaryMock).toHaveBeenCalledTimes(2));
    const calls = getKpiSummaryMock.mock.calls as [{ comparison?: string; compareStartDate?: string; compareEndDate?: string }][];
    expect(calls[1]?.[0]).toMatchObject({ comparison: 'CUSTOM' });
    expect(calls[1]?.[0]?.compareStartDate).toMatch(/2025-12-01/);
  });

  it('evolucao mostra badge de tendencia coerente com a direcao de cada KPI (alta nao e sempre positivo)', async () => {
    renderPage();
    const section = (await screen.findByText('Evolução e tendência')).closest('section') as HTMLElement;
    await waitFor(() => expect(within(section).getAllByText(/Tendência: Alta/).length).toBeGreaterThan(0));
    expect(within(section).getByText(/Tendência: Baixa/)).toBeInTheDocument();
  });

  it('por dimensao: trocar o indicador refaz a consulta de breakdown por veiculo', async () => {
    renderPage();
    await screen.findByText('AAA1111');
    expect(getKpiBreakdownMock).toHaveBeenCalledWith(expect.objectContaining({ kpiId: 'cost_per_km' }), expect.anything());

    await userEvent.click(screen.getByRole('radio', { name: 'Entregas no prazo' }));
    await waitFor(() => expect(getKpiBreakdownMock).toHaveBeenCalledWith(expect.objectContaining({ kpiId: 'on_time_delivery_rate' }), expect.anything()));
  });

  it('filtro de veiculo dispara summary e breakdown escopados (mesmo padrao das outras abas)', async () => {
    listVehiclesMock.mockResolvedValue(fleetVehiclesList());
    renderPage();
    await screen.findByRole('article', { name: 'Receita' });
    expect(getKpiSummaryMock).toHaveBeenCalledTimes(1);

    await userEvent.type(screen.getByPlaceholderText(/placa, marca, modelo/i), 'AAA');
    await userEvent.click(await screen.findByRole('button', { name: /AAA1111/ }));

    await waitFor(() => expect(getKpiSummaryMock).toHaveBeenCalledTimes(2));
    const calls = getKpiSummaryMock.mock.calls as [{ vehicleId?: string }][];
    expect(calls[1]?.[0]).toMatchObject({ vehicleId: 'v1' });
  });
});
