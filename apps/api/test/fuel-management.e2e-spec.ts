import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Fuel Management (e2e)', () => {
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
      slug: `fuel-${label.toLowerCase()}-${unique}`,
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

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email: payload.admin.email, password: payload.admin.password })
      .expect(200);

    return { tenantId, adminAccessToken: loginRes.body.data.accessToken as string };
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

  async function setupTrip(auth: string, vehicleId: string, driverId: string) {
    const compositionId = await createComposition(auth, vehicleId);
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
        plannedDeparture: '2026-09-01T08:00:00.000Z',
        plannedArrival: '2026-09-05T18:00:00.000Z',
      })
      .expect(201);

    return tripRes.body.data.id as string;
  }

  async function createFuelStation(auth: string, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/fuel-stations')
      .set('Authorization', auth)
      .send({ name: `Posto ${randomUUID()}`, city: 'Curitiba', state: 'pr', ...overrides })
      .expect(201);
    return res.body.data as { id: string; name: string };
  }

  function createSupply(auth: string, overrides: Partial<Record<string, unknown>> = {}) {
    return request(app.getHttpServer())
      .post('/api/v1/fuel-supplies')
      .set('Authorization', auth)
      .send({
        fuelType: 'DIESEL_S10',
        liters: 200,
        pricePerLiter: 5.5,
        odometerKm: 100000,
        supplyDate: '2026-09-02T10:00:00.000Z',
        ...overrides,
      });
  }

  describe('FuelStation CRUD', () => {
    it('cria, consulta, atualiza e exclui um posto', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('StationCrud');
      const auth = `Bearer ${adminAccessToken}`;

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/fuel-stations')
        .set('Authorization', auth)
        .send({ name: 'Posto Graal BR-116', cnpj: '12345678000199', city: 'Curitiba', state: 'pr' })
        .expect(201);
      expect(createRes.body.data.state).toBe('PR');
      const id = createRes.body.data.id;

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/fuel-stations/${id}`)
        .set('Authorization', auth)
        .expect(200);
      expect(getRes.body.data.name).toBe('Posto Graal BR-116');

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/fuel-stations/${id}`)
        .set('Authorization', auth)
        .send({ isActive: false })
        .expect(200);
      expect(updateRes.body.data.isActive).toBe(false);

      await request(app.getHttpServer())
        .delete(`/api/v1/fuel-stations/${id}`)
        .set('Authorization', auth)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/fuel-stations/${id}`)
        .set('Authorization', auth)
        .expect(404);
    });

    it('bloqueia exclusao de posto com abastecimentos vinculados', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('StationInUse');
      const auth = `Bearer ${adminAccessToken}`;
      const station = await createFuelStation(auth);
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);

      await createSupply(auth, { vehicleId, driverId, fuelStationId: station.id }).expect(201);

      await request(app.getHttpServer())
        .delete(`/api/v1/fuel-stations/${station.id}`)
        .set('Authorization', auth)
        .expect(409);
    });

    it('OPERATOR le mas nao pode criar posto (403)', async () => {
      const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('StationRbac');
      const adminAuth = `Bearer ${adminAccessToken}`;
      const operatorAuth = await createUserWithRole(tenantId, adminAuth, 'OPERATOR');

      await request(app.getHttpServer())
        .get('/api/v1/fuel-stations')
        .set('Authorization', operatorAuth)
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/fuel-stations')
        .set('Authorization', operatorAuth)
        .send({ name: 'Posto Proibido' })
        .expect(403);
    });
  });

  describe('FuelSupply CRUD + derivacao', () => {
    it('cria sem viagem (vehicleId/driverId diretos), calcula totalAmount e atualiza o odometro do veiculo', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('SupplyNoTrip');
      const auth = `Bearer ${adminAccessToken}`;
      const station = await createFuelStation(auth);
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);

      const createRes = await createSupply(auth, {
        vehicleId,
        driverId,
        fuelStationId: station.id,
        liters: 250.5,
        pricePerLiter: 5.899,
        odometerKm: 100000,
      }).expect(201);

      expect(createRes.body.data.vehicleId).toBe(vehicleId);
      expect(createRes.body.data.driverId).toBe(driverId);
      expect(createRes.body.data.tripId).toBeNull();
      expect(createRes.body.data.totalAmount).toBeCloseTo(250.5 * 5.899, 2);
      expect(createRes.body.data.createdBy).toBeTruthy();

      const vehicleRes = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(vehicleRes.body.data.odometerKm).toBe(100000);

      const id = createRes.body.data.id;
      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/fuel-supplies/${id}`)
        .set('Authorization', auth)
        .send({ liters: 300 })
        .expect(200);
      expect(updateRes.body.data.totalAmount).toBeCloseTo(300 * 5.899, 2);
      expect(updateRes.body.data.updatedBy).toBeTruthy();

      await request(app.getHttpServer())
        .delete(`/api/v1/fuel-supplies/${id}`)
        .set('Authorization', auth)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/fuel-supplies/${id}`)
        .set('Authorization', auth)
        .expect(404);
    });

    it('cria com viagem: vehicleId/driverId sao SEMPRE derivados, ignorando o que o cliente envia', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('SupplyWithTrip');
      const auth = `Bearer ${adminAccessToken}`;
      const station = await createFuelStation(auth);
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);
      const tripId = await setupTrip(auth, vehicleId, driverId);

      const outroVehicleId = await createVehicle(auth);
      const outroDriverId = await createDriver(auth);

      const createRes = await createSupply(auth, {
        tripId,
        vehicleId: outroVehicleId,
        driverId: outroDriverId,
        fuelStationId: station.id,
      }).expect(201);

      expect(createRes.body.data.tripId).toBe(tripId);
      expect(createRes.body.data.vehicleId).toBe(vehicleId);
      expect(createRes.body.data.driverId).toBe(driverId);
    });
  });

  describe('validacoes', () => {
    it('rejeita litros <= 0, preco <= 0 e data ausente com 400', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('BadNumbers');
      const auth = `Bearer ${adminAccessToken}`;
      const station = await createFuelStation(auth);
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);

      await createSupply(auth, {
        vehicleId,
        driverId,
        fuelStationId: station.id,
        liters: 0,
      }).expect(400);
      await createSupply(auth, {
        vehicleId,
        driverId,
        fuelStationId: station.id,
        liters: -10,
      }).expect(400);
      await createSupply(auth, {
        vehicleId,
        driverId,
        fuelStationId: station.id,
        pricePerLiter: 0,
      }).expect(400);

      await request(app.getHttpServer())
        .post('/api/v1/fuel-supplies')
        .set('Authorization', auth)
        .send({
          vehicleId,
          driverId,
          fuelStationId: station.id,
          fuelType: 'DIESEL_S10',
          liters: 100,
          pricePerLiter: 5,
          odometerKm: 1000,
        })
        .expect(400); // supplyDate ausente
    });

    it('rejeita posto/veiculo/motorista/trip/attachment inexistentes com 404', async () => {
      const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('BadRefs');
      const auth = `Bearer ${adminAccessToken}`;
      const station = await createFuelStation(auth);
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);

      await createSupply(auth, { vehicleId, driverId, fuelStationId: randomUUID() }).expect(404);
      await createSupply(auth, {
        vehicleId: randomUUID(),
        driverId,
        fuelStationId: station.id,
      }).expect(404);
      await createSupply(auth, {
        vehicleId,
        driverId: randomUUID(),
        fuelStationId: station.id,
      }).expect(404);
      await createSupply(auth, { tripId: randomUUID(), fuelStationId: station.id }).expect(404);
      await createSupply(auth, {
        vehicleId,
        driverId,
        fuelStationId: station.id,
        attachmentId: randomUUID(),
      }).expect(404);

      const attachment = await prisma.attachment.create({
        data: {
          tenantId,
          entityName: 'FuelSupply',
          entityId: randomUUID(),
          storageKey: `receipts/${randomUUID()}.pdf`,
        },
      });
      const res = await createSupply(auth, {
        vehicleId,
        driverId,
        fuelStationId: station.id,
        attachmentId: attachment.id,
      }).expect(201);
      expect(res.body.data.attachmentId).toBe(attachment.id);
    });

    it('exige vehicleId/driverId quando nao ha viagem', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('MissingVehicleDriver');
      const auth = `Bearer ${adminAccessToken}`;
      const station = await createFuelStation(auth);
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);

      await createSupply(auth, { driverId, fuelStationId: station.id }).expect(400);
      await createSupply(auth, { vehicleId, fuelStationId: station.id }).expect(400);
    });

    it('rejeita odometerKm menor que a quilometragem atual do veiculo', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('OdometerRule');
      const auth = `Bearer ${adminAccessToken}`;
      const station = await createFuelStation(auth);
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);

      await createSupply(auth, {
        vehicleId,
        driverId,
        fuelStationId: station.id,
        odometerKm: 100000,
      }).expect(201);

      await createSupply(auth, {
        vehicleId,
        driverId,
        fuelStationId: station.id,
        odometerKm: 99000,
      }).expect(409);

      // Igual ao atual e aceito (nao e "menor").
      await createSupply(auth, {
        vehicleId,
        driverId,
        fuelStationId: station.id,
        odometerKm: 100000,
      }).expect(201);
    });
  });

  describe('consumo e /vehicles/:id/fuel-history', () => {
    it('calcula consumo medio, litros e gasto total entre abastecimentos consecutivos', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Consumption');
      const auth = `Bearer ${adminAccessToken}`;
      const station = await createFuelStation(auth);
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);

      await createSupply(auth, {
        vehicleId,
        driverId,
        fuelStationId: station.id,
        odometerKm: 100000,
        liters: 200,
        supplyDate: '2026-09-01T10:00:00.000Z',
      }).expect(201);
      await createSupply(auth, {
        vehicleId,
        driverId,
        fuelStationId: station.id,
        odometerKm: 100400,
        liters: 100,
        supplyDate: '2026-09-05T10:00:00.000Z',
      }).expect(201);
      await createSupply(auth, {
        vehicleId,
        driverId,
        fuelStationId: station.id,
        odometerKm: 100800,
        liters: 80,
        supplyDate: '2026-09-10T10:00:00.000Z',
      }).expect(201);

      const historyRes = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleId}/fuel-history`)
        .set('Authorization', auth)
        .expect(200);

      const history = historyRes.body.data;
      expect(history.vehicleId).toBe(vehicleId);
      expect(history.suppliesCount).toBe(3);
      expect(history.totalLiters).toBe(380);
      expect(history.totalAmount).toBeCloseTo(380 * 5.5, 2);
      // distancia total = 100800 - 100000 = 800; litros apos o 1o = 100+80 = 180
      expect(history.averageConsumptionKmL).toBeCloseTo(800 / 180, 5);
      expect(history.items).toHaveLength(3);
      expect(history.items[0].odometerKm).toBe(100800); // mais recente primeiro

      const limitedRes = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleId}/fuel-history?limit=1`)
        .set('Authorization', auth)
        .expect(200);
      expect(limitedRes.body.data.items).toHaveLength(1);
      // totais continuam refletindo o historico completo, nao so o item exibido.
      expect(limitedRes.body.data.totalLiters).toBe(380);
    });
  });

  describe('filtros e paginacao', () => {
    it('filtra por veiculo, motorista, viagem, tipo de combustivel, posto e periodo', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Filters');
      const auth = `Bearer ${adminAccessToken}`;
      const stationA = await createFuelStation(auth);
      const stationB = await createFuelStation(auth);
      const vehicleA = await createVehicle(auth);
      const vehicleB = await createVehicle(auth);
      const driverA = await createDriver(auth);
      const driverB = await createDriver(auth);

      const supplyA = await createSupply(auth, {
        vehicleId: vehicleA,
        driverId: driverA,
        fuelStationId: stationA.id,
        fuelType: 'DIESEL_S10',
        odometerKm: 50000,
        supplyDate: '2026-01-10T10:00:00.000Z',
      }).expect(201);

      const supplyB = await createSupply(auth, {
        vehicleId: vehicleB,
        driverId: driverB,
        fuelStationId: stationB.id,
        fuelType: 'ARLA32',
        odometerKm: 20000,
        supplyDate: '2026-06-10T10:00:00.000Z',
      }).expect(201);

      const byVehicle = await request(app.getHttpServer())
        .get(`/api/v1/fuel-supplies?vehicleId=${vehicleB}`)
        .set('Authorization', auth)
        .expect(200);
      expect(byVehicle.body.data.items).toHaveLength(1);
      expect(byVehicle.body.data.items[0].id).toBe(supplyB.body.data.id);

      const byDriver = await request(app.getHttpServer())
        .get(`/api/v1/fuel-supplies?driverId=${driverA}`)
        .set('Authorization', auth)
        .expect(200);
      expect(byDriver.body.data.items).toHaveLength(1);
      expect(byDriver.body.data.items[0].id).toBe(supplyA.body.data.id);

      const byFuelType = await request(app.getHttpServer())
        .get('/api/v1/fuel-supplies?fuelType=ARLA32')
        .set('Authorization', auth)
        .expect(200);
      expect(byFuelType.body.data.items).toHaveLength(1);
      expect(byFuelType.body.data.items[0].id).toBe(supplyB.body.data.id);

      const byStation = await request(app.getHttpServer())
        .get(`/api/v1/fuel-supplies?fuelStationId=${stationA.id}`)
        .set('Authorization', auth)
        .expect(200);
      expect(byStation.body.data.items).toHaveLength(1);
      expect(byStation.body.data.items[0].id).toBe(supplyA.body.data.id);

      const byPeriod = await request(app.getHttpServer())
        .get('/api/v1/fuel-supplies?supplyDateFrom=2026-01-01&supplyDateTo=2026-02-01')
        .set('Authorization', auth)
        .expect(200);
      expect(byPeriod.body.data.items).toHaveLength(1);
      expect(byPeriod.body.data.items[0].id).toBe(supplyA.body.data.id);

      const paginated = await request(app.getHttpServer())
        .get('/api/v1/fuel-supplies?page=1&pageSize=1&sortBy=supplyDate&sortOrder=asc')
        .set('Authorization', auth)
        .expect(200);
      expect(paginated.body.data.items).toHaveLength(1);
      expect(paginated.body.data.meta).toMatchObject({ total: 2, page: 1, pageSize: 1 });
      expect(paginated.body.data.items[0].id).toBe(supplyA.body.data.id);
    });
  });

  describe('GET /fuel-supplies/dashboard', () => {
    it('agrega total/litros/valor/consumo/custo por km e aponta posto/veiculo/motorista com mais abastecimentos', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Dashboard');
      const auth = `Bearer ${adminAccessToken}`;
      const station = await createFuelStation(auth);
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);

      await createSupply(auth, {
        vehicleId,
        driverId,
        fuelStationId: station.id,
        odometerKm: 10000,
        liters: 100,
        pricePerLiter: 5,
        supplyDate: '2026-09-01T10:00:00.000Z',
      }).expect(201);
      await createSupply(auth, {
        vehicleId,
        driverId,
        fuelStationId: station.id,
        odometerKm: 10500,
        liters: 100,
        pricePerLiter: 5,
        supplyDate: '2026-09-05T10:00:00.000Z',
      }).expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/fuel-supplies/dashboard')
        .set('Authorization', auth)
        .expect(200);

      const dashboard = res.body.data;
      expect(dashboard.suppliesCount).toBe(2);
      expect(dashboard.totalLiters).toBe(200);
      expect(dashboard.totalAmount).toBe(1000);
      // distancia = 500; litros apos o 1o = 100 -> consumo = 5 km/l
      expect(dashboard.averageConsumptionKmL).toBeCloseTo(5, 5);
      expect(dashboard.costPerKm).toBeCloseTo(1000 / 500, 5);
      expect(dashboard.mostUsedStation).toMatchObject({ id: station.id, count: 2 });
      expect(dashboard.topVehicle).toMatchObject({ id: vehicleId, count: 2 });
      expect(dashboard.topDriver).toMatchObject({ id: driverId, count: 2 });
    });
  });

  describe('isolamento multi-tenant', () => {
    it('nunca permite acesso cruzado entre tenants', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolA');
      const tenantB = await createTenantAndLoginAsAdmin('IsolB');
      const authA = `Bearer ${tenantA.adminAccessToken}`;
      const authB = `Bearer ${tenantB.adminAccessToken}`;

      const station = await createFuelStation(authA);
      const vehicleId = await createVehicle(authA);
      const driverId = await createDriver(authA);
      const supplyRes = await createSupply(authA, {
        vehicleId,
        driverId,
        fuelStationId: station.id,
      }).expect(201);

      await request(app.getHttpServer())
        .get(`/api/v1/fuel-stations/${station.id}`)
        .set('Authorization', authB)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/v1/fuel-supplies/${supplyRes.body.data.id}`)
        .set('Authorization', authB)
        .expect(404);

      const listInB = await request(app.getHttpServer())
        .get('/api/v1/fuel-supplies')
        .set('Authorization', authB)
        .expect(200);
      expect(
        listInB.body.data.items.find((s: { id: string }) => s.id === supplyRes.body.data.id),
      ).toBeUndefined();
    });
  });

  describe('auditoria', () => {
    it('registra quem, quando, IP, User-Agent, tenant, antes e depois em cada mutacao', async () => {
      const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('Audit');
      const auth = `Bearer ${adminAccessToken}`;
      const station = await createFuelStation(auth);
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);

      const createRes = await createSupply(auth, {
        vehicleId,
        driverId,
        fuelStationId: station.id,
      }).expect(201);
      const id = createRes.body.data.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/fuel-supplies/${id}`)
        .set('Authorization', auth)
        .set('User-Agent', 'jest-e2e-agent')
        .send({ liters: 300 })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/v1/fuel-supplies/${id}`)
        .set('Authorization', auth)
        .expect(204);

      const logs = await prisma.auditLog.findMany({
        where: { tenantId, entityName: 'FuelSupply', entityId: id },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs.map((l) => l.action)).toEqual([
        'fuel_supply.created',
        'fuel_supply.updated',
        'fuel_supply.deleted',
      ]);
      for (const log of logs) {
        expect(log.tenantId).toBe(tenantId);
        expect(log.userId).toBeTruthy();
        expect(log.ipAddress).toBeTruthy();
      }
      const updateLog = logs.find((l) => l.action === 'fuel_supply.updated');
      expect(updateLog?.deviceInfo).toBe('jest-e2e-agent');
      expect(updateLog?.previousValue).toBeTruthy();
      expect(updateLog?.newValue).toBeTruthy();
    });
  });
});
