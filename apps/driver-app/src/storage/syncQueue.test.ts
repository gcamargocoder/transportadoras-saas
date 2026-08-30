import AsyncStorage from '@react-native-async-storage/async-storage';
import * as driverChecklistApi from '../api/driverChecklist.api';
import * as driverTripsApi from '../api/driverTrips.api';
import { flushQueue, pendingCount, submitOrQueue } from './syncQueue';

jest.mock('../api/driverTrips.api');
jest.mock('../api/driverChecklist.api');

const api = driverTripsApi as jest.Mocked<typeof driverTripsApi>;
const checklistApi = driverChecklistApi as jest.Mocked<typeof driverChecklistApi>;

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

  // Fase 39 -- checklist operacional. Mesmo padrao dos kinds acima; a
  // CRIACAO da execucao nunca passa por aqui (ver comentario em
  // syncQueue.ts) -- so respostas/evidencia/conclusao.
  describe('CHECKLIST-ANSWERS', () => {
    it('online: envia imediatamente e nao enfileira', async () => {
      checklistApi.submitChecklistAnswers.mockResolvedValue({ created: 1, updated: 0 });

      const result = await submitOrQueue({
        kind: 'checklist-answers',
        executionId: 'exec-1',
        answers: [{ itemId: 'item-1', booleanValue: true }],
      });

      expect(result.queued).toBe(false);
      expect(checklistApi.submitChecklistAnswers).toHaveBeenCalledWith('exec-1', [
        { itemId: 'item-1', booleanValue: true },
      ]);
      expect(await pendingCount()).toBe(0);
    });

    it('offline: entra na fila', async () => {
      checklistApi.submitChecklistAnswers.mockRejectedValue(new Error('network down'));

      const result = await submitOrQueue({
        kind: 'checklist-answers',
        executionId: 'exec-1',
        answers: [{ itemId: 'item-1', booleanValue: false }],
      });

      expect(result.queued).toBe(true);
      expect(await pendingCount()).toBe(1);
    });
  });

  describe('CHECKLIST-COMPLETE', () => {
    it('online: envia imediatamente', async () => {
      checklistApi.completeChecklist.mockResolvedValue({} as never);

      const result = await submitOrQueue({ kind: 'checklist-complete', executionId: 'exec-1' });

      expect(result.queued).toBe(false);
      expect(checklistApi.completeChecklist).toHaveBeenCalledWith('exec-1');
    });

    it('offline: entra na fila', async () => {
      checklistApi.completeChecklist.mockRejectedValue(new Error('network down'));

      const result = await submitOrQueue({ kind: 'checklist-complete', executionId: 'exec-1' });

      expect(result.queued).toBe(true);
      expect(await pendingCount()).toBe(1);
    });

    it('reenviar complete numa execucao ja concluida nao duplica localmente (idempotencia fica no backend)', async () => {
      checklistApi.completeChecklist.mockResolvedValue({} as never);

      await submitOrQueue({ kind: 'checklist-complete', executionId: 'exec-1' });
      await submitOrQueue({ kind: 'checklist-complete', executionId: 'exec-1' });

      expect(checklistApi.completeChecklist).toHaveBeenCalledTimes(2);
      expect(await pendingCount()).toBe(0);
    });
  });

  // Fase 43 -- controle de paradas offline-first. stop-open ja existia
  // como kind desde a Fase 25 (so nao era usado por nenhuma tela); stop-close
  // e novo: fecha pelo deviceEventId da ABERTURA (nao pelo id do servidor),
  // por isso funciona mesmo quando a propria abertura ainda esta pendente.
  describe('STOP-OPEN/STOP-CLOSE', () => {
    it('STOP-OPEN online: envia imediatamente e nao enfileira', async () => {
      api.openStop.mockResolvedValue({} as never);

      const result = await submitOrQueue({
        kind: 'stop-open',
        tripId: 'trip-1',
        deviceEventId: 'dev-open-1',
        type: 'LOADING',
        latitude: -23.5,
        longitude: -46.6,
        startedAt: '2026-09-01T08:00:00.000Z',
      });

      expect(result.queued).toBe(false);
      expect(api.openStop).toHaveBeenCalledWith('trip-1', {
        deviceEventId: 'dev-open-1',
        type: 'LOADING',
        latitude: -23.5,
        longitude: -46.6,
        startedAt: '2026-09-01T08:00:00.000Z',
      });
    });

    it('STOP-OPEN offline: entra na fila e nao lanca erro', async () => {
      api.openStop.mockRejectedValue(new Error('network down'));

      const result = await submitOrQueue({
        kind: 'stop-open',
        tripId: 'trip-1',
        deviceEventId: 'dev-open-2',
        latitude: -23.5,
        longitude: -46.6,
        startedAt: '2026-09-01T08:00:00.000Z',
      });

      expect(result.queued).toBe(true);
      expect(await pendingCount()).toBe(1);
    });

    it('STOP-CLOSE online: fecha pelo deviceEventId usado na abertura', async () => {
      api.closeStopByDeviceEvent.mockResolvedValue({} as never);

      const result = await submitOrQueue({
        kind: 'stop-close',
        tripId: 'trip-1',
        deviceEventId: 'dev-open-1',
        endedAt: '2026-09-01T08:30:00.000Z',
      });

      expect(result.queued).toBe(false);
      expect(api.closeStopByDeviceEvent).toHaveBeenCalledWith('trip-1', {
        deviceEventId: 'dev-open-1',
        endedAt: '2026-09-01T08:30:00.000Z',
      });
    });

    it('STOP-CLOSE offline: entra na fila mesmo com a abertura ainda pendente (mesmo deviceEventId)', async () => {
      api.openStop.mockRejectedValue(new Error('network down'));
      await submitOrQueue({
        kind: 'stop-open',
        tripId: 'trip-1',
        deviceEventId: 'dev-open-3',
        latitude: -23.5,
        longitude: -46.6,
        startedAt: '2026-09-01T08:00:00.000Z',
      });

      api.closeStopByDeviceEvent.mockRejectedValue(new Error('network down'));
      const result = await submitOrQueue({
        kind: 'stop-close',
        tripId: 'trip-1',
        deviceEventId: 'dev-open-3',
        endedAt: '2026-09-01T08:15:00.000Z',
      });

      expect(result.queued).toBe(true);
      expect(await pendingCount()).toBe(2);

      // Reconexao: flush processa na ordem (abertura antes do fechamento).
      api.openStop.mockResolvedValue({} as never);
      api.closeStopByDeviceEvent.mockResolvedValue({} as never);
      const flushResult = await flushQueue();

      expect(flushResult.sent).toBe(2);
      expect(flushResult.remaining).toBe(0);
      // 2 chamadas cada -- a 1a tentativa (offline, rejeitada) + o retry no
      // flush (mesmo padrao de CHECKLIST-EVIDENCE acima).
      expect(api.openStop).toHaveBeenCalledTimes(2);
      expect(api.closeStopByDeviceEvent).toHaveBeenCalledTimes(2);
    });
  });

  describe('CHECKLIST-EVIDENCE', () => {
    it('online: envia o arquivo local (path persistido) imediatamente', async () => {
      checklistApi.uploadChecklistEvidence.mockResolvedValue({} as never);

      const result = await submitOrQueue({
        kind: 'checklist-evidence',
        executionId: 'exec-1',
        deviceEventId: 'dev-1',
        type: 'GENERAL',
        itemId: 'item-2',
        localFileUri: 'file:///docs/checklist-evidence/foto.jpg',
        fileName: 'foto.jpg',
        mimeType: 'image/jpeg',
      });

      expect(result.queued).toBe(false);
      expect(checklistApi.uploadChecklistEvidence).toHaveBeenCalledWith(
        'exec-1',
        { deviceEventId: 'dev-1', type: 'GENERAL', itemId: 'item-2' },
        { uri: 'file:///docs/checklist-evidence/foto.jpg', name: 'foto.jpg', type: 'image/jpeg' },
      );
    });

    it('offline: entra na fila -- o arquivo local persistido garante que a foto nao se perde', async () => {
      checklistApi.uploadChecklistEvidence.mockRejectedValue(new Error('network down'));

      const result = await submitOrQueue({
        kind: 'checklist-evidence',
        executionId: 'exec-1',
        deviceEventId: 'dev-2',
        type: 'SIGNATURE',
        itemId: 'item-3',
        localFileUri: 'file:///docs/checklist-evidence/assinatura.png',
        fileName: 'assinatura.png',
        mimeType: 'image/png',
      });

      expect(result.queued).toBe(true);
      expect(await pendingCount()).toBe(1);
    });

    it('retry apos reconexao envia a mesma evidencia (deviceEventId identico) -- idempotencia fica no backend', async () => {
      checklistApi.uploadChecklistEvidence.mockRejectedValueOnce(new Error('offline'));
      await submitOrQueue({
        kind: 'checklist-evidence',
        executionId: 'exec-1',
        deviceEventId: 'dev-3',
        type: 'GENERAL',
        itemId: 'item-4',
        localFileUri: 'file:///docs/checklist-evidence/foto2.jpg',
        fileName: 'foto2.jpg',
        mimeType: 'image/jpeg',
      });
      expect(await pendingCount()).toBe(1);

      checklistApi.uploadChecklistEvidence.mockResolvedValue({} as never);
      const result = await flushQueue();

      expect(result.sent).toBe(1);
      expect(result.remaining).toBe(0);
      const [, fields] = checklistApi.uploadChecklistEvidence.mock.calls[1]!;
      expect(fields.deviceEventId).toBe('dev-3');
    });
  });

  // Fase 56 -- comprovante de entrega. Mesmo padrao exato de
  // CHECKLIST-EVIDENCE acima (arquivo local persistido + deviceEventId) --
  // nenhuma fila/mecanismo de retry novo.
  describe('DELIVERY-PROOF', () => {
    it('online: envia o arquivo local (path persistido) imediatamente', async () => {
      api.submitDeliveryProof.mockResolvedValue({} as never);

      const result = await submitOrQueue({
        kind: 'delivery-proof',
        tripId: 'trip-1',
        deviceEventId: 'dev-dp-1',
        capturedAt: '2026-09-01T14:00:00.000Z',
        localFileUri: 'file:///docs/delivery-proof/foto.jpg',
        fileName: 'foto.jpg',
        mimeType: 'image/jpeg',
      });

      expect(result.queued).toBe(false);
      expect(api.submitDeliveryProof).toHaveBeenCalledWith(
        'trip-1',
        { deviceEventId: 'dev-dp-1', capturedAt: '2026-09-01T14:00:00.000Z' },
        { uri: 'file:///docs/delivery-proof/foto.jpg', name: 'foto.jpg', type: 'image/jpeg' },
      );
    });

    it('online com observacao: repassa o campo para a API', async () => {
      api.submitDeliveryProof.mockResolvedValue({} as never);

      await submitOrQueue({
        kind: 'delivery-proof',
        tripId: 'trip-1',
        deviceEventId: 'dev-dp-2',
        capturedAt: '2026-09-01T14:05:00.000Z',
        observation: 'Entregue ao porteiro',
        localFileUri: 'file:///docs/delivery-proof/foto2.jpg',
        fileName: 'foto2.jpg',
        mimeType: 'image/jpeg',
      });

      expect(api.submitDeliveryProof).toHaveBeenCalledWith(
        'trip-1',
        { deviceEventId: 'dev-dp-2', capturedAt: '2026-09-01T14:05:00.000Z', observation: 'Entregue ao porteiro' },
        expect.anything(),
      );
    });

    // Fase 106 -- vinculo opcional com uma parada especifica (tripDeliveryStopId).
    it('com tripDeliveryStopId: repassa o vinculo a API', async () => {
      api.submitDeliveryProof.mockResolvedValue({} as never);

      await submitOrQueue({
        kind: 'delivery-proof',
        tripId: 'trip-1',
        deviceEventId: 'dev-dp-4',
        tripDeliveryStopId: 'stop-1',
        capturedAt: '2026-09-01T14:15:00.000Z',
        localFileUri: 'file:///docs/delivery-proof/foto4.jpg',
        fileName: 'foto4.jpg',
        mimeType: 'image/jpeg',
      });

      expect(api.submitDeliveryProof).toHaveBeenCalledWith(
        'trip-1',
        { deviceEventId: 'dev-dp-4', capturedAt: '2026-09-01T14:15:00.000Z', tripDeliveryStopId: 'stop-1' },
        expect.anything(),
      );
    });

    it('offline: entra na fila, persiste no AsyncStorage (sobrevive a reinicializacao do app) e o retry apos reconexao usa o mesmo deviceEventId', async () => {
      api.submitDeliveryProof.mockRejectedValueOnce(new Error('network down'));

      const result = await submitOrQueue({
        kind: 'delivery-proof',
        tripId: 'trip-1',
        deviceEventId: 'dev-dp-3',
        capturedAt: '2026-09-01T14:10:00.000Z',
        localFileUri: 'file:///docs/delivery-proof/foto3.jpg',
        fileName: 'foto3.jpg',
        mimeType: 'image/jpeg',
      });
      expect(result.queued).toBe(true);
      expect(await pendingCount()).toBe(1);

      // "Estado apos reinicializacao" -- a fila vive no AsyncStorage
      // (persistente), nunca em memoria volatil: ler diretamente a chave
      // simula o app sendo fechado/reaberto sem perder o item pendente.
      const raw = await AsyncStorage.getItem('driverapp.syncQueue');
      const queue = JSON.parse(raw!) as Array<{ kind: string; deviceEventId?: string }>;
      expect(queue.some((a) => a.kind === 'delivery-proof' && a.deviceEventId === 'dev-dp-3')).toBe(true);

      // Reconexao: flushQueue reenvia o MESMO deviceEventId -- idempotencia
      // real fica no backend (FiscalDocument.deviceEventId, unique).
      api.submitDeliveryProof.mockResolvedValue({} as never);
      const flushResult = await flushQueue();
      expect(flushResult.sent).toBe(1);
      expect(flushResult.remaining).toBe(0);
      const [, fields] = api.submitDeliveryProof.mock.calls[1]!;
      expect(fields.deviceEventId).toBe('dev-dp-3');
    });
  });

  // Fase 106 -- transicao de status de parada/entrega planejada pelo
  // motorista. Mesmo padrao exato de PAUSE/RESUME/COMPLETE acima:
  // idempotente por ESTADO (nunca deviceEventId).
  describe('DELIVERY-STOP-STATUS', () => {
    it('online: envia imediatamente e nao enfileira', async () => {
      api.updateDeliveryStopStatus.mockResolvedValue({} as never);

      const result = await submitOrQueue({
        kind: 'delivery-stop-status',
        tripId: 'trip-1',
        stopId: 'stop-1',
        status: 'IN_PROGRESS',
      });

      expect(result.queued).toBe(false);
      expect(api.updateDeliveryStopStatus).toHaveBeenCalledWith('trip-1', 'stop-1', { status: 'IN_PROGRESS' });
      expect(await pendingCount()).toBe(0);
    });

    it('com reason (FAILED): repassa o motivo', async () => {
      api.updateDeliveryStopStatus.mockResolvedValue({} as never);

      await submitOrQueue({
        kind: 'delivery-stop-status',
        tripId: 'trip-1',
        stopId: 'stop-1',
        status: 'FAILED',
        reason: 'Endereco nao encontrado',
      });

      expect(api.updateDeliveryStopStatus).toHaveBeenCalledWith('trip-1', 'stop-1', {
        status: 'FAILED',
        reason: 'Endereco nao encontrado',
      });
    });

    it('offline: entra na fila e nao lanca erro', async () => {
      api.updateDeliveryStopStatus.mockRejectedValue(new Error('network down'));

      const result = await submitOrQueue({
        kind: 'delivery-stop-status',
        tripId: 'trip-1',
        stopId: 'stop-1',
        status: 'COMPLETED',
      });

      expect(result.queued).toBe(true);
      expect(await pendingCount()).toBe(1);
    });

    it('retry apos reconexao reenvia a mesma transicao -- idempotencia de ESTADO fica no backend (status repetido = no-op)', async () => {
      api.updateDeliveryStopStatus.mockRejectedValueOnce(new Error('offline'));
      await submitOrQueue({ kind: 'delivery-stop-status', tripId: 'trip-1', stopId: 'stop-1', status: 'COMPLETED' });
      expect(await pendingCount()).toBe(1);

      api.updateDeliveryStopStatus.mockResolvedValue({} as never);
      const result = await flushQueue();

      expect(result.sent).toBe(1);
      expect(result.remaining).toBe(0);
    });
  });
});
