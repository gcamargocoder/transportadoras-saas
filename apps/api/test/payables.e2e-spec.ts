import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Contas a Pagar (Fase 73, e2e)', () => {
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
      slug: `payables-${label.toLowerCase()}-${unique}`,
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
        plannedDeparture: '2026-09-01T08:00:00.000Z',
        plannedArrival: '2026-09-05T18:00:00.000Z',
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createApprovedExpense(
    auth: string,
    tripId: string,
    amount: number,
    overrides: Partial<Record<string, unknown>> = {},
  ) {
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
        ...overrides,
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/trip-expenses/${res.body.data.id}/status`)
      .set('Authorization', auth)
      .send({ status: 'APPROVED' })
      .expect(200);
    return res.body.data.id as string;
  }

  // Fase 79 -- todo POST /payables/:id/payments agora exige
  // financialAccountId.
  async function createFinancialAccount(auth: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/finance/accounts')
      .set('Authorization', auth)
      .send({ name: `Conta Teste ${randomUUID().slice(0, 8)}`, type: 'BANK', initialBalance: 1000000 })
      .expect(201);
    return res.body.data.id as string;
  }

  // Fase Fiscal/XML -- documento fiscal generico (upload manual, sem XML)
  // para testar o vinculo Payable.fiscalDocumentId.
  const VALID_PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
  async function createFiscalDocument(auth: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/fiscal/documents/upload')
      .set('Authorization', auth)
      .field('documentType', 'NFE')
      .attach('file', VALID_PDF, 'nota.pdf')
      .expect(201);
    return res.body.data.id as string;
  }

  function generatePayable(auth: string, expenseId: string, dueDate: string, description?: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/payables/from-expense/${expenseId}`)
      .set('Authorization', auth)
      .send({ dueDate, ...(description ? { description } : {}) });
  }

  describe('geracao a partir da despesa', () => {
    it('gera o titulo com snapshot do valor/categoria/fornecedor, status OPEN e saldo cheio', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Generate');
      const tripId = await setupTrip(adminAuth);
      const expenseId = await createApprovedExpense(adminAuth, tripId, 1500);

      const res = await generatePayable(adminAuth, expenseId, '2026-09-30').expect(201);
      expect(res.body.data.tripId).toBe(tripId);
      expect(res.body.data.expenseId).toBe(expenseId);
      expect(res.body.data.supplierName).toBe('Oficina do Zé');
      expect(res.body.data.category).toBe('MAINTENANCE');
      expect(res.body.data.originalAmount).toBe(1500);
      expect(res.body.data.paidAmount).toBe(0);
      expect(res.body.data.balance).toBe(1500);
      expect(res.body.data.status).toBe('OPEN');
      expect(res.body.data.payments).toEqual([]);
    });

    it('idempotencia: bloqueia gerar um segundo titulo para a mesma despesa', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Idempotent');
      const tripId = await setupTrip(adminAuth);
      const expenseId = await createApprovedExpense(adminAuth, tripId, 800);

      await generatePayable(adminAuth, expenseId, '2026-09-30').expect(201);
      await generatePayable(adminAuth, expenseId, '2026-09-30').expect(409);

      const count = await prisma.payable.count({ where: { expenseId } });
      expect(count).toBe(1);
    });

    it('rejeita expenseId inexistente e despesa ainda nao aprovada (PENDING)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('GenerateGuards');
      const tripId = await setupTrip(adminAuth);

      const pendingRes = await request(app.getHttpServer())
        .post('/api/v1/trip-expenses')
        .set('Authorization', adminAuth)
        .send({ tripId, category: 'FUEL', description: 'Abastecimento', expenseDate: '2026-09-02T10:00:00.000Z', amount: 500 })
        .expect(201);

      await generatePayable(adminAuth, pendingRes.body.data.id, '2026-09-30').expect(409);
      await generatePayable(adminAuth, randomUUID(), '2026-09-30').expect(404);
    });
  });

  describe('titulo manual (Fase Financeiro CP/CR)', () => {
    it('cria um titulo manual sem viagem/despesa de origem, a vista', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ManualCreate');

      const res = await request(app.getHttpServer())
        .post('/api/v1/payables')
        .set('Authorization', adminAuth)
        .send({
          supplierName: 'Imobiliaria XPTO',
          category: 'OTHER',
          description: 'Aluguel do patio',
          originalAmount: 3500,
          issueDate: '2026-09-01',
          dueDate: '2026-09-10',
        })
        .expect(201);

      expect(res.body.data).toHaveLength(1);
      const created = res.body.data[0];
      expect(created.tripId).toBeNull();
      expect(created.expenseId).toBeNull();
      expect(created.tripLabel).toBeNull();
      expect(created.supplierName).toBe('Imobiliaria XPTO');
      expect(created.originalAmount).toBe(3500);
      expect(created.status).toBe('OPEN');
      expect(created.installmentGroupId).toBeNull();
    });

    it('parcelamento: gera N titulos com o mesmo installmentGroupId, vencimento mensal e soma exata', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ManualInstallments');

      const res = await request(app.getHttpServer())
        .post('/api/v1/payables')
        .set('Authorization', adminAuth)
        .send({
          category: 'OTHER',
          description: 'Seguro anual',
          originalAmount: 100,
          issueDate: '2026-09-01',
          dueDate: '2026-09-15',
          installments: 3,
        })
        .expect(201);

      const created = res.body.data as Array<Record<string, unknown>>;
      expect(created).toHaveLength(3);
      const groupId = created[0]?.installmentGroupId;
      expect(groupId).toBeTruthy();
      expect(created.every((c) => c.installmentGroupId === groupId)).toBe(true);
      expect(created.map((c) => c.installmentNumber)).toEqual([1, 2, 3]);
      expect(created.every((c) => c.installmentTotal === 3)).toBe(true);
      const amounts = created.map((c) => c.originalAmount as number);
      expect(amounts).toEqual([33.33, 33.33, 33.34]);
      expect(Math.round(amounts.reduce((a, b) => a + b, 0) * 100) / 100).toBe(100);
      expect(created.map((c) => (c.dueDate as string).slice(0, 10))).toEqual(['2026-09-15', '2026-10-15', '2026-11-15']);
    });

    it('rejeita installments fora do intervalo permitido (1-360)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ManualInstallmentsGuard');
      await request(app.getHttpServer())
        .post('/api/v1/payables')
        .set('Authorization', adminAuth)
        .send({
          category: 'OTHER',
          description: 'Invalido',
          originalAmount: 100,
          issueDate: '2026-09-01',
          dueDate: '2026-09-15',
          installments: 0,
        })
        .expect(400);
    });
  });

  describe('titulo a partir de documento fiscal (Fase Fiscal/XML)', () => {
    it('gera o titulo vinculado ao documento fiscal (autopreenchimento)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('FiscalCreate');
      const fiscalDocumentId = await createFiscalDocument(adminAuth);

      const res = await request(app.getHttpServer())
        .post('/api/v1/payables')
        .set('Authorization', adminAuth)
        .send({
          supplierName: 'Fornecedor XPTO',
          category: 'OTHER',
          description: 'NF-e 1234',
          originalAmount: 1500,
          issueDate: '2026-09-01',
          dueDate: '2026-09-10',
          fiscalDocumentId,
        })
        .expect(201);
      expect(res.body.data[0].fiscalDocumentId).toBe(fiscalDocumentId);

      const docRes = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/${fiscalDocumentId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(docRes.body.data.payable).toEqual({ id: res.body.data[0].id, originalAmount: 1500, status: 'OPEN' });
      expect(docRes.body.data.receivable).toBeNull();
    });

    it('idempotencia: bloqueia gerar um segundo titulo para o mesmo documento fiscal', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('FiscalIdempotent');
      const fiscalDocumentId = await createFiscalDocument(adminAuth);
      const payload = {
        category: 'OTHER',
        description: 'NF-e',
        originalAmount: 500,
        issueDate: '2026-09-01',
        dueDate: '2026-09-10',
        fiscalDocumentId,
      };

      await request(app.getHttpServer()).post('/api/v1/payables').set('Authorization', adminAuth).send(payload).expect(201);
      await request(app.getHttpServer()).post('/api/v1/payables').set('Authorization', adminAuth).send(payload).expect(409);

      const count = await prisma.payable.count({ where: { fiscalDocumentId } });
      expect(count).toBe(1);
    });

    it('rejeita fiscalDocumentId inexistente e mutua exclusividade com parcelamento', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('FiscalGuards');
      const fiscalDocumentId = await createFiscalDocument(adminAuth);

      await request(app.getHttpServer())
        .post('/api/v1/payables')
        .set('Authorization', adminAuth)
        .send({
          category: 'OTHER',
          description: 'Invalido',
          originalAmount: 100,
          issueDate: '2026-09-01',
          dueDate: '2026-09-10',
          fiscalDocumentId: randomUUID(),
        })
        .expect(404);

      await request(app.getHttpServer())
        .post('/api/v1/payables')
        .set('Authorization', adminAuth)
        .send({
          category: 'OTHER',
          description: 'Invalido',
          originalAmount: 100,
          issueDate: '2026-09-01',
          dueDate: '2026-09-10',
          fiscalDocumentId,
          installments: 3,
        })
        .expect(400);
    });

    it('isolamento multi-tenant: nunca gera titulo a partir de documento fiscal de outro tenant', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('FiscalIsolA');
      const tenantB = await createTenantAndLoginAsAdmin('FiscalIsolB');
      const fiscalDocumentId = await createFiscalDocument(tenantA.adminAuth);

      await request(app.getHttpServer())
        .post('/api/v1/payables')
        .set('Authorization', tenantB.adminAuth)
        .send({
          category: 'OTHER',
          description: 'Invalido',
          originalAmount: 100,
          issueDate: '2026-09-01',
          dueDate: '2026-09-10',
          fiscalDocumentId,
        })
        .expect(404);
    });
  });

  describe('pagamentos', () => {
    it('juros/multa/desconto: desconto abate o saldo, juros/multa somam so na movimentacao financeira', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PaymentInterestFineDiscount');
      const financialAccountId = await createFinancialAccount(adminAuth);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/payables')
        .set('Authorization', adminAuth)
        .send({ category: 'OTHER', description: 'Titulo com encargos', originalAmount: 1000, issueDate: '2026-09-01', dueDate: '2026-09-10' })
        .expect(201);
      const id = createRes.body.data[0].id as string;

      // Paga 900 + desconto de 100 -- quita o titulo (900+100=1000), mas
      // acrescenta juros/multa que NAO abatem o saldo (sao so caixa extra).
      const payRes = await request(app.getHttpServer())
        .post(`/api/v1/payables/${id}/payments`)
        .set('Authorization', adminAuth)
        .send({
          amount: 900,
          paymentDate: '2026-09-10',
          paymentMethod: 'PIX',
          financialAccountId,
          interestAmount: 50,
          fineAmount: 20,
          discountAmount: 100,
        })
        .expect(201);

      expect(payRes.body.data.paidAmount).toBe(1000);
      expect(payRes.body.data.balance).toBe(0);
      expect(payRes.body.data.status).toBe('PAID');
      const payment = payRes.body.data.payments[0];
      expect(payment.amount).toBe(900);
      expect(payment.interestAmount).toBe(50);
      expect(payment.fineAmount).toBe(20);
      expect(payment.discountAmount).toBe(100);

      // FinancialTransaction real = amount + juros + multa (desconto nunca
      // movimenta caixa) = 900 + 50 + 20 = 970.
      const transaction = await prisma.financialTransaction.findUnique({
        where: { id: payment.financialTransactionId },
      });
      expect(Number(transaction?.amount)).toBe(970);
    });

    it('juros/multa/desconto: amount + desconto nunca pode ultrapassar o saldo', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PaymentDiscountGuard');
      const financialAccountId = await createFinancialAccount(adminAuth);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/payables')
        .set('Authorization', adminAuth)
        .send({ category: 'OTHER', description: 'Titulo', originalAmount: 100, issueDate: '2026-09-01', dueDate: '2026-09-10' })
        .expect(201);
      const id = createRes.body.data[0].id as string;

      await request(app.getHttpServer())
        .post(`/api/v1/payables/${id}/payments`)
        .set('Authorization', adminAuth)
        .send({ amount: 80, paymentDate: '2026-09-10', paymentMethod: 'PIX', financialAccountId, discountAmount: 30 })
        .expect(400);
    });

    it('pagamento parcial e depois total -- saldo e status corretos, sem exceder', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Payments');
      const financialAccountId = await createFinancialAccount(adminAuth);
      const tripId = await setupTrip(adminAuth);
      const expenseId = await createApprovedExpense(adminAuth, tripId, 1000);
      const payable = await generatePayable(adminAuth, expenseId, '2026-09-30').expect(201);
      const id = payable.body.data.id as string;

      const partial = await request(app.getHttpServer())
        .post(`/api/v1/payables/${id}/payments`)
        .set('Authorization', adminAuth)
        .send({ amount: 300, paymentDate: '2026-09-10', paymentMethod: 'PIX', reference: 'TXN-1', financialAccountId })
        .expect(201);
      expect(partial.body.data.paidAmount).toBe(300);
      expect(partial.body.data.balance).toBe(700);
      expect(partial.body.data.status).toBe('PARTIALLY_PAID');
      expect(partial.body.data.payments).toHaveLength(1);

      await request(app.getHttpServer())
        .post(`/api/v1/payables/${id}/payments`)
        .set('Authorization', adminAuth)
        .send({ amount: 701, paymentDate: '2026-09-15', paymentMethod: 'PIX', financialAccountId })
        .expect(400);

      const full = await request(app.getHttpServer())
        .post(`/api/v1/payables/${id}/payments`)
        .set('Authorization', adminAuth)
        .send({ amount: 700, paymentDate: '2026-09-20', paymentMethod: 'BANK_TRANSFER', financialAccountId })
        .expect(201);
      expect(full.body.data.paidAmount).toBe(1000);
      expect(full.body.data.balance).toBe(0);
      expect(full.body.data.status).toBe('PAID');
      expect(full.body.data.payments).toHaveLength(2);

      await request(app.getHttpServer())
        .post(`/api/v1/payables/${id}/payments`)
        .set('Authorization', adminAuth)
        .send({ amount: 1, paymentDate: '2026-09-21', paymentMethod: 'PIX', financialAccountId })
        .expect(409);
    });

    it('vencimento: titulo com dueDate no passado fica OVERDUE, mas nunca apos quitado', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Overdue');
      const financialAccountId = await createFinancialAccount(adminAuth);
      const tripId = await setupTrip(adminAuth);
      const expenseId = await createApprovedExpense(adminAuth, tripId, 500);
      const payable = await generatePayable(adminAuth, expenseId, '2020-01-01').expect(201);
      const id = payable.body.data.id as string;

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/payables/${id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(getRes.body.data.status).toBe('OVERDUE');

      await request(app.getHttpServer())
        .post(`/api/v1/payables/${id}/payments`)
        .set('Authorization', adminAuth)
        .send({ amount: 500, paymentDate: '2026-01-01', paymentMethod: 'PIX', financialAccountId })
        .expect(201);

      const paidRes = await request(app.getHttpServer())
        .get(`/api/v1/payables/${id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(paidRes.body.data.status).toBe('PAID');
    });
  });

  describe('cancelamento', () => {
    it('cancela, preserva pagamentos ja feitos e bloqueia novos pagamentos', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Cancel');
      const financialAccountId = await createFinancialAccount(adminAuth);
      const tripId = await setupTrip(adminAuth);
      const expenseId = await createApprovedExpense(adminAuth, tripId, 900);
      const payable = await generatePayable(adminAuth, expenseId, '2026-09-30').expect(201);
      const id = payable.body.data.id as string;

      await request(app.getHttpServer())
        .post(`/api/v1/payables/${id}/payments`)
        .set('Authorization', adminAuth)
        .send({ amount: 200, paymentDate: '2026-09-05', paymentMethod: 'PIX', financialAccountId })
        .expect(201);

      const cancelRes = await request(app.getHttpServer())
        .post(`/api/v1/payables/${id}/cancel`)
        .set('Authorization', adminAuth)
        .expect(201);
      expect(cancelRes.body.data.status).toBe('CANCELLED');
      expect(cancelRes.body.data.paidAmount).toBe(200);
      expect(cancelRes.body.data.payments).toHaveLength(1);

      await request(app.getHttpServer())
        .post(`/api/v1/payables/${id}/payments`)
        .set('Authorization', adminAuth)
        .send({ amount: 100, paymentDate: '2026-09-06', paymentMethod: 'PIX', financialAccountId })
        .expect(409);

      await request(app.getHttpServer())
        .post(`/api/v1/payables/${id}/cancel`)
        .set('Authorization', adminAuth)
        .expect(409);
    });
  });

  describe('isolamento multi-tenant', () => {
    it('tenant B nunca acessa titulo do tenant A (listar/ver/pagar/cancelar)', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolA');
      const tenantB = await createTenantAndLoginAsAdmin('IsolB');
      const tripId = await setupTrip(tenantA.adminAuth);
      const expenseId = await createApprovedExpense(tenantA.adminAuth, tripId, 600);
      const payable = await generatePayable(tenantA.adminAuth, expenseId, '2026-09-30').expect(201);
      const id = payable.body.data.id as string;

      await request(app.getHttpServer())
        .get(`/api/v1/payables/${id}`)
        .set('Authorization', tenantB.adminAuth)
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/v1/payables/${id}/payments`)
        .set('Authorization', tenantB.adminAuth)
        .send({ amount: 100, paymentDate: '2026-09-05', paymentMethod: 'PIX', financialAccountId: randomUUID() })
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/v1/payables/${id}/cancel`)
        .set('Authorization', tenantB.adminAuth)
        .expect(404);

      const listB = await request(app.getHttpServer())
        .get('/api/v1/payables')
        .set('Authorization', tenantB.adminAuth)
        .expect(200);
      expect(listB.body.data.items).toHaveLength(0);

      await generatePayable(tenantB.adminAuth, expenseId, '2026-09-30').expect(404);
    });
  });

  describe('RBAC', () => {
    it('AUDITOR le mas nao registra pagamento nem cancela', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Rbac');
      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');
      const tripId = await setupTrip(adminAuth);
      const expenseId = await createApprovedExpense(adminAuth, tripId, 400);
      const payable = await generatePayable(adminAuth, expenseId, '2026-09-30').expect(201);
      const id = payable.body.data.id as string;

      await request(app.getHttpServer())
        .get(`/api/v1/payables/${id}`)
        .set('Authorization', auditorAuth)
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/v1/payables/dashboard')
        .set('Authorization', auditorAuth)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/api/v1/payables/${id}/payments`)
        .set('Authorization', auditorAuth)
        .send({ amount: 100, paymentDate: '2026-09-05', paymentMethod: 'PIX', financialAccountId: randomUUID() })
        .expect(403);
      await request(app.getHttpServer())
        .post(`/api/v1/payables/${id}/cancel`)
        .set('Authorization', auditorAuth)
        .expect(403);
    });
  });

  describe('dashboard e aging', () => {
    it('resumo/aging/por-categoria consistentes com titulos aberto/vencido/pago/cancelado', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Dashboard');
      const financialAccountId = await createFinancialAccount(adminAuth);
      const tripId = await setupTrip(adminAuth);

      // 1) Em aberto, a vencer.
      const openExpenseId = await createApprovedExpense(adminAuth, tripId, 1000, { category: 'MAINTENANCE' });
      await generatePayable(adminAuth, openExpenseId, '2099-01-01').expect(201);

      // 2) Vencido ha ~45 dias (bucket 31-60).
      const overdueExpenseId = await createApprovedExpense(adminAuth, tripId, 500, { category: 'FUEL' });
      const overdueDue = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await generatePayable(adminAuth, overdueExpenseId, overdueDue).expect(201);

      // 3) Pago integralmente.
      const paidExpenseId = await createApprovedExpense(adminAuth, tripId, 300, { category: 'TOLL_EXTRA' });
      const paidPayable = await generatePayable(adminAuth, paidExpenseId, '2026-01-01').expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/payables/${paidPayable.body.data.id}/payments`)
        .set('Authorization', adminAuth)
        .send({ amount: 300, paymentDate: '2026-01-05', paymentMethod: 'PIX', financialAccountId })
        .expect(201);

      // 4) Cancelado -- nunca compoe os totais.
      const cancelledExpenseId = await createApprovedExpense(adminAuth, tripId, 9999);
      const cancelledPayable = await generatePayable(adminAuth, cancelledExpenseId, '2026-01-01').expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/payables/${cancelledPayable.body.data.id}/cancel`)
        .set('Authorization', adminAuth)
        .expect(201);

      const dashboard = await request(app.getHttpServer())
        .get(`/api/v1/payables/dashboard?tripId=${tripId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      const { summary, aging, byCategory } = dashboard.body.data;

      expect(summary.totalPayable).toBe(1000 + 500 + 300); // 9999 (cancelado) excluido
      expect(summary.totalPaid).toBe(300);
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
      expect(bucket31to60.amount).toBe(500);

      const maintenanceCategory = byCategory.find((c: { category: string }) => c.category === 'MAINTENANCE');
      const fuelCategory = byCategory.find((c: { category: string }) => c.category === 'FUEL');
      expect(maintenanceCategory.totalPayable).toBe(1000);
      expect(fuelCategory.totalPayable).toBe(500);

      const overdueList = await request(app.getHttpServer())
        .get('/api/v1/payables?status=OVERDUE')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(overdueList.body.data.items).toHaveLength(1);
      expect(overdueList.body.data.items[0].status).toBe('OVERDUE');
    });

    it(
      'N+1: numero de queries do dashboard nao cresce com a quantidade de titulos',
      async () => {
        const { adminAuth } = await createTenantAndLoginAsAdmin('DashboardNPlus1');
        const tripId = await setupTrip(adminAuth);

        async function createPayables(count: number) {
          for (let i = 0; i < count; i += 1) {
            const expenseId = await createApprovedExpense(adminAuth, tripId, 100 + i);
            await generatePayable(adminAuth, expenseId, '2099-01-01').expect(201);
          }
        }

        await createPayables(3);

        const findManySpy = jest.spyOn(prisma.payable, 'findMany');
        await request(app.getHttpServer())
          .get(`/api/v1/payables/dashboard?tripId=${tripId}`)
          .set('Authorization', adminAuth)
          .expect(200);
        const callsWithFew = findManySpy.mock.calls.length;
        findManySpy.mockClear();

        await createPayables(8); // total 11 titulos

        await request(app.getHttpServer())
          .get(`/api/v1/payables/dashboard?tripId=${tripId}`)
          .set('Authorization', adminAuth)
          .expect(200);
        const callsWithMany = findManySpy.mock.calls.length;
        findManySpy.mockRestore();

        expect(callsWithFew).toBe(1);
        expect(callsWithMany).toBe(1);
      },
      60000,
    );
  });

  describe('auditoria', () => {
    it('registra criacao, pagamento e cancelamento com ator/tenant/IP', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Audit');
      const financialAccountId = await createFinancialAccount(adminAuth);
      const tripId = await setupTrip(adminAuth);
      const expenseId = await createApprovedExpense(adminAuth, tripId, 700);
      const payable = await generatePayable(adminAuth, expenseId, '2026-09-30').expect(201);
      const id = payable.body.data.id as string;

      await request(app.getHttpServer())
        .post(`/api/v1/payables/${id}/payments`)
        .set('Authorization', adminAuth)
        .send({ amount: 700, paymentDate: '2026-09-10', paymentMethod: 'PIX', financialAccountId })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/payables/${id}/cancel`)
        .set('Authorization', adminAuth)
        .expect(201);

      const logs = await prisma.auditLog.findMany({
        where: { tenantId, entityName: { in: ['Payable', 'PayablePayment'] } },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs.map((l) => l.action)).toEqual(['payable.created', 'payable.payment_created', 'payable.cancelled']);
      for (const log of logs) {
        expect(log.tenantId).toBe(tenantId);
        expect(log.userId).toBeTruthy();
        expect(log.ipAddress).toBeTruthy();
      }
    });
  });
});
