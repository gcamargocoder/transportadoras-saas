import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FleetCostsEntity } from '../../../../../types/entities';
import FleetCostsPage from './page';

const getFleetOperationsCostsMock = vi.fn();

vi.mock('../../../../../lib/api/fleet-operations.api', () => ({
  getFleetOperationsCosts: (...args: unknown[]) => getFleetOperationsCostsMock(...args),
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
  return render(<FleetCostsPage />, { wrapper: Wrapper });
}

function buildCosts(overrides: Partial<FleetCostsEntity> = {}): FleetCostsEntity {
  return {
    totalCost: 3515.9,
    fuelCost: 775,
    maintenanceCost: 150,
    tireCost: 2450.9,
    tollCost: 60,
    otherCost: 80,
    costByCategory: [
      { category: 'FUEL', amount: 775 },
      { category: 'MAINTENANCE', amount: 150 },
      { category: 'TIRES', amount: 2450.9 },
      { category: 'TOLL', amount: 60 },
      { category: 'FOOD', amount: 80 },
    ],
    topVehiclesByCost: [{ vehicleId: 'v1', plate: 'ABC1D23', value: 985, count: 4 }],
    // Deliberadamente diferente de totalCost (mesmo com 1 unico veiculo os
    // dois coincidiriam na vida real) -- evita colisao de texto no teste
    // (StatCard renderiza so o valor puro, ver nota em page.test.tsx do
    // dashboard consolidado).
    averageCostPerVehicle: 1757.95,
    costByFleet: [],
    monthlyTrend: Array.from({ length: 12 }, (_, i) => ({ month: `M${i}`, value: 0 })),
    previousPeriod: null,
    costPerKm: {
      available: true,
      reason: null,
      distanceKm: 5000,
      value: 0.7,
      fuelCostPerKm: 0.15,
      maintenanceCostPerKm: 0.03,
      tireCostPerKm: 0.49,
      tollCostPerKm: 0.01,
      otherCostPerKm: 0.02,
      periodStart: null,
      periodEnd: null,
    },
    topVehiclesByCostPerKm: [{ vehicleId: 'v1', plate: 'ABC1D23', value: 0.7, count: 5000 }],
    ...overrides,
  };
}

describe('FleetCostsPage', () => {
  beforeEach(() => {
    getFleetOperationsCostsMock.mockReset();
  });

  it('mostra estado de carregamento (skeleton) antes da resposta chegar', async () => {
    getFleetOperationsCostsMock.mockReturnValue(new Promise(() => undefined));
    const { container } = renderPage();

    await waitFor(() => expect(container.querySelector('.animate-pulse')).not.toBeNull());
  });

  it('mostra estado de erro com opção de tentar novamente', async () => {
    getFleetOperationsCostsMock.mockRejectedValue(new Error('falhou'));
    renderPage();

    expect(await screen.findByText('Não foi possível carregar os dados.')).toBeInTheDocument();
  });

  it('renderiza os cards de custo e o ranking de veículos com dado real', async () => {
    getFleetOperationsCostsMock.mockResolvedValue(buildCosts());
    renderPage();

    expect(await screen.findByText('R$ 3.515,90')).toBeInTheDocument(); // custo total
    expect(screen.getByText('R$ 775,00')).toBeInTheDocument(); // combustivel
    expect(screen.getByText('Top 5 veículos por custo')).toBeInTheDocument();
  });

  it('mostra "—" (nunca "R$ 0,00") quando averageCostPerVehicle chega null', async () => {
    getFleetOperationsCostsMock.mockResolvedValue(
      buildCosts({ averageCostPerVehicle: null, topVehiclesByCost: [] }),
    );
    renderPage();

    expect(await screen.findByText('Custo médio/veículo')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('mostra mensagem vazia no gráfico de ranking quando não há veículos com custo', async () => {
    getFleetOperationsCostsMock.mockResolvedValue(buildCosts({ topVehiclesByCost: [] }));
    renderPage();

    expect(
      await screen.findByText('Nenhum veículo com custo no período/filtro selecionado.'),
    ).toBeInTheDocument();
  });

  it('renderiza o ranking por frota, incluindo o balde "Sem frota"', async () => {
    getFleetOperationsCostsMock.mockResolvedValue(
      buildCosts({
        costByFleet: [
          { fleetId: 'f1', fleetName: 'Frota SP', amount: 500 },
          { fleetId: null, fleetName: 'Sem frota', amount: 50 },
        ],
      }),
    );
    renderPage();

    expect(await screen.findByText('Frota SP')).toBeInTheDocument();
    expect(screen.getByText('Sem frota')).toBeInTheDocument();
    expect(screen.getByText('R$ 500,00')).toBeInTheDocument();
  });

  it('mostra a variação percentual vs período anterior quando presente', async () => {
    getFleetOperationsCostsMock.mockResolvedValue(
      buildCosts({ previousPeriod: { totalCost: 100, deltaAmount: 50, deltaPercent: 50 } }),
    );
    renderPage();

    expect(await screen.findByText('Vs período anterior')).toBeInTheDocument();
    expect(screen.getByText('+50%')).toBeInTheDocument();
  });

  it('mostra distância e custo/km quando disponível', async () => {
    getFleetOperationsCostsMock.mockResolvedValue(buildCosts());
    renderPage();

    expect(await screen.findByText('Custo por km')).toBeInTheDocument();
    expect(screen.getByText('5.000 km')).toBeInTheDocument();
    expect(screen.getByText('R$ 0,70/km')).toBeInTheDocument();
    expect(screen.getByText('Top 5 veículos por custo/km')).toBeInTheDocument();
  });

  it('mostra o motivo (nunca custo/km inventado) quando indisponível', async () => {
    getFleetOperationsCostsMock.mockResolvedValue(
      buildCosts({
        costPerKm: {
          available: false,
          reason: 'Nenhum veículo do escopo possui pelo menos 2 leituras de odômetro no período.',
          distanceKm: null,
          value: null,
          fuelCostPerKm: null,
          maintenanceCostPerKm: null,
          tireCostPerKm: null,
          tollCostPerKm: null,
          otherCostPerKm: null,
          periodStart: null,
          periodEnd: null,
        },
        topVehiclesByCostPerKm: [],
      }),
    );
    renderPage();

    expect(
      await screen.findByText('Nenhum veículo do escopo possui pelo menos 2 leituras de odômetro no período.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Top 5 veículos por custo/km')).not.toBeInTheDocument();
  });
});
