import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Iteracao de redesign visual -- composicao da frota (GET
// /fleet-operations/vehicles). vehiclesOnTrip/vehiclesAvailable reaproveitam
// EXATAMENTE a mesma logica ja coberta pelo fixture de
// fleet-operations.e2e-spec.ts (dashboard.overview.vehiclesOnTrip) --
// extraida para countVehiclesOnTrip(), nao reimplementada aqui; este arquivo
// so cobre o que e genuinamente novo (tipo/combustivel/frota/idade/odometro).
describe('Fleet Operations Vehicles Overview (e2e)', () => {
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

  async function createTenantAndLoginAsAdmin(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    const payload = {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `veh-fops-${label.toLowerCase()}-${unique}`,
      admin: {
        name: `Admin ${label}`,
        email: `admin-${label.toLowerCase()}-${unique}@teste.com`,
        password: 'SenhaForte123!',
      },
    };

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/tenants')
      .send(payload)
      .expect(201);
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

  async function createFleet(auth: string, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/fleets')
      .set('Authorization', auth)
      .send({ name: `Frota ${randomUUID()}`, type: 'OWN', ...overrides })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createVehicle(auth: string, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/vehicles')
      .set('Authorization', auth)
      .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT', ...overrides })
      .expect(201);
    return res.body.data.id as string;
  }

  // ==========================================================================
  // Estado vazio
  // ==========================================================================
  describe('estado vazio', () => {
    it('retorna contagens zeradas, medias indisponiveis e listas vazias (nunca NaN)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Empty');

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/vehicles')
        .set('Authorization', adminAuth)
        .expect(200);
      const data = res.body.data;

      expect(data).toMatchObject({
        totalVehicles: 0,
        activeCount: 0,
        inactiveCount: 0,
        maintenanceCount: 0,
        soldCount: 0,
        vehiclesOnTrip: 0,
        vehiclesAvailable: 0,
      });
      expect(data.byType).toEqual([]);
      expect(data.byStatus).toEqual([]);
      expect(data.byFuelType).toEqual([]);
      expect(data.byFleet).toEqual([]);
      expect(data.averageAgeYears).toMatchObject({ value: null, available: false, reason: 'NO_VEHICLE_WITH_MANUFACTURE_YEAR' });
      expect(data.averageOdometerKm).toMatchObject({ value: null, available: false, reason: 'NO_VEHICLE_WITH_ODOMETER' });
      expect(data.oldestVehicles).toEqual([]);
      expect(data.newestVehicles).toEqual([]);
      expect(data.topVehiclesByOdometer).toEqual([]);
    });
  });

  // ==========================================================================
  // Composicao real: status/tipo/combustivel/frota (com "Sem frota")
  // ==========================================================================
  describe('composicao real da frota', () => {
    it('conta corretamente por status/tipo/combustivel/frota', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Composition');
      const fleetA = await createFleet(adminAuth, { name: 'Frota SP' });

      await createVehicle(adminAuth, { type: 'TRACTOR_UNIT', fuelType: 'DIESEL_S10', fleetId: fleetA });
      await createVehicle(adminAuth, { type: 'TRACTOR_UNIT', fuelType: 'DIESEL_S10', fleetId: fleetA });
      const truckId = await createVehicle(adminAuth, { type: 'TRUCK', fuelType: 'DIESEL' }); // sem frota
      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${truckId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'MAINTENANCE' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/vehicles')
        .set('Authorization', adminAuth)
        .expect(200);
      const data = res.body.data;

      expect(data.totalVehicles).toBe(3);
      expect(data.activeCount).toBe(2);
      expect(data.maintenanceCount).toBe(1);
      expect(data.vehiclesOnTrip).toBe(0);
      expect(data.vehiclesAvailable).toBe(2); // 2 ACTIVE, nenhum em viagem

      const byType = data.byType as { type: string; count: number }[];
      expect(byType.find((t) => t.type === 'TRACTOR_UNIT')?.count).toBe(2);
      expect(byType.find((t) => t.type === 'TRUCK')?.count).toBe(1);

      const byFuelType = data.byFuelType as { fuelType: string; count: number }[];
      expect(byFuelType.find((f) => f.fuelType === 'DIESEL_S10')?.count).toBe(2);
      expect(byFuelType.find((f) => f.fuelType === 'DIESEL')?.count).toBe(1);

      const byFleet = data.byFleet as { fleetId: string | null; fleetName: string; count: number }[];
      expect(byFleet.find((f) => f.fleetId === fleetA)).toMatchObject({ fleetName: 'Frota SP', count: 2 });
      expect(byFleet.find((f) => f.fleetId === null)).toMatchObject({ fleetName: 'Sem frota', count: 1 });
    });
  });

  // ==========================================================================
  // Filtros: fleetId, vehicleType, vehicleStatus
  // ==========================================================================
  describe('filtros', () => {
    it('filtra por fleetId, vehicleType e vehicleStatus', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Filters');
      const fleetA = await createFleet(adminAuth);
      await createVehicle(adminAuth, { type: 'TRACTOR_UNIT', fleetId: fleetA });
      await createVehicle(adminAuth, { type: 'TRUCK' });
      const vanId = await createVehicle(adminAuth, { type: 'VAN' });
      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vanId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'INACTIVE' })
        .expect(200);

      const byFleet = await request(app.getHttpServer())
        .get(`/api/v1/fleet-operations/vehicles?fleetId=${fleetA}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byFleet.body.data.totalVehicles).toBe(1);

      const byType = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/vehicles?vehicleType=TRUCK')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byType.body.data.totalVehicles).toBe(1);
      expect(byType.body.data.activeCount).toBe(1);

      const byStatus = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/vehicles?vehicleStatus=INACTIVE')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byStatus.body.data.totalVehicles).toBe(1);
      expect(byStatus.body.data.inactiveCount).toBe(1);

      const unfiltered = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/vehicles')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(unfiltered.body.data.totalVehicles).toBe(3);
    });
  });

  // ==========================================================================
  // Idade/odometro medios -- so entre veiculos com o campo preenchido
  // ==========================================================================
  describe('idade e odometro medios', () => {
    it('calcula a media so entre veiculos com o campo preenchido; indisponivel quando nenhum tem', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Averages');
      const currentYear = new Date().getFullYear();

      await createVehicle(adminAuth, { manufactureYear: currentYear - 10, odometerKm: 100000 });
      await createVehicle(adminAuth, { manufactureYear: currentYear - 4, odometerKm: 20000 });
      await createVehicle(adminAuth, {}); // sem manufactureYear/odometerKm

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/vehicles')
        .set('Authorization', adminAuth)
        .expect(200);
      const data = res.body.data;

      expect(data.averageAgeYears).toMatchObject({ available: true, reason: null, value: 7 }); // (10+4)/2
      expect(data.averageOdometerKm).toMatchObject({ available: true, reason: null, value: 60000 }); // (100000+20000)/2
    });

    it('fica indisponivel quando nenhum veiculo tem manufactureYear/odometerKm', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('AveragesGap');
      await createVehicle(adminAuth, {});
      await createVehicle(adminAuth, {});

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/vehicles')
        .set('Authorization', adminAuth)
        .expect(200);
      const data = res.body.data;

      expect(data.averageAgeYears).toMatchObject({ value: null, available: false, reason: 'NO_VEHICLE_WITH_MANUFACTURE_YEAR' });
      expect(data.averageOdometerKm).toMatchObject({ value: null, available: false, reason: 'NO_VEHICLE_WITH_ODOMETER' });
    });
  });

  // ==========================================================================
  // Rankings: mais antigos/mais novos/maior odometro -- deterministicos,
  // so entre veiculos com dado
  // ==========================================================================
  describe('rankings', () => {
    it('rankeia mais antigo/mais novo por manufactureYear e maior odometro, excluindo veiculos sem o dado', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Rankings');
      const currentYear = new Date().getFullYear();

      const old = await createVehicle(adminAuth, { manufactureYear: currentYear - 20, odometerKm: 5000 });
      const newV = await createVehicle(adminAuth, { manufactureYear: currentYear - 1, odometerKm: 500000 });
      const noData = await createVehicle(adminAuth, {}); // nunca aparece em nenhum ranking

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/vehicles')
        .set('Authorization', adminAuth)
        .expect(200);
      const data = res.body.data;

      expect(data.oldestVehicles[0]).toMatchObject({ vehicleId: old, value: currentYear - 20 });
      expect(data.newestVehicles[0]).toMatchObject({ vehicleId: newV, value: currentYear - 1 });
      expect(data.topVehiclesByOdometer[0]).toMatchObject({ vehicleId: newV, value: 500000 });

      const allRankingIds = [
        ...data.oldestVehicles.map((v: { vehicleId: string }) => v.vehicleId),
        ...data.newestVehicles.map((v: { vehicleId: string }) => v.vehicleId),
        ...data.topVehiclesByOdometer.map((v: { vehicleId: string }) => v.vehicleId),
      ];
      expect(allRankingIds).not.toContain(noData);
    });
  });

  // ==========================================================================
  // Isolamento multi-tenant
  // ==========================================================================
  describe('isolamento multi-tenant', () => {
    it('tenant B nunca ve veiculos do tenant A', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolA');
      await createVehicle(tenantA.adminAuth, {});

      const tenantB = await createTenantAndLoginAsAdmin('IsolB');
      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/vehicles')
        .set('Authorization', tenantB.adminAuth)
        .expect(200);

      expect(res.body.data.totalVehicles).toBe(0);
      expect(res.body.data.byType).toEqual([]);
    });
  });

  // ==========================================================================
  // RBAC
  // ==========================================================================
  describe('RBAC', () => {
    it('permite SUPER_ADMIN/ADMIN/MANAGER/OPERATOR/DISPATCHER/AUDITOR; bloqueia DRIVER com 403', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Rbac');

      for (const role of ['MANAGER', 'OPERATOR', 'DISPATCHER', 'AUDITOR']) {
        const auth = await createUserWithRole(tenantId, adminAuth, role);
        await request(app.getHttpServer())
          .get('/api/v1/fleet-operations/vehicles')
          .set('Authorization', auth)
          .expect(200);
      }

      await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/vehicles')
        .set('Authorization', adminAuth) // SUPER_ADMIN
        .expect(200);

      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/vehicles')
        .set('Authorization', driverAuth)
        .expect(403);
    });
  });

  // ==========================================================================
  // Verificacao real de ausencia de N+1
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
        slug: `veh-n1-${label.toLowerCase()}-${unique}`,
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
      return { tenantId, adminAuth: `Bearer ${loginRes.body.data.accessToken as string}` };
    }

    async function seedVehicle(adminAuth: string, fleetId: string) {
      await request(countingApp.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', adminAuth)
        .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT', fleetId, manufactureYear: 2020, odometerKm: 50000 })
        .expect(201);
    }

    it('a contagem de queries de GET /fleet-operations/vehicles nao cresce entre 10 e 50 veiculos', async () => {
      const { adminAuth } = await createTenantAndLoginOnCountingApp('N1Check');
      const fleetRes = await request(countingApp.getHttpServer())
        .post('/api/v1/fleets')
        .set('Authorization', adminAuth)
        .send({ name: `Frota ${randomUUID()}`, type: 'OWN' })
        .expect(201);
      const fleetId = fleetRes.body.data.id as string;

      for (let i = 0; i < 10; i += 1) {
        await seedVehicle(adminAuth, fleetId);
      }
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/fleet-operations/vehicles')
        .set('Authorization', adminAuth)
        .expect(200);
      const queriesFor10 = queryCount;
      expect(queriesFor10).toBeGreaterThan(0);

      for (let i = 0; i < 40; i += 1) {
        await seedVehicle(adminAuth, fleetId);
      }
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/fleet-operations/vehicles')
        .set('Authorization', adminAuth)
        .expect(200);
      const queriesFor50 = queryCount;

      expect(queriesFor50).toBeLessThanOrEqual(queriesFor10 + 1);
    }, 120000);
  });
});
