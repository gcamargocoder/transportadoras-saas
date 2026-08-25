import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 85 -- custo operacional por km da frota (GET /fleet-operations/costs
// -> costPerKm/topVehiclesByCostPerKm). Reaproveita computeCosts (Fase 40)
// para os custos e o pool de leituras de odometro de FuelSupply +
// VehicleMaintenance (nunca TripMetrics.actualDistanceKm) para a distancia.
describe('Custo por Km (Fase 85, e2e)', () => {
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

  async function createTenantAndLoginAsAdmin(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    const payload = {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `ckm-${label.toLowerCase()}-${unique}`,
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

  async function createVehicle(auth: string, odometerKm = 100000) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/vehicles')
      .set('Authorization', auth)
      .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT', odometerKm })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createDriver(auth: string) {
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
    const cpf = [...base, d1, d2].join('');
    const res = await request(app.getHttpServer())
      .post('/api/v1/drivers')
      .set('Authorization', auth)
      .send({
        name: 'Jose da Silva',
        cpf,
        cnhNumber: String(Math.floor(10000000000 + Math.random() * 89999999999)),
        cnhCategory: 'AE',
        cnhExpiresAt: '2027-06-30',
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createFuelStation(auth: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/fuel-stations')
      .set('Authorization', auth)
      .send({ name: `Posto ${randomUUID()}` })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createFuelSupply(
    auth: string,
    vehicleId: string,
    driverId: string,
    odometerKm: number,
    totalAmount: number,
    fuelStationId: string,
  ) {
    await request(app.getHttpServer())
      .post('/api/v1/fuel-supplies')
      .set('Authorization', auth)
      .send({
        vehicleId,
        driverId,
        fuelStationId,
        fuelType: 'DIESEL_S10',
        liters: 100,
        pricePerLiter: totalAmount / 100,
        odometerKm,
        supplyDate: new Date().toISOString(),
      })
      .expect(201);
  }

  async function getCosts(auth: string, query: Record<string, string> = {}) {
    return request(app.getHttpServer()).get('/api/v1/fleet-operations/costs').query(query).set('Authorization', auth).expect(200);
  }

  describe('calculo e composicao', () => {
    it('calcula distancia via odometro de FuelSupply e custo/km = totalCost/distancia', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('Calc');
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);
      const fuelStationId = await createFuelStation(auth);
      await createFuelSupply(auth, vehicleId, driverId, 100000, 500, fuelStationId);
      await createFuelSupply(auth, vehicleId, driverId, 105000, 500, fuelStationId);

      const res = await getCosts(auth, { vehicleId });
      expect(res.body.data.costPerKm.available).toBe(true);
      expect(res.body.data.costPerKm.distanceKm).toBe(5000);
      expect(res.body.data.fuelCost).toBeCloseTo(1000, 2);
      expect(res.body.data.costPerKm.value).toBeCloseTo(1000 / 5000, 5);
      expect(res.body.data.costPerKm.fuelCostPerKm).toBeCloseTo(1000 / 5000, 5);
    });

    it('indisponivel (nao inventa custo/km) quando ha apenas 1 leitura de odometro', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('OnlyOneReading');
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);
      const fuelStationId = await createFuelStation(auth);
      await createFuelSupply(auth, vehicleId, driverId, 100000, 500, fuelStationId);

      const res = await getCosts(auth, { vehicleId });
      expect(res.body.data.costPerKm.available).toBe(false);
      expect(res.body.data.costPerKm.reason).toEqual(expect.any(String));
      expect(res.body.data.costPerKm.value).toBeNull();
      expect(res.body.data.costPerKm.distanceKm).toBeNull();
    });

    it('nunca divide por zero quando os odometros sao iguais (distancia 0 excluida, nunca Infinity)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('ZeroDistance');
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);
      const fuelStationId = await createFuelStation(auth);
      await createFuelSupply(auth, vehicleId, driverId, 100000, 500, fuelStationId);
      await createFuelSupply(auth, vehicleId, driverId, 100000, 300, fuelStationId);

      const res = await getCosts(auth, { vehicleId });
      expect(res.body.data.costPerKm.available).toBe(false);
      expect(res.body.data.costPerKm.value).not.toBe(Infinity);
      expect(res.body.data.costPerKm.value).toBeNull();
    });

    it('componentes do custo/km somam o valor total (sem dupla contagem)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('Composition');
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);
      const fuelStationId = await createFuelStation(auth);
      await createFuelSupply(auth, vehicleId, driverId, 100000, 400, fuelStationId);
      await createFuelSupply(auth, vehicleId, driverId, 110000, 400, fuelStationId);
      await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', auth)
        .send({ vehicleId, type: 'CORRECTIVE', laborCost: 300, partsCost: 0, odometerKm: 105000 })
        .expect(201);

      const res = await getCosts(auth, { vehicleId });
      const data = res.body.data;
      const sumPerCategory =
        (data.costPerKm.fuelCostPerKm ?? 0) +
        (data.costPerKm.maintenanceCostPerKm ?? 0) +
        (data.costPerKm.tireCostPerKm ?? 0) +
        (data.costPerKm.tollCostPerKm ?? 0) +
        (data.costPerKm.otherCostPerKm ?? 0);
      expect(sumPerCategory).toBeCloseTo(data.costPerKm.value, 5);
      expect(data.totalCost).toBeCloseTo(data.fuelCost + data.maintenanceCost + data.tireCost + data.tollCost + data.otherCost, 2);
    });

    it('inclui custo de manutencao com pecas consumidas (Fase 83) no custo/km', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('MaintenanceParts');
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);
      const fuelStationId = await createFuelStation(auth);
      await createFuelSupply(auth, vehicleId, driverId, 100000, 100, fuelStationId);
      await createFuelSupply(auth, vehicleId, driverId, 108000, 100, fuelStationId);

      const partRes = await request(app.getHttpServer())
        .post('/api/v1/parts')
        .set('Authorization', auth)
        .send({ sku: `SKU-${randomUUID().slice(0, 8)}`, name: 'Filtro', unit: 'UN' })
        .expect(201);
      const partId = partRes.body.data.id as string;
      await request(app.getHttpServer()).post(`/api/v1/parts/${partId}/stock/in`).set('Authorization', auth).send({ quantity: 5 }).expect(201);

      const maintRes = await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', auth)
        .send({
          vehicleId,
          type: 'CORRECTIVE',
          laborCost: 50,
          parts: [{ partId, name: 'Filtro', quantity: 1, unitPrice: 80 }],
        })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/maintenances/${maintRes.body.data.id}/complete`)
        .set('Authorization', auth)
        .send({ completedAt: new Date().toISOString() })
        .expect(201);

      const res = await getCosts(auth, { vehicleId });
      expect(res.body.data.maintenanceCost).toBeCloseTo(130, 2); // 50 labor + 80 parts
      expect(res.body.data.costPerKm.maintenanceCostPerKm).toBeCloseTo(130 / 8000, 5);
    });
  });

  describe('isolamento multi-tenant', () => {
    it('custos de outro tenant nunca entram no calculo', async () => {
      const { auth: authA } = await createTenantAndLoginAsAdmin('TenantA');
      const { auth: authB } = await createTenantAndLoginAsAdmin('TenantB');
      const vehicleA = await createVehicle(authA);
      const driverA = await createDriver(authA);
      const fuelStationA = await createFuelStation(authA);
      await createFuelSupply(authA, vehicleA, driverA, 100000, 1000, fuelStationA);
      await createFuelSupply(authA, vehicleA, driverA, 105000, 1000, fuelStationA);

      const vehicleB = await createVehicle(authB);
      const driverB = await createDriver(authB);
      const fuelStationB = await createFuelStation(authB);
      await createFuelSupply(authB, vehicleB, driverB, 200000, 50, fuelStationB);
      await createFuelSupply(authB, vehicleB, driverB, 201000, 50, fuelStationB);

      const resB = await getCosts(authB);
      expect(resB.body.data.fuelCost).toBeCloseTo(100, 2);
      expect(resB.body.data.costPerKm.distanceKm).toBe(1000);
    });
  });

  describe('RBAC', () => {
    it('DRIVER nao acessa o dashboard de custos (403)', async () => {
      const { tenantId, auth } = await createTenantAndLoginAsAdmin('Rbac');
      const driverAuth = await createUserWithRole(tenantId, auth, 'DRIVER');
      await request(app.getHttpServer()).get('/api/v1/fleet-operations/costs').set('Authorization', driverAuth).expect(403);
    });
  });

  describe('performance / N+1', () => {
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
        slug: `ckm-n1-${label.toLowerCase()}-${unique}`,
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

    async function seedVehicleWithFuel(auth: string, fuelStationId: string) {
      const vRes = await request(countingApp.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
        .expect(201);
      const vehicleId = vRes.body.data.id as string;
      const dRes = await request(countingApp.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', auth)
        .send({
          name: 'Motorista',
          cpf: String(Math.floor(10000000000 + Math.random() * 89999999999)),
          cnhNumber: String(Math.floor(10000000000 + Math.random() * 89999999999)),
          cnhCategory: 'AE',
          cnhExpiresAt: '2027-06-30',
        });
      const driverId = dRes.body.data?.id as string | undefined;
      if (!driverId) return;
      await request(countingApp.getHttpServer())
        .post('/api/v1/fuel-supplies')
        .set('Authorization', auth)
        .send({ vehicleId, driverId, fuelStationId, fuelType: 'DIESEL_S10', liters: 100, pricePerLiter: 5, odometerKm: 100000, supplyDate: new Date().toISOString() });
      await request(countingApp.getHttpServer())
        .post('/api/v1/fuel-supplies')
        .set('Authorization', auth)
        .send({ vehicleId, driverId, fuelStationId, fuelType: 'DIESEL_S10', liters: 100, pricePerLiter: 5, odometerKm: 105000, supplyDate: new Date().toISOString() });
    }

    it('a contagem de queries de GET /fleet-operations/costs nao cresce entre 3 e 15 veiculos com abastecimento', async () => {
      const { auth } = await createTenantAndLoginOnCountingApp('N1Check');
      void countingPrisma;
      const stationRes = await request(countingApp.getHttpServer())
        .post('/api/v1/fuel-stations')
        .set('Authorization', auth)
        .send({ name: `Posto ${randomUUID()}` })
        .expect(201);
      const fuelStationId = stationRes.body.data.id as string;

      for (let i = 0; i < 3; i += 1) await seedVehicleWithFuel(auth, fuelStationId);
      queryCount = 0;
      await request(countingApp.getHttpServer()).get('/api/v1/fleet-operations/costs').set('Authorization', auth).expect(200);
      const queriesFor3 = queryCount;
      expect(queriesFor3).toBeGreaterThan(0);

      for (let i = 0; i < 12; i += 1) await seedVehicleWithFuel(auth, fuelStationId);
      queryCount = 0;
      await request(countingApp.getHttpServer()).get('/api/v1/fleet-operations/costs').set('Authorization', auth).expect(200);
      const queriesFor15 = queryCount;

      expect(queriesFor15).toBeLessThanOrEqual(queriesFor3 + 2);
    }, 120000);
  });
});
