import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Motoristas, Agregados e Terceiros (Fase 61, e2e)', () => {
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

  function buildCreateTenantPayload(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    return {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `dm-${label.toLowerCase()}-${unique}`,
      admin: { name: `Admin ${label}`, email: `admin-${label.toLowerCase()}-${unique}@teste.com`, password: 'SenhaForte123!' },
    };
  }

  async function createTenantAndLoginAsSuperAdmin(label: string) {
    const payload = buildCreateTenantPayload(label);
    const createRes = await request(app.getHttpServer()).post('/api/v1/tenants').send(payload).expect(201);
    const tenantId: string = createRes.body.data.id;
    createdTenantIds.push(tenantId);

    await prisma.userAccount.update({
      where: { tenantId_email: { tenantId, email: payload.admin.email } },
      data: { role: 'SUPER_ADMIN' },
    });

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

  async function createDriver(auth: string, overrides: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/drivers')
      .set('Authorization', auth)
      .send({
        name: 'Jose da Silva',
        cpf: randomValidCpf(),
        cnhNumber: String(Math.floor(10000000000 + Math.random() * 89999999999)),
        cnhCategory: 'AE',
        cnhExpiresAt: '2027-06-30',
        ...overrides,
      })
      .expect(201);
    return res.body.data as { id: string; type: string; status: string; isActive: boolean };
  }

  async function createVehicle(auth: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/vehicles')
      .set('Authorization', auth)
      .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
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

  async function attemptCreateTrip(auth: string, driverId: string, compositionId: string) {
    const originId = await createLocation(auth, `Origem ${randomUUID()}`);
    const destinationId = await createLocation(auth, `Destino ${randomUUID()}`);
    return request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', auth)
      .send({
        driverId,
        compositionId,
        originLocationId: originId,
        destinationLocationId: destinationId,
        plannedDeparture: '2026-01-01T08:00:00.000Z',
        plannedArrival: '2026-01-02T18:00:00.000Z',
      });
  }

  // ==========================================================================
  // Classificacao (OWN/AGGREGATED/THIRD_PARTY)
  // ==========================================================================
  describe('classificacao operacional', () => {
    it('cria motorista OWN por padrao quando type nao e informado (compatibilidade com cadastros existentes)', async () => {
      const { adminAuth } = await createTenantAndLoginAsSuperAdmin('OwnDefault');
      const driver = await createDriver(adminAuth);
      expect(driver.type).toBe('OWN');
      expect(driver.status).toBe('ACTIVE');
      expect(driver.isActive).toBe(true);
    });

    it('cria motorista AGGREGATED explicitamente', async () => {
      const { adminAuth } = await createTenantAndLoginAsSuperAdmin('Aggregated');
      const driver = await createDriver(adminAuth, { type: 'AGGREGATED' });
      expect(driver.type).toBe('AGGREGATED');
    });

    it('cria motorista THIRD_PARTY explicitamente', async () => {
      const { adminAuth } = await createTenantAndLoginAsSuperAdmin('ThirdParty');
      const driver = await createDriver(adminAuth, { type: 'THIRD_PARTY' });
      expect(driver.type).toBe('THIRD_PARTY');
    });

    it('altera a classificacao via PATCH e audita driver.classification_changed', async () => {
      const { adminAuth } = await createTenantAndLoginAsSuperAdmin('ChangeClass');
      const driver = await createDriver(adminAuth, { type: 'OWN' });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/drivers/${driver.id}`)
        .set('Authorization', adminAuth)
        .send({ type: 'AGGREGATED' })
        .expect(200);
      expect(res.body.data.type).toBe('AGGREGATED');

      const history = await prisma.auditLog.findMany({
        where: { entityName: 'Driver', entityId: driver.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(history.map((h) => h.action)).toContain('driver.classification_changed');
    });
  });

  // ==========================================================================
  // Status operacional (ativacao/suspensao/reativacao)
  // ==========================================================================
  describe('status operacional', () => {
    it('suspende e reativa um motorista, auditando cada transicao distintamente', async () => {
      const { adminAuth } = await createTenantAndLoginAsSuperAdmin('SuspendReactivate');
      const driver = await createDriver(adminAuth);

      const suspended = await request(app.getHttpServer())
        .patch(`/api/v1/drivers/${driver.id}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'SUSPENDED' })
        .expect(200);
      expect(suspended.body.data.status).toBe('SUSPENDED');
      expect(suspended.body.data.isActive).toBe(false);

      const reactivated = await request(app.getHttpServer())
        .patch(`/api/v1/drivers/${driver.id}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'ACTIVE' })
        .expect(200);
      expect(reactivated.body.data.status).toBe('ACTIVE');
      expect(reactivated.body.data.isActive).toBe(true);

      const history = await prisma.auditLog.findMany({
        where: { entityName: 'Driver', entityId: driver.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(history.map((h) => h.action)).toEqual(
        expect.arrayContaining(['driver.created', 'driver.suspended', 'driver.reactivated']),
      );
    });

    it('desativa um motorista (INACTIVE) e audita driver.deactivated', async () => {
      const { adminAuth } = await createTenantAndLoginAsSuperAdmin('Deactivate');
      const driver = await createDriver(adminAuth);

      await request(app.getHttpServer())
        .patch(`/api/v1/drivers/${driver.id}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'INACTIVE' })
        .expect(200);

      const history = await prisma.auditLog.findMany({
        where: { entityName: 'Driver', entityId: driver.id, action: 'driver.deactivated' },
      });
      expect(history).toHaveLength(1);
    });

    it('motorista SUSPENDED nunca pode ser atribuido a uma nova viagem', async () => {
      const { adminAuth } = await createTenantAndLoginAsSuperAdmin('SuspendedTrip');
      const driver = await createDriver(adminAuth);
      const vehicleId = await createVehicle(adminAuth);
      const compositionId = await createComposition(adminAuth, vehicleId);
      await request(app.getHttpServer())
        .patch(`/api/v1/drivers/${driver.id}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'SUSPENDED' })
        .expect(200);

      const res = await attemptCreateTrip(adminAuth, driver.id, compositionId);
      expect([404, 409]).toContain(res.status);
    });

    it('motorista INACTIVE nunca pode ser atribuido a uma nova viagem', async () => {
      const { adminAuth } = await createTenantAndLoginAsSuperAdmin('InactiveTrip');
      const driver = await createDriver(adminAuth);
      const vehicleId = await createVehicle(adminAuth);
      const compositionId = await createComposition(adminAuth, vehicleId);
      await request(app.getHttpServer())
        .patch(`/api/v1/drivers/${driver.id}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'INACTIVE' })
        .expect(200);

      const res = await attemptCreateTrip(adminAuth, driver.id, compositionId);
      expect([404, 409]).toContain(res.status);
    });

    it('viagem historica preserva o motorista mesmo depois de suspende-lo (nunca altera dados historicos)', async () => {
      const { adminAuth } = await createTenantAndLoginAsSuperAdmin('HistoricalTrip');
      const driver = await createDriver(adminAuth);
      const vehicleId = await createVehicle(adminAuth);
      const compositionId = await createComposition(adminAuth, vehicleId);

      const tripRes = await attemptCreateTrip(adminAuth, driver.id, compositionId);
      expect(tripRes.status).toBe(201);
      const tripId = tripRes.body.data.id as string;

      await request(app.getHttpServer())
        .patch(`/api/v1/drivers/${driver.id}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'SUSPENDED' })
        .expect(200);

      const tripAfter = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(tripAfter.body.data.driverId).toBe(driver.id);
    });
  });

  // ==========================================================================
  // Vinculo motorista <-> veiculo
  // ==========================================================================
  describe('vinculo com veiculo', () => {
    it('atribui, troca e encerra o vinculo com veiculo preservando o historico completo', async () => {
      const { adminAuth } = await createTenantAndLoginAsSuperAdmin('VehicleLink');
      const driver = await createDriver(adminAuth);
      const vehicleA = await createVehicle(adminAuth);
      const vehicleB = await createVehicle(adminAuth);

      await request(app.getHttpServer())
        .post(`/api/v1/drivers/${driver.id}/vehicle-assignments`)
        .set('Authorization', adminAuth)
        .send({ vehicleId: vehicleA })
        .expect(201);

      const afterFirst = await request(app.getHttpServer())
        .get(`/api/v1/drivers/${driver.id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(afterFirst.body.data.currentVehicleId).toBe(vehicleA);

      await request(app.getHttpServer())
        .post(`/api/v1/drivers/${driver.id}/vehicle-assignments`)
        .set('Authorization', adminAuth)
        .send({ vehicleId: vehicleB })
        .expect(201);

      const afterSwitch = await request(app.getHttpServer())
        .get(`/api/v1/drivers/${driver.id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(afterSwitch.body.data.currentVehicleId).toBe(vehicleB);

      const history = await request(app.getHttpServer())
        .get(`/api/v1/drivers/${driver.id}/vehicle-assignments`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(history.body.data).toHaveLength(2);
      const vehicleAEntry = history.body.data.find((e: { vehicleId: string }) => e.vehicleId === vehicleA);
      expect(vehicleAEntry.endedAt).not.toBeNull();
      const vehicleBEntry = history.body.data.find((e: { vehicleId: string }) => e.vehicleId === vehicleB);
      expect(vehicleBEntry.endedAt).toBeNull();

      await request(app.getHttpServer())
        .post(`/api/v1/drivers/${driver.id}/vehicle-assignments/end`)
        .set('Authorization', adminAuth)
        .expect(201);

      const afterEnd = await request(app.getHttpServer())
        .get(`/api/v1/drivers/${driver.id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(afterEnd.body.data.currentVehicleId).toBeNull();

      const historyAfterEnd = await request(app.getHttpServer())
        .get(`/api/v1/drivers/${driver.id}/vehicle-assignments`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(historyAfterEnd.body.data).toHaveLength(2);
      expect(historyAfterEnd.body.data.every((e: { endedAt: string | null }) => e.endedAt !== null)).toBe(true);
    });

    it('encerrar vinculo sem nenhum veiculo atribuido retorna 409', async () => {
      const { adminAuth } = await createTenantAndLoginAsSuperAdmin('EndWithoutVehicle');
      const driver = await createDriver(adminAuth);
      await request(app.getHttpServer())
        .post(`/api/v1/drivers/${driver.id}/vehicle-assignments/end`)
        .set('Authorization', adminAuth)
        .expect(409);
    });
  });

  // ==========================================================================
  // Indicadores
  // ==========================================================================
  describe('indicadores (summary)', () => {
    it('reflete contagens corretas por classificacao e status', async () => {
      const { adminAuth } = await createTenantAndLoginAsSuperAdmin('Summary');
      await createDriver(adminAuth, { type: 'OWN' });
      const aggregated = await createDriver(adminAuth, { type: 'AGGREGATED' });
      await createDriver(adminAuth, { type: 'THIRD_PARTY' });
      await request(app.getHttpServer())
        .patch(`/api/v1/drivers/${aggregated.id}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'SUSPENDED' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/drivers/summary')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.totalOwn).toBe(1);
      expect(res.body.data.totalAggregated).toBe(1);
      expect(res.body.data.totalThirdParty).toBe(1);
      expect(res.body.data.totalSuspended).toBe(1);
      expect(res.body.data.totalActive).toBe(2);
    });
  });

  // ==========================================================================
  // Limite de plano (Fase 48) -- classificacao nunca burla o limite
  // ==========================================================================
  describe('limite de plano', () => {
    it('classificacao OWN/AGGREGATED/THIRD_PARTY nunca burla o limite compartilhado de motoristas', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsSuperAdmin('PlanLimit');
      await request(app.getHttpServer())
        .patch(`/api/v1/tenants/${tenantId}/plan`)
        .set('Authorization', adminAuth)
        .send({ maxDrivers: 1 })
        .expect(200);

      await createDriver(adminAuth, { type: 'OWN' });

      await request(app.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', adminAuth)
        .send({
          name: 'Outro Motorista',
          cpf: randomValidCpf(),
          cnhNumber: String(Math.floor(10000000000 + Math.random() * 89999999999)),
          cnhCategory: 'AE',
          cnhExpiresAt: '2027-06-30',
          type: 'AGGREGATED',
        })
        .expect(409);
    });
  });

  // ==========================================================================
  // Isolamento multi-tenant e RBAC
  // ==========================================================================
  describe('isolamento multi-tenant', () => {
    it('motorista de um tenant nunca e acessivel/alteravel por outro tenant', async () => {
      const { adminAuth: authA } = await createTenantAndLoginAsSuperAdmin('TenantA');
      const { adminAuth: authB } = await createTenantAndLoginAsSuperAdmin('TenantB');
      const driver = await createDriver(authA);

      await request(app.getHttpServer())
        .get(`/api/v1/drivers/${driver.id}`)
        .set('Authorization', authB)
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/api/v1/drivers/${driver.id}/status`)
        .set('Authorization', authB)
        .send({ status: 'SUSPENDED' })
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/v1/drivers/${driver.id}/vehicle-assignments`)
        .set('Authorization', authB)
        .expect(404);
    });
  });

  describe('RBAC', () => {
    it('bloqueia DRIVER (role de login) em tudo; AUDITOR le mas nao escreve', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsSuperAdmin('RbacDrivers');
      const driverRoleAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');
      const driver = await createDriver(adminAuth);

      await request(app.getHttpServer())
        .get('/api/v1/drivers')
        .set('Authorization', driverRoleAuth)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/drivers')
        .set('Authorization', auditorAuth)
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/drivers/${driver.id}/status`)
        .set('Authorization', auditorAuth)
        .send({ status: 'SUSPENDED' })
        .expect(403);
    });
  });
});
