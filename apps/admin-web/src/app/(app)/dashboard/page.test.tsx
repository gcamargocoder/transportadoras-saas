import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

vi.mock('../../../lib/api/bi.api', () => ({
  getKpiSummary: (...args: unknown[]) => getKpiSummaryMock(...args),
  getKpiSeries: (...args: unknown[]) => getKpiSeriesMock(...args),
  getKpiBreakdown: (...args: unknown[]) => getKpiBreakdownMock(...args),
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
      kpi('revenue', { name: 'Receita', unit: 'BRL', value: 452300, comparison: comparison(400000, 52300, 13.08) }),
      kpi('operating_result', { name: 'Resultado operacional', unit: 'BRL', value: 98100, comparison: comparison(90000, 8100, 9) }),
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
      kpi('fleet_availability', { name: 'Disponibilidade da frota', unit: 'PERCENT', value: 95.8 }),
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

  it('aba Operacao: pontualidade com cobertura baixa e horas da frota', async () => {
    searchParams = new URLSearchParams('aba=operation');
    renderPage();
    expect(await screen.findByText('Pontualidade')).toBeInTheDocument();
    expect(screen.getByText('Cobertura da métrica')).toBeInTheDocument();
    expect(screen.getByText(/Poucas entregas têm previsão de chegada/)).toBeInTheDocument();
    expect(screen.getByText('Horas da frota no período')).toBeInTheDocument();
    expect(screen.getByText('4.500 h')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Distancia percorrida' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Ocorrencias criticas' })).toBeInTheDocument();
  });

  it('trocar de aba atualiza a URL', async () => {
    renderPage();
    await screen.findByRole('article', { name: 'Viagens concluidas' });
    fireEvent.click(screen.getByRole('tab', { name: 'Operação' }));
    expect(replaceMock).toHaveBeenCalledWith('/dashboard?aba=operation', { scroll: false });
  });

  it('abas futuras nao exibem dados ficticios nem consultam a API', () => {
    searchParams = new URLSearchParams('aba=fleet');
    renderPage();
    expect(screen.getByText('Frota chega à Central no BI 4')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Gestão da frota/ })).toHaveAttribute('href', '/operations/fleet');
    expect(getKpiSummaryMock).not.toHaveBeenCalled();
  });

  it('todas as abas previstas estao na navegacao', () => {
    renderPage();
    const labels = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(labels).toEqual(['Visão geral', 'Operação', 'Financeiro', 'Frota', 'Custos', 'Prazos', 'Ocorrências']);
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
      { key: 'c1', label: 'Atacadao Sul', value: 300000, share: 66.3, recordCount: 40 },
      { key: null, label: 'Sem cliente', value: 52300, share: 11.6, recordCount: 9 },
    ],
    others: { key: null, label: 'Demais (3)', value: 100000, share: 22.1, recordCount: 12 },
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
