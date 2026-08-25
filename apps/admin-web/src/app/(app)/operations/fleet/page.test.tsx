import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  FleetCompositionsOverviewEntity,
  FleetDowntimeCostEntity,
  FleetFuelAnalyticsEntity,
  FleetOperationalIndicatorsEntity,
  FleetOperationsDashboardEntity,
  TollDashboardEntity,
} from '../../../../types/entities';
import FleetOperationsDashboardPage from './page';

const getFleetOperationsDashboardMock = vi.fn();
const getFleetOperationsIndicatorsMock = vi.fn();
const getFleetOperationsFuelMock = vi.fn();
const getFleetOperationsDowntimeCostMock = vi.fn();
const getFleetOperationsCompositionsMock = vi.fn();
const getTollDashboardMock = vi.fn();

vi.mock('../../../../lib/api/fleet-operations.api', () => ({
  getFleetOperationsDashboard: (...args: unknown[]) => getFleetOperationsDashboardMock(...args),
  getFleetOperationsIndicators: (...args: unknown[]) => getFleetOperationsIndicatorsMock(...args),
  getFleetOperationsDowntimeCost: (...args: unknown[]) => getFleetOperationsDowntimeCostMock(...args),
  getFleetOperationsFuel: (...args: unknown[]) => getFleetOperationsFuelMock(...args),
  getFleetOperationsCompositions: (...args: unknown[]) => getFleetOperationsCompositionsMock(...args),
}));

vi.mock('../../../../lib/api/fleet.api', () => ({
  listVehicles: () => Promise.resolve({ items: [] }),
  listFleets: () => Promise.resolve({ items: [] }),
}));

vi.mock('../../../../lib/api/tolls.api', () => ({
  getTollDashboard: (...args: unknown[]) => getTollDashboardMock(...args),
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
      suspendedVehicles: 0,
      maintenanceVehicles: 1,
      soldVehicles: 0,
      activeTrips: 3,
      vehiclesOnTrip: 6,
      vehiclesAvailable: 2,
      activeDrivers: 5,
      openAlerts: 4,
      openOccurrences: 61,
      criticalOpenOccurrences: 62,
      resolvedOccurrences: 63,
      cancelledOccurrences: 64,
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
      costPerKm: {
        available: false,
        reason: 'Sem dados suficientes.',
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
      cancelledCount: 0,
      scheduledCount: 1,
      lateWorkOrdersCount: 0,
      preventiveCount: 5,
      correctiveCount: 47,
      totalCost: 4000,
      laborCostTotal: 2500,
      partsCostTotal: 1500,
      averageCostPerOccurrence: 800,
      averageDurationHours: 6,
      totalDowntimeMinutes: 300,
      averageDowntimeMinutes: 100,
      costPerKm: { value: null, available: false, reason: 'INSUFFICIENT_ODOMETER_READINGS' },
      overdueCount: 2,
      dueSoonCount: 1,
      byType: [],
      byPriority: [],
      byWorkshop: [],
      byComponent: [],
      topVehiclesByCost: [],
      bottomVehiclesByCost: [],
      topVehiclesByCount: [],
      topVehiclesByDowntime: [],
      topComponentsByCost: [],
      topComponentsByCount: [],
      overdueMaintenances: [],
      upcomingMaintenances: [],
      maintenanceAlerts: [],
      monthlyTrend: [],
    },
    stops: {
      totalStops: 30,
      totalDurationMinutes: 360,
      averageDurationMinutes: 30,
      maxDurationMinutes: 90,
      minDurationMinutes: 5,
      byType: [],
      topVehiclesByDuration: [],
      driverRanking: [],
      durationAlerts: [],
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
      plannedTrips: 0,
      waitingDriverTrips: 0,
      waitingDepartureTrips: 0,
      pausedTrips: 0,
      tripsWithoutDriver: 0,
      tripsWithoutVehicle: 0,
      delayedTrips: 0,
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
    plannedTrips: 51,
    waitingDriverTrips: 52,
    waitingDepartureTrips: 53,
    pausedTrips: 54,
    tripsWithoutDriver: 55,
    tripsWithoutVehicle: 56,
    delayedTrips: 57,
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
    tankLevels: [],
    tankFleetAverage: { value: null, available: false, reason: 'NO_VEHICLE_WITH_TANK_DATA' },
    ...overrides,
  };
}

function buildDowntimeCost(overrides: Partial<FleetDowntimeCostEntity> = {}): FleetDowntimeCostEntity {
  return {
    totalStops: 7,
    totalDowntimeMinutes: 420,
    totalEstimatedLostRevenue: { value: 3500, available: true, reason: null },
    byCategory: [
      { category: 'MAINTENANCE', durationMinutes: 200, count: 3, estimatedLostRevenue: 1500 },
      { category: 'BREAKDOWN', durationMinutes: 100, count: 1, estimatedLostRevenue: 800 },
      { category: 'FUEL', durationMinutes: 80, count: 2, estimatedLostRevenue: 700 },
      { category: 'OTHER', durationMinutes: 40, count: 1, estimatedLostRevenue: 500 },
    ],
    vehicles: [],
    topVehiclesByLostRevenue: [{ vehicleId: 'v1', plate: 'DWN1T23', value: 3500, count: 420 }],
    topVehiclesByDowntimeMinutes: [{ vehicleId: 'v1', plate: 'DWN1T23', value: 420, count: 7 }],
    monthlyTrendDowntimeMinutes: Array.from({ length: 12 }, (_, i) => ({ month: `M${i}`, value: 0 })),
    downtimeCostAlerts: [],
    ...overrides,
  };
}

function buildTollDashboard(overrides: Partial<TollDashboardEntity> = {}): TollDashboardEntity {
  return {
    // "37"/"13" escolhidos para nao colidir com nenhuma outra contagem
    // simples ja usada nos outros fixtures desta pagina (ver comentario
    // de buildDashboard acima sobre StatCard/getByText).
    totalCount: 37,
    totalChargedAmount: 940,
    totalExpectedAmount: 850,
    totalDiscrepancyAmount: 50,
    countByStatus: [],
    countByProvider: [],
    countByVehicle: [],
    countByDriver: [],
    countByPlaza: [],
    conferredCount: 10,
    unverifiableCount: 2,
    correctCount: 9,
    overchargeCount: 13,
    underchargeCount: 0,
    conformityPercentage: 90,
    monthlyTrendChargedAmount: Array.from({ length: 12 }, (_, i) => ({ month: `M${i}`, value: 0 })),
    ...overrides,
  };
}

function buildCompositionsOverview(overrides: Partial<FleetCompositionsOverviewEntity> = {}): FleetCompositionsOverviewEntity {
  return {
    // "44"/"42"/"29"/"33" escolhidos para nao colidir com nenhuma outra
    // contagem simples ja usada nos outros fixtures desta pagina.
    totalTrailers: 44,
    activeCount: 42,
    inactiveCount: 2,
    trailersOnTrip: 29,
    trailersAvailable: 33,
    byType: [],
    axleCategoryBreakdown: [],
    topTrailersByTripCount: [],
    topTrailersByInUseMinutes: [],
    trailers: [],
    monthlyTrendTripCount: Array.from({ length: 12 }, (_, i) => ({ month: `M${i}`, value: 0 })),
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
    getFleetOperationsDowntimeCostMock.mockReset();
    getFleetOperationsDowntimeCostMock.mockResolvedValue(buildDowntimeCost());
    getTollDashboardMock.mockReset();
    getTollDashboardMock.mockResolvedValue(buildTollDashboard());
    getFleetOperationsCompositionsMock.mockReset();
    getFleetOperationsCompositionsMock.mockResolvedValue(buildCompositionsOverview());
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
    // Custo medio/viagem -- aguarda pois "R$ 900,00" tambem depende da
    // tollsQuery (query separada) resolver antes de checar unicidade.
    expect(await screen.findByText('R$ 900,00')).toBeInTheDocument();
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

  it('renderiza a secao "Tempo parado e receita perdida" com link para /operations/fleet/downtime-cost', async () => {
    getFleetOperationsDashboardMock.mockResolvedValue(buildDashboard());
    renderPage();

    expect(await screen.findByText('Tempo parado e receita perdida')).toBeInTheDocument();
    expect(screen.getByText('420 min')).toBeInTheDocument();
    expect(screen.getByText('R$ 3.500,00')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'Ver detalhes →' });
    expect(links.some((link) => link.getAttribute('href') === '/operations/fleet/downtime-cost')).toBe(true);
  });

  it('mostra "Indisponível" quando a receita perdida total nao esta disponivel', async () => {
    getFleetOperationsDashboardMock.mockResolvedValue(buildDashboard());
    getFleetOperationsDowntimeCostMock.mockResolvedValue(
      buildDowntimeCost({ totalEstimatedLostRevenue: { value: null, available: false, reason: 'NO_VEHICLE_WITH_REVENUE_RATE' } }),
    );
    renderPage();

    expect(await screen.findByText('Tempo parado e receita perdida')).toBeInTheDocument();
    expect(screen.getByText('Indisponível')).toBeInTheDocument();
  });

  it('renderiza a secao "Pedágios" com link para /operations/fleet/tolls', async () => {
    getFleetOperationsDashboardMock.mockResolvedValue(buildDashboard());
    renderPage();

    expect(await screen.findByText('Pedágios')).toBeInTheDocument();
    // "37"/"R$ 940,00" dependem da tollsQuery (query separada) -- aguarda
    // resolver em vez de checar de forma sincrona.
    expect(await screen.findByText('37')).toBeInTheDocument();
    expect(screen.getByText('R$ 940,00')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'Ver detalhes →' });
    expect(links.some((link) => link.getAttribute('href') === '/operations/fleet/tolls')).toBe(true);
  });

  it('renderiza a secao "Composição" com link para /operations/fleet/compositions', async () => {
    getFleetOperationsDashboardMock.mockResolvedValue(buildDashboard());
    renderPage();

    expect(await screen.findByText('Composição')).toBeInTheDocument();
    // "44" depende da compositionsQuery (query separada) -- aguarda resolver
    // em vez de checar de forma sincrona.
    expect(await screen.findByText('44')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('29')).toBeInTheDocument();
    expect(screen.getByText('33')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'Ver detalhes →' });
    expect(links.some((link) => link.getAttribute('href') === '/operations/fleet/compositions')).toBe(true);
  });

  it('link "Ver detalhes" do card Pneus aponta para /operations/fleet/tires', async () => {
    getFleetOperationsDashboardMock.mockResolvedValue(buildDashboard());
    renderPage();

    const links = await screen.findAllByRole('link', { name: 'Ver detalhes →' });
    expect(links.some((link) => link.getAttribute('href') === '/operations/fleet/tires')).toBe(true);
  });

  it('link "Ver detalhes" da secao Visao geral aponta para /operations/fleet/vehicles', async () => {
    getFleetOperationsDashboardMock.mockResolvedValue(buildDashboard());
    renderPage();

    const links = await screen.findAllByRole('link', { name: 'Ver detalhes →' });
    expect(links.some((link) => link.getAttribute('href') === '/operations/fleet/vehicles')).toBe(true);
  });

  it('renderiza o gauge de nivel medio de tanque quando disponivel', async () => {
    getFleetOperationsDashboardMock.mockResolvedValue(buildDashboard());
    getFleetOperationsFuelMock.mockResolvedValue(
      buildFuelAnalytics({ tankFleetAverage: { value: 62, available: true, reason: null } }),
    );
    renderPage();

    expect(await screen.findByText('Nível médio')).toBeInTheDocument();
    expect(screen.getByText('62%')).toBeInTheDocument();
  });
});
