import AsyncStorage from '@react-native-async-storage/async-storage';
import * as driverTripsApi from '../api/driverTrips.api';
import { flushQueue, pendingCount, submitOrQueue } from './syncQueue';

jest.mock('../api/driverTrips.api');

const api = driverTripsApi as jest.Mocked<typeof driverTripsApi>;

// Fase 31, Parte 5 -- fila offline (pause/resume/complete). Reaproveita
// integralmente o mock oficial de AsyncStorage (em memoria, ver
// jest.config.js) -- nenhum mecanismo de persistencia novo e testado aqui.
describe('syncQueue -- pause/resume/complete', () => {
  beforeEach(async () => {
    // clearAllMocks (nao resetAllMocks): resetAllMocks apagaria tambem a
    // IMPLEMENTACAO do mock oficial de AsyncStorage (cada metodo dele e um
    // jest.fn(implementacaoReal) -- resetar removeria essa implementacao e
    // quebraria a persistencia em memoria simulada).
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  describe('PAUSE', () => {
    it('online: envia imediatamente e nao enfileira', async () => {
      api.pauseTrip.mockResolvedValue({} as never);

      const result = await submitOrQueue({ kind: 'pause', tripId: 'trip-1', latitude: -23.5, longitude: -46.6 });

      expect(result.queued).toBe(false);
      expect(api.pauseTrip).toHaveBeenCalledTimes(1);
      expect(api.pauseTrip).toHaveBeenCalledWith('trip-1', { latitude: -23.5, longitude: -46.6 });
      expect(await pendingCount()).toBe(0);
    });

    it('offline: entra na fila e nao lanca erro para quem chamou', async () => {
      api.pauseTrip.mockRejectedValue(new Error('network down'));

      const result = await submitOrQueue({ kind: 'pause', tripId: 'trip-1' });

      expect(result.queued).toBe(true);
      expect(await pendingCount()).toBe(1);
    });
  });

  describe('RESUME', () => {
    it('online: envia imediatamente e nao enfileira', async () => {
      api.resumeTrip.mockResolvedValue({} as never);

      const result = await submitOrQueue({ kind: 'resume', tripId: 'trip-1' });

      expect(result.queued).toBe(false);
      expect(api.resumeTrip).toHaveBeenCalledWith('trip-1', undefined);
      expect(await pendingCount()).toBe(0);
    });

    it('offline: entra na fila', async () => {
      api.resumeTrip.mockRejectedValue(new Error('network down'));

      const result = await submitOrQueue({ kind: 'resume', tripId: 'trip-1' });

      expect(result.queued).toBe(true);
      expect(await pendingCount()).toBe(1);
    });
  });

  describe('COMPLETE', () => {
    it('online: envia imediatamente com KM final', async () => {
      api.completeTrip.mockResolvedValue({} as never);

      const result = await submitOrQueue({ kind: 'complete', tripId: 'trip-1', finalOdometerKm: 150000 });

      expect(result.queued).toBe(false);
      expect(api.completeTrip).toHaveBeenCalledWith('trip-1', { finalOdometerKm: 150000 });
    });

    it('offline: entra na fila', async () => {
      api.completeTrip.mockRejectedValue(new Error('network down'));

      const result = await submitOrQueue({ kind: 'complete', tripId: 'trip-1', finalOdometerKm: 150000 });

      expect(result.queued).toBe(true);
      expect(await pendingCount()).toBe(1);
    });
  });

  describe('sincronizacao (flushQueue)', () => {
    it('processa itens pendentes na ordem em que foram criados', async () => {
      api.pauseTrip.mockRejectedValue(new Error('offline'));
      await submitOrQueue({ kind: 'pause', tripId: 'trip-1' });
      api.resumeTrip.mockRejectedValue(new Error('offline'));
      await submitOrQueue({ kind: 'resume', tripId: 'trip-1' });
      expect(await pendingCount()).toBe(2);

      // Conexao volta -- os dois passam a funcionar.
      api.pauseTrip.mockResolvedValue({} as never);
      api.resumeTrip.mockResolvedValue({} as never);

      const result = await flushQueue();

      expect(result.sent).toBe(2);
      expect(result.remaining).toBe(0);
      expect(await pendingCount()).toBe(0);

      const pauseOrder = api.pauseTrip.mock.invocationCallOrder[0]!;
      const resumeOrder = api.resumeTrip.mock.invocationCallOrder[0]!;
      expect(pauseOrder).toBeLessThan(resumeOrder);
    });

    it('item concluido e removido da fila; item que ainda falha permanece para retry (sem reordenar)', async () => {
      api.pauseTrip.mockRejectedValue(new Error('offline'));
      await submitOrQueue({ kind: 'pause', tripId: 'trip-1' });
      api.resumeTrip.mockRejectedValue(new Error('offline'));
      await submitOrQueue({ kind: 'resume', tripId: 'trip-1' });
      expect(await pendingCount()).toBe(2);

      // So a rede para o PRIMEIRO item (pause) volta -- flushQueue processa o
      // pause (sucesso, sai da fila) e SO ENTAO tenta o proximo (resume, que
      // ainda falha) -- para ali, nunca reordena o resume na frente do pause.
      api.pauseTrip.mockResolvedValue({} as never);

      const result = await flushQueue();

      expect(result.sent).toBe(1);
      expect(result.remaining).toBe(1);
      expect(await pendingCount()).toBe(1);
      // 1a chamada veio do submitOrQueue offline inicial, 2a veio do flush --
      // as duas falharam, o item permanece na fila.
      expect(api.resumeTrip).toHaveBeenCalledTimes(2);
    });

    it('nao duplica: reenviar flushQueue depois de sincronizado nao rechama a API', async () => {
      api.pauseTrip.mockRejectedValueOnce(new Error('offline'));
      await submitOrQueue({ kind: 'pause', tripId: 'trip-1' });
      api.pauseTrip.mockResolvedValue({} as never);

      await flushQueue();
      expect(api.pauseTrip).toHaveBeenCalledTimes(2); // 1 falha + 1 sucesso no flush

      await flushQueue(); // fila ja vazia
      expect(api.pauseTrip).toHaveBeenCalledTimes(2); // nao chamou de novo
    });
  });

  describe('idempotencia (client-side)', () => {
    it('pausar duas vezes online chama a API duas vezes -- idempotencia de ESTADO fica a cargo do backend (pausar 2x = PAUSED->PAUSED)', async () => {
      api.pauseTrip.mockResolvedValue({} as never);

      await submitOrQueue({ kind: 'pause', tripId: 'trip-1' });
      await submitOrQueue({ kind: 'pause', tripId: 'trip-1' });

      expect(api.pauseTrip).toHaveBeenCalledTimes(2);
      expect(await pendingCount()).toBe(0); // nenhuma das duas ficou pendente
    });

    it('finalizar duas vezes offline enfileira as duas tentativas, sem mesclar -- o backend resolve por idempotencia de status ao sincronizar', async () => {
      api.completeTrip.mockRejectedValue(new Error('offline'));

      await submitOrQueue({ kind: 'complete', tripId: 'trip-1', finalOdometerKm: 150000 });
      await submitOrQueue({ kind: 'complete', tripId: 'trip-1', finalOdometerKm: 150000 });

      expect(await pendingCount()).toBe(2);

      api.completeTrip.mockResolvedValue({} as never);
      const result = await flushQueue();

      // As duas sao reenviadas no flush (+ as 2 tentativas offline iniciais
      // = 4 chamadas ao cliente HTTP) -- o segundo complete() no BACKEND e
      // um no-op (viagem ja COMPLETED), nunca duplica o encerramento (ver
      // driver-trips.e2e-spec.ts "finalizacao e idempotente"); do lado do
      // cliente, a fila nunca tenta "mesclar" ou deduplicar as duas acoes.
      expect(result.sent).toBe(2);
      expect(api.completeTrip).toHaveBeenCalledTimes(4);
    });
  });
});
