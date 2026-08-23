import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 65 -- gaps reais identificados na auditoria do modulo de combustivel
// (ja maduro desde as Fases 18/25/42): GET /vehicles/:id/overview descartava
// totalLiters/totalAmount/averageConsumptionKmL/hasOdometerRegression ja
// calculados por FuelSuppliesService.getVehicleFuelHistory, expondo so
// fuelSuppliesCount. CRUD/derivacao de viagem/idempotencia do app do
// motorista/dashboard/alertas de frota ja cobertos por
// fuel-management.e2e-spec.ts, fleet-operations-fuel.e2e-spec.ts e
// driver-trips.e2e-spec.ts -- nao duplicados aqui.
describe('Combustivel <-> Veiculo (Fase 65, e2e)', () => {
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
      slug: `fvi-${label.toLowerCase()}-${unique}`,
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

  async function createVehicle(auth: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/vehicles')
      .set('Authorization', auth)
      .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
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

  async function createFuelStation(auth: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/fuel-stations')
      .set('Authorization', auth)
      .send({ name: `Posto ${randomUUID()}` })
      .expect(201);
    return res.body.data.id as string;
  }

  function createSupply(
    auth: string,
    overrides: Partial<Record<string, unknown>>,
  ) {
    return request(app.getHttpServer())
      .post('/api/v1/fuel-supplies')
      .set('Authorization', auth)
      .send({ fuelType: 'DIESEL_S10', liters: 200, pricePerLiter: 5, ...overrides });
  }

  async function getVehicle(auth: string, id: string) {
    const res = await request(app.getHttpServer()).get(`/api/v1/vehicles/${id}`).set('Authorization', auth).expect(200);
    return res.body.data;
  }

  describe('GET /vehicles/:id/fuel-history -- hasOdometerRegression', () => {
    it('fica false quando os odometros sao cronologicamente consistentes', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('HistoryConsistent');
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);
      const fuelStationId = await createFuelStation(auth);

      await createSupply(auth, {
        vehicleId,
        driverId,
        fuelStationId,
        odometerKm: 100000,
        supplyDate: '2026-08-01T08:00:00.000Z',
      }).expect(201);
      await createSupply(auth, {
        vehicleId,
        driverId,
        fuelStationId,
        odometerKm: 100500,
        supplyDate: '2026-08-05T08:00:00.000Z',
      }).expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleId}/fuel-history`)
        .set('Authorization', auth)
        .expect(200);
      expect(res.body.data.hasOdometerRegression).toBe(false);
      expect(res.body.data.averageConsumptionKmL).toBeCloseTo(500 / 200, 5);
    });

    it('fica true quando um abastecimento lancado com data anterior tem odometro maior que um posterior', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('HistoryRegression');
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);
      const fuelStationId = await createFuelStation(auth);

      // Criado primeiro: data mais recente, odometro baixo.
      await createSupply(auth, {
        vehicleId,
        driverId,
        fuelStationId,
        odometerKm: 100000,
        supplyDate: '2026-08-05T08:00:00.000Z',
      }).expect(201);
      // Criado depois (lancamento tardio de um evento anterior): data mais
      // antiga, odometro maior -- o guard so compara com o odometro ATUAL
      // do veiculo (100000), entao 105000 passa; mas cronologicamente isso
      // e uma regressao (05/08 com 100000km depois de 01/08 com 105000km).
      await createSupply(auth, {
        vehicleId,
        driverId,
        fuelStationId,
        odometerKm: 105000,
        supplyDate: '2026-08-01T08:00:00.000Z',
      }).expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleId}/fuel-history`)
        .set('Authorization', auth)
        .expect(200);
      expect(res.body.data.hasOdometerRegression).toBe(true);
    });
  });

  describe('GET /vehicles/:id/overview -- metricas e alerta de combustivel', () => {
    it('mostra litros/valor/data do abastecimento mais recente e consumo medio', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('OverviewRecent');
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);
      const fuelStationId = await createFuelStation(auth);

      await createSupply(auth, {
        vehicleId,
        driverId,
        fuelStationId,
        liters: 200,
        pricePerLiter: 5,
        odometerKm: 100000,
        supplyDate: '2026-08-01T08:00:00.000Z',
      }).expect(201);
      await createSupply(auth, {
        vehicleId,
        driverId,
        fuelStationId,
        liters: 180,
        pricePerLiter: 5.5,
        odometerKm: 100450,
        supplyDate: '2026-08-05T08:00:00.000Z',
      }).expect(201);

      const overviewRes = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleId}/overview`)
        .set('Authorization', auth)
        .expect(200);
      const { metrics } = overviewRes.body.data;

      expect(metrics.fuelSuppliesCount).toBe(2);
      expect(metrics.lastFuelSupplyLiters).toBe(180);
      expect(metrics.lastFuelSupplyAmount).toBeCloseTo(180 * 5.5, 2);
      expect(metrics.averageFuelConsumptionKmL).toBeCloseTo(450 / 180, 5);

      const alertTypes = (overviewRes.body.data.alerts as { type: string }[]).map((a) => a.type);
      expect(alertTypes).not.toContain('VEHICLE_FUEL_ODOMETER_REGRESSION');
    });

    it('emite alerta VEHICLE_FUEL_ODOMETER_REGRESSION quando ha inconsistencia', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('OverviewRegressionAlert');
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);
      const fuelStationId = await createFuelStation(auth);

      await createSupply(auth, {
        vehicleId,
        driverId,
        fuelStationId,
        odometerKm: 100000,
        supplyDate: '2026-08-05T08:00:00.000Z',
      }).expect(201);
      await createSupply(auth, {
        vehicleId,
        driverId,
        fuelStationId,
        odometerKm: 105000,
        supplyDate: '2026-08-01T08:00:00.000Z',
      }).expect(201);

      const overviewRes = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleId}/overview`)
        .set('Authorization', auth)
        .expect(200);
      const alertTypes = (overviewRes.body.data.alerts as { type: string }[]).map((a) => a.type);
      expect(alertTypes).toContain('VEHICLE_FUEL_ODOMETER_REGRESSION');
    });

    it('sem nenhum abastecimento, campos de combustivel ficam null/zero (nunca inventados)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('OverviewNoSupplies');
      const vehicleId = await createVehicle(auth);

      const overviewRes = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleId}/overview`)
        .set('Authorization', auth)
        .expect(200);
      const { metrics } = overviewRes.body.data;
      expect(metrics.fuelSuppliesCount).toBe(0);
      expect(metrics.lastFuelSupplyLiters).toBeNull();
      expect(metrics.lastFuelSupplyAmount).toBeNull();
      expect(metrics.lastFuelSupplyDate).toBeNull();
      expect(metrics.averageFuelConsumptionKmL).toBeNull();
    });
  });

  describe('edicao e exclusao de abastecimento (acao antes ausente na UI, agora exposta)', () => {
    it('PATCH recalcula totalAmount; DELETE remove sem deixar residuo', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('EditDelete');
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);
      const fuelStationId = await createFuelStation(auth);

      const createRes = await createSupply(auth, {
        vehicleId,
        driverId,
        fuelStationId,
        liters: 100,
        pricePerLiter: 5,
        odometerKm: 100000,
        supplyDate: '2026-08-01T08:00:00.000Z',
      }).expect(201);
      const supplyId = createRes.body.data.id as string;

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/fuel-supplies/${supplyId}`)
        .set('Authorization', auth)
        .send({ liters: 120, pricePerLiter: 6 })
        .expect(200);
      expect(updateRes.body.data.totalAmount).toBeCloseTo(720, 2);

      await request(app.getHttpServer()).delete(`/api/v1/fuel-supplies/${supplyId}`).set('Authorization', auth).expect(204);
      await request(app.getHttpServer()).get(`/api/v1/fuel-supplies/${supplyId}`).set('Authorization', auth).expect(404);

      const vehicle = await getVehicle(auth, vehicleId);
      expect(vehicle).toBeTruthy();
    });
  });
});
