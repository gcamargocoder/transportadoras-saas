import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { FinancialPeriodGuardService } from '../src/financial-periods/services/financial-period-guard.service';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 76 -- CAMADA DE CONTROLE sobre os ledgers ja existentes (Receivable/
// Payable), nunca um ledger novo. Testes DIRECIONADOS (secao 18 do pedido):
// CRUD de periodo, fechamento/idempotencia, bloqueio de mutacoes em
// periodo fechado (Payable e Receivable), periodo inexistente = permitido,
// isolamento multi-tenant, RBAC e ausencia de N+1 no guard.
describe('Fechamento Financeiro / Periodos (Fase 76, e2e)', () => {
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
      slug: `finperiods-${label.toLowerCase()}-${unique}`,
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

  // expenseDate controla diretamente a competencia (issueDate) do Payable
  // gerado -- ver PayablesService.generateFromExpense.
  async function createApprovedExpense(auth: string, tripId: string, amount: number, expenseDate: string) {
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

  function generatePayable(auth: string, expenseId: string, dueDate = '2099-01-01') {
    return request(app.getHttpServer())
      .post(`/api/v1/payables/from-expense/${expenseId}`)
      .set('Authorization', auth)
      .send({ dueDate });
  }

  function openPeriod(auth: string, year: number, month: number) {
    return request(app.getHttpServer()).post('/api/v1/finance/periods').set('Authorization', auth).send({ year, month });
  }

  function closePeriod(auth: string, id: string) {
    return request(app.getHttpServer()).post(`/api/v1/finance/periods/${id}/close`).set('Authorization', auth).send({});
  }

  describe('CRUD de periodo', () => {
    it('abre periodo (OPEN), bloqueia duplicidade e lista ordenado por year/month DESC', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Crud');

      const created = await openPeriod(adminAuth, 2025, 3).expect(201);
      expect(created.body.data.status).toBe('OPEN');
      expect(created.body.data.year).toBe(2025);
      expect(created.body.data.month).toBe(3);
      expect(created.body.data.closedAt).toBeNull();

      await openPeriod(adminAuth, 2025, 3).expect(409);
      await openPeriod(adminAuth, 2025, 1).expect(201);
      await openPeriod(adminAuth, 2025, 2).expect(201);

      const list = await request(app.getHttpServer())
        .get('/api/v1/finance/periods?year=2025')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(list.body.data.items.map((p: { month: number }) => p.month)).toEqual([3, 2, 1]);
    });
  });

  describe('fechamento', () => {
    it('fecha periodo (CLOSED), e idempotente -- 409 ao fechar 2x', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Close');
      const created = await openPeriod(adminAuth, 2025, 4).expect(201);
      const id = created.body.data.id as string;

      const closed = await closePeriod(adminAuth, id).expect(201);
      expect(closed.body.data.status).toBe('CLOSED');
      expect(closed.body.data.closedAt).toBeTruthy();

      await closePeriod(adminAuth, id).expect(409);

      const detail = await request(app.getHttpServer())
        .get(`/api/v1/finance/periods/${id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(detail.body.data.status).toBe('CLOSED');
      expect(detail.body.data.summary).toBeDefined();
    });
  });

  describe('protecao de mutacoes -- Payable', () => {
    it('bloqueia criacao/pagamento/cancelamento com competencia em periodo fechado; permite em aberto/inexistente', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('PayableGuard');
      const tripId = await setupTrip(adminAuth);

      // Periodo 2025-05 fechado; 2025-06 nunca criado (inexistente).
      const period = await openPeriod(adminAuth, 2025, 5).expect(201);
      await closePeriod(adminAuth, period.body.data.id).expect(201);

      // 1) Criacao bloqueada -- expenseDate cai no periodo fechado (2025-05).
      const blockedExpenseId = await createApprovedExpense(adminAuth, tripId, 500, '2025-05-10T10:00:00.000Z');
      await generatePayable(adminAuth, blockedExpenseId).expect(409);

      // 2) Criacao permitida -- expenseDate cai em periodo inexistente (2025-06).
      const openExpenseId = await createApprovedExpense(adminAuth, tripId, 500, '2025-06-10T10:00:00.000Z');
      const payable = await generatePayable(adminAuth, openExpenseId).expect(201);
      const payableId = payable.body.data.id as string;

      // 3) Pagamento bloqueado -- paymentDate cai no periodo fechado (2025-05).
      await request(app.getHttpServer())
        .post(`/api/v1/payables/${payableId}/payments`)
        .set('Authorization', adminAuth)
        .send({ amount: 100, paymentDate: '2025-05-15', paymentMethod: 'PIX' })
        .expect(409);

      // 4) Pagamento permitido -- paymentDate em periodo inexistente (2025-06).
      await request(app.getHttpServer())
        .post(`/api/v1/payables/${payableId}/payments`)
        .set('Authorization', adminAuth)
        .send({ amount: 100, paymentDate: '2025-06-15', paymentMethod: 'PIX' })
        .expect(201);

      // 5) Cancelamento bloqueado -- o titulo em si tem issueDate em periodo
      // fechado (2025-05). Criado direto via Prisma (bypassa o guard, so
      // usado na fase de setup) para nao depender de um segundo periodo
      // fechado -- reforca que o cancelamento e protegido pela competencia
      // do PROPRIO titulo, nunca pela data do cancelamento.
      const admin = await prisma.userAccount.findFirstOrThrow({ where: { tenantId, role: 'ADMIN' } });
      const blockedPayable = await prisma.payable.create({
        data: {
          tenantId,
          tripId,
          expenseId: blockedExpenseId,
          category: 'MAINTENANCE',
          description: 'Titulo de teste (cancelamento)',
          originalAmount: 500,
          paidAmount: 0,
          issueDate: new Date('2025-05-10T10:00:00.000Z'),
          dueDate: new Date('2099-01-01'),
          createdBy: admin.id,
        },
      });
      await request(app.getHttpServer())
        .post(`/api/v1/payables/${blockedPayable.id}/cancel`)
        .set('Authorization', adminAuth)
        .expect(409);

      // 6) Cancelamento permitido -- titulo com issueDate em periodo aberto.
      await request(app.getHttpServer()).post(`/api/v1/payables/${payableId}/cancel`).set('Authorization', adminAuth).expect(201);
    });
  });

  describe('protecao de mutacoes -- Receivable', () => {
    it('bloqueia ReceivablePayment com paymentDate em periodo fechado; permite fora dele', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ReceivableGuard');
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

      const vehicleId = await createVehicle(adminAuth);
      const driverId = await createDriver(adminAuth);
      const compositionId = await createComposition(adminAuth, vehicleId);
      const originId = await createLocation(adminAuth, `Origem ${randomUUID()}`);
      const destinationId = await createLocation(adminAuth, `Destino ${randomUUID()}`);
      const tripRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', adminAuth)
        .send({
          driverId,
          compositionId,
          customerId,
          originLocationId: originId,
          destinationLocationId: destinationId,
          plannedDeparture: '2026-01-01T08:00:00.000Z',
          plannedArrival: '2026-01-02T18:00:00.000Z',
        })
        .expect(201);
      const tripId = tripRes.body.data.id as string;

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

      const period = await openPeriod(adminAuth, 2025, 7).expect(201);
      await closePeriod(adminAuth, period.body.data.id).expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/receivables/${receivableId}/payments`)
        .set('Authorization', adminAuth)
        .send({ amount: 100, paymentDate: '2025-07-10', paymentMethod: 'PIX' })
        .expect(409);

      await request(app.getHttpServer())
        .post(`/api/v1/receivables/${receivableId}/payments`)
        .set('Authorization', adminAuth)
        .send({ amount: 100, paymentDate: '2025-08-10', paymentMethod: 'PIX' })
        .expect(201);
    });
  });

  describe('isolamento multi-tenant', () => {
    it('tenant B nunca acessa/lista/fecha periodo do tenant A, nem sofre bloqueio pelo periodo de A', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolA');
      const tenantB = await createTenantAndLoginAsAdmin('IsolB');

      const periodA = await openPeriod(tenantA.adminAuth, 2025, 8).expect(201);
      const periodId = periodA.body.data.id as string;
      await closePeriod(tenantA.adminAuth, periodId).expect(201);

      await request(app.getHttpServer()).get(`/api/v1/finance/periods/${periodId}`).set('Authorization', tenantB.adminAuth).expect(404);
      await closePeriod(tenantB.adminAuth, periodId).expect(404);

      const listB = await request(app.getHttpServer()).get('/api/v1/finance/periods').set('Authorization', tenantB.adminAuth).expect(200);
      expect(listB.body.data.items).toHaveLength(0);

      // Tenant B nunca sofre bloqueio pelo periodo 2025-08 fechado do tenant A.
      const tripId = await setupTrip(tenantB.adminAuth);
      const expenseId = await createApprovedExpense(tenantB.adminAuth, tripId, 300, '2025-08-10T10:00:00.000Z');
      await generatePayable(tenantB.adminAuth, expenseId).expect(201);
    });
  });

  describe('RBAC', () => {
    it('AUDITOR le periodos mas nao abre nem fecha', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Rbac');
      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');
      const created = await openPeriod(adminAuth, 2025, 9).expect(201);
      const id = created.body.data.id as string;

      await request(app.getHttpServer()).get('/api/v1/finance/periods').set('Authorization', auditorAuth).expect(200);
      await request(app.getHttpServer()).get(`/api/v1/finance/periods/${id}`).set('Authorization', auditorAuth).expect(200);
      await openPeriod(auditorAuth, 2025, 10).expect(403);
      await closePeriod(auditorAuth, id).expect(403);
    });
  });

  describe('performance', () => {
    it('guard executa no maximo 1 consulta de FinancialPeriod por mutacao (sem N+1)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('NPlus1');
      const tripId = await setupTrip(adminAuth);
      const expenseId = await createApprovedExpense(adminAuth, tripId, 200, '2025-11-10T10:00:00.000Z');

      const guard = app.get(FinancialPeriodGuardService);
      const spy = jest.spyOn(guard, 'assertPeriodOpenForDate');

      await generatePayable(adminAuth, expenseId).expect(201);

      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });
  });
});
