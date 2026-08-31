import { Prisma, TollDataProvider, TollDataSyncStatus } from '@prisma/client';
import { TollDataSyncService } from './toll-data-sync.service';

// Fase "Atualizacao automatica de Pedagios" -- cobertura da trava de
// concorrencia (secao "verifique se existe protecao contra execucoes
// simultaneas" do pedido): nenhum teste de unidade existia para
// TollDataSyncService antes desta fase (auditoria confirmou -- so
// providers/utils tinham spec). Foco aqui e SO a decisao de
// startRunOrSkip/sync() diante de uma execucao RUNNING concorrente --
// o fluxo completo de sincronizacao (fetch -> applyPlazas/applyTariffs)
// ja e exercitado indiretamente pelos e2e (toll-data.e2e-spec.ts,
// antt-concession-tariff.e2e-spec.ts), sem depender de banco real aqui.
function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
  });
}

function buildService(overrides: {
  create?: jest.Mock;
  findFirst?: jest.Mock;
  update?: jest.Mock;
  findMany?: jest.Mock;
}) {
  const tollDataSyncRun = {
    create: overrides.create ?? jest.fn(),
    findFirst: overrides.findFirst ?? jest.fn(),
    update: overrides.update ?? jest.fn(),
    // Fase "Alertas de sincronizacao" -- checkPersistentFailure consulta as
    // ultimas execucoes do provider; [] por padrao = nunca "falha
    // persistente" (nao e o foco destes testes de concorrencia).
    findMany: overrides.findMany ?? jest.fn().mockResolvedValue([]),
  };
  const tollDataSource = { update: jest.fn().mockResolvedValue({ name: 'ANTT' }) };
  const prisma = { tollDataSyncRun, tollDataSource };
  const sourceService = {
    ensureSource: jest.fn().mockResolvedValue({ id: 'source-1', provider: TollDataProvider.ANTT, enabled: true }),
  };
  const ratesService = {};
  const notifications = {
    resolveTollDataSyncAlerts: jest.fn().mockResolvedValue(0),
    notifyTollDataSyncFailure: jest.fn().mockResolvedValue(0),
  };
  const providers: unknown[] = []; // nenhum provider registrado -- suficiente para os testes de concorrencia (nunca chegam a usar providerImpl).
  const service = new TollDataSyncService(
    prisma as never,
    sourceService as never,
    ratesService as never,
    notifications as never,
    providers as never,
  );
  return { service, prisma, notifications };
}

describe('TollDataSyncService -- protecao contra execucoes simultaneas', () => {
  it('quando NAO ha execucao RUNNING, cria a run normalmente (1 unica vez) e segue o fluxo', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'run-1' });
    const { service } = buildService({ create });

    const outcome = await service.sync(TollDataProvider.ANTT, 'scheduler');

    expect(create).toHaveBeenCalledTimes(1);
    expect(outcome.runId).toBe('run-1');
    // Sem provider registrado no array `providers` do mock -- o proprio
    // fluxo ja existente (nao alterado nesta fase) termina em FAILED por
    // "sem providerImpl", nunca em RUNNING (prova que o caminho normal,
    // sem colisao, nao e afetado pela trava nova).
    expect(outcome.status).toBe(TollDataSyncStatus.FAILED);
  });

  it('quando ja existe RUNNING recente, NUNCA cria uma 2a run nem toca na existente -- retorna status RUNNING referenciando a run ativa', async () => {
    const create = jest.fn().mockRejectedValue(uniqueViolation());
    const activeRun = { id: 'run-active', startedAt: new Date(), provider: TollDataProvider.ANTT };
    const findFirst = jest.fn().mockResolvedValue(activeRun);
    const update = jest.fn();
    const { service } = buildService({ create, findFirst, update });

    const outcome = await service.sync(TollDataProvider.ANTT, 'scheduler');

    expect(create).toHaveBeenCalledTimes(1); // 1 tentativa, nunca retry (nao esta presa).
    expect(update).not.toHaveBeenCalled(); // a run ativa nunca e alterada.
    expect(outcome.status).toBe(TollDataSyncStatus.RUNNING);
    expect(outcome.runId).toBe('run-active');
    expect(outcome.errorMessage).toContain('run-active');
    expect(outcome.recordsCreated).toBe(0);
  });

  it('quando a RUNNING existente esta presa (> 1h), recupera automaticamente: marca a antiga como FAILED e cria uma nova run', async () => {
    const staleStartedAt = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h atras
    const create = jest
      .fn()
      .mockRejectedValueOnce(uniqueViolation())
      .mockResolvedValueOnce({ id: 'run-new' });
    const findFirst = jest.fn().mockResolvedValue({ id: 'run-stuck', startedAt: staleStartedAt });
    const update = jest.fn().mockResolvedValue(undefined);
    const { service } = buildService({ create, findFirst, update });

    const outcome = await service.sync(TollDataProvider.ANTT, 'scheduler');

    expect(create).toHaveBeenCalledTimes(2); // 1a falha (colisao) + retry apos recuperar.
    expect(update).toHaveBeenCalledWith({
      where: { id: 'run-stuck' },
      data: expect.objectContaining({ status: TollDataSyncStatus.FAILED }),
    });
    expect(outcome.runId).toBe('run-new');
    // Segue o fluxo normal (sem provider registrado -> FAILED por falta de providerImpl, nunca RUNNING de novo).
    expect(outcome.status).toBe(TollDataSyncStatus.FAILED);
  });

  it('quando a run presa e recuperada mas OUTRA instancia venceu a corrida no retry, desiste (nunca insiste indefinidamente)', async () => {
    const staleStartedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const create = jest
      .fn()
      .mockRejectedValueOnce(uniqueViolation())
      .mockRejectedValueOnce(uniqueViolation());
    // 1a chamada (dentro de startRunOrSkip, checagem de staleness): acha a
    // run presa. 2a chamada (dentro de sync(), montando a mensagem de skip):
    // a run presa ja foi marcada FAILED e a run vencedora e de OUTRA
    // instancia (fora de visao deste mock) -- retorna null, cenario real de
    // "nao foi possivel identificar quem venceu".
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({ id: 'run-stuck', startedAt: staleStartedAt })
      .mockResolvedValueOnce(null);
    const update = jest.fn().mockResolvedValue(undefined);
    const { service } = buildService({ create, findFirst, update });

    const outcome = await service.sync(TollDataProvider.ANTT, 'scheduler');

    expect(create).toHaveBeenCalledTimes(2);
    expect(outcome.status).toBe(TollDataSyncStatus.RUNNING);
    expect(outcome.runId).toBe(''); // vencedor da corrida e de outra instancia, fora de visao deste mock -- nunca inventa um id.
  });
});

// Fase "Alertas de sincronizacao" -- checkPersistentFailure e privado, entao
// testado atraves do efeito observavel em sync() (chamadas a
// NotificationsService): nunca alerta na 1a falha isolada (retry natural do
// proximo agendamento antes do alerta critico), so na 2a falha CONSECUTIVA;
// sucesso/parcial sempre resolve, mesmo sem ter alertado antes (idempotente).
describe('TollDataSyncService -- alerta de falha persistente', () => {
  it('1a falha isolada (nenhuma execucao anterior) NUNCA gera alerta -- "retry antes do alerta critico"', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'run-1' });
    const findMany = jest.fn().mockResolvedValue([]); // nenhuma execucao anterior.
    const { service, notifications } = buildService({ create, findMany });

    const outcome = await service.sync(TollDataProvider.ANTT, 'scheduler');

    expect(outcome.status).toBe(TollDataSyncStatus.FAILED); // sem providerImpl no mock -- fluxo padrao ja termina em FAILED.
    expect(notifications.notifyTollDataSyncFailure).not.toHaveBeenCalled();
    expect(notifications.resolveTollDataSyncAlerts).not.toHaveBeenCalled();
  });

  it('2a falha CONSECUTIVA (execucao anterior tambem FAILED) gera o alerta critico', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'run-2' });
    const findMany = jest.fn().mockResolvedValue([{ status: TollDataSyncStatus.FAILED }]); // a run imediatamente anterior tambem falhou.
    const { service, notifications } = buildService({ create, findMany });

    const outcome = await service.sync(TollDataProvider.ANTT, 'scheduler');

    expect(outcome.status).toBe(TollDataSyncStatus.FAILED);
    expect(notifications.notifyTollDataSyncFailure).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 'source-1', provider: TollDataProvider.ANTT, runId: 'run-2', sourceName: 'ANTT' }),
    );
    expect(notifications.resolveTollDataSyncAlerts).not.toHaveBeenCalled();
  });

  it('falha atual precedida de uma execucao PARTIAL (nunca FAILED) NUNCA conta como consecutiva -- nao alerta', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'run-3' });
    const findMany = jest.fn().mockResolvedValue([{ status: TollDataSyncStatus.PARTIAL }]); // fonte respondeu por ultimo, nao estava fora do ar.
    const { service, notifications } = buildService({ create, findMany });

    await service.sync(TollDataProvider.ANTT, 'scheduler');

    expect(notifications.notifyTollDataSyncFailure).not.toHaveBeenCalled();
  });

  it('sincronizacao bem-sucedida SEMPRE resolve qualquer alerta aberto da fonte, mesmo sem falha anterior (idempotente)', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'run-ok' });
    const fakeProvider = {
      provider: TollDataProvider.ANTT,
      isAvailable: () => true,
      fetchPlazas: jest.fn().mockResolvedValue({ plazas: [] }),
    };
    const tollDataSyncRun = {
      create,
      findFirst: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    };
    const tollDataSource = { update: jest.fn().mockResolvedValue({ name: 'ANTT' }) };
    const tollPlazaDataSourceLink = { findMany: jest.fn().mockResolvedValue([]) };
    const tollPlaza = { findMany: jest.fn().mockResolvedValue([]) };
    const prisma = { tollDataSyncRun, tollDataSource, tollPlazaDataSourceLink, tollPlaza };
    const sourceService = {
      ensureSource: jest.fn().mockResolvedValue({ id: 'source-1', provider: TollDataProvider.ANTT, enabled: true }),
    };
    const notifications = {
      resolveTollDataSyncAlerts: jest.fn().mockResolvedValue(1),
      notifyTollDataSyncFailure: jest.fn().mockResolvedValue(0),
    };
    const service = new TollDataSyncService(
      prisma as never,
      sourceService as never,
      {} as never,
      notifications as never,
      [fakeProvider] as never,
    );

    const outcome = await service.sync(TollDataProvider.ANTT, 'scheduler');

    expect(outcome.status).toBe(TollDataSyncStatus.SUCCESS);
    expect(notifications.resolveTollDataSyncAlerts).toHaveBeenCalledWith('source-1');
    expect(notifications.notifyTollDataSyncFailure).not.toHaveBeenCalled();
  });
});
