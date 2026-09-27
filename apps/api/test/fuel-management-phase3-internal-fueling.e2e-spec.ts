import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Gestao de Combustivel, Fase 3 -- abastecimento interno (Driver App -> tanque
// -> FuelSupply). Cobre a regra central: FuelSupply + FuelTankMovement
// (INTERNAL_FUELING) + baixa do tanque numa UNICA transacao atomica,
// reaproveitando applyMovement (Fase 1) via FuelTanksService.
// registerInternalFueling -- nunca um segundo ledger/motor de saldo.
describe('Gestao de Combustivel -- Abastecimento Interno (Fase 3, e2e)', () => {
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
      slug: `fuel-p3-${label.toLowerCase()}-${unique}`,
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
    return { tenantId, adminAuth: `Bearer ${loginRes.body.data.accessToken as string}` };
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

  async function createFuelTank(auth: string, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/fuel-tanks')
      .set('Authorization', auth)
      .send({ name: 'Tanque matriz', capacityLiters: 15000, initialStockLiters: 7850, ...overrides })
      .expect(201);
    return res.body.data as { id: string; currentStockLiters: number };
  }

  // Cria veiculo + motorista + viagem + usuario DRIVER vinculado e logado --
  // mesmo padrao de setupDriverWithTrip em driver-trips.e2e-spec.ts.
  async function setupDriverWithTrip(adminAuth: string, tenantId: string) {
    const vehicleId = await createVehicle(adminAuth);
    const driverId = await createDriver(adminAuth);
    const compositionId = await createComposition(adminAuth, vehicleId);
    const originId = await createLocation(adminAuth, `Origem ${randomUUID()}`);
    const destinationId = await createLocation(adminAuth, `Destino ${randomUUID()}`);

    const tripRes = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', adminAuth)
      .send({
        driverId,
        compositionId,
        originLocationId: originId,
        destinationLocationId: destinationId,
        plannedDeparture: '2026-09-01T08:00:00.000Z',
        plannedArrival: '2026-09-02T18:00:00.000Z',
      })
      .expect(201);
    const tripId = tripRes.body.data.id as string;

    const unique = randomUUID().replace(/-/g, '').slice(0, 10);
    const email = `driver-${unique}@teste.com`;
    const password = 'SenhaForte123!';
    const userRes = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', adminAuth)
      .send({ name: 'Motorista App', email, password, role: 'DRIVER' })
      .expect(201);
    const userAccountId = userRes.body.data.id as string;

    await request(app.getHttpServer())
      .patch(`/api/v1/drivers/${driverId}/user-link`)
      .set('Authorization', adminAuth)
      .send({ userAccountId })
      .expect(200);

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email, password })
      .expect(200);

    return { driverId, vehicleId, tripId, driverAuth: `Bearer ${loginRes.body.data.accessToken as string}` };
  }

  describe('abastecimento interno valido', () => {
    it('cria FuelSupply + FuelTankMovement(INTERNAL_FUELING) numa transacao, baixa o tanque e vincula tudo', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Valid');
      const tank = await createFuelTank(adminAuth, { initialStockLiters: 7850, capacityLiters: 15000 });
      const { driverId, vehicleId, tripId, driverAuth } = await setupDriverWithTrip(adminAuth, tenantId);

      const deviceEventId = randomUUID();
      const res = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/fuel-supplies`)
        .set('Authorization', driverAuth)
        .send({ deviceEventId, odometerKm: 100300, liters: 300, fuelTankId: tank.id })
        .expect(201);

      expect(res.body.data.fuelTankId).toBe(tank.id);
      expect(res.body.data.vehicleId).toBe(vehicleId);
      expect(res.body.data.driverId).toBe(driverId);
      expect(res.body.data.liters).toBe(300);
      const supplyId = res.body.data.id as string;

      const tankAfter = await request(app.getHttpServer()).get(`/api/v1/fuel-tanks/${tank.id}`).set('Authorization', adminAuth).expect(200);
      expect(tankAfter.body.data.currentStockLiters).toBe(7550); // 7850 - 300

      const movements = await request(app.getHttpServer())
        .get(`/api/v1/fuel-tanks/${tank.id}/movements`)
        .set('Authorization', adminAuth)
        .expect(200);
      const movement = movements.body.data.items.find((m: { type: string }) => m.type === 'INTERNAL_FUELING');
      expect(movement).toBeDefined();
      expect(movement.fuelSupplyId).toBe(supplyId);
      expect(movement.vehicleId).toBe(vehicleId);
      expect(movement.driverId).toBe(driverId);
      expect(movement.tripId).toBe(tripId);
      expect(movement.previousBalanceLiters).toBe(7850);
      expect(movement.newBalanceLiters).toBe(7550);
      expect(movement.quantityLiters).toBe(300);

      const auditLog = await prisma.auditLog.findFirst({
        where: { tenantId, entityName: 'FuelTank', action: 'fuel_tank.internal_fueling_registered', entityId: tank.id },
      });
      expect(auditLog).not.toBeNull();
    });

    it('o abastecimento interno aparece no detalhe administrativo com tanque identificavel', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('AdminDetail');
      const tank = await createFuelTank(adminAuth);
      const { tripId, driverAuth } = await setupDriverWithTrip(adminAuth, tenantId);

      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/fuel-supplies`)
        .set('Authorization', driverAuth)
        .send({ deviceEventId: randomUUID(), odometerKm: 100300, liters: 300, fuelTankId: tank.id })
        .expect(201);

      const detail = await request(app.getHttpServer())
        .get(`/api/v1/fuel-supplies/${createRes.body.data.id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(detail.body.data.fuelTankId).toBe(tank.id);
      expect(detail.body.data.fuelTankName).toBe('Tanque matriz');
      expect(detail.body.data.fuelStationId).toBeNull(); // interno nunca tem posto
    });
  });

  describe('rejeicoes -- nenhum registro parcial', () => {
    it('saldo insuficiente: rejeita, nao cria FuelSupply nem movimentacao, saldo inalterado', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Insufficient');
      const tank = await createFuelTank(adminAuth, { initialStockLiters: 200, capacityLiters: 1000 });
      const { tripId, driverAuth } = await setupDriverWithTrip(adminAuth, tenantId);

      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/fuel-supplies`)
        .set('Authorization', driverAuth)
        .send({ deviceEventId: randomUUID(), odometerKm: 100300, liters: 300, fuelTankId: tank.id })
        .expect(409);

      expect(await prisma.fuelSupply.count({ where: { tripId } })).toBe(0);
      expect(await prisma.fuelTankMovement.count({ where: { tankId: tank.id, type: 'INTERNAL_FUELING' } })).toBe(0);
      const tankAfter = await request(app.getHttpServer()).get(`/api/v1/fuel-tanks/${tank.id}`).set('Authorization', adminAuth).expect(200);
      expect(tankAfter.body.data.currentStockLiters).toBe(200);
    });

    it('tanque inativo: rejeita, nao cria FuelSupply nem movimentacao', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('InactiveTank');
      const tank = await createFuelTank(adminAuth, { initialStockLiters: 1000, capacityLiters: 2000 });
      await request(app.getHttpServer()).patch(`/api/v1/fuel-tanks/${tank.id}/status`).set('Authorization', adminAuth).send({ isActive: false }).expect(200);
      const { tripId, driverAuth } = await setupDriverWithTrip(adminAuth, tenantId);

      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/fuel-supplies`)
        .set('Authorization', driverAuth)
        .send({ deviceEventId: randomUUID(), odometerKm: 100300, liters: 100, fuelTankId: tank.id })
        .expect(409);

      expect(await prisma.fuelSupply.count({ where: { tripId } })).toBe(0);
    });

    it('tanque de outro tenant: 404, nada criado', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('CrossTenantA');
      const tenantB = await createTenantAndLoginAsAdmin('CrossTenantB');
      const tankFromB = await createFuelTank(tenantB.adminAuth);
      const { tripId, driverAuth } = await setupDriverWithTrip(tenantA.adminAuth, tenantA.tenantId);

      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/fuel-supplies`)
        .set('Authorization', driverAuth)
        .send({ deviceEventId: randomUUID(), odometerKm: 100300, liters: 100, fuelTankId: tankFromB.id })
        .expect(404);

      expect(await prisma.fuelSupply.count({ where: { tripId } })).toBe(0);
    });

    it('motorista nao acessa viagem de outro motorista (mesmo tenant) -- 403, nada criado', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('WrongDriver');
      const tank = await createFuelTank(adminAuth);
      const driverA = await setupDriverWithTrip(adminAuth, tenantId);
      const driverB = await setupDriverWithTrip(adminAuth, tenantId);

      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${driverB.tripId}/fuel-supplies`)
        .set('Authorization', driverA.driverAuth)
        .send({ deviceEventId: randomUUID(), odometerKm: 100300, liters: 100, fuelTankId: tank.id })
        .expect(403);

      expect(await prisma.fuelSupply.count({ where: { tripId: driverB.tripId } })).toBe(0);
    });
  });

  describe('idempotencia (retry do Driver App)', () => {
    it('reenviar o mesmo deviceEventId devolve o mesmo registro, sem duplicar FuelSupply/movimentacao/baixa', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Idempotent');
      const tank = await createFuelTank(adminAuth, { initialStockLiters: 1000, capacityLiters: 2000 });
      const { tripId, driverAuth } = await setupDriverWithTrip(adminAuth, tenantId);

      const deviceEventId = randomUUID();
      const payload = { deviceEventId, odometerKm: 100300, liters: 300, fuelTankId: tank.id };

      const first = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/fuel-supplies`)
        .set('Authorization', driverAuth)
        .send(payload)
        .expect(201);
      const second = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/fuel-supplies`)
        .set('Authorization', driverAuth)
        .send(payload)
        .expect(201);

      expect(second.body.data.id).toBe(first.body.data.id);
      expect(await prisma.fuelSupply.count({ where: { tripId, deviceEventId } })).toBe(1);
      expect(await prisma.fuelTankMovement.count({ where: { tankId: tank.id, type: 'INTERNAL_FUELING' } })).toBe(1);

      const tankAfter = await request(app.getHttpServer()).get(`/api/v1/fuel-tanks/${tank.id}`).set('Authorization', adminAuth).expect(200);
      expect(tankAfter.body.data.currentStockLiters).toBe(700); // baixado uma unica vez
    });
  });

  describe('concorrencia (secao 7 do pedido)', () => {
    it('dois motoristas abastecendo 300L simultaneamente de um tanque de 500L -- exatamente um sucede', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Concurrency');
      const tank = await createFuelTank(adminAuth, { initialStockLiters: 500, capacityLiters: 500 });
      const driverA = await setupDriverWithTrip(adminAuth, tenantId);
      const driverB = await setupDriverWithTrip(adminAuth, tenantId);

      const attempt = (driver: typeof driverA) =>
        request(app.getHttpServer())
          .post(`/api/v1/driver/trips/${driver.tripId}/fuel-supplies`)
          .set('Authorization', driver.driverAuth)
          .send({ deviceEventId: randomUUID(), odometerKm: 100300, liters: 300, fuelTankId: tank.id });

      const [resA, resB] = await Promise.all([attempt(driverA), attempt(driverB)]);
      const statuses = [resA.status, resB.status];
      expect(statuses.filter((s) => s === 201).length).toBe(1);
      // A perdedora quase sempre e 409 (saldo insuficiente); um conflito real
      // de serializacao do Postgres apos o retry de runSerializable (mesma
      // limitacao pre-existente ja documentada nas Fases 1/2) pode surgir
      // como 500 -- o saldo final abaixo e o invariante que realmente importa.
      expect(statuses.every((s) => s === 201 || s === 409 || s === 500)).toBe(true);

      const tankAfter = await request(app.getHttpServer()).get(`/api/v1/fuel-tanks/${tank.id}`).set('Authorization', adminAuth).expect(200);
      expect(tankAfter.body.data.currentStockLiters).toBe(200); // nunca -100

      expect(await prisma.fuelTankMovement.count({ where: { tankId: tank.id, type: 'INTERNAL_FUELING' } })).toBe(1);
      expect(await prisma.fuelSupply.count({ where: { OR: [{ tripId: driverA.tripId }, { tripId: driverB.tripId }] } })).toBe(1);
    });
  });

  describe('regressao: abastecimento externo continua sem tocar o tanque', () => {
    it('sem fuelTankId, o abastecimento e externo e nenhum FuelTank e alterado', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('ExternalRegression');
      const tank = await createFuelTank(adminAuth, { initialStockLiters: 1000, capacityLiters: 2000 });
      const { tripId, driverAuth } = await setupDriverWithTrip(adminAuth, tenantId);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/fuel-supplies`)
        .set('Authorization', driverAuth)
        .send({ deviceEventId: randomUUID(), odometerKm: 100300, liters: 300 })
        .expect(201);

      expect(res.body.data.fuelTankId).toBeNull();

      const tankAfter = await request(app.getHttpServer()).get(`/api/v1/fuel-tanks/${tank.id}`).set('Authorization', adminAuth).expect(200);
      expect(tankAfter.body.data.currentStockLiters).toBe(1000); // inalterado
      expect(await prisma.fuelTankMovement.count({ where: { tankId: tank.id } })).toBe(1); // so o INITIAL_BALANCE da criacao
    });
  });

  describe('GET /driver/fuel-tanks (secao 10)', () => {
    it('lista somente tanques ACTIVE do proprio tenant', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('DriverList');
      const activeTank = await createFuelTank(adminAuth, { name: 'Ativo' });
      const inactiveTank = await createFuelTank(adminAuth, { name: 'Inativo' });
      await request(app.getHttpServer()).patch(`/api/v1/fuel-tanks/${inactiveTank.id}/status`).set('Authorization', adminAuth).send({ isActive: false }).expect(200);
      const { driverAuth } = await setupDriverWithTrip(adminAuth, tenantId);

      const res = await request(app.getHttpServer()).get('/api/v1/driver/fuel-tanks').set('Authorization', driverAuth).expect(200);
      const ids = res.body.data.map((t: { id: string }) => t.id);
      expect(ids).toContain(activeTank.id);
      expect(ids).not.toContain(inactiveTank.id);
    });

    it('nunca lista tanques de outro tenant', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('DriverListA');
      const tenantB = await createTenantAndLoginAsAdmin('DriverListB');
      const tankFromB = await createFuelTank(tenantB.adminAuth);
      const { driverAuth } = await setupDriverWithTrip(tenantA.adminAuth, tenantA.tenantId);

      const res = await request(app.getHttpServer()).get('/api/v1/driver/fuel-tanks').set('Authorization', driverAuth).expect(200);
      expect(res.body.data.map((t: { id: string }) => t.id)).not.toContain(tankFromB.id);
    });
  });
});
