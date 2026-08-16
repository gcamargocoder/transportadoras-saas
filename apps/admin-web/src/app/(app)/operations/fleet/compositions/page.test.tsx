import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FleetCompositionsOverviewEntity } from '../../../../../types/entities';
import FleetCompositionsPage from './page';

const getFleetOperationsCompositionsMock = vi.fn();

vi.mock('../../../../../lib/api/fleet-operations.api', () => ({
  getFleetOperationsCompositions: (...args: unknown[]) => getFleetOperationsCompositionsMock(...args),
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
  return render(<FleetCompositionsPage />, { wrapper: Wrapper });
}

function buildCompositionsOverview(overrides: Partial<FleetCompositionsOverviewEntity> = {}): FleetCompositionsOverviewEntity {
  return {
    totalTrailers: 12,
    activeCount: 10,
    inactiveCount: 2,
    trailersOnTrip: 3,
    trailersAvailable: 7,
    byType: [{ type: 'SIMPLE', count: 8 }, { type: 'BITREM', count: 4 }],
    axleCategoryBreakdown: [{ billableCategory: '6 eixos', totalAxles: 6, count: 5 }],
    topTrailersByTripCount: [{ trailerId: 't1', plate: 'ABC1D23', type: 'SIMPLE', value: 9, count: 9 }],
    topTrailersByInUseMinutes: [{ trailerId: 't1', plate: 'ABC1D23', type: 'SIMPLE', value: 540, count: 9 }],
    trailers: [{ trailerId: 't1', plate: 'ABC1D23', type: 'SIMPLE', inUseMinutes: 540, downtimeMinutes: 45, tripCount: 9 }],
    monthlyTrendTripCount: Array.from({ length: 12 }, (_, i) => ({ month: `M${i}`, value: 0 })),
    ...overrides,
  };
}

describe('FleetCompositionsPage', () => {
  beforeEach(() => {
    getFleetOperationsCompositionsMock.mockReset();
  });

  it('mostra estado de carregamento (skeleton) antes da resposta chegar', async () => {
    getFleetOperationsCompositionsMock.mockReturnValue(new Promise(() => undefined));
    const { container } = renderPage();

    await waitFor(() => expect(container.querySelector('.animate-pulse')).not.toBeNull());
  });

  it('mostra estado de erro com opção de tentar novamente', async () => {
    getFleetOperationsCompositionsMock.mockRejectedValue(new Error('falhou'));
    renderPage();

    expect(await screen.findByText('Não foi possível carregar os dados.')).toBeInTheDocument();
  });

  it('renderiza os cards, o breakdown por tipo e a tabela de tempo parado vs. em uso', async () => {
    getFleetOperationsCompositionsMock.mockResolvedValue(buildCompositionsOverview());
    renderPage();

    expect(await screen.findByText('12')).toBeInTheDocument(); // total de carretas
    expect(screen.getByText('10')).toBeInTheDocument(); // ativas
    expect(screen.getByText('3')).toBeInTheDocument(); // em viagem
    expect(screen.getByText('7')).toBeInTheDocument(); // disponiveis
    // DataTable renderiza tabela desktop + cartoes mobile simultaneamente no
    // DOM -- por isso getAllByText em vez de getByText para todo conteudo
    // vindo da tabela.
    expect(screen.getAllByText('ABC1D23').length).toBeGreaterThan(0);
    expect(screen.getAllByText('540 min').length).toBeGreaterThan(0);
    expect(screen.getAllByText('45 min').length).toBeGreaterThan(0);
  });

  it('mostra o aviso de limitacoes conhecidas (tempo parado so com viagem, sem divisao em bitrem/rodotrem)', async () => {
    getFleetOperationsCompositionsMock.mockResolvedValue(buildCompositionsOverview());
    renderPage();

    expect(await screen.findByText(/Limitações conhecidas/)).toBeInTheDocument();
  });

  it('chama getFleetOperationsCompositions com os filtros mapeados (startDate/endDate/vehicleId/fleetId)', async () => {
    getFleetOperationsCompositionsMock.mockResolvedValue(buildCompositionsOverview());
    renderPage();
    await screen.findByText('12');

    expect(getFleetOperationsCompositionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: undefined, endDate: undefined, vehicleId: undefined, fleetId: undefined }),
      expect.anything(),
    );
  });

  it('link "Ver todas as carretas" aponta para /trailers', async () => {
    getFleetOperationsCompositionsMock.mockResolvedValue(buildCompositionsOverview());
    renderPage();

    const link = await screen.findByRole('link', { name: 'Ver todas as carretas →' });
    expect(link).toHaveAttribute('href', '/trailers');
  });
});
