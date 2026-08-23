import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 66 -- gaps reais identificados na auditoria do ciclo de viagem (ja
// extremamente maduro: maquina de estados, assertCanStart, roteirizacao,
// financeiro, fiscal, Driver App -- tudo ja coberto por trips.e2e-spec.ts/
// driver-trips.e2e-spec.ts/trip-operations*.e2e-spec.ts, nao duplicados
// aqui): (a) TripComposition/AxleConfiguration nao tinham protecao contra
// edicao apos a viagem ja ter partido, (b) TripMetrics.actual* (distancia/
// litros/pedagio/custo executado) nunca era calculado, so actualDurationMin,
// (c) GET /fleet-operations/operations nao separava planejadas/aguardando
// motorista/aguardando saida/pausadas isoladas nem contava viagens sem
// motorista/sem veiculo/atrasadas.
describe('Consolidacao Operacional da Viagem (Fase 66, e2e)', () => {
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
      slug: `toc-${label.toLowerCase()}-${unique}`,
      admin: {
        name: `Admin ${label}`,
        email: `admin-${label.toLowerCase()}-${unique}@teste.com`,
        password: 'SenhaForte123!',
      },
    };
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

  async function createFuelStation(auth: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/fuel-stations')
      .set('Authorization', auth)
      .send({ name: `Posto ${randomUUID()}` })
      .expect(201);
    return res.body.data.id as string;
  }

  // driverId/compositionId sao SEMPRE obrigatorios em POST /trips (nunca
  // opcionais no DTO, confirmado ao rodar este teste pela primeira vez) --
  // "viagem sem motorista"/"sem veiculo" (tripsWithoutDriver/
  // tripsWithoutVehicle) e um estado so alcancavel no nivel do banco
  // (colunas opcionais no schema), nunca produzivel pela API publica hoje.
  // Este helper sempre cria um motorista/veiculo/composicao novos quando
  // nao informados, para nunca cair no 400 de campo obrigatorio ausente.
  async function createTrip(auth: string, overrides: Partial<Record<string, unknown>> = {}) {
    const originId = await createLocation(auth, `Origem ${randomUUID()}`);
    const destinationId = await createLocation(auth, `Destino ${randomUUID()}`);
    const driverId = overrides.driverId ?? (await createDriver(auth));
    let compositionId = overrides.compositionId as string | undefined;
    if (!compositionId) {
      const vehicleId = await createVehicle(auth);
      compositionId = await createComposition(auth, vehicleId);
    }
    const res = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', auth)
      .send({
        originLocationId: originId,
        destinationLocationId: destinationId,
        plannedDeparture: '2026-09-01T08:00:00.000Z',
        plannedArrival: '2026-09-02T18:00:00.000Z',
        driverId,
        compositionId,
        ...overrides,
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function setupDriverWithTrip(adminAuth: string, tenantId: string) {
    const vehicleId = await createVehicle(adminAuth);
    const driverId = await createDriver(adminAuth);
    const compositionId = await createComposition(adminAuth, vehicleId);
    const tripId = await createTrip(adminAuth, { driverId, compositionId });

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

    return { driverId, vehicleId, compositionId, tripId, driverAuth: `Bearer ${loginRes.body.data.accessToken as string}` };
  }

  describe('imutabilidade historica da composicao', () => {
    it('permite editar veiculo/eixos livremente enquanto a viagem nunca partiu', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('LockNeverStarted');
      const vehicleId = await createVehicle(adminAuth);
      const otherVehicleId = await createVehicle(adminAuth);
      const compositionId = await createComposition(adminAuth, vehicleId);
      await createTrip(adminAuth, { compositionId }); // permanece PLANNED, nunca inicia

      await request(app.getHttpServer())
        .patch(`/api/v1/trip-compositions/${compositionId}`)
        .set('Authorization', adminAuth)
        .send({ vehicleId: otherVehicleId })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/trip-compositions/${compositionId}/axle-configuration`)
        .set('Authorization', adminAuth)
        .send({ totalAxles: 9, billableCategory: '9 eixos' })
        .expect(200);
    });

    it('bloqueia troca de veiculo e configuracao de eixos apos a viagem partir (IN_PROGRESS)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('LockStarted');
      const vehicleId = await createVehicle(adminAuth);
      const otherVehicleId = await createVehicle(adminAuth);
      const driverId = await createDriver(adminAuth);
      const compositionId = await createComposition(adminAuth, vehicleId);
      const tripId = await createTrip(adminAuth, { driverId, compositionId });

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/trip-compositions/${compositionId}`)
        .set('Authorization', adminAuth)
        .send({ vehicleId: otherVehicleId })
        .expect(409);

      await request(app.getHttpServer())
        .patch(`/api/v1/trip-compositions/${compositionId}/axle-configuration`)
        .set('Authorization', adminAuth)
        .send({ totalAxles: 9, billableCategory: '9 eixos' })
        .expect(409);
    });

    it('composicao vinculada a viagem CANCELLED que nunca partiu continua editavel', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('LockCancelledNeverStarted');
      const vehicleId = await createVehicle(adminAuth);
      const otherVehicleId = await createVehicle(adminAuth);
      const compositionId = await createComposition(adminAuth, vehicleId);
      const tripId = await createTrip(adminAuth, { compositionId });

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/cancel`)
        .set('Authorization', adminAuth)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/trip-compositions/${compositionId}`)
        .set('Authorization', adminAuth)
        .send({ vehicleId: otherVehicleId })
        .expect(200);
    });
  });

  describe('TripMetrics.actual* calculado ao concluir a viagem', () => {
    it('calcula actualDistanceKm/actualFuelLiters/actualTollAmount/actualTotalCost reaproveitando dados reais', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('ActualMetrics');
      const { tripId, vehicleId, driverId, driverAuth } = await setupDriverWithTrip(adminAuth, tenantId);

      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .send({ odometerKm: 100000 })
        .expect(201);

      const fuelStationId = await createFuelStation(adminAuth);
      await request(app.getHttpServer())
        .post('/api/v1/fuel-supplies')
        .set('Authorization', adminAuth)
        .send({
          tripId,
          vehicleId,
          driverId,
          fuelStationId,
          fuelType: 'DIESEL_S10',
          liters: 200,
          pricePerLiter: 5,
          odometerKm: 100200,
          supplyDate: '2026-09-01T12:00:00.000Z',
        })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'COMPLETED', finalOdometerKm: 100500 })
        .expect(200);

      const metricsRes = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/metrics`)
        .set('Authorization', adminAuth)
        .expect(200);

      expect(metricsRes.body.data.actualDistanceKm).toBe(500);
      expect(metricsRes.body.data.actualFuelLiters).toBe(200);
      expect(metricsRes.body.data.actualTollAmount).toBe(0);
      expect(metricsRes.body.data.actualTotalCost).toBe(1000); // 200L * R$5
      expect(metricsRes.body.data.actualDurationMin).not.toBeNull();
    });

    it('actualDistanceKm fica null quando finalOdometerKm nao e informado no encerramento', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('ActualMetricsNoOdometer');
      const { tripId, driverAuth } = await setupDriverWithTrip(adminAuth, tenantId);

      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .send({ odometerKm: 50000 })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'COMPLETED' })
        .expect(200);

      const metricsRes = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/metrics`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(metricsRes.body.data.actualDistanceKm).toBeNull();
      expect(metricsRes.body.data.actualFuelLiters).toBeNull(); // nenhum abastecimento -- nunca 0 mascarando ausencia
    });
  });

  describe('GET /fleet-operations/operations -- KPIs do funil operacional', () => {
    it('separa planejadas/aguardando motorista/pausadas e calcula atrasadas por plannedArrival', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('OperationsKpis');

      // Planejada (motorista/composicao sempre obrigatorios em POST /trips
      // -- tripsWithoutDriver/tripsWithoutVehicle so sao alcancaveis no
      // nivel do banco, nunca pela API publica; testados como 0 abaixo).
      await createTrip(adminAuth);

      // Aguardando motorista.
      const vehicleA = await createVehicle(adminAuth);
      const compositionA = await createComposition(adminAuth, vehicleA);
      const driverA = await createDriver(adminAuth);
      const tripWaitingDriver = await createTrip(adminAuth, { driverId: driverA, compositionId: compositionA });
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripWaitingDriver}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'WAITING_DRIVER' })
        .expect(200);

      // Pausada.
      const vehicleB = await createVehicle(adminAuth);
      const compositionB = await createComposition(adminAuth, vehicleB);
      const driverB = await createDriver(adminAuth);
      const tripPaused = await createTrip(adminAuth, { driverId: driverB, compositionId: compositionB });
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripPaused}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripPaused}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'PAUSED' })
        .expect(200);

      // Atrasada (plannedArrival no passado, ainda nao finalizada).
      await createTrip(adminAuth, {
        plannedDeparture: '2020-01-01T08:00:00.000Z',
        plannedArrival: '2020-01-02T08:00:00.000Z',
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/operations')
        .set('Authorization', adminAuth)
        .expect(200);

      expect(res.body.data.plannedTrips).toBeGreaterThanOrEqual(2); // a "normal" + a "atrasada" (ambas ficam PLANNED)
      expect(res.body.data.waitingDriverTrips).toBe(1);
      expect(res.body.data.pausedTrips).toBe(1);
      expect(res.body.data.inProgressTrips).toBeGreaterThanOrEqual(1); // PAUSED tambem conta em inProgressTrips (IN_PROGRESS+PAUSED)
      // driverId/compositionId sao sempre obrigatorios em POST /trips --
      // nenhuma viagem criada pela API publica fica sem motorista/veiculo.
      expect(res.body.data.tripsWithoutDriver).toBe(0);
      expect(res.body.data.tripsWithoutVehicle).toBe(0);
      expect(res.body.data.delayedTrips).toBeGreaterThanOrEqual(1);
    });

    it('isolamento multi-tenant: contagens de um tenant nunca vazam para outro', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('OperationsKpisIsolA');
      await createTrip(tenantA.adminAuth);

      const tenantB = await createTenantAndLoginAsAdmin('OperationsKpisIsolB');
      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/operations')
        .set('Authorization', tenantB.adminAuth)
        .expect(200);
      expect(res.body.data.plannedTrips).toBe(0);
      expect(res.body.data.waitingDriverTrips).toBe(0);
      expect(res.body.data.pausedTrips).toBe(0);
      expect(res.body.data.tripsWithoutDriver).toBe(0);
      expect(res.body.data.tripsWithoutVehicle).toBe(0);
      expect(res.body.data.delayedTrips).toBe(0);
    });
  });
});
