import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 78 -- Contas Financeiras, Saldos e Movimentacoes Manuais. Testes
// DIRECIONADOS (secao 22 do pedido): CRUD de conta, saldo inicial/credito/
// debito/calculo, guard de periodo, transferencia (atomica, mesma conta,
// entre tenants, conta inativa), isolamento multi-tenant, RBAC,
// append-only, dashboard, ausencia de N+1, auditoria.
describe('Contas Financeiras (Fase 78, e2e)', () => {
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
      slug: `finaccounts-${label.toLowerCase()}-${unique}`,
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

  function createAccount(auth: string, body: Record<string, unknown>) {
    return request(app.getHttpServer()).post('/api/v1/finance/accounts').set('Authorization', auth).send(body);
  }

  function createTransaction(auth: string, accountId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(`/api/v1/finance/accounts/${accountId}/transactions`)
      .set('Authorization', auth)
      .send(body);
  }

  function openPeriod(auth: string, year: number, month: number) {
    return request(app.getHttpServer()).post('/api/v1/finance/periods').set('Authorization', auth).send({ year, month });
  }

  function closePeriod(auth: string, id: string) {
    return request(app.getHttpServer()).post(`/api/v1/finance/periods/${id}/close`).set('Authorization', auth).send({});
  }

  describe('CRUD de conta', () => {
    it('cria conta BANK e conta CASH, e ambas aparecem na listagem', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Crud');

      const bank = await createAccount(adminAuth, { name: 'Banco X', type: 'BANK', initialBalance: 1000 }).expect(201);
      expect(bank.body.data.type).toBe('BANK');
      expect(bank.body.data.isActive).toBe(true);

      const cash = await createAccount(adminAuth, { name: 'Caixa Loja', type: 'CASH' }).expect(201);
      expect(cash.body.data.type).toBe('CASH');

      const list = await request(app.getHttpServer()).get('/api/v1/finance/accounts').set('Authorization', adminAuth).expect(200);
      expect(list.body.data.items).toHaveLength(2);
    });
  });

  describe('saldo inicial, credito, debito e calculo', () => {
    it('saldo atual = initialBalance + creditos - debitos', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Balance');
      const account = await createAccount(adminAuth, { name: 'Conta Saldo', type: 'BANK', initialBalance: 1000 }).expect(201);
      const accountId = account.body.data.id as string;
      expect(account.body.data.currentBalance).toBe(1000);

      await createTransaction(adminAuth, accountId, {
        type: 'CREDIT',
        amount: 500,
        transactionDate: '2026-08-10',
        description: 'Deposito',
      }).expect(201);
      await createTransaction(adminAuth, accountId, {
        type: 'DEBIT',
        amount: 200,
        transactionDate: '2026-08-11',
        description: 'Saque',
      }).expect(201);

      const detail = await request(app.getHttpServer())
        .get(`/api/v1/finance/accounts/${accountId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(detail.body.data.currentBalance).toBe(1300);

      const txs = await request(app.getHttpServer())
        .get(`/api/v1/finance/accounts/${accountId}/transactions`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(txs.body.data.items).toHaveLength(2);
      expect(txs.body.data.items[0].transactionDate > txs.body.data.items[1].transactionDate).toBe(true);
    });
  });

  describe('protecao por periodo financeiro', () => {
    it('bloqueia movimentacao em periodo CLOSED; permite em OPEN/inexistente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PeriodGuard');
      const account = await createAccount(adminAuth, { name: 'Conta Periodo', type: 'CASH', initialBalance: 0 }).expect(201);
      const accountId = account.body.data.id as string;

      const period = await openPeriod(adminAuth, 2025, 5).expect(201);
      await closePeriod(adminAuth, period.body.data.id).expect(201);

      await createTransaction(adminAuth, accountId, {
        type: 'CREDIT',
        amount: 100,
        transactionDate: '2025-05-10',
        description: 'Bloqueado',
      }).expect(409);

      await createTransaction(adminAuth, accountId, {
        type: 'CREDIT',
        amount: 100,
        transactionDate: '2025-06-10',
        description: 'Permitido (periodo inexistente)',
      }).expect(201);
    });
  });

  describe('transferencia entre contas', () => {
    it('transfere atomicamente (DEBIT na origem, CREDIT no destino)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Transfer');
      const source = await createAccount(adminAuth, { name: 'Origem', type: 'BANK', initialBalance: 1000 }).expect(201);
      const destination = await createAccount(adminAuth, { name: 'Destino', type: 'CASH', initialBalance: 0 }).expect(201);
      const sourceId = source.body.data.id as string;
      const destinationId = destination.body.data.id as string;

      await request(app.getHttpServer())
        .post('/api/v1/finance/transfers')
        .set('Authorization', adminAuth)
        .send({ sourceAccountId: sourceId, destinationAccountId: destinationId, amount: 300, transactionDate: '2026-08-12' })
        .expect(201);

      const sourceDetail = await request(app.getHttpServer())
        .get(`/api/v1/finance/accounts/${sourceId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      const destinationDetail = await request(app.getHttpServer())
        .get(`/api/v1/finance/accounts/${destinationId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(sourceDetail.body.data.currentBalance).toBe(700);
      expect(destinationDetail.body.data.currentBalance).toBe(300);
    });

    it('rejeita origem == destino, sem criar nenhuma movimentacao', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('TransferSame');
      const account = await createAccount(adminAuth, { name: 'Unica', type: 'BANK', initialBalance: 500 }).expect(201);
      const accountId = account.body.data.id as string;

      await request(app.getHttpServer())
        .post('/api/v1/finance/transfers')
        .set('Authorization', adminAuth)
        .send({ sourceAccountId: accountId, destinationAccountId: accountId, amount: 100, transactionDate: '2026-08-12' })
        .expect(400);

      const txs = await request(app.getHttpServer())
        .get(`/api/v1/finance/accounts/${accountId}/transactions`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(txs.body.data.items).toHaveLength(0);
    });

    it('bloqueia transferencia para conta de outro tenant e para conta inativa (sem criar nenhuma ponta)', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('TransferIsolA');
      const tenantB = await createTenantAndLoginAsAdmin('TransferIsolB');
      const sourceA = await createAccount(tenantA.adminAuth, { name: 'Origem A', type: 'BANK', initialBalance: 500 }).expect(201);
      const accountB = await createAccount(tenantB.adminAuth, { name: 'Conta B', type: 'BANK', initialBalance: 0 }).expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/finance/transfers')
        .set('Authorization', tenantA.adminAuth)
        .send({
          sourceAccountId: sourceA.body.data.id,
          destinationAccountId: accountB.body.data.id,
          amount: 100,
          transactionDate: '2026-08-12',
        })
        .expect(404);

      const inactive = await createAccount(tenantA.adminAuth, { name: 'Inativa', type: 'CASH', initialBalance: 0 }).expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/finance/accounts/${inactive.body.data.id}/deactivate`)
        .set('Authorization', tenantA.adminAuth)
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/finance/transfers')
        .set('Authorization', tenantA.adminAuth)
        .send({
          sourceAccountId: sourceA.body.data.id,
          destinationAccountId: inactive.body.data.id,
          amount: 100,
          transactionDate: '2026-08-12',
        })
        .expect(409);

      const txs = await request(app.getHttpServer())
        .get(`/api/v1/finance/accounts/${sourceA.body.data.id}/transactions`)
        .set('Authorization', tenantA.adminAuth)
        .expect(200);
      expect(txs.body.data.items).toHaveLength(0);
    });
  });

  describe('isolamento multi-tenant', () => {
    it('tenant B nunca ve/edita conta ou transacao do tenant A', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolA');
      const tenantB = await createTenantAndLoginAsAdmin('IsolB');
      const account = await createAccount(tenantA.adminAuth, { name: 'Conta A', type: 'BANK', initialBalance: 100 }).expect(201);
      const accountId = account.body.data.id as string;

      await request(app.getHttpServer()).get(`/api/v1/finance/accounts/${accountId}`).set('Authorization', tenantB.adminAuth).expect(404);
      const listB = await request(app.getHttpServer()).get('/api/v1/finance/accounts').set('Authorization', tenantB.adminAuth).expect(200);
      expect(listB.body.data.items).toHaveLength(0);
      await createTransaction(tenantB.adminAuth, accountId, {
        type: 'CREDIT',
        amount: 10,
        transactionDate: '2026-08-12',
        description: 'Invasao',
      }).expect(404);
    });
  });

  describe('RBAC', () => {
    it('AUDITOR le mas nao cria/movimenta; DRIVER nao acessa', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Rbac');
      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');
      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      const account = await createAccount(adminAuth, { name: 'Conta Rbac', type: 'BANK', initialBalance: 100 }).expect(201);
      const accountId = account.body.data.id as string;

      await request(app.getHttpServer()).get('/api/v1/finance/accounts').set('Authorization', auditorAuth).expect(200);
      await createAccount(auditorAuth, { name: 'Bloqueado', type: 'BANK' }).expect(403);
      await createTransaction(auditorAuth, accountId, { type: 'CREDIT', amount: 10, transactionDate: '2026-08-12', description: 'Ajuste teste' }).expect(
        403,
      );

      await request(app.getHttpServer()).get('/api/v1/finance/accounts').set('Authorization', driverAuth).expect(403);
    });
  });

  describe('append-only', () => {
    it('nao existe rota para alterar/excluir uma transacao', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('AppendOnly');
      const account = await createAccount(adminAuth, { name: 'Conta AO', type: 'CASH', initialBalance: 0 }).expect(201);
      const tx = await createTransaction(adminAuth, account.body.data.id, {
        type: 'CREDIT',
        amount: 50,
        transactionDate: '2026-08-12',
        description: 'Ajuste teste',
      }).expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/finance/accounts/${account.body.data.id}/transactions/${tx.body.data.id}`)
        .set('Authorization', adminAuth)
        .send({ amount: 999 })
        .expect(404);
      await request(app.getHttpServer())
        .delete(`/api/v1/finance/accounts/${account.body.data.id}/transactions/${tx.body.data.id}`)
        .set('Authorization', adminAuth)
        .expect(404);
    });
  });

  describe('dashboard', () => {
    it('agrega saldo total/bancario/caixa e contagem de contas ativas/inativas', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Dashboard');
      const bank = await createAccount(adminAuth, { name: 'Banco Dash', type: 'BANK', initialBalance: 1000 }).expect(201);
      await createAccount(adminAuth, { name: 'Caixa Dash', type: 'CASH', initialBalance: 200 }).expect(201);
      const inactive = await createAccount(adminAuth, { name: 'Inativa Dash', type: 'BANK', initialBalance: 50 }).expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/finance/accounts/${inactive.body.data.id}/deactivate`)
        .set('Authorization', adminAuth)
        .expect(201);
      await createTransaction(adminAuth, bank.body.data.id, {
        type: 'CREDIT',
        amount: 100,
        transactionDate: '2026-08-12',
        description: 'Ajuste teste',
      }).expect(201);

      const dashboard = await request(app.getHttpServer())
        .get('/api/v1/finance/accounts/dashboard')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(dashboard.body.data.totalBalance).toBe(1350);
      expect(dashboard.body.data.totalBankBalance).toBe(1150);
      expect(dashboard.body.data.totalCashBalance).toBe(200);
      expect(dashboard.body.data.activeAccounts).toBe(2);
      expect(dashboard.body.data.inactiveAccounts).toBe(1);
    });
  });

  describe('performance', () => {
    it('lista contas com saldo calculado sem N+1 (1 findMany de conta + 1 groupBy de transacao)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('NPlus1');
      for (let i = 0; i < 3; i += 1) {
        const account = await createAccount(adminAuth, { name: `Conta ${i}`, type: 'BANK', initialBalance: 100 }).expect(201);
        await createTransaction(adminAuth, account.body.data.id, {
          type: 'CREDIT',
          amount: 10,
          transactionDate: '2026-08-12',
          description: 'Ajuste teste',
        }).expect(201);
      }

      const findManySpy = jest.spyOn(prisma.financialAccount, 'findMany');
      const groupBySpy = jest.spyOn(prisma.financialTransaction, 'groupBy');

      await request(app.getHttpServer()).get('/api/v1/finance/accounts').set('Authorization', adminAuth).expect(200);

      expect(findManySpy).toHaveBeenCalledTimes(1);
      expect(groupBySpy).toHaveBeenCalledTimes(1);
      findManySpy.mockRestore();
      groupBySpy.mockRestore();
    });
  });

  describe('auditoria', () => {
    it('registra financial_account.created, financial_transaction.created e financial_transfer.created', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Audit');
      const source = await createAccount(adminAuth, { name: 'Origem Audit', type: 'BANK', initialBalance: 500 }).expect(201);
      const destination = await createAccount(adminAuth, { name: 'Destino Audit', type: 'CASH', initialBalance: 0 }).expect(201);
      await createTransaction(adminAuth, source.body.data.id, {
        type: 'CREDIT',
        amount: 20,
        transactionDate: '2026-08-12',
        description: 'Ajuste teste',
      }).expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/finance/transfers')
        .set('Authorization', adminAuth)
        .send({
          sourceAccountId: source.body.data.id,
          destinationAccountId: destination.body.data.id,
          amount: 50,
          transactionDate: '2026-08-12',
        })
        .expect(201);

      const logs = await prisma.auditLog.findMany({ where: { tenantId }, select: { action: true } });
      const actions = logs.map((log) => log.action);
      expect(actions).toEqual(
        expect.arrayContaining(['financial_account.created', 'financial_transaction.created', 'financial_transfer.created']),
      );
    });
  });
});
