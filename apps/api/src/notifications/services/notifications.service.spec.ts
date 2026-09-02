import { AlertSeverity, FiscalDocumentStatus, NotificationType } from '@prisma/client';
import { NotificationsService } from './notifications.service';

// Fase 70 -- unidade (secao 23 do pedido): DELIVERY_PROOF_PENDING/PROBLEM,
// destinatarios (role + motorista direto), deduplicacao/idempotencia e
// janela de processamento, sem depender de banco real (PrismaService
// totalmente mockado) -- complementa a cobertura via banco real de
// notifications.e2e-spec.ts.
function emptyFindMany() {
  return jest.fn().mockResolvedValue([]);
}

function buildPrismaMock(overrides: Record<string, unknown> = {}) {
  return {
    notification: {
      findMany: emptyFindMany(),
      count: jest.fn().mockResolvedValue(0),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      // Fase "Alertas de sincronizacao" -- notifyTollDataSyncFailure/
      // resolveTollDataSyncAlerts usam findFirst (checagem de alerta ja
      // aberto) e updateMany (auto-resolucao), nunca usados antes deste tipo.
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    tripOccurrence: { findMany: emptyFindMany() },
    vehicle: { findMany: emptyFindMany() },
    vehicleMaintenance: { findMany: emptyFindMany() },
    // Fase A -- collectIdleVehicles le TenantSettings.preferences para o
    // limiar de ociosidade; null = sem limiar = coletor retorna [] cedo
    // (nenhum outro teste desta suite e afetado).
    tenantSettings: { findUnique: jest.fn().mockResolvedValue(null) },
    // Fase 108 -- collectMaintenancePlansDue; Fase 110 -- collectTireLifespanNearReplacement
    // (via tireMovement); Fase 111 -- collectChecklistCriticalNonConformity.
    // Estes 3 nunca tinham sido adicionados a este mock (spec nunca foi
    // atualizado quando os coletores foram criados) -- gap real encontrado
    // e corrigido durante a auditoria da Fase 111 (a suite inteira falhava
    // com "Cannot read properties of undefined" antes desta correcao).
    maintenancePlan: { findMany: emptyFindMany() },
    tireMovement: { findMany: emptyFindMany() },
    checklistExecution: { findMany: emptyFindMany() },
    tire: { findMany: emptyFindMany() },
    fuelSupply: { findMany: emptyFindMany() },
    fiscalDocument: { findMany: emptyFindMany() },
    trip: { findMany: emptyFindMany() },
    driver: { findMany: emptyFindMany() },
    tripBilling: { findMany: emptyFindMany() },
    contract: { findMany: emptyFindMany() },
    userAccount: { findMany: jest.fn().mockResolvedValue([]) },
    tenant: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides,
  };
}

function buildService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = buildPrismaMock(prismaOverrides);
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new NotificationsService(prisma as never, audit as never);
  return { service, prisma };
}

const TENANT_ID = 'tenant-1';

describe('NotificationsService -- DELIVERY_PROOF_PENDING/PROBLEM (Fase 70)', () => {
  it('comprovante PENDING vira candidato DELIVERY_PROOF_PENDING com o motorista como destinatario direto', async () => {
    const { service, prisma } = buildService({
      fiscalDocument: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'doc-1',
            tripId: 'trip-1',
            trip: {
              driver: { userAccountId: 'driver-user-1', isActive: true },
              origin: { name: 'SP' },
              destination: { name: 'RJ' },
            },
          },
        ]),
      },
      userAccount: { findMany: jest.fn().mockResolvedValue([{ id: 'admin-1', role: 'ADMIN' }]) },
    });

    await service.processTenant(TENANT_ID);

    const createManyCall = (prisma.notification.createMany as jest.Mock).mock.calls[0][0];
    const rows = createManyCall.data as Array<Record<string, unknown>>;
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: NotificationType.DELIVERY_PROOF_PENDING, recipientId: 'driver-user-1', entityId: 'doc-1' }),
        expect.objectContaining({ type: NotificationType.DELIVERY_PROOF_PENDING, recipientId: 'admin-1', entityId: 'doc-1' }),
      ]),
    );
    // Nunca duplica o mesmo destinatario (Set na uniao role+direto).
    const forDriver = rows.filter((r) => r.recipientId === 'driver-user-1' && r.type === NotificationType.DELIVERY_PROOF_PENDING);
    expect(forDriver).toHaveLength(1);
  });

  it('comprovante INVALID/CANCELLED vira candidato DELIVERY_PROOF_PROBLEM (severidade HIGH)', async () => {
    // fiscalDocument.findMany e compartilhado por 3 coletores diferentes
    // (DELIVERY_PROOF_PENDING/PROBLEM + FISCAL_DOCUMENT_PROBLEM) -- o mock
    // precisa distinguir pela mesma condicao real da producao
    // (where.documentType=DELIVERY_PROOF) para nao "vazar" a mesma linha
    // para o coletor generico, que nao filtra documentType.
    const { service, prisma } = buildService({
      fiscalDocument: {
        findMany: jest.fn().mockImplementation((args: { where: { documentType?: string; status?: unknown } }) => {
          const isProblemQuery = args.where.documentType === 'DELIVERY_PROOF' && typeof args.where.status === 'object';
          if (!isProblemQuery) return Promise.resolve([]);
          return Promise.resolve([
            {
              id: 'doc-2',
              tripId: 'trip-2',
              status: FiscalDocumentStatus.INVALID,
              trip: { driver: null, origin: { name: 'SP' }, destination: { name: 'BH' } },
            },
          ]);
        }),
      },
      userAccount: { findMany: jest.fn().mockResolvedValue([{ id: 'admin-1', role: 'ADMIN' }]) },
    });

    await service.processTenant(TENANT_ID);

    const rows = (prisma.notification.createMany as jest.Mock).mock.calls[0][0].data as Array<Record<string, unknown>>;
    expect(rows.every((r) => r.type === NotificationType.DELIVERY_PROOF_PROBLEM)).toBe(true);
    expect(rows.every((r) => r.severity === AlertSeverity.HIGH)).toBe(true);
  });

  it('motorista sem userAccountId ou inativo NUNCA vira destinatario direto', async () => {
    const { service, prisma } = buildService({
      fiscalDocument: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'doc-3', tripId: 'trip-3', trip: { driver: { userAccountId: null, isActive: true }, origin: { name: 'A' }, destination: { name: 'B' } } },
          {
            id: 'doc-4',
            tripId: 'trip-4',
            trip: { driver: { userAccountId: 'user-inactive', isActive: false }, origin: { name: 'A' }, destination: { name: 'B' } },
          },
        ]),
      },
    });

    await service.processTenant(TENANT_ID);

    // Sem role elegivel carregada (userAccount.findMany mockado vazio) e
    // sem destinatario direto valido: nenhuma linha gerada para estes docs,
    // createMany nem chega a ser executado (rows.length===0).
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('linha sem tripId/trip nunca vira candidato (nunca inventa viagem)', async () => {
    const { service, prisma } = buildService({
      fiscalDocument: {
        findMany: jest.fn().mockResolvedValue([{ id: 'doc-5', tripId: null, trip: null }]),
      },
    });

    await service.processTenant(TENANT_ID);
    expect((prisma.notification.createMany as jest.Mock)).not.toHaveBeenCalled();
  });
});

describe('NotificationsService -- deduplicacao/idempotencia do processamento', () => {
  it('processTenant usa createMany com skipDuplicates (nunca findFirst-then-create)', async () => {
    const { service, prisma } = buildService({
      tripOccurrence: {
        findMany: jest.fn().mockResolvedValue([{ id: 'occ-1', type: 'BREAKDOWN', tripId: 'trip-1', description: 'x' }]),
      },
      userAccount: { findMany: jest.fn().mockResolvedValue([{ id: 'admin-1', role: 'ADMIN' }]) },
    });

    await service.processTenant(TENANT_ID);

    expect(prisma.notification.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
    // Fase "Alertas de sincronizacao" -- findFirst passou a existir no mock
    // (usado por notifyTollDataSyncFailure, um metodo DIFERENTE, nunca
    // chamado por processTenant/collectCandidates) -- o invariante real
    // continua o mesmo: processTenant nunca o chama.
    expect(prisma.notification.findFirst).not.toHaveBeenCalled();
  });

  it('sem candidatos, nunca chama createMany (evita insert vazio)', async () => {
    const { service, prisma } = buildService();
    const created = await service.processTenant(TENANT_ID);
    expect(created).toBe(0);
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('processAllTenants processa cada tenant ativo isoladamente e segue mesmo se um tenant falhar', async () => {
    const prisma = buildPrismaMock({
      tenant: { findMany: jest.fn().mockResolvedValue([{ id: 'tenant-a' }, { id: 'tenant-b' }]) },
    });
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new NotificationsService(prisma as never, audit as never);

    const processTenantSpy = jest
      .spyOn(service, 'processTenant')
      .mockRejectedValueOnce(new Error('falha simulada no tenant-a'))
      .mockResolvedValueOnce(3);

    const result = await service.processAllTenants();

    expect(processTenantSpy).toHaveBeenCalledTimes(2);
    expect(processTenantSpy).toHaveBeenNthCalledWith(1, 'tenant-a');
    expect(processTenantSpy).toHaveBeenNthCalledWith(2, 'tenant-b');
    // tenant-a falhou mas nao interrompe o processamento de tenant-b.
    expect(result).toEqual({ tenantsProcessed: 2, notificationsCreated: 3 });
  });

  it('so consulta tenants ATIVOS (isActive:true)', async () => {
    const { service, prisma } = buildService();
    await service.processAllTenants();
    expect(prisma.tenant.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
  });
});

describe('NotificationsService -- leitura pura (Fase 70)', () => {
  it('getUnreadCount NUNCA chama createMany/findMany de candidatos -- so 2 counts', async () => {
    const { service, prisma } = buildService();
    await service.getUnreadCount(TENANT_ID, 'user-1');

    expect(prisma.notification.count).toHaveBeenCalledTimes(2);
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
    expect(prisma.tripOccurrence.findMany).not.toHaveBeenCalled();
    expect(prisma.fiscalDocument.findMany).not.toHaveBeenCalled();
  });

  it('findAllForUser NUNCA chama createMany/coletores -- so findMany+count de Notification', async () => {
    const { service, prisma } = buildService();
    await service.findAllForUser(TENANT_ID, 'user-1', { page: 1, pageSize: 20 } as never);

    expect(prisma.notification.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.notification.count).toHaveBeenCalledTimes(1);
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
    expect(prisma.fiscalDocument.findMany).not.toHaveBeenCalled();
  });
});

describe('NotificationsService -- janela de processamento (secao 20 do pedido)', () => {
  it('manutencao: so busca status em aberto com scheduledAt <= agora (nunca todo o historico)', async () => {
    const { service, prisma } = buildService();
    await service.processTenant(TENANT_ID);

    const call = (prisma.vehicleMaintenance.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).toMatchObject({ tenantId: TENANT_ID, status: { notIn: expect.any(Array) } });
    expect(call.where.scheduledAt).toHaveProperty('lte');
  });

  it('viagem atrasada: so status nao-terminal com plannedArrival no passado', async () => {
    const { service, prisma } = buildService();
    await service.processTenant(TENANT_ID);

    const call = (prisma.trip.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).toMatchObject({ tenantId: TENANT_ID, deletedAt: null });
    expect(call.where.plannedArrival).toHaveProperty('lt');
  });

  it('ocorrencia critica: so severity=CRITICAL e ainda aberta (resolvedAt/cancelledAt nulos)', async () => {
    const { service, prisma } = buildService();
    await service.processTenant(TENANT_ID);

    const call = (prisma.tripOccurrence.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).toMatchObject({ tenantId: TENANT_ID, resolvedAt: null, cancelledAt: null });
  });
});

// Fase "Alertas de sincronizacao" -- notifyTollDataSyncFailure/
// resolveTollDataSyncAlerts sao chamados por TollDataSyncService (evento),
// nunca pelo scan periodico por tenant -- por isso testados a parte,
// nunca via processTenant/collectCandidates.
describe('NotificationsService -- alertas de sincronizacao de pedagio', () => {
  it('nao cria nenhuma notificacao quando nenhum tenant tem o modulo TOLLS habilitado', async () => {
    const { service, prisma } = buildService({ tenant: { findMany: jest.fn().mockResolvedValue([]) } });

    const count = await service.notifyTollDataSyncFailure({
      sourceId: 'source-1',
      provider: 'ANTT_TARIFAS' as never,
      sourceName: 'ANTT - Tarifas',
      runId: 'run-1',
      errorMessage: 'pagina fora do ar',
    });

    expect(count).toBe(0);
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('cria 1 notificacao CRITICAL por SUPER_ADMIN de cada tenant com TOLLS habilitado, com sourceId/provider/runId em metadata', async () => {
    const { service, prisma } = buildService({
      tenant: { findMany: jest.fn().mockResolvedValue([{ id: 'tenant-1' }, { id: 'tenant-2' }]) },
      userAccount: { findMany: jest.fn().mockResolvedValue([{ id: 'admin-1', tenantId: 'tenant-1' }, { id: 'admin-2', tenantId: 'tenant-2' }]) },
      notification: { findFirst: jest.fn().mockResolvedValue(null), createMany: jest.fn().mockResolvedValue({ count: 2 }) },
    });

    const count = await service.notifyTollDataSyncFailure({
      sourceId: 'source-1',
      provider: 'ANTT_TARIFAS' as never,
      sourceName: 'ANTT - Tarifas',
      runId: 'run-2',
      errorMessage: 'pagina-indice fora do ar',
    });

    expect(count).toBe(2);
    const rows = (prisma.notification.createMany as jest.Mock).mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      tenantId: 'tenant-1',
      recipientId: 'admin-1',
      type: NotificationType.TOLL_DATA_SYNC_FAILURE,
      severity: AlertSeverity.CRITICAL,
      entityType: 'TollDataSource',
      entityId: 'run-2', // nunca sourceId fixo -- ver comentario do enum no schema.
      metadata: { sourceId: 'source-1', provider: 'ANTT_TARIFAS', runId: 'run-2' },
    });
  });

  it('NUNCA cria uma 2a notificacao enquanto ja existir uma nao lida para a mesma fonte (mesmo episodio de falha, sem spam)', async () => {
    const { service, prisma } = buildService({
      tenant: { findMany: jest.fn().mockResolvedValue([{ id: 'tenant-1' }]) },
      notification: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing-alert' }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    });

    const count = await service.notifyTollDataSyncFailure({
      sourceId: 'source-1',
      provider: 'ANTT_TARIFAS' as never,
      sourceName: 'ANTT - Tarifas',
      runId: 'run-3',
      errorMessage: 'ainda fora do ar',
    });

    expect(count).toBe(0);
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('resolveTollDataSyncAlerts marca como lidas (readAt) so as notificacoes NAO LIDAS da fonte informada, filtrando por metadata.sourceId', async () => {
    const { service, prisma } = buildService({
      notification: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
    });

    const count = await service.resolveTollDataSyncAlerts('source-1');

    expect(count).toBe(3);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: {
        type: NotificationType.TOLL_DATA_SYNC_FAILURE,
        entityType: 'TollDataSource',
        readAt: null,
        metadata: { path: ['sourceId'], equals: 'source-1' },
      },
      data: { readAt: expect.any(Date) },
    });
  });
});
