import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 86 -- disponibilidade da frota (GET /vehicles, /vehicles/summary).
// Reaproveita integralmente resolveFleetAvailabilityStatus (fonte central de
// disponibilidade, Fase 81/86) e a sincronizacao Vehicle.status<->manutencao
// ja existente (Fase 63) -- aqui so confirmamos que os NOVOS campos aditivos
// (fleetAvailabilityStatus/unavailabilityReason/availabilityBreakdown)
// refletem corretamente cada estado, com prioridade correta, isolamento
// multi-tenant, RBAC e sem N+1.
describe('Disponibilidade da Frota (Fase 86, e2e)', () => {
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
      slug: `fav-${label.toLowerCase()}-${unique}`,
      admin: {
        name: `Admin ${label}`,
        email: `admin-${label.toLowerCase()}-${unique}@teste.com`,
        password: 'SenhaForte123!',
      },
    };
    const createRes = await request(app.getHttpServer()).post('/api/v1/tenants').send(payload).expect(201);
    const tenantId: string = createRes.body.data.id;
    createdTenantIds.push(tenantId);
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email: payload.admin.email, password: payload.admin.password })
      .expect(200);
    return { tenantId, auth: `Bearer ${loginRes.body.data.accessToken as string}` };
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
    return `Bearer ${loginRes.body.data.accessToken as string}`;
  }

  async function createVehicle(auth: string, overrides: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/vehicles')
      .set('Authorization', auth)
      .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT', ...overrides })
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

  async function createAndStartTrip(auth: string, driverId: string, compositionId: string) {
    const originId = await createLocation(auth, `Origem ${randomUUID()}`);
    const destinationId = await createLocation(auth, `Destino ${randomUUID()}`);
    const tripRes = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', auth)
      .send({
        driverId,
        compositionId,
        originLocationId: originId,
        destinationLocationId: destinationId,
        plannedDeparture: '2026-01-01T08:00:00.000Z',
        plannedArrival: '2026-01-02T18:00:00.000Z',
      })
      .expect(201);
    const tripId = tripRes.body.data.id as string;
    await request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}/status`)
      .set('Authorization', auth)
      .send({ status: 'WAITING_DRIVER' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}/status`)
      .set('Authorization', auth)
      .send({ status: 'WAITING_DEPARTURE' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}/status`)
      .set('Authorization', auth)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
    return tripId;
  }

  async function createMaintenanceInProgress(auth: string, vehicleId: string) {
    const maintRes = await request(app.getHttpServer())
      .post('/api/v1/maintenances')
      .set('Authorization', auth)
      .send({ vehicleId, type: 'CORRECTIVE', laborCost: 100, partsCost: 0 })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/maintenances/${maintRes.body.data.id}/status`)
      .set('Authorization', auth)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
  }

  async function getVehicle(auth: string, id: string) {
    const res = await request(app.getHttpServer()).get(`/api/v1/vehicles/${id}`).set('Authorization', auth).expect(200);
    return res.body.data;
  }

  async function getSummary(auth: string) {
    const res = await request(app.getHttpServer()).get('/api/v1/vehicles/summary').set('Authorization', auth).expect(200);
    return res.body.data;
  }

  describe('cada estado de disponibilidade', () => {
    it('veiculo recem-criado -> AVAILABLE, sem motivo', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('Available');
      const vehicleId = await createVehicle(auth);

      const vehicle = await getVehicle(auth, vehicleId);
      expect(vehicle.fleetAvailabilityStatus).toBe('AVAILABLE');
      expect(vehicle.unavailabilityReason).toBeNull();
    });

    it('veiculo em viagem (IN_PROGRESS) -> ON_TRIP, sem motivo (nunca aparece como disponivel)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('OnTrip');
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);
      const compositionId = await createComposition(auth, vehicleId);
      await createAndStartTrip(auth, driverId, compositionId);

      const vehicle = await getVehicle(auth, vehicleId);
      expect(vehicle.fleetAvailabilityStatus).toBe('ON_TRIP');
      expect(vehicle.unavailabilityReason).toBeNull();
    });

    it('veiculo com manutencao IN_PROGRESS -> MAINTENANCE, com motivo (nao generico UNAVAILABLE)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('Maintenance');
      const vehicleId = await createVehicle(auth);
      await createMaintenanceInProgress(auth, vehicleId);

      const vehicle = await getVehicle(auth, vehicleId);
      expect(vehicle.status).toBe('MAINTENANCE');
      expect(vehicle.fleetAvailabilityStatus).toBe('MAINTENANCE');
      expect(vehicle.unavailabilityReason).toEqual(expect.any(String));
    });

    it('veiculo INACTIVE -> INACTIVE, com motivo (nunca tratado como disponivel)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('Inactive');
      const vehicleId = await createVehicle(auth);
      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleId}/status`)
        .set('Authorization', auth)
        .send({ status: 'INACTIVE' })
        .expect(200);

      const vehicle = await getVehicle(auth, vehicleId);
      expect(vehicle.fleetAvailabilityStatus).toBe('INACTIVE');
      expect(vehicle.unavailabilityReason).toEqual(expect.any(String));
    });

    it('veiculo SUSPENDED -> UNAVAILABLE, com motivo', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('Suspended');
      const vehicleId = await createVehicle(auth);
      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleId}/status`)
        .set('Authorization', auth)
        .send({ status: 'SUSPENDED' })
        .expect(200);

      const vehicle = await getVehicle(auth, vehicleId);
      expect(vehicle.fleetAvailabilityStatus).toBe('UNAVAILABLE');
      expect(vehicle.unavailabilityReason).toEqual(expect.any(String));
    });
  });

  describe('indicadores (summary) -- quantidade e percentual por status', () => {
    it('availabilityBreakdown reflete contagens e percentuais corretos, somando 100%', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('Breakdown');
      await createVehicle(auth); // AVAILABLE
      await createVehicle(auth); // AVAILABLE
      const maintenanceVehicle = await createVehicle(auth);
      await createMaintenanceInProgress(auth, maintenanceVehicle);
      const inactiveVehicle = await createVehicle(auth);
      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${inactiveVehicle}/status`)
        .set('Authorization', auth)
        .send({ status: 'INACTIVE' })
        .expect(200);

      const summary = await getSummary(auth);
      expect(summary.total).toBe(4);
      const byStatus = new Map<string, { count: number; percent: number }>(
        summary.availabilityBreakdown.map((e: { status: string; count: number; percent: number }) => [
          e.status,
          { count: e.count, percent: e.percent },
        ]),
      );
      expect(byStatus.get('AVAILABLE')?.count).toBe(2);
      expect(byStatus.get('AVAILABLE')?.percent).toBeCloseTo(50, 5);
      expect(byStatus.get('MAINTENANCE')?.count).toBe(1);
      expect(byStatus.get('INACTIVE')?.count).toBe(1);
      expect(byStatus.get('ON_TRIP')?.count).toBe(0);
      expect(byStatus.get('UNAVAILABLE')?.count).toBe(0);

      const totalPercent = [...byStatus.values()].reduce((sum, e) => sum + e.percent, 0);
      expect(totalPercent).toBeCloseTo(100, 5);
    });

    it('nunca divide por zero: tenant sem veiculos retorna percent=0 em todas as categorias', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('Empty');
      const summary = await getSummary(auth);

      expect(summary.total).toBe(0);
      for (const entry of summary.availabilityBreakdown) {
        expect(entry.count).toBe(0);
        expect(entry.percent).toBe(0);
      }
    });
  });

  describe('isolamento multi-tenant', () => {
    it('veiculos de outro tenant nunca entram no summary/lista', async () => {
      const { auth: authA } = await createTenantAndLoginAsAdmin('TenantA');
      const { auth: authB } = await createTenantAndLoginAsAdmin('TenantB');
      await createVehicle(authA);
      await createVehicle(authB);
      await createVehicle(authB);

      const summaryA = await getSummary(authA);
      expect(summaryA.total).toBe(1);

      const listA = await request(app.getHttpServer()).get('/api/v1/vehicles').set('Authorization', authA).expect(200);
      expect(listA.body.data.meta.total).toBe(1);
    });
  });

  describe('RBAC', () => {
    it('DRIVER nao acessa /vehicles nem /vehicles/summary (403)', async () => {
      const { tenantId, auth } = await createTenantAndLoginAsAdmin('Rbac');
      const driverAuth = await createUserWithRole(tenantId, auth, 'DRIVER');

      await request(app.getHttpServer()).get('/api/v1/vehicles').set('Authorization', driverAuth).expect(403);
      await request(app.getHttpServer()).get('/api/v1/vehicles/summary').set('Authorization', driverAuth).expect(403);
    });
  });

  describe('performance / N+1', () => {
    let countingApp: INestApplication;
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
        slug: `fav-n1-${label.toLowerCase()}-${unique}`,
        admin: {
          name: `Admin ${label}`,
          email: `admin-${label.toLowerCase()}-${unique}@teste.com`,
          password: 'SenhaForte123!',
        },
      };
      const createRes = await request(countingApp.getHttpServer()).post('/api/v1/tenants').send(payload).expect(201);
      const tenantId: string = createRes.body.data.id;
      createdTenantIds.push(tenantId);
      const loginRes = await request(countingApp.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId, email: payload.admin.email, password: payload.admin.password })
        .expect(200);
      return { tenantId, auth: `Bearer ${loginRes.body.data.accessToken as string}` };
    }

    async function seedVehicle(auth: string) {
      await request(countingApp.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
        .expect(201);
    }

    it('a contagem de queries de GET /vehicles nao cresce entre 3 e 15 veiculos', async () => {
      const { auth } = await createTenantAndLoginOnCountingApp('N1Check');

      for (let i = 0; i < 3; i += 1) await seedVehicle(auth);
      queryCount = 0;
      await request(countingApp.getHttpServer()).get('/api/v1/vehicles').set('Authorization', auth).expect(200);
      const queriesFor3 = queryCount;
      expect(queriesFor3).toBeGreaterThan(0);

      for (let i = 0; i < 12; i += 1) await seedVehicle(auth);
      queryCount = 0;
      await request(countingApp.getHttpServer()).get('/api/v1/vehicles').set('Authorization', auth).expect(200);
      const queriesFor15 = queryCount;

      expect(queriesFor15).toBeLessThanOrEqual(queriesFor3 + 2);
    }, 120000);
  });
});
