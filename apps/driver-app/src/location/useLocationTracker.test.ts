import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import * as driverTripsApi from '../api/driverTrips.api';
import { DriverConfig } from '../api/driverTrips.types';
import { submitOrQueue } from '../storage/syncQueue';
import { useLocationTracker } from './useLocationTracker';

jest.mock('../api/driverTrips.api');
jest.mock('../storage/syncQueue');

const api = driverTripsApi as jest.Mocked<typeof driverTripsApi>;
const mockedSubmitOrQueue = submitOrQueue as jest.Mock;
const mockedWatchPositionAsync = Location.watchPositionAsync as jest.Mock;
const mockedRequestPermissions = Location.requestForegroundPermissionsAsync as jest.Mock;

const CONFIG: DriverConfig = {
  gpsPingIntervalSeconds: 30,
  stopDetectionMinutes: 10,
  stopRadiusMeters: 150,
  tollProximityRadiusMeters: 3000,
};

function buildPosition(overrides: {
  coords?: Partial<Location.LocationObjectCoords>;
  timestamp?: number;
} = {}): Location.LocationObject {
  return {
    coords: {
      latitude: -23.5,
      longitude: -46.6,
      speed: 20,
      heading: 90,
      accuracy: 5,
      altitude: null,
      altitudeAccuracy: null,
      ...overrides.coords,
    },
    timestamp: overrides.timestamp ?? 1_735_689_600_000,
  } as Location.LocationObject;
}

// Fase 32, Parte A -- teste isolado de useLocationTracker. So a API nativa
// (expo-location) e mockada; a logica interna do hook (start/stop, envio via
// syncQueue, deteccao de parada) roda de verdade.
describe('useLocationTracker', () => {
  let watchCallback: ((position: Location.LocationObject) => void) | null;
  let removeMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    watchCallback = null;
    removeMock = jest.fn();
    mockedSubmitOrQueue.mockResolvedValue({ queued: false });
    mockedRequestPermissions.mockResolvedValue({ status: 'granted' });
    mockedWatchPositionAsync.mockImplementation(async (_options: unknown, callback: typeof watchCallback) => {
      watchCallback = callback;
      return { remove: removeMock };
    });
  });

  describe('A. iniciar o tracking', () => {
    it('chama Location.watchPositionAsync com a configuracao esperada quando ha tripId', async () => {
      renderHook(() => useLocationTracker('trip-1', CONFIG));

      await waitFor(() => expect(mockedWatchPositionAsync).toHaveBeenCalledTimes(1));
      const [options] = mockedWatchPositionAsync.mock.calls[0] as [{ timeInterval: number; distanceInterval: number; accuracy: number }];
      expect(options.timeInterval).toBe(30_000);
      expect(options.distanceInterval).toBe(50);
      expect(watchCallback).toBeInstanceOf(Function);
    });

    it('nao inicia o tracking quando tripId e null (nenhum watcher e criado)', async () => {
      renderHook(() => useLocationTracker(null, CONFIG));

      await new Promise<void>((resolve) => setTimeout(() => resolve(), 0));
      expect(mockedWatchPositionAsync).not.toHaveBeenCalled();
    });

    it('usa o intervalo minimo de 10s mesmo se o tenant configurar um valor menor', async () => {
      renderHook(() => useLocationTracker('trip-1', { ...CONFIG, gpsPingIntervalSeconds: 3 }));

      await waitFor(() => expect(mockedWatchPositionAsync).toHaveBeenCalledTimes(1));
      const [options] = mockedWatchPositionAsync.mock.calls[0] as [{ timeInterval: number }];
      expect(options.timeInterval).toBe(10_000);
    });
  });

  describe('B. receber posicao', () => {
    it('propaga latitude, longitude, velocidade (m/s -> km/h), direcao e timestamp', async () => {
      const { result } = renderHook(() => useLocationTracker('trip-1', CONFIG));
      await waitFor(() => expect(watchCallback).toBeInstanceOf(Function));

      const position = buildPosition();
      await act(async () => watchCallback!(position));

      expect(result.current.lastKnown).toEqual(position);
      expect(mockedSubmitOrQueue).toHaveBeenCalledWith({
        kind: 'locations',
        tripId: 'trip-1',
        points: [
          expect.objectContaining({
            latitude: -23.5,
            longitude: -46.6,
            speedKmh: 72, // 20 m/s * 3.6
            headingDeg: 90,
            recordedAt: new Date(1_735_689_600_000).toISOString(),
          }),
        ],
      });
    });

    it('quando velocidade/direcao nao estao disponiveis (null), nao inventa valores -- omite os campos', async () => {
      renderHook(() => useLocationTracker('trip-1', CONFIG));
      await waitFor(() => expect(watchCallback).toBeInstanceOf(Function));

      await act(async () => watchCallback!(buildPosition({ coords: { speed: null, heading: null } })));

      const call = mockedSubmitOrQueue.mock.calls[0]![0];
      expect(call.points[0]).not.toHaveProperty('speedKmh');
      expect(call.points[0]).not.toHaveProperty('headingDeg');
    });
  });

  describe('C. envio da posicao', () => {
    it('cada posicao recebida e enviada via submitOrQueue (a MESMA fila offline, nunca um segundo mecanismo)', async () => {
      renderHook(() => useLocationTracker('trip-1', CONFIG));
      await waitFor(() => expect(watchCallback).toBeInstanceOf(Function));

      await act(async () => watchCallback!(buildPosition()));
      await act(async () => watchCallback!(buildPosition({ timestamp: 1_735_689_630_000 })));

      expect(mockedSubmitOrQueue).toHaveBeenCalledTimes(2);
      expect(mockedSubmitOrQueue.mock.calls[0]![0].kind).toBe('locations');
      expect(mockedSubmitOrQueue.mock.calls[1]![0].kind).toBe('locations');
    });
  });

  describe('D/E. stop e cleanup', () => {
    it('desmontar chama subscription.remove()', async () => {
      const { unmount } = renderHook(() => useLocationTracker('trip-1', CONFIG));
      await waitFor(() => expect(mockedWatchPositionAsync).toHaveBeenCalledTimes(1));

      unmount();

      expect(removeMock).toHaveBeenCalledTimes(1);
    });

    it('trocar de tripId remove o watcher anterior ANTES de iniciar o novo -- nunca dois watchers simultaneos', async () => {
      const { rerender } = renderHook(({ tripId }) => useLocationTracker(tripId, CONFIG), {
        initialProps: { tripId: 'trip-1' as string | null },
      });
      await waitFor(() => expect(mockedWatchPositionAsync).toHaveBeenCalledTimes(1));
      expect(removeMock).not.toHaveBeenCalled();

      rerender({ tripId: 'trip-2' });

      await waitFor(() => expect(mockedWatchPositionAsync).toHaveBeenCalledTimes(2));
      expect(removeMock).toHaveBeenCalledTimes(1); // watcher da trip-1 removido antes do 2o iniciar
    });

    it('encerrar a viagem (tripId -> null) remove o watcher e nao inicia outro', async () => {
      const { rerender } = renderHook(({ tripId }) => useLocationTracker(tripId, CONFIG), {
        initialProps: { tripId: 'trip-1' as string | null },
      });
      await waitFor(() => expect(mockedWatchPositionAsync).toHaveBeenCalledTimes(1));

      rerender({ tripId: null });

      await waitFor(() => expect(removeMock).toHaveBeenCalledTimes(1));
      expect(mockedWatchPositionAsync).toHaveBeenCalledTimes(1); // nao chamou de novo
    });
  });

  describe('F. erro do Location', () => {
    it('permissao negada nao derruba o app -- status fica "denied" e nenhum watcher e criado', async () => {
      mockedRequestPermissions.mockResolvedValue({ status: 'denied' });

      const { result } = renderHook(() => useLocationTracker('trip-1', CONFIG));

      await waitFor(() => expect(result.current.status).toBe('denied'));
      expect(mockedWatchPositionAsync).not.toHaveBeenCalled();
    });

    it('quando a rede esta indisponivel, submitOrQueue enfileira (comportamento existente) e o hook continua funcionando -- nenhuma politica de retry nova e inventada aqui', async () => {
      mockedSubmitOrQueue.mockResolvedValue({ queued: true });
      const { result } = renderHook(() => useLocationTracker('trip-1', CONFIG));
      await waitFor(() => expect(watchCallback).toBeInstanceOf(Function));

      await act(async () => watchCallback!(buildPosition()));

      expect(result.current.lastKnown).toBeTruthy();
      expect(mockedSubmitOrQueue).toHaveBeenCalledTimes(1); // reaproveita a fila, nao cria um 2o caminho
    });
  });

  describe('G. lifecycle (sem watcher duplicado)', () => {
    it('re-renderizar com os MESMOS tripId/config nao recria o watcher (React so reexecuta o efeito se as dependencias mudarem)', async () => {
      const { rerender } = renderHook(({ tripId, config }) => useLocationTracker(tripId, config), {
        initialProps: { tripId: 'trip-1', config: CONFIG },
      });
      await waitFor(() => expect(mockedWatchPositionAsync).toHaveBeenCalledTimes(1));

      rerender({ tripId: 'trip-1', config: CONFIG });

      // Sem waitFor aqui de proposito: se um 2o watcher fosse criado, seria
      // sincrono ao rerender (mesmo efeito), entao a contagem ja refletiria.
      expect(mockedWatchPositionAsync).toHaveBeenCalledTimes(1);
      expect(removeMock).not.toHaveBeenCalled();
    });
  });

  describe('condicao de corrida: unmount durante o start() assincrono', () => {
    it('desmontar ENQUANTO watchPositionAsync ainda esta pendente deveria remover a subscription assim que ela resolver (documenta o comportamento real, ver relatorio da Fase 32)', async () => {
      let resolveWatch!: (value: { remove: jest.Mock }) => void;
      mockedWatchPositionAsync.mockImplementation(
        () => new Promise((resolve) => { resolveWatch = resolve; }),
      );

      const { unmount } = renderHook(() => useLocationTracker('trip-1', CONFIG));
      await waitFor(() => expect(mockedWatchPositionAsync).toHaveBeenCalledTimes(1));

      unmount(); // desmonta ANTES da promise de watchPositionAsync resolver

      resolveWatch({ remove: removeMock });
      await new Promise<void>((resolve) => setTimeout(() => resolve(), 0));

      expect(removeMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('deteccao de parada (mesma integracao GPS -> parada, sem duplicar operational-status.util)', () => {
    it('permanecer dentro do raio por mais que stopDetectionMinutes abre uma parada automaticamente', async () => {
      api.openStop.mockResolvedValue({
        id: 'stop-1',
        tripId: 'trip-1',
        type: 'UNKNOWN',
        latitude: -23.5,
        longitude: -46.6,
        startedAt: new Date().toISOString(),
        endedAt: null,
        durationMinutes: null,
        locationLabel: null,
        syncStatus: 'SYNCED',
      });
      // Limiar 0: a 2a leitura no mesmo lugar ja excede "stopDetectionMinutes".
      renderHook(() => useLocationTracker('trip-1', { ...CONFIG, stopDetectionMinutes: 0 }));
      await waitFor(() => expect(watchCallback).toBeInstanceOf(Function));

      await act(async () => watchCallback!(buildPosition())); // abre o cluster "pending"
      await act(async () => watchCallback!(buildPosition())); // mesma posicao -> excede o limiar

      await waitFor(() => expect(api.openStop).toHaveBeenCalledTimes(1));
      expect(api.openStop).toHaveBeenCalledWith(
        'trip-1',
        expect.objectContaining({ latitude: -23.5, longitude: -46.6 }),
      );
    });

    it('mover-se para fora do raio fecha a parada aberta automaticamente', async () => {
      api.openStop.mockResolvedValue({
        id: 'stop-1',
        tripId: 'trip-1',
        type: 'UNKNOWN',
        latitude: -23.5,
        longitude: -46.6,
        startedAt: new Date().toISOString(),
        endedAt: null,
        durationMinutes: null,
        locationLabel: null,
        syncStatus: 'SYNCED',
      });
      api.closeStop.mockResolvedValue({
        id: 'stop-1',
        tripId: 'trip-1',
        type: 'UNKNOWN',
        latitude: -23.5,
        longitude: -46.6,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationMinutes: 12,
        locationLabel: null,
        syncStatus: 'SYNCED',
      });
      renderHook(() => useLocationTracker('trip-1', { ...CONFIG, stopDetectionMinutes: 0, stopRadiusMeters: 100 }));
      await waitFor(() => expect(watchCallback).toBeInstanceOf(Function));

      await act(async () => watchCallback!(buildPosition()));
      await act(async () => watchCallback!(buildPosition()));
      await waitFor(() => expect(api.openStop).toHaveBeenCalledTimes(1));

      // Move bem longe (fora do raio de 100m).
      await act(async () =>
        watchCallback!(buildPosition({ coords: { latitude: -23.6, longitude: -46.7 } })),
      );

      await waitFor(() =>
        expect(api.closeStop).toHaveBeenCalledWith(
          'trip-1',
          'stop-1',
          expect.objectContaining({ endedAt: expect.any(String) }),
        ),
      );
    });
  });
});
