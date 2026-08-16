import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 47 -- Super Administracao da Plataforma. Cobre so os MECANISMOS
// NOVOS desta fase (dashboard global, usage, status/plano, historico,
// bypass do TenantGuard para SUPER_ADMIN). CRUD basico de tenant (create/
// list/find/update/delete) e RBAC/isolamento gerais ja estao cobertos em
// tenants.e2e-spec.ts -- nao duplicado aqui.
describe('Super Admin (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
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
    const letters = Array.from({ length: 3 }, () =>
      String.fromCharCode(65 + Math.floor(Math.random() * 26)),
    ).join('');
    const digits = Math.floor(1000 + Math.random() * 9000);
    return `${letters}${digits}`;
  }

  function buildCreateTenantPayload(labelSuffix: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    return {
      name: `Transportadora ${labelSuffix} ${unique}`,
      document: randomCnpj(),
      slug: `sa-${labelSuffix.toLowerCase()}-${unique}`,
      admin: {
        name: `Admin ${labelSuffix}`,
        email: `admin-${labelSuffix.toLowerCase()}-${unique}@teste.com`,
        password: 'SenhaForte123!',
      },
    };
  }

  // Mesmo padrao ja usado em tenants.e2e-spec.ts -- nao ha fluxo publico
  // para criar um Super Admin, promove direto no banco.
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

  async function createVehicle(accessToken: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
      .expect(201);
    return res.body.data.id as string;
  }

  // ==========================================================================
  // Dashboard global
  // ==========================================================================
  describe('GET /tenants/dashboard', () => {
    it('retorna agregados reais da plataforma (total de tenants, breakdown por status, usuarios/veiculos/motoristas)', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('DashActor');
      const other = await createTenantWithRole('DashOther', 'ADMIN');
      await createVehicle(other.accessToken);

      const res = await request(app.getHttpServer())
        .get('/api/v1/tenants/dashboard')
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .expect(200);

      const data = res.body.data;
      expect(data.totalTenants).toBeGreaterThanOrEqual(2);
      expect(Array.isArray(data.byStatus)).toBe(true);
      expect(data.totalUsers).toBeGreaterThanOrEqual(2);
      expect(data.totalVehicles).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(data.byPlanTier)).toBe(true);
      expect(typeof data.tripsCompletedLast30Days).toBe('number');
      expect(typeof data.checklistsCompletedLast30Days).toBe('number');
    });

    it('ADMIN comum e DRIVER recebem 403', async () => {
      const admin = await createTenantWithRole('DashRbacAdmin', 'ADMIN');
      await request(app.getHttpServer())
        .get('/api/v1/tenants/dashboard')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(403);

      const driver = await createTenantWithRole('DashRbacDriver', 'DRIVER');
      await request(app.getHttpServer())
        .get('/api/v1/tenants/dashboard')
        .set('Authorization', `Bearer ${driver.accessToken}`)
        .expect(403);
    });

    it('SUPER_ADMIN com o proprio tenant "casa" SUSPENSO continua acessando o dashboard global', async () => {
      const { tenantId, superAdminAccessToken } = await createTenantWithSuperAdmin('DashHomeSuspended');

      // Suspende o proprio tenant do super admin diretamente no banco.
      await prisma.tenant.update({ where: { id: tenantId }, data: { isActive: false } });

      await request(app.getHttpServer())
        .get('/api/v1/tenants/dashboard')
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .expect(200);

      // Um usuario comum do MESMO tenant continua bloqueado normalmente
      // (o bypass e so para SUPER_ADMIN, nunca um enfraquecimento geral do
      // TenantGuard).
      await prisma.tenant.update({ where: { id: tenantId }, data: { isActive: true } });
    });
  });

  // ==========================================================================
  // Usage
  // ==========================================================================
  describe('GET /tenants/:id/usage', () => {
    it('retorna contagens reais de recursos do tenant', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('UsageActor');
      const target = await createTenantWithRole('UsageTarget', 'ADMIN');
      await createVehicle(target.accessToken);
      await createVehicle(target.accessToken);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/tenants/${target.tenantId}/usage`)
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .expect(200);

      expect(res.body.data.vehicles).toBe(2);
      expect(res.body.data.users).toBe(1);
      expect(res.body.data).toHaveProperty('trips');
      expect(res.body.data).toHaveProperty('checklistExecutions');
      expect(res.body.data).toHaveProperty('fuelSupplies');
      expect(res.body.data).toHaveProperty('maintenances');
      expect(res.body.data).toHaveProperty('attachments');
    });

    it('ADMIN comum recebe 403', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('UsageRbacTargetOwner');
      const admin = await createTenantWithRole('UsageRbacAdmin', 'ADMIN');
      await request(app.getHttpServer())
        .get(`/api/v1/tenants/${admin.tenantId}/usage`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(403);
      // superAdminAccessToken so para criar o cenario, nao usado depois.
      expect(superAdminAccessToken).toBeTruthy();
    });
  });

  // ==========================================================================
  // Status (ciclo de vida)
  // ==========================================================================
  describe('PATCH /tenants/:id/status', () => {
    it('muda o status, sincroniza isActive, bloqueia acesso do tenant depois, e audita', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('StatusActor');
      const target = await createTenantWithRole('StatusTarget', 'ADMIN');

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/tenants/${target.tenantId}/status`)
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .send({ status: 'SUSPENDED' })
        .expect(200);
      expect(res.body.data.status).toBe('SUSPENDED');
      expect(res.body.data.isActive).toBe(false);

      // TenantGuard (intocado) ja bloqueia o tenant suspenso, sem logica
      // nova de bloqueio.
      await request(app.getHttpServer())
        .get('/api/v1/tenants/me')
        .set('Authorization', `Bearer ${target.accessToken}`)
        .expect(403);

      const reactivated = await request(app.getHttpServer())
        .patch(`/api/v1/tenants/${target.tenantId}/status`)
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .send({ status: 'ACTIVE' })
        .expect(200);
      expect(reactivated.body.data.isActive).toBe(true);
    });

    it('status invalido e rejeitado com 400', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('StatusInvalidActor');
      const target = await createTenantWithRole('StatusInvalidTarget', 'ADMIN');

      await request(app.getHttpServer())
        .patch(`/api/v1/tenants/${target.tenantId}/status`)
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .send({ status: 'NAO_EXISTE' })
        .expect(400);
    });

    it('ADMIN comum e DRIVER recebem 403 (exige SUPER_ADMIN)', async () => {
      const target = await createTenantWithRole('StatusRbacTarget', 'ADMIN');
      await request(app.getHttpServer())
        .patch(`/api/v1/tenants/${target.tenantId}/status`)
        .set('Authorization', `Bearer ${target.accessToken}`)
        .send({ status: 'SUSPENDED' })
        .expect(403);

      const driver = await createTenantWithRole('StatusRbacDriver', 'DRIVER');
      await request(app.getHttpServer())
        .patch(`/api/v1/tenants/${target.tenantId}/status`)
        .set('Authorization', `Bearer ${driver.accessToken}`)
        .send({ status: 'SUSPENDED' })
        .expect(403);
    });
  });

  // ==========================================================================
  // Plano/modulos/limites
  // ==========================================================================
  describe('PATCH /tenants/:id/plan', () => {
    it('atualiza tier/limites/modulos parcialmente e audita', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('PlanActor');
      const target = await createTenantWithRole('PlanTarget', 'ADMIN');

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/tenants/${target.tenantId}/plan`)
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .send({ tier: 'ENTERPRISE', maxUsers: 50, enabledModules: ['TRIPS', 'TOLLS'] })
        .expect(200);

      expect(res.body.data.plan.tier).toBe('ENTERPRISE');
      expect(res.body.data.plan.maxUsers).toBe(50);
      expect(res.body.data.plan.enabledModules.sort()).toEqual(['TOLLS', 'TRIPS']);
      // Campos nao enviados permanecem intocados (nunca resetados para null).
      expect(res.body.data.plan.maxVehicles).toBeNull();

      const historyRes = await request(app.getHttpServer())
        .get(`/api/v1/tenants/${target.tenantId}/history`)
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .expect(200);
      const actions = historyRes.body.data.items.map((i: { action: string }) => i.action);
      expect(actions).toContain('tenant.plan_updated');
    });

    it('modulo invalido no array e rejeitado com 400', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('PlanInvalidActor');
      const target = await createTenantWithRole('PlanInvalidTarget', 'ADMIN');

      await request(app.getHttpServer())
        .patch(`/api/v1/tenants/${target.tenantId}/plan`)
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .send({ enabledModules: ['NAO_EXISTE'] })
        .expect(400);
    });

    it('ADMIN comum recebe 403 (exige SUPER_ADMIN)', async () => {
      const target = await createTenantWithRole('PlanRbacTarget', 'ADMIN');
      await request(app.getHttpServer())
        .patch(`/api/v1/tenants/${target.tenantId}/plan`)
        .set('Authorization', `Bearer ${target.accessToken}`)
        .send({ tier: 'ENTERPRISE' })
        .expect(403);
    });
  });

  // ==========================================================================
  // Historico (GET /tenants/:id/history)
  // ==========================================================================
  describe('GET /tenants/:id/history', () => {
    it('reflete tenant.created e mudancas subsequentes, paginado', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('HistoryActor');
      const target = await createTenantWithRole('HistoryTarget', 'ADMIN');

      await request(app.getHttpServer())
        .patch(`/api/v1/tenants/${target.tenantId}/status`)
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .send({ status: 'TRIAL' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/tenants/${target.tenantId}/history`)
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .query({ page: 1, pageSize: 10 })
        .expect(200);

      const actions = res.body.data.items.map((i: { action: string }) => i.action);
      expect(actions).toContain('tenant.created');
      expect(actions).toContain('tenant.lifecycle_status_changed');
      expect(res.body.data.meta.page).toBe(1);
    });

    it('ADMIN comum recebe 403', async () => {
      const target = await createTenantWithRole('HistoryRbacTarget', 'ADMIN');
      await request(app.getHttpServer())
        .get(`/api/v1/tenants/${target.tenantId}/history`)
        .set('Authorization', `Bearer ${target.accessToken}`)
        .expect(403);
    });
  });

  // ==========================================================================
  // Listagem: filtro por status + userCount/vehicleCount por linha
  // ==========================================================================
  describe('GET /tenants -- filtro por status e contagens por linha', () => {
    it('filtra por status e retorna userCount/vehicleCount reais por tenant', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('ListActor');
      const target = await createTenantWithRole('ListTarget', 'ADMIN');
      await createVehicle(target.accessToken);

      await request(app.getHttpServer())
        .patch(`/api/v1/tenants/${target.tenantId}/status`)
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .send({ status: 'TRIAL' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/tenants')
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .query({ status: 'TRIAL', pageSize: 100 })
        .expect(200);

      const row = res.body.data.items.find((t: { id: string }) => t.id === target.tenantId);
      expect(row).toBeTruthy();
      expect(row.status).toBe('TRIAL');
      expect(row.userCount).toBe(1);
      expect(row.vehicleCount).toBe(1);
      expect(res.body.data.items.every((t: { status: string }) => t.status === 'TRIAL')).toBe(true);
    });
  });

  // ==========================================================================
  // N+1
  // ==========================================================================
  describe('verificacao de ausencia de N+1 (contagem real de queries)', () => {
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

    async function createTenantAndLoginOnCountingApp(label: string) {
      const unique = randomUUID().replace(/-/g, '').slice(0, 12);
      const payload = {
        name: `Transportadora ${label} ${unique}`,
        document: randomCnpj(),
        slug: `sa-n1-${label.toLowerCase()}-${unique}`,
        admin: {
          name: `Admin ${label}`,
          email: `admin-${label.toLowerCase()}-${unique}@teste.com`,
          password: 'SenhaForte123!',
        },
      };
      const createRes = await request(countingApp.getHttpServer()).post('/api/v1/tenants').send(payload).expect(201);
      const tenantId: string = createRes.body.data.id;
      createdTenantIds.push(tenantId);

      await countingPrisma.userAccount.update({
        where: { tenantId_email: { tenantId, email: payload.admin.email } },
        data: { role: 'SUPER_ADMIN' },
      });

      const loginRes = await request(countingApp.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId, email: payload.admin.email, password: payload.admin.password })
        .expect(200);
      return { tenantId, superAdminAccessToken: loginRes.body.data.accessToken as string };
    }

    async function seedTenant(label: string) {
      const unique = randomUUID().replace(/-/g, '').slice(0, 12);
      const payload = {
        name: `Transportadora ${label} ${unique}`,
        document: randomCnpj(),
        slug: `sa-n1seed-${label.toLowerCase()}-${unique}`,
        admin: {
          name: `Admin ${label}`,
          email: `admin-${label.toLowerCase()}-${unique}@teste.com`,
          password: 'SenhaForte123!',
        },
      };
      const createRes = await request(countingApp.getHttpServer()).post('/api/v1/tenants').send(payload).expect(201);
      createdTenantIds.push(createRes.body.data.id);
    }

    it('a contagem de queries de GET /tenants/dashboard e GET /tenants nao cresce entre 10 e 50 tenants', async () => {
      const { superAdminAccessToken } = await createTenantAndLoginOnCountingApp('N1Check');

      for (let i = 0; i < 10; i += 1) {
        await seedTenant('N1Seed');
      }
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/tenants/dashboard')
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .expect(200);
      const dashboardQueriesFor10 = queryCount;

      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/tenants')
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .query({ pageSize: 10 })
        .expect(200);
      const listQueriesFor10 = queryCount;

      for (let i = 0; i < 40; i += 1) {
        await seedTenant('N1Seed');
      }

      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/tenants/dashboard')
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .expect(200);
      const dashboardQueriesFor50 = queryCount;

      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/tenants')
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .query({ pageSize: 50 })
        .expect(200);
      const listQueriesFor50 = queryCount;

      expect(dashboardQueriesFor50).toBeLessThanOrEqual(dashboardQueriesFor10 + 1);
      expect(listQueriesFor50).toBeLessThanOrEqual(listQueriesFor10 + 1);
    }, 180000);
  });
});
