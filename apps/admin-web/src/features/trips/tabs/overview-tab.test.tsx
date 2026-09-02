import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/ui/toast';
import type {
  ConsolidatedLegEntity,
  TripEntity,
  TripFinancialResultEntity,
  TripReturnConsolidationEntity,
} from '../../../types/entities';
import { OverviewTab } from './overview-tab';

const getTripSummaryMock = vi.fn();
const getTripMetricsMock = vi.fn();
const getTripReturnConsolidationMock = vi.fn();
const updateTripMock = vi.fn();
const updateTripStatusMock = vi.fn();
const listTollRoutesMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock('../../../lib/api/trips.api', () => ({
  getTripSummary: (...args: unknown[]) => getTripSummaryMock(...args),
  getTripMetrics: (...args: unknown[]) => getTripMetricsMock(...args),
  getTripReturnConsolidation: (...args: unknown[]) => getTripReturnConsolidationMock(...args),
  updateTrip: (...args: unknown[]) => updateTripMock(...args),
  updateTripStatus: (...args: unknown[]) => updateTripStatusMock(...args),
}));

vi.mock('../../../lib/api/toll-routes.api', () => ({
  listTollRoutes: (...args: unknown[]) => listTollRoutesMock(...args),
}));

vi.mock('../../../hooks/use-auth', () => ({
  useAuth: () => useAuthMock(),
}));

function renderTab(trip: TripEntity) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ToastProvider>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ToastProvider>
    );
  }
  return render(<OverviewTab trip={trip} />, { wrapper: Wrapper });
}

function buildTrip(overrides: Partial<TripEntity> = {}): TripEntity {
  return {
    id: 'trip-1',
    tenantId: 't1',
    customerId: null,
    customerName: null,
    driverId: 'driver-1',
    driverName: 'José da Silva',
    originLocationId: 'loc-origin',
    originName: 'Catanduva/SP',
    destinationLocationId: 'loc-dest',
    destinationName: 'São Paulo/SP',
    compositionId: 'comp-1',
    vehiclePlate: 'ABC1D23',
    tollRouteId: null,
    tollRouteName: null,
    status: 'PLANNED',
    priority: 'NORMAL',
    notes: null,
    plannedDeparture: '2026-09-01T08:00:00.000Z',
    plannedArrival: '2026-09-02T18:00:00.000Z',
    actualDeparture: null,
    actualArrival: null,
    loadStatus: null,
    plannedLoadStatus: null,
    previousTripId: null,
    previousTrip: null,
    initialOdometerKm: null,
    currentOdometerKm: null,
    defaultAxles: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildFinancialResult(overrides: Partial<TripFinancialResultEntity> = {}): TripFinancialResultEntity {
  return {
    tripId: 'trip-x',
    contractedRevenue: null,
    invoicedRevenue: 0,
    receivedRevenue: 0,
    fuelCost: 0,
    tollCost: 0,
    expenseCost: 0,
    totalCost: 0,
    operatingResult: null,
    invoicedResult: 0,
    receivedResult: 0,
    profitMarginPercent: null,
    invoicedMarginPercent: null,
    receivedMarginPercent: null,
    distanceKm: null,
    revenuePerKm: null,
    costPerKm: null,
    profitPerKm: null,
    ...overrides,
  };
}

function buildLeg(overrides: Partial<ConsolidatedLegEntity> = {}): ConsolidatedLegEntity {
  return {
    tripId: 'trip-leg',
    role: 'RETURN',
    status: 'COMPLETED',
    originName: 'São Paulo/SP',
    destinationName: 'Catanduva/SP',
    plannedDeparture: '2026-09-05T08:00:00.000Z',
    actualDeparture: '2026-09-05T08:10:00.000Z',
    actualArrival: '2026-09-06T18:00:00.000Z',
    previousTripId: 'trip-1',
    loadStatus: null,
    plannedLoadStatus: null,
    loadCondition: 'UNKNOWN',
    financialResult: buildFinancialResult(),
    ...overrides,
  };
}

function buildConsolidation(
  overrides: Partial<TripReturnConsolidationEntity> = {},
): TripReturnConsolidationEntity {
  return {
    outboundTripId: 'trip-1',
    legCount: 1,
    returnLegCount: 0,
    outbound: buildLeg({ tripId: 'trip-1', role: 'OUTBOUND', previousTripId: null }),
    returns: [],
    totalCompletedDistanceKm: null,
    totalCost: 0,
    totalContractedRevenue: null,
    totalInvoicedRevenue: 0,
    totalReceivedRevenue: 0,
    consolidatedOperatingResult: null,
    consolidatedInvoicedResult: 0,
    consolidatedReceivedResult: 0,
    legsWithContractedRevenue: 0,
    revenueComplete: true,
    ...overrides,
  };
}

// Fase D -- carga real (loadStatus, largada) x intencao planejada
// (plannedLoadStatus) x vinculo explicito ida -> retorno (previousTrip),
// exibidos na aba "Visão geral" da viagem. Nunca confundir planejado com
// realizado.
describe('OverviewTab -- Fase D (carga real/planejada + retorno)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ user: { role: 'ADMIN' } });
    getTripSummaryMock.mockResolvedValue({} as never);
    getTripMetricsMock.mockResolvedValue(null);
    getTripReturnConsolidationMock.mockResolvedValue(buildConsolidation());
    listTollRoutesMock.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pageSize: 100, totalPages: 0 } });
  });

  it('sem vinculo: nao mostra o indicador de retorno; carga real e planejada aparecem como "-"', () => {
    renderTab(buildTrip());

    expect(screen.queryByText(/Retorno da viagem/i)).toBeNull();
    expect(screen.getByText('Carga (real, na largada)')).toBeTruthy();
    expect(screen.getByText('Carga planejada')).toBeTruthy();
    // Ambos os valores caem no mesmo "-" quando nulos -- ainda assim os
    // dois campos existem e sao rotulados de forma distinta (nunca um so
    // campo "Carga").
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(2);
  });

  it('carga real (loadStatus) e carga planejada (plannedLoadStatus) sao exibidas separadamente, mesmo quando divergem', () => {
    // Exemplo do pedido: plannedLoadStatus=EMPTY (escritorio planejou vazio)
    // e loadStatus=LOADED (motorista saiu carregado) -- os dois aparecem,
    // sem nenhuma correcao/fusao visual.
    renderTab(buildTrip({ loadStatus: 'LOADED', plannedLoadStatus: 'EMPTY' }));

    const cargaReal = screen.getByText('Carga (real, na largada)').nextSibling as HTMLElement;
    const cargaPlanejada = screen.getByText('Carga planejada').nextSibling as HTMLElement;
    expect(cargaReal.textContent).toBe('Carregado');
    expect(cargaPlanejada.textContent).toBe('Vazio');
  });

  it('com vinculo (previousTrip): mostra "↩ Retorno da viagem X → Y" linkando para a ida', () => {
    renderTab(
      buildTrip({
        previousTripId: 'trip-ida-1',
        previousTrip: {
          id: 'trip-ida-1',
          status: 'COMPLETED',
          originName: 'São Paulo/SP',
          destinationName: 'Catanduva/SP',
          plannedDeparture: '2026-08-20T08:00:00.000Z',
          loadStatus: 'LOADED',
          plannedLoadStatus: null,
        },
      }),
    );

    const link = screen.getByText(/↩ Retorno da viagem São Paulo\/SP → Catanduva\/SP/i);
    expect(link).toBeTruthy();
    expect(link.closest('a')).toHaveAttribute('href', '/trips/trip-ida-1');
  });
});

// Fase E -- card "Operação ida + retorno": consolidação DERIVADA e
// somente-leitura. Só aparece quando há retornos vinculados OU quando a
// própria viagem é retorno de outra. Financeiro por perna vem de
// /financial-result; agregados só somam valores existentes.
describe('OverviewTab -- Fase E (consolidação ida + retorno)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ user: { role: 'ADMIN' } });
    getTripSummaryMock.mockResolvedValue({} as never);
    getTripMetricsMock.mockResolvedValue(null);
    listTollRoutesMock.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pageSize: 100, totalPages: 0 } });
  });

  it('ida sem retorno: o card de consolidação NÃO aparece', async () => {
    getTripReturnConsolidationMock.mockResolvedValue(buildConsolidation());
    renderTab(buildTrip());

    // dá tempo da query resolver
    await screen.findByText('Dados da viagem');
    expect(screen.queryByText('Operação ida + retorno')).toBeNull();
  });

  it('ida com retornos: mostra o card, os agregados e uma linha por perna com link', async () => {
    getTripReturnConsolidationMock.mockResolvedValue(
      buildConsolidation({
        legCount: 2,
        returnLegCount: 1,
        outbound: buildLeg({
          tripId: 'trip-1',
          role: 'OUTBOUND',
          previousTripId: null,
          originName: 'Catanduva/SP',
          destinationName: 'São Paulo/SP',
          loadCondition: 'LOADED',
          loadStatus: 'LOADED',
          financialResult: buildFinancialResult({ totalCost: 3000, contractedRevenue: 5000, operatingResult: 2000 }),
        }),
        returns: [
          buildLeg({
            tripId: 'trip-2',
            role: 'RETURN',
            previousTripId: 'trip-1',
            loadCondition: 'EMPTY',
            loadStatus: 'EMPTY',
            financialResult: buildFinancialResult({ totalCost: 1200, contractedRevenue: 800, operatingResult: -400 }),
          }),
        ],
        totalCompletedDistanceKm: 820,
        totalCost: 4200,
        totalContractedRevenue: 5800,
        consolidatedOperatingResult: 1600,
        legsWithContractedRevenue: 2,
        revenueComplete: true,
      }),
    );
    renderTab(buildTrip());

    expect(await screen.findByText('Operação ida + retorno')).toBeInTheDocument();
    expect(screen.getByText('2 (1 ida + 1 retorno(s))')).toBeInTheDocument();
    expect(screen.getByText('820 km')).toBeInTheDocument();
    expect(screen.getByText('Ida')).toBeInTheDocument();
    expect(screen.getByText('Retorno')).toBeInTheDocument();
    // link para cada Trip individual
    const idaLink = screen.getByText('Catanduva/SP → São Paulo/SP');
    expect(idaLink.closest('a')).toHaveAttribute('href', '/trips/trip-1');
    const returnLinks = screen.getAllByText('São Paulo/SP → Catanduva/SP');
    expect(returnLinks[0]!.closest('a')).toHaveAttribute('href', '/trips/trip-2');
  });

  it('carga real e planejada aparecem SEPARADAS por perna (loadCondition vem só de loadStatus real)', async () => {
    getTripReturnConsolidationMock.mockResolvedValue(
      buildConsolidation({
        legCount: 2,
        returnLegCount: 1,
        outbound: buildLeg({ tripId: 'trip-1', role: 'OUTBOUND', previousTripId: null, loadCondition: 'LOADED', loadStatus: 'LOADED' }),
        returns: [
          buildLeg({
            tripId: 'trip-2',
            role: 'RETURN',
            previousTripId: 'trip-1',
            // motorista saiu CARREGADO, escritório havia planejado VAZIO
            loadStatus: 'LOADED',
            loadCondition: 'LOADED',
            plannedLoadStatus: 'EMPTY',
          }),
        ],
      }),
    );
    renderTab(buildTrip());

    await screen.findByText('Operação ida + retorno');
    expect(screen.getByText(/Carga real: Carregado · Planejado: Vazio/)).toBeInTheDocument();
  });

  it('resultado consolidado PARCIAL quando nem todas as pernas têm receita contratada', async () => {
    getTripReturnConsolidationMock.mockResolvedValue(
      buildConsolidation({
        legCount: 2,
        returnLegCount: 1,
        returns: [buildLeg({ tripId: 'trip-2', previousTripId: 'trip-1' })],
        totalCost: 4200,
        totalContractedRevenue: 5000,
        consolidatedOperatingResult: 800,
        legsWithContractedRevenue: 1,
        revenueComplete: false,
      }),
    );
    renderTab(buildTrip());

    await screen.findByText('Operação ida + retorno');
    expect(screen.getByText(/Resultado operacional parcial/)).toBeInTheDocument();
  });

  it('a própria viagem sendo um retorno (previousTripId no outbound): o card aparece mesmo sem retornos vinculados', async () => {
    getTripReturnConsolidationMock.mockResolvedValue(
      buildConsolidation({
        outbound: buildLeg({ tripId: 'trip-1', role: 'OUTBOUND', previousTripId: 'trip-ida-0' }),
        returns: [],
        returnLegCount: 0,
        legCount: 1,
      }),
    );
    renderTab(buildTrip({ previousTripId: 'trip-ida-0' }));

    expect(await screen.findByText('Operação ida + retorno')).toBeInTheDocument();
  });
});
