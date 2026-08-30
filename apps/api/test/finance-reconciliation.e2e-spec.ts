import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Conciliacao Financeira (Fase 75, e2e)', () => {
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
      slug: `reconciliation-${label.toLowerCase()}-${unique}`,
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
      .send({ customerId, name: `Tabela ${randomUUID().slice(0, 8)}`, code: `TAB-${randomUUID().slice(0, 8)}`, effectiveFrom: '2026-01-01T00:00:00.000Z' })
      .expect(201);
    const tableId = tableRes.body.data.id as string;
    await request(app.getHttpServer()).patch(`/api/v1/freight/tables/${tableId}`).set('Authorization', auth).send({ status: 'ACTIVE' }).expect(200);
    await request(app.getHttpServer()).post('/api/v1/freight/rules').set('Authorization', auth).send({ freightTableId: tableId, baseAmount }).expect(201);
  }

  // Fatura (total ou parcial) e devolve { tripId, billingId }.
  async function setupBilling(auth: string, customerId: string, baseAmount: number, invoiceAmount?: number) {
    await setupFreightTableWithRule(auth, customerId, baseAmount);
    const tripId = await setupTrip(auth, customerId);
    await request(app.getHttpServer()).post(`/api/v1/freight/trips/${tripId}/apply`).set('Authorization', auth).send({ customerId }).expect(201);
    const invoiceRes = await request(app.getHttpServer())
      .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
      .set('Authorization', auth)
      .send(invoiceAmount !== undefined ? { amount: invoiceAmount } : {})
      .expect(201);
    return { tripId, billingId: invoiceRes.body.data.id as string };
  }

  async function generateReceivable(auth: string, billingId: string, dueDate = '2099-01-01') {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/receivables/from-billing/${billingId}`)
      .set('Authorization', auth)
      .send({ dueDate })
      .expect(201);
    return res.body.data.id as string;
  }

  async function setupApprovedExpense(auth: string, amount: number, category = 'MAINTENANCE') {
    const tripId = await setupTrip(auth);
    const res = await request(app.getHttpServer())
      .post('/api/v1/trip-expenses')
      .set('Authorization', auth)
      .send({ tripId, category, description: 'Despesa teste', expenseDate: '2026-09-02T10:00:00.000Z', amount })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/trip-expenses/${res.body.data.id}/status`)
      .set('Authorization', auth)
      .send({ status: 'APPROVED' })
      .expect(200);
    return { tripId, expenseId: res.body.data.id as string };
  }

  async function generatePayable(auth: string, expenseId: string, dueDate = '2099-01-01') {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/payables/from-expense/${expenseId}`)
      .set('Authorization', auth)
      .send({ dueDate })
      .expect(201);
    return res.body.data.id as string;
  }

  // Fase 79 -- POST /receivables|payables/:id/payments agora exige
  // financialAccountId.
  async function createFinancialAccount(auth: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/finance/accounts')
      .set('Authorization', auth)
      .send({ name: `Conta Teste ${randomUUID().slice(0, 8)}`, type: 'BANK', initialBalance: 1000000 })
      .expect(201);
    return res.body.data.id as string;
  }

  function findIssue(issues: { type: string; entityId: string }[], type: string, entityId: string) {
    return issues.find((i) => i.type === type && i.entityId === entityId);
  }

  describe('detectores de Receivable', () => {
    it('RECEIVABLE_BALANCE_INCONSISTENT: receivedAmount divergente da soma real de ReceivablePayment', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('RecBalance');
      const financialAccountId = await createFinancialAccount(adminAuth);
      const customerId = await createCustomer(adminAuth);
      const { billingId } = await setupBilling(adminAuth, customerId, 1000);
      const receivableId = await generateReceivable(adminAuth, billingId);
      await request(app.getHttpServer())
        .post(`/api/v1/receivables/${receivableId}/payments`)
        .set('Authorization', adminAuth)
        .send({ amount: 300, paymentDate: '2026-09-10', paymentMethod: 'PIX', financialAccountId })
        .expect(201);

      // Corrompe o campo materializado diretamente (nunca alcancavel via API) para
      // simular drift real entre o campo e o ledger de pagamentos.
      await prisma.receivable.update({ where: { id: receivableId }, data: { receivedAmount: 999 } });

      const res = await request(app.getHttpServer()).get('/api/v1/finance/reconciliation').set('Authorization', adminAuth).expect(200);
      const issue = findIssue(res.body.data.issues.items, 'RECEIVABLE_BALANCE_INCONSISTENT', receivableId);
      expect(issue).toBeTruthy();
      expect(issue.severity).toBe('CRITICAL');
      expect(issue.expectedAmount).toBe(999);
      expect(issue.actualAmount).toBe(300);
      expect(issue.entityType).toBe('Receivable');
    });

    it('RECEIVABLE_PAYMENT_EXCEEDS_INVOICED: receivedAmount > originalAmount', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('RecExceeds');
      const customerId = await createCustomer(adminAuth);
      const { billingId } = await setupBilling(adminAuth, customerId, 1000);
      const receivableId = await generateReceivable(adminAuth, billingId);
      await prisma.receivable.update({ where: { id: receivableId }, data: { receivedAmount: 1500 } });

      const res = await request(app.getHttpServer()).get('/api/v1/finance/reconciliation').set('Authorization', adminAuth).expect(200);
      const issue = findIssue(res.body.data.issues.items, 'RECEIVABLE_PAYMENT_EXCEEDS_INVOICED', receivableId);
      expect(issue).toBeTruthy();
      expect(issue.severity).toBe('CRITICAL');
    });

    it('RECEIVABLE_WITHOUT_BILLING: titulo ativo cujo faturamento de origem foi cancelado', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('RecCancelledBilling');
      const customerId = await createCustomer(adminAuth);
      const { tripId, billingId } = await setupBilling(adminAuth, customerId, 1000);
      const receivableId = await generateReceivable(adminAuth, billingId);

      await request(app.getHttpServer()).post(`/api/v1/operational-billing/trips/${tripId}/cancel`).set('Authorization', adminAuth).expect(201);

      const res = await request(app.getHttpServer()).get('/api/v1/finance/reconciliation').set('Authorization', adminAuth).expect(200);
      const issue = findIssue(res.body.data.issues.items, 'RECEIVABLE_WITHOUT_BILLING', receivableId);
      expect(issue).toBeTruthy();
      expect(issue.severity).toBe('WARNING');
    });

    it('BILLING_WITHOUT_RECEIVABLE (WARNING) vs TRIP_BILLING_WITHOUT_RECEIVABLE (INFO), conforme status', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('BillingNoReceivable');
      const customerId = await createCustomer(adminAuth);

      const full = await setupBilling(adminAuth, customerId, 1000); // faturamento total -> status INVOICED
      const partial = await setupBilling(adminAuth, customerId, 1000, 400); // parcial -> PARTIALLY_INVOICED

      const res = await request(app.getHttpServer()).get('/api/v1/finance/reconciliation').set('Authorization', adminAuth).expect(200);
      const fullIssue = findIssue(res.body.data.issues.items, 'BILLING_WITHOUT_RECEIVABLE', full.billingId);
      const partialIssue = findIssue(res.body.data.issues.items, 'TRIP_BILLING_WITHOUT_RECEIVABLE', partial.billingId);
      expect(fullIssue).toBeTruthy();
      expect(fullIssue.severity).toBe('WARNING');
      expect(partialIssue).toBeTruthy();
      expect(partialIssue.severity).toBe('INFO');
    });

    it('titulos MANUAIS (Fase Financeiro CP/CR, billingId nulo) nunca disparam falso DUPLICATE_RECEIVABLE nem RECEIVABLE_WITHOUT_BILLING', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('RecManualNoFalsePositive');
      const customerId = await createCustomer(adminAuth);

      // 3 titulos manuais (billingId nulo em todos) -- groupBy nao pode
      // tratar os 3 NULLs como um unico "grupo duplicado".
      for (let i = 0; i < 3; i += 1) {
        await request(app.getHttpServer())
          .post('/api/v1/receivables')
          .set('Authorization', adminAuth)
          .send({ customerId, description: `Manual ${i}`, originalAmount: 100, issueDate: '2026-09-01', dueDate: '2026-09-10' })
          .expect(201);
      }

      const res = await request(app.getHttpServer()).get('/api/v1/finance/reconciliation').set('Authorization', adminAuth).expect(200);
      const duplicateIssues = res.body.data.issues.items.filter((i: { type: string }) => i.type === 'DUPLICATE_RECEIVABLE');
      const withoutBillingIssues = res.body.data.issues.items.filter((i: { type: string }) => i.type === 'RECEIVABLE_WITHOUT_BILLING');
      expect(duplicateIssues).toHaveLength(0);
      expect(withoutBillingIssues).toHaveLength(0);
    });
  });

  describe('detectores de Payable', () => {
    it('titulos MANUAIS (Fase Financeiro CP/CR, expenseId nulo) nunca disparam falso DUPLICATE_PAYABLE nem PAYABLE_WITHOUT_APPROVED_EXPENSE', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PayManualNoFalsePositive');

      for (let i = 0; i < 3; i += 1) {
        await request(app.getHttpServer())
          .post('/api/v1/payables')
          .set('Authorization', adminAuth)
          .send({ category: 'OTHER', description: `Manual ${i}`, originalAmount: 100, issueDate: '2026-09-01', dueDate: '2026-09-10' })
          .expect(201);
      }

      const res = await request(app.getHttpServer()).get('/api/v1/finance/reconciliation').set('Authorization', adminAuth).expect(200);
      const duplicateIssues = res.body.data.issues.items.filter((i: { type: string }) => i.type === 'DUPLICATE_PAYABLE');
      const withoutExpenseIssues = res.body.data.issues.items.filter((i: { type: string }) => i.type === 'PAYABLE_WITHOUT_APPROVED_EXPENSE');
      expect(duplicateIssues).toHaveLength(0);
      expect(withoutExpenseIssues).toHaveLength(0);
    });

    it('PAYABLE_WITHOUT_APPROVED_EXPENSE: despesa cancelada apos gerar o titulo', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PayNoApprovedExpense');
      const { expenseId } = await setupApprovedExpense(adminAuth, 800);
      const payableId = await generatePayable(adminAuth, expenseId);

      await request(app.getHttpServer()).patch(`/api/v1/trip-expenses/${expenseId}/status`).set('Authorization', adminAuth).send({ status: 'CANCELLED' }).expect(200);

      const res = await request(app.getHttpServer()).get('/api/v1/finance/reconciliation').set('Authorization', adminAuth).expect(200);
      const issue = findIssue(res.body.data.issues.items, 'PAYABLE_WITHOUT_APPROVED_EXPENSE', payableId);
      expect(issue).toBeTruthy();
      expect(issue.severity).toBe('WARNING');
    });

    it('PAYABLE_BALANCE_INCONSISTENT e PAYABLE_PAYMENT_EXCEEDS_EXPENSE', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PayBalance');
      const financialAccountId = await createFinancialAccount(adminAuth);
      const { expenseId } = await setupApprovedExpense(adminAuth, 1000);
      const payableId = await generatePayable(adminAuth, expenseId);
      await request(app.getHttpServer())
        .post(`/api/v1/payables/${payableId}/payments`)
        .set('Authorization', adminAuth)
        .send({ amount: 200, paymentDate: '2026-09-10', paymentMethod: 'PIX', financialAccountId })
        .expect(201);
      await prisma.payable.update({ where: { id: payableId }, data: { paidAmount: 1500 } });

      const res = await request(app.getHttpServer()).get('/api/v1/finance/reconciliation').set('Authorization', adminAuth).expect(200);
      const balanceIssue = findIssue(res.body.data.issues.items, 'PAYABLE_BALANCE_INCONSISTENT', payableId);
      const exceedsIssue = findIssue(res.body.data.issues.items, 'PAYABLE_PAYMENT_EXCEEDS_EXPENSE', payableId);
      expect(balanceIssue).toBeTruthy();
      expect(balanceIssue.expectedAmount).toBe(1500);
      expect(balanceIssue.actualAmount).toBe(200);
      expect(exceedsIssue).toBeTruthy();
    });

    it('TRIP_EXPENSE_WITHOUT_PAYABLE: despesa aprovada sem titulo gerado', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ExpenseNoPayable');
      const { expenseId } = await setupApprovedExpense(adminAuth, 500, 'FUEL');

      const res = await request(app.getHttpServer()).get('/api/v1/finance/reconciliation').set('Authorization', adminAuth).expect(200);
      const issue = findIssue(res.body.data.issues.items, 'TRIP_EXPENSE_WITHOUT_PAYABLE', expenseId);
      expect(issue).toBeTruthy();
      expect(issue.severity).toBe('WARNING');
      expect(issue.entityType).toBe('TripExpense');
    });
  });

  describe('KPIs e agrupamentos', () => {
    it('summary/byType/bySeverity refletem corretamente as inconsistencias detectadas', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Kpis');
      const { expenseId: e1 } = await setupApprovedExpense(adminAuth, 500);
      await generatePayable(adminAuth, e1); // ok, sem problema
      const { expenseId: e2 } = await setupApprovedExpense(adminAuth, 300); // TRIP_EXPENSE_WITHOUT_PAYABLE (WARNING)
      expect(e2).toBeTruthy();

      const res = await request(app.getHttpServer()).get('/api/v1/finance/reconciliation').set('Authorization', adminAuth).expect(200);
      const { summary, byType, bySeverity } = res.body.data;

      expect(summary.totalIssues).toBeGreaterThanOrEqual(1);
      expect(summary.warningCount + summary.criticalCount + summary.infoCount).toBe(summary.totalIssues);
      expect(summary.totalExpenseIssues).toBeGreaterThanOrEqual(1);

      const expenseType = byType.find((t: { type: string }) => t.type === 'TRIP_EXPENSE_WITHOUT_PAYABLE');
      expect(expenseType).toBeTruthy();
      expect(expenseType.count).toBeGreaterThanOrEqual(1);

      const warningSeverity = bySeverity.find((s: { severity: string }) => s.severity === 'WARNING');
      expect(warningSeverity.count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('filtros', () => {
    it('tripId/type/severity restringem corretamente os resultados', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Filters');
      const { tripId, expenseId } = await setupApprovedExpense(adminAuth, 400);

      const byTrip = await request(app.getHttpServer())
        .get(`/api/v1/finance/reconciliation?tripId=${tripId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byTrip.body.data.issues.items.every((i: { tripId: string }) => i.tripId === tripId)).toBe(true);
      expect(findIssue(byTrip.body.data.issues.items, 'TRIP_EXPENSE_WITHOUT_PAYABLE', expenseId)).toBeTruthy();

      const byType = await request(app.getHttpServer())
        .get('/api/v1/finance/reconciliation?type=TRIP_EXPENSE_WITHOUT_PAYABLE')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byType.body.data.issues.items.every((i: { type: string }) => i.type === 'TRIP_EXPENSE_WITHOUT_PAYABLE')).toBe(true);

      const bySeverity = await request(app.getHttpServer())
        .get('/api/v1/finance/reconciliation?severity=CRITICAL')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(bySeverity.body.data.issues.items.every((i: { severity: string }) => i.severity === 'CRITICAL')).toBe(true);
      // Nao ha nenhuma inconsistencia CRITICAL neste tenant (so a despesa sem payable, WARNING).
      expect(bySeverity.body.data.summary.criticalCount).toBe(0);
    });
  });

  describe('isolamento multi-tenant', () => {
    it('tenant B nunca ve inconsistencias do tenant A', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolA');
      const tenantB = await createTenantAndLoginAsAdmin('IsolB');
      await setupApprovedExpense(tenantA.adminAuth, 500); // gera TRIP_EXPENSE_WITHOUT_PAYABLE no tenant A

      const resB = await request(app.getHttpServer()).get('/api/v1/finance/reconciliation').set('Authorization', tenantB.adminAuth).expect(200);
      expect(resB.body.data.summary.totalIssues).toBe(0);
      expect(resB.body.data.issues.items).toHaveLength(0);
    });
  });

  describe('RBAC', () => {
    it('DRIVER nunca acessa a conciliacao financeira', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Rbac');
      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      await request(app.getHttpServer()).get('/api/v1/finance/reconciliation').set('Authorization', driverAuth).expect(403);

      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');
      await request(app.getHttpServer()).get('/api/v1/finance/reconciliation').set('Authorization', auditorAuth).expect(200);
    });
  });

  describe('performance', () => {
    it(
      'N+1: numero de queries nao cresce com a quantidade de despesas/titulos',
      async () => {
        const { adminAuth } = await createTenantAndLoginAsAdmin('NPlus1');

        async function createExpensesWithoutPayable(count: number) {
          for (let i = 0; i < count; i += 1) {
            await setupApprovedExpense(adminAuth, 100 + i);
          }
        }

        await createExpensesWithoutPayable(2);

        const expenseSpy = jest.spyOn(prisma.tripExpense, 'findMany');
        const receivableSpy = jest.spyOn(prisma.receivable, 'findMany');
        const payableSpy = jest.spyOn(prisma.payable, 'findMany');
        const billingSpy = jest.spyOn(prisma.tripBilling, 'findMany');

        await request(app.getHttpServer()).get('/api/v1/finance/reconciliation').set('Authorization', adminAuth).expect(200);
        const callsWithFew = {
          expense: expenseSpy.mock.calls.length,
          receivable: receivableSpy.mock.calls.length,
          payable: payableSpy.mock.calls.length,
          billing: billingSpy.mock.calls.length,
        };
        expenseSpy.mockClear();
        receivableSpy.mockClear();
        payableSpy.mockClear();
        billingSpy.mockClear();

        await createExpensesWithoutPayable(6); // total 8

        await request(app.getHttpServer()).get('/api/v1/finance/reconciliation').set('Authorization', adminAuth).expect(200);
        const callsWithMany = {
          expense: expenseSpy.mock.calls.length,
          receivable: receivableSpy.mock.calls.length,
          payable: payableSpy.mock.calls.length,
          billing: billingSpy.mock.calls.length,
        };
        expenseSpy.mockRestore();
        receivableSpy.mockRestore();
        payableSpy.mockRestore();
        billingSpy.mockRestore();

        expect(callsWithFew).toEqual(callsWithMany);
        expect(callsWithFew.expense).toBeGreaterThan(0);
      },
      90000,
    );
  });
});
