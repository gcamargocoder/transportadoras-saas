import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TripOperationEntity } from '../../../../types/entities';
import ControlTowerPage from './page';

const getActiveOperationsMock = vi.fn();
const pushMock = vi.fn();

vi.mock('../../../../lib/api/trips.api', () => ({
  getActiveOperations: () => getActiveOperationsMock(),
}));

vi.mock('../../../../lib/api/fleet.api', () => ({
  listVehicles: () => Promise.resolve({ items: [{ id: 'vehicle-1', plate: 'ABC1D23' }] }),
}));

vi.mock('../../../../lib/api/drivers.api', () => ({
  listDrivers: () => Promise.resolve({ items: [{ id: 'driver-1', name: 'José da Silva' }] }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return render(<ControlTowerPage />, { wrapper: Wrapper });
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
      totalCount: 5,
      pendingCount: 1,
      inProgressCount: 1,
      completedCount: 3,
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

describe('ControlTowerPage', () => {
  beforeEach(() => {
    getActiveOperationsMock.mockReset();
    pushMock.mockReset();
  });

  it('mostra estado vazio quando nao ha viagens ativas', async () => {
    getActiveOperationsMock.mockResolvedValue({ items: [] });
    renderPage();

    expect(await screen.findByText(/Nenhuma viagem nesta situação/i)).toBeInTheDocument();
  });

  it('mostra os indicadores resumidos no topo (viagens ativas, atrasadas, criticas, intervencao)', async () => {
    getActiveOperationsMock.mockResolvedValue({
      items: [
        buildItem({ tripId: 'trip-ok' }),
        buildItem({ tripId: 'trip-delayed', isDelayed: true }),
        buildItem({
          tripId: 'trip-critical',
          criticalOpenOccurrencesCount: 1,
          openOccurrencesCount: 1,
        }),
      ],
    });
    renderPage();

    await screen.findAllByText('José da Silva');

    // 'Atrasadas' e 'Exigem intervenção' aparecem tanto no StatCard (topo)
    // quanto na aba de filtro (Tabs) com o mesmo texto -- os StatCards
    // renderizam primeiro no DOM, por isso o primeiro resultado.
    expect(screen.getByText('Viagens em andamento').parentElement?.parentElement?.textContent).toContain('3');
    expect(screen.getAllByText('Atrasadas')[0]!.parentElement?.parentElement?.textContent).toContain('1');
    expect(screen.getByText('Com ocorrência crítica').parentElement?.parentElement?.textContent).toContain('1');
    // Ambas as viagens (atrasada + com ocorrencia critica) exigem intervencao.
    expect(screen.getAllByText('Exigem intervenção')[0]!.parentElement?.parentElement?.textContent).toContain('2');
  });

  it('renderiza entregas, ocorrencias e badge de atraso por viagem', async () => {
    getActiveOperationsMock.mockResolvedValue({
      items: [
        buildItem({
          isDelayed: true,
          criticalOpenOccurrencesCount: 1,
          openOccurrencesCount: 2,
          deliverySummary: {
            totalCount: 4,
            pendingCount: 0,
            inProgressCount: 0,
            completedCount: 3,
            failedCount: 1,
            cancelledCount: 0,
          },
        }),
      ],
    });
    renderPage();

    expect((await screen.findAllByText('Atrasada')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('1 falha(s)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1 crítica(s)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2 em aberto').length).toBeGreaterThan(0);
  });

  // Fase 111 -- checklist pre-viagem com item critico tambem conta em
  // "Exigem intervenção" e mostra badge dedicado na coluna.
  it('checklist pre-viagem com nao-conformidade critica mostra badge e conta em "Exigem intervenção"', async () => {
    getActiveOperationsMock.mockResolvedValue({
      items: [
        buildItem({
          tripId: 'trip-checklist-critical',
          preTripChecklistStatus: 'COMPLETED',
          preTripChecklistHasCriticalNonConformity: true,
        }),
      ],
    });
    renderPage();

    expect((await screen.findAllByText('Item crítico')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Exigem intervenção')[0]!.parentElement?.parentElement?.textContent).toContain('1');
  });

  it('checklist pre-viagem concluido sem pendencia mostra badge "Concluído"', async () => {
    getActiveOperationsMock.mockResolvedValue({
      items: [buildItem({ preTripChecklistStatus: 'COMPLETED', preTripChecklistHasCriticalNonConformity: false })],
    });
    renderPage();

    expect((await screen.findAllByText('Concluído')).length).toBeGreaterThan(0);
  });

  // Fase 114 -- prioridade real da viagem (Trip.priority) mostrada como badge;
  // NORMAL (o valor mais comum) fica silenciosa para nao poluir a tabela.
  it('mostra badge de prioridade quando diferente de NORMAL, e filtra por prioridade', async () => {
    getActiveOperationsMock.mockResolvedValue({
      items: [
        buildItem({ tripId: 'trip-urgent', driverName: 'Motorista Urgente', priority: 'URGENT' }),
        buildItem({ tripId: 'trip-normal', driverName: 'Motorista Normal', priority: 'NORMAL' }),
      ],
    });
    renderPage();

    await screen.findAllByText('Motorista Urgente');
    expect(screen.getAllByText('Urgente').length).toBeGreaterThan(0);

    const prioritySelect = await screen.findByLabelText('Prioridade');
    fireEvent.change(prioritySelect, { target: { value: 'URGENT' } });

    await waitFor(() => expect(screen.queryAllByText('Motorista Normal')).toHaveLength(0));
    expect(screen.getAllByText('Motorista Urgente').length).toBeGreaterThan(0);
  });

  // Fase 114 -- manutencao preventiva vencida do veiculo tambem e um sinal
  // real de risco: mostra badge dedicado e conta em "Exigem intervenção".
  it('manutencao vencida mostra badge "Vencida" e conta em "Exigem intervenção"', async () => {
    getActiveOperationsMock.mockResolvedValue({
      items: [buildItem({ tripId: 'trip-maintenance-overdue', maintenanceStatus: 'OVERDUE' })],
    });
    renderPage();

    expect((await screen.findAllByText('Vencida')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Exigem intervenção')[0]!.parentElement?.parentElement?.textContent).toContain('1');
  });

  it('filtra por "Atrasadas" ao clicar na aba correspondente', async () => {
    getActiveOperationsMock.mockResolvedValue({
      items: [
        buildItem({ tripId: 'trip-on-time', driverName: 'Motorista Pontual', isDelayed: false }),
        buildItem({ tripId: 'trip-late', driverName: 'Motorista Atrasado', isDelayed: true }),
      ],
    });
    renderPage();

    await screen.findAllByText('Motorista Pontual');
    expect(screen.getAllByText('Motorista Atrasado').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('tab', { name: /Atrasadas/i }));

    await waitFor(() => expect(screen.queryAllByText('Motorista Pontual')).toHaveLength(0));
    expect(screen.getAllByText('Motorista Atrasado').length).toBeGreaterThan(0);
  });

  it('filtra por veiculo selecionado no filtro', async () => {
    getActiveOperationsMock.mockResolvedValue({
      items: [
        buildItem({ tripId: 'trip-a', driverName: 'Motorista A', vehicleId: 'vehicle-1' }),
        buildItem({ tripId: 'trip-b', driverName: 'Motorista B', vehicleId: 'vehicle-2' }),
      ],
    });
    renderPage();

    await screen.findAllByText('Motorista A');
    expect(screen.getAllByText('Motorista B').length).toBeGreaterThan(0);

    const vehicleSelects = await screen.findAllByLabelText('Veículo');
    fireEvent.change(vehicleSelects[0]!, { target: { value: 'vehicle-1' } });

    await waitFor(() => expect(screen.queryAllByText('Motorista B')).toHaveLength(0));
    expect(screen.getAllByText('Motorista A').length).toBeGreaterThan(0);
  });

  it('navega para a viagem ao clicar na linha e oferece links rapidos de entrega/ocorrencia', async () => {
    getActiveOperationsMock.mockResolvedValue({ items: [buildItem()] });
    renderPage();

    const deliveryLinks = await screen.findAllByRole('link', { name: 'Entregas' });
    expect(deliveryLinks[0]).toHaveAttribute('href', '/trips/trip-1?tab=delivery-stops');
    const occurrenceLinks = screen.getAllByRole('link', { name: 'Ocorrências' });
    expect(occurrenceLinks[0]).toHaveAttribute('href', '/trips/trip-1?tab=occurrences');

    // 'José da Silva' tambem aparece como <option> do filtro de motorista
    // (mock de listDrivers) -- restringe ao <p> renderizado pela coluna da
    // tabela/cartao antes de clicar na linha.
    const matches = await screen.findAllByText('José da Silva');
    const nameCell = matches.find((el) => el.tagName === 'P');
    expect(nameCell).toBeDefined();
    fireEvent.click(nameCell!);

    expect(pushMock).toHaveBeenCalledWith('/trips/trip-1');
  });
});
