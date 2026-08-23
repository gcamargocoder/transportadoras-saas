import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Contas a Receber (Fase 72, e2e)', () => {
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
      slug: `receivables-${label.toLowerCase()}-${unique}`,
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
  }

  // Viagem com TripBilling totalmente faturado (status INVOICED) --
  // reaproveita integralmente os endpoints da Fase 59/60 (freight/apply +
  // operational-billing/invoice), pronta para gerar conta a receber.
  async function setupInvoicedTrip(auth: string, customerId: string, amount = 1000) {
    await setupFreightTableWithRule(auth, customerId, amount);
    const tripId = await setupTripWithCustomer(auth, customerId);
    await request(app.getHttpServer())
      .post(`/api/v1/freight/trips/${tripId}/apply`)
      .set('Authorization', auth)
      .send({ customerId })
      .expect(201);
    const invoiceRes = await request(app.getHttpServer())
      .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
      .set('Authorization', auth)
      .send({})
      .expect(201);
    return { tripId, billingId: invoiceRes.body.data.id as string };
  }

  function generateReceivable(auth: string, billingId: string, dueDate: string, description?: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/receivables/from-billing/${billingId}`)
      .set('Authorization', auth)
      .send({ dueDate, ...(description ? { description } : {}) });
  }

  describe('geracao a partir do faturamento', () => {
    it('gera o titulo com snapshot do valor faturado, status OPEN e saldo cheio', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Generate');
      const customerId = await createCustomer(adminAuth);
      const { tripId, billingId } = await setupInvoicedTrip(adminAuth, customerId, 1500);

      const res = await generateReceivable(adminAuth, billingId, '2026-09-30').expect(201);
      expect(res.body.data.tripId).toBe(tripId);
      expect(res.body.data.billingId).toBe(billingId);
      expect(res.body.data.customerId).toBe(customerId);
      expect(res.body.data.originalAmount).toBe(1500);
      expect(res.body.data.receivedAmount).toBe(0);
      expect(res.body.data.balance).toBe(1500);
      expect(res.body.data.status).toBe('OPEN');
      expect(res.body.data.payments).toEqual([]);
    });

    it('idempotencia: bloqueia gerar um segundo titulo para o mesmo billingId', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Idempotent');
      const customerId = await createCustomer(adminAuth);
      const { billingId } = await setupInvoicedTrip(adminAuth, customerId, 800);

      await generateReceivable(adminAuth, billingId, '2026-09-30').expect(201);
      await generateReceivable(adminAuth, billingId, '2026-09-30').expect(409);

      const count = await prisma.receivable.count({ where: { billingId } });
      expect(count).toBe(1);
    });

    it('rejeita billingId inexistente e faturamento sem nenhum valor faturado', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('GenerateGuards');
      const customerId = await createCustomer(adminAuth);
      await setupFreightTableWithRule(adminAuth, customerId, 1000);
      const tripId = await setupTripWithCustomer(adminAuth, customerId);
      await request(app.getHttpServer())
        .post(`/api/v1/freight/trips/${tripId}/apply`)
        .set('Authorization', adminAuth)
        .send({ customerId })
        .expect(201);

      // TripBilling existe (READY) mas invoicedAmount = 0 -- nunca gera titulo vazio.
      const billingRes = await request(app.getHttpServer())
        .get(`/api/v1/operational-billing/trips/${tripId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(billingRes.body.data.persisted).toBe(false);

      await generateReceivable(adminAuth, randomUUID(), '2026-09-30').expect(404);
    });
  });

  describe('recebimentos', () => {
    it('recebimento parcial e depois total -- saldo e status corretos, sem exceder', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Payments');
      const customerId = await createCustomer(adminAuth);
      const { billingId } = await setupInvoicedTrip(adminAuth, customerId, 1000);
      const receivable = await generateReceivable(adminAuth, billingId, '2026-09-30').expect(201);
      const id = receivable.body.data.id as string;

      const partial = await request(app.getHttpServer())
        .post(`/api/v1/receivables/${id}/payments`)
        .set('Authorization', adminAuth)
        .send({ amount: 300, paymentDate: '2026-09-10', paymentMethod: 'PIX', reference: 'TXN-1' })
        .expect(201);
      expect(partial.body.data.receivedAmount).toBe(300);
      expect(partial.body.data.balance).toBe(700);
      expect(partial.body.data.status).toBe('PARTIALLY_RECEIVED');
      expect(partial.body.data.payments).toHaveLength(1);

      // Nunca permite ultrapassar o saldo (700).
      await request(app.getHttpServer())
        .post(`/api/v1/receivables/${id}/payments`)
        .set('Authorization', adminAuth)
        .send({ amount: 701, paymentDate: '2026-09-15', paymentMethod: 'PIX' })
        .expect(400);

      const full = await request(app.getHttpServer())
        .post(`/api/v1/receivables/${id}/payments`)
        .set('Authorization', adminAuth)
        .send({ amount: 700, paymentDate: '2026-09-20', paymentMethod: 'BANK_TRANSFER' })
        .expect(201);
      expect(full.body.data.receivedAmount).toBe(1000);
      expect(full.body.data.balance).toBe(0);
      expect(full.body.data.status).toBe('PAID');
      expect(full.body.data.payments).toHaveLength(2);

      // Ja totalmente recebido -- bloqueia novo pagamento.
      await request(app.getHttpServer())
        .post(`/api/v1/receivables/${id}/payments`)
        .set('Authorization', adminAuth)
        .send({ amount: 1, paymentDate: '2026-09-21', paymentMethod: 'PIX' })
        .expect(409);
    });

    it('vencimento: titulo com dueDate no passado fica OVERDUE, mas nunca apos quitado', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Overdue');
      const customerId = await createCustomer(adminAuth);
      const { billingId } = await setupInvoicedTrip(adminAuth, customerId, 500);
      const receivable = await generateReceivable(adminAuth, billingId, '2020-01-01').expect(201);
      const id = receivable.body.data.id as string;

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/receivables/${id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(getRes.body.data.status).toBe('OVERDUE');

      await request(app.getHttpServer())
        .post(`/api/v1/receivables/${id}/payments`)
        .set('Authorization', adminAuth)
        .send({ amount: 500, paymentDate: '2026-01-01', paymentMethod: 'PIX' })
        .expect(201);

      const paidRes = await request(app.getHttpServer())
        .get(`/api/v1/receivables/${id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(paidRes.body.data.status).toBe('PAID'); // nunca OVERDUE quando saldo = 0
    });
  });

  describe('cancelamento', () => {
    it('cancela, preserva pagamentos ja feitos e bloqueia novos recebimentos', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Cancel');
      const customerId = await createCustomer(adminAuth);
      const { billingId } = await setupInvoicedTrip(adminAuth, customerId, 900);
      const receivable = await generateReceivable(adminAuth, billingId, '2026-09-30').expect(201);
      const id = receivable.body.data.id as string;

      await request(app.getHttpServer())
        .post(`/api/v1/receivables/${id}/payments`)
        .set('Authorization', adminAuth)
        .send({ amount: 200, paymentDate: '2026-09-05', paymentMethod: 'PIX' })
        .expect(201);

      const cancelRes = await request(app.getHttpServer())
        .post(`/api/v1/receivables/${id}/cancel`)
        .set('Authorization', adminAuth)
        .expect(201);
      expect(cancelRes.body.data.status).toBe('CANCELLED');
      expect(cancelRes.body.data.receivedAmount).toBe(200); // pagamento preservado
      expect(cancelRes.body.data.payments).toHaveLength(1);

      await request(app.getHttpServer())
        .post(`/api/v1/receivables/${id}/payments`)
        .set('Authorization', adminAuth)
        .send({ amount: 100, paymentDate: '2026-09-06', paymentMethod: 'PIX' })
        .expect(409);

      await request(app.getHttpServer())
        .post(`/api/v1/receivables/${id}/cancel`)
        .set('Authorization', adminAuth)
        .expect(409);
    });
  });

  describe('isolamento multi-tenant', () => {
    it('tenant B nunca acessa titulo do tenant A (listar/ver/pagar/cancelar)', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolA');
      const tenantB = await createTenantAndLoginAsAdmin('IsolB');
      const customerId = await createCustomer(tenantA.adminAuth);
      const { billingId } = await setupInvoicedTrip(tenantA.adminAuth, customerId, 600);
      const receivable = await generateReceivable(tenantA.adminAuth, billingId, '2026-09-30').expect(201);
      const id = receivable.body.data.id as string;

      await request(app.getHttpServer())
        .get(`/api/v1/receivables/${id}`)
        .set('Authorization', tenantB.adminAuth)
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/v1/receivables/${id}/payments`)
        .set('Authorization', tenantB.adminAuth)
        .send({ amount: 100, paymentDate: '2026-09-05', paymentMethod: 'PIX' })
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/v1/receivables/${id}/cancel`)
        .set('Authorization', tenantB.adminAuth)
        .expect(404);

      const listB = await request(app.getHttpServer())
        .get('/api/v1/receivables')
        .set('Authorization', tenantB.adminAuth)
        .expect(200);
      expect(listB.body.data.items).toHaveLength(0);

      // Nao pode nem gerar um titulo para o billing de outro tenant.
      await generateReceivable(tenantB.adminAuth, billingId, '2026-09-30').expect(404);
    });
  });

  describe('RBAC', () => {
    it('AUDITOR le mas nao registra pagamento nem cancela', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Rbac');
      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');
      const customerId = await createCustomer(adminAuth);
      const { billingId } = await setupInvoicedTrip(adminAuth, customerId, 400);
      const receivable = await generateReceivable(adminAuth, billingId, '2026-09-30').expect(201);
      const id = receivable.body.data.id as string;

      await request(app.getHttpServer())
        .get(`/api/v1/receivables/${id}`)
        .set('Authorization', auditorAuth)
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/v1/receivables/dashboard')
        .set('Authorization', auditorAuth)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/api/v1/receivables/${id}/payments`)
        .set('Authorization', auditorAuth)
        .send({ amount: 100, paymentDate: '2026-09-05', paymentMethod: 'PIX' })
        .expect(403);
      await request(app.getHttpServer())
        .post(`/api/v1/receivables/${id}/cancel`)
        .set('Authorization', auditorAuth)
        .expect(403);
    });
  });

  describe('dashboard e aging', () => {
    it('resumo/aging/por-cliente consistentes com titulos aberto/vencido/pago/cancelado', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Dashboard');
      const customerId = await createCustomer(adminAuth, 'Cliente Dashboard');

      // 1) Em aberto, a vencer.
      const open = await setupInvoicedTrip(adminAuth, customerId, 1000);
      await generateReceivable(adminAuth, open.billingId, '2099-01-01').expect(201);

      // 2) Vencido ha ~45 dias (bucket 31-60).
      const overdue = await setupInvoicedTrip(adminAuth, customerId, 500);
      const overdueDue = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await generateReceivable(adminAuth, overdue.billingId, overdueDue).expect(201);

      // 3) Pago integralmente.
      const paid = await setupInvoicedTrip(adminAuth, customerId, 300);
      const paidReceivable = await generateReceivable(adminAuth, paid.billingId, '2026-01-01').expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/receivables/${paidReceivable.body.data.id}/payments`)
        .set('Authorization', adminAuth)
        .send({ amount: 300, paymentDate: '2026-01-05', paymentMethod: 'PIX' })
        .expect(201);

      // 4) Cancelado -- nunca compoe os totais.
      const cancelled = await setupInvoicedTrip(adminAuth, customerId, 9999);
      const cancelledReceivable = await generateReceivable(adminAuth, cancelled.billingId, '2026-01-01').expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/receivables/${cancelledReceivable.body.data.id}/cancel`)
        .set('Authorization', adminAuth)
        .expect(201);

      const dashboard = await request(app.getHttpServer())
        .get(`/api/v1/receivables/dashboard?customerId=${customerId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      const { summary, aging, byCustomer } = dashboard.body.data;

      expect(summary.totalInvoiced).toBe(1000 + 500 + 300); // 9999 (cancelado) excluido
      expect(summary.totalReceived).toBe(300);
      expect(summary.totalOpen).toBe(1000 + 500);
      expect(summary.totalOverdue).toBe(500);
      expect(summary.totalUpcoming).toBe(1000);
      expect(summary.openCount).toBe(1);
      expect(summary.overdueCount).toBe(1);
      expect(summary.paidCount).toBe(1);
      expect(summary.cancelledCount).toBe(1);

      const upcomingBucket = aging.find((b: { label: string }) => b.label === 'A vencer');
      const bucket31to60 = aging.find((b: { label: string }) => b.label === '31-60 dias');
      expect(upcomingBucket.amount).toBe(1000);
      expect(upcomingBucket.count).toBe(1);
      expect(bucket31to60.amount).toBe(500);
      expect(bucket31to60.count).toBe(1);

      expect(byCustomer).toHaveLength(1);
      expect(byCustomer[0].customerId).toBe(customerId);
      expect(byCustomer[0].totalInvoiced).toBe(1000 + 500 + 300);
      expect(byCustomer[0].totalReceived).toBe(300);
      expect(byCustomer[0].balance).toBe(1000 + 500);
      expect(byCustomer[0].overdueAmount).toBe(500);

      // Listagem por status efetivo (traduzido para where, nunca filtrado em memoria).
      const overdueList = await request(app.getHttpServer())
        .get('/api/v1/receivables?status=OVERDUE')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(overdueList.body.data.items).toHaveLength(1);
      expect(overdueList.body.data.items[0].status).toBe('OVERDUE');

      const paidList = await request(app.getHttpServer())
        .get('/api/v1/receivables?status=PAID')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(paidList.body.data.items).toHaveLength(1);
    });

    it(
      'N+1: numero de queries do dashboard nao cresce com a quantidade de titulos',
      async () => {
        const { adminAuth } = await createTenantAndLoginAsAdmin('DashboardNPlus1');
        const customerId = await createCustomer(adminAuth);

        async function createReceivables(count: number) {
          for (let i = 0; i < count; i += 1) {
            const { billingId } = await setupInvoicedTrip(adminAuth, customerId, 100 + i);
            await generateReceivable(adminAuth, billingId, '2099-01-01').expect(201);
          }
        }

        await createReceivables(3);

        const findManySpy = jest.spyOn(prisma.receivable, 'findMany');
        await request(app.getHttpServer())
          .get(`/api/v1/receivables/dashboard?customerId=${customerId}`)
          .set('Authorization', adminAuth)
          .expect(200);
        const callsWithFew = findManySpy.mock.calls.length;
        findManySpy.mockClear();

        await createReceivables(8); // total 11 titulos

        await request(app.getHttpServer())
          .get(`/api/v1/receivables/dashboard?customerId=${customerId}`)
          .set('Authorization', adminAuth)
          .expect(200);
        const callsWithMany = findManySpy.mock.calls.length;
        findManySpy.mockRestore();

        expect(callsWithFew).toBe(1); // 1 unica query, nunca 1 por titulo/cliente
        expect(callsWithMany).toBe(1); // mesmo numero de queries com ~4x mais titulos
      },
      60000,
    );
  });

  describe('auditoria', () => {
    it('registra criacao, pagamento e cancelamento com ator/tenant/IP', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Audit');
      const customerId = await createCustomer(adminAuth);
      const { billingId } = await setupInvoicedTrip(adminAuth, customerId, 700);
      const receivable = await generateReceivable(adminAuth, billingId, '2026-09-30').expect(201);
      const id = receivable.body.data.id as string;

      await request(app.getHttpServer())
        .post(`/api/v1/receivables/${id}/payments`)
        .set('Authorization', adminAuth)
        .send({ amount: 700, paymentDate: '2026-09-10', paymentMethod: 'PIX' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/receivables/${id}/cancel`)
        .set('Authorization', adminAuth)
        .expect(201);

      const logs = await prisma.auditLog.findMany({
        where: { tenantId, entityName: { in: ['Receivable', 'ReceivablePayment'] } },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs.map((l) => l.action)).toEqual([
        'receivable.created',
        'receivable.payment_created',
        'receivable.cancelled',
      ]);
      for (const log of logs) {
        expect(log.tenantId).toBe(tenantId);
        expect(log.userId).toBeTruthy();
        expect(log.ipAddress).toBeTruthy();
      }
    });
  });
});
