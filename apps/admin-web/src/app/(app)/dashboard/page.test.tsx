import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../lib/api/errors';
import type { KpiResultEntity, KpiSummaryEntity } from '../../../types/entities';
import { UserRole } from '../../../types/enums';
import DashboardPage from './page';

const getKpiSummaryMock = vi.fn();
const getDashboardMock = vi.fn();
const replaceMock = vi.fn();
const useAuthMock = vi.fn();
let searchParams = new URLSearchParams();

vi.mock('../../../lib/api/bi.api', () => ({
  getKpiSummary: (...args: unknown[]) => getKpiSummaryMock(...args),
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
    scope: { tenantId: 't1', vehicleId: null, fleetId: null },
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
    searchParams = new URLSearchParams('aba=financial');
    renderPage();
    expect(screen.getByText('Financeiro chega à Central no BI 3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Financeiro da frota/ })).toHaveAttribute('href', '/operations/fleet/financial');
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
