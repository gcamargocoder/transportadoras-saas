import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TripOperationEntity } from '../../../../types/entities';
import ControlTowerPage from './page';

const getActiveOperationsMock = vi.fn();
const getIdleTimeMock = vi.fn();
const getIdlePeriodsMock = vi.fn();
const pushMock = vi.fn();

vi.mock('../../../../lib/api/trips.api', () => ({
  getActiveOperations: () => getActiveOperationsMock(),
}));

vi.mock('../../../../lib/api/fleet-operations.api', () => ({
  getFleetOperationsIdleTime: () => getIdleTimeMock(),
  getFleetOperationsIdlePeriods: () => getIdlePeriodsMock(),
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

function buildIdleRow(overrides: Partial<import('../../../../types/entities').FleetVehicleIdleTimeEntity> = {}) {
  return {
    vehicleId: 'vehicle-idle-1',
    plate: 'XYZ4E56',
    lastTripId: 'trip-prev',
    lastArrival: '2026-09-01T06:00:00.000Z',
    lastDestinationLabel: 'CD Ribeirão Preto/SP',
    nextTripId: null,
    nextDeparture: null,
    idleStart: '2026-09-01T06:00:00.000Z',
    idleEnd: null,
    totalMinutes: 1500,
    maintenanceMinutes: 0,
    netIdleMinutes: 1500,
    isCurrentlyIdle: true,
    isEstimate: true,
    ...overrides,
  };
}

function buildPeriodRow(overrides: Partial<import('../../../../types/entities').VehicleIdlePeriodEntity> = {}) {
  return {
    id: 'period-1',
    vehicleId: 'vehicle-idle-1',
    plate: 'XYZ4E56',
    startedAt: '2026-09-01T06:00:00.000Z',
    endedAt: null,
    durationMinutes: null,
    reason: 'AGUARDANDO_CARGA',
    source: 'AUTO',
    tripBeforeId: 'trip-prev',
    tripAfterId: null,
    previousDestinationLabel: 'CD Ribeirão Preto/SP',
    notes: null,
    status: 'OPEN',
    createdAt: '2026-09-01T06:00:00.000Z',
    updatedAt: '2026-09-01T06:00:00.000Z',
    ...overrides,
  };
}

describe('ControlTowerPage', () => {
  beforeEach(() => {
    getActiveOperationsMock.mockReset();
    getIdleTimeMock.mockReset();
    getIdleTimeMock.mockResolvedValue({ asOf: '2026-09-02T00:00:00.000Z', items: [], meta: { total: 0, page: 1, pageSize: 100, totalPages: 0 } });
    getIdlePeriodsMock.mockReset();
    getIdlePeriodsMock.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pageSize: 100, totalPages: 0 } });
    pushMock.mockReset();
  });

  it('mostra estado vazio quando nao ha viagens ativas', async () => {
    getActiveOperationsMock.mockResolvedValue({ items: [] });
    renderPage();

    expect(await screen.findByText(/Nenhuma viagem nesta situação/i)).toBeInTheDocument();
  });

  // Fase A -- "Frota parada agora" consome GET /fleet-operations/idle-time
  // e mostra so os periodos EM ABERTO (isCurrentlyIdle).
  it('mostra a secao "Frota parada agora" com veiculo, tempo ocioso, desde quando e ultimo destino', async () => {
    getActiveOperationsMock.mockResolvedValue({ items: [] });
    getIdleTimeMock.mockResolvedValue({
      asOf: '2026-09-02T09:00:00.000Z',
      items: [
        buildIdleRow(),
        // periodo historico (nao corrente) -> nunca aparece nesta secao
        buildIdleRow({ vehicleId: 'v-hist', plate: 'HIS0T01', isCurrentlyIdle: false, idleEnd: '2026-08-20T00:00:00.000Z' }),
      ],
      meta: { total: 2, page: 1, pageSize: 100, totalPages: 1 },
    });
    renderPage();

    expect(await screen.findByText('Frota parada agora')).toBeInTheDocument();
    expect((await screen.findAllByText('XYZ4E56')).length).toBeGreaterThan(0);
    // 1500 min = 1d 1h
    expect(screen.getAllByText('1d 1h').length).toBeGreaterThan(0);
    expect(screen.getAllByText('CD Ribeirão Preto/SP').length).toBeGreaterThan(0);
    expect(screen.queryByText('HIS0T01')).not.toBeInTheDocument();
  });

  it('destaca o tempo coberto por manutencao a parte, sem contar como ociosidade liquida', async () => {
    getActiveOperationsMock.mockResolvedValue({ items: [] });
    getIdleTimeMock.mockResolvedValue({
      asOf: '2026-09-02T09:00:00.000Z',
      items: [buildIdleRow({ totalMinutes: 1500, maintenanceMinutes: 300, netIdleMinutes: 1200 })],
      meta: { total: 1, page: 1, pageSize: 100, totalPages: 1 },
    });
    renderPage();

    expect((await screen.findAllByText('XYZ4E56')).length).toBeGreaterThan(0);
    // netIdle 1200 min = 20h
    expect(screen.getAllByText('20h').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/5h em manutenção/i).length).toBeGreaterThan(0);
  });

  // Fase B -- quando ha um periodo ocioso PERSISTIDO aberto, ele tem
  // prioridade sobre a estimativa da Fase A e traz o MOTIVO.
  it('prioriza o periodo persistido (Fase B) sobre a estimativa da Fase A, exibindo o motivo', async () => {
    getActiveOperationsMock.mockResolvedValue({ items: [] });
    getIdleTimeMock.mockResolvedValue({
      asOf: '2026-09-02T09:00:00.000Z',
      items: [buildIdleRow({ vehicleId: 'vehicle-idle-1', plate: 'XYZ4E56' })],
      meta: { total: 1, page: 1, pageSize: 100, totalPages: 1 },
    });
    getIdlePeriodsMock.mockResolvedValue({
      items: [buildPeriodRow({ vehicleId: 'vehicle-idle-1', plate: 'XYZ4E56', reason: 'AGUARDANDO_CARGA' })],
      meta: { total: 1, page: 1, pageSize: 100, totalPages: 1 },
    });
    renderPage();

    expect((await screen.findAllByText('XYZ4E56')).length).toBeGreaterThan(0);
    // uma unica linha para o veiculo (merge por vehicleId, persistido vence)
    expect(screen.getAllByText('XYZ4E56').length).toBe(2); // desktop + mobile, 1 linha logica
    expect(screen.getAllByText('Aguardando carga').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/período registrado/i).length).toBeGreaterThan(0);
  });

  it('marca periodo persistido com motivo MANUTENCAO com badge de manutencao', async () => {
    getActiveOperationsMock.mockResolvedValue({ items: [] });
    getIdlePeriodsMock.mockResolvedValue({
      items: [buildPeriodRow({ reason: 'MANUTENCAO' })],
      meta: { total: 1, page: 1, pageSize: 100, totalPages: 1 },
    });
    renderPage();

    expect((await screen.findAllByText('XYZ4E56')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Manutenção').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Em manutenção').length).toBeGreaterThan(0);
  });

  // Fase C -- coluna "Origem" na "Frota parada agora": DRIVER_APP quando o
  // motorista informou o motivo, "Automático" para o periodo aberto pela
  // Fase B, e "Estimativa" para o fallback da Fase A (sem periodo persistido).
  it('coluna Origem: periodo com source DRIVER_APP aparece como "Motorista"', async () => {
    getActiveOperationsMock.mockResolvedValue({ items: [] });
    getIdlePeriodsMock.mockResolvedValue({
      items: [buildPeriodRow({ source: 'DRIVER_APP', reason: 'DESCANSO' })],
      meta: { total: 1, page: 1, pageSize: 100, totalPages: 1 },
    });
    renderPage();

    expect((await screen.findAllByText('XYZ4E56')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Motorista').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Descanso').length).toBeGreaterThan(0);
  });

  it('coluna Origem: periodo com source AUTO aparece como "Automático"; fallback Fase A aparece como "Estimativa"', async () => {
    getActiveOperationsMock.mockResolvedValue({ items: [] });
    getIdleTimeMock.mockResolvedValue({
      asOf: '2026-09-02T09:00:00.000Z',
      items: [buildIdleRow({ vehicleId: 'v-est', plate: 'EST0A01' })],
      meta: { total: 1, page: 1, pageSize: 100, totalPages: 1 },
    });
    getIdlePeriodsMock.mockResolvedValue({
      items: [buildPeriodRow({ vehicleId: 'v-auto', plate: 'AUT0O01', source: 'AUTO' })],
      meta: { total: 1, page: 1, pageSize: 100, totalPages: 1 },
    });
    renderPage();

    expect((await screen.findAllByText('AUT0O01')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Automático').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Estimativa').length).toBeGreaterThan(0);
  });

  it('sem veiculos parados mostra estado vazio proprio da secao', async () => {
    getActiveOperationsMock.mockResolvedValue({ items: [] });
    renderPage();

    expect(await screen.findByText(/Nenhum veículo parado/i)).toBeInTheDocument();
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

  // Fase D -- carga real (loadStatus) e vinculo explicito de retorno
  // (previousTripId) na tabela de viagens ativas. Nunca substitui/duplica
  // Frota parada agora, a prioridade do VehicleIdlePeriod, o fallback da
  // Fase A, o motivo nem a origem AUTO/MANUAL_ADMIN/DRIVER_APP.
  it('mostra a carga real (loadStatus) e o indicador "↩ Retorno" quando previousTripId existe', async () => {
    getActiveOperationsMock.mockResolvedValue({
      items: [buildItem({ tripId: 'trip-return', loadStatus: 'EMPTY', previousTripId: 'trip-ida-1' })],
    });
    renderPage();

    await screen.findAllByText('José da Silva');
    expect(screen.getAllByText('Vazio').length).toBeGreaterThan(0);
    const link = screen.getAllByText('↩ Retorno')[0]!;
    expect(link.closest('a')).toHaveAttribute('href', '/trips/trip-ida-1');
  });

  it('sem previousTripId nao mostra nenhum indicador de retorno', async () => {
    getActiveOperationsMock.mockResolvedValue({
      items: [buildItem({ tripId: 'trip-no-return' })],
    });
    renderPage();

    await screen.findAllByText('José da Silva');
    expect(screen.queryByText('↩ Retorno')).toBeNull();
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
