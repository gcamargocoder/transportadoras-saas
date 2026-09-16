import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { BillingLifecycleService } from '../src/billing/services/billing-lifecycle.service';
import { PrismaService } from '../src/prisma/prisma.service';

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
});
