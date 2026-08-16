import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FleetDowntimeCostEntity } from '../../../../../types/entities';
import FleetDowntimeCostPage from './page';

const getFleetOperationsDowntimeCostMock = vi.fn();

vi.mock('../../../../../lib/api/fleet-operations.api', () => ({
  getFleetOperationsDowntimeCost: (...args: unknown[]) => getFleetOperationsDowntimeCostMock(...args),
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
  return render(<FleetDowntimeCostPage />, { wrapper: Wrapper });
}

function buildDowntimeCost(overrides: Partial<FleetDowntimeCostEntity> = {}): FleetDowntimeCostEntity {
  return {
    totalStops: 4,
    totalDowntimeMinutes: 120,
    totalEstimatedLostRevenue: { value: 1000, available: true, reason: null },
    byCategory: [
      { category: 'MAINTENANCE', durationMinutes: 60, count: 1, estimatedLostRevenue: 500 },
      { category: 'BREAKDOWN', durationMinutes: 30, count: 1, estimatedLostRevenue: 250 },
      { category: 'FUEL', durationMinutes: 20, count: 1, estimatedLostRevenue: 167 },
      { category: 'OTHER', durationMinutes: 10, count: 1, estimatedLostRevenue: 83 },
    ],
    vehicles: [
      {
        vehicleId: 'v1',
        plate: 'ABC1D23',
        totalDowntimeMinutes: 120,
        stopCount: 4,
        byCategory: [
          { category: 'MAINTENANCE', durationMinutes: 60, count: 1, estimatedLostRevenue: 500 },
          { category: 'BREAKDOWN', durationMinutes: 30, count: 1, estimatedLostRevenue: 250 },
          { category: 'FUEL', durationMinutes: 20, count: 1, estimatedLostRevenue: 167 },
          { category: 'OTHER', durationMinutes: 10, count: 1, estimatedLostRevenue: 83 },
        ],
        revenuePerHour: { value: 500, available: true, reason: null, basedOnTripCount: 2 },
        estimatedLostRevenue: { value: 1000, available: true, reason: null },
      },
    ],
    topVehiclesByLostRevenue: [{ vehicleId: 'v1', plate: 'ABC1D23', value: 1000, count: 120 }],
    topVehiclesByDowntimeMinutes: [{ vehicleId: 'v1', plate: 'ABC1D23', value: 120, count: 4 }],
    monthlyTrendDowntimeMinutes: Array.from({ length: 12 }, (_, i) => ({ month: `M${i}`, value: 0 })),
    downtimeCostAlerts: [],
    ...overrides,
  };
}

describe('FleetDowntimeCostPage', () => {
  beforeEach(() => {
    getFleetOperationsDowntimeCostMock.mockReset();
  });

  it('mostra estado de carregamento (skeleton) antes da resposta chegar', async () => {
    getFleetOperationsDowntimeCostMock.mockReturnValue(new Promise(() => undefined));
    const { container } = renderPage();

    await waitFor(() => expect(container.querySelector('.animate-pulse')).not.toBeNull());
  });

  it('mostra estado de erro com opção de tentar novamente', async () => {
    getFleetOperationsDowntimeCostMock.mockRejectedValue(new Error('falhou'));
    renderPage();

    expect(await screen.findByText('Não foi possível carregar os dados.')).toBeInTheDocument();
  });

  it('renderiza os cards e a tabela por veiculo com dado real', async () => {
    getFleetOperationsDowntimeCostMock.mockResolvedValue(buildDowntimeCost());
    renderPage();

    // "R$ 1.000,00" aparece 3x (card total, coluna da tabela, ranking) --
    // por isso findAllByText, nao findByText.
    expect((await screen.findAllByText('R$ 1.000,00')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('ABC1D23').length).toBeGreaterThan(0);
    // DataTable renderiza tabela (desktop) + cartoes (mobile) simultaneamente
    // no DOM -- por isso getAllByText, nao getByText.
    expect(screen.getAllByText('R$ 500,00').length).toBeGreaterThan(0); // taxa R$/h do veiculo
  });

  it('mostra "Indisponível" quando a receita perdida (total e por veiculo) nao esta disponivel', async () => {
    getFleetOperationsDowntimeCostMock.mockResolvedValue(
      buildDowntimeCost({
        totalEstimatedLostRevenue: { value: null, available: false, reason: 'NO_VEHICLE_WITH_REVENUE_RATE' },
        vehicles: [
          {
            vehicleId: 'v1',
            plate: 'ABC1D23',
            totalDowntimeMinutes: 60,
            stopCount: 1,
            byCategory: [
              { category: 'MAINTENANCE', durationMinutes: 60, count: 1, estimatedLostRevenue: null },
              { category: 'BREAKDOWN', durationMinutes: 0, count: 0, estimatedLostRevenue: null },
              { category: 'FUEL', durationMinutes: 0, count: 0, estimatedLostRevenue: null },
              { category: 'OTHER', durationMinutes: 0, count: 0, estimatedLostRevenue: null },
            ],
            revenuePerHour: { value: null, available: false, reason: 'INSUFFICIENT_TRIP_HISTORY', basedOnTripCount: 0 },
            estimatedLostRevenue: { value: null, available: false, reason: 'INSUFFICIENT_TRIP_HISTORY' },
          },
        ],
      }),
    );
    renderPage();

    // "Receita perdida estimada" aparece 2x (label do card + cabecalho da
    // coluna da tabela) -- por isso findAllByText, nao findByText.
    expect((await screen.findAllByText('Receita perdida estimada')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Indisponível').length).toBeGreaterThan(0);
  });

  it('mostra mensagem vazia quando não há alertas', async () => {
    getFleetOperationsDowntimeCostMock.mockResolvedValue(buildDowntimeCost({ downtimeCostAlerts: [] }));
    renderPage();

    expect(await screen.findByText('Nenhum alerta no período/filtro selecionado.')).toBeInTheDocument();
  });

  it('lista alertas com placa, mensagem e severidade traduzida', async () => {
    getFleetOperationsDowntimeCostMock.mockResolvedValue(
      buildDowntimeCost({
        downtimeCostAlerts: [
          {
            type: 'DOWNTIME_COST_OUTLIER',
            severity: 'ATTENTION',
            vehicleId: 'v1',
            plate: 'ABC1D23',
            message: 'Receita perdida estimada acima da média.',
            value: 1000,
          },
        ],
      }),
    );
    renderPage();

    expect(await screen.findByText('Receita perdida estimada acima da média.')).toBeInTheDocument();
    expect(screen.getByText('Atenção')).toBeInTheDocument();
  });
});
