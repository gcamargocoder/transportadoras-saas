import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 79 -- Integracao de Recebimentos e Pagamentos com Contas Financeiras.
// Conecta ReceivablePayment/PayablePayment (Fases 72/73) a FinancialAccount/
// FinancialTransaction (Fase 78). Testes DIRECIONADOS (secao 22 do pedido):
// CREDIT/DEBIT gerados, saldo refletido, conta inativa/outro tenant
// bloqueia, periodo CLOSED bloqueia, atomicidade, unicidade (constraint no
// banco), cancelamento preserva historico, RBAC, N+1, auditoria,
// concorrencia.
describe('Integracao Recebimentos/Pagamentos x Contas Financeiras (Fase 79, e2e)', () => {
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
      slug: `finpayint-${label.toLowerCase()}-${unique}`,
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

  async function createFinancialAccount(auth: string, initialBalance = 1000000) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/finance/accounts')
      .set('Authorization', auth)
      .send({ name: `Conta ${randomUUID().slice(0, 8)}`, type: 'BANK', initialBalance })
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
        plannedDeparture: '2026-01-01T08:00:00.000Z',
        plannedArrival: '2026-01-02T18:00:00.000Z',
      })
      .expect(201);
    return res.body.data.id as string;
  }

  // ---- Payable (mais simples -- usado na maioria dos cenarios) ----
  async function createApprovedExpense(auth: string, tripId: string, amount: number, expenseDate = '2026-09-02T10:00:00.000Z') {
    const res = await request(app.getHttpServer())
      .post('/api/v1/trip-expenses')
      .set('Authorization', auth)
      .send({ tripId, category: 'MAINTENANCE', description: 'Manutencao preventiva', expenseDate, amount, supplier: 'Oficina do Zé' })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/trip-expenses/${res.body.data.id}/status`)
      .set('Authorization', auth)
      .send({ status: 'APPROVED' })
      .expect(200);
    return res.body.data.id as string;
  }

  async function setupPayable(auth: string, amount: number, dueDate = '2099-01-01') {
    const tripId = await setupTrip(auth);
    const expenseId = await createApprovedExpense(auth, tripId, amount);
    const res = await request(app.getHttpServer())
      .post(`/api/v1/payables/from-expense/${expenseId}`)
      .set('Authorization', auth)
      .send({ dueDate })
      .expect(201);
    return res.body.data.id as string;
  }

  function payPayable(auth: string, payableId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer()).post(`/api/v1/payables/${payableId}/payments`).set('Authorization', auth).send(body);
  }

  // ---- Receivable (setup completo -- usado so onde o lado CREDIT importa) ----
  async function setupReceivable(auth: string, amount: number, dueDate = '2099-01-01') {
    const customerRes = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', auth)
      .send({ name: 'Cliente Teste' })
      .expect(201);
    const customerId = customerRes.body.data.id as string;

    const tableRes = await request(app.getHttpServer())
      .post('/api/v1/freight/tables')
      .set('Authorization', auth)
      .send({ customerId, name: `Tabela ${randomUUID().slice(0, 8)}`, code: `TAB-${randomUUID().slice(0, 8)}`, effectiveFrom: '2026-01-01T00:00:00.000Z' })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/freight/tables/${tableRes.body.data.id}`)
      .set('Authorization', auth)
      .send({ status: 'ACTIVE' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/freight/rules')
      .set('Authorization', auth)
      .send({ freightTableId: tableRes.body.data.id, baseAmount: amount })
      .expect(201);

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

  function payReceivable(auth: string, receivableId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer()).post(`/api/v1/receivables/${receivableId}/payments`).set('Authorization', auth).send(body);
  }

  function openPeriod(auth: string, year: number, month: number) {
    return request(app.getHttpServer()).post('/api/v1/finance/periods').set('Authorization', auth).send({ year, month });
  }

  function closePeriod(auth: string, id: string) {
    return request(app.getHttpServer()).post(`/api/v1/finance/periods/${id}/close`).set('Authorization', auth).send({});
  }

  describe('CREDIT/DEBIT e saldo', () => {
    it('recebimento gera FinancialTransaction CREDIT e aumenta o saldo da conta', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Credit');
      const financialAccountId = await createFinancialAccount(adminAuth, 1000);
      const receivableId = await setupReceivable(adminAuth, 500);

      const res = await payReceivable(adminAuth, receivableId, {
        amount: 500,
        paymentDate: '2026-09-10',
        paymentMethod: 'PIX',
        financialAccountId,
      }).expect(201);
      const paymentId = res.body.data.payments[0].id as string;
      const transactionId = res.body.data.payments[0].financialTransactionId as string;
      expect(transactionId).toBeTruthy();

      const tx = await prisma.financialTransaction.findUniqueOrThrow({ where: { id: transactionId } });
      expect(tx.type).toBe('CREDIT');
      expect(tx.amount.toNumber()).toBe(500);
      expect(tx.accountId).toBe(financialAccountId);
      expect(tx.referenceType).toBe('ReceivablePayment');
      expect(tx.referenceId).toBe(paymentId);

      const account = await request(app.getHttpServer())
        .get(`/api/v1/finance/accounts/${financialAccountId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(account.body.data.currentBalance).toBe(1500); // 1000 + 500
    });

    it('pagamento gera FinancialTransaction DEBIT e diminui o saldo da conta', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Debit');
      const financialAccountId = await createFinancialAccount(adminAuth, 1000);
      const payableId = await setupPayable(adminAuth, 300);

      const res = await payPayable(adminAuth, payableId, { amount: 300, paymentDate: '2026-09-10', paymentMethod: 'PIX', financialAccountId }).expect(
        201,
      );
      const transactionId = res.body.data.payments[0].financialTransactionId as string;
      const tx = await prisma.financialTransaction.findUniqueOrThrow({ where: { id: transactionId } });
      expect(tx.type).toBe('DEBIT');
      expect(tx.amount.toNumber()).toBe(300);

      const account = await request(app.getHttpServer())
        .get(`/api/v1/finance/accounts/${financialAccountId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(account.body.data.currentBalance).toBe(700); // 1000 - 300
    });
  });

  describe('conta inativa / outro tenant -- bloqueia e nao cria nada (rollback)', () => {
    it('conta inativa bloqueia recebimento e pagamento, sem criar payment nem transaction', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Inactive');
      const financialAccountId = await createFinancialAccount(adminAuth);
      await request(app.getHttpServer())
        .post(`/api/v1/finance/accounts/${financialAccountId}/deactivate`)
        .set('Authorization', adminAuth)
        .expect(201);

      const receivableId = await setupReceivable(adminAuth, 500);
      await payReceivable(adminAuth, receivableId, { amount: 500, paymentDate: '2026-09-10', paymentMethod: 'PIX', financialAccountId }).expect(
        409,
      );
      const receivablePayments = await prisma.receivablePayment.count({ where: { receivableId } });
      expect(receivablePayments).toBe(0);

      const payableId = await setupPayable(adminAuth, 300);
      await payPayable(adminAuth, payableId, { amount: 300, paymentDate: '2026-09-10', paymentMethod: 'PIX', financialAccountId }).expect(409);
      const payablePayments = await prisma.payablePayment.count({ where: { payableId } });
      expect(payablePayments).toBe(0);
    });

    it('conta de outro tenant e rejeitada (404), mesmo com role financeiro valido', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolPayA');
      const tenantB = await createTenantAndLoginAsAdmin('IsolPayB');
      const financialAccountIdB = await createFinancialAccount(tenantB.adminAuth);

      const payableId = await setupPayable(tenantA.adminAuth, 300);
      await payPayable(tenantA.adminAuth, payableId, {
        amount: 300,
        paymentDate: '2026-09-10',
        paymentMethod: 'PIX',
        financialAccountId: financialAccountIdB,
      }).expect(404);
      const payments = await prisma.payablePayment.count({ where: { payableId } });
      expect(payments).toBe(0);
    });
  });

  describe('periodo financeiro fechado', () => {
    it('bloqueia recebimento e pagamento com paymentDate em periodo CLOSED', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PeriodGuard');
      const financialAccountId = await createFinancialAccount(adminAuth);
      const period = await openPeriod(adminAuth, 2025, 5).expect(201);
      await closePeriod(adminAuth, period.body.data.id).expect(201);

      const receivableId = await setupReceivable(adminAuth, 500);
      await payReceivable(adminAuth, receivableId, {
        amount: 500,
        paymentDate: '2025-05-10',
        paymentMethod: 'PIX',
        financialAccountId,
      }).expect(409);

      const payableId = await setupPayable(adminAuth, 300);
      await payPayable(adminAuth, payableId, { amount: 300, paymentDate: '2025-05-10', paymentMethod: 'PIX', financialAccountId }).expect(409);
    });
  });

  describe('atomicidade e unicidade', () => {
    it('payment e transaction sao criados juntos (nunca um sem o outro) e o vinculo e unico (constraint no banco)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Atomic');
      const financialAccountId = await createFinancialAccount(adminAuth);
      const payableId = await setupPayable(adminAuth, 300);

      const res = await payPayable(adminAuth, payableId, { amount: 300, paymentDate: '2026-09-10', paymentMethod: 'PIX', financialAccountId }).expect(
        201,
      );
      const paymentId = res.body.data.payments[0].id as string;
      const transactionId = res.body.data.payments[0].financialTransactionId as string;

      const paymentCount = await prisma.payablePayment.count({ where: { payableId } });
      const transactionCount = await prisma.financialTransaction.count({ where: { accountId: financialAccountId } });
      expect(paymentCount).toBe(1);
      expect(transactionCount).toBe(1);

      const payment = await prisma.payablePayment.findUniqueOrThrow({ where: { id: paymentId } });
      expect(payment.financialTransactionId).toBe(transactionId);

      // Unicidade reforcada no banco: nenhum outro payment pode reutilizar a
      // mesma FinancialTransaction (constraint @unique da Fase 79).
      const anotherPayableId = await setupPayable(adminAuth, 50);
      await expect(
        prisma.payablePayment.create({
          data: {
            tenantId: payment.tenantId,
            payableId: anotherPayableId,
            amount: 50,
            paymentDate: new Date('2026-09-11'),
            paymentMethod: 'PIX',
            financialTransactionId: transactionId,
            createdBy: payment.createdBy,
          },
        }),
      ).rejects.toThrow();
    });

    it('rollback: amount acima do saldo nao cria payment nem transaction', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('RollbackBalance');
      const financialAccountId = await createFinancialAccount(adminAuth);
      const payableId = await setupPayable(adminAuth, 100);

      await payPayable(adminAuth, payableId, { amount: 200, paymentDate: '2026-09-10', paymentMethod: 'PIX', financialAccountId }).expect(400);

      const paymentCount = await prisma.payablePayment.count({ where: { payableId } });
      const transactionCount = await prisma.financialTransaction.count({ where: { accountId: financialAccountId } });
      expect(paymentCount).toBe(0);
      expect(transactionCount).toBe(0);
    });
  });

  describe('cancelamento', () => {
    it('cancelar o titulo preserva o payment e a FinancialTransaction (nunca apaga)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CancelPreserve');
      const financialAccountId = await createFinancialAccount(adminAuth, 0);
      const payableId = await setupPayable(adminAuth, 300);
      const res = await payPayable(adminAuth, payableId, { amount: 200, paymentDate: '2026-09-05', paymentMethod: 'PIX', financialAccountId }).expect(
        201,
      );
      const transactionId = res.body.data.payments[0].financialTransactionId as string;

      await request(app.getHttpServer()).post(`/api/v1/payables/${payableId}/cancel`).set('Authorization', adminAuth).expect(201);

      const payment = await prisma.payablePayment.findFirstOrThrow({ where: { payableId } });
      expect(payment.amount.toNumber()).toBe(200);
      const tx = await prisma.financialTransaction.findUniqueOrThrow({ where: { id: transactionId } });
      expect(tx.amount.toNumber()).toBe(200);

      const account = await request(app.getHttpServer())
        .get(`/api/v1/finance/accounts/${financialAccountId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(account.body.data.currentBalance).toBe(-200); // debito preservado, saldo nao revertido
    });
  });

  describe('RBAC', () => {
    it('AUDITOR nao registra pagamento mesmo com financialAccountId valido', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Rbac');
      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');
      const financialAccountId = await createFinancialAccount(adminAuth);
      const payableId = await setupPayable(adminAuth, 100);

      await payPayable(auditorAuth, payableId, { amount: 100, paymentDate: '2026-09-05', paymentMethod: 'PIX', financialAccountId }).expect(403);
    });
  });

  describe('performance', () => {
    it('detalhe do titulo com pagamentos inclui financialAccount SEM query adicional (1 findFirst)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('NPlus1');
      const financialAccountId = await createFinancialAccount(adminAuth);
      const payableId = await setupPayable(adminAuth, 300);
      await payPayable(adminAuth, payableId, { amount: 100, paymentDate: '2026-09-05', paymentMethod: 'PIX', financialAccountId }).expect(201);
      await payPayable(adminAuth, payableId, { amount: 100, paymentDate: '2026-09-06', paymentMethod: 'PIX', financialAccountId }).expect(201);

      const findFirstSpy = jest.spyOn(prisma.payable, 'findFirst');
      const detail = await request(app.getHttpServer()).get(`/api/v1/payables/${payableId}`).set('Authorization', adminAuth).expect(200);
      expect(findFirstSpy).toHaveBeenCalledTimes(1); // 1 unica query com o join embutido, nunca 1 por pagamento
      expect(detail.body.data.payments).toHaveLength(2);
      for (const payment of detail.body.data.payments) {
        expect(payment.financialAccountName).toBeTruthy();
      }
      findFirstSpy.mockRestore();
    });
  });

  describe('auditoria', () => {
    it('financial_account_id e financial_transaction_id aparecem na metadata do payable.payment_created', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Audit');
      const financialAccountId = await createFinancialAccount(adminAuth);
      const payableId = await setupPayable(adminAuth, 300);
      const res = await payPayable(adminAuth, payableId, { amount: 300, paymentDate: '2026-09-10', paymentMethod: 'PIX', financialAccountId }).expect(
        201,
      );
      const transactionId = res.body.data.payments[0].financialTransactionId as string;

      const log = await prisma.auditLog.findFirstOrThrow({ where: { tenantId, action: 'payable.payment_created' } });
      const newValue = log.newValue as Record<string, unknown>;
      expect(newValue.financialAccountId).toBe(financialAccountId);
      expect(newValue.financialTransactionId).toBe(transactionId);
    });
  });

  describe('concorrencia', () => {
    it('dois pagamentos simultaneos nunca ultrapassam o saldo em aberto juntos', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Concurrency');
      const financialAccountId = await createFinancialAccount(adminAuth);
      const payableId = await setupPayable(adminAuth, 100);

      const [first, second] = await Promise.all([
        payPayable(adminAuth, payableId, { amount: 100, paymentDate: '2026-09-10', paymentMethod: 'PIX', financialAccountId }),
        payPayable(adminAuth, payableId, { amount: 100, paymentDate: '2026-09-10', paymentMethod: 'PIX', financialAccountId }),
      ]);
      const statuses = [first.status, second.status];
      const successCount = statuses.filter((s) => s === 201).length;
      expect(successCount).toBe(1); // exatamente uma das duas ganha (a outra: 409 CAS ou 400 saldo insuficiente)

      const payable = await prisma.payable.findUniqueOrThrow({ where: { id: payableId } });
      expect(payable.paidAmount.toNumber()).toBeLessThanOrEqual(100); // nunca ultrapassa originalAmount
      const transactionCount = await prisma.financialTransaction.count({ where: { accountId: financialAccountId } });
      expect(transactionCount).toBe(1); // exatamente 1 FinancialTransaction, nunca 2
    });
  });
});
