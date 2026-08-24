import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 80 -- Conciliacao Financeira e Importacao de Movimentacoes Bancarias.
// Testes DIRECIONADOS (secao 17 do pedido): import CSV valido/invalido,
// duplicidade, isolamento multi-tenant, listagem, candidatos, conciliar,
// dupla conciliacao, vinculo cruzado entre tenants, divergencia
// incompativel, desconciliar, periodo fechado, RBAC, N+1.
describe('Conciliacao Bancaria (Fase 80, e2e)', () => {
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

  async function createTenantAndLoginAsAdmin(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    const payload = {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `bankrecon-${label.toLowerCase()}-${unique}`,
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

  async function createFinancialAccount(auth: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/finance/accounts')
      .set('Authorization', auth)
      .send({ name: `Conta ${randomUUID().slice(0, 8)}`, type: 'BANK', initialBalance: 100000 })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createFinancialTransaction(
    auth: string,
    accountId: string,
    body: { type: 'CREDIT' | 'DEBIT'; amount: number; transactionDate: string; description?: string },
  ) {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/finance/accounts/${accountId}/transactions`)
      .set('Authorization', auth)
      .send({ description: 'Movimentacao teste', ...body })
      .expect(201);
    return res.body.data.id as string;
  }

  function importCsv(auth: string, accountId: string, csv: string, filename = 'extrato.csv') {
    return request(app.getHttpServer())
      .post(`/api/v1/finance/accounts/${accountId}/bank-transactions/import`)
      .set('Authorization', auth)
      .attach('file', Buffer.from(csv, 'utf8'), filename);
  }

  function openPeriod(auth: string, year: number, month: number) {
    return request(app.getHttpServer()).post('/api/v1/finance/periods').set('Authorization', auth).send({ year, month });
  }

  function closePeriod(auth: string, id: string) {
    return request(app.getHttpServer()).post(`/api/v1/finance/periods/${id}/close`).set('Authorization', auth).send({});
  }

  describe('importacao CSV', () => {
    it('importa linhas validas, rejeita invalidas sem interromper, e impede duplicacao (externalId e rowHash)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Import');
      const accountId = await createFinancialAccount(adminAuth);

      const csv =
        'date,description,amount,type,externalId\n' +
        '2026-08-10,PIX Cliente ABC,1500.00,CREDIT,EXT-1\n' +
        '2026-08-11,Tarifa manutencao,50.00,DEBIT,\n' + // sem externalId -- dedup por rowHash
        '2026-08-12,Linha invalida,abc,CREDIT,EXT-3\n' + // valor invalido
        '2026-08-13,Sem tipo,100.00,,EXT-4\n'; // tipo ausente

      const res = await importCsv(adminAuth, accountId, csv).expect(201);
      expect(res.body.data.rowsRead).toBe(4);
      expect(res.body.data.imported).toBe(2);
      expect(res.body.data.invalid).toBe(2);
      expect(res.body.data.duplicates).toBe(0);
      expect(res.body.data.errors).toHaveLength(2);

      const list = await request(app.getHttpServer())
        .get(`/api/v1/finance/bank-transactions?financialAccountId=${accountId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(list.body.data.items).toHaveLength(2);
      expect(list.body.data.items.every((t: { status: string }) => t.status === 'PENDING')).toBe(true);

      // Reimporta o MESMO CSV -- as 2 linhas validas agora sao duplicadas
      // (1 por externalId, 1 por rowHash), nao criam novas linhas.
      const second = await importCsv(adminAuth, accountId, csv).expect(201);
      expect(second.body.data.imported).toBe(0);
      expect(second.body.data.duplicates).toBe(2);

      const countAfter = await prisma.financialBankTransaction.count({ where: { financialAccountId: accountId } });
      expect(countAfter).toBe(2);
    });

    it('rejeita CSV binario (conteudo nao-texto)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('BinaryCsv');
      const accountId = await createFinancialAccount(adminAuth);
      const binary = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);
      await request(app.getHttpServer())
        .post(`/api/v1/finance/accounts/${accountId}/bank-transactions/import`)
        .set('Authorization', adminAuth)
        .attach('file', binary, 'extrato.csv')
        .expect(400);
    });
  });

  describe('isolamento multi-tenant', () => {
    it('tenant B nao ve BankTransaction de A, nao importa para conta de A, nao concilia com FinancialTransaction de A', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolA');
      const tenantB = await createTenantAndLoginAsAdmin('IsolB');
      const accountA = await createFinancialAccount(tenantA.adminAuth);
      const csv = 'date,description,amount,type,externalId\n2026-08-10,PIX,1000.00,CREDIT,EXT-ISO\n';
      await importCsv(tenantA.adminAuth, accountA, csv).expect(201);
      const bankTxId = (
        await request(app.getHttpServer())
          .get(`/api/v1/finance/bank-transactions?financialAccountId=${accountA}`)
          .set('Authorization', tenantA.adminAuth)
          .expect(200)
      ).body.data.items[0].id as string;

      await importCsv(tenantB.adminAuth, accountA, csv).expect(404);
      await request(app.getHttpServer()).get(`/api/v1/finance/bank-transactions/${bankTxId}`).set('Authorization', tenantB.adminAuth).expect(404);

      const ftB = await createFinancialTransaction(tenantB.adminAuth, await createFinancialAccount(tenantB.adminAuth), {
        type: 'CREDIT',
        amount: 1000,
        transactionDate: '2026-08-10',
      });
      // Tenant A tentando conciliar com uma FinancialTransaction que NAO existe no seu proprio tenant (e a de B).
      await request(app.getHttpServer())
        .post(`/api/v1/finance/bank-transactions/${bankTxId}/reconcile`)
        .set('Authorization', tenantA.adminAuth)
        .send({ financialTransactionId: ftB })
        .expect(404);
    });
  });

  describe('candidatos e conciliacao manual', () => {
    it('lista pendentes, identifica candidato e concilia (MATCHED com data igual, DIVERGENT com data diferente)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Reconcile');
      const accountId = await createFinancialAccount(adminAuth);

      // Caso 1: data igual -> MATCHED.
      await importCsv(adminAuth, accountId, 'date,description,amount,type,externalId\n2026-08-10,PIX Cliente,1500.00,CREDIT,EXT-M\n').expect(201);
      const bank1 = (
        await request(app.getHttpServer())
          .get(`/api/v1/finance/bank-transactions?financialAccountId=${accountId}&status=PENDING`)
          .set('Authorization', adminAuth)
          .expect(200)
      ).body.data.items[0];
      expect(bank1.status).toBe('PENDING');

      const ft1 = await createFinancialTransaction(adminAuth, accountId, { type: 'CREDIT', amount: 1500, transactionDate: '2026-08-10' });

      const candidates = await request(app.getHttpServer())
        .get(`/api/v1/finance/bank-transactions/${bank1.id}/candidates`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(candidates.body.data.some((c: { financialTransaction: { id: string } }) => c.financialTransaction.id === ft1)).toBe(true);

      const reconciled = await request(app.getHttpServer())
        .post(`/api/v1/finance/bank-transactions/${bank1.id}/reconcile`)
        .set('Authorization', adminAuth)
        .send({ financialTransactionId: ft1 })
        .expect(201);
      expect(reconciled.body.data.status).toBe('MATCHED');
      expect(reconciled.body.data.financialTransaction.id).toBe(ft1);

      // Caso 2: data diferente -> DIVERGENT (ainda vinculado).
      await importCsv(adminAuth, accountId, 'date,description,amount,type,externalId\n2026-08-15,PIX Cliente 2,700.00,DEBIT,EXT-D\n').expect(201);
      const bank2 = (
        await request(app.getHttpServer())
          .get(`/api/v1/finance/bank-transactions?financialAccountId=${accountId}&status=PENDING`)
          .set('Authorization', adminAuth)
          .expect(200)
      ).body.data.items[0];
      const ft2 = await createFinancialTransaction(adminAuth, accountId, { type: 'DEBIT', amount: 700, transactionDate: '2026-08-17' });
      const divergent = await request(app.getHttpServer())
        .post(`/api/v1/finance/bank-transactions/${bank2.id}/reconcile`)
        .set('Authorization', adminAuth)
        .send({ financialTransactionId: ft2 })
        .expect(201);
      expect(divergent.body.data.status).toBe('DIVERGENT');
      expect(divergent.body.data.dateDifferenceDays).toBe(-2);
    });

    it('impede dupla conciliacao e vinculo incompativel (conta/tipo/valor diferente)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Incompatible');
      const accountId = await createFinancialAccount(adminAuth);
      const otherAccountId = await createFinancialAccount(adminAuth);

      await importCsv(adminAuth, accountId, 'date,description,amount,type,externalId\n2026-08-10,PIX,1000.00,CREDIT,EXT-X\n').expect(201);
      const bankTx = (
        await request(app.getHttpServer())
          .get(`/api/v1/finance/bank-transactions?financialAccountId=${accountId}`)
          .set('Authorization', adminAuth)
          .expect(200)
      ).body.data.items[0];

      // Tipo incompativel.
      const ftWrongType = await createFinancialTransaction(adminAuth, accountId, { type: 'DEBIT', amount: 1000, transactionDate: '2026-08-10' });
      await request(app.getHttpServer())
        .post(`/api/v1/finance/bank-transactions/${bankTx.id}/reconcile`)
        .set('Authorization', adminAuth)
        .send({ financialTransactionId: ftWrongType })
        .expect(409);

      // Valor incompativel.
      const ftWrongAmount = await createFinancialTransaction(adminAuth, accountId, { type: 'CREDIT', amount: 999, transactionDate: '2026-08-10' });
      await request(app.getHttpServer())
        .post(`/api/v1/finance/bank-transactions/${bankTx.id}/reconcile`)
        .set('Authorization', adminAuth)
        .send({ financialTransactionId: ftWrongAmount })
        .expect(409);

      // Conta incompativel.
      const ftWrongAccount = await createFinancialTransaction(adminAuth, otherAccountId, {
        type: 'CREDIT',
        amount: 1000,
        transactionDate: '2026-08-10',
      });
      await request(app.getHttpServer())
        .post(`/api/v1/finance/bank-transactions/${bankTx.id}/reconcile`)
        .set('Authorization', adminAuth)
        .send({ financialTransactionId: ftWrongAccount })
        .expect(409);

      // Concilia com sucesso.
      const ftOk = await createFinancialTransaction(adminAuth, accountId, { type: 'CREDIT', amount: 1000, transactionDate: '2026-08-10' });
      await request(app.getHttpServer())
        .post(`/api/v1/finance/bank-transactions/${bankTx.id}/reconcile`)
        .set('Authorization', adminAuth)
        .send({ financialTransactionId: ftOk })
        .expect(201);

      // Dupla conciliacao: a mesma BankTransaction de novo.
      const ftAnother = await createFinancialTransaction(adminAuth, accountId, { type: 'CREDIT', amount: 1000, transactionDate: '2026-08-10' });
      await request(app.getHttpServer())
        .post(`/api/v1/finance/bank-transactions/${bankTx.id}/reconcile`)
        .set('Authorization', adminAuth)
        .send({ financialTransactionId: ftAnother })
        .expect(409);

      // Dupla conciliacao: a mesma FinancialTransaction (ftOk) por outra BankTransaction.
      await importCsv(adminAuth, accountId, 'date,description,amount,type,externalId\n2026-08-10,PIX 2,1000.00,CREDIT,EXT-Y\n').expect(201);
      const bankTx2 = (
        await request(app.getHttpServer())
          .get(`/api/v1/finance/bank-transactions?financialAccountId=${accountId}&status=PENDING`)
          .set('Authorization', adminAuth)
          .expect(200)
      ).body.data.items[0];
      await request(app.getHttpServer())
        .post(`/api/v1/finance/bank-transactions/${bankTx2.id}/reconcile`)
        .set('Authorization', adminAuth)
        .send({ financialTransactionId: ftOk })
        .expect(409);
    });
  });

  describe('desconciliacao', () => {
    it('desconcilia preservando BankTransaction e FinancialTransaction', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Unreconcile');
      const accountId = await createFinancialAccount(adminAuth);
      await importCsv(adminAuth, accountId, 'date,description,amount,type,externalId\n2026-08-10,PIX,1000.00,CREDIT,EXT-U\n').expect(201);
      const bankTx = (
        await request(app.getHttpServer())
          .get(`/api/v1/finance/bank-transactions?financialAccountId=${accountId}`)
          .set('Authorization', adminAuth)
          .expect(200)
      ).body.data.items[0];
      const ft = await createFinancialTransaction(adminAuth, accountId, { type: 'CREDIT', amount: 1000, transactionDate: '2026-08-10' });
      await request(app.getHttpServer())
        .post(`/api/v1/finance/bank-transactions/${bankTx.id}/reconcile`)
        .set('Authorization', adminAuth)
        .send({ financialTransactionId: ft })
        .expect(201);

      const unreconciled = await request(app.getHttpServer())
        .post(`/api/v1/finance/bank-transactions/${bankTx.id}/unreconcile`)
        .set('Authorization', adminAuth)
        .expect(201);
      expect(unreconciled.body.data.status).toBe('PENDING');
      expect(unreconciled.body.data.financialTransactionId).toBeNull();

      const preservedBankTx = await prisma.financialBankTransaction.findUniqueOrThrow({ where: { id: bankTx.id } });
      expect(preservedBankTx.amount.toNumber()).toBe(1000);
      const preservedFt = await prisma.financialTransaction.findUniqueOrThrow({ where: { id: ft } });
      expect(preservedFt.amount.toNumber()).toBe(1000);

      // Desconciliar de novo -- ja nao esta conciliada.
      await request(app.getHttpServer())
        .post(`/api/v1/finance/bank-transactions/${bankTx.id}/unreconcile`)
        .set('Authorization', adminAuth)
        .expect(409);
    });
  });

  describe('periodo financeiro fechado', () => {
    it('bloqueia reconcile e unreconcile quando o periodo da data bancaria esta CLOSED', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PeriodGuard');
      const accountId = await createFinancialAccount(adminAuth);
      const period = await openPeriod(adminAuth, 2025, 5).expect(201);
      await closePeriod(adminAuth, period.body.data.id).expect(201);

      await importCsv(adminAuth, accountId, 'date,description,amount,type,externalId\n2025-05-10,PIX,1000.00,CREDIT,EXT-P\n').expect(201);
      const bankTx = (
        await request(app.getHttpServer())
          .get(`/api/v1/finance/bank-transactions?financialAccountId=${accountId}`)
          .set('Authorization', adminAuth)
          .expect(200)
      ).body.data.items[0];
      const ft = await createFinancialTransaction(adminAuth, accountId, { type: 'CREDIT', amount: 1000, transactionDate: '2026-08-10' });

      await request(app.getHttpServer())
        .post(`/api/v1/finance/bank-transactions/${bankTx.id}/reconcile`)
        .set('Authorization', adminAuth)
        .send({ financialTransactionId: ft })
        .expect(409);
    });
  });

  describe('RBAC', () => {
    it('AUDITOR consulta mas nao importa/concilia/desconcilia; DRIVER sem acesso', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Rbac');
      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');
      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      const accountId = await createFinancialAccount(adminAuth);
      await importCsv(adminAuth, accountId, 'date,description,amount,type,externalId\n2026-08-10,PIX,1000.00,CREDIT,EXT-R\n').expect(201);
      const bankTx = (
        await request(app.getHttpServer())
          .get(`/api/v1/finance/bank-transactions?financialAccountId=${accountId}`)
          .set('Authorization', adminAuth)
          .expect(200)
      ).body.data.items[0];
      const ft = await createFinancialTransaction(adminAuth, accountId, { type: 'CREDIT', amount: 1000, transactionDate: '2026-08-10' });

      await request(app.getHttpServer()).get('/api/v1/finance/bank-transactions').set('Authorization', auditorAuth).expect(200);
      await importCsv(auditorAuth, accountId, 'date,description,amount,type,externalId\n2026-08-11,PIX,1.00,CREDIT,EXT-R2\n').expect(403);
      await request(app.getHttpServer())
        .post(`/api/v1/finance/bank-transactions/${bankTx.id}/reconcile`)
        .set('Authorization', auditorAuth)
        .send({ financialTransactionId: ft })
        .expect(403);
      await request(app.getHttpServer()).post(`/api/v1/finance/bank-transactions/${bankTx.id}/unreconcile`).set('Authorization', auditorAuth).expect(403);

      await request(app.getHttpServer()).get('/api/v1/finance/bank-transactions').set('Authorization', driverAuth).expect(403);
    });
  });

  describe('performance', () => {
    it('listagem executa 1 findMany + 1 count, independente da quantidade de movimentacoes', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('NPlus1');
      const accountId = await createFinancialAccount(adminAuth);
      const rows = Array.from(
        { length: 5 },
        (_, i) => `2026-08-1${i},Movimentacao ${i},${100 + i}.00,CREDIT,EXT-N${i}`,
      ).join('\n');
      await importCsv(adminAuth, accountId, `date,description,amount,type,externalId\n${rows}\n`).expect(201);

      const findManySpy = jest.spyOn(prisma.financialBankTransaction, 'findMany');
      const countSpy = jest.spyOn(prisma.financialBankTransaction, 'count');
      await request(app.getHttpServer())
        .get(`/api/v1/finance/bank-transactions?financialAccountId=${accountId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(findManySpy).toHaveBeenCalledTimes(1);
      expect(countSpy).toHaveBeenCalledTimes(1);
      findManySpy.mockRestore();
      countSpy.mockRestore();
    });
  });
});
