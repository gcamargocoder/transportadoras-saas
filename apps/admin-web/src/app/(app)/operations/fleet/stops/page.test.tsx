import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FleetStopsDashboardEntity } from '../../../../../types/entities';
import FleetStopsPage from './page';

const getFleetOperationsStopsMock = vi.fn();

vi.mock('../../../../../lib/api/fleet-operations.api', () => ({
  getFleetOperationsStops: (...args: unknown[]) => getFleetOperationsStopsMock(...args),
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
  return render(<FleetStopsPage />, { wrapper: Wrapper });
}

function buildStops(overrides: Partial<FleetStopsDashboardEntity> = {}): FleetStopsDashboardEntity {
  return {
    totalStops: 2,
    totalDurationMinutes: 60,
    averageDurationMinutes: 30,
    byType: [
      { type: 'FUEL', count: 1, totalDurationMinutes: 20 },
      { type: 'MEAL', count: 1, totalDurationMinutes: 40 },
    ],
    topVehiclesByDuration: [{ vehicleId: 'v1', plate: 'ABC1D23', value: 60, count: 2 }],
    monthlyTrend: Array.from({ length: 12 }, (_, i) => ({ month: `M${i}`, value: 0 })),
    ...overrides,
  };
}

describe('FleetStopsPage', () => {
  beforeEach(() => {
    getFleetOperationsStopsMock.mockReset();
  });

  it('mostra estado de carregamento (skeleton) antes da resposta chegar', async () => {
    getFleetOperationsStopsMock.mockReturnValue(new Promise(() => undefined));
    const { container } = renderPage();

    await waitFor(() => expect(container.querySelector('.animate-pulse')).not.toBeNull());
  });

  it('mostra estado de erro com opção de tentar novamente', async () => {
    getFleetOperationsStopsMock.mockRejectedValue(new Error('falhou'));
    renderPage();

    expect(await screen.findByText('Não foi possível carregar os dados.')).toBeInTheDocument();
  });

  it('renderiza os cards e o breakdown por tipo de parada traduzido em pt-BR', async () => {
    getFleetOperationsStopsMock.mockResolvedValue(buildStops());
    renderPage();

    expect(await screen.findByText('2')).toBeInTheDocument(); // total de paradas (StatCard)
    // DataTable renderiza tabela (desktop) + cartoes (mobile) simultaneamente
    // no DOM (visibilidade so por CSS) -- por isso getAllByText, nao getByText
    // (mesmo padrao ja usado em operations/page.test.tsx).
    expect(screen.getAllByText('Abastecimento').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Refeição').length).toBeGreaterThan(0);
  });

  it('mostra "—" (nunca "0 min") quando averageDurationMinutes chega null', async () => {
    getFleetOperationsStopsMock.mockResolvedValue(buildStops({ averageDurationMinutes: null }));
    renderPage();

    expect(await screen.findByText('Duração média')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('mostra mensagem vazia no ranking quando não há paradas', async () => {
    getFleetOperationsStopsMock.mockResolvedValue(
      buildStops({ topVehiclesByDuration: [], totalStops: 0, totalDurationMinutes: 0, averageDurationMinutes: null }),
    );
    renderPage();

    expect(
      await screen.findByText('Nenhum veículo com parada registrada no período/filtro selecionado.'),
    ).toBeInTheDocument();
  });
});
