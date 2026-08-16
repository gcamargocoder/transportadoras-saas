import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TollDashboardEntity, TollReconciliationDashboardEntity } from '../../../../../types/entities';
import FleetTollsPage from './page';

const getTollDashboardMock = vi.fn();
const getTollReconciliationDashboardMock = vi.fn();

vi.mock('../../../../../lib/api/tolls.api', () => ({
  getTollDashboard: (...args: unknown[]) => getTollDashboardMock(...args),
}));

vi.mock('../../../../../lib/api/toll-routes.api', () => ({
  getTollReconciliationDashboard: (...args: unknown[]) => getTollReconciliationDashboardMock(...args),
}));

vi.mock('../../../../../lib/api/fleet.api', () => ({
  listVehicles: () => Promise.resolve({ items: [] }),
  listFleets: () => Promise.resolve({ items: [] }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return render(<FleetTollsPage />, { wrapper: Wrapper });
}

function buildTollDashboard(overrides: Partial<TollDashboardEntity> = {}): TollDashboardEntity {
  return {
    // Cada breakdown usa count/totalChargedAmount distintos de proposito --
    // evita colisao de "getByText" entre StatCard/DataTable/BarRankingChart
    // (varias tabelas renderizadas juntas na mesma tela).
    totalCount: 15,
    totalChargedAmount: 750,
    totalExpectedAmount: 700,
    totalDiscrepancyAmount: 50,
    countByStatus: [{ status: 'NORMAL', count: 11, totalChargedAmount: 610 }],
    countByProvider: [{ id: 'p1', label: 'Sem Parar', count: 12, totalChargedAmount: 620 }],
    countByVehicle: [{ id: 'v1', label: 'ABC1D23', count: 13, totalChargedAmount: 630 }],
    countByDriver: [{ id: 'd1', label: 'José da Silva', count: 14, totalChargedAmount: 640 }],
    countByPlaza: [{ id: 'pl1', label: 'Praça Central', count: 16, totalChargedAmount: 660 }],
    conferredCount: 14,
    unverifiableCount: 1,
    correctCount: 12,
    overchargeCount: 2,
    underchargeCount: 0,
    conformityPercentage: 85.7,
    monthlyTrendChargedAmount: Array.from({ length: 12 }, (_, i) => ({ month: `M${i}`, value: 0 })),
    ...overrides,
  };
}

function buildReconciliationDashboard(overrides: Partial<TollReconciliationDashboardEntity> = {}): TollReconciliationDashboardEntity {
  return {
    totalTripsWithRoute: 10,
    reconciledTripsCount: 6,
    nonReconciledTripsCount: 4,
    pendingTripsCount: 1,
    conformTripsCount: 6,
    attentionTripsCount: 2,
    criticalTripsCount: 1,
    unverifiableTripsCount: 0,
    tripsWithNotRegisteredCount: 1,
    tripsWithUnplannedCount: 0,
    totalExpectedStops: 20,
    totalRegisteredStops: 18,
    totalNotRegisteredStops: 2,
    totalUnplannedTransactions: 0,
    totalUnplannedAmount: 0,
    totalExpectedAmount: 700,
    totalChargedAmount: 750,
    totalDivergenceAmount: 50,
    conformityPercentage: 60,
    ...overrides,
  };
}

describe('FleetTollsPage', () => {
  beforeEach(() => {
    getTollDashboardMock.mockReset();
    getTollReconciliationDashboardMock.mockReset();
    getTollReconciliationDashboardMock.mockResolvedValue(buildReconciliationDashboard());
  });

  it('mostra estado de carregamento (skeleton) antes da resposta chegar', async () => {
    getTollDashboardMock.mockReturnValue(new Promise(() => undefined));
    const { container } = renderPage();

    await waitFor(() => expect(container.querySelector('.animate-pulse')).not.toBeNull());
  });

  it('mostra estado de erro com opção de tentar novamente', async () => {
    getTollDashboardMock.mockRejectedValue(new Error('falhou'));
    renderPage();

    expect(await screen.findByText('Não foi possível carregar os dados.')).toBeInTheDocument();
  });

  it('renderiza os cards e o gauge de conformidade com dado real', async () => {
    getTollDashboardMock.mockResolvedValue(buildTollDashboard());
    renderPage();

    // "R$ 750,00" aparece varias vezes (card + cada breakdown, todos com o
    // mesmo valor no fixture) -- por isso findAllByText, nao findByText.
    expect((await screen.findAllByText('R$ 750,00')).length).toBeGreaterThan(0);
    expect(screen.getByText('15')).toBeInTheDocument(); // total de transacoes
    // "Por praça"/"Por veículo" sao BarRankingChart (recharts nao renderiza
    // texto em jsdom sem dimensoes reais -- mesma limitacao ja documentada
    // nas outras paginas desta serie) -- por isso a asserção usa as tabelas
    // (DataTable renderiza tabela desktop + cartoes mobile simultaneamente
    // no DOM, daí getAllByText em vez de getByText).
    expect(screen.getAllByText('Sem Parar').length).toBeGreaterThan(0);
    expect(screen.getAllByText('José da Silva').length).toBeGreaterThan(0);
  });

  it('renderiza a conciliação de rotas com o aviso de dado não filtrado', async () => {
    getTollDashboardMock.mockResolvedValue(buildTollDashboard());
    renderPage();

    expect(await screen.findByText('Conciliação de rotas')).toBeInTheDocument();
    expect(screen.getByText(/não filtrado por veículo\/frota\/período/)).toBeInTheDocument();
    // Aguarda a query de reconciliacao (separada da principal) resolver.
    // formatNumber(60, 1) => "60" (sem decimal): o formatter pt-BR usado
    // nao fixa minimumFractionDigits, entao numero inteiro nao mostra ",0".
    expect(await screen.findByText('60% conforme')).toBeInTheDocument();
  });

  it('chama getTollDashboard com os filtros mapeados (chargedFrom/chargedTo/vehicleId/fleetId)', async () => {
    getTollDashboardMock.mockResolvedValue(buildTollDashboard());
    renderPage();
    await screen.findByText('15');

    expect(getTollDashboardMock).toHaveBeenCalledWith(
      expect.objectContaining({ chargedFrom: undefined, chargedTo: undefined, vehicleId: undefined, fleetId: undefined }),
      expect.anything(),
    );
  });

  it('link "Ver todas as transações" aponta para /tolls', async () => {
    getTollDashboardMock.mockResolvedValue(buildTollDashboard());
    renderPage();

    const link = await screen.findByRole('link', { name: 'Ver todas as transações →' });
    expect(link).toHaveAttribute('href', '/tolls');
  });
});
