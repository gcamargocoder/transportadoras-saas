import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Contract Renewals (Fase 98, e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    for (const id of createdTenantIds) {
      await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
    }
    await app.close();
  });

  function randomCnpj(): string {
    return Array.from({ length: 14 }, () => Math.floor(Math.random() * 10)).join('');
  }

  function daysFromNow(days: number): string {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  async function createTenantAndLoginAsAdmin(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    const payload = {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `ctr-renew-${label.toLowerCase()}-${unique}`,
      admin: { name: `Admin ${label}`, email: `admin-${label.toLowerCase()}-${unique}@teste.com`, password: 'SenhaForte123!' },
    };
    const createRes = await request(app.getHttpServer()).post('/api/v1/tenants').send(payload).expect(201);
    const tenantId: string = createRes.body.data.id;
    createdTenantIds.push(tenantId);

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email: payload.admin.email, password: payload.admin.password })
      .expect(200);
    return { tenantId, adminAuth: `Bearer ${loginRes.body.data.accessToken as string}` };
  }

  async function createUserWithRole(tenantId: string, adminAuth: string, role: string) {
    const email = `user-${role.toLowerCase()}-${randomUUID()}@teste.com`;
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', adminAuth)
      .send({ name: `Usuario ${role}`, email, password: 'SenhaForte123!', role })
      .expect(201);
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email, password: 'SenhaForte123!' })
      .expect(200);
    return `Bearer ${loginRes.body.data.accessToken}`;
  }

  async function createCustomer(auth: string, name = 'Cliente Teste') {
    const res = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', auth)
      .send({ name })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createContract(auth: string, customerId: string, overrides: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/freight/contracts')
      .set('Authorization', auth)
      .send({
        customerId,
        code: `CTR-${randomUUID().slice(0, 8)}`,
        startDate: '2026-01-01T00:00:00.000Z',
        ...overrides,
      })
      .expect(201);
    return res.body.data as { id: string; status: string; code: string };
  }

  async function activateContract(auth: string, contractId: string) {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/freight/contracts/${contractId}`)
      .set('Authorization', auth)
      .send({ status: 'ACTIVE' })
      .expect(200);
    return res.body.data as { id: string; status: string };
  }

  async function createActiveContract(auth: string, customerId: string, overrides: Record<string, unknown> = {}) {
    const contract = await createContract(auth, customerId, overrides);
    await activateContract(auth, contract.id);
    return contract;
  }

  async function initiateRenewal(auth: string, contractId: string, notes?: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/contract-renewals')
      .set('Authorization', auth)
      .send({ contractId, ...(notes ? { notes } : {}) })
      .expect(201);
    return res.body.data as { id: string; status: string; previousContractId: string; previousEndDate: string | null };
  }

  // ==========================================================================
  // Identificacao de contratos vencendo/vencidos
  // ==========================================================================
  describe('identificacao de contratos por vencimento', () => {
    it('lista contratos vencendo dentro do limiar padrao (30 dias) e vencidos, exclui os que ainda nao entraram na janela', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ExpiryBasic');
      const customerId = await createCustomer(adminAuth);

      const expiringSoon = await createActiveContract(adminAuth, customerId, { endDate: daysFromNow(10) });
      const alreadyExpired = await createActiveContract(adminAuth, customerId, {
        startDate: '2020-01-01T00:00:00.000Z',
        endDate: daysFromNow(-5),
      });
      const farInFuture = await createActiveContract(adminAuth, customerId, { endDate: daysFromNow(200) });

      const res = await request(app.getHttpServer())
        .get('/api/v1/contract-renewals/expiring-contracts')
        .set('Authorization', adminAuth)
        .expect(200);

      const ids = res.body.data.items.map((i: { contractId: string }) => i.contractId);
      expect(ids).toContain(expiringSoon.id);
      expect(ids).toContain(alreadyExpired.id);
      expect(ids).not.toContain(farInFuture.id);

      const soonItem = res.body.data.items.find((i: { contractId: string }) => i.contractId === expiringSoon.id);
      expect(soonItem.expiryStatus).toBe('EXPIRING_SOON');
      expect(soonItem.daysUntilExpiry).toBeGreaterThan(0);

      const expiredItem = res.body.data.items.find((i: { contractId: string }) => i.contractId === alreadyExpired.id);
      expect(expiredItem.expiryStatus).toBe('EXPIRED');
      expect(expiredItem.daysUntilExpiry).toBeLessThan(0);
    });

    it('withinDays customizado restringe/amplia a janela', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ExpiryWithinDays');
      const customerId = await createCustomer(adminAuth);
      const contract = await createActiveContract(adminAuth, customerId, { endDate: daysFromNow(10) });

      const narrow = await request(app.getHttpServer())
        .get('/api/v1/contract-renewals/expiring-contracts')
        .query({ withinDays: 5 })
        .set('Authorization', adminAuth)
        .expect(200);
      expect(narrow.body.data.items.map((i: { contractId: string }) => i.contractId)).not.toContain(contract.id);

      const wide = await request(app.getHttpServer())
        .get('/api/v1/contract-renewals/expiring-contracts')
        .query({ withinDays: 15 })
        .set('Authorization', adminAuth)
        .expect(200);
      expect(wide.body.data.items.map((i: { contractId: string }) => i.contractId)).toContain(contract.id);
    });

    it('filtra por customerId e pagina com meta correta', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ExpiryCustomerFilter');
      const customerA = await createCustomer(adminAuth, 'Cliente A');
      const customerB = await createCustomer(adminAuth, 'Cliente B');
      const contractA = await createActiveContract(adminAuth, customerA, { endDate: daysFromNow(5) });
      await createActiveContract(adminAuth, customerB, { endDate: daysFromNow(5) });

      const res = await request(app.getHttpServer())
        .get('/api/v1/contract-renewals/expiring-contracts')
        .query({ customerId: customerA })
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].contractId).toBe(contractA.id);
      expect(res.body.data.meta.total).toBe(1);

      const page1 = await request(app.getHttpServer())
        .get('/api/v1/contract-renewals/expiring-contracts')
        .query({ pageSize: 1, page: 1 })
        .set('Authorization', adminAuth)
        .expect(200);
      expect(page1.body.data.items).toHaveLength(1);
      expect(page1.body.data.meta.total).toBe(2);
      expect(page1.body.data.meta.totalPages).toBe(2);
    });

    it('indicadores de resumo refletem vencendo/vencidos/renovacoes pendentes', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('SummaryIndicators');
      const customerId = await createCustomer(adminAuth);
      const expiring = await createActiveContract(adminAuth, customerId, { endDate: daysFromNow(10) });
      await createActiveContract(adminAuth, customerId, {
        startDate: '2020-01-01T00:00:00.000Z',
        endDate: daysFromNow(-3),
      });
      await initiateRenewal(adminAuth, expiring.id);

      const res = await request(app.getHttpServer())
        .get('/api/v1/contract-renewals/summary')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.expiringCount).toBeGreaterThanOrEqual(1);
      expect(res.body.data.expiredCount).toBeGreaterThanOrEqual(1);
      expect(res.body.data.pendingRenewalsCount).toBe(1);
    });
  });

  // ==========================================================================
  // Renovacao e preservacao do historico
  // ==========================================================================
  describe('renovacao e preservacao do historico', () => {
    it('inicia uma renovacao e snapshotta a vigencia anterior', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('InitiateSnapshot');
      const customerId = await createCustomer(adminAuth);
      const originalEndDate = daysFromNow(10);
      const contract = await createActiveContract(adminAuth, customerId, { endDate: originalEndDate });

      const renewal = await initiateRenewal(adminAuth, contract.id, 'Cliente confirmou renovacao por telefone.');
      expect(renewal.status).toBe('PENDING');
      expect(renewal.previousContractId).toBe(contract.id);
      expect(new Date(renewal.previousEndDate as string).toISOString()).toBe(new Date(originalEndDate).toISOString());
    });

    it('concluir a renovacao cria um novo contrato ACTIVE, marca o anterior como EXPIRED, e NUNCA reescreve a vigencia/condicoes anteriores', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CompletePreserve');
      const customerId = await createCustomer(adminAuth);
      const original = await createActiveContract(adminAuth, customerId, {
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: daysFromNow(5),
        commercialTerms: 'Pagamento em 30 dias.',
        notes: 'Observacao original.',
        description: 'Contrato original.',
      });

      const renewal = await initiateRenewal(adminAuth, original.id);

      const newCode = `CTR-RENEW-${randomUUID().slice(0, 8)}`;
      const newStartDate = daysFromNow(6);
      const newEndDate = daysFromNow(370);
      const completed = await request(app.getHttpServer())
        .post(`/api/v1/contract-renewals/${renewal.id}/complete`)
        .set('Authorization', adminAuth)
        .send({ code: newCode, startDate: newStartDate, endDate: newEndDate })
        .expect(201);

      expect(completed.body.data.status).toBe('COMPLETED');
      expect(completed.body.data.newContractId).toBeTruthy();
      expect(completed.body.data.newContractCode).toBe(newCode);

      const newContractId = completed.body.data.newContractId as string;
      const newContract = await request(app.getHttpServer())
        .get(`/api/v1/freight/contracts/${newContractId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(newContract.body.data.status).toBe('ACTIVE');
      expect(newContract.body.data.code).toBe(newCode);
      // Campos omitidos no DTO de conclusao foram herdados do contrato anterior.
      expect(newContract.body.data.commercialTerms).toBe('Pagamento em 30 dias.');
      expect(newContract.body.data.notes).toBe('Observacao original.');
      expect(newContract.body.data.description).toBe('Contrato original.');

      const oldContract = await request(app.getHttpServer())
        .get(`/api/v1/freight/contracts/${original.id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(oldContract.body.data.status).toBe('EXPIRED');
      // Vigencia/condicoes anteriores NUNCA sao reescritas pela renovacao.
      expect(new Date(oldContract.body.data.startDate).toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(oldContract.body.data.commercialTerms).toBe('Pagamento em 30 dias.');
      expect(oldContract.body.data.notes).toBe('Observacao original.');
    });

    it('lista renovacoes com filtros por contractId/customerId/status e paginacao', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('RenewalsFilters');
      const customerId = await createCustomer(adminAuth);
      const contractA = await createActiveContract(adminAuth, customerId, { endDate: daysFromNow(5) });
      const contractB = await createActiveContract(adminAuth, customerId, { endDate: daysFromNow(5) });
      const renewalA = await initiateRenewal(adminAuth, contractA.id);
      await initiateRenewal(adminAuth, contractB.id);

      const byContract = await request(app.getHttpServer())
        .get('/api/v1/contract-renewals')
        .query({ contractId: contractA.id })
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byContract.body.data.items).toHaveLength(1);
      expect(byContract.body.data.items[0].id).toBe(renewalA.id);

      const byCustomer = await request(app.getHttpServer())
        .get('/api/v1/contract-renewals')
        .query({ customerId })
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byCustomer.body.data.meta.total).toBe(2);

      const byStatus = await request(app.getHttpServer())
        .get('/api/v1/contract-renewals')
        .query({ status: 'PENDING' })
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byStatus.body.data.meta.total).toBe(2);

      const page1 = await request(app.getHttpServer())
        .get('/api/v1/contract-renewals')
        .query({ pageSize: 1, page: 1 })
        .set('Authorization', adminAuth)
        .expect(200);
      expect(page1.body.data.items).toHaveLength(1);
      expect(page1.body.data.meta.totalPages).toBe(2);
    });

    it('cancelar uma renovacao PENDING nunca altera o contrato anterior', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CancelRenewal');
      const customerId = await createCustomer(adminAuth);
      const contract = await createActiveContract(adminAuth, customerId, { endDate: daysFromNow(5) });
      const renewal = await initiateRenewal(adminAuth, contract.id);

      const cancelled = await request(app.getHttpServer())
        .post(`/api/v1/contract-renewals/${renewal.id}/cancel`)
        .set('Authorization', adminAuth)
        .expect(201);
      expect(cancelled.body.data.status).toBe('CANCELLED');

      const stillActive = await request(app.getHttpServer())
        .get(`/api/v1/freight/contracts/${contract.id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(stillActive.body.data.status).toBe('ACTIVE');
    });
  });

  // ==========================================================================
  // Bloqueios de transicao invalida
  // ==========================================================================
  describe('bloqueios de transicao invalida', () => {
    it('nao permite iniciar renovacao de contrato DRAFT nem CANCELLED', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('BlockDraftCancelled');
      const customerId = await createCustomer(adminAuth);
      const draft = await createContract(adminAuth, customerId);
      await request(app.getHttpServer())
        .post('/api/v1/contract-renewals')
        .set('Authorization', adminAuth)
        .send({ contractId: draft.id })
        .expect(409);

      const cancelled = await createContract(adminAuth, customerId);
      await request(app.getHttpServer())
        .patch(`/api/v1/freight/contracts/${cancelled.id}`)
        .set('Authorization', adminAuth)
        .send({ status: 'CANCELLED' })
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/v1/contract-renewals')
        .set('Authorization', adminAuth)
        .send({ contractId: cancelled.id })
        .expect(409);
    });

    it('nao permite uma segunda renovacao PENDING para o mesmo contrato', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('BlockDoublePending');
      const customerId = await createCustomer(adminAuth);
      const contract = await createActiveContract(adminAuth, customerId, { endDate: daysFromNow(5) });
      await initiateRenewal(adminAuth, contract.id);

      await request(app.getHttpServer())
        .post('/api/v1/contract-renewals')
        .set('Authorization', adminAuth)
        .send({ contractId: contract.id })
        .expect(409);
    });

    it('nao permite concluir ou cancelar uma renovacao que ja nao esta PENDING', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('BlockNonPending');
      const customerId = await createCustomer(adminAuth);
      const contract = await createActiveContract(adminAuth, customerId, { endDate: daysFromNow(5) });
      const renewal = await initiateRenewal(adminAuth, contract.id);

      await request(app.getHttpServer())
        .post(`/api/v1/contract-renewals/${renewal.id}/cancel`)
        .set('Authorization', adminAuth)
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/contract-renewals/${renewal.id}/cancel`)
        .set('Authorization', adminAuth)
        .expect(409);

      await request(app.getHttpServer())
        .post(`/api/v1/contract-renewals/${renewal.id}/complete`)
        .set('Authorization', adminAuth)
        .send({ code: `CTR-X-${randomUUID().slice(0, 8)}`, startDate: daysFromNow(1) })
        .expect(409);
    });
  });

  // ==========================================================================
  // Multi-tenant e RBAC
  // ==========================================================================
  describe('isolamento multi-tenant', () => {
    it('renovacao de um tenant nunca e visivel/acessivel para outro tenant', async () => {
      const { adminAuth: authA } = await createTenantAndLoginAsAdmin('TenantA');
      const { adminAuth: authB } = await createTenantAndLoginAsAdmin('TenantB');
      const customerId = await createCustomer(authA);
      const contract = await createActiveContract(authA, customerId, { endDate: daysFromNow(5) });
      const renewal = await initiateRenewal(authA, contract.id);

      await request(app.getHttpServer())
        .get(`/api/v1/contract-renewals/${renewal.id}`)
        .set('Authorization', authB)
        .expect(404);

      // Contrato do tenant A nao existe para o tenant B -- iniciar renovacao la falha com 404.
      await request(app.getHttpServer())
        .post('/api/v1/contract-renewals')
        .set('Authorization', authB)
        .send({ contractId: contract.id })
        .expect(404);
    });
  });

  describe('RBAC', () => {
    it('bloqueia DRIVER em todas as rotas; AUDITOR le mas nao escreve', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('RbacContractRenewals');
      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');
      const customerId = await createCustomer(adminAuth);
      const contract = await createActiveContract(adminAuth, customerId, { endDate: daysFromNow(5) });

      await request(app.getHttpServer())
        .get('/api/v1/contract-renewals')
        .set('Authorization', driverAuth)
        .expect(403);
      await request(app.getHttpServer())
        .post('/api/v1/contract-renewals')
        .set('Authorization', driverAuth)
        .send({ contractId: contract.id })
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/contract-renewals')
        .set('Authorization', auditorAuth)
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/v1/contract-renewals/expiring-contracts')
        .set('Authorization', auditorAuth)
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/v1/contract-renewals')
        .set('Authorization', auditorAuth)
        .send({ contractId: contract.id })
        .expect(403);
    });
  });

  // ==========================================================================
  // Notificacoes
  // ==========================================================================
  describe('integracao com notificacoes', () => {
    it('gera notificacao CONTRACT_EXPIRING para o grupo de gestao ao processar o tenant', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('NotifyExpiring');
      const managerAuth = await createUserWithRole(tenantId, adminAuth, 'MANAGER');
      const customerId = await createCustomer(adminAuth);
      const contract = await createActiveContract(adminAuth, customerId, { endDate: daysFromNow(10) });

      await request(app.getHttpServer())
        .post('/api/v1/notifications/process')
        .set('Authorization', adminAuth)
        .expect(200);

      const notifications = await prisma.notification.findMany({
        where: { tenantId, type: 'CONTRACT_EXPIRING', entityId: contract.id },
      });
      expect(notifications.length).toBeGreaterThanOrEqual(1);

      const managerNotifications = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .query({ type: 'CONTRACT_EXPIRING' })
        .set('Authorization', managerAuth)
        .expect(200);
      expect(managerNotifications.body.data.items.length).toBeGreaterThanOrEqual(1);

      // Idempotente: reprocessar nao duplica a notificacao para o mesmo contrato.
      const before = notifications.length;
      await request(app.getHttpServer())
        .post('/api/v1/notifications/process')
        .set('Authorization', adminAuth)
        .expect(200);
      const after = await prisma.notification.count({ where: { tenantId, type: 'CONTRACT_EXPIRING', entityId: contract.id } });
      expect(after).toBe(before);
    });
  });

  // ==========================================================================
  // N+1
  // ==========================================================================
  describe('verificacao de ausencia de N+1', () => {
    let countingApp: INestApplication;
    let basePrisma: PrismaService;
    let queryCount = 0;

    beforeAll(async () => {
      basePrisma = new PrismaService();
      await basePrisma.$connect();
      const extendedPrisma = basePrisma.$extends({
        name: 'query-counter',
        query: { $allModels: { async $allOperations({ args, query }) { queryCount += 1; return query(args); } } },
      });

      const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PrismaService)
        .useValue(extendedPrisma)
        .compile();
      countingApp = moduleRef.createNestApplication();
      countingApp.setGlobalPrefix('api');
      countingApp.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
      countingApp.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
      await countingApp.init();
    });

    afterAll(async () => {
      await countingApp.close();
      await basePrisma.$disconnect();
    });

    async function createTenantOnCountingApp(label: string) {
      const unique = randomUUID().replace(/-/g, '').slice(0, 12);
      const payload = {
        name: `Transportadora ${label} ${unique}`,
        document: randomCnpj(),
        slug: `ctr-n1-${label.toLowerCase()}-${unique}`,
        admin: { name: `Admin ${label}`, email: `admin-n1-${label.toLowerCase()}-${unique}@teste.com`, password: 'SenhaForte123!' },
      };
      const createRes = await request(countingApp.getHttpServer()).post('/api/v1/tenants').send(payload).expect(201);
      const tenantId: string = createRes.body.data.id;
      createdTenantIds.push(tenantId);
      const loginRes = await request(countingApp.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId, email: payload.admin.email, password: payload.admin.password })
        .expect(200);
      return { tenantId, adminAuth: `Bearer ${loginRes.body.data.accessToken as string}` };
    }

    async function seedExpiringContract(auth: string, customerId: string) {
      const res = await request(countingApp.getHttpServer())
        .post('/api/v1/freight/contracts')
        .set('Authorization', auth)
        .send({ customerId, code: `CTR-N1-${randomUUID().slice(0, 8)}`, startDate: '2026-01-01T00:00:00.000Z', endDate: daysFromNow(10) })
        .expect(201);
      await request(countingApp.getHttpServer())
        .patch(`/api/v1/freight/contracts/${res.body.data.id}`)
        .set('Authorization', auth)
        .send({ status: 'ACTIVE' })
        .expect(200);
      await request(countingApp.getHttpServer())
        .post('/api/v1/contract-renewals')
        .set('Authorization', auth)
        .send({ contractId: res.body.data.id })
        .expect(201);
    }

    it('a contagem de queries de GET /contract-renewals/expiring-contracts nao cresce entre 5 e 20 contratos vencendo', async () => {
      const { adminAuth } = await createTenantOnCountingApp('N1Expiring');
      const customerRes = await request(countingApp.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', adminAuth)
        .send({ name: 'Cliente N1' })
        .expect(201);
      const customerId = customerRes.body.data.id as string;

      for (let i = 0; i < 5; i += 1) await seedExpiringContract(adminAuth, customerId);
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/contract-renewals/expiring-contracts')
        .query({ pageSize: 100 })
        .set('Authorization', adminAuth)
        .expect(200);
      const queriesFor5 = queryCount;

      for (let i = 5; i < 20; i += 1) await seedExpiringContract(adminAuth, customerId);
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/contract-renewals/expiring-contracts')
        .query({ pageSize: 100 })
        .set('Authorization', adminAuth)
        .expect(200);
      const queriesFor20 = queryCount;

      expect(queriesFor20).toBeLessThanOrEqual(queriesFor5 + 1);
    }, 180000);
  });
});
