import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantLifecycleService } from '../src/tenants/services/tenant-lifecycle.service';

// Fase 49 -- Ciclo de Vida do Tenant e Trial. Cobre os 12 cenarios do
// pedido SEMPRE contra infraestrutura real (app Nest completo + Postgres),
// nunca mockado. Datas de trial sao manipuladas diretamente no banco (nunca
// sleep real) -- a "autoridade de tempo" testada e sempre o backend.
describe('Tenant Lifecycle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let lifecycleService: TenantLifecycleService;
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
    lifecycleService = app.get(TenantLifecycleService);
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

  function buildCreateTenantPayload(labelSuffix: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    return {
      name: `Transportadora ${labelSuffix} ${unique}`,
      document: randomCnpj(),
      slug: `tl-${labelSuffix.toLowerCase()}-${unique}`,
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

    return { tenantId, accessToken: loginRes.body.data.accessToken as string, email: payload.admin.email, password: payload.admin.password };
  }

  async function changeStatus(superAdminAccessToken: string, tenantId: string, status: string) {
    return request(app.getHttpServer())
      .patch(`/api/v1/tenants/${tenantId}/status`)
      .set('Authorization', `Bearer ${superAdminAccessToken}`)
      .send({ status })
      .expect(200);
  }

  async function setTrialEndsAtInPast(tenantId: string, daysAgo: number) {
    const trialEndsAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    await prisma.tenantPlan.update({ where: { tenantId }, data: { trialEndsAt } });
  }

  // ==========================================================================
  // Cenarios 1, 5: TRIAL e ACTIVE funcionam normalmente
  // ==========================================================================
  describe('TRIAL e ACTIVE funcionam normalmente (cenarios 1, 5)', () => {
    it('tenant em TRIAL opera normalmente (leitura/escrita permitidas)', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('TrialOkActor');
      const target = await createTenantWithRole('TrialOkTarget', 'ADMIN');
      await changeStatus(superAdminAccessToken, target.tenantId, 'TRIAL');

      await request(app.getHttpServer())
        .get('/api/v1/vehicles')
        .set('Authorization', `Bearer ${target.accessToken}`)
        .expect(200);
    });

    it('tenant ACTIVE (default) continua funcionando normalmente', async () => {
      const target = await createTenantWithRole('ActiveOkTarget', 'ADMIN');
      await request(app.getHttpServer())
        .get('/api/v1/vehicles')
        .set('Authorization', `Bearer ${target.accessToken}`)
        .expect(200);
    });
  });

  // ==========================================================================
  // Cenarios 2, 3: trial vencido + scheduler transforma TRIAL -> EXPIRED
  // ==========================================================================
  describe('Trial vencido e scheduler (cenarios 2, 3)', () => {
    it('trial vencido continua liberado ate o scheduler rodar, e bloqueado depois', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('TrialExpireActor');
      const target = await createTenantWithRole('TrialExpireTarget', 'ADMIN');
      await changeStatus(superAdminAccessToken, target.tenantId, 'TRIAL');
      await setTrialEndsAtInPast(target.tenantId, 1);

      // Status ainda e TRIAL no banco (scheduler nao rodou ainda) -- ainda
      // libera acesso, comportamento nao muda so por a data ter passado.
      await request(app.getHttpServer())
        .get('/api/v1/vehicles')
        .set('Authorization', `Bearer ${target.accessToken}`)
        .expect(200);

      const expiredCount = await lifecycleService.expireOverdueTrials();
      expect(expiredCount).toBeGreaterThanOrEqual(1);

      const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: target.tenantId } });
      expect(tenant.status).toBe('EXPIRED');
      expect(tenant.isActive).toBe(false);

      // Precisa logar de novo -- o access token antigo pode estar valido,
      // mas o TenantGuard reavalia isActive a cada requisicao.
      await request(app.getHttpServer())
        .get('/api/v1/vehicles')
        .set('Authorization', `Bearer ${target.accessToken}`)
        .expect(403);
    });

    it('scheduler nao altera tenants TRIAL cujo trialEndsAt ainda nao venceu', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('TrialNotYetActor');
      const target = await createTenantWithRole('TrialNotYetTarget', 'ADMIN');
      await changeStatus(superAdminAccessToken, target.tenantId, 'TRIAL');
      // Sem setTrialEndsAtInPast -- trialEndsAt fica no default (14 dias no futuro).

      await lifecycleService.expireOverdueTrials();

      const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: target.tenantId } });
      expect(tenant.status).toBe('TRIAL');
      expect(tenant.isActive).toBe(true);
    });
  });

  // ==========================================================================
  // Cenario 4: idempotencia
  // ==========================================================================
  describe('Idempotencia da expiracao automatica (cenario 4)', () => {
    it('executar o scheduler 2x nao reprocessa nem altera de novo o mesmo tenant', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('IdempotentActor');
      const target = await createTenantWithRole('IdempotentTarget', 'ADMIN');
      await changeStatus(superAdminAccessToken, target.tenantId, 'TRIAL');
      await setTrialEndsAtInPast(target.tenantId, 1);

      const firstRun = await lifecycleService.expireOverdueTrials();
      expect(firstRun).toBeGreaterThanOrEqual(1);
      const afterFirst = await prisma.tenant.findUniqueOrThrow({ where: { id: target.tenantId } });
      expect(afterFirst.status).toBe('EXPIRED');

      const secondRun = await lifecycleService.expireOverdueTrials();
      const afterSecond = await prisma.tenant.findUniqueOrThrow({ where: { id: target.tenantId } });

      // Tenant ja EXPIRED nao e mais elegivel (where filtra status: 'TRIAL')
      // -- segunda execucao nao o re-conta nem altera updatedAt de novo.
      expect(afterSecond.status).toBe('EXPIRED');
      expect(afterSecond.updatedAt.getTime()).toBe(afterFirst.updatedAt.getTime());
      expect(secondRun).toBe(0);
    });
  });

  // ==========================================================================
  // Cenarios 6, 7: SUSPENDED e EXPIRED bloqueiam
  // ==========================================================================
  describe('SUSPENDED e EXPIRED bloqueiam o acesso operacional (cenarios 6, 7)', () => {
    it('tenant SUSPENDED nao consegue operar', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('SuspendedActor');
      const target = await createTenantWithRole('SuspendedTarget', 'ADMIN');
      await changeStatus(superAdminAccessToken, target.tenantId, 'SUSPENDED');

      await request(app.getHttpServer())
        .get('/api/v1/vehicles')
        .set('Authorization', `Bearer ${target.accessToken}`)
        .expect(403);
    });

    it('tenant EXPIRED (manual) nao consegue criar novos registros nem operar', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('ExpiredActor');
      const target = await createTenantWithRole('ExpiredTarget', 'ADMIN');
      await changeStatus(superAdminAccessToken, target.tenantId, 'EXPIRED');

      await request(app.getHttpServer())
        .get('/api/v1/vehicles')
        .set('Authorization', `Bearer ${target.accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${target.accessToken}`)
        .send({ plate: 'ABC1234', brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
        .expect(403);
    });

    it('dados existentes nao sao apagados ao expirar (so o acesso e bloqueado)', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('ExpiredKeepsDataActor');
      const target = await createTenantWithRole('ExpiredKeepsDataTarget', 'ADMIN');

      const vehicleRes = await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${target.accessToken}`)
        .send({ plate: 'XYZ9876', brand: 'Scania', model: 'R450', type: 'TRACTOR_UNIT' })
        .expect(201);

      await changeStatus(superAdminAccessToken, target.tenantId, 'EXPIRED');

      const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleRes.body.data.id } });
      expect(vehicle).not.toBeNull();
      expect(vehicle!.deletedAt).toBeNull();
    });
  });

  // ==========================================================================
  // Cenario 8: SUPER_ADMIN continua acessando/administrando
  // ==========================================================================
  describe('SUPER_ADMIN nunca e bloqueado por status do tenant (cenario 8)', () => {
    it('SUPER_ADMIN continua conseguindo ver/administrar um tenant EXPIRED', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('SuperAdminOverExpiredActor');
      const target = await createTenantWithRole('SuperAdminOverExpiredTarget', 'ADMIN');
      await changeStatus(superAdminAccessToken, target.tenantId, 'EXPIRED');

      const res = await request(app.getHttpServer())
        .get(`/api/v1/tenants/${target.tenantId}`)
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .expect(200);
      expect(res.body.data.status).toBe('EXPIRED');
    });
  });

  // ==========================================================================
  // Cenario 9: RBAC
  // ==========================================================================
  describe('RBAC da mudanca de status (cenario 9)', () => {
    it('ADMIN comum recebe 403 ao tentar alterar o status do proprio tenant', async () => {
      const target = await createTenantWithRole('StatusRbacTarget', 'ADMIN');
      await request(app.getHttpServer())
        .patch(`/api/v1/tenants/${target.tenantId}/status`)
        .set('Authorization', `Bearer ${target.accessToken}`)
        .send({ status: 'SUSPENDED' })
        .expect(403);
    });
  });

  // ==========================================================================
  // Cenario 10: isolamento entre tenants
  // ==========================================================================
  describe('Isolamento entre tenants (cenario 10)', () => {
    it('tenant B nao e afetado quando o tenant A expira', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('IsolationLifecycleActor');
      const tenantA = await createTenantWithRole('IsolationLifecycleA', 'ADMIN');
      const tenantB = await createTenantWithRole('IsolationLifecycleB', 'ADMIN');
      await changeStatus(superAdminAccessToken, tenantA.tenantId, 'EXPIRED');

      await request(app.getHttpServer())
        .get('/api/v1/vehicles')
        .set('Authorization', `Bearer ${tenantA.accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/v1/vehicles')
        .set('Authorization', `Bearer ${tenantB.accessToken}`)
        .expect(200);
    });
  });

  // ==========================================================================
  // Cenario 11: manipulacao direta da API nao contorna
  // ==========================================================================
  describe('Manipulacao direta da API nao contorna o lifecycle (cenario 11)', () => {
    it('chamar uma rota gateada por modulo diretamente com tenant EXPIRED ainda retorna 403 do TenantGuard', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('DirectApiLifecycleActor');
      const target = await createTenantWithRole('DirectApiLifecycleTarget', 'ADMIN');
      await changeStatus(superAdminAccessToken, target.tenantId, 'EXPIRED');

      const res = await request(app.getHttpServer())
        .get('/api/v1/tires')
        .set('Authorization', `Bearer ${target.accessToken}`)
        .expect(403);
      expect(res.body.message).toMatch(/inativa/i);
    });
  });

  // ==========================================================================
  // Cenario 12: dados de lifecycle expostos para o frontend
  // ==========================================================================
  describe('GET /tenants/me expoe dados de lifecycle (cenario 12)', () => {
    it('retorna status, trialStartedAt, trialEndsAt, trialDaysRemaining e trialExpiringSoon corretos', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('LifecycleDataActor');
      const target = await createTenantWithRole('LifecycleDataTarget', 'ADMIN');
      await changeStatus(superAdminAccessToken, target.tenantId, 'TRIAL');
      await prisma.tenantPlan.update({
        where: { tenantId: target.tenantId },
        data: { trialEndsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/tenants/me')
        .set('Authorization', `Bearer ${target.accessToken}`)
        .expect(200);

      expect(res.body.data.status).toBe('TRIAL');
      expect(res.body.data.plan.trialStartedAt).toBeTruthy();
      expect(res.body.data.plan.trialEndsAt).toBeTruthy();
      expect(res.body.data.plan.trialDaysRemaining).toBe(2);
      expect(res.body.data.plan.trialExpiringSoon).toBe(true);
    });
  });

  // ==========================================================================
  // N+1
  // ==========================================================================
  describe('expireOverdueTrials nao tem N+1 (cenario de performance)', () => {
    let countingApp: INestApplication;
    let countingLifecycleService: TenantLifecycleService;
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
      await countingApp.init();
      countingLifecycleService = moduleRef.get(TenantLifecycleService);
    });

    afterAll(async () => {
      await countingApp.close();
      await basePrisma.$disconnect();
    });

    async function seedOverdueTrialTenant(label: string) {
      const unique = randomUUID().replace(/-/g, '').slice(0, 12);
      const payload = {
        name: `Transportadora ${label} ${unique}`,
        document: randomCnpj(),
        slug: `tl-n1-${label.toLowerCase()}-${unique}`,
        admin: {
          name: `Admin ${label}`,
          email: `admin-${label.toLowerCase()}-${unique}@teste.com`,
          password: 'SenhaForte123!',
        },
      };
      const createRes = await request(app.getHttpServer()).post('/api/v1/tenants').send(payload).expect(201);
      const tenantId: string = createRes.body.data.id;
      createdTenantIds.push(tenantId);
      await prisma.tenant.update({ where: { id: tenantId }, data: { status: 'TRIAL' } });
      await prisma.tenantPlan.update({
        where: { tenantId },
        data: { trialStartedAt: new Date(), trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });
    }

    it('a contagem de queries nao cresce entre 5 e 20 tenants vencidos', async () => {
      for (let i = 0; i < 5; i += 1) {
        await seedOverdueTrialTenant('N1Seed5');
      }
      queryCount = 0;
      const countFor5 = await countingLifecycleService.expireOverdueTrials();
      const queriesFor5 = queryCount;
      expect(countFor5).toBeGreaterThanOrEqual(5);

      for (let i = 0; i < 20; i += 1) {
        await seedOverdueTrialTenant('N1Seed20');
      }
      queryCount = 0;
      const countFor20 = await countingLifecycleService.expireOverdueTrials();
      const queriesFor20 = queryCount;
      expect(countFor20).toBeGreaterThanOrEqual(20);

      // Sempre 2 queries (1 findMany + 1 updateMany), nunca 1 por tenant.
      expect(queriesFor5).toBeLessThanOrEqual(2);
      expect(queriesFor20).toBeLessThanOrEqual(2);
    }, 120000);
  });
});
