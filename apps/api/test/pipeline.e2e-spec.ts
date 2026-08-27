import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Pipeline Comercial (e2e)', () => {
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
      slug: `pipe-${label.toLowerCase()}-${unique}`,
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

  async function createProposal(auth: string, customerId: string, quotationId?: string, totalAmount = 1000) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/proposals')
      .set('Authorization', auth)
      .send({
        customerId,
        validUntil: '2026-12-31T00:00:00.000Z',
        ...(quotationId ? { quotationId } : { totalAmount }),
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function getStages(auth: string) {
    const res = await request(app.getHttpServer()).get('/api/v1/pipeline/stages').set('Authorization', auth).expect(200);
    return res.body.data as { id: string; name: string; order: number; isWon: boolean; isLost: boolean }[];
  }

  describe('estagios (configuraveis por tenant)', () => {
    it('cria o conjunto inicial padrao no primeiro acesso', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('DefaultStages');
      const stages = await getStages(adminAuth);
      expect(stages.map((s) => s.name)).toEqual(['Lead', 'Cotação', 'Proposta', 'Negociação', 'Ganho', 'Perdido']);
      expect(stages.find((s) => s.isWon)?.name).toBe('Ganho');
      expect(stages.find((s) => s.isLost)?.name).toBe('Perdido');
    });

    it('permite criar, renomear e reordenar estagios (swap)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CustomStages');
      const stages = await getStages(adminAuth);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/pipeline/stages')
        .set('Authorization', adminAuth)
        .send({ name: 'Qualificação' })
        .expect(201);
      expect(createRes.body.data.order).toBe(stages.length + 1);

      const leadStage = stages.find((s) => s.name === 'Lead')!;
      const renameRes = await request(app.getHttpServer())
        .patch(`/api/v1/pipeline/stages/${leadStage.id}`)
        .set('Authorization', adminAuth)
        .send({ name: 'Novo Lead' })
        .expect(200);
      expect(renameRes.body.data.name).toBe('Novo Lead');

      // swap: mover "Novo Lead" (order 1) para a posicao do "Ganho" (order 5)
      const wonStage = stages.find((s) => s.isWon)!;
      await request(app.getHttpServer())
        .patch(`/api/v1/pipeline/stages/${leadStage.id}`)
        .set('Authorization', adminAuth)
        .send({ order: wonStage.order })
        .expect(200);

      const afterSwap = await getStages(adminAuth);
      const movedLead = afterSwap.find((s) => s.id === leadStage.id)!;
      const movedWon = afterSwap.find((s) => s.id === wonStage.id)!;
      expect(movedLead.order).toBe(wonStage.order);
      expect(movedWon.order).toBe(leadStage.order);
    });

    it('rejeita um estagio marcado como isWon e isLost ao mesmo tempo', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('WonLostConflict');
      await request(app.getHttpServer())
        .post('/api/v1/pipeline/stages')
        .set('Authorization', adminAuth)
        .send({ name: 'Invalido', isWon: true, isLost: true })
        .expect(400);
    });
  });

  describe('criacao e vinculo com cliente/cotacao/proposta', () => {
    it('cria oportunidade so com cliente (LEAD, sem estimatedValue)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CreateBasic');
      const customer = await createCustomer(adminAuth);
      const stages = await getStages(adminAuth);

      const res = await request(app.getHttpServer())
        .post('/api/v1/pipeline/opportunities')
        .set('Authorization', adminAuth)
        .send({ customerId: customer.id, title: 'Nova frota' })
        .expect(201);

      expect(res.body.data.customerId).toBe(customer.id);
      expect(res.body.data.customerName).toBe(customer.name);
      expect(res.body.data.stageId).toBe(stages[0]!.id);
      expect(res.body.data.estimatedValue).toBeNull();
      expect(res.body.data.quotationId).toBeNull();
    });

    it('herda estimatedValue da Quotation e da Proposal quando vinculadas', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CreateFromQuotation');
      const customer = await createCustomer(adminAuth);
      const quotationId = await createApprovedQuotation(adminAuth, customer.id, 650);

      const fromQuotationRes = await request(app.getHttpServer())
        .post('/api/v1/pipeline/opportunities')
        .set('Authorization', adminAuth)
        .send({ customerId: customer.id, quotationId })
        .expect(201);
      expect(fromQuotationRes.body.data.estimatedValue).toBe(650);
      expect(fromQuotationRes.body.data.quotationId).toBe(quotationId);

      const proposalId = await createProposal(adminAuth, customer.id, quotationId);
      const fromProposalRes = await request(app.getHttpServer())
        .post('/api/v1/pipeline/opportunities')
        .set('Authorization', adminAuth)
        .send({ customerId: customer.id, quotationId, proposalId })
        .expect(201);
      expect(fromProposalRes.body.data.estimatedValue).toBe(650);
      expect(fromProposalRes.body.data.proposalId).toBe(proposalId);
      expect(fromProposalRes.body.data.proposalNumber).toBeTruthy();
    });

    it('valor explicito sempre prevalece sobre o herdado', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ExplicitOverride');
      const customer = await createCustomer(adminAuth);
      const quotationId = await createApprovedQuotation(adminAuth, customer.id, 650);

      const res = await request(app.getHttpServer())
        .post('/api/v1/pipeline/opportunities')
        .set('Authorization', adminAuth)
        .send({ customerId: customer.id, quotationId, estimatedValue: 999 })
        .expect(201);
      expect(res.body.data.estimatedValue).toBe(999);
    });

    it('rejeita cotacao/proposta de outro cliente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CrossCustomer');
      const customerA = await createCustomer(adminAuth);
      const customerB = await createCustomer(adminAuth);
      const quotationId = await createApprovedQuotation(adminAuth, customerA.id, 100);

      await request(app.getHttpServer())
        .post('/api/v1/pipeline/opportunities')
        .set('Authorization', adminAuth)
        .send({ customerId: customerB.id, quotationId })
        .expect(409);
    });
  });

  describe('transicoes de estagio', () => {
    async function createOpportunity(auth: string) {
      const customer = await createCustomer(auth);
      const res = await request(app.getHttpServer())
        .post('/api/v1/pipeline/opportunities')
        .set('Authorization', auth)
        .send({ customerId: customer.id, estimatedValue: 300 })
        .expect(201);
      return res.body.data.id as string;
    }

    it('move entre estagios abertos livremente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('MoveOpen');
      const opportunityId = await createOpportunity(adminAuth);
      const stages = await getStages(adminAuth);
      const negotiationStage = stages.find((s) => s.name === 'Negociação')!;

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/pipeline/opportunities/${opportunityId}/stage`)
        .set('Authorization', adminAuth)
        .send({ stageId: negotiationStage.id })
        .expect(200);
      expect(res.body.data.stageId).toBe(negotiationStage.id);
    });

    it('bloqueia mover para fora de um estagio terminal', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('BlockAfterTerminal');
      const opportunityId = await createOpportunity(adminAuth);
      const stages = await getStages(adminAuth);
      const wonStage = stages.find((s) => s.isWon)!;
      const leadStage = stages.find((s) => s.name === 'Lead')!;

      await request(app.getHttpServer())
        .patch(`/api/v1/pipeline/opportunities/${opportunityId}/stage`)
        .set('Authorization', adminAuth)
        .send({ stageId: wonStage.id })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/pipeline/opportunities/${opportunityId}/stage`)
        .set('Authorization', adminAuth)
        .send({ stageId: leadStage.id })
        .expect(409);
    });

    it('bloqueia PATCH de conteudo em estagio terminal', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ContentLockTerminal');
      const opportunityId = await createOpportunity(adminAuth);
      const stages = await getStages(adminAuth);
      const wonStage = stages.find((s) => s.isWon)!;

      await request(app.getHttpServer())
        .patch(`/api/v1/pipeline/opportunities/${opportunityId}/stage`)
        .set('Authorization', adminAuth)
        .send({ stageId: wonStage.id })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/pipeline/opportunities/${opportunityId}`)
        .set('Authorization', adminAuth)
        .send({ title: 'Tentativa apos ganho' })
        .expect(409);
    });

    it('estagio inativo nao aceita novas oportunidades nem movimentacao', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('InactiveStage');
      const stages = await getStages(adminAuth);
      const negotiationStage = stages.find((s) => s.name === 'Negociação')!;
      await request(app.getHttpServer())
        .patch(`/api/v1/pipeline/stages/${negotiationStage.id}`)
        .set('Authorization', adminAuth)
        .send({ isActive: false })
        .expect(200);

      const customer = await createCustomer(adminAuth);
      await request(app.getHttpServer())
        .post('/api/v1/pipeline/opportunities')
        .set('Authorization', adminAuth)
        .send({ customerId: customer.id, stageId: negotiationStage.id })
        .expect(409);

      const opportunityId = await createOpportunity(adminAuth);
      await request(app.getHttpServer())
        .patch(`/api/v1/pipeline/opportunities/${opportunityId}/stage`)
        .set('Authorization', adminAuth)
        .send({ stageId: negotiationStage.id })
        .expect(409);
    });
  });

  describe('ganho/perda e motivo', () => {
    it('exige "reason" ao mover para um estagio de perda, e registra lostAt/lostReason', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('LostReason');
      const customer = await createCustomer(adminAuth);
      const opportunityRes = await request(app.getHttpServer())
        .post('/api/v1/pipeline/opportunities')
        .set('Authorization', adminAuth)
        .send({ customerId: customer.id })
        .expect(201);
      const opportunityId = opportunityRes.body.data.id as string;
      const stages = await getStages(adminAuth);
      const lostStage = stages.find((s) => s.isLost)!;

      await request(app.getHttpServer())
        .patch(`/api/v1/pipeline/opportunities/${opportunityId}/stage`)
        .set('Authorization', adminAuth)
        .send({ stageId: lostStage.id })
        .expect(400);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/pipeline/opportunities/${opportunityId}/stage`)
        .set('Authorization', adminAuth)
        .send({ stageId: lostStage.id, reason: 'Preço acima do concorrente.' })
        .expect(200);
      expect(res.body.data.lostReason).toBe('Preço acima do concorrente.');
      expect(res.body.data.lostAt).toBeTruthy();
      expect(res.body.data.wonAt).toBeNull();
    });

    it('registra wonAt ao mover para um estagio de ganho, sem exigir motivo', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('WonDate');
      const customer = await createCustomer(adminAuth);
      const opportunityRes = await request(app.getHttpServer())
        .post('/api/v1/pipeline/opportunities')
        .set('Authorization', adminAuth)
        .send({ customerId: customer.id })
        .expect(201);
      const opportunityId = opportunityRes.body.data.id as string;
      const stages = await getStages(adminAuth);
      const wonStage = stages.find((s) => s.isWon)!;

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/pipeline/opportunities/${opportunityId}/stage`)
        .set('Authorization', adminAuth)
        .send({ stageId: wonStage.id })
        .expect(200);
      expect(res.body.data.wonAt).toBeTruthy();
      expect(res.body.data.lostAt).toBeNull();
      expect(res.body.data.lostReason).toBeNull();
    });
  });

  describe('historico/auditoria', () => {
    it('GET /pipeline/opportunities/:id/history reflete criacao e mudanca de estagio', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('History');
      const customer = await createCustomer(adminAuth);
      const res = await request(app.getHttpServer())
        .post('/api/v1/pipeline/opportunities')
        .set('Authorization', adminAuth)
        .send({ customerId: customer.id })
        .expect(201);
      const opportunityId = res.body.data.id as string;
      const stages = await getStages(adminAuth);
      const negotiationStage = stages.find((s) => s.name === 'Negociação')!;

      await request(app.getHttpServer())
        .patch(`/api/v1/pipeline/opportunities/${opportunityId}/stage`)
        .set('Authorization', adminAuth)
        .send({ stageId: negotiationStage.id })
        .expect(200);

      const historyRes = await request(app.getHttpServer())
        .get(`/api/v1/pipeline/opportunities/${opportunityId}/history`)
        .set('Authorization', adminAuth)
        .expect(200);
      const actions = historyRes.body.data.items.map((i: { action: string }) => i.action);
      expect(actions).toContain('pipeline_opportunity.created');
      expect(actions).toContain('pipeline_opportunity.stage_changed');
    });
  });

  describe('filtros/paginacao', () => {
    it('filtra por cliente/estagio e ordena por estimatedValue', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Filters');
      const customerA = await createCustomer(adminAuth, `Alfa ${randomUUID().slice(0, 6)}`);
      const customerB = await createCustomer(adminAuth, `Beta ${randomUUID().slice(0, 6)}`);

      const resA = await request(app.getHttpServer())
        .post('/api/v1/pipeline/opportunities')
        .set('Authorization', adminAuth)
        .send({ customerId: customerA.id, estimatedValue: 100 })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/pipeline/opportunities')
        .set('Authorization', adminAuth)
        .send({ customerId: customerA.id, estimatedValue: 500 })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/pipeline/opportunities')
        .set('Authorization', adminAuth)
        .send({ customerId: customerB.id, estimatedValue: 300 })
        .expect(201);

      const byCustomer = await request(app.getHttpServer())
        .get(`/api/v1/pipeline/opportunities?customerId=${customerA.id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byCustomer.body.data.items).toHaveLength(2);

      const sorted = await request(app.getHttpServer())
        .get('/api/v1/pipeline/opportunities?sortBy=estimatedValue&sortOrder=asc&pageSize=50')
        .set('Authorization', adminAuth)
        .expect(200);
      const values = sorted.body.data.items.map((o: { estimatedValue: number }) => o.estimatedValue);
      expect(values).toEqual([...values].sort((a, b) => a - b));

      const stages = await getStages(adminAuth);
      const leadStage = stages.find((s) => s.name === 'Lead')!;
      const byStage = await request(app.getHttpServer())
        .get(`/api/v1/pipeline/opportunities?stageId=${leadStage.id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byStage.body.data.items.map((o: { id: string }) => o.id)).toContain(resA.body.data.id);

      const paginated = await request(app.getHttpServer())
        .get('/api/v1/pipeline/opportunities?page=1&pageSize=1')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(paginated.body.data.items).toHaveLength(1);
      expect(paginated.body.data.meta.total).toBe(3);
    });
  });

  describe('dashboard', () => {
    it('agrega abertas/ganhas/perdidas e taxa de conversao', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Dashboard');
      const customer = await createCustomer(adminAuth);
      const stages = await getStages(adminAuth);
      const wonStage = stages.find((s) => s.isWon)!;
      const lostStage = stages.find((s) => s.isLost)!;

      async function createAndMove(estimatedValue: number, targetStageId?: string, reason?: string) {
        const res = await request(app.getHttpServer())
          .post('/api/v1/pipeline/opportunities')
          .set('Authorization', adminAuth)
          .send({ customerId: customer.id, estimatedValue })
          .expect(201);
        if (targetStageId) {
          await request(app.getHttpServer())
            .patch(`/api/v1/pipeline/opportunities/${res.body.data.id}/stage`)
            .set('Authorization', adminAuth)
            .send({ stageId: targetStageId, ...(reason ? { reason } : {}) })
            .expect(200);
        }
        return res.body.data.id as string;
      }

      await createAndMove(1000); // aberta
      await createAndMove(2000, wonStage.id); // ganha
      await createAndMove(500, lostStage.id, 'Sem orçamento.'); // perdida

      const res = await request(app.getHttpServer())
        .get('/api/v1/pipeline/dashboard')
        .set('Authorization', adminAuth)
        .expect(200);

      expect(res.body.data.openCount).toBe(1);
      expect(res.body.data.openEstimatedValue).toBe(1000);
      expect(res.body.data.wonCount).toBe(1);
      expect(res.body.data.wonEstimatedValue).toBe(2000);
      expect(res.body.data.lostCount).toBe(1);
      expect(res.body.data.lostEstimatedValue).toBe(500);
      expect(res.body.data.conversionRate).toBeCloseTo(0.5);
    });

    it('GET /pipeline/board agrupa por estagio com totais reais', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Board');
      const customer = await createCustomer(adminAuth);
      await request(app.getHttpServer())
        .post('/api/v1/pipeline/opportunities')
        .set('Authorization', adminAuth)
        .send({ customerId: customer.id, estimatedValue: 750 })
        .expect(201);

      const res = await request(app.getHttpServer()).get('/api/v1/pipeline/board').set('Authorization', adminAuth).expect(200);
      const leadColumn = res.body.data.columns.find((c: { stage: { name: string } }) => c.stage.name === 'Lead');
      expect(leadColumn.totalCount).toBe(1);
      expect(leadColumn.totalEstimatedValue).toBe(750);
      expect(leadColumn.opportunities).toHaveLength(1);
    });
  });

  describe('isolamento multi-tenant', () => {
    it('oportunidade e estagios de um tenant sao invisiveis para outro', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolationA');
      const tenantB = await createTenantAndLoginAsAdmin('IsolationB');
      const customer = await createCustomer(tenantA.adminAuth);
      const res = await request(app.getHttpServer())
        .post('/api/v1/pipeline/opportunities')
        .set('Authorization', tenantA.adminAuth)
        .send({ customerId: customer.id })
        .expect(201);
      const opportunityId = res.body.data.id as string;

      await request(app.getHttpServer())
        .get(`/api/v1/pipeline/opportunities/${opportunityId}`)
        .set('Authorization', tenantB.adminAuth)
        .expect(404);

      const stagesB = await getStages(tenantB.adminAuth);
      const stagesA = await getStages(tenantA.adminAuth);
      expect(stagesB.map((s) => s.id)).not.toEqual(expect.arrayContaining(stagesA.map((s) => s.id)));

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/pipeline/opportunities')
        .set('Authorization', tenantB.adminAuth)
        .expect(200);
      expect(listRes.body.data.items.map((o: { id: string }) => o.id)).not.toContain(opportunityId);
    });
  });

  describe('RBAC', () => {
    it('bloqueia DRIVER; AUDITOR le mas nao escreve', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Rbac');
      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');
      const customer = await createCustomer(adminAuth);

      await request(app.getHttpServer())
        .get('/api/v1/pipeline/opportunities')
        .set('Authorization', driverAuth)
        .expect(403);
      await request(app.getHttpServer())
        .post('/api/v1/pipeline/opportunities')
        .set('Authorization', driverAuth)
        .send({ customerId: customer.id })
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/pipeline/dashboard')
        .set('Authorization', auditorAuth)
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/v1/pipeline/opportunities')
        .set('Authorization', auditorAuth)
        .send({ customerId: customer.id })
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
        slug: `pipe-n1-${label.toLowerCase()}-${unique}`,
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

    it('GET /pipeline/opportunities: contagem de queries nao cresce entre 5 e 20 oportunidades', async () => {
      const { adminAuth } = await createTenantOnCountingApp('N1List');
      const customerRes = await request(countingApp.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', adminAuth)
        .send({ name: 'Cliente N1' })
        .expect(201);
      const customerId = customerRes.body.data.id as string;

      async function seedOpportunity() {
        await request(countingApp.getHttpServer())
          .post('/api/v1/pipeline/opportunities')
          .set('Authorization', adminAuth)
          .send({ customerId, estimatedValue: 100 })
          .expect(201);
      }

      for (let i = 0; i < 5; i += 1) await seedOpportunity();
      queryCount = 0;
      await request(countingApp.getHttpServer()).get('/api/v1/pipeline/opportunities?pageSize=50').set('Authorization', adminAuth).expect(200);
      const queriesFor5 = queryCount;

      for (let i = 5; i < 20; i += 1) await seedOpportunity();
      queryCount = 0;
      await request(countingApp.getHttpServer()).get('/api/v1/pipeline/opportunities?pageSize=50').set('Authorization', adminAuth).expect(200);
      const queriesFor20 = queryCount;

      expect(queriesFor20).toBeLessThanOrEqual(queriesFor5 + 1);
    }, 180000);

    it('GET /pipeline/board e GET /pipeline/dashboard: contagem de queries nao cresce com o numero de oportunidades', async () => {
      const { adminAuth } = await createTenantOnCountingApp('N1BoardDashboard');
      const customerRes = await request(countingApp.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', adminAuth)
        .send({ name: 'Cliente N1 Board' })
        .expect(201);
      const customerId = customerRes.body.data.id as string;

      async function seedOpportunity() {
        await request(countingApp.getHttpServer())
          .post('/api/v1/pipeline/opportunities')
          .set('Authorization', adminAuth)
          .send({ customerId, estimatedValue: 100 })
          .expect(201);
      }

      for (let i = 0; i < 5; i += 1) await seedOpportunity();
      queryCount = 0;
      await request(countingApp.getHttpServer()).get('/api/v1/pipeline/board').set('Authorization', adminAuth).expect(200);
      const boardQueriesFor5 = queryCount;
      queryCount = 0;
      await request(countingApp.getHttpServer()).get('/api/v1/pipeline/dashboard').set('Authorization', adminAuth).expect(200);
      const dashboardQueriesFor5 = queryCount;

      for (let i = 5; i < 20; i += 1) await seedOpportunity();
      queryCount = 0;
      await request(countingApp.getHttpServer()).get('/api/v1/pipeline/board').set('Authorization', adminAuth).expect(200);
      const boardQueriesFor20 = queryCount;
      queryCount = 0;
      await request(countingApp.getHttpServer()).get('/api/v1/pipeline/dashboard').set('Authorization', adminAuth).expect(200);
      const dashboardQueriesFor20 = queryCount;

      expect(boardQueriesFor20).toBeLessThanOrEqual(boardQueriesFor5 + 1);
      expect(dashboardQueriesFor20).toBeLessThanOrEqual(dashboardQueriesFor5 + 1);
    }, 180000);
  });
});
