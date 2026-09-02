import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { VehicleIdlePeriodsService } from '../src/vehicle-idle-periods/services/vehicle-idle-periods.service';

// Fase B -- periodo OCIOSO PERSISTIDO entre operacoes (VehicleIdlePeriod).
// Viagem COMPLETED -> periodo aberto. Inicio da proxima viagem -> periodo
// fechado (duracao calculada no backend, nunca negativa). Um veiculo nunca
// tem 2 periodos abertos. Migration aditiva -- Trip.actualArrival/
// actualDeparture e VehicleMaintenance intactos.
describe('Vehicle Idle Periods (Fase B, e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let idleService: VehicleIdlePeriodsService;
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    idleService = app.get(VehicleIdlePeriodsService);
  });

  afterAll(async () => {
    for (const id of createdTenantIds) {
      await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
    }
    await app.close();
  });

  const randomCnpj = () => Array.from({ length: 14 }, () => Math.floor(Math.random() * 10)).join('');
  const randomPlate = () =>
    `${Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('')}${Math.floor(1000 + Math.random() * 9000)}`;
  function randomValidCpf(): string {
    const d = (nums: number[], f: number) => {
      let t = 0;
      let k = f;
      for (const n of nums) {
        t += n * k;
        k -= 1;
      }
      const r = t % 11;
      return r < 2 ? 0 : 11 - r;
    };
    const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 9));
    const d1 = d(base, 10);
    return [...base, d1, d([...base, d1], 11)].join('');
  }

  async function createTenantAndLoginAsAdmin(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    const payload = {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `idlep-${label.toLowerCase()}-${unique}`,
      admin: { name: `Admin ${label}`, email: `admin-${label.toLowerCase()}-${unique}@teste.com`, password: 'SenhaForte123!' },
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

  async function createUserWithRole(tenantId: string, adminAuth: string, role: string) {
    const email = `u-${role.toLowerCase()}-${randomUUID()}@teste.com`;
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', adminAuth)
      .send({ name: `U ${role}`, email, password: 'SenhaForte123!', role })
      .expect(201);
    const loginRes = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ tenantId, email, password: 'SenhaForte123!' }).expect(200);
    return `Bearer ${loginRes.body.data.accessToken}`;
  }

  async function createVehicle(auth: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/vehicles')
      .set('Authorization', auth)
      .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH', type: 'TRACTOR_UNIT' })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createDriver(auth: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/drivers')
      .set('Authorization', auth)
      .send({ name: 'Jose', cpf: randomValidCpf(), cnhNumber: String(Math.floor(1e10 + Math.random() * 8e10)), cnhCategory: 'AE', cnhExpiresAt: '2028-06-30' })
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

  async function createTripPlanned(auth: string, vehicleId: string, destinationName = `Destino ${randomUUID()}`) {
    const driverId = await createDriver(auth);
    const compRes = await request(app.getHttpServer())
      .post('/api/v1/trip-compositions')
      .set('Authorization', auth)
      .send({ vehicleId, trailers: [], axleConfiguration: { totalAxles: 6, billableCategory: '6 eixos' } })
      .expect(201);
    const originId = await createLocation(auth, `Origem ${randomUUID()}`);
    const destinationId = await createLocation(auth, destinationName);
    const res = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', auth)
      .send({
        driverId,
        compositionId: compRes.body.data.id,
        originLocationId: originId,
        destinationLocationId: destinationId,
        plannedDeparture: '2026-01-01T08:00:00.000Z',
        plannedArrival: '2026-01-02T18:00:00.000Z',
      })
      .expect(201);
    return res.body.data.id as string;
  }

  const setStatus = (auth: string, tripId: string, status: string) =>
    request(app.getHttpServer()).patch(`/api/v1/trips/${tripId}/status`).set('Authorization', auth).send({ status }).expect(200);

  async function openPeriodsFor(tenantId: string, vehicleId: string) {
    return prisma.vehicleIdlePeriod.findMany({ where: { tenantId, vehicleId, endedAt: null } });
  }

  // Fase C -- cria a viagem PLANNED e da ao motorista um login proprio
  // (UserAccount role DRIVER vinculado ao Driver via PATCH /drivers/:id/
  // user-link), exatamente o fluxo ja existente reaproveitado. Devolve
  // tambem o adminAuth para dirigir o ciclo da viagem quando conveniente.
  async function createDriverTrip(
    tenantId: string,
    adminAuth: string,
    vehicleId: string,
    destinationName = `Destino ${randomUUID()}`,
  ) {
    const driverId = await createDriver(adminAuth);
    const compRes = await request(app.getHttpServer())
      .post('/api/v1/trip-compositions')
      .set('Authorization', adminAuth)
      .send({ vehicleId, trailers: [], axleConfiguration: { totalAxles: 6, billableCategory: '6 eixos' } })
      .expect(201);
    const originId = await createLocation(adminAuth, `Origem ${randomUUID()}`);
    const destinationId = await createLocation(adminAuth, destinationName);
    const tripRes = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', adminAuth)
      .send({
        driverId,
        compositionId: compRes.body.data.id,
        originLocationId: originId,
        destinationLocationId: destinationId,
        plannedDeparture: '2026-01-01T08:00:00.000Z',
        plannedArrival: '2026-01-02T18:00:00.000Z',
      })
      .expect(201);

    const unique = randomUUID().replace(/-/g, '').slice(0, 10);
    const email = `driver-${unique}@teste.com`;
    const password = 'SenhaForte123!';
    const userRes = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', adminAuth)
      .send({ name: 'Motorista App', email, password, role: 'DRIVER' })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/drivers/${driverId}/user-link`)
      .set('Authorization', adminAuth)
      .send({ userAccountId: userRes.body.data.id })
      .expect(200);
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email, password })
      .expect(200);

    return { driverId, tripId: tripRes.body.data.id as string, driverAuth: `Bearer ${loginRes.body.data.accessToken as string}` };
  }

  // ==========================================================================
  // Abertura automatica (COMPLETED)
  // ==========================================================================
  describe('COMPLETED -> abre periodo ocioso', () => {
    it('cria UM periodo ABERTO com tripBeforeId, source=AUTO, reason default, endedAt/durationMinutes nulos', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('AutoOpen');
      const vehicleId = await createVehicle(adminAuth);
      const tripId = await createTripPlanned(adminAuth, vehicleId);
      await setStatus(adminAuth, tripId, 'IN_PROGRESS');
      await setStatus(adminAuth, tripId, 'COMPLETED');

      const periods = await prisma.vehicleIdlePeriod.findMany({ where: { tenantId, vehicleId } });
      expect(periods).toHaveLength(1);
      expect(periods[0]).toMatchObject({
        vehicleId,
        tripBeforeId: tripId,
        tripAfterId: null,
        endedAt: null,
        durationMinutes: null,
        source: 'AUTO',
        reason: 'AGUARDANDO_ORDEM',
      });
      expect(periods[0]!.startedAt).toBeInstanceOf(Date);
    });

    it('respeita TenantSettings.preferences.defaultIdleReason quando configurado', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('AutoOpenReason');
      await request(app.getHttpServer())
        .patch('/api/v1/tenant-settings')
        .set('Authorization', adminAuth)
        .send({ preferences: { defaultIdleReason: 'PATIO' } })
        .expect(200);
      const vehicleId = await createVehicle(adminAuth);
      const tripId = await createTripPlanned(adminAuth, vehicleId);
      await setStatus(adminAuth, tripId, 'IN_PROGRESS');
      await setStatus(adminAuth, tripId, 'COMPLETED');
      const [period] = await openPeriodsFor(tenantId, vehicleId);
      expect(period.reason).toBe('PATIO');
    });

    it('GET /fleet-operations/idle-periods?open=true reflete o periodo aberto com status/placa/destino da viagem anterior', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('AutoOpenApi');
      const vehicleId = await createVehicle(adminAuth);
      const tripId = await createTripPlanned(adminAuth, vehicleId, 'CD Campinas/SP');
      await setStatus(adminAuth, tripId, 'IN_PROGRESS');
      await setStatus(adminAuth, tripId, 'COMPLETED');

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/idle-periods')
        .set('Authorization', adminAuth)
        .query({ vehicleId, open: 'true' })
        .expect(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0]).toMatchObject({
        vehicleId,
        status: 'OPEN',
        source: 'AUTO',
        tripBeforeId: tripId,
        previousDestinationLabel: 'CD Campinas/SP',
        endedAt: null,
      });
      expect(typeof res.body.data.items[0].plate).toBe('string');
    });

    it('timeline da viagem concluida inclui o evento IDLE_PERIOD "Periodo parado iniciado"', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('AutoOpenTimeline');
      const vehicleId = await createVehicle(adminAuth);
      const tripId = await createTripPlanned(adminAuth, vehicleId);
      await setStatus(adminAuth, tripId, 'IN_PROGRESS');
      await setStatus(adminAuth, tripId, 'COMPLETED');

      const res = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/timeline`)
        .set('Authorization', adminAuth)
        .query({ origin: 'IDLE_PERIOD' })
        .expect(200);
      expect(res.body.data.items.some((e: { label: string }) => e.label === 'Periodo parado iniciado')).toBe(true);
    });
  });

  // ==========================================================================
  // Fechamento automatico (proxima viagem inicia)
  // ==========================================================================
  describe('nova viagem inicia -> fecha periodo ocioso', () => {
    it('fecha o periodo aberto: endedAt setado, tripAfterId correto, durationMinutes calculado, status CLOSED', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('AutoClose');
      const vehicleId = await createVehicle(adminAuth);
      const tripA = await createTripPlanned(adminAuth, vehicleId);
      await setStatus(adminAuth, tripA, 'IN_PROGRESS');
      await setStatus(adminAuth, tripA, 'COMPLETED');

      // Backdata o inicio do periodo em 3h para uma duracao deterministica.
      await prisma.vehicleIdlePeriod.updateMany({
        where: { tenantId, vehicleId, endedAt: null },
        data: { startedAt: new Date(Date.now() - 180 * 60 * 1000) },
      });

      const tripB = await createTripPlanned(adminAuth, vehicleId);
      await setStatus(adminAuth, tripB, 'IN_PROGRESS');

      const periods = await prisma.vehicleIdlePeriod.findMany({ where: { tenantId, vehicleId } });
      expect(periods).toHaveLength(1);
      expect(periods[0]!.endedAt).not.toBeNull();
      expect(periods[0]!.tripAfterId).toBe(tripB);
      expect(periods[0]!.durationMinutes).toBeGreaterThanOrEqual(178);
      expect(periods[0]!.durationMinutes).toBeLessThanOrEqual(182);
      expect(await openPeriodsFor(tenantId, vehicleId)).toHaveLength(0);
    });

    it('duracao NUNCA negativa: se o inicio da viagem e anterior ao startedAt do periodo (skew), duracao = 0 e endedAt = startedAt', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('AutoCloseNeg');
      const vehicleId = await createVehicle(adminAuth);
      const tripA = await createTripPlanned(adminAuth, vehicleId);
      await setStatus(adminAuth, tripA, 'IN_PROGRESS');
      await setStatus(adminAuth, tripA, 'COMPLETED');

      const future = new Date(Date.now() + 60 * 60 * 1000);
      await prisma.vehicleIdlePeriod.updateMany({ where: { tenantId, vehicleId, endedAt: null }, data: { startedAt: future } });

      const tripB = await createTripPlanned(adminAuth, vehicleId);
      await setStatus(adminAuth, tripB, 'IN_PROGRESS');

      const [period] = await prisma.vehicleIdlePeriod.findMany({ where: { tenantId, vehicleId } });
      expect(period.durationMinutes).toBe(0);
      expect(period.endedAt!.getTime()).toBe(period.startedAt.getTime());
      expect(period.durationMinutes! >= 0).toBe(true);
    });

    it('sem periodo aberto -> inicio de viagem NAO cria periodo retroativo', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('NoRetro');
      const vehicleId = await createVehicle(adminAuth);
      const trip = await createTripPlanned(adminAuth, vehicleId);
      await setStatus(adminAuth, trip, 'IN_PROGRESS');
      expect(await prisma.vehicleIdlePeriod.count({ where: { tenantId, vehicleId } })).toBe(0);
    });

    it('timeline da viagem que iniciou inclui o evento IDLE_PERIOD "Periodo parado encerrado"', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('CloseTimeline');
      const vehicleId = await createVehicle(adminAuth);
      const tripA = await createTripPlanned(adminAuth, vehicleId);
      await setStatus(adminAuth, tripA, 'IN_PROGRESS');
      await setStatus(adminAuth, tripA, 'COMPLETED');
      await prisma.vehicleIdlePeriod.updateMany({
        where: { tenantId, vehicleId, endedAt: null },
        data: { startedAt: new Date(Date.now() - 60 * 60 * 1000) },
      });
      const tripB = await createTripPlanned(adminAuth, vehicleId);
      await setStatus(adminAuth, tripB, 'IN_PROGRESS');

      const res = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripB}/timeline`)
        .set('Authorization', adminAuth)
        .query({ origin: 'IDLE_PERIOD' })
        .expect(200);
      expect(res.body.data.items.some((e: { label: string }) => e.label === 'Periodo parado encerrado')).toBe(true);
    });
  });

  // ==========================================================================
  // Idempotencia / concorrencia (secao 5 / 12)
  // ==========================================================================
  describe('idempotencia e concorrencia', () => {
    it('reprocessar a abertura (openForCompletedTrip 2x para o mesmo veiculo) NUNCA cria um 2o periodo', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Idem');
      const vehicleId = await createVehicle(adminAuth);
      const tripId = await createTripPlanned(adminAuth, vehicleId);
      await setStatus(adminAuth, tripId, 'IN_PROGRESS');
      await setStatus(adminAuth, tripId, 'COMPLETED'); // ja abriu 1

      const r2 = await prisma.$transaction((tx) =>
        idleService.openForCompletedTrip(tx, { tenantId, vehicleId, startedAt: new Date(), tripBeforeId: tripId }),
      );
      const r3 = await prisma.$transaction((tx) =>
        idleService.openForCompletedTrip(tx, { tenantId, vehicleId, startedAt: new Date(), tripBeforeId: tripId }),
      );
      expect(r2.created).toBe(false);
      expect(r3.created).toBe(false);
      expect(await prisma.vehicleIdlePeriod.count({ where: { tenantId, vehicleId } })).toBe(1);
    });

    it('o banco impede 2 periodos ABERTOS para o mesmo veiculo (indice unico parcial -> P2002)', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('TwoOpen');
      const vehicleId = await createVehicle(adminAuth);
      const tripId = await createTripPlanned(adminAuth, vehicleId);
      await setStatus(adminAuth, tripId, 'IN_PROGRESS');
      await setStatus(adminAuth, tripId, 'COMPLETED');

      await expect(
        prisma.vehicleIdlePeriod.create({
          data: { tenantId, vehicleId, startedAt: new Date(), source: 'MANUAL_ADMIN', reason: 'OUTRO' },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('fechar de novo (closeForStartedTrip sem periodo aberto) NAO altera o periodo ja fechado', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('CloseTwice');
      const vehicleId = await createVehicle(adminAuth);
      const tripA = await createTripPlanned(adminAuth, vehicleId);
      await setStatus(adminAuth, tripA, 'IN_PROGRESS');
      await setStatus(adminAuth, tripA, 'COMPLETED');
      const tripB = await createTripPlanned(adminAuth, vehicleId);
      await setStatus(adminAuth, tripB, 'IN_PROGRESS'); // fecha P1

      const closedBefore = await prisma.vehicleIdlePeriod.findFirst({ where: { tenantId, vehicleId } });
      const r = await prisma.$transaction((tx) =>
        idleService.closeForStartedTrip(tx, { tenantId, vehicleId, endedAt: new Date(), tripAfterId: tripB }),
      );
      expect(r.closed).toBe(false);
      const closedAfter = await prisma.vehicleIdlePeriod.findFirst({ where: { tenantId, vehicleId } });
      expect(closedAfter!.endedAt!.getTime()).toBe(closedBefore!.endedAt!.getTime());
      expect(closedAfter!.tripAfterId).toBe(tripB);
    });

    it('dois veiculos tem periodos ociosos INDEPENDENTES', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('TwoVehicles');
      const v1 = await createVehicle(adminAuth);
      const v2 = await createVehicle(adminAuth);
      for (const v of [v1, v2]) {
        const t = await createTripPlanned(adminAuth, v);
        await setStatus(adminAuth, t, 'IN_PROGRESS');
        await setStatus(adminAuth, t, 'COMPLETED');
      }
      const open1 = await openPeriodsFor(tenantId, v1);
      const open2 = await openPeriodsFor(tenantId, v2);
      expect(open1).toHaveLength(1);
      expect(open2).toHaveLength(1);
      expect(open1[0]!.vehicleId).toBe(v1);
      expect(open2[0]!.vehicleId).toBe(v2);
    });
  });

  // ==========================================================================
  // CRUD administrativo (secao 6)
  // ==========================================================================
  describe('CRUD administrativo', () => {
    it('POST cria periodo manual (source=MANUAL_ADMIN); GET lista e GET :id retornam', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Crud');
      const vehicleId = await createVehicle(adminAuth);
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/fleet-operations/idle-periods')
        .set('Authorization', adminAuth)
        .send({ vehicleId, startedAt: '2026-05-01T10:00:00.000Z', reason: 'DOCUMENTACAO', notes: 'retroativo' })
        .expect(201);
      expect(createRes.body.data).toMatchObject({ vehicleId, source: 'MANUAL_ADMIN', reason: 'DOCUMENTACAO', status: 'OPEN', notes: 'retroativo' });
      const id = createRes.body.data.id as string;

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/idle-periods')
        .set('Authorization', adminAuth)
        .query({ vehicleId })
        .expect(200);
      expect(listRes.body.data.items.some((p: { id: string }) => p.id === id)).toBe(true);

      const oneRes = await request(app.getHttpServer()).get(`/api/v1/fleet-operations/idle-periods/${id}`).set('Authorization', adminAuth).expect(200);
      expect(oneRes.body.data.id).toBe(id);
    });

    it('POST com endedAt cria ja FECHADO com duracao calculada pelo backend', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CrudClosed');
      const vehicleId = await createVehicle(adminAuth);
      const res = await request(app.getHttpServer())
        .post('/api/v1/fleet-operations/idle-periods')
        .set('Authorization', adminAuth)
        .send({ vehicleId, startedAt: '2026-05-01T10:00:00.000Z', endedAt: '2026-05-01T14:30:00.000Z' })
        .expect(201);
      expect(res.body.data).toMatchObject({ status: 'CLOSED', durationMinutes: 270 });
    });

    it('POST recusa (409) um 2o periodo ABERTO para o mesmo veiculo', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CrudDup');
      const vehicleId = await createVehicle(adminAuth);
      await request(app.getHttpServer())
        .post('/api/v1/fleet-operations/idle-periods')
        .set('Authorization', adminAuth)
        .send({ vehicleId, startedAt: '2026-05-01T10:00:00.000Z' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/fleet-operations/idle-periods')
        .set('Authorization', adminAuth)
        .send({ vehicleId, startedAt: '2026-05-02T10:00:00.000Z' })
        .expect(409);
    });

    it('PATCH corrige o MOTIVO de um periodo criado automaticamente (secao 6)', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('FixReason');
      const vehicleId = await createVehicle(adminAuth);
      const tripId = await createTripPlanned(adminAuth, vehicleId);
      await setStatus(adminAuth, tripId, 'IN_PROGRESS');
      await setStatus(adminAuth, tripId, 'COMPLETED');
      const [period] = await openPeriodsFor(tenantId, vehicleId);
      expect(period.reason).toBe('AGUARDANDO_ORDEM');

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/fleet-operations/idle-periods/${period.id}`)
        .set('Authorization', adminAuth)
        .send({ reason: 'AGUARDANDO_CARGA', notes: 'confirmado com a operacao' })
        .expect(200);
      expect(res.body.data).toMatchObject({ reason: 'AGUARDANDO_CARGA', notes: 'confirmado com a operacao', source: 'AUTO' });
    });

    it('PATCH com endedAt FECHA/ajusta o periodo e recalcula a duracao pelo backend', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('FixClose');
      const vehicleId = await createVehicle(adminAuth);
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/fleet-operations/idle-periods')
        .set('Authorization', adminAuth)
        .send({ vehicleId, startedAt: '2026-05-01T10:00:00.000Z' })
        .expect(201);
      const id = createRes.body.data.id as string;
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/fleet-operations/idle-periods/${id}`)
        .set('Authorization', adminAuth)
        .send({ endedAt: '2026-05-01T12:00:00.000Z' })
        .expect(200);
      expect(res.body.data).toMatchObject({ status: 'CLOSED', durationMinutes: 120 });
    });

    it('PATCH com endedAt anterior a startedAt -> 400 (nunca duracao negativa)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('FixNeg');
      const vehicleId = await createVehicle(adminAuth);
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/fleet-operations/idle-periods')
        .set('Authorization', adminAuth)
        .send({ vehicleId, startedAt: '2026-05-01T10:00:00.000Z' })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/fleet-operations/idle-periods/${createRes.body.data.id}`)
        .set('Authorization', adminAuth)
        .send({ endedAt: '2026-05-01T09:00:00.000Z' })
        .expect(400);
    });
  });

  // ==========================================================================
  // Filtros / isolamento / RBAC
  // ==========================================================================
  describe('filtros, isolamento e RBAC', () => {
    it('filtra por vehicleId, por periodo (from/to sobreposicao) e por open', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Filters');
      const vA = await createVehicle(adminAuth);
      const vB = await createVehicle(adminAuth);
      // vA: 1 fechado em marco, 1 aberto agora
      await request(app.getHttpServer())
        .post('/api/v1/fleet-operations/idle-periods')
        .set('Authorization', adminAuth)
        .send({ vehicleId: vA, startedAt: '2026-03-10T00:00:00.000Z', endedAt: '2026-03-10T05:00:00.000Z' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/fleet-operations/idle-periods')
        .set('Authorization', adminAuth)
        .send({ vehicleId: vA, startedAt: new Date().toISOString() })
        .expect(201);
      // vB: 1 fechado em maio
      await request(app.getHttpServer())
        .post('/api/v1/fleet-operations/idle-periods')
        .set('Authorization', adminAuth)
        .send({ vehicleId: vB, startedAt: '2026-05-01T00:00:00.000Z', endedAt: '2026-05-01T02:00:00.000Z' })
        .expect(201);

      const byVehicle = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/idle-periods')
        .set('Authorization', adminAuth)
        .query({ vehicleId: vA })
        .expect(200);
      expect(byVehicle.body.data.items.every((p: { vehicleId: string }) => p.vehicleId === vA)).toBe(true);
      expect(byVehicle.body.data.meta.total).toBe(2);

      const openOnly = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/idle-periods')
        .set('Authorization', adminAuth)
        .query({ vehicleId: vA, open: 'true' })
        .expect(200);
      expect(openOnly.body.data.items).toHaveLength(1);
      expect(openOnly.body.data.items[0].status).toBe('OPEN');

      const marchWindow = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/idle-periods')
        .set('Authorization', adminAuth)
        .query({ vehicleId: vA, from: '2026-03-01', to: '2026-03-31' })
        .expect(200);
      // Sobreposicao com marco/2026: so o periodo FECHADO de 10/03 entra. O
      // periodo aberto (startedAt = agora, ~setembro) comeca DEPOIS da janela
      // -> nao sobrepoe. O de maio de vB nunca aparece (filtro vehicleId).
      const marchItems = marchWindow.body.data.items as { startedAt: string; endedAt: string | null; status: string }[];
      expect(marchItems).toHaveLength(1);
      expect(marchItems[0]).toMatchObject({ status: 'CLOSED' });
      expect(marchItems[0]!.startedAt.slice(0, 7)).toBe('2026-03');

      // Janela ampla (marco ate o futuro) traz os 2 de vA.
      const wideWindow = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/idle-periods')
        .set('Authorization', adminAuth)
        .query({ vehicleId: vA, from: '2026-03-01', to: '2027-12-31' })
        .expect(200);
      expect(wideWindow.body.data.meta.total).toBe(2);
    });

    it('filtra por reason', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('FilterReason');
      const v = await createVehicle(adminAuth);
      await request(app.getHttpServer())
        .post('/api/v1/fleet-operations/idle-periods')
        .set('Authorization', adminAuth)
        .send({ vehicleId: v, startedAt: '2026-05-01T00:00:00.000Z', endedAt: '2026-05-01T01:00:00.000Z', reason: 'MANUTENCAO' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/fleet-operations/idle-periods')
        .set('Authorization', adminAuth)
        .send({ vehicleId: v, startedAt: '2026-05-02T00:00:00.000Z', endedAt: '2026-05-02T01:00:00.000Z', reason: 'DESCANSO' })
        .expect(201);
      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/idle-periods')
        .set('Authorization', adminAuth)
        .query({ vehicleId: v, reason: 'MANUTENCAO' })
        .expect(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].reason).toBe('MANUTENCAO');
    });

    it('isolamento multi-tenant: tenant B nunca ve os periodos do tenant A', async () => {
      const a = await createTenantAndLoginAsAdmin('IsoA');
      const b = await createTenantAndLoginAsAdmin('IsoB');
      const vA = await createVehicle(a.adminAuth);
      const tripA = await createTripPlanned(a.adminAuth, vA);
      await setStatus(a.adminAuth, tripA, 'IN_PROGRESS');
      await setStatus(a.adminAuth, tripA, 'COMPLETED');
      const [periodA] = await openPeriodsFor(a.tenantId, vA);

      const resB = await request(app.getHttpServer()).get('/api/v1/fleet-operations/idle-periods').set('Authorization', b.adminAuth).expect(200);
      expect(resB.body.data.items).toEqual([]);
      await request(app.getHttpServer()).get(`/api/v1/fleet-operations/idle-periods/${periodA.id}`).set('Authorization', b.adminAuth).expect(404);
      await request(app.getHttpServer())
        .patch(`/api/v1/fleet-operations/idle-periods/${periodA.id}`)
        .set('Authorization', b.adminAuth)
        .send({ reason: 'OUTRO' })
        .expect(404);
    });

    it('RBAC: DRIVER recebe 403 em GET/POST/PATCH; OPERATOR pode ler e escrever', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Rbac');
      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      const operatorAuth = await createUserWithRole(tenantId, adminAuth, 'OPERATOR');
      const vehicleId = await createVehicle(adminAuth);

      await request(app.getHttpServer()).get('/api/v1/fleet-operations/idle-periods').set('Authorization', driverAuth).expect(403);
      await request(app.getHttpServer())
        .post('/api/v1/fleet-operations/idle-periods')
        .set('Authorization', driverAuth)
        .send({ vehicleId, startedAt: '2026-05-01T00:00:00.000Z' })
        .expect(403);

      await request(app.getHttpServer()).get('/api/v1/fleet-operations/idle-periods').set('Authorization', operatorAuth).expect(200);
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/fleet-operations/idle-periods')
        .set('Authorization', operatorAuth)
        .send({ vehicleId, startedAt: '2026-05-01T00:00:00.000Z' })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/fleet-operations/idle-periods/${createRes.body.data.id}`)
        .set('Authorization', driverAuth)
        .send({ reason: 'OUTRO' })
        .expect(403);
      await request(app.getHttpServer())
        .patch(`/api/v1/fleet-operations/idle-periods/${createRes.body.data.id}`)
        .set('Authorization', operatorAuth)
        .send({ reason: 'OUTRO' })
        .expect(200);
    });
  });

  // ==========================================================================
  // Fase C -- o MOTORISTA informa/confirma o motivo da parada (Driver App)
  // GET/PATCH /driver/idle-period + POST /driver/trips/:id/complete { idleReason }
  // Opera SEMPRE sobre o VehicleIdlePeriod ABERTO da Fase B -- nunca cria um
  // 2o periodo, nunca mexe em datas/duracao (geridas pelo backend).
  // ==========================================================================
  describe('Fase C -- motorista informa o motivo (Driver App)', () => {
    async function completeTripAsAdmin(adminAuth: string, tenantId: string, vehicleId: string, destName?: string) {
      const { tripId, driverAuth, driverId } = await createDriverTrip(tenantId, adminAuth, vehicleId, destName);
      await setStatus(adminAuth, tripId, 'IN_PROGRESS');
      await setStatus(adminAuth, tripId, 'COMPLETED');
      return { tripId, driverAuth, driverId };
    }

    it('autorizacao: usuario nao-motorista (OPERATOR) recebe 403 em GET e PATCH /driver/idle-period', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('CDrvRbac');
      const operatorAuth = await createUserWithRole(tenantId, adminAuth, 'OPERATOR');

      await request(app.getHttpServer()).get('/api/v1/driver/idle-period').set('Authorization', operatorAuth).expect(403);
      await request(app.getHttpServer())
        .patch('/api/v1/driver/idle-period')
        .set('Authorization', operatorAuth)
        .send({ reason: 'PATIO' })
        .expect(403);
    });

    it('sem periodo aberto: GET devolve null e PATCH e no-op (200 null) -- nunca 4xx, a acao offline nunca fica presa', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('CDrvNone');
      const vehicleId = await createVehicle(adminAuth);
      // motorista com viagem apenas PLANNED -- nenhum periodo foi aberto
      const { driverAuth } = await createDriverTrip(tenantId, adminAuth, vehicleId);

      const getRes = await request(app.getHttpServer()).get('/api/v1/driver/idle-period').set('Authorization', driverAuth).expect(200);
      expect(getRes.body.data).toBeNull();

      const patchRes = await request(app.getHttpServer())
        .patch('/api/v1/driver/idle-period')
        .set('Authorization', driverAuth)
        .send({ reason: 'DESCANSO' })
        .expect(200);
      expect(patchRes.body.data).toBeNull();
    });

    it('viagem concluida pelo admin: o motorista enxerga o periodo ABERTO do seu veiculo (status/placa/destino/source AUTO)', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('CDrvSee');
      const vehicleId = await createVehicle(adminAuth);
      const { driverAuth } = await completeTripAsAdmin(adminAuth, tenantId, vehicleId, 'CD Ribeirao/SP');

      const res = await request(app.getHttpServer()).get('/api/v1/driver/idle-period').set('Authorization', driverAuth).expect(200);
      expect(res.body.data).toMatchObject({
        vehicleId,
        status: 'OPEN',
        source: 'AUTO',
        reason: 'AGUARDANDO_ORDEM',
        endedAt: null,
        durationMinutes: null,
        previousDestinationLabel: 'CD Ribeirao/SP',
      });
      expect(typeof res.body.data.plate).toBe('string');
    });

    it('PATCH define o motivo e source=DRIVER_APP no periodo aberto; grava auditoria reason_set_by_driver', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('CDrvSet');
      const vehicleId = await createVehicle(adminAuth);
      const { driverAuth } = await completeTripAsAdmin(adminAuth, tenantId, vehicleId);

      const res = await request(app.getHttpServer())
        .patch('/api/v1/driver/idle-period')
        .set('Authorization', driverAuth)
        .send({ reason: 'AGUARDANDO_CARGA' })
        .expect(200);
      expect(res.body.data).toMatchObject({ vehicleId, reason: 'AGUARDANDO_CARGA', source: 'DRIVER_APP', status: 'OPEN' });

      const [period] = await openPeriodsFor(tenantId, vehicleId);
      expect(period).toMatchObject({ reason: 'AGUARDANDO_CARGA', source: 'DRIVER_APP', endedAt: null });

      const audit = await prisma.auditLog.findFirst({
        where: { tenantId, action: 'vehicle_idle_period.reason_set_by_driver', entityId: period.id },
      });
      expect(audit).not.toBeNull();
    });

    it('PATCH e idempotente por estado: o mesmo motivo 2x nao cria um 2o periodo nem erra', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('CDrvIdem');
      const vehicleId = await createVehicle(adminAuth);
      const { driverAuth } = await completeTripAsAdmin(adminAuth, tenantId, vehicleId);

      await request(app.getHttpServer()).patch('/api/v1/driver/idle-period').set('Authorization', driverAuth).send({ reason: 'DOCUMENTACAO' }).expect(200);
      await request(app.getHttpServer()).patch('/api/v1/driver/idle-period').set('Authorization', driverAuth).send({ reason: 'DOCUMENTACAO' }).expect(200);

      const all = await prisma.vehicleIdlePeriod.findMany({ where: { tenantId, vehicleId } });
      expect(all).toHaveLength(1);
      expect(all[0]).toMatchObject({ reason: 'DOCUMENTACAO', source: 'DRIVER_APP' });
    });

    it('concorrencia: se a proxima viagem ja fechou o periodo, o PATCH do motorista vira no-op (200 null) e nao reabre', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('CDrvRace');
      const vehicleId = await createVehicle(adminAuth);
      const { driverAuth } = await completeTripAsAdmin(adminAuth, tenantId, vehicleId);

      // proxima viagem do mesmo veiculo inicia -> Fase B fecha o periodo
      const next = await createTripPlanned(adminAuth, vehicleId);
      await setStatus(adminAuth, next, 'IN_PROGRESS');

      const res = await request(app.getHttpServer())
        .patch('/api/v1/driver/idle-period')
        .set('Authorization', driverAuth)
        .send({ reason: 'OUTRO' })
        .expect(200);
      expect(res.body.data).toBeNull();

      const open = await openPeriodsFor(tenantId, vehicleId);
      expect(open).toHaveLength(0);
      const closed = await prisma.vehicleIdlePeriod.findFirst({ where: { tenantId, vehicleId } });
      expect(closed?.endedAt).not.toBeNull();
      expect(closed?.source).toBe('AUTO'); // nunca sobrescrito depois de fechado
    });

    it('isolamento: cada motorista so ve o periodo do veiculo que ELE operou', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('CDrvIso');
      const vehicleA = await createVehicle(adminAuth);
      const vehicleB = await createVehicle(adminAuth);
      const { driverAuth: driverAuthA } = await completeTripAsAdmin(adminAuth, tenantId, vehicleA, 'Destino A');
      const { driverAuth: driverAuthB } = await completeTripAsAdmin(adminAuth, tenantId, vehicleB, 'Destino B');

      const resA = await request(app.getHttpServer()).get('/api/v1/driver/idle-period').set('Authorization', driverAuthA).expect(200);
      const resB = await request(app.getHttpServer()).get('/api/v1/driver/idle-period').set('Authorization', driverAuthB).expect(200);
      expect(resA.body.data.vehicleId).toBe(vehicleA);
      expect(resB.body.data.vehicleId).toBe(vehicleB);

      // o motorista A nunca altera o periodo do veiculo B
      await request(app.getHttpServer()).patch('/api/v1/driver/idle-period').set('Authorization', driverAuthA).send({ reason: 'PATIO' }).expect(200);
      const [periodB] = await openPeriodsFor(tenantId, vehicleB);
      expect(periodB).toMatchObject({ source: 'AUTO', reason: 'AGUARDANDO_ORDEM' });
    });

    it('o admin enxerga o motivo informado pelo motorista em GET /fleet-operations/idle-periods', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('CDrvAdminSees');
      const vehicleId = await createVehicle(adminAuth);
      const { driverAuth } = await completeTripAsAdmin(adminAuth, tenantId, vehicleId);
      await request(app.getHttpServer()).patch('/api/v1/driver/idle-period').set('Authorization', driverAuth).send({ reason: 'MANUTENCAO' }).expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/idle-periods')
        .set('Authorization', adminAuth)
        .query({ vehicleId, open: 'true' })
        .expect(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0]).toMatchObject({ reason: 'MANUTENCAO', source: 'DRIVER_APP', status: 'OPEN' });
    });

    it('POST /driver/trips/:id/complete com idleReason aplica o motivo (source DRIVER_APP) no periodo aberto pela conclusao', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('CDrvComplete');
      const vehicleId = await createVehicle(adminAuth);
      const { tripId, driverAuth } = await createDriverTrip(tenantId, adminAuth, vehicleId);

      await request(app.getHttpServer()).post(`/api/v1/driver/trips/${tripId}/start`).set('Authorization', driverAuth).expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/complete`)
        .set('Authorization', driverAuth)
        .send({ finalOdometerKm: 1234.5, idleReason: 'DESCANSO' })
        .expect(201);

      const [period] = await openPeriodsFor(tenantId, vehicleId);
      expect(period).toMatchObject({ tripBeforeId: tripId, reason: 'DESCANSO', source: 'DRIVER_APP', endedAt: null });
    });

    it('POST complete SEM idleReason mantem o motivo default automatico (motorista nao e obrigado a informar)', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('CDrvCompleteNoReason');
      const vehicleId = await createVehicle(adminAuth);
      const { tripId, driverAuth } = await createDriverTrip(tenantId, adminAuth, vehicleId);

      await request(app.getHttpServer()).post(`/api/v1/driver/trips/${tripId}/start`).set('Authorization', driverAuth).expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/complete`)
        .set('Authorization', driverAuth)
        .send({ finalOdometerKm: 999 })
        .expect(201);

      const [period] = await openPeriodsFor(tenantId, vehicleId);
      expect(period).toMatchObject({ reason: 'AGUARDANDO_ORDEM', source: 'AUTO' });
    });

    it('POST complete com idleReason invalido -> 400 (nunca cria periodo com motivo fora do enum)', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('CDrvBadReason');
      const vehicleId = await createVehicle(adminAuth);
      const { tripId, driverAuth } = await createDriverTrip(tenantId, adminAuth, vehicleId);
      await request(app.getHttpServer()).post(`/api/v1/driver/trips/${tripId}/start`).set('Authorization', driverAuth).expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/complete`)
        .set('Authorization', driverAuth)
        .send({ finalOdometerKm: 10, idleReason: 'FERIAS' })
        .expect(400);
    });

    it('timeline: com source DRIVER_APP o evento "Periodo parado iniciado" cita "Motivo informado pelo motorista"', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('CDrvTimeline');
      const vehicleId = await createVehicle(adminAuth);
      const { tripId, driverAuth } = await completeTripAsAdmin(adminAuth, tenantId, vehicleId);
      await request(app.getHttpServer()).patch('/api/v1/driver/idle-period').set('Authorization', driverAuth).send({ reason: 'PATIO' }).expect(200);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/timeline`)
        .set('Authorization', adminAuth)
        .query({ origin: 'IDLE_PERIOD' })
        .expect(200);
      const started = res.body.data.items.find((e: { label: string }) => e.label === 'Periodo parado iniciado');
      expect(started).toBeDefined();
      expect(started.description).toContain('Motivo informado pelo motorista');
    });

    it('nova viagem fecha o periodo preservando o motivo informado pelo motorista', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('CDrvCloseKeeps');
      const vehicleId = await createVehicle(adminAuth);
      const { driverAuth } = await completeTripAsAdmin(adminAuth, tenantId, vehicleId);
      await request(app.getHttpServer()).patch('/api/v1/driver/idle-period').set('Authorization', driverAuth).send({ reason: 'AGUARDANDO_CARGA' }).expect(200);

      const next = await createTripPlanned(adminAuth, vehicleId);
      await setStatus(adminAuth, next, 'IN_PROGRESS');

      const closed = await prisma.vehicleIdlePeriod.findFirst({ where: { tenantId, vehicleId } });
      expect(closed).toMatchObject({ reason: 'AGUARDANDO_CARGA', source: 'DRIVER_APP', tripAfterId: next });
      expect(closed?.endedAt).not.toBeNull();
      expect(closed?.durationMinutes === null || closed!.durationMinutes >= 0).toBe(true);
    });
  });
});
