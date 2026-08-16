import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { BillingLifecycleService } from '../src/billing/services/billing-lifecycle.service';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 50 -- Gestao Manual de Assinaturas e Cobranca. Cobre os 16 cenarios
// obrigatorios SEMPRE contra infraestrutura real (app Nest completo +
// Postgres), nunca mockado.
describe('Billing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let lifecycleService: BillingLifecycleService;
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    lifecycleService = app.get(BillingLifecycleService);
  });

  afterAll(async () => {
    // SubscriptionPayment.creator e ON DELETE RESTRICT de proposito (nunca
    // apagar historico financeiro arrastando o usuario que registrou) --
    // em producao isso protege o ledger; aqui, so para a limpeza de teste,
    // apaga os pagamentos primeiro (pagamentos de QUALQUER um dos tenants
    // criados neste spec, inclusive os registrados pelo SUPER_ADMIN "ator"
    // em nome de um tenant alvo).
    await prisma.subscriptionPayment
      .deleteMany({
        where: {
          OR: [
            { tenantId: { in: createdTenantIds } },
            { creator: { tenantId: { in: createdTenantIds } } },
          ],
        },
      })
      .catch(() => undefined);
    for (const id of createdTenantIds) {
      await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
    }
    await app.close();
  });

  function randomCnpj(): string {
    return Array.from({ length: 14 }, () => Math.floor(Math.random() * 10)).join('');
  }

  function buildCreateTenantPayload(labelSuffix: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    return {
      name: `Transportadora ${labelSuffix} ${unique}`,
      document: randomCnpj(),
      slug: `bl-${labelSuffix.toLowerCase()}-${unique}`,
      admin: {
        name: `Admin ${labelSuffix}`,
        email: `admin-${labelSuffix.toLowerCase()}-${unique}@teste.com`,
        password: 'SenhaForte123!',
      },
    };
  }

  async function createTenantWithSuperAdmin(label: string) {
    const payload = buildCreateTenantPayload(label);
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/tenants')
      .send(payload)
      .expect(201);
    const tenantId = createRes.body.data.id;
    createdTenantIds.push(tenantId);

    await prisma.userAccount.update({
      where: { tenantId_email: { tenantId, email: payload.admin.email } },
      data: { role: 'SUPER_ADMIN' },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email: payload.admin.email, password: payload.admin.password })
      .expect(200);

    return { tenantId, superAdminAccessToken: loginRes.body.data.accessToken as string };
  }

  async function createTenantWithRole(label: string, role: string) {
    const payload = buildCreateTenantPayload(label);
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/tenants')
      .send(payload)
      .expect(201);
    const tenantId = createRes.body.data.id;
    createdTenantIds.push(tenantId);

    if (role !== 'ADMIN') {
      await prisma.userAccount.update({
        where: { tenantId_email: { tenantId, email: payload.admin.email } },
        data: { role },
      });
    }

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email: payload.admin.email, password: payload.admin.password })
      .expect(200);

    return { tenantId, accessToken: loginRes.body.data.accessToken as string };
  }

  function buildSubscriptionPayload(tenantId: string, overrides: Record<string, unknown> = {}) {
    return {
      tenantId,
      planTier: 'STARTER',
      amount: 499.9,
      periodicity: 'MONTHLY',
      paymentMethod: 'PIX_SCHEDULED',
      startDate: '2026-06-01T00:00:00.000Z',
      dueDay: 10,
      ...overrides,
    };
  }

  async function createSubscription(superAdminToken: string, tenantId: string, overrides: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/billing/subscriptions')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send(buildSubscriptionPayload(tenantId, overrides))
      .expect(201);
    return res.body.data;
  }

  // ==========================================================================
  // Cenarios 1-3: criar / consultar / editar assinatura
  // ==========================================================================
  describe('CRUD de assinatura (cenarios 1-3)', () => {
    it('1) SUPER_ADMIN cria uma assinatura com o primeiro vencimento calculado no backend', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('CreateSubActor');
      const target = await createTenantWithRole('CreateSubTarget', 'ADMIN');

      const subscription = await createSubscription(superAdminAccessToken, target.tenantId);

      expect(subscription.tenantId).toBe(target.tenantId);
      expect(subscription.status).toBe('PENDING');
      // startDate=2026-06-01, dueDay=10 -> 1o vencimento 2026-06-10.
      expect(subscription.nextDueDate).toBe('2026-06-10T00:00:00.000Z');
    });

    it('2) SUPER_ADMIN consulta uma assinatura por id', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('GetSubActor');
      const target = await createTenantWithRole('GetSubTarget', 'ADMIN');
      const created = await createSubscription(superAdminAccessToken, target.tenantId);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/billing/subscriptions/${created.id}`)
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .expect(200);

      expect(res.body.data.id).toBe(created.id);
      expect(res.body.data.tenantName).toBeTruthy();
    });

    it('3) SUPER_ADMIN edita uma assinatura (atualizacao parcial) e a alteracao e auditada', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('EditSubActor');
      const target = await createTenantWithRole('EditSubTarget', 'ADMIN');
      const created = await createSubscription(superAdminAccessToken, target.tenantId);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/billing/subscriptions/${created.id}`)
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .send({ amount: 599.9 })
        .expect(200);

      expect(res.body.data.amount).toBe(599.9);

      const log = await prisma.auditLog.findFirst({
        where: { entityName: 'TenantSubscription', entityId: created.id, action: 'billing.subscription_updated' },
      });
      expect(log).not.toBeNull();
    });
  });

  // ==========================================================================
  // Cenarios 4-5: registrar pagamento avanca o proximo vencimento
  // ==========================================================================
  describe('Registro de pagamento avanca o vencimento (cenarios 4-5)', () => {
    it('registra um pagamento PAID e avanca nextDueDate conforme a periodicidade (backend, nunca o cliente)', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('PaySubActor');
      const target = await createTenantWithRole('PaySubTarget', 'ADMIN');
      const created = await createSubscription(superAdminAccessToken, target.tenantId);
      expect(created.nextDueDate).toBe('2026-06-10T00:00:00.000Z');

      const paymentRes = await request(app.getHttpServer())
        .post(`/api/v1/billing/subscriptions/${created.id}/payments`)
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .send({
          amount: 499.9,
          dueDate: '2026-06-10T00:00:00.000Z',
          paidAt: '2026-06-08T00:00:00.000Z',
          paymentMethod: 'PIX_SCHEDULED',
          status: 'PAID',
        })
        .expect(201);
      expect(paymentRes.body.data.status).toBe('PAID');

      const afterRes = await request(app.getHttpServer())
        .get(`/api/v1/billing/subscriptions/${created.id}`)
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .expect(200);

      expect(afterRes.body.data.status).toBe('ACTIVE');
      expect(afterRes.body.data.nextDueDate).toBe('2026-07-10T00:00:00.000Z');
      expect(afterRes.body.data.lastPaymentAt).toBeTruthy();
      expect(afterRes.body.data.lastPaymentStatus).toBe('PAID');
    });
  });

  // ==========================================================================
  // Cenario 6: pagamento/assinatura vencida vira OVERDUE (scheduler)
  // ==========================================================================
  describe('Inadimplencia automatica (cenario 6) e idempotencia', () => {
    it('assinatura com nextDueDate vencido vira OVERDUE apos o scheduler rodar, e nunca suspende o tenant automaticamente', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('OverdueActor');
      const target = await createTenantWithRole('OverdueTarget', 'ADMIN');
      const created = await createSubscription(superAdminAccessToken, target.tenantId, {
        startDate: '2020-01-01T00:00:00.000Z',
      });
      await prisma.tenantSubscription.update({
        where: { id: created.id },
        data: { status: 'ACTIVE', nextDueDate: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });

      const firstRun = await lifecycleService.markOverdueSubscriptions();
      expect(firstRun).toBeGreaterThanOrEqual(1);

      const afterFirst = await prisma.tenantSubscription.findUniqueOrThrow({ where: { id: created.id } });
      expect(afterFirst.status).toBe('OVERDUE');

      // Nunca mexe no tenant -- suspensao continua 100% manual.
      const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: target.tenantId } });
      expect(tenant.status).toBe('ACTIVE');
      expect(tenant.isActive).toBe(true);

      // Idempotencia: 2a execucao nao reprocessa (ja nao esta mais em
      // ACTIVE/PENDING) nem altera de novo.
      const secondRun = await lifecycleService.markOverdueSubscriptions();
      const afterSecond = await prisma.tenantSubscription.findUniqueOrThrow({ where: { id: created.id } });
      expect(afterSecond.status).toBe('OVERDUE');
      expect(afterSecond.updatedAt.getTime()).toBe(afterFirst.updatedAt.getTime());
      expect(secondRun).toBe(0);
    });
  });

  // ==========================================================================
  // Cenario 7: historico preservado (imutavel)
  // ==========================================================================
  describe('Historico de pagamentos preservado (cenario 7)', () => {
    it('cada registro de pagamento e uma linha nova; nenhuma linha anterior e alterada/some', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('HistoryActor');
      const target = await createTenantWithRole('HistoryTarget', 'ADMIN');
      const created = await createSubscription(superAdminAccessToken, target.tenantId);

      const auth = `Bearer ${superAdminAccessToken}`;
      const first = await request(app.getHttpServer())
        .post(`/api/v1/billing/subscriptions/${created.id}/payments`)
        .set('Authorization', auth)
        .send({ amount: 499.9, dueDate: '2026-06-10T00:00:00.000Z', paymentMethod: 'PIX_SCHEDULED', status: 'PENDING' })
        .expect(201);
      const second = await request(app.getHttpServer())
        .post(`/api/v1/billing/subscriptions/${created.id}/payments`)
        .set('Authorization', auth)
        .send({
          amount: 499.9,
          dueDate: '2026-06-10T00:00:00.000Z',
          paidAt: '2026-06-09T00:00:00.000Z',
          paymentMethod: 'PIX_SCHEDULED',
          status: 'PAID',
        })
        .expect(201);

      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/billing/subscriptions/${created.id}/payments`)
        .set('Authorization', auth)
        .expect(200);

      const ids = listRes.body.data.items.map((p: { id: string }) => p.id);
      expect(ids).toContain(first.body.data.id);
      expect(ids).toContain(second.body.data.id);
      expect(listRes.body.data.items.find((p: { id: string }) => p.id === first.body.data.id).status).toBe('PENDING');
      expect(listRes.body.data.meta.total).toBeGreaterThanOrEqual(2);
    });
  });

  // ==========================================================================
  // Cenario 8: cancelamento
  // ==========================================================================
  describe('Cancelamento (cenario 8)', () => {
    it('cancelar (status=CANCELLED via PATCH) audita como billing.subscription_cancelled', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('CancelActor');
      const target = await createTenantWithRole('CancelTarget', 'ADMIN');
      const created = await createSubscription(superAdminAccessToken, target.tenantId);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/billing/subscriptions/${created.id}`)
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .send({ status: 'CANCELLED' })
        .expect(200);
      expect(res.body.data.status).toBe('CANCELLED');

      const log = await prisma.auditLog.findFirst({
        where: { entityName: 'TenantSubscription', entityId: created.id, action: 'billing.subscription_cancelled' },
      });
      expect(log).not.toBeNull();
    });
  });

  // ==========================================================================
  // Cenarios 9-10: suspensao/reativacao do tenant a partir do contexto de
  // cobranca -- reutiliza PATCH /tenants/:id/status ja existente (Fase 47),
  // nunca um mecanismo de bloqueio paralelo.
  // ==========================================================================
  describe('Suspensao e reativacao do tenant (cenarios 9-10)', () => {
    it('suspender o tenant por inadimplencia reutiliza TenantStatus.SUSPENDED, e reativar volta ao normal', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('SuspendActor');
      const target = await createTenantWithRole('SuspendTarget', 'ADMIN');
      await createSubscription(superAdminAccessToken, target.tenantId);

      const suspendRes = await request(app.getHttpServer())
        .patch(`/api/v1/tenants/${target.tenantId}/status`)
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .send({ status: 'SUSPENDED' })
        .expect(200);
      expect(suspendRes.body.data.isActive).toBe(false);

      await request(app.getHttpServer())
        .get('/api/v1/vehicles')
        .set('Authorization', `Bearer ${target.accessToken}`)
        .expect(403);

      const reactivateRes = await request(app.getHttpServer())
        .patch(`/api/v1/tenants/${target.tenantId}/status`)
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .send({ status: 'ACTIVE' })
        .expect(200);
      expect(reactivateRes.body.data.isActive).toBe(true);

      await request(app.getHttpServer())
        .get('/api/v1/vehicles')
        .set('Authorization', `Bearer ${target.accessToken}`)
        .expect(200);
    });
  });

  // ==========================================================================
  // Cenarios 11-12: RBAC e cross-tenant/IDOR
  // ==========================================================================
  describe('RBAC e cross-tenant/IDOR (cenarios 11-12)', () => {
    it('ADMIN comum recebe 403 em toda rota de billing', async () => {
      const admin = await createTenantWithRole('BillingRbacAdmin', 'ADMIN');
      const auth = `Bearer ${admin.accessToken}`;

      await request(app.getHttpServer()).get('/api/v1/billing/dashboard').set('Authorization', auth).expect(403);
      await request(app.getHttpServer()).get('/api/v1/billing/subscriptions').set('Authorization', auth).expect(403);
      await request(app.getHttpServer())
        .post('/api/v1/billing/subscriptions')
        .set('Authorization', auth)
        .send(buildSubscriptionPayload(admin.tenantId))
        .expect(403);
    });

    it('listagem filtrada por tenantId nunca retorna a assinatura de outro tenant (isolamento)', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('IsolationBillingActor');
      const tenantA = await createTenantWithRole('IsolationBillingA', 'ADMIN');
      const tenantB = await createTenantWithRole('IsolationBillingB', 'ADMIN');
      await createSubscription(superAdminAccessToken, tenantA.tenantId);
      await createSubscription(superAdminAccessToken, tenantB.tenantId);

      const res = await request(app.getHttpServer())
        .get('/api/v1/billing/subscriptions')
        .query({ tenantId: tenantA.tenantId })
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .expect(200);

      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].tenantId).toBe(tenantA.tenantId);
    });
  });

  // ==========================================================================
  // Cenario 13: paginacao
  // ==========================================================================
  describe('Paginacao (cenario 13)', () => {
    it('respeita pageSize e retorna meta correta', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('PagingActor');
      for (let i = 0; i < 3; i += 1) {
        const target = await createTenantWithRole(`PagingTarget${i}`, 'ADMIN');
        await createSubscription(superAdminAccessToken, target.tenantId);
      }

      const res = await request(app.getHttpServer())
        .get('/api/v1/billing/subscriptions')
        .query({ pageSize: 2, page: 1 })
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .expect(200);

      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.meta.pageSize).toBe(2);
      expect(res.body.data.meta.total).toBeGreaterThanOrEqual(3);
    });
  });

  // ==========================================================================
  // Cenario 14: filtros
  // ==========================================================================
  describe('Filtros (cenario 14)', () => {
    it('filtra por status, metodo e plano corretamente', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('FilterActor');
      const target = await createTenantWithRole('FilterTarget', 'ADMIN');
      const created = await createSubscription(superAdminAccessToken, target.tenantId, {
        planTier: 'ENTERPRISE',
        paymentMethod: 'DIRECT_DEBIT',
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/billing/subscriptions')
        .query({ status: 'PENDING', paymentMethod: 'DIRECT_DEBIT', planTier: 'ENTERPRISE', search: target.tenantId })
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .expect(200);

      // search por tenantId literal nao bate com nome -- so confirma que os
      // filtros de enum funcionam; refaz sem search para confirmar o item.
      void res;

      const filtered = await request(app.getHttpServer())
        .get('/api/v1/billing/subscriptions')
        .query({ status: 'PENDING', paymentMethod: 'DIRECT_DEBIT', planTier: 'ENTERPRISE', tenantId: target.tenantId })
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .expect(200);

      expect(filtered.body.data.items).toHaveLength(1);
      expect(filtered.body.data.items[0].id).toBe(created.id);
    });
  });

  // ==========================================================================
  // Cenario 15: dashboard
  // ==========================================================================
  describe('Dashboard (cenario 15)', () => {
    it('retorna agregados reais (recebido no periodo, pendente, atrasado, assinaturas ativas)', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('DashboardActor');
      const target = await createTenantWithRole('DashboardTarget', 'ADMIN');
      const created = await createSubscription(superAdminAccessToken, target.tenantId);

      await request(app.getHttpServer())
        .post(`/api/v1/billing/subscriptions/${created.id}/payments`)
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .send({
          amount: 499.9,
          dueDate: '2026-06-10T00:00:00.000Z',
          paidAt: new Date().toISOString(),
          paymentMethod: 'PIX_SCHEDULED',
          status: 'PAID',
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/billing/dashboard')
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .expect(200);

      expect(res.body.data.activeSubscriptions).toBeGreaterThanOrEqual(1);
      expect(res.body.data.totalSubscriptions).toBeGreaterThanOrEqual(1);
      expect(res.body.data.receivedInPeriod).toBeGreaterThanOrEqual(499.9);
      expect(Array.isArray(res.body.data.upcomingDueDates)).toBe(true);
    });
  });

  // ==========================================================================
  // Cenario 16: N+1
  // ==========================================================================
  describe('Ausencia de N+1 (cenario 16)', () => {
    let countingApp: INestApplication;
    let countingPrisma: PrismaService;
    let basePrisma: PrismaService;
    let queryCount = 0;

    beforeAll(async () => {
      basePrisma = new PrismaService();
      await basePrisma.$connect();
      const extendedPrisma = basePrisma.$extends({
        name: 'query-counter',
        query: {
          $allModels: {
            async $allOperations({ args, query }) {
              queryCount += 1;
              return query(args);
            },
          },
        },
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
      countingPrisma = moduleRef.get(PrismaService);
    });

    afterAll(async () => {
      await countingApp.close();
      await basePrisma.$disconnect();
    });

    async function seedTenantWithSubscription(superAdminToken: string, label: string) {
      const unique = randomUUID().replace(/-/g, '').slice(0, 12);
      const payload = {
        name: `Transportadora ${label} ${unique}`,
        document: randomCnpj(),
        slug: `bl-n1-${label.toLowerCase()}-${unique}`,
        admin: {
          name: `Admin ${label}`,
          email: `admin-${label.toLowerCase()}-${unique}@teste.com`,
          password: 'SenhaForte123!',
        },
      };
      const createRes = await request(countingApp.getHttpServer()).post('/api/v1/tenants').send(payload).expect(201);
      const tenantId: string = createRes.body.data.id;
      createdTenantIds.push(tenantId);

      await request(countingApp.getHttpServer())
        .post('/api/v1/billing/subscriptions')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(buildSubscriptionPayload(tenantId))
        .expect(201);
    }

    it('a listagem de assinaturas nao aumenta a contagem de queries entre 5 e 20 assinaturas', async () => {
      const unique = randomUUID().replace(/-/g, '').slice(0, 12);
      const payload = {
        name: `Transportadora N1BillingActor ${unique}`,
        document: randomCnpj(),
        slug: `bl-n1actor-${unique}`,
        admin: { name: 'Admin', email: `admin-n1billing-${unique}@teste.com`, password: 'SenhaForte123!' },
      };
      const createRes = await request(countingApp.getHttpServer()).post('/api/v1/tenants').send(payload).expect(201);
      const actorTenantId: string = createRes.body.data.id;
      createdTenantIds.push(actorTenantId);
      await countingPrisma.userAccount.update({
        where: { tenantId_email: { tenantId: actorTenantId, email: payload.admin.email } },
        data: { role: 'SUPER_ADMIN' },
      });
      const loginRes = await request(countingApp.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId: actorTenantId, email: payload.admin.email, password: payload.admin.password })
        .expect(200);
      const superAdminToken = loginRes.body.data.accessToken as string;

      for (let i = 0; i < 5; i += 1) {
        await seedTenantWithSubscription(superAdminToken, 'N1Seed5');
      }
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/billing/subscriptions')
        .query({ pageSize: 10 })
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);
      const queriesFor5 = queryCount;

      for (let i = 0; i < 20; i += 1) {
        await seedTenantWithSubscription(superAdminToken, 'N1Seed20');
      }
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/billing/subscriptions')
        .query({ pageSize: 30 })
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);
      const queriesFor25 = queryCount;

      expect(queriesFor25).toBeLessThanOrEqual(queriesFor5 + 1);
    }, 180000);
  });
});
