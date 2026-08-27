import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Quotations (e2e)', () => {
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

  function randomPlate(): string {
    const letters = Array.from({ length: 3 }, () =>
      String.fromCharCode(65 + Math.floor(Math.random() * 26)),
    ).join('');
    const digits = Math.floor(1000 + Math.random() * 9000);
    return `${letters}${digits}`;
  }

  function randomValidCpf(): string {
    const calcDigit = (nums: number[], factor: number): number => {
      let total = 0;
      let f = factor;
      for (const n of nums) {
        total += n * f;
        f -= 1;
      }
      const remainder = total % 11;
      return remainder < 2 ? 0 : 11 - remainder;
    };
    const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 9));
    const d1 = calcDigit(base, 10);
    const d2 = calcDigit([...base, d1], 11);
    return [...base, d1, d2].join('');
  }

  async function createTenantAndLoginAsAdmin(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    const payload = {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `quo-${label.toLowerCase()}-${unique}`,
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
    return res.body.data as { id: string };
  }

  async function createCustomerContact(auth: string, customerId: string) {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/customers/${customerId}/contacts`)
      .set('Authorization', auth)
      .send({ name: 'Contato Solicitante' })
      .expect(201);
    return res.body.data as { id: string };
  }

  async function createLocation(auth: string, name: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/locations')
      .set('Authorization', auth)
      .send({ name, type: 'DISTRIBUTION_CENTER' })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createVehicle(auth: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/vehicles')
      .set('Authorization', auth)
      .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createDriver(auth: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/drivers')
      .set('Authorization', auth)
      .send({
        name: 'Jose da Silva',
        cpf: randomValidCpf(),
        cnhNumber: String(Math.floor(10000000000 + Math.random() * 89999999999)),
        cnhCategory: 'AE',
        cnhExpiresAt: '2027-06-30',
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createComposition(auth: string, vehicleId: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/trip-compositions')
      .set('Authorization', auth)
      .send({ vehicleId, trailers: [] })
      .expect(201);
    return res.body.data.id as string;
  }

  // Monta cliente + tabela/regra ACTIVE vigente para origem/destino dados --
  // reaproveita os mesmos endpoints ja testados em freight.e2e-spec.ts.
  async function setupCustomerWithActiveFreightRule(
    auth: string,
    originId: string,
    destinationId: string,
    baseAmount = 800,
  ) {
    const customer = await createCustomer(auth);
    const tableRes = await request(app.getHttpServer())
      .post('/api/v1/freight/tables')
      .set('Authorization', auth)
      .send({
        customerId: customer.id,
        name: 'Tabela Cotacoes',
        code: `TAB-QUO-${randomUUID().slice(0, 8)}`,
        effectiveFrom: '2026-01-01T00:00:00.000Z',
      })
      .expect(201);
    const tableId = tableRes.body.data.id as string;
    await request(app.getHttpServer())
      .patch(`/api/v1/freight/tables/${tableId}`)
      .set('Authorization', auth)
      .send({ status: 'ACTIVE' })
      .expect(200);
    const ruleRes = await request(app.getHttpServer())
      .post('/api/v1/freight/rules')
      .set('Authorization', auth)
      .send({ freightTableId: tableId, originLocationId: originId, destinationLocationId: destinationId, baseAmount })
      .expect(201);
    return { customer, tableId, ruleId: ruleRes.body.data.id as string };
  }

  describe('criacao e calculo/valor informado', () => {
    it('cria cotacao com valor calculado pelo motor existente quando ha tabela/regra aplicavel', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CreateCalc');
      const originId = await createLocation(adminAuth, `Origem ${randomUUID()}`);
      const destinationId = await createLocation(adminAuth, `Destino ${randomUUID()}`);
      const { customer } = await setupCustomerWithActiveFreightRule(adminAuth, originId, destinationId, 950);

      const res = await request(app.getHttpServer())
        .post('/api/v1/quotations')
        .set('Authorization', adminAuth)
        .send({
          customerId: customer.id,
          originLocationId: originId,
          destinationLocationId: destinationId,
          cargoType: 'GRANEL',
          validUntil: '2026-12-31T00:00:00.000Z',
        })
        .expect(201);

      expect(res.body.data.amountSource).toBe('CALCULATED');
      expect(res.body.data.amount).toBe(950);
      expect(res.body.data.calculatedAmount).toBe(950);
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.freightTableId).toBeTruthy();
      expect(res.body.data.customerName).toBe((customer as { name: string }).name);
      expect(res.body.data.originLocationName).toBeTruthy();
      expect(res.body.data.destinationLocationName).toBeTruthy();
    });

    it('exige manualAmount quando nao ha tabela/regra aplicavel, e aceita cotacao manual', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CreateManual');
      const customer = await createCustomer(adminAuth);
      const originId = await createLocation(adminAuth, `Origem ${randomUUID()}`);
      const destinationId = await createLocation(adminAuth, `Destino ${randomUUID()}`);

      await request(app.getHttpServer())
        .post('/api/v1/quotations')
        .set('Authorization', adminAuth)
        .send({
          customerId: customer.id,
          originLocationId: originId,
          destinationLocationId: destinationId,
          validUntil: '2026-12-31T00:00:00.000Z',
        })
        .expect(409);

      const res = await request(app.getHttpServer())
        .post('/api/v1/quotations')
        .set('Authorization', adminAuth)
        .send({
          customerId: customer.id,
          originLocationId: originId,
          destinationLocationId: destinationId,
          validUntil: '2026-12-31T00:00:00.000Z',
          manualAmount: 1234.5,
        })
        .expect(201);

      expect(res.body.data.amountSource).toBe('MANUAL');
      expect(res.body.data.amount).toBe(1234.5);
      expect(res.body.data.calculatedAmount).toBeNull();
      expect(res.body.data.freightTableId).toBeNull();
    });
  });

  describe('snapshot do valor/condicoes', () => {
    it('valor gravado nunca muda quando a FreightRule de origem e editada depois', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('SnapshotFreeze');
      const originId = await createLocation(adminAuth, `Origem ${randomUUID()}`);
      const destinationId = await createLocation(adminAuth, `Destino ${randomUUID()}`);
      const { customer, ruleId } = await setupCustomerWithActiveFreightRule(adminAuth, originId, destinationId, 500);

      const quoteRes = await request(app.getHttpServer())
        .post('/api/v1/quotations')
        .set('Authorization', adminAuth)
        .send({
          customerId: customer.id,
          originLocationId: originId,
          destinationLocationId: destinationId,
          validUntil: '2026-12-31T00:00:00.000Z',
        })
        .expect(201);
      const quotationId = quoteRes.body.data.id as string;
      expect(quoteRes.body.data.amount).toBe(500);

      // Revisa a regra (Fase 59: revisar fecha a versao atual e cria uma nova
      // com o valor alterado) -- a cotacao ja gravada nao deve mudar.
      await request(app.getHttpServer())
        .post(`/api/v1/freight/rules/${ruleId}/revise`)
        .set('Authorization', adminAuth)
        .send({ baseAmount: 9999 })
        .expect(201);

      const afterRes = await request(app.getHttpServer())
        .get(`/api/v1/quotations/${quotationId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(afterRes.body.data.amount).toBe(500);
      expect(afterRes.body.data.calculatedAmount).toBe(500);
    });

    it('PATCH que altera so "conditions" nunca reprocessa o valor ja gravado', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('SnapshotPatchNotes');
      const originId = await createLocation(adminAuth, `Origem ${randomUUID()}`);
      const destinationId = await createLocation(adminAuth, `Destino ${randomUUID()}`);
      const { customer, ruleId } = await setupCustomerWithActiveFreightRule(adminAuth, originId, destinationId, 700);

      const quoteRes = await request(app.getHttpServer())
        .post('/api/v1/quotations')
        .set('Authorization', adminAuth)
        .send({
          customerId: customer.id,
          originLocationId: originId,
          destinationLocationId: destinationId,
          validUntil: '2026-12-31T00:00:00.000Z',
        })
        .expect(201);
      const quotationId = quoteRes.body.data.id as string;

      await request(app.getHttpServer())
        .post(`/api/v1/freight/rules/${ruleId}/revise`)
        .set('Authorization', adminAuth)
        .send({ baseAmount: 111 })
        .expect(201);

      const patchRes = await request(app.getHttpServer())
        .patch(`/api/v1/quotations/${quotationId}`)
        .set('Authorization', adminAuth)
        .send({ conditions: 'Prazo de entrega: 5 dias uteis.' })
        .expect(200);

      expect(patchRes.body.data.conditions).toBe('Prazo de entrega: 5 dias uteis.');
      expect(patchRes.body.data.amount).toBe(700);

      // Editar um parametro relevante ao calculo (weightKg) SIM reprocessa,
      // usando a regra ja atualizada -- comportamento explicito, nunca silencioso.
      const patchWeightRes = await request(app.getHttpServer())
        .patch(`/api/v1/quotations/${quotationId}`)
        .set('Authorization', adminAuth)
        .send({ weightKg: 1000 })
        .expect(200);
      expect(patchWeightRes.body.data.amount).toBe(111);
    });
  });

  describe('validade', () => {
    it('expired reflete validUntil, sem exigir uma transicao de status', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Validity');
      const customer = await createCustomer(adminAuth);
      const originId = await createLocation(adminAuth, `Origem ${randomUUID()}`);
      const destinationId = await createLocation(adminAuth, `Destino ${randomUUID()}`);

      const expiredRes = await request(app.getHttpServer())
        .post('/api/v1/quotations')
        .set('Authorization', adminAuth)
        .send({
          customerId: customer.id,
          originLocationId: originId,
          destinationLocationId: destinationId,
          validUntil: '2020-01-01T00:00:00.000Z',
          manualAmount: 100,
        })
        .expect(201);
      expect(expiredRes.body.data.expired).toBe(true);

      const futureRes = await request(app.getHttpServer())
        .post('/api/v1/quotations')
        .set('Authorization', adminAuth)
        .send({
          customerId: customer.id,
          originLocationId: originId,
          destinationLocationId: destinationId,
          validUntil: '2030-01-01T00:00:00.000Z',
          manualAmount: 100,
        })
        .expect(201);
      expect(futureRes.body.data.expired).toBe(false);
    });
  });

  describe('transicoes de status e bloqueio de alteracao', () => {
    async function createDraftQuotation(auth: string) {
      const customer = await createCustomer(auth);
      const originId = await createLocation(auth, `Origem ${randomUUID()}`);
      const destinationId = await createLocation(auth, `Destino ${randomUUID()}`);
      const res = await request(app.getHttpServer())
        .post('/api/v1/quotations')
        .set('Authorization', auth)
        .send({
          customerId: customer.id,
          originLocationId: originId,
          destinationLocationId: destinationId,
          validUntil: '2026-12-31T00:00:00.000Z',
          manualAmount: 300,
        })
        .expect(201);
      return { customer, originId, destinationId, quotationId: res.body.data.id as string };
    }

    it('percorre o ciclo DRAFT -> SENT -> APPROVED -> CONVERTED e converte em viagem real', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('StatusCycle');
      const { customer, originId, destinationId, quotationId } = await createDraftQuotation(adminAuth);

      await request(app.getHttpServer())
        .patch(`/api/v1/quotations/${quotationId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'SENT' })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/quotations/${quotationId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'APPROVED' })
        .expect(200);

      // CONVERTED nunca e definido diretamente via status.
      await request(app.getHttpServer())
        .patch(`/api/v1/quotations/${quotationId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'CONVERTED' })
        .expect(409);

      const vehicleId = await createVehicle(adminAuth);
      const driverId = await createDriver(adminAuth);
      const compositionId = await createComposition(adminAuth, vehicleId);

      const convertRes = await request(app.getHttpServer())
        .post(`/api/v1/quotations/${quotationId}/convert-to-trip`)
        .set('Authorization', adminAuth)
        .send({
          driverId,
          compositionId,
          plannedDeparture: '2026-09-01T08:00:00.000Z',
          plannedArrival: '2026-09-02T18:00:00.000Z',
        })
        .expect(201);

      expect(convertRes.body.data.status).toBe('CONVERTED');
      const tripId = convertRes.body.data.convertedTripId as string;
      expect(tripId).toBeTruthy();

      const tripRes = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(tripRes.body.data.customerId).toBe(customer.id);
      expect(tripRes.body.data.originLocationId).toBe(originId);
      expect(tripRes.body.data.destinationLocationId).toBe(destinationId);
    });

    it('bloqueia transicao invalida (DRAFT -> APPROVED direto)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('StatusInvalidJump');
      const { quotationId } = await createDraftQuotation(adminAuth);

      await request(app.getHttpServer())
        .patch(`/api/v1/quotations/${quotationId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'APPROVED' })
        .expect(409);
    });

    it('bloqueia PATCH de conteudo e novas transicoes apos estado final (REJECTED)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('StatusFinalLock');
      const { quotationId } = await createDraftQuotation(adminAuth);

      await request(app.getHttpServer())
        .patch(`/api/v1/quotations/${quotationId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'SENT' })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/quotations/${quotationId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'REJECTED' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/quotations/${quotationId}`)
        .set('Authorization', adminAuth)
        .send({ conditions: 'Tentativa de edicao apos rejeicao.' })
        .expect(409);

      await request(app.getHttpServer())
        .patch(`/api/v1/quotations/${quotationId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'SENT' })
        .expect(409);
    });

    it('convert-to-trip exige status APPROVED', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ConvertRequiresApproved');
      const { quotationId } = await createDraftQuotation(adminAuth);
      const vehicleId = await createVehicle(adminAuth);
      const driverId = await createDriver(adminAuth);
      const compositionId = await createComposition(adminAuth, vehicleId);

      await request(app.getHttpServer())
        .post(`/api/v1/quotations/${quotationId}/convert-to-trip`)
        .set('Authorization', adminAuth)
        .send({
          driverId,
          compositionId,
          plannedDeparture: '2026-09-01T08:00:00.000Z',
          plannedArrival: '2026-09-02T18:00:00.000Z',
        })
        .expect(409);
    });
  });

  describe('integracao com Customer/CustomerContact', () => {
    it('aceita customerContactId do proprio cliente e rejeita contato de outro cliente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ContactIntegration');
      const customerA = await createCustomer(adminAuth);
      const customerB = await createCustomer(adminAuth);
      const contactA = await createCustomerContact(adminAuth, customerA.id);
      const originId = await createLocation(adminAuth, `Origem ${randomUUID()}`);
      const destinationId = await createLocation(adminAuth, `Destino ${randomUUID()}`);

      const okRes = await request(app.getHttpServer())
        .post('/api/v1/quotations')
        .set('Authorization', adminAuth)
        .send({
          customerId: customerA.id,
          customerContactId: contactA.id,
          originLocationId: originId,
          destinationLocationId: destinationId,
          validUntil: '2026-12-31T00:00:00.000Z',
          manualAmount: 100,
        })
        .expect(201);
      expect(okRes.body.data.customerContactId).toBe(contactA.id);
      expect(okRes.body.data.customerContactName).toBeTruthy();

      await request(app.getHttpServer())
        .post('/api/v1/quotations')
        .set('Authorization', adminAuth)
        .send({
          customerId: customerB.id,
          customerContactId: contactA.id,
          originLocationId: originId,
          destinationLocationId: destinationId,
          validUntil: '2026-12-31T00:00:00.000Z',
          manualAmount: 100,
        })
        .expect(404);
    });
  });

  describe('historico basico de alteracoes', () => {
    it('GET /quotations/:id/history reflete criacao e mudanca de status', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('History');
      const customer = await createCustomer(adminAuth);
      const originId = await createLocation(adminAuth, `Origem ${randomUUID()}`);
      const destinationId = await createLocation(adminAuth, `Destino ${randomUUID()}`);
      const quoteRes = await request(app.getHttpServer())
        .post('/api/v1/quotations')
        .set('Authorization', adminAuth)
        .send({
          customerId: customer.id,
          originLocationId: originId,
          destinationLocationId: destinationId,
          validUntil: '2026-12-31T00:00:00.000Z',
          manualAmount: 100,
        })
        .expect(201);
      const quotationId = quoteRes.body.data.id as string;

      await request(app.getHttpServer())
        .patch(`/api/v1/quotations/${quotationId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'SENT' })
        .expect(200);

      const historyRes = await request(app.getHttpServer())
        .get(`/api/v1/quotations/${quotationId}/history`)
        .set('Authorization', adminAuth)
        .expect(200);
      const actions = historyRes.body.data.items.map((i: { action: string }) => i.action);
      expect(actions).toContain('quotation.created');
      expect(actions).toContain('quotation.status_changed');
    });
  });

  describe('isolamento multi-tenant', () => {
    it('cotacao de um tenant e invisivel e inacessivel para outro', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('TenantA');
      const tenantB = await createTenantAndLoginAsAdmin('TenantB');
      const customer = await createCustomer(tenantA.adminAuth);
      const originId = await createLocation(tenantA.adminAuth, `Origem ${randomUUID()}`);
      const destinationId = await createLocation(tenantA.adminAuth, `Destino ${randomUUID()}`);
      const quoteRes = await request(app.getHttpServer())
        .post('/api/v1/quotations')
        .set('Authorization', tenantA.adminAuth)
        .send({
          customerId: customer.id,
          originLocationId: originId,
          destinationLocationId: destinationId,
          validUntil: '2026-12-31T00:00:00.000Z',
          manualAmount: 100,
        })
        .expect(201);
      const quotationId = quoteRes.body.data.id as string;

      await request(app.getHttpServer())
        .get(`/api/v1/quotations/${quotationId}`)
        .set('Authorization', tenantB.adminAuth)
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/api/v1/quotations/${quotationId}/status`)
        .set('Authorization', tenantB.adminAuth)
        .send({ status: 'SENT' })
        .expect(404);

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/quotations')
        .set('Authorization', tenantB.adminAuth)
        .expect(200);
      const ids = listRes.body.data.items.map((q: { id: string }) => q.id);
      expect(ids).not.toContain(quotationId);
    });
  });

  describe('RBAC', () => {
    it('bloqueia DRIVER; AUDITOR le mas nao escreve', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Rbac');
      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');
      const customer = await createCustomer(adminAuth);
      const originId = await createLocation(adminAuth, `Origem ${randomUUID()}`);
      const destinationId = await createLocation(adminAuth, `Destino ${randomUUID()}`);

      await request(app.getHttpServer())
        .get('/api/v1/quotations')
        .set('Authorization', driverAuth)
        .expect(403);
      await request(app.getHttpServer())
        .post('/api/v1/quotations')
        .set('Authorization', driverAuth)
        .send({
          customerId: customer.id,
          originLocationId: originId,
          destinationLocationId: destinationId,
          validUntil: '2026-12-31T00:00:00.000Z',
          manualAmount: 100,
        })
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/quotations')
        .set('Authorization', auditorAuth)
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/v1/quotations')
        .set('Authorization', auditorAuth)
        .send({
          customerId: customer.id,
          originLocationId: originId,
          destinationLocationId: destinationId,
          validUntil: '2026-12-31T00:00:00.000Z',
          manualAmount: 100,
        })
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
        slug: `quo-n1-${label.toLowerCase()}-${unique}`,
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

    it('a contagem de queries de GET /quotations nao cresce entre 5 e 20 cotacoes', async () => {
      const { adminAuth } = await createTenantOnCountingApp('N1List');
      const customerRes = await request(countingApp.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', adminAuth)
        .send({ name: 'Cliente N1' })
        .expect(201);
      const customerId = customerRes.body.data.id as string;
      const originRes = await request(countingApp.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', adminAuth)
        .send({ name: `Origem ${randomUUID()}`, type: 'DISTRIBUTION_CENTER' })
        .expect(201);
      const destinationRes = await request(countingApp.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', adminAuth)
        .send({ name: `Destino ${randomUUID()}`, type: 'DISTRIBUTION_CENTER' })
        .expect(201);

      async function seedQuotation() {
        await request(countingApp.getHttpServer())
          .post('/api/v1/quotations')
          .set('Authorization', adminAuth)
          .send({
            customerId,
            originLocationId: originRes.body.data.id,
            destinationLocationId: destinationRes.body.data.id,
            validUntil: '2026-12-31T00:00:00.000Z',
            manualAmount: 100,
          })
          .expect(201);
      }

      for (let i = 0; i < 5; i += 1) await seedQuotation();
      queryCount = 0;
      await request(countingApp.getHttpServer()).get('/api/v1/quotations?pageSize=50').set('Authorization', adminAuth).expect(200);
      const queriesFor5 = queryCount;

      for (let i = 5; i < 20; i += 1) await seedQuotation();
      queryCount = 0;
      await request(countingApp.getHttpServer()).get('/api/v1/quotations?pageSize=50').set('Authorization', adminAuth).expect(200);
      const queriesFor20 = queryCount;

      expect(queriesFor20).toBeLessThanOrEqual(queriesFor5 + 1);
    }, 180000);
  });
});
