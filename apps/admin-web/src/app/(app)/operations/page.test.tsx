import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TripOperationEntity } from '../../../types/entities';
import OperationsPage from './page';

const getActiveOperationsMock = vi.fn();
const pushMock = vi.fn();

vi.mock('../../../lib/api/trips.api', () => ({
  getActiveOperations: () => getActiveOperationsMock(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return render(<OperationsPage />, { wrapper: Wrapper });
}

function buildItem(overrides: Partial<TripOperationEntity> = {}): TripOperationEntity {
  return {
    tripId: 'trip-1',
    status: 'IN_PROGRESS',
    operationalStatus: 'MOVING',
    driverId: 'driver-1',
    driverName: 'José da Silva',
    vehicleId: 'vehicle-1',
    vehiclePlate: 'ABC1D23',
    originName: 'Catanduva/SP',
    destinationName: 'São Paulo/SP',
    loadStatus: null,
    plannedLoadStatus: null,
    previousTripId: null,
    actualDeparture: '2026-09-01T08:00:00.000Z',
    initialOdometerKm: 100000,
    currentOdometerKm: 100120,
    lastPosition: {
      latitude: -23.5,
      longitude: -46.6,
      recordedAt: '2026-09-01T12:00:00.000Z',
      speedKmh: 80,
      headingDeg: 90,
    },
    minutesSinceLastUpdate: 2,
    locationFreshness: 'ONLINE',
    movementStatus: 'MOVING',
    hasUnresolvedDeviation: false,
    hasRecalculatedRoute: false,
    routePlanId: 'plan-1',
    defaultAxles: 9,
    tollSummary: {
      plannedCount: 2,
      registeredCount: 1,
      pendingCount: 1,
      unplannedCount: 0,
      reconciliationStatus: 'PENDING',
    },
    alerts: [],
    deliverySummary: {
      totalCount: 0,
      pendingCount: 0,
      inProgressCount: 0,
      completedCount: 0,
      failedCount: 0,
      cancelledCount: 0,
    },
    openOccurrencesCount: 0,
    criticalOpenOccurrencesCount: 0,
    plannedArrival: '2026-09-02T18:00:00.000Z',
    isDelayed: false,
    preTripChecklistStatus: null,
    preTripChecklistHasCriticalNonConformity: false,
    priority: 'NORMAL',
    maintenanceStatus: 'UNKNOWN',
    ...overrides,
  };
}

describe('OperationsPage', () => {
  beforeEach(() => {
    getActiveOperationsMock.mockReset();
    pushMock.mockReset();
  });

  it('mostra estado de carregamento (skeleton) antes da resposta chegar', async () => {
    getActiveOperationsMock.mockReturnValue(new Promise(() => undefined));
    const { container } = renderPage();

    await waitFor(() => expect(container.querySelector('.animate-pulse')).not.toBeNull());
  });

  it('mostra estado vazio quando nao ha viagens ativas', async () => {
    getActiveOperationsMock.mockResolvedValue({ items: [] });
    renderPage();

    expect(await screen.findByText(/Nenhuma viagem nesta situação/i)).toBeInTheDocument();
  });

  it('renderiza uma viagem ativa com motorista, rota e status operacional', async () => {
    getActiveOperationsMock.mockResolvedValue({ items: [buildItem()] });
    renderPage();

    // DataTable renderiza tabela (desktop) + cartoes (mobile) simultaneamente
    // no DOM (visibilidade so por CSS) -- por isso getAllByText, nao getByText
    // (mesmo padrao ja usado em reconciliation-tab.test.tsx).
    expect((await screen.findAllByText('José da Silva')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Catanduva/SP → São Paulo/SP').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Em movimento').length).toBeGreaterThan(0);
  });

  it('mostra "Desvio detectado" quando hasUnresolvedDeviation=true', async () => {
    getActiveOperationsMock.mockResolvedValue({
      items: [buildItem({ hasUnresolvedDeviation: true, operationalStatus: 'OFF_ROUTE' })],
    });
    renderPage();

    expect((await screen.findAllByText('Desvio detectado')).length).toBeGreaterThan(0);
  });

  it('mostra "Sem atualização de localização" quando nao ha posicao (STALE/OFFLINE)', async () => {
    getActiveOperationsMock.mockResolvedValue({
      items: [
        buildItem({
          operationalStatus: 'STALE',
          locationFreshness: 'OFFLINE',
          lastPosition: null,
          minutesSinceLastUpdate: null,
        }),
      ],
    });
    renderPage();

    expect((await screen.findAllByText(/Sem atualização de localização/i)).length).toBeGreaterThan(0);
  });

  it('filtra por "Pausadas" ao clicar na aba correspondente', async () => {
    getActiveOperationsMock.mockResolvedValue({
      items: [
        buildItem({ tripId: 'trip-active', driverName: 'Motorista Ativo', status: 'IN_PROGRESS' }),
        buildItem({
          tripId: 'trip-paused',
          driverName: 'Motorista Pausado',
          status: 'PAUSED',
          operationalStatus: 'PAUSED',
        }),
      ],
    });
    renderPage();

    await screen.findAllByText('Motorista Ativo');
    expect(screen.getAllByText('Motorista Pausado').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('tab', { name: /Pausadas/i }));

    await waitFor(() => expect(screen.queryAllByText('Motorista Ativo')).toHaveLength(0));
    expect(screen.getAllByText('Motorista Pausado').length).toBeGreaterThan(0);
  });

  it('navega para a página de detalhe da viagem ao clicar na linha', async () => {
    getActiveOperationsMock.mockResolvedValue({ items: [buildItem()] });
    renderPage();

    const matches = await screen.findAllByText('José da Silva');
    fireEvent.click(matches[0]!);

    expect(pushMock).toHaveBeenCalledWith('/trips/trip-1');
  });
});
