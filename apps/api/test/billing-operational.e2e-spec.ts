import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Faturamento Operacional (Fase 60, e2e)', () => {
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

  function randomPlate(): string {
    const letters = Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
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
      slug: `billing-${label.toLowerCase()}-${unique}`,
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

  async function createLocation(auth: string, name: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/locations')
      .set('Authorization', auth)
      .send({ name, type: 'DISTRIBUTION_CENTER' })
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

  async function createTrip(auth: string, driverId: string, compositionId: string, customerId?: string) {
    const originId = await createLocation(auth, `Origem ${randomUUID()}`);
    const destinationId = await createLocation(auth, `Destino ${randomUUID()}`);
    const res = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', auth)
      .send({
        driverId,
        compositionId,
        ...(customerId ? { customerId } : {}),
        originLocationId: originId,
        destinationLocationId: destinationId,
        plannedDeparture: '2026-01-01T08:00:00.000Z',
        plannedArrival: '2026-01-02T18:00:00.000Z',
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function setupTripWithCustomer(auth: string, customerId: string) {
    const vehicleId = await createVehicle(auth);
    const driverId = await createDriver(auth);
    const compositionId = await createComposition(auth, vehicleId);
    return createTrip(auth, driverId, compositionId, customerId);
  }

  async function setupFreightTableWithRule(auth: string, customerId: string, baseAmount = 1000) {
    const tableRes = await request(app.getHttpServer())
      .post('/api/v1/freight/tables')
      .set('Authorization', auth)
      .send({
        customerId,
        name: `Tabela ${randomUUID().slice(0, 8)}`,
        code: `TAB-${randomUUID().slice(0, 8)}`,
        effectiveFrom: '2026-01-01T00:00:00.000Z',
      })
      .expect(201);
    const tableId = tableRes.body.data.id as string;
    await request(app.getHttpServer())
      .patch(`/api/v1/freight/tables/${tableId}`)
      .set('Authorization', auth)
      .send({ status: 'ACTIVE' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/freight/rules')
      .set('Authorization', auth)
      .send({ freightTableId: tableId, baseAmount })
      .expect(201);
    return tableId;
  }

  // Cria uma viagem com TripFreight aplicado (valor comercial calculado),
  // pronta para faturamento -- reaproveita integralmente os endpoints da
  // Fase 59, nunca duplica o motor de calculo.
  async function setupBillableTrip(auth: string, customerId: string, baseAmount = 1000) {
    await setupFreightTableWithRule(auth, customerId, baseAmount);
    const tripId = await setupTripWithCustomer(auth, customerId);
    await request(app.getHttpServer())
      .post(`/api/v1/freight/trips/${tripId}/apply`)
      .set('Authorization', auth)
      .send({ customerId })
      .expect(201);
    return tripId;
  }

  // ==========================================================================
  // Criacao / faturamento total / parcial / idempotencia
  // ==========================================================================
  describe('criacao e faturamento', () => {
    it('viagem sem faturamento iniciado retorna preview ao vivo (nunca 404), status READY', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Preview');
      const customerId = await createCustomer(adminAuth);
      const tripId = await setupBillableTrip(adminAuth, customerId, 800);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/operational-billing/trips/${tripId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.persisted).toBe(false);
      expect(res.body.data.status).toBe('READY');
      expect(res.body.data.billableAmount).toBe(800);
      expect(res.body.data.balance).toBe(800);
    });

    it('faturamento total (amount omitido) fatura o saldo inteiro e marca INVOICED', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('FullInvoice');
      const customerId = await createCustomer(adminAuth);
      const tripId = await setupBillableTrip(adminAuth, customerId, 1000);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
        .set('Authorization', adminAuth)
        .send({})
        .expect(201);
      expect(res.body.data.status).toBe('INVOICED');
      expect(res.body.data.invoicedAmount).toBe(1000);
      expect(res.body.data.balance).toBe(0);
      expect(res.body.data.entries).toHaveLength(1);
      expect(res.body.data.entries[0].amount).toBe(1000);

      const revenues = await prisma.tripRevenue.findMany({ where: { tripId } });
      expect(revenues).toHaveLength(1);
      expect(Number(revenues[0].amount)).toBe(1000);
    });

    it('faturamento parcial marca PARTIALLY_INVOICED e calcula o saldo corretamente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PartialInvoice');
      const customerId = await createCustomer(adminAuth);
      const tripId = await setupBillableTrip(adminAuth, customerId, 1000);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
        .set('Authorization', adminAuth)
        .send({ amount: 400 })
        .expect(201);
      expect(res.body.data.status).toBe('PARTIALLY_INVOICED');
      expect(res.body.data.invoicedAmount).toBe(400);
      expect(res.body.data.balance).toBe(600);
    });

    it('dois faturamentos parciais que somam o total transicionam para INVOICED', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('TwoPartials');
      const customerId = await createCustomer(adminAuth);
      const tripId = await setupBillableTrip(adminAuth, customerId, 1000);

      await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
        .set('Authorization', adminAuth)
        .send({ amount: 600 })
        .expect(201);
      const res = await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
        .set('Authorization', adminAuth)
        .send({ amount: 400 })
        .expect(201);
      expect(res.body.data.status).toBe('INVOICED');
      expect(res.body.data.invoicedAmount).toBe(1000);
      expect(res.body.data.entries).toHaveLength(2);

      const revenues = await prisma.tripRevenue.findMany({ where: { tripId } });
      expect(revenues).toHaveLength(2);
    });

    it('bloqueia faturar um valor maior que o saldo disponivel (nunca ultrapassa o faturavel)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ExceedBalance');
      const customerId = await createCustomer(adminAuth);
      const tripId = await setupBillableTrip(adminAuth, customerId, 1000);

      await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
        .set('Authorization', adminAuth)
        .send({ amount: 1500 })
        .expect(400);

      await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
        .set('Authorization', adminAuth)
        .send({ amount: 700 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
        .set('Authorization', adminAuth)
        .send({ amount: 400 })
        .expect(400);
    });

    it('idempotencia: segunda tentativa de faturamento total apos ja totalmente faturado nunca gera segunda receita (409)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('DuplicateInvoice');
      const customerId = await createCustomer(adminAuth);
      const tripId = await setupBillableTrip(adminAuth, customerId, 500);

      await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
        .set('Authorization', adminAuth)
        .send({})
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
        .set('Authorization', adminAuth)
        .send({})
        .expect(409);

      const revenues = await prisma.tripRevenue.findMany({ where: { tripId } });
      expect(revenues).toHaveLength(1);
      const entries = await prisma.tripBillingEntry.findMany({ where: { tripBilling: { tripId } } });
      expect(entries).toHaveLength(1);
    });

    it('viagem sem TripFreight aplicado (sem valor comercial calculado) nunca pode ser faturada', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('NoFreight');
      const customerId = await createCustomer(adminAuth);
      const tripId = await setupTripWithCustomer(adminAuth, customerId);

      await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
        .set('Authorization', adminAuth)
        .send({})
        .expect(409);
    });

    it('alterar a regra comercial (Fase 59) depois nunca recalcula um faturamento ja feito', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('HistoricalBilling');
      const customerId = await createCustomer(adminAuth);
      const tableId = await setupFreightTableWithRule(adminAuth, customerId, 500);
      const tripId = await setupTripWithCustomer(adminAuth, customerId);
      await request(app.getHttpServer())
        .post(`/api/v1/freight/trips/${tripId}/apply`)
        .set('Authorization', adminAuth)
        .send({ customerId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
        .set('Authorization', adminAuth)
        .send({})
        .expect(201);

      const rulesRes = await request(app.getHttpServer())
        .get('/api/v1/freight/rules')
        .set('Authorization', adminAuth)
        .query({ freightTableId: tableId })
        .expect(200);
      const ruleId = rulesRes.body.data.items[0].id as string;
      await request(app.getHttpServer())
        .post(`/api/v1/freight/rules/${ruleId}/revise`)
        .set('Authorization', adminAuth)
        .send({ baseAmount: 9999 })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/operational-billing/trips/${tripId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.invoicedAmount).toBe(500);
      expect(res.body.data.status).toBe('INVOICED');
    });
  });

  // ==========================================================================
  // PATCH (PAID) / Cancelamento
  // ==========================================================================
  describe('confirmacao de recebimento e cancelamento', () => {
    it('nao permite marcar PAID antes de faturar nada', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PaidBeforeInvoice');
      const customerId = await createCustomer(adminAuth);
      const tripId = await setupBillableTrip(adminAuth, customerId, 500);

      await request(app.getHttpServer())
        .patch(`/api/v1/operational-billing/trips/${tripId}`)
        .set('Authorization', adminAuth)
        .send({ status: 'PAID' })
        .expect(404);
    });

    it('marca PAID apos faturamento total', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PaidAfterInvoice');
      const customerId = await createCustomer(adminAuth);
      const tripId = await setupBillableTrip(adminAuth, customerId, 500);
      await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
        .set('Authorization', adminAuth)
        .send({})
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/operational-billing/trips/${tripId}`)
        .set('Authorization', adminAuth)
        .send({ status: 'PAID' })
        .expect(200);
      expect(res.body.data.status).toBe('PAID');
    });

    it('cancela o faturamento e bloqueia novos lancamentos, preservando as entradas ja geradas', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CancelBilling');
      const customerId = await createCustomer(adminAuth);
      const tripId = await setupBillableTrip(adminAuth, customerId, 1000);
      await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
        .set('Authorization', adminAuth)
        .send({ amount: 300 })
        .expect(201);

      const cancelRes = await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/cancel`)
        .set('Authorization', adminAuth)
        .expect(201);
      expect(cancelRes.body.data.status).toBe('CANCELLED');
      expect(cancelRes.body.data.entries).toHaveLength(1);

      await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
        .set('Authorization', adminAuth)
        .send({ amount: 100 })
        .expect(409);

      const revenues = await prisma.tripRevenue.findMany({ where: { tripId } });
      expect(revenues).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Integracao com o endpoint antigo de receita da Fase 59
  // ==========================================================================
  describe('integracao com Fase 59 (TripFreight/apply-revenue)', () => {
    it('uma vez iniciado o faturamento operacional, o endpoint antigo apply-revenue da Fase 59 fica bloqueado', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('LegacyGuard');
      const customerId = await createCustomer(adminAuth);
      const tripId = await setupBillableTrip(adminAuth, customerId, 500);

      await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
        .set('Authorization', adminAuth)
        .send({ amount: 200 })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/freight/trips/${tripId}/apply-revenue`)
        .set('Authorization', adminAuth)
        .expect(409);
    });
  });

  // ==========================================================================
  // Dashboard e filtros
  // ==========================================================================
  describe('dashboard e filtros', () => {
    it('reflete faturavel/faturado/saldo e o ranking por cliente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Dashboard');
      const customerId = await createCustomer(adminAuth);
      const tripId = await setupBillableTrip(adminAuth, customerId, 1000);
      await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
        .set('Authorization', adminAuth)
        .send({ amount: 600 })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/operational-billing/dashboard')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.totalBillable).toBe(1000);
      expect(res.body.data.totalInvoiced).toBe(600);
      expect(res.body.data.totalReceived).toBe(600);
      expect(res.body.data.balanceToInvoice).toBe(400);
      expect(res.body.data.partiallyInvoicedCount).toBe(1);
      expect(res.body.data.topCustomers).toHaveLength(1);
      expect(res.body.data.topCustomers[0].customerId).toBe(customerId);
    });

    it('conta viagens prontas para faturamento (com valor calculado, nunca faturadas)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('DashboardReady');
      const customerId = await createCustomer(adminAuth);
      await setupBillableTrip(adminAuth, customerId, 700);

      const res = await request(app.getHttpServer())
        .get('/api/v1/operational-billing/dashboard')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.readyForInvoicingCount).toBeGreaterThanOrEqual(1);
      expect(res.body.data.pendingCount).toBeGreaterThanOrEqual(1);
    });

    it('filtra a listagem por status e por cliente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ListFilters');
      const customerA = await createCustomer(adminAuth, 'Cliente A');
      const customerB = await createCustomer(adminAuth, 'Cliente B');
      const tripA = await setupBillableTrip(adminAuth, customerA, 500);
      const tripB = await setupBillableTrip(adminAuth, customerB, 500);
      await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripA}/invoice`)
        .set('Authorization', adminAuth)
        .send({})
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripB}/invoice`)
        .set('Authorization', adminAuth)
        .send({ amount: 100 })
        .expect(201);

      const byStatus = await request(app.getHttpServer())
        .get('/api/v1/operational-billing')
        .set('Authorization', adminAuth)
        .query({ status: 'INVOICED' })
        .expect(200);
      expect(byStatus.body.data.items.every((i: { status: string }) => i.status === 'INVOICED')).toBe(true);

      const byCustomer = await request(app.getHttpServer())
        .get('/api/v1/operational-billing')
        .set('Authorization', adminAuth)
        .query({ customerId: customerB })
        .expect(200);
      expect(byCustomer.body.data.items).toHaveLength(1);
      expect(byCustomer.body.data.items[0].customerId).toBe(customerB);
    });
  });

  // ==========================================================================
  // Fase 103 -- "selecionar viagens elegiveis para faturamento": lista
  // Trip (nunca TripBilling) com valor comercial calculado e saldo a
  // faturar, para descobrir candidatas ANTES de qualquer faturamento
  // iniciado (o preview ao vivo de GET .../trips/:tripId so funciona
  // quando o tripId ja e conhecido).
  // ==========================================================================
  describe('Fase 103 -- viagens elegiveis para faturamento', () => {
    function listEligible(auth: string, query: Record<string, string> = {}) {
      return request(app.getHttpServer())
        .get('/api/v1/operational-billing/eligible-trips')
        .set('Authorization', auth)
        .query(query);
    }

    it('viagem com TripFreight aplicado e nenhum faturamento ainda aparece como elegivel', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('EligNew');
      const customerId = await createCustomer(adminAuth);
      const tripId = await setupBillableTrip(adminAuth, customerId, 700);

      const res = await listEligible(adminAuth).expect(200);
      const row = res.body.data.items.find((i: { tripId: string }) => i.tripId === tripId);
      expect(row).toBeTruthy();
      expect(row.billableAmount).toBe(700);
      expect(row.invoicedAmount).toBe(0);
      expect(row.balance).toBe(700);
      expect(row.billingStatus).toBeNull();
      expect(row.customerId).toBe(customerId);
    });

    it('viagem sem TripFreight aplicado nunca aparece como elegivel', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('EligNoFreight');
      const customerId = await createCustomer(adminAuth);
      const tripId = await setupTripWithCustomer(adminAuth, customerId);

      const res = await listEligible(adminAuth).expect(200);
      expect(res.body.data.items.find((i: { tripId: string }) => i.tripId === tripId)).toBeUndefined();
    });

    it('viagem parcialmente faturada continua elegivel (saldo > 0); some da lista apos faturamento total', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('EligPartial');
      const customerId = await createCustomer(adminAuth);
      const tripId = await setupBillableTrip(adminAuth, customerId, 1000);

      await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
        .set('Authorization', adminAuth)
        .send({ amount: 400 })
        .expect(201);

      const partial = await listEligible(adminAuth).expect(200);
      const partialRow = partial.body.data.items.find((i: { tripId: string }) => i.tripId === tripId);
      expect(partialRow).toBeTruthy();
      expect(partialRow.invoicedAmount).toBe(400);
      expect(partialRow.balance).toBe(600);
      expect(partialRow.billingStatus).toBe('PARTIALLY_INVOICED');

      await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
        .set('Authorization', adminAuth)
        .send({ amount: 600 })
        .expect(201);

      const full = await listEligible(adminAuth).expect(200);
      expect(full.body.data.items.find((i: { tripId: string }) => i.tripId === tripId)).toBeUndefined();
    });

    it('viagem com faturamento cancelado nunca reaparece como elegivel', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('EligCancelled');
      const customerId = await createCustomer(adminAuth);
      const tripId = await setupBillableTrip(adminAuth, customerId, 500);

      await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
        .set('Authorization', adminAuth)
        .send({ amount: 200 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/cancel`)
        .set('Authorization', adminAuth)
        .expect(201);

      const res = await listEligible(adminAuth).expect(200);
      expect(res.body.data.items.find((i: { tripId: string }) => i.tripId === tripId)).toBeUndefined();
    });

    it('filtra por customerId, tripStatus e pagina corretamente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('EligFilters');
      const customerA = await createCustomer(adminAuth, 'Cliente A');
      const customerB = await createCustomer(adminAuth, 'Cliente B');
      const tripA = await setupBillableTrip(adminAuth, customerA, 300);
      await setupBillableTrip(adminAuth, customerB, 300);

      const byCustomer = await listEligible(adminAuth, { customerId: customerA }).expect(200);
      expect(byCustomer.body.data.items).toHaveLength(1);
      expect(byCustomer.body.data.items[0].tripId).toBe(tripA);

      // Viagens novas (setupBillableTrip) ficam PLANNED -- filtrar por
      // COMPLETED nao deve encontrar nenhuma delas.
      const byStatus = await listEligible(adminAuth, { tripStatus: 'COMPLETED' }).expect(200);
      expect(byStatus.body.data.items.find((i: { tripId: string }) => i.tripId === tripA)).toBeUndefined();

      const byStatusPlanned = await listEligible(adminAuth, { tripStatus: 'PLANNED' }).expect(200);
      expect(byStatusPlanned.body.data.items.find((i: { tripId: string }) => i.tripId === tripA)).toBeTruthy();

      const page1 = await listEligible(adminAuth, { pageSize: '1', page: '1' }).expect(200);
      expect(page1.body.data.items).toHaveLength(1);
      expect(page1.body.data.meta.total).toBeGreaterThanOrEqual(2);
    });

    it('isolamento multi-tenant: viagens elegiveis de outro tenant nunca aparecem', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('EligIsolA');
      const customerA = await createCustomer(tenantA.adminAuth);
      const tripA = await setupBillableTrip(tenantA.adminAuth, customerA, 300);

      const tenantB = await createTenantAndLoginAsAdmin('EligIsolB');
      const res = await listEligible(tenantB.adminAuth).expect(200);
      expect(res.body.data.items.find((i: { tripId: string }) => i.tripId === tripA)).toBeUndefined();
    });

    it('RBAC: DRIVER bloqueado (403); AUDITOR consulta normalmente', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('EligRbac');
      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');

      await listEligible(driverAuth).expect(403);
      await listEligible(auditorAuth).expect(200);
    });
  });

  // ==========================================================================
  // Fase 103 -- competencia financeira: o faturamento (POST .../invoice)
  // agora respeita o mesmo FinancialPeriodGuard das Fases 76/79 ja usado
  // por Receivables/Payables/FinancialTransactions -- bloqueia quando o
  // periodo do MES ATUAL (competencia da receita gerada) esta FECHADO.
  // ==========================================================================
  describe('Fase 103 -- competencia financeira (FinancialPeriodGuard)', () => {
    function openPeriod(auth: string, year: number, month: number) {
      return request(app.getHttpServer()).post('/api/v1/finance/periods').set('Authorization', auth).send({ year, month });
    }

    function closePeriod(auth: string, id: string) {
      return request(app.getHttpServer()).post(`/api/v1/finance/periods/${id}/close`).set('Authorization', auth).send({});
    }

    it('bloqueia (409) faturar quando o periodo do mes atual esta FECHADO', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PeriodClosed');
      const customerId = await createCustomer(adminAuth);
      const tripId = await setupBillableTrip(adminAuth, customerId, 500);

      const now = new Date();
      const period = await openPeriod(adminAuth, now.getUTCFullYear(), now.getUTCMonth() + 1).expect(201);
      await closePeriod(adminAuth, period.body.data.id).expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
        .set('Authorization', adminAuth)
        .send({})
        .expect(409);

      // Nenhum TripBilling/TripRevenue foi criado -- bloqueio ocorre ANTES
      // de qualquer escrita.
      expect(await prisma.tripBilling.findFirst({ where: { tripId } })).toBeNull();
      expect(await prisma.tripRevenue.findFirst({ where: { tripId } })).toBeNull();
    });

    it('permite faturar quando o periodo do mes atual esta OPEN ou inexistente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PeriodOpen');
      const customerId = await createCustomer(adminAuth);

      // Periodo inexistente (nenhum finance/periods criado neste tenant).
      const tripNoPeriod = await setupBillableTrip(adminAuth, customerId, 200);
      await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripNoPeriod}/invoice`)
        .set('Authorization', adminAuth)
        .send({})
        .expect(201);

      // Periodo aberto explicitamente.
      const now = new Date();
      await openPeriod(adminAuth, now.getUTCFullYear(), now.getUTCMonth() + 1).expect(201);
      const tripOpenPeriod = await setupBillableTrip(adminAuth, customerId, 200);
      await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripOpenPeriod}/invoice`)
        .set('Authorization', adminAuth)
        .send({})
        .expect(201);
    });
  });

  // ==========================================================================
  // Fase 103 -- snapshot: uma vez que o faturamento tem qualquer valor ja
  // lancado, billableAmount fica CONGELADO -- nunca mais recalculado de
  // TripFreight, mesmo que PATCH /freight/trips/:tripId edite o valor
  // contratado depois ("preservar snapshot dos dados necessarios ao
  // faturamento quando a fonte puder sofrer alteracao posterior").
  // ==========================================================================
  describe('Fase 103 -- snapshot do valor faturavel', () => {
    it('billableAmount permanece o mesmo apos editar TripFreight.contractedAmount entre dois faturamentos parciais', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('SnapshotFreeze');
      const customerId = await createCustomer(adminAuth);
      const tripId = await setupBillableTrip(adminAuth, customerId, 1000);

      const first = await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
        .set('Authorization', adminAuth)
        .send({ amount: 300 })
        .expect(201);
      expect(first.body.data.billableAmount).toBe(1000);
      expect(first.body.data.balance).toBe(700);

      // Edicao humana do valor contratado -- PATCH /freight/trips/:tripId
      // (Fase 59, distinta de revisar a regra/tabela).
      await request(app.getHttpServer())
        .patch(`/api/v1/freight/trips/${tripId}`)
        .set('Authorization', adminAuth)
        .send({ contractedAmount: 5000 })
        .expect(200);

      // GET (preview) reflete o valor CONGELADO da viagem, nao o novo.
      const preview = await request(app.getHttpServer())
        .get(`/api/v1/operational-billing/trips/${tripId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(preview.body.data.billableAmount).toBe(1000);
      expect(preview.body.data.balance).toBe(700);
      // contractedAmount (informativo, comparativo) reflete o valor ATUAL --
      // so billableAmount (usado no calculo) fica congelado.
      expect(preview.body.data.contractedAmount).toBe(5000);

      const second = await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
        .set('Authorization', adminAuth)
        .send({ amount: 700 })
        .expect(201);
      expect(second.body.data.billableAmount).toBe(1000);
      expect(second.body.data.invoicedAmount).toBe(1000);
      expect(second.body.data.status).toBe('INVOICED');
    });
  });

  // ==========================================================================
  // Isolamento multi-tenant e RBAC
  // ==========================================================================
  describe('isolamento multi-tenant', () => {
    it('viagem/faturamento de um tenant nunca sao acessiveis/alteraveis por outro tenant', async () => {
      const { adminAuth: authA } = await createTenantAndLoginAsAdmin('TenantA');
      const { adminAuth: authB } = await createTenantAndLoginAsAdmin('TenantB');
      const customerId = await createCustomer(authA);
      const tripId = await setupBillableTrip(authA, customerId, 500);

      await request(app.getHttpServer())
        .get(`/api/v1/operational-billing/trips/${tripId}`)
        .set('Authorization', authB)
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
        .set('Authorization', authB)
        .send({})
        .expect(404);

      await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
        .set('Authorization', authA)
        .send({})
        .expect(201);

      // tenant B nunca ve o faturamento de A na listagem/dashboard, nem
      // consegue cancela-lo.
      const listB = await request(app.getHttpServer())
        .get('/api/v1/operational-billing')
        .set('Authorization', authB)
        .expect(200);
      expect(listB.body.data.items).toHaveLength(0);

      await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/cancel`)
        .set('Authorization', authB)
        .expect(404);
    });
  });

  describe('RBAC', () => {
    it('bloqueia DRIVER em tudo; AUDITOR le mas nao escreve; SUPER_ADMIN nunca e bloqueado', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('RbacBilling');
      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');
      const customerId = await createCustomer(adminAuth);
      const tripId = await setupBillableTrip(adminAuth, customerId, 500);

      await request(app.getHttpServer())
        .get('/api/v1/operational-billing')
        .set('Authorization', driverAuth)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/operational-billing')
        .set('Authorization', auditorAuth)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
        .set('Authorization', auditorAuth)
        .send({})
        .expect(403);

      await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
        .set('Authorization', adminAuth)
        .send({})
        .expect(201);
    });
  });

  // ==========================================================================
  // N+1
  // ==========================================================================
  describe('verificacao de ausencia de N+1 (dashboard)', () => {
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
        slug: `billing-n1-${label.toLowerCase()}-${unique}`,
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

    async function seedInvoicedTrip(auth: string, customerId: string, tableId: string) {
      const vehicleRes = await request(countingApp.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
        .expect(201);
      const driverRes = await request(countingApp.getHttpServer())
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
      const compositionRes = await request(countingApp.getHttpServer())
        .post('/api/v1/trip-compositions')
        .set('Authorization', auth)
        .send({ vehicleId: vehicleRes.body.data.id, trailers: [] })
        .expect(201);
      const originRes = await request(countingApp.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', auth)
        .send({ name: `Origem ${randomUUID()}`, type: 'DISTRIBUTION_CENTER' })
        .expect(201);
      const destinationRes = await request(countingApp.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', auth)
        .send({ name: `Destino ${randomUUID()}`, type: 'DISTRIBUTION_CENTER' })
        .expect(201);
      const tripRes = await request(countingApp.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send({
          driverId: driverRes.body.data.id,
          compositionId: compositionRes.body.data.id,
          customerId,
          originLocationId: originRes.body.data.id,
          destinationLocationId: destinationRes.body.data.id,
          plannedDeparture: '2026-01-01T08:00:00.000Z',
          plannedArrival: '2026-01-02T18:00:00.000Z',
        })
        .expect(201);
      const tripId = tripRes.body.data.id as string;
      await request(countingApp.getHttpServer())
        .post(`/api/v1/freight/trips/${tripId}/apply`)
        .set('Authorization', auth)
        .send({ customerId, freightTableId: tableId })
        .expect(201);
      await request(countingApp.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
        .set('Authorization', auth)
        .send({})
        .expect(201);
    }

    it('a contagem de queries de GET /operational-billing/dashboard nao cresce entre 5 e 20 faturamentos', async () => {
      const { adminAuth } = await createTenantOnCountingApp('N1Billing');
      const customerRes = await request(countingApp.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', adminAuth)
        .send({ name: 'Cliente N1' })
        .expect(201);
      const customerId = customerRes.body.data.id as string;

      const tableRes = await request(countingApp.getHttpServer())
        .post('/api/v1/freight/tables')
        .set('Authorization', adminAuth)
        .send({
          customerId,
          name: 'Tabela N1',
          code: `TAB-N1-${randomUUID().slice(0, 8)}`,
          effectiveFrom: '2026-01-01T00:00:00.000Z',
        })
        .expect(201);
      const tableId = tableRes.body.data.id as string;
      await request(countingApp.getHttpServer())
        .patch(`/api/v1/freight/tables/${tableId}`)
        .set('Authorization', adminAuth)
        .send({ status: 'ACTIVE' })
        .expect(200);
      await request(countingApp.getHttpServer())
        .post('/api/v1/freight/rules')
        .set('Authorization', adminAuth)
        .send({ freightTableId: tableId, baseAmount: 500 })
        .expect(201);

      for (let i = 0; i < 5; i += 1) await seedInvoicedTrip(adminAuth, customerId, tableId);
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/operational-billing/dashboard')
        .set('Authorization', adminAuth)
        .expect(200);
      const queriesFor5 = queryCount;

      for (let i = 5; i < 20; i += 1) await seedInvoicedTrip(adminAuth, customerId, tableId);
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/operational-billing/dashboard')
        .set('Authorization', adminAuth)
        .expect(200);
      const queriesFor20 = queryCount;

      expect(queriesFor20).toBeLessThanOrEqual(queriesFor5 + 1);
    }, 180000);

    // Fase 103 -- mesmo principio: 1 findMany + 1 count, nenhuma consulta
    // por linha, mesmo com composicao/veiculo/motorista/freight/billing
    // incluidos via select unico.
    async function seedEligibleTrip(auth: string, customerId: string, tableId: string): Promise<void> {
      const vehicleRes = await request(countingApp.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
        .expect(201);
      const driverRes = await request(countingApp.getHttpServer())
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
      const compositionRes = await request(countingApp.getHttpServer())
        .post('/api/v1/trip-compositions')
        .set('Authorization', auth)
        .send({ vehicleId: vehicleRes.body.data.id, trailers: [] })
        .expect(201);
      const originRes = await request(countingApp.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', auth)
        .send({ name: `Origem ${randomUUID()}`, type: 'DISTRIBUTION_CENTER' })
        .expect(201);
      const destinationRes = await request(countingApp.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', auth)
        .send({ name: `Destino ${randomUUID()}`, type: 'DISTRIBUTION_CENTER' })
        .expect(201);
      const tripRes = await request(countingApp.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send({
          driverId: driverRes.body.data.id,
          compositionId: compositionRes.body.data.id,
          customerId,
          originLocationId: originRes.body.data.id,
          destinationLocationId: destinationRes.body.data.id,
          plannedDeparture: '2026-01-01T08:00:00.000Z',
          plannedArrival: '2026-01-02T18:00:00.000Z',
        })
        .expect(201);
      const tripId = tripRes.body.data.id as string;
      await request(countingApp.getHttpServer())
        .post(`/api/v1/freight/trips/${tripId}/apply`)
        .set('Authorization', auth)
        .send({ customerId, freightTableId: tableId })
        .expect(201);
    }

    it('a contagem de queries de GET /operational-billing/eligible-trips nao cresce entre 5 e 20 viagens elegiveis', async () => {
      const { adminAuth } = await createTenantOnCountingApp('N1Eligible');
      const customerRes = await request(countingApp.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', adminAuth)
        .send({ name: 'Cliente N1 Eligible' })
        .expect(201);
      const customerId = customerRes.body.data.id as string;

      const tableRes = await request(countingApp.getHttpServer())
        .post('/api/v1/freight/tables')
        .set('Authorization', adminAuth)
        .send({
          customerId,
          name: 'Tabela N1 Eligible',
          code: `TAB-N1E-${randomUUID().slice(0, 8)}`,
          effectiveFrom: '2026-01-01T00:00:00.000Z',
        })
        .expect(201);
      const tableId = tableRes.body.data.id as string;
      await request(countingApp.getHttpServer())
        .patch(`/api/v1/freight/tables/${tableId}`)
        .set('Authorization', adminAuth)
        .send({ status: 'ACTIVE' })
        .expect(200);
      await request(countingApp.getHttpServer())
        .post('/api/v1/freight/rules')
        .set('Authorization', adminAuth)
        .send({ freightTableId: tableId, baseAmount: 500 })
        .expect(201);

      for (let i = 0; i < 5; i += 1) await seedEligibleTrip(adminAuth, customerId, tableId);
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/operational-billing/eligible-trips')
        .set('Authorization', adminAuth)
        .expect(200);
      const queriesFor5 = queryCount;

      for (let i = 5; i < 20; i += 1) await seedEligibleTrip(adminAuth, customerId, tableId);
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/operational-billing/eligible-trips')
        .set('Authorization', adminAuth)
        .expect(200);
      const queriesFor20 = queryCount;

      expect(queriesFor5).toBeGreaterThan(0);
      expect(queriesFor20).toBeLessThanOrEqual(queriesFor5 + 1);
    }, 180000);
  });
});
