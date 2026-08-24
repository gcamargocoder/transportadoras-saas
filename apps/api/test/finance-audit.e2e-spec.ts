import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 77 -- rastreabilidade financeira sobre o MESMO AuditLog/AuditService
// ja existentes (Fases 1/72/73/76). Testes DIRECIONADOS (secao 17 do
// pedido): eventos gerados por cada mutacao, GET /finance/audit (filtros/
// paginacao), isolamento multi-tenant, RBAC, AuditLog append-only, e
// ausencia de auditoria "fantasma" quando a mutacao falha.
describe('Auditoria Financeira (Fase 77, e2e)', () => {
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
      slug: `finaudit-${label.toLowerCase()}-${unique}`,
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

  async function setupTrip(auth: string) {
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
        originLocationId: originId,
        destinationLocationId: destinationId,
        plannedDeparture: '2026-01-01T08:00:00.000Z',
        plannedArrival: '2026-01-02T18:00:00.000Z',
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createApprovedExpense(auth: string, tripId: string, amount: number) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/trip-expenses')
      .set('Authorization', auth)
      .send({
        tripId,
        category: 'MAINTENANCE',
        description: 'Manutencao preventiva',
        expenseDate: '2026-09-02T10:00:00.000Z',
        amount,
        supplier: 'Oficina do Zé',
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/trip-expenses/${res.body.data.id}/status`)
      .set('Authorization', auth)
      .send({ status: 'APPROVED' })
      .expect(200);
    return res.body.data.id as string;
  }

  function generatePayable(auth: string, expenseId: string, dueDate = '2099-01-01') {
    return request(app.getHttpServer())
      .post(`/api/v1/payables/from-expense/${expenseId}`)
      .set('Authorization', auth)
      .send({ dueDate });
  }

  // Fase 79 -- todo POST /payables|receivables/:id/payments agora exige
  // financialAccountId.
  async function createFinancialAccount(auth: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/finance/accounts')
      .set('Authorization', auth)
      .send({ name: `Conta Teste ${randomUUID().slice(0, 8)}`, type: 'BANK', initialBalance: 1000000 })
      .expect(201);
    return res.body.data.id as string;
  }

  function getFinanceAudit(auth: string, qs = '') {
    return request(app.getHttpServer()).get(`/api/v1/finance/audit${qs}`).set('Authorization', auth);
  }

  describe('eventos -- Payable', () => {
    it('criacao/pagamento/cancelamento de Payable geram payable.created/payment_created/cancelled com metadata objetiva', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('PayableEvents');
      const financialAccountId = await createFinancialAccount(adminAuth);
      const tripId = await setupTrip(adminAuth);
      const expenseId = await createApprovedExpense(adminAuth, tripId, 500);

      const payable = await generatePayable(adminAuth, expenseId).expect(201);
      const payableId = payable.body.data.id as string;

      await request(app.getHttpServer())
        .post(`/api/v1/payables/${payableId}/payments`)
        .set('Authorization', adminAuth)
        .send({ amount: 500, paymentDate: '2026-09-10', paymentMethod: 'PIX', financialAccountId })
        .expect(201);

      await request(app.getHttpServer()).post(`/api/v1/payables/${payableId}/cancel`).set('Authorization', adminAuth).expect(201);

      const logs = await prisma.auditLog.findMany({
        where: { tenantId, entityName: { in: ['Payable', 'PayablePayment'] } },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs.map((l) => l.action)).toEqual(['payable.created', 'payable.payment_created', 'payable.cancelled']);

      const paymentLog = logs.find((l) => l.action === 'payable.payment_created')!;
      const newValue = paymentLog.newValue as Record<string, unknown>;
      expect(newValue.amount).toBe(500);
      expect(newValue.paymentDate).toBeTruthy();
      expect(newValue.paymentMethod).toBe('PIX');
      expect(newValue.payableId).toBe(payableId);
    });

    it('pagamento rejeitado (saldo insuficiente) nao deixa auditoria fantasma', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('PayableRollback');
      const financialAccountId = await createFinancialAccount(adminAuth);
      const tripId = await setupTrip(adminAuth);
      const expenseId = await createApprovedExpense(adminAuth, tripId, 100);
      const payable = await generatePayable(adminAuth, expenseId).expect(201);
      const payableId = payable.body.data.id as string;

      const before = await prisma.auditLog.count({ where: { tenantId, entityName: 'PayablePayment' } });
      await request(app.getHttpServer())
        .post(`/api/v1/payables/${payableId}/payments`)
        .set('Authorization', adminAuth)
        .send({ amount: 999, paymentDate: '2026-09-10', paymentMethod: 'PIX', financialAccountId })
        .expect(400);
      const after = await prisma.auditLog.count({ where: { tenantId, entityName: 'PayablePayment' } });
      expect(after).toBe(before);
    });
  });

  describe('eventos -- Receivable', () => {
    it('criacao/pagamento/cancelamento de Receivable geram receivable.created/payment_created/cancelled', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('ReceivableEvents');
      const financialAccountId = await createFinancialAccount(adminAuth);
      const customerRes = await request(app.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', adminAuth)
        .send({ name: 'Cliente Teste' })
        .expect(201);
      const customerId = customerRes.body.data.id as string;

      const tableRes = await request(app.getHttpServer())
        .post('/api/v1/freight/tables')
        .set('Authorization', adminAuth)
        .send({ customerId, name: `Tabela ${randomUUID().slice(0, 8)}`, code: `TAB-${randomUUID().slice(0, 8)}`, effectiveFrom: '2026-01-01T00:00:00.000Z' })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/freight/tables/${tableRes.body.data.id}`)
        .set('Authorization', adminAuth)
        .send({ status: 'ACTIVE' })
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/v1/freight/rules')
        .set('Authorization', adminAuth)
        .send({ freightTableId: tableRes.body.data.id, baseAmount: 1000 })
        .expect(201);

      const tripId = await setupTrip(adminAuth);
      await request(app.getHttpServer())
        .post(`/api/v1/freight/trips/${tripId}/apply`)
        .set('Authorization', adminAuth)
        .send({ customerId })
        .expect(201);
      const invoiceRes = await request(app.getHttpServer())
        .post(`/api/v1/operational-billing/trips/${tripId}/invoice`)
        .set('Authorization', adminAuth)
        .send({})
        .expect(201);
      const billingId = invoiceRes.body.data.id as string;

      const receivable = await request(app.getHttpServer())
        .post(`/api/v1/receivables/from-billing/${billingId}`)
        .set('Authorization', adminAuth)
        .send({ dueDate: '2099-01-01' })
        .expect(201);
      const receivableId = receivable.body.data.id as string;

      await request(app.getHttpServer())
        .post(`/api/v1/receivables/${receivableId}/payments`)
        .set('Authorization', adminAuth)
        .send({ amount: 1000, paymentDate: '2026-09-10', paymentMethod: 'PIX', financialAccountId })
        .expect(201);
      await request(app.getHttpServer()).post(`/api/v1/receivables/${receivableId}/cancel`).set('Authorization', adminAuth).expect(201);

      const logs = await prisma.auditLog.findMany({
        where: { tenantId, entityName: { in: ['Receivable', 'ReceivablePayment'] } },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs.map((l) => l.action)).toEqual(['receivable.created', 'receivable.payment_created', 'receivable.cancelled']);
    });
  });

  describe('eventos -- FinancialPeriod', () => {
    it('abertura e fechamento geram financial_period.created/closed, closed com year/month/criticalReconciliationIssues', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('PeriodEvents');
      const created = await request(app.getHttpServer())
        .post('/api/v1/finance/periods')
        .set('Authorization', adminAuth)
        .send({ year: 2025, month: 6 })
        .expect(201);
      const id = created.body.data.id as string;
      await request(app.getHttpServer()).post(`/api/v1/finance/periods/${id}/close`).set('Authorization', adminAuth).send({}).expect(201);

      const logs = await prisma.auditLog.findMany({
        where: { tenantId, entityName: 'FinancialPeriod', entityId: id },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs.map((l) => l.action)).toEqual(['financial_period.created', 'financial_period.closed']);
      const closedValue = logs[1]!.newValue as Record<string, unknown>;
      expect(closedValue.year).toBe(2025);
      expect(closedValue.month).toBe(6);
      expect(closedValue.criticalReconciliationIssues).toBe(0);

      // GET /finance/periods/:id expoe o mesmo historico (vinculo seguro,
      // Fase 77 secao 5).
      const detail = await request(app.getHttpServer())
        .get(`/api/v1/finance/periods/${id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(detail.body.data.auditHistory.map((l: { action: string }) => l.action)).toEqual([
        'financial_period.closed',
        'financial_period.created',
      ]);
    });
  });

  describe('GET /finance/audit -- filtros e paginacao', () => {
    it('filtra por entityName/action/from-to e pagina no banco', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('AuditFilters');
      for (let i = 0; i < 3; i += 1) {
        await request(app.getHttpServer())
          .post('/api/v1/finance/periods')
          .set('Authorization', adminAuth)
          .send({ year: 2024, month: i + 1 })
          .expect(201);
      }

      const all = await getFinanceAudit(adminAuth, '?pageSize=2&page=1').expect(200);
      expect(all.body.data.items).toHaveLength(2);
      expect(all.body.data.meta.total).toBe(3);
      expect(all.body.data.meta.totalPages).toBe(2);

      const page2 = await getFinanceAudit(adminAuth, '?pageSize=2&page=2').expect(200);
      expect(page2.body.data.items).toHaveLength(1);

      const filtered = await getFinanceAudit(adminAuth, '?entityName=FinancialPeriod&action=financial_period.created').expect(200);
      expect(filtered.body.data.meta.total).toBe(3);
      expect(filtered.body.data.items.every((i: { action: string }) => i.action === 'financial_period.created')).toBe(true);

      const farFuture = await getFinanceAudit(adminAuth, '?from=2099-01-01').expect(200);
      expect(farFuture.body.data.items).toHaveLength(0);

      // Ordenado createdAt DESC.
      const createdAts = all.body.data.items.map((i: { createdAt: string }) => new Date(i.createdAt).getTime());
      expect(createdAts[0]).toBeGreaterThanOrEqual(createdAts[1]);
    });

    it('rejeita entityName fora do escopo financeiro', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('AuditScope');
      await getFinanceAudit(adminAuth, '?entityName=Vehicle').expect(400);
    });
  });

  describe('isolamento multi-tenant', () => {
    it('tenant B nunca ve eventos do tenant A, mesmo usando o entityId real', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolA');
      const tenantB = await createTenantAndLoginAsAdmin('IsolB');

      const periodA = await request(app.getHttpServer())
        .post('/api/v1/finance/periods')
        .set('Authorization', tenantA.adminAuth)
        .send({ year: 2023, month: 1 })
        .expect(201);
      const periodAId = periodA.body.data.id as string;

      const listB = await getFinanceAudit(tenantB.adminAuth, '').expect(200);
      expect(listB.body.data.items).toHaveLength(0);

      const byEntityId = await getFinanceAudit(tenantB.adminAuth, `?entityId=${periodAId}`).expect(200);
      expect(byEntityId.body.data.items).toHaveLength(0);

      // Tambem nao consegue o detalhe do periodo de A via /finance/periods/:id.
      await request(app.getHttpServer())
        .get(`/api/v1/finance/periods/${periodAId}`)
        .set('Authorization', tenantB.adminAuth)
        .expect(404);
    });
  });

  describe('RBAC', () => {
    it('AUDITOR consulta; DRIVER nunca acessa', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Rbac');
      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');
      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');

      await request(app.getHttpServer())
        .post('/api/v1/finance/periods')
        .set('Authorization', adminAuth)
        .send({ year: 2022, month: 1 })
        .expect(201);

      await getFinanceAudit(auditorAuth, '').expect(200);
      await getFinanceAudit(driverAuth, '').expect(403);
    });
  });

  describe('AuditLog append-only', () => {
    it('nao existe rota de alteracao/exclusao para o audit financeiro', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('AppendOnly');
      const list = await getFinanceAudit(adminAuth, '').expect(200);
      const anyId = list.body.data.items[0]?.id ?? randomUUID();

      await request(app.getHttpServer()).patch(`/api/v1/finance/audit/${anyId}`).set('Authorization', adminAuth).send({}).expect(404);
      await request(app.getHttpServer()).delete(`/api/v1/finance/audit/${anyId}`).set('Authorization', adminAuth).expect(404);
    });
  });

  describe('performance', () => {
    it('GET /finance/audit executa 1 findMany e 1 count, independente da quantidade de eventos', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('NPlus1');
      for (let i = 0; i < 5; i += 1) {
        await request(app.getHttpServer())
          .post('/api/v1/finance/periods')
          .set('Authorization', adminAuth)
          .send({ year: 2021, month: i + 1 })
          .expect(201);
      }

      const findManySpy = jest.spyOn(prisma.auditLog, 'findMany');
      const countSpy = jest.spyOn(prisma.auditLog, 'count');
      await getFinanceAudit(adminAuth, '').expect(200);
      expect(findManySpy).toHaveBeenCalledTimes(1);
      expect(countSpy).toHaveBeenCalledTimes(1);
      findManySpy.mockRestore();
      countSpy.mockRestore();
    });
  });
});
