import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Fluxo de Caixa Consolidado (Fase 74, e2e)', () => {
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
      slug: `finance-${label.toLowerCase()}-${unique}`,
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
    const res = await request(app.getHttpServer()).post('/api/v1/customers').set('Authorization', auth).send({ name }).expect(201);
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

  async function setupTrip(auth: string, customerId?: string) {
    const vehicleId = await createVehicle(auth);
    const driverId = await createDriver(auth);
    const compositionId = await createComposition(auth, vehicleId);
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
        plannedDeparture: '2026-09-01T08:00:00.000Z',
        plannedArrival: '2026-09-05T18:00:00.000Z',
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function setupFreightTableWithRule(auth: string, customerId: string, baseAmount: number) {
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

  async function setupReceivable(auth: string, customerId: string, amount: number, dueDate: string) {
    await setupFreightTableWithRule(auth, customerId, amount);
    const tripId = await setupTrip(auth, customerId);
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
    const receivableRes = await request(app.getHttpServer())
      .post(`/api/v1/receivables/from-billing/${invoiceRes.body.data.id}`)
      .set('Authorization', auth)
      .send({ dueDate })
      .expect(201);
    return receivableRes.body.data.id as string;
  }

  // Fase 79 -- POST /receivables|payables/:id/payments agora exige
  // financialAccountId; cada chamada cria sua propria conta (simplicidade
  // > reuso, o custo extra em requests e desprezivel nesta suite).
  async function createFinancialAccount(auth: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/finance/accounts')
      .set('Authorization', auth)
      .send({ name: `Conta Teste ${randomUUID().slice(0, 8)}`, type: 'BANK', initialBalance: 1000000 })
      .expect(201);
    return res.body.data.id as string;
  }

  async function payReceivable(auth: string, receivableId: string, amount: number, paymentDate: string) {
    const financialAccountId = await createFinancialAccount(auth);
    await request(app.getHttpServer())
      .post(`/api/v1/receivables/${receivableId}/payments`)
      .set('Authorization', auth)
      .send({ amount, paymentDate, paymentMethod: 'PIX', financialAccountId })
      .expect(201);
  }

  async function setupPayable(auth: string, amount: number, dueDate: string, category = 'MAINTENANCE') {
    const tripId = await setupTrip(auth);
    const expenseRes = await request(app.getHttpServer())
      .post('/api/v1/trip-expenses')
      .set('Authorization', auth)
      .send({ tripId, category, description: 'Despesa teste', expenseDate: '2026-09-02T10:00:00.000Z', amount })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/trip-expenses/${expenseRes.body.data.id}/status`)
      .set('Authorization', auth)
      .send({ status: 'APPROVED' })
      .expect(200);
    const payableRes = await request(app.getHttpServer())
      .post(`/api/v1/payables/from-expense/${expenseRes.body.data.id}`)
      .set('Authorization', auth)
      .send({ dueDate })
      .expect(201);
    return payableRes.body.data.id as string;
  }

  async function payPayable(auth: string, payableId: string, amount: number, paymentDate: string) {
    const financialAccountId = await createFinancialAccount(auth);
    await request(app.getHttpServer())
      .post(`/api/v1/payables/${payableId}/payments`)
      .set('Authorization', auth)
      .send({ amount, paymentDate, paymentMethod: 'PIX', financialAccountId })
      .expect(201);
  }

  describe('KPIs de resumo', () => {
    it('recebido/pago refletem ReceivablePayment/PayablePayment reais -- nunca o valor faturado/despesado bruto', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Kpis');
      const customerId = await createCustomer(adminAuth);

      // Faturado 1000, recebido parcial 400 -- totalReceived deve ser 400, nao 1000.
      const receivableId = await setupReceivable(adminAuth, customerId, 1000, '2099-01-01');
      await payReceivable(adminAuth, receivableId, 400, '2026-09-10');

      // Despesa 800, pago parcial 300 -- totalPaid deve ser 300, nao 800.
      const payableId = await setupPayable(adminAuth, 800, '2099-01-01');
      await payPayable(adminAuth, payableId, 300, '2026-09-10');

      const res = await request(app.getHttpServer())
        .get('/api/v1/finance/cash-flow')
        .set('Authorization', adminAuth)
        .expect(200);
      const { summary } = res.body.data;

      expect(summary.totalReceived).toBe(400); // nunca 1000 (faturado)
      expect(summary.totalPaid).toBe(300); // nunca 800 (despesa)
      expect(summary.totalReceivableOpen).toBe(600);
      expect(summary.totalPayableOpen).toBe(500);
      expect(summary.projectedNetBalance).toBe(100); // 600 - 500
      expect(summary.receivedCount).toBe(1);
      expect(summary.paidCount).toBe(1);
      expect(payableId).toBeTruthy();
    });

    it('overdue: titulos com vencimento no passado entram em totalReceivableOverdue/totalPayableOverdue, nunca quando pagos', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Overdue');
      const customerId = await createCustomer(adminAuth);

      const overdueReceivableId = await setupReceivable(adminAuth, customerId, 500, '2020-01-01');
      const overduePayableId = await setupPayable(adminAuth, 300, '2020-01-01');

      const before = await request(app.getHttpServer())
        .get('/api/v1/finance/cash-flow')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(before.body.data.summary.totalReceivableOverdue).toBe(500);
      expect(before.body.data.summary.totalPayableOverdue).toBe(300);

      // Quitando os titulos, o vencido some (saldo = 0).
      await payReceivable(adminAuth, overdueReceivableId, 500, '2026-09-10');
      await payPayable(adminAuth, overduePayableId, 300, '2026-09-10');

      const after = await request(app.getHttpServer())
        .get('/api/v1/finance/cash-flow')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(after.body.data.summary.totalReceivableOverdue).toBe(0);
      expect(after.body.data.summary.totalPayableOverdue).toBe(0);
    });
  });

  describe('serie mensal', () => {
    it('bucket do mes corrente reflete os pagamentos com paymentDate naquele mes', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Monthly');
      const customerId = await createCustomer(adminAuth);

      const now = new Date();
      const currentPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      const todayIso = now.toISOString().slice(0, 10);

      const receivableId = await setupReceivable(adminAuth, customerId, 1000, '2099-01-01');
      await payReceivable(adminAuth, receivableId, 700, todayIso);
      const payableId = await setupPayable(adminAuth, 600, '2099-01-01');
      await payPayable(adminAuth, payableId, 250, todayIso);

      const res = await request(app.getHttpServer())
        .get('/api/v1/finance/cash-flow')
        .set('Authorization', adminAuth)
        .expect(200);

      const currentBucket = res.body.data.monthly.find((p: { period: string }) => p.period === currentPeriod);
      expect(currentBucket).toBeTruthy();
      expect(currentBucket.received).toBeGreaterThanOrEqual(700);
      expect(currentBucket.paid).toBeGreaterThanOrEqual(250);
      expect(currentBucket.net).toBe(currentBucket.received - currentBucket.paid);
      expect(res.body.data.monthly).toHaveLength(12); // janela padrao (sem from/to)
    });

    it('aceita from/to explicitos e retorna o numero de meses correspondente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('MonthlyRange');
      const res = await request(app.getHttpServer())
        .get('/api/v1/finance/cash-flow?from=2026-01-01&to=2026-03-31')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.monthly).toHaveLength(3);
      expect(res.body.data.monthly.map((p: { period: string }) => p.period)).toEqual(['2026-01', '2026-02', '2026-03']);
    });
  });

  describe('rankings', () => {
    it('topReceivableCustomers/topPayableCategories ordenados pelo saldo em aberto (balance)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Rankings');
      const customerBig = await createCustomer(adminAuth, 'Cliente Grande');
      const customerSmall = await createCustomer(adminAuth, 'Cliente Pequeno');

      await setupReceivable(adminAuth, customerSmall, 200, '2099-01-01');
      await setupReceivable(adminAuth, customerBig, 900, '2099-01-01');
      await setupPayable(adminAuth, 700, '2099-01-01', 'FUEL');
      await setupPayable(adminAuth, 100, '2099-01-01', 'TIRES');

      const res = await request(app.getHttpServer())
        .get('/api/v1/finance/cash-flow')
        .set('Authorization', adminAuth)
        .expect(200);

      const { topReceivableCustomers, topPayableCategories } = res.body.data;
      expect(topReceivableCustomers[0].customerName).toBe('Cliente Grande');
      expect(topReceivableCustomers[0].balance).toBe(900);
      expect(topPayableCategories[0].category).toBe('FUEL');
      expect(topPayableCategories[0].balance).toBe(700);
    });
  });

  describe('isolamento multi-tenant', () => {
    it('tenant B nunca ve o fluxo de caixa do tenant A', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolA');
      const tenantB = await createTenantAndLoginAsAdmin('IsolB');
      const customerId = await createCustomer(tenantA.adminAuth);
      const receivableId = await setupReceivable(tenantA.adminAuth, customerId, 1000, '2099-01-01');
      await payReceivable(tenantA.adminAuth, receivableId, 1000, '2026-09-10');

      const resB = await request(app.getHttpServer())
        .get('/api/v1/finance/cash-flow')
        .set('Authorization', tenantB.adminAuth)
        .expect(200);
      expect(resB.body.data.summary.totalReceived).toBe(0);
      expect(resB.body.data.summary.totalReceivableOpen).toBe(0);
      expect(resB.body.data.topReceivableCustomers).toHaveLength(0);
    });
  });

  describe('RBAC', () => {
    it('DRIVER nunca acessa o fluxo de caixa administrativo', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Rbac');
      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');

      await request(app.getHttpServer())
        .get('/api/v1/finance/cash-flow')
        .set('Authorization', driverAuth)
        .expect(403);

      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');
      await request(app.getHttpServer())
        .get('/api/v1/finance/cash-flow')
        .set('Authorization', auditorAuth)
        .expect(200);
    });
  });

  describe('performance', () => {
    it(
      'N+1: numero de queries do cash-flow nao cresce com a quantidade de titulos/pagamentos',
      async () => {
        const { adminAuth } = await createTenantAndLoginAsAdmin('NPlus1');
        const customerId = await createCustomer(adminAuth);

        async function createFlowItems(count: number) {
          for (let i = 0; i < count; i += 1) {
            const receivableId = await setupReceivable(adminAuth, customerId, 100 + i, '2099-01-01');
            await payReceivable(adminAuth, receivableId, 50, '2026-09-10');
            const payableId = await setupPayable(adminAuth, 80 + i, '2099-01-01');
            await payPayable(adminAuth, payableId, 30, '2026-09-10');
          }
        }

        await createFlowItems(2);

        const receivableSpy = jest.spyOn(prisma.receivable, 'findMany');
        const payableSpy = jest.spyOn(prisma.payable, 'findMany');
        const receivablePaymentSpy = jest.spyOn(prisma.receivablePayment, 'findMany');
        const payablePaymentSpy = jest.spyOn(prisma.payablePayment, 'findMany');

        await request(app.getHttpServer())
          .get('/api/v1/finance/cash-flow')
          .set('Authorization', adminAuth)
          .expect(200);
        const callsWithFew = {
          receivable: receivableSpy.mock.calls.length,
          payable: payableSpy.mock.calls.length,
          receivablePayment: receivablePaymentSpy.mock.calls.length,
          payablePayment: payablePaymentSpy.mock.calls.length,
        };
        receivableSpy.mockClear();
        payableSpy.mockClear();
        receivablePaymentSpy.mockClear();
        payablePaymentSpy.mockClear();

        await createFlowItems(6); // total 8 titulos de cada tipo

        await request(app.getHttpServer())
          .get('/api/v1/finance/cash-flow')
          .set('Authorization', adminAuth)
          .expect(200);
        const callsWithMany = {
          receivable: receivableSpy.mock.calls.length,
          payable: payableSpy.mock.calls.length,
          receivablePayment: receivablePaymentSpy.mock.calls.length,
          payablePayment: payablePaymentSpy.mock.calls.length,
        };
        receivableSpy.mockRestore();
        payableSpy.mockRestore();
        receivablePaymentSpy.mockRestore();
        payablePaymentSpy.mockRestore();

        expect(callsWithFew).toEqual(callsWithMany); // mesmo numero de queries independente da quantidade
        expect(callsWithFew.receivable).toBeGreaterThan(0);
      },
      90000,
    );
  });
});
