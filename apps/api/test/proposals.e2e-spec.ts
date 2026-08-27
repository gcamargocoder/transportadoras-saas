import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Proposals (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
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

  async function createTenantAndLoginAsAdmin(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    const payload = {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `prop-${label.toLowerCase()}-${unique}`,
      admin: {
        name: `Admin ${label}`,
        email: `admin-${label.toLowerCase()}-${unique}@teste.com`,
        password: 'SenhaForte123!',
      },
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

  async function createCustomer(auth: string, name = `Cliente ${randomUUID().slice(0, 8)}`) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', auth)
      .send({ name })
      .expect(201);
    return res.body.data as { id: string; name: string };
  }

  async function createLocation(auth: string, name: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/locations')
      .set('Authorization', auth)
      .send({ name, type: 'DISTRIBUTION_CENTER' })
      .expect(201);
    return res.body.data.id as string;
  }

  // Cria uma Quotation e a leva ate APPROVED (unico status que
  // ProposalsService.assertQuotationUsable aceita) -- reaproveita
  // integralmente os endpoints ja testados em quotations.e2e-spec.ts.
  async function createApprovedQuotation(auth: string, customerId: string, manualAmount = 500) {
    const originId = await createLocation(auth, `Origem ${randomUUID()}`);
    const destinationId = await createLocation(auth, `Destino ${randomUUID()}`);
    const res = await request(app.getHttpServer())
      .post('/api/v1/quotations')
      .set('Authorization', auth)
      .send({
        customerId,
        originLocationId: originId,
        destinationLocationId: destinationId,
        validUntil: '2026-12-31T00:00:00.000Z',
        manualAmount,
        conditions: 'Pagamento em 28 dias.',
      })
      .expect(201);
    const quotationId = res.body.data.id as string;
    await request(app.getHttpServer())
      .patch(`/api/v1/quotations/${quotationId}/status`)
      .set('Authorization', auth)
      .send({ status: 'SENT' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/quotations/${quotationId}/status`)
      .set('Authorization', auth)
      .send({ status: 'APPROVED' })
      .expect(200);
    return quotationId;
  }

  describe('criacao direta e a partir de cotacao', () => {
    it('cria proposta diretamente, exigindo totalAmount', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CreateDirect');
      const customer = await createCustomer(adminAuth);

      await request(app.getHttpServer())
        .post('/api/v1/proposals')
        .set('Authorization', adminAuth)
        .send({ customerId: customer.id, validUntil: '2026-12-31T00:00:00.000Z' })
        .expect(409);

      const res = await request(app.getHttpServer())
        .post('/api/v1/proposals')
        .set('Authorization', adminAuth)
        .send({
          customerId: customer.id,
          totalAmount: 2500,
          commercialConditions: 'Frete a combinar por viagem.',
          notes: 'Cliente estrategico.',
          validUntil: '2026-12-31T00:00:00.000Z',
        })
        .expect(201);

      expect(res.body.data.totalAmount).toBe(2500);
      expect(res.body.data.quotationId).toBeNull();
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.number).toBe(1);
      expect(res.body.data.customerName).toBe(customer.name);
    });

    it('cria proposta a partir de uma cotacao APPROVED, herdando valor e condicoes', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CreateFromQuotation');
      const customer = await createCustomer(adminAuth);
      const quotationId = await createApprovedQuotation(adminAuth, customer.id, 777);

      const res = await request(app.getHttpServer())
        .post('/api/v1/proposals')
        .set('Authorization', adminAuth)
        .send({ customerId: customer.id, quotationId, validUntil: '2026-11-30T00:00:00.000Z' })
        .expect(201);

      expect(res.body.data.quotationId).toBe(quotationId);
      expect(res.body.data.totalAmount).toBe(777);
      expect(res.body.data.commercialConditions).toBe('Pagamento em 28 dias.');
    });

    it('rejeita cotacao nao APPROVED e cotacao de outro cliente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CreateFromQuotationInvalid');
      const customerA = await createCustomer(adminAuth);
      const customerB = await createCustomer(adminAuth);

      const originId = await createLocation(adminAuth, `Origem ${randomUUID()}`);
      const destinationId = await createLocation(adminAuth, `Destino ${randomUUID()}`);
      const draftQuoteRes = await request(app.getHttpServer())
        .post('/api/v1/quotations')
        .set('Authorization', adminAuth)
        .send({
          customerId: customerA.id,
          originLocationId: originId,
          destinationLocationId: destinationId,
          validUntil: '2026-12-31T00:00:00.000Z',
          manualAmount: 100,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/proposals')
        .set('Authorization', adminAuth)
        .send({ customerId: customerA.id, quotationId: draftQuoteRes.body.data.id, validUntil: '2026-12-31T00:00:00.000Z' })
        .expect(409);

      const approvedQuotationId = await createApprovedQuotation(adminAuth, customerA.id, 300);
      await request(app.getHttpServer())
        .post('/api/v1/proposals')
        .set('Authorization', adminAuth)
        .send({ customerId: customerB.id, quotationId: approvedQuotationId, validUntil: '2026-12-31T00:00:00.000Z' })
        .expect(409);
    });
  });

  describe('snapshot dos dados', () => {
    it('editar a cotacao de origem depois nao altera a proposta ja emitida', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('SnapshotFreeze');
      const customer = await createCustomer(adminAuth);
      const quotationId = await createApprovedQuotation(adminAuth, customer.id, 900);

      const proposalRes = await request(app.getHttpServer())
        .post('/api/v1/proposals')
        .set('Authorization', adminAuth)
        .send({ customerId: customer.id, quotationId, validUntil: '2026-12-31T00:00:00.000Z' })
        .expect(201);
      const proposalId = proposalRes.body.data.id as string;
      expect(proposalRes.body.data.totalAmount).toBe(900);

      // Quotation APPROVED ja e imutavel (Fase 94) -- confirma que mesmo
      // tentando editar ela, a proposta permanece com o valor gravado.
      await request(app.getHttpServer())
        .patch(`/api/v1/quotations/${quotationId}`)
        .set('Authorization', adminAuth)
        .send({ conditions: 'Tentativa de alterar depois de aprovada.' })
        .expect(409);

      const afterRes = await request(app.getHttpServer())
        .get(`/api/v1/proposals/${proposalId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(afterRes.body.data.totalAmount).toBe(900);
    });
  });

  describe('numero por tenant', () => {
    it('numera sequencialmente por tenant, isolado de outros tenants', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('NumberTenantA');
      const tenantB = await createTenantAndLoginAsAdmin('NumberTenantB');
      const customerA = await createCustomer(tenantA.adminAuth);
      const customerB = await createCustomer(tenantB.adminAuth);

      const a1 = await request(app.getHttpServer())
        .post('/api/v1/proposals')
        .set('Authorization', tenantA.adminAuth)
        .send({ customerId: customerA.id, totalAmount: 100, validUntil: '2026-12-31T00:00:00.000Z' })
        .expect(201);
      const b1 = await request(app.getHttpServer())
        .post('/api/v1/proposals')
        .set('Authorization', tenantB.adminAuth)
        .send({ customerId: customerB.id, totalAmount: 100, validUntil: '2026-12-31T00:00:00.000Z' })
        .expect(201);
      const a2 = await request(app.getHttpServer())
        .post('/api/v1/proposals')
        .set('Authorization', tenantA.adminAuth)
        .send({ customerId: customerA.id, totalAmount: 200, validUntil: '2026-12-31T00:00:00.000Z' })
        .expect(201);

      expect(a1.body.data.number).toBe(1);
      expect(b1.body.data.number).toBe(1);
      expect(a2.body.data.number).toBe(2);
    });
  });

  describe('ciclo de status e bloqueios', () => {
    async function createDraftProposal(auth: string) {
      const customer = await createCustomer(auth);
      const res = await request(app.getHttpServer())
        .post('/api/v1/proposals')
        .set('Authorization', auth)
        .send({ customerId: customer.id, totalAmount: 500, validUntil: '2026-12-31T00:00:00.000Z' })
        .expect(201);
      return { customer, proposalId: res.body.data.id as string };
    }

    it('percorre DRAFT -> SENT -> ACCEPTED, definindo decidedAt automaticamente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('StatusCycle');
      const { proposalId } = await createDraftProposal(adminAuth);

      await request(app.getHttpServer())
        .patch(`/api/v1/proposals/${proposalId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'SENT' })
        .expect(200);

      const acceptedRes = await request(app.getHttpServer())
        .patch(`/api/v1/proposals/${proposalId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'ACCEPTED' })
        .expect(200);
      expect(acceptedRes.body.data.status).toBe('ACCEPTED');
      expect(acceptedRes.body.data.decidedAt).toBeTruthy();
    });

    it('bloqueia transicao invalida (DRAFT -> ACCEPTED direto)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('StatusInvalidJump');
      const { proposalId } = await createDraftProposal(adminAuth);

      await request(app.getHttpServer())
        .patch(`/api/v1/proposals/${proposalId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'ACCEPTED' })
        .expect(409);
    });

    it('bloqueia PATCH de conteudo a partir de SENT, e novas transicoes apos estado final', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ContentLockAfterSent');
      const { proposalId } = await createDraftProposal(adminAuth);

      await request(app.getHttpServer())
        .patch(`/api/v1/proposals/${proposalId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'SENT' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/proposals/${proposalId}`)
        .set('Authorization', adminAuth)
        .send({ notes: 'Tentativa de edicao apos envio.' })
        .expect(409);

      await request(app.getHttpServer())
        .patch(`/api/v1/proposals/${proposalId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'REJECTED' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/proposals/${proposalId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'SENT' })
        .expect(409);
      await request(app.getHttpServer())
        .patch(`/api/v1/proposals/${proposalId}`)
        .set('Authorization', adminAuth)
        .send({ notes: 'Tentativa apos rejeicao.' })
        .expect(409);
    });

    it('permite SENT -> EXPIRED explicitamente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ExpireTransition');
      const { proposalId } = await createDraftProposal(adminAuth);
      await request(app.getHttpServer())
        .patch(`/api/v1/proposals/${proposalId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'SENT' })
        .expect(200);
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/proposals/${proposalId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'EXPIRED' })
        .expect(200);
      expect(res.body.data.status).toBe('EXPIRED');
      expect(res.body.data.decidedAt).toBeNull();
    });
  });

  describe('validade/expiracao', () => {
    it('expired e derivado de validUntil, independente do status persistido', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ExpiredFlag');
      const customer = await createCustomer(adminAuth);

      const expiredRes = await request(app.getHttpServer())
        .post('/api/v1/proposals')
        .set('Authorization', adminAuth)
        .send({ customerId: customer.id, totalAmount: 100, validUntil: '2020-01-01T00:00:00.000Z' })
        .expect(201);
      expect(expiredRes.body.data.expired).toBe(true);
      expect(expiredRes.body.data.status).toBe('DRAFT');

      const futureRes = await request(app.getHttpServer())
        .post('/api/v1/proposals')
        .set('Authorization', adminAuth)
        .send({ customerId: customer.id, totalAmount: 100, validUntil: '2030-01-01T00:00:00.000Z' })
        .expect(201);
      expect(futureRes.body.data.expired).toBe(false);
    });
  });

  describe('historico/auditoria', () => {
    it('GET /proposals/:id/history reflete criacao e mudanca de status', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('History');
      const customer = await createCustomer(adminAuth);
      const res = await request(app.getHttpServer())
        .post('/api/v1/proposals')
        .set('Authorization', adminAuth)
        .send({ customerId: customer.id, totalAmount: 100, validUntil: '2026-12-31T00:00:00.000Z' })
        .expect(201);
      const proposalId = res.body.data.id as string;

      await request(app.getHttpServer())
        .patch(`/api/v1/proposals/${proposalId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'SENT' })
        .expect(200);

      const historyRes = await request(app.getHttpServer())
        .get(`/api/v1/proposals/${proposalId}/history`)
        .set('Authorization', adminAuth)
        .expect(200);
      const actions = historyRes.body.data.items.map((i: { action: string }) => i.action);
      expect(actions).toContain('proposal.created');
      expect(actions).toContain('proposal.status_changed');
    });
  });

  describe('filtros/paginacao', () => {
    it('filtra por cliente, status e busca por numero', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Filters');
      const customerA = await createCustomer(adminAuth, `Alfa ${randomUUID().slice(0, 6)}`);
      const customerB = await createCustomer(adminAuth, `Beta ${randomUUID().slice(0, 6)}`);

      const resA = await request(app.getHttpServer())
        .post('/api/v1/proposals')
        .set('Authorization', adminAuth)
        .send({ customerId: customerA.id, totalAmount: 100, validUntil: '2026-12-31T00:00:00.000Z' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/proposals')
        .set('Authorization', adminAuth)
        .send({ customerId: customerB.id, totalAmount: 200, validUntil: '2026-12-31T00:00:00.000Z' })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/proposals/${resA.body.data.id}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'SENT' })
        .expect(200);

      const byCustomer = await request(app.getHttpServer())
        .get(`/api/v1/proposals?customerId=${customerA.id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byCustomer.body.data.items).toHaveLength(1);
      expect(byCustomer.body.data.items[0].customerId).toBe(customerA.id);

      const byStatus = await request(app.getHttpServer())
        .get('/api/v1/proposals?status=SENT')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byStatus.body.data.items.map((p: { id: string }) => p.id)).toContain(resA.body.data.id);

      const byNumber = await request(app.getHttpServer())
        .get(`/api/v1/proposals?search=${resA.body.data.number}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byNumber.body.data.items.map((p: { id: string }) => p.id)).toContain(resA.body.data.id);

      const paginated = await request(app.getHttpServer())
        .get('/api/v1/proposals?page=1&pageSize=1')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(paginated.body.data.items).toHaveLength(1);
      expect(paginated.body.data.meta.total).toBe(2);
    });
  });

  describe('isolamento multi-tenant', () => {
    it('proposta de um tenant e invisivel e inacessivel para outro', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolationA');
      const tenantB = await createTenantAndLoginAsAdmin('IsolationB');
      const customer = await createCustomer(tenantA.adminAuth);
      const res = await request(app.getHttpServer())
        .post('/api/v1/proposals')
        .set('Authorization', tenantA.adminAuth)
        .send({ customerId: customer.id, totalAmount: 100, validUntil: '2026-12-31T00:00:00.000Z' })
        .expect(201);
      const proposalId = res.body.data.id as string;

      await request(app.getHttpServer())
        .get(`/api/v1/proposals/${proposalId}`)
        .set('Authorization', tenantB.adminAuth)
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/api/v1/proposals/${proposalId}/status`)
        .set('Authorization', tenantB.adminAuth)
        .send({ status: 'SENT' })
        .expect(404);

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/proposals')
        .set('Authorization', tenantB.adminAuth)
        .expect(200);
      expect(listRes.body.data.items.map((p: { id: string }) => p.id)).not.toContain(proposalId);
    });
  });

  describe('RBAC', () => {
    it('bloqueia DRIVER; AUDITOR le mas nao escreve', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Rbac');
      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');
      const customer = await createCustomer(adminAuth);

      await request(app.getHttpServer())
        .get('/api/v1/proposals')
        .set('Authorization', driverAuth)
        .expect(403);
      await request(app.getHttpServer())
        .post('/api/v1/proposals')
        .set('Authorization', driverAuth)
        .send({ customerId: customer.id, totalAmount: 100, validUntil: '2026-12-31T00:00:00.000Z' })
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/proposals')
        .set('Authorization', auditorAuth)
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/v1/proposals')
        .set('Authorization', auditorAuth)
        .send({ customerId: customer.id, totalAmount: 100, validUntil: '2026-12-31T00:00:00.000Z' })
        .expect(403);
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
        slug: `prop-n1-${label.toLowerCase()}-${unique}`,
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

    it('a contagem de queries de GET /proposals nao cresce entre 5 e 20 propostas', async () => {
      const { adminAuth } = await createTenantOnCountingApp('N1List');
      const customerRes = await request(countingApp.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', adminAuth)
        .send({ name: 'Cliente N1' })
        .expect(201);
      const customerId = customerRes.body.data.id as string;

      async function seedProposal() {
        await request(countingApp.getHttpServer())
          .post('/api/v1/proposals')
          .set('Authorization', adminAuth)
          .send({ customerId, totalAmount: 100, validUntil: '2026-12-31T00:00:00.000Z' })
          .expect(201);
      }

      for (let i = 0; i < 5; i += 1) await seedProposal();
      queryCount = 0;
      await request(countingApp.getHttpServer()).get('/api/v1/proposals?pageSize=50').set('Authorization', adminAuth).expect(200);
      const queriesFor5 = queryCount;

      for (let i = 5; i < 20; i += 1) await seedProposal();
      queryCount = 0;
      await request(countingApp.getHttpServer()).get('/api/v1/proposals?pageSize=50').set('Authorization', adminAuth).expect(200);
      const queriesFor20 = queryCount;

      expect(queriesFor20).toBeLessThanOrEqual(queriesFor5 + 1);
    }, 180000);
  });
});
