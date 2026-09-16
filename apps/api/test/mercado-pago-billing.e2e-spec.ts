import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { BillingLifecycleService } from '../src/billing/services/billing-lifecycle.service';
import { MERCADO_PAGO_PROVIDER } from '../src/mercado-pago/mercado-pago.constants';
import {
  MercadoPagoPayment,
  MercadoPagoPreapproval,
  MercadoPagoProviderPort,
} from '../src/mercado-pago/providers/mercado-pago-provider.interface';
import { PrismaService } from '../src/prisma/prisma.service';

// Fake deterministico via override de DI (mesmo padrao de
// FakeRoutingProvider em routing.e2e-spec.ts, Fase 26) -- exercita 100% da
// integracao real do NOSSO sistema sem depender de rede externa.
class FakeMercadoPagoProvider implements MercadoPagoProviderPort {
  preapprovals = new Map<string, MercadoPagoPreapproval>();
  payments = new Map<string, MercadoPagoPayment>();
  private counter = 0;

  isConfigured(): boolean {
    return true;
  }

  async createPreapproval(input: {
    externalReference: string;
    payerEmail: string;
  }): Promise<MercadoPagoPreapproval> {
    const id = `preapproval-${++this.counter}`;
    const preapproval: MercadoPagoPreapproval = {
      id,
      status: 'pending',
      payerId: null,
      externalReference: input.externalReference,
      initPoint: `https://mercadopago.com/checkout/${id}`,
    };
    this.preapprovals.set(id, preapproval);
    return preapproval;
  }

  async getPreapproval(id: string): Promise<MercadoPagoPreapproval> {
    const preapproval = this.preapprovals.get(id);
    if (!preapproval) throw new Error(`FakeMercadoPagoProvider: preapproval ${id} nao encontrado.`);
    return preapproval;
  }

  async getPayment(id: string): Promise<MercadoPagoPayment> {
    const payment = this.payments.get(id);
    if (!payment) throw new Error(`FakeMercadoPagoProvider: payment ${id} nao encontrado.`);
    return payment;
  }

  // Helpers de teste (Task 8 usa authorize()/enqueuePayment()).
  authorize(preapprovalId: string, payerId = 'payer-1'): void {
    const preapproval = this.preapprovals.get(preapprovalId);
    if (preapproval) this.preapprovals.set(preapprovalId, { ...preapproval, status: 'authorized', payerId });
  }

  setPreapprovalStatus(preapprovalId: string, status: string): void {
    const preapproval = this.preapprovals.get(preapprovalId);
    if (preapproval) this.preapprovals.set(preapprovalId, { ...preapproval, status });
  }

  enqueuePayment(payment: MercadoPagoPayment): void {
    this.payments.set(payment.id, payment);
  }
}

const fakeMercadoPagoProvider = new FakeMercadoPagoProvider();

// Fase Mercado Pago -- cobre self-service (autorizacao), webhook
// (preapproval/pagamento) e a exclusao de assinaturas MERCADO_PAGO do
// scheduler de inadimplencia manual. Sempre contra infraestrutura real
// (app Nest completo + Postgres), mesmo padrao de billing.e2e-spec.ts.
// Nenhuma chamada de rede real ao Mercado Pago -- ver FakeMercadoPagoProvider
// (Task 7) para o override de DI.
describe('Mercado Pago Billing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let lifecycleService: BillingLifecycleService;
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MERCADO_PAGO_PROVIDER)
      .useValue(fakeMercadoPagoProvider)
      .compile();
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
    await prisma.subscriptionPayment
      .deleteMany({ where: { tenantId: { in: createdTenantIds } } })
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
      slug: `mp-${labelSuffix.toLowerCase()}-${unique}`,
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

  async function createTenantWithAdmin(label: string) {
    const payload = buildCreateTenantPayload(label);
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/tenants')
      .send(payload)
      .expect(201);
    const tenantId = createRes.body.data.id;
    createdTenantIds.push(tenantId);

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email: payload.admin.email, password: payload.admin.password })
      .expect(200);

    return { tenantId, adminAccessToken: loginRes.body.data.accessToken as string, adminEmail: payload.admin.email };
  }

  async function loginAsTenantAdmin(tenantId: string) {
    const email = `admin2-${randomUUID().replace(/-/g, '').slice(0, 10)}@teste.com`;
    const password = 'SenhaForte123!';
    await prisma.userAccount.create({
      data: {
        tenantId,
        name: 'Admin Self-Service',
        email,
        passwordHash: await import('argon2').then((argon2) => argon2.hash(password)),
        role: 'ADMIN',
      },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email, password })
      .expect(200);
    return { adminAccessToken: loginRes.body.data.accessToken as string, email };
  }

  function signWebhook(dataId: string, requestId: string, secret: string): { xSignature: string; xRequestId: string } {
    const ts = Math.floor(Date.now() / 1000).toString();
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const hash = createHmac('sha256', secret).update(manifest).digest('hex');
    return { xSignature: `ts=${ts},v1=${hash}`, xRequestId: requestId };
  }

  async function createMercadoPagoSubscription(superAdminAccessToken: string, tenantId: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/billing/subscriptions')
      .set('Authorization', `Bearer ${superAdminAccessToken}`)
      .send({
        tenantId,
        planTier: 'PROFESSIONAL',
        amount: 499.9,
        periodicity: 'MONTHLY',
        paymentMethod: 'MERCADO_PAGO',
        startDate: '2026-01-01',
        dueDay: 10,
      })
      .expect(201);
    return res.body.data;
  }

  describe('BillingLifecycleService.markOverdueSubscriptions', () => {
    it('nunca marca uma assinatura MERCADO_PAGO como OVERDUE (quem decide isso e o proprio Mercado Pago)', async () => {
      const { tenantId, superAdminAccessToken } = await createTenantWithSuperAdmin('LifecycleMp');
      const subscription = await createMercadoPagoSubscription(superAdminAccessToken, tenantId);

      await prisma.tenantSubscription.update({
        where: { id: subscription.id },
        data: { status: 'ACTIVE', nextDueDate: new Date('2020-01-01') },
      });

      await lifecycleService.markOverdueSubscriptions();

      const after = await prisma.tenantSubscription.findUnique({ where: { id: subscription.id } });
      expect(after?.status).toBe('ACTIVE');
    });

    it('continua marcando uma assinatura manual vencida como OVERDUE (regressao)', async () => {
      const { tenantId, superAdminAccessToken } = await createTenantWithSuperAdmin('LifecycleManual');
      const res = await request(app.getHttpServer())
        .post('/api/v1/billing/subscriptions')
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .send({
          tenantId,
          planTier: 'STARTER',
          amount: 199.9,
          periodicity: 'MONTHLY',
          paymentMethod: 'PIX_SCHEDULED',
          startDate: '2026-01-01',
          dueDay: 10,
        })
        .expect(201);
      const subscription = res.body.data;

      await prisma.tenantSubscription.update({
        where: { id: subscription.id },
        data: { status: 'ACTIVE', nextDueDate: new Date('2020-01-01') },
      });

      await lifecycleService.markOverdueSubscriptions();

      const after = await prisma.tenantSubscription.findUnique({ where: { id: subscription.id } });
      expect(after?.status).toBe('OVERDUE');
    });
  });

  describe('Self-service (GET /billing/subscriptions/me, POST .../mercado-pago/authorization)', () => {
    it('tenant ADMIN consulta a propria assinatura', async () => {
      const { tenantId, superAdminAccessToken } = await createTenantWithSuperAdmin('SelfServiceGet');
      await createMercadoPagoSubscription(superAdminAccessToken, tenantId);
      const { adminAccessToken } = await loginAsTenantAdmin(tenantId);

      const res = await request(app.getHttpServer())
        .get('/api/v1/billing/subscriptions/me')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(res.body.data.paymentMethod).toBe('MERCADO_PAGO');
    });

    it('404 quando o tenant nao tem assinatura cadastrada', async () => {
      const { tenantId, adminAccessToken } = await createTenantWithAdmin('SelfServiceNoSub');
      await request(app.getHttpServer())
        .get('/api/v1/billing/subscriptions/me')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(404);
    });

    it('403 quando o usuario e DRIVER', async () => {
      const payload = buildCreateTenantPayload('SelfServiceDriver');
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/tenants')
        .send(payload)
        .expect(201);
      const tenantId = createRes.body.data.id;
      createdTenantIds.push(tenantId);
      await prisma.userAccount.update({
        where: { tenantId_email: { tenantId, email: payload.admin.email } },
        data: { role: 'DRIVER' },
      });
      const driverLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId, email: payload.admin.email, password: payload.admin.password })
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/v1/billing/subscriptions/me')
        .set('Authorization', `Bearer ${driverLogin.body.data.accessToken}`)
        .expect(403);
    });

    it('cria a autorizacao e persiste o externalSubscriptionId', async () => {
      const { tenantId, superAdminAccessToken } = await createTenantWithSuperAdmin('SelfServiceAuth');
      const subscription = await createMercadoPagoSubscription(superAdminAccessToken, tenantId);
      const { adminAccessToken } = await loginAsTenantAdmin(tenantId);

      const res = await request(app.getHttpServer())
        .post('/api/v1/billing/subscriptions/me/mercado-pago/authorization')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(201);

      expect(res.body.data.initPoint).toContain('https://');

      const updated = await prisma.tenantSubscription.findUnique({ where: { id: subscription.id } });
      expect(updated?.externalSubscriptionId).toBeTruthy();
    });

    it('409 quando ja existe uma autorizacao ativa/pendente (idempotencia -- Task 5)', async () => {
      const { tenantId, superAdminAccessToken } = await createTenantWithSuperAdmin('SelfServiceDuplicate');
      await createMercadoPagoSubscription(superAdminAccessToken, tenantId);
      const { adminAccessToken } = await loginAsTenantAdmin(tenantId);

      await request(app.getHttpServer())
        .post('/api/v1/billing/subscriptions/me/mercado-pago/authorization')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(201);

      // FakeMercadoPagoProvider.createPreapproval cria com status inicial
      // 'pending' -- a segunda chamada, sem nenhuma autorizacao real ter
      // acontecido ainda, ja deve ser bloqueada pelo guard de idempotencia
      // (mesmo cenario real de um duplo-clique no botao "Autorizar").
      await request(app.getHttpServer())
        .post('/api/v1/billing/subscriptions/me/mercado-pago/authorization')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(409);
    });

    it('409 quando a assinatura nao esta configurada para Mercado Pago', async () => {
      const { tenantId, superAdminAccessToken } = await createTenantWithSuperAdmin('SelfServiceWrongMethod');
      await request(app.getHttpServer())
        .post('/api/v1/billing/subscriptions')
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .send({
          tenantId,
          planTier: 'STARTER',
          amount: 199.9,
          periodicity: 'MONTHLY',
          paymentMethod: 'PIX_SCHEDULED',
          startDate: '2026-01-01',
          dueDay: 10,
        })
        .expect(201);
      const { adminAccessToken } = await loginAsTenantAdmin(tenantId);

      await request(app.getHttpServer())
        .post('/api/v1/billing/subscriptions/me/mercado-pago/authorization')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(409);
    });
  });

  describe('Webhook (POST /billing/webhooks/mercado-pago)', () => {
    const WEBHOOK_SECRET = 'teste-webhook-secret-32-caracteres';

    it('401 quando a assinatura e invalida', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/billing/webhooks/mercado-pago')
        .set('x-signature', 'ts=123,v1=hash-invalido')
        .set('x-request-id', 'req-invalido')
        .send({ type: 'payment', data: { id: 'payment-invalido' } })
        .expect(401);
    });

    it('preapproval autorizado atualiza a assinatura para ACTIVE', async () => {
      const { tenantId, superAdminAccessToken } = await createTenantWithSuperAdmin('WebhookPreapproval');
      const subscription = await createMercadoPagoSubscription(superAdminAccessToken, tenantId);
      const { adminAccessToken } = await loginAsTenantAdmin(tenantId);
      const authRes = await request(app.getHttpServer())
        .post('/api/v1/billing/subscriptions/me/mercado-pago/authorization')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(201);
      void authRes;

      const updated = await prisma.tenantSubscription.findUnique({ where: { id: subscription.id } });
      const preapprovalId = updated!.externalSubscriptionId!;
      fakeMercadoPagoProvider.authorize(preapprovalId, 'payer-123');

      const { xSignature, xRequestId } = signWebhook(preapprovalId, 'req-preapproval-1', WEBHOOK_SECRET);
      await request(app.getHttpServer())
        .post('/api/v1/billing/webhooks/mercado-pago')
        .set('x-signature', xSignature)
        .set('x-request-id', xRequestId)
        .send({ type: 'preapproval', data: { id: preapprovalId } })
        .expect(200);

      const afterWebhook = await prisma.tenantSubscription.findUnique({ where: { id: subscription.id } });
      expect(afterWebhook?.status).toBe('ACTIVE');
      expect(afterWebhook?.externalCustomerId).toBe('payer-123');
    });

    it('pagamento aprovado cria SubscriptionPayment e avanca nextDueDate', async () => {
      const { tenantId, superAdminAccessToken } = await createTenantWithSuperAdmin('WebhookPayment');
      const subscription = await createMercadoPagoSubscription(superAdminAccessToken, tenantId);
      const originalNextDueDate = new Date(subscription.nextDueDate);

      fakeMercadoPagoProvider.enqueuePayment({
        id: 'payment-1',
        status: 'approved',
        externalReference: tenantId,
        transactionAmount: 499.9,
      });

      const { xSignature, xRequestId } = signWebhook('payment-1', 'req-payment-1', WEBHOOK_SECRET);
      await request(app.getHttpServer())
        .post('/api/v1/billing/webhooks/mercado-pago')
        .set('x-signature', xSignature)
        .set('x-request-id', xRequestId)
        .send({ type: 'payment', data: { id: 'payment-1' } })
        .expect(200);

      const payments = await prisma.subscriptionPayment.findMany({ where: { subscriptionId: subscription.id } });
      expect(payments).toHaveLength(1);
      expect(payments[0].externalPaymentId).toBe('payment-1');
      expect(payments[0].createdBy).toBeNull();

      const updatedSubscription = await prisma.tenantSubscription.findUnique({ where: { id: subscription.id } });
      expect(updatedSubscription?.status).toBe('ACTIVE');
      expect(updatedSubscription!.nextDueDate.getTime()).toBeGreaterThan(originalNextDueDate.getTime());
    });

    it('webhook duplicado (mesmo payment id) nunca cria um segundo SubscriptionPayment', async () => {
      const { tenantId, superAdminAccessToken } = await createTenantWithSuperAdmin('WebhookDuplicate');
      const subscription = await createMercadoPagoSubscription(superAdminAccessToken, tenantId);

      fakeMercadoPagoProvider.enqueuePayment({
        id: 'payment-dup-1',
        status: 'approved',
        externalReference: tenantId,
        transactionAmount: 499.9,
      });

      for (let i = 0; i < 2; i += 1) {
        const { xSignature, xRequestId } = signWebhook('payment-dup-1', `req-dup-${i}`, WEBHOOK_SECRET);
        await request(app.getHttpServer())
          .post('/api/v1/billing/webhooks/mercado-pago')
          .set('x-signature', xSignature)
          .set('x-request-id', xRequestId)
          .send({ type: 'payment', data: { id: 'payment-dup-1' } })
          .expect(200);
      }

      const payments = await prisma.subscriptionPayment.findMany({ where: { subscriptionId: subscription.id } });
      expect(payments).toHaveLength(1);
    });

    it('pagamento com status diferente de approved nunca cria SubscriptionPayment', async () => {
      const { tenantId, superAdminAccessToken } = await createTenantWithSuperAdmin('WebhookRejected');
      const subscription = await createMercadoPagoSubscription(superAdminAccessToken, tenantId);

      fakeMercadoPagoProvider.enqueuePayment({
        id: 'payment-rejected-1',
        status: 'rejected',
        externalReference: tenantId,
        transactionAmount: 499.9,
      });

      const { xSignature, xRequestId } = signWebhook('payment-rejected-1', 'req-rejected-1', WEBHOOK_SECRET);
      await request(app.getHttpServer())
        .post('/api/v1/billing/webhooks/mercado-pago')
        .set('x-signature', xSignature)
        .set('x-request-id', xRequestId)
        .send({ type: 'payment', data: { id: 'payment-rejected-1' } })
        .expect(200);

      const payments = await prisma.subscriptionPayment.findMany({ where: { subscriptionId: subscription.id } });
      expect(payments).toHaveLength(0);
    });
  });
});
