import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import React from 'react';
import * as driverTripsApi from '../api/driverTrips.api';
import { DriverActiveTrip } from '../api/driverTrips.types';
import { submitOrQueue } from '../storage/syncQueue';
import { HomeScreen } from './HomeScreen';

jest.mock('../api/driverTrips.api');
jest.mock('../storage/syncQueue');
jest.mock('../location/useLocationTracker', () => ({
  useLocationTracker: () => ({ status: 'granted', lastKnown: null }),
}));

const mockUseAuth = jest.fn();
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseTrip = jest.fn();
jest.mock('../trip/TripContext', () => ({
  useTrip: () => mockUseTrip(),
}));

const api = driverTripsApi as jest.Mocked<typeof driverTripsApi>;
const mockedSubmitOrQueue = submitOrQueue as jest.Mock;

const IN_PROGRESS_TRIP: DriverActiveTrip = {
  id: 'trip-1',
  status: 'IN_PROGRESS',
  destinationName: 'São Paulo/SP',
  vehiclePlate: 'ABC1D23',
  lastLocation: null,
  updatedAt: '2026-09-01T12:00:00.000Z',
};

function renderScreen() {
  const navigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() };
  const utils = render(<HomeScreen route={{} as never} navigation={navigation as never} />);
  return { ...utils, navigation };
}

// Fase 31, Parte 7 -- pausa/retomada (online e offline) na tela principal.
describe('HomeScreen -- pausa e retomada', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ logout: jest.fn(), driverName: 'Jose' });
    api.getRoute.mockResolvedValue(null);
    api.getNearbyTollPlazas.mockResolvedValue([]);
    api.getCurrentIdlePeriod.mockResolvedValue(null);
    jest.spyOn(Location, 'getLastKnownPositionAsync').mockResolvedValue({
      coords: { latitude: -23.5, longitude: -46.6 },
    } as never);
  });

  describe('pausa', () => {
    beforeEach(() => {
      mockUseTrip.mockReturnValue({
        activeTrip: IN_PROGRESS_TRIP,
        config: null,
        isLoading: false,
        refresh: jest.fn().mockResolvedValue(undefined),
      });
    });

    it('online: GPS disponivel, envia a posicao e nao mostra aviso de sincronizacao', async () => {
      mockedSubmitOrQueue.mockResolvedValue({ queued: false });
      renderScreen();

      fireEvent.press(await screen.findByText('PAUSAR VIAGEM'));

      await waitFor(() =>
        expect(mockedSubmitOrQueue).toHaveBeenCalledWith({
          kind: 'pause',
          tripId: 'trip-1',
          latitude: -23.5,
          longitude: -46.6,
        }),
      );
      expect(screen.queryByText(/Sem conexao agora/i)).toBeNull();
    });

    it('offline: a acao entra na fila (submitOrQueue) e a UI mostra o aviso, sem travar nem lancar erro', async () => {
      mockedSubmitOrQueue.mockResolvedValue({ queued: true });
      renderScreen();

      fireEvent.press(await screen.findByText('PAUSAR VIAGEM'));

      expect(await screen.findByText(/Sem conexao agora/i)).toBeTruthy();
      // A tela continua funcional -- o botao "PAUSAR VIAGEM" segue presente
      // (nao travou em loading eterno).
      expect(await screen.findByText('PAUSAR VIAGEM')).toBeTruthy();
    });
  });

  describe('retomada', () => {
    beforeEach(() => {
      mockUseTrip.mockReturnValue({
        activeTrip: { ...IN_PROGRESS_TRIP, status: 'PAUSED' },
        config: null,
        isLoading: false,
        refresh: jest.fn().mockResolvedValue(undefined),
      });
    });

    it('online: GPS disponivel, envia a posicao', async () => {
      mockedSubmitOrQueue.mockResolvedValue({ queued: false });
      renderScreen();

      fireEvent.press(await screen.findByText('CONTINUAR VIAGEM'));

      await waitFor(() =>
        expect(mockedSubmitOrQueue).toHaveBeenCalledWith({
          kind: 'resume',
          tripId: 'trip-1',
          latitude: -23.5,
          longitude: -46.6,
        }),
      );
    });

    it('offline: entra na fila; a sincronizacao posterior fica a cargo do proximo refresh() (TripContext ja chama flushQueue)', async () => {
      mockedSubmitOrQueue.mockResolvedValue({ queued: true });
      const refresh = jest.fn().mockResolvedValue(undefined);
      mockUseTrip.mockReturnValue({
        activeTrip: { ...IN_PROGRESS_TRIP, status: 'PAUSED' },
        config: null,
        isLoading: false,
        refresh,
      });
      renderScreen();

      fireEvent.press(await screen.findByText('CONTINUAR VIAGEM'));

      expect(await screen.findByText(/Sem conexao agora/i)).toBeTruthy();
      await waitFor(() => expect(refresh).toHaveBeenCalled());
    });

    it('ENCERRAR VIAGEM navega para a tela de finalizacao (nunca finaliza direto pela Home)', async () => {
      const { navigation } = renderScreen();

      fireEvent.press(await screen.findByText('ENCERRAR VIAGEM'));

      expect(navigation.navigate).toHaveBeenCalledWith('FinishTrip', { tripId: 'trip-1' });
    });
  });

  // Fase C -- "fluxo pos-viagem": sem viagem ativa, se o veiculo tem um
  // VehicleIdlePeriod ABERTO (Fase B), a Home mostra o card "VEICULO PARADO"
  // com um atalho para confirmar/alterar o motivo. Nunca cria/fecha periodo.
  describe('veiculo parado (sem viagem ativa)', () => {
    const OPEN_IDLE_PERIOD = {
      id: 'idle-1',
      vehicleId: 'veh-1',
      plate: 'ABC1D23',
      startedAt: '2026-09-01T09:00:00.000Z',
      endedAt: null,
      durationMinutes: null,
      reason: 'AGUARDANDO_ORDEM' as const,
      source: 'AUTO' as const,
      previousDestinationLabel: 'São Paulo/SP',
      status: 'OPEN' as const,
    };

    beforeEach(() => {
      mockUseTrip.mockReturnValue({
        activeTrip: null,
        config: null,
        isLoading: false,
        refresh: jest.fn().mockResolvedValue(undefined),
      });
    });

    it('mostra o card VEICULO PARADO com placa e motivo quando ha periodo ABERTO', async () => {
      api.getCurrentIdlePeriod.mockResolvedValue(OPEN_IDLE_PERIOD);
      renderScreen();

      expect(await screen.findByText('VEICULO PARADO')).toBeTruthy();
      expect(screen.getByText('Veiculo: ABC1D23')).toBeTruthy();
      expect(screen.getByText(/Motivo: Aguardando ordem/)).toBeTruthy();
      expect(screen.getByText(/\(automatico\)/)).toBeTruthy();
    });

    it('o botao navega para a tela IdleReason (Finalizar operacao)', async () => {
      api.getCurrentIdlePeriod.mockResolvedValue(OPEN_IDLE_PERIOD);
      const { navigation } = renderScreen();

      fireEvent.press(await screen.findByText('Finalizar operacao / informar motivo'));
      expect(navigation.navigate).toHaveBeenCalledWith('IdleReason');
    });

    it('sem periodo aberto: nao mostra o card, so o estado "nenhuma viagem atribuida"', async () => {
      api.getCurrentIdlePeriod.mockResolvedValue(null);
      renderScreen();

      expect(await screen.findByText('Nenhuma viagem atribuida no momento.')).toBeTruthy();
      expect(screen.queryByText('VEICULO PARADO')).toBeNull();
    });

    it('com viagem ativa o card de veiculo parado nunca aparece (nem consulta o periodo)', async () => {
      api.getCurrentIdlePeriod.mockResolvedValue(OPEN_IDLE_PERIOD);
      mockUseTrip.mockReturnValue({
        activeTrip: IN_PROGRESS_TRIP,
        config: null,
        isLoading: false,
        refresh: jest.fn().mockResolvedValue(undefined),
      });
      renderScreen();

      await screen.findByText('PAUSAR VIAGEM');
      expect(screen.queryByText('VEICULO PARADO')).toBeNull();
      expect(api.getCurrentIdlePeriod).not.toHaveBeenCalled();
    });
  });

  describe('retomada com desvio (reaproveita RoutingService/TrackingPointsService via GET /route)', () => {
    it('apos retomar, a proxima leitura de rota pode indicar desvio ja detectado pelo backend -- Home so exibe o alerta, nao decide nada', async () => {
      mockUseTrip.mockReturnValue({
        activeTrip: IN_PROGRESS_TRIP,
        config: { gpsPingIntervalSeconds: 30, stopDetectionMinutes: 10, stopRadiusMeters: 150, tollProximityRadiusMeters: 3000 },
        isLoading: false,
        refresh: jest.fn().mockResolvedValue(undefined),
      });
      api.getRoute.mockResolvedValue({
        destinationLabel: 'São Paulo/SP',
        distanceMeters: 500_000,
        durationSeconds: 20_000,
        distanceRemainingMeters: 400_000,
        nextToll: null,
        tollCount: 0,
        totalTollAmount: null,
        hasUnresolvedDeviation: true,
      });
      renderScreen();

      expect(await screen.findByText('DESVIO DETECTADO')).toBeTruthy();
      expect(screen.getByText('RECALCULAR ROTA')).toBeTruthy();
    });
  });
});
