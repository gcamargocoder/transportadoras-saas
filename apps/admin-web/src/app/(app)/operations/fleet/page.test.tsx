import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FleetFuelAnalyticsEntity, FleetOperationalIndicatorsEntity, FleetOperationsDashboardEntity } from '../../../../types/entities';
import FleetOperationsDashboardPage from './page';

const getFleetOperationsDashboardMock = vi.fn();
const getFleetOperationsIndicatorsMock = vi.fn();
const getFleetOperationsFuelMock = vi.fn();

vi.mock('../../../../lib/api/fleet-operations.api', () => ({
  getFleetOperationsDashboard: (...args: unknown[]) => getFleetOperationsDashboardMock(...args),
  getFleetOperationsIndicators: (...args: unknown[]) => getFleetOperationsIndicatorsMock(...args),
  getFleetOperationsFuel: (...args: unknown[]) => getFleetOperationsFuelMock(...args),
}));

vi.mock('../../../../lib/api/fleet.api', () => ({
  listVehicles: () => Promise.resolve({ items: [] }),
  listFleets: () => Promise.resolve({ items: [] }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return render(<FleetOperationsDashboardPage />, { wrapper: Wrapper });
}

// Cada contagem simples (sem moeda/barra) exibida nesta pagina precisa ser
// unica no fixture -- StatCard renderiza so o numero puro, e getByText
// falha com "multiplos elementos" se dois cards coincidirem.
function buildDashboard(overrides: Partial<FleetOperationsDashboardEntity> = {}): FleetOperationsDashboardEntity {
  return {
    overview: {
      totalVehicles: 10,
      activeVehicles: 8,
      inactiveVehicles: 1,
      maintenanceVehicles: 1,
      soldVehicles: 0,
      activeTrips: 3,
      vehiclesOnTrip: 6,
      vehiclesAvailable: 2,
      activeDrivers: 5,
      openAlerts: 4,
    },
    costs: {
      totalCost: 15000,
      fuelCost: 8000,
      maintenanceCost: 4000,
      tireCost: 2000,
      tollCost: 800,
      otherCost: 200,
      costByCategory: [],
      topVehiclesByCost: [],
      averageCostPerVehicle: 1500,
      costByFleet: [],
      monthlyTrend: [],
      previousPeriod: null,
    },
    fuel: {
      suppliesCount: 20,
      totalLiters: 3000,
      totalAmount: 8000,
      averageConsumptionKmL: 2.8,
      costPerKm: 1.2,
      mostUsedStation: null,
      topVehicle: null,
      topDriver: null,
    },
    tires: {
      countByStatus: [],
      stockCount: 21,
      inUseCount: 20,
      scrappedCount: 1,
      retreadedTiresCount: 2,
      investedValue: 2000,
      retreadValue: 500,
      averageLifespanKm: 80000,
      averageMileageKm: 40000,
      nearReplacementCount: 22,
    },
    maintenance: {
      totalCount: 9,
      openCount: 6,
      completedCount: 3,
      totalCost: 4000,
      averageCostPerOccurrence: 800,
      averageDurationHours: 6,
      byType: [],
      byPriority: [],
      byWorkshop: [],
      topVehiclesByCost: [],
      topVehiclesByCount: [],
      monthlyTrend: [],
    },
    stops: {
      totalStops: 30,
      totalDurationMinutes: 360,
      averageDurationMinutes: 30,
      byType: [],
      topVehiclesByDuration: [],
      monthlyTrend: [],
    },
    checklist: {
      totalExecutions: 23,
      completedExecutions: 24,
      pendingExecutions: 25,
      criticalNonConformityCount: 26,
    },
    operational: {
      completedTrips: 0,
      inProgressTrips: 0,
      cancelledTrips: 0,
      averageTripDurationMinutes: null,
      averageCostPerTrip: null,
      utilizationPercent: null,
      topVehiclesByTripCount: [],
    },
    alerts: [],
    ...overrides,
  };
}

function buildOperational(overrides: Partial<FleetOperationalIndicatorsEntity> = {}): FleetOperationalIndicatorsEntity {
  return {
    completedTrips: 17,
    inProgressTrips: 18,
    cancelledTrips: 19,
    averageTripDurationMinutes: 45,
    averageCostPerTrip: 900,
    utilizationPercent: 12.5,
    topVehiclesByTripCount: [],
    ...overrides,
  };
}

function buildFuelAnalytics(overrides: Partial<FleetFuelAnalyticsEntity> = {}): FleetFuelAnalyticsEntity {
  return {
    summary: {
      totalCost: 8000,
      totalLiters: 3000,
      supplyCount: 20,
      averagePricePerLiter: 2.67,
      averageCostPerSupply: 400,
      vehiclesSupplied: 5,
      fleetsSupplied: 2,
    },
    consumption: { value: 2.8, available: true, unit: 'km/l', reason: null },
    costPerKm: { value: 1.2, available: true, reason: null },
    monthlyTrendCost: [],
    monthlyTrendLiters: [],
    monthlyTrendSupplyCount: [],
    vehicleBreakdown: [],
    fleetBreakdown: [],
    rankings: {
      topCost: [],
      bottomCost: [],
      topVolume: [],
      bottomVolume: [],
      bestConsumption: [],
      worstConsumption: [],
      topPricePerLiter: [],
      topSupplyCount: [],
    },
    alerts: [],
    previousPeriod: null,
    ...overrides,
  };
}

describe('FleetOperationsDashboardPage', () => {
  beforeEach(() => {
    getFleetOperationsDashboardMock.mockReset();
    getFleetOperationsIndicatorsMock.mockReset();
    getFleetOperationsFuelMock.mockReset();
    getFleetOperationsIndicatorsMock.mockResolvedValue(buildOperational());
    getFleetOperationsFuelMock.mockResolvedValue(buildFuelAnalytics());
  });

  it('mostra estado de carregamento (skeleton) antes da resposta chegar', async () => {
    getFleetOperationsDashboardMock.mockReturnValue(new Promise(() => undefined));
    const { container } = renderPage();

    await waitFor(() => expect(container.querySelector('.animate-pulse')).not.toBeNull());
  });

  it('mostra estado de erro com opção de tentar novamente', async () => {
    getFleetOperationsDashboardMock.mockRejectedValue(new Error('falhou'));
    renderPage();

    expect(await screen.findByText('Não foi possível carregar os dados.')).toBeInTheDocument();
  });

  it('renderiza KPIs, custos e operação com dado real', async () => {
    getFleetOperationsDashboardMock.mockResolvedValue(buildDashboard());
    renderPage();

    expect(await screen.findByText('8 / 10')).toBeInTheDocument(); // veiculos ativos/total
    expect(screen.getByText('R$ 15.000,00')).toBeInTheDocument(); // custo total
    expect(screen.getByText('4')).toBeInTheDocument(); // alertas em aberto
    expect(screen.getByText('26')).toBeInTheDocument(); // checklist nao-conformidades

    // Operacao (query separada).
    expect(await screen.findByText('17')).toBeInTheDocument(); // completedTrips
    expect(screen.getByText('45 min')).toBeInTheDocument(); // tempo medio de viagem
    expect(screen.getByText('R$ 900,00')).toBeInTheDocument(); // custo medio/viagem
  });

  it('nunca renderiza "R$ 0,00"/"0%" quando um indicador chega null do backend (mostra "—")', async () => {
    getFleetOperationsDashboardMock.mockResolvedValue(buildDashboard());
    getFleetOperationsIndicatorsMock.mockResolvedValue(
      buildOperational({ averageTripDurationMinutes: null, averageCostPerTrip: null, utilizationPercent: null }),
    );
    renderPage();

    expect(await screen.findByText('Custo médio/veículo')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('mostra mensagem vazia quando não há alertas', async () => {
    getFleetOperationsDashboardMock.mockResolvedValue(buildDashboard({ alerts: [] }));
    renderPage();

    expect(await screen.findByText('Nenhum alerta no período/filtro selecionado.')).toBeInTheDocument();
  });

  it('lista alertas com placa, mensagem e severidade traduzida', async () => {
    getFleetOperationsDashboardMock.mockResolvedValue(
      buildDashboard({
        alerts: [
          {
            type: 'STALLED_VEHICLE',
            severity: 'CRITICAL',
            vehicleId: 'v1',
            plate: 'ABC1D23',
            message: 'Parada em aberto ha 300 minutos.',
            value: 300,
          },
        ],
      }),
    );
    renderPage();

    expect(await screen.findByText('ABC1D23')).toBeInTheDocument();
    expect(screen.getByText('Parada em aberto ha 300 minutos.')).toBeInTheDocument();
    expect(screen.getByText('Crítico')).toBeInTheDocument();
  });

  it('renderiza o resumo de abastecimento (endpoint proprio) com link para a pagina de detalhes', async () => {
    getFleetOperationsDashboardMock.mockResolvedValue(buildDashboard());
    renderPage();

    expect(await screen.findByText('2,8 km/L')).toBeInTheDocument(); // consumo medio
    expect(screen.getByText('R$ 1,20')).toBeInTheDocument(); // custo de combustivel/km
    const links = screen.getAllByRole('link', { name: 'Ver detalhes →' });
    expect(links.some((link) => link.getAttribute('href') === '/operations/fleet/fuel')).toBe(true);
  });

  it('mostra "Indisponivel" (nunca R$ 0,00) quando consumo/custo por km de combustivel nao estao disponiveis', async () => {
    getFleetOperationsDashboardMock.mockResolvedValue(buildDashboard());
    getFleetOperationsFuelMock.mockResolvedValue(
      buildFuelAnalytics({
        consumption: { value: null, available: false, unit: 'km/l', reason: 'INSUFFICIENT_ODOMETER_READINGS' },
        costPerKm: { value: null, available: false, reason: 'INSUFFICIENT_ODOMETER_READINGS' },
      }),
    );
    renderPage();

    expect(await screen.findByText('Consumo médio')).toBeInTheDocument();
    expect(screen.getAllByText('Indisponível').length).toBe(2);
  });

  it('renderiza o ranking de veiculos por custo total', async () => {
    getFleetOperationsDashboardMock.mockResolvedValue(
      buildDashboard({
        costs: {
          ...buildDashboard().costs,
          topVehiclesByCost: [{ vehicleId: 'v1', plate: 'XYZ9A88', value: 5000, count: 3 }],
        },
      }),
    );
    renderPage();

    expect(await screen.findByText('Top custo total')).toBeInTheDocument();
    expect(screen.getByText(/XYZ9A88/)).toBeInTheDocument();
  });
});
