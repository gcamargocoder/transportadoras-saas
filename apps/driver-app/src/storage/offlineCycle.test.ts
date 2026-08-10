import AsyncStorage from '@react-native-async-storage/async-storage';
import * as driverTripsApi from '../api/driverTrips.api';
import { flushQueue, submitOrQueue } from './syncQueue';

jest.mock('../api/driverTrips.api');
const api = driverTripsApi as jest.Mocked<typeof driverTripsApi>;

// Fase 31, Parte 15 -- prova do lado do CLIENTE do ciclo integrado
// START -> TRACKING -> OFFLINE -> PAUSE -> CLOSE APP -> OPEN APP -> RESUME ->
// COMPLETE -> SYNC. "Fechar e reabrir o app" nao muda nada aqui de proposito:
// a fila vive no AsyncStorage (persistente), entao o teste NUNCA limpa o
// storage entre as etapas -- simula exatamente a sobrevivencia real do
// processo sendo encerrado e reaberto. O lado do SERVIDOR de cada acao
// (pause/resume/complete idempotentes, odometro nunca regride, etc) ja tem
// cobertura propria em driver-trips.e2e-spec.ts -- este teste prova que o
// CLIENTE enfileira/sincroniza corretamente, sem inventar um mecanismo novo.
describe('Ciclo offline completo (START..PAUSE..CLOSE/OPEN..RESUME..COMPLETE..SYNC)', () => {
  const tripId = 'trip-integration-1';

  beforeAll(async () => {
    await AsyncStorage.clear();
  });

  it('1) TRACKING: pontos de GPS enviados normalmente (online)', async () => {
    api.sendLocations.mockResolvedValue({ received: 1, created: 1, duplicates: 0 });

    const result = await submitOrQueue({
      kind: 'locations',
      tripId,
      points: [
        {
          deviceEventId: 'loc-1',
          latitude: -23.5,
          longitude: -46.6,
          recordedAt: new Date().toISOString(),
        },
      ],
    });

    expect(result.queued).toBe(false);
  });

  it('2) OFFLINE + PAUSE: a rede cai bem na hora de pausar -- a acao fica pendente, sem travar o app', async () => {
    api.pauseTrip.mockRejectedValue(new Error('sem conexao'));

    const result = await submitOrQueue({ kind: 'pause', tripId, latitude: -23.51, longitude: -46.61 });

    expect(result.queued).toBe(true);
  });

  it('3) CLOSE APP / OPEN APP: a fila persiste no AsyncStorage entre "sessoes" do processo', async () => {
    const raw = await AsyncStorage.getItem('driverapp.syncQueue');
    expect(raw).not.toBeNull();
    const queue = JSON.parse(raw!) as Array<{ kind: string }>;
    expect(queue).toHaveLength(1);
    expect(queue[0]!.kind).toBe('pause');
  });

  it('4) RESUME (ainda offline): enfileira tambem, preservando a ORDEM (pause antes de resume)', async () => {
    api.resumeTrip.mockRejectedValue(new Error('sem conexao'));

    const result = await submitOrQueue({ kind: 'resume', tripId, latitude: -23.52, longitude: -46.62 });

    expect(result.queued).toBe(true);
    const raw = await AsyncStorage.getItem('driverapp.syncQueue');
    const queue = JSON.parse(raw!) as Array<{ kind: string }>;
    expect(queue.map((a) => a.kind)).toEqual(['pause', 'resume']);
  });

  it('5) COMPLETE (ainda offline): tambem enfileira, mantendo a ordem', async () => {
    api.completeTrip.mockRejectedValue(new Error('sem conexao'));

    const result = await submitOrQueue({ kind: 'complete', tripId, finalOdometerKm: 150500 });

    expect(result.queued).toBe(true);
    const raw = await AsyncStorage.getItem('driverapp.syncQueue');
    const queue = JSON.parse(raw!) as Array<{ kind: string }>;
    expect(queue.map((a) => a.kind)).toEqual(['pause', 'resume', 'complete']);
  });

  it('6) SYNC: conexao volta -- flushQueue reenvia as 3 acoes NA ORDEM, e a fila fica vazia ao final', async () => {
    api.pauseTrip.mockResolvedValue({} as never);
    api.resumeTrip.mockResolvedValue({} as never);
    api.completeTrip.mockResolvedValue({} as never);

    const result = await flushQueue();

    expect(result.sent).toBe(3);
    expect(result.remaining).toBe(0);

    const pauseOrder = api.pauseTrip.mock.invocationCallOrder[0]!;
    const resumeOrder = api.resumeTrip.mock.invocationCallOrder[0]!;
    const completeOrder = api.completeTrip.mock.invocationCallOrder[0]!;
    expect(pauseOrder).toBeLessThan(resumeOrder);
    expect(resumeOrder).toBeLessThan(completeOrder);

    const raw = await AsyncStorage.getItem('driverapp.syncQueue');
    expect(JSON.parse(raw!)).toEqual([]);
  });
});
