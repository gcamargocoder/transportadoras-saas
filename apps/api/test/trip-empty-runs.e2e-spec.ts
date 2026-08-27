import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 92 -- viagens vazias (Trip.loadStatus = EMPTY, informado pelo
// motorista na largada, Fase 27). Cobre identificacao correta, viagem NAO
// comprovadamente vazia (LOADED), ausencia de dado (loadStatus nunca
// informado), classificacao/motivo, filtros, isolamento multi-tenant, RBAC
// e ausencia de N+1 -- tanto a listagem (GET /trips/empty-runs) quanto o
// resumo do dashboard (GET /fleet-operations/empty-trips), com requests
// reais contra o Postgres.
describe('Viagens Vazias -- identificacao, listagem e resumo (e2e)', () => {
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
      slug: `tempty-${label.toLowerCase()}-${unique}`,
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

  // Vincula um usuario DRIVER ao Driver ja cadastrado e faz login como
  // motorista -- unica forma real de setar Trip.loadStatus (POST
  // /driver/trips/:id/start), mesmo padrao ja usado em
  // trip-delivery-stops.e2e-spec.ts.
  async function loginAsDriver(tenantId: string, adminAuth: string, driverId: string) {
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
    return `Bearer ${loginRes.body.data.accessToken as string}`;
  }

  async function setupPlannedTrip(auth: string, tenantId: string) {
    const vehicleId = await createVehicle(auth);
    const driverId = await createDriver(auth);
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
        plannedArrival: '2026-09-02T18:00:00.000Z',
      })
      .expect(201);
    const driverAuth = await loginAsDriver(tenantId, auth, driverId);
    return { tripId: tripRes.body.data.id as string, driverId, vehicleId, driverAuth };
  }

  // Cria e inicia (largada) uma viagem com o loadStatus informado (ou sem
  // informar nenhum, para simular "ausencia de dado").
  async function setupDepartedTrip(
    auth: string,
    tenantId: string,
    loadStatus?: 'LOADED' | 'EMPTY',
    odometerKm = 100000,
  ) {
    const setup = await setupPlannedTrip(auth, tenantId);
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${setup.tripId}/start`)
      .set('Authorization', setup.driverAuth)
      .send({ odometerKm, ...(loadStatus ? { loadStatus } : {}) })
      .expect(201);
    return setup;
  }

  function getEmptyRuns(auth: string, query: Record<string, string> = {}) {
    return request(app.getHttpServer()).get('/api/v1/trips/empty-runs').set('Authorization', auth).query(query);
  }

  function getEmptyTripsSummary(auth: string, query: Record<string, string> = {}) {
    return request(app.getHttpServer())
      .get('/api/v1/fleet-operations/empty-trips')
      .set('Authorization', auth)
      .query(query);
  }

  // ==========================================================================
  // Identificacao correta / viagem NAO comprovadamente vazia / ausencia de dado
  // ==========================================================================
  describe('identificacao', () => {
    it('viagem com loadStatus=EMPTY aparece na listagem e no resumo', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Empty');
      const { tripId } = await setupDepartedTrip(adminAuth, tenantId, 'EMPTY');

      const list = await getEmptyRuns(adminAuth).expect(200);
      expect(list.body.data.items.map((i: { id: string }) => i.id)).toContain(tripId);

      const summary = await getEmptyTripsSummary(adminAuth).expect(200);
      expect(summary.body.data.emptyCount).toBe(1);
      expect(summary.body.data.loadedCount).toBe(0);
    });

    it('viagem com loadStatus=LOADED NUNCA aparece como vazia (regra: nao comprovadamente vazia)', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Loaded');
      const { tripId } = await setupDepartedTrip(adminAuth, tenantId, 'LOADED');

      const list = await getEmptyRuns(adminAuth).expect(200);
      expect(list.body.data.items.map((i: { id: string }) => i.id)).not.toContain(tripId);

      const summary = await getEmptyTripsSummary(adminAuth).expect(200);
      expect(summary.body.data.loadedCount).toBe(1);
      expect(summary.body.data.emptyCount).toBe(0);
    });

    it('viagem partida sem loadStatus informado: ausencia de dado, nunca contada como vazia', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Unknown');
      const { tripId } = await setupDepartedTrip(adminAuth, tenantId, undefined);

      const list = await getEmptyRuns(adminAuth).expect(200);
      expect(list.body.data.items.map((i: { id: string }) => i.id)).not.toContain(tripId);

      const summary = await getEmptyTripsSummary(adminAuth).expect(200);
      expect(summary.body.data.unknownLoadStatusCount).toBe(1);
      expect(summary.body.data.emptyCount).toBe(0);
      // Percentual exclui "unknown" do denominador -- 0 empty / 0 (loaded+empty) = null.
      expect(summary.body.data.emptyPercent).toBeNull();
    });

    it('viagem ainda planejada (nunca partiu) nunca entra em nenhuma contagem', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Planned');
      await setupPlannedTrip(adminAuth, tenantId);

      const summary = await getEmptyTripsSummary(adminAuth).expect(200);
      expect(summary.body.data.totalDepartedTrips).toBe(0);
    });
  });

  // ==========================================================================
  // Classificacao / motivo
  // ==========================================================================
  describe('classificacao/motivo', () => {
    it('NO_DELIVERIES_PLANNED quando a viagem vazia nao tem nenhuma TripDeliveryStop', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('NoStops');
      const { tripId } = await setupDepartedTrip(adminAuth, tenantId, 'EMPTY');

      const list = await getEmptyRuns(adminAuth).expect(200);
      const item = list.body.data.items.find((i: { id: string }) => i.id === tripId);
      expect(item.reason).toBe('NO_DELIVERIES_PLANNED');
      expect(item.hasDeliveryStops).toBe(false);
    });

    it('ALL_DELIVERIES_CANCELLED quando todas as paradas da viagem vazia foram canceladas', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('AllCancelled');
      const setup = await setupPlannedTrip(adminAuth, tenantId);
      const locationId = await createLocation(adminAuth, `Cliente ${randomUUID()}`);
      const stopRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${setup.tripId}/delivery-stops`)
        .set('Authorization', adminAuth)
        .send({ locationId })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${setup.tripId}/start`)
        .set('Authorization', setup.driverAuth)
        .send({ loadStatus: 'EMPTY' })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${setup.tripId}/delivery-stops/${stopRes.body.data.id}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'CANCELLED' })
        .expect(200);

      const list = await getEmptyRuns(adminAuth).expect(200);
      const item = list.body.data.items.find((i: { id: string }) => i.id === setup.tripId);
      expect(item.reason).toBe('ALL_DELIVERIES_CANCELLED');
      expect(item.hasDeliveryStops).toBe(true);
    });

    it('DELIVERIES_INCOMPLETE quando ha parada ainda pendente numa viagem vazia', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Incomplete');
      const setup = await setupPlannedTrip(adminAuth, tenantId);
      const locationId = await createLocation(adminAuth, `Cliente ${randomUUID()}`);
      await request(app.getHttpServer())
        .post(`/api/v1/trips/${setup.tripId}/delivery-stops`)
        .set('Authorization', adminAuth)
        .send({ locationId })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${setup.tripId}/start`)
        .set('Authorization', setup.driverAuth)
        .send({ loadStatus: 'EMPTY' })
        .expect(201);

      const list = await getEmptyRuns(adminAuth).expect(200);
      const item = list.body.data.items.find((i: { id: string }) => i.id === setup.tripId);
      expect(item.reason).toBe('DELIVERIES_INCOMPLETE');
    });

    it('COMPLETED_DELIVERIES_INCONSISTENT quando ha parada concluida apesar de loadStatus=EMPTY', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Inconsistent');
      const setup = await setupPlannedTrip(adminAuth, tenantId);
      const locationId = await createLocation(adminAuth, `Cliente ${randomUUID()}`);
      const stopRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${setup.tripId}/delivery-stops`)
        .set('Authorization', adminAuth)
        .send({ locationId })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${setup.tripId}/start`)
        .set('Authorization', setup.driverAuth)
        .send({ loadStatus: 'EMPTY' })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${setup.tripId}/delivery-stops/${stopRes.body.data.id}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'COMPLETED' })
        .expect(200);

      const list = await getEmptyRuns(adminAuth).expect(200);
      const item = list.body.data.items.find((i: { id: string }) => i.id === setup.tripId);
      expect(item.reason).toBe('COMPLETED_DELIVERIES_INCONSISTENT');

      const summary = await getEmptyTripsSummary(adminAuth).expect(200);
      expect(
        summary.body.data.reasonBreakdown.find((r: { reason: string }) => r.reason === 'COMPLETED_DELIVERIES_INCONSISTENT')
          ?.count,
      ).toBe(1);
    });
  });

  // ==========================================================================
  // Distancia/custo -- somente quando ja calculavel (TripMetrics)
  // ==========================================================================
  describe('distancia/custo', () => {
    it('distanceKm/totalCost aparecem null ate a viagem concluir, e preenchidos apos concluir com hodometro final', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Metrics');
      const { tripId } = await setupDepartedTrip(adminAuth, tenantId, 'EMPTY', 100000);

      const beforeList = await getEmptyRuns(adminAuth).expect(200);
      const beforeItem = beforeList.body.data.items.find((i: { id: string }) => i.id === tripId);
      expect(beforeItem.distanceKm).toBeNull();
      expect(beforeItem.totalCost).toBeNull();

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'COMPLETED', finalOdometerKm: 100450 })
        .expect(200);

      const afterList = await getEmptyRuns(adminAuth).expect(200);
      const afterItem = afterList.body.data.items.find((i: { id: string }) => i.id === tripId);
      expect(afterItem.distanceKm).toBe(450);
      expect(afterItem.status).toBe('COMPLETED');
    });
  });

  // ==========================================================================
  // Filtros server-side
  // ==========================================================================
  describe('filtros', () => {
    it('filtra por driverId, vehicleId e status', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Filters');
      const a = await setupDepartedTrip(adminAuth, tenantId, 'EMPTY');
      const b = await setupDepartedTrip(adminAuth, tenantId, 'EMPTY');

      const byDriver = await getEmptyRuns(adminAuth, { driverId: a.driverId }).expect(200);
      expect(byDriver.body.data.items.map((i: { id: string }) => i.id)).toEqual([a.tripId]);

      const byVehicle = await getEmptyRuns(adminAuth, { vehicleId: b.vehicleId }).expect(200);
      expect(byVehicle.body.data.items.map((i: { id: string }) => i.id)).toEqual([b.tripId]);

      const byStatus = await getEmptyRuns(adminAuth, { status: 'IN_PROGRESS' }).expect(200);
      const ids = byStatus.body.data.items.map((i: { id: string }) => i.id);
      expect(ids).toEqual(expect.arrayContaining([a.tripId, b.tripId]));
    });
  });

  // ==========================================================================
  // Isolamento multi-tenant
  // ==========================================================================
  describe('isolamento multi-tenant', () => {
    it('tenant B nunca ve viagens vazias do tenant A, na listagem ou no resumo', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolA');
      await setupDepartedTrip(tenantA.adminAuth, tenantA.tenantId, 'EMPTY');
      const tenantB = await createTenantAndLoginAsAdmin('IsolB');

      const list = await getEmptyRuns(tenantB.adminAuth).expect(200);
      expect(list.body.data.items).toEqual([]);

      const summary = await getEmptyTripsSummary(tenantB.adminAuth).expect(200);
      expect(summary.body.data.emptyCount).toBe(0);
    });
  });

  // ==========================================================================
  // RBAC
  // ==========================================================================
  describe('RBAC', () => {
    it('listagem: leitura permitida para papeis de trip, DRIVER bloqueado (403)', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('RbacList');
      for (const role of ['MANAGER', 'OPERATOR', 'DISPATCHER', 'AUDITOR']) {
        const auth = await createUserWithRole(tenantId, adminAuth, role);
        await getEmptyRuns(auth).expect(200);
      }
      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      await getEmptyRuns(driverAuth).expect(403);
    });

    it('resumo do dashboard: leitura permitida para papeis operacionais, DRIVER bloqueado (403)', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('RbacSummary');
      for (const role of ['MANAGER', 'OPERATOR', 'DISPATCHER', 'AUDITOR']) {
        const auth = await createUserWithRole(tenantId, adminAuth, role);
        await getEmptyTripsSummary(auth).expect(200);
      }
      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      await getEmptyTripsSummary(driverAuth).expect(403);
    });
  });

  // ==========================================================================
  // Ausencia de N+1
  // ==========================================================================
  describe('verificacao de ausencia de N+1', () => {
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
        slug: `tempty-n1-${label.toLowerCase()}-${unique}`,
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

    async function seedEmptyTrip(adminAuth: string, tenantId: string) {
      const vehicleRes = await request(countingApp.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', adminAuth)
        .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
        .expect(201);
      const driverRes = await request(countingApp.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', adminAuth)
        .send({
          name: 'Motorista N1',
          cpf: randomValidCpf(),
          cnhNumber: String(Math.floor(10000000000 + Math.random() * 89999999999)),
          cnhCategory: 'AE',
          cnhExpiresAt: '2027-06-30',
        })
        .expect(201);
      const compositionRes = await request(countingApp.getHttpServer())
        .post('/api/v1/trip-compositions')
        .set('Authorization', adminAuth)
        .send({ vehicleId: vehicleRes.body.data.id, trailers: [] })
        .expect(201);
      const originRes = await request(countingApp.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', adminAuth)
        .send({ name: `Origem ${randomUUID()}`, type: 'DISTRIBUTION_CENTER' })
        .expect(201);
      const destinationRes = await request(countingApp.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', adminAuth)
        .send({ name: `Destino ${randomUUID()}`, type: 'DISTRIBUTION_CENTER' })
        .expect(201);
      const tripRes = await request(countingApp.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', adminAuth)
        .send({
          driverId: driverRes.body.data.id,
          compositionId: compositionRes.body.data.id,
          originLocationId: originRes.body.data.id,
          destinationLocationId: destinationRes.body.data.id,
          plannedDeparture: '2026-09-01T08:00:00.000Z',
          plannedArrival: '2026-09-02T18:00:00.000Z',
        })
        .expect(201);
      const tripId = tripRes.body.data.id as string;

      const unique = randomUUID().replace(/-/g, '').slice(0, 10);
      const email = `driver-n1-${unique}@teste.com`;
      const password = 'SenhaForte123!';
      const userRes = await request(countingApp.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', adminAuth)
        .send({ name: 'Motorista App', email, password, role: 'DRIVER' })
        .expect(201);
      await request(countingApp.getHttpServer())
        .patch(`/api/v1/drivers/${driverRes.body.data.id}/user-link`)
        .set('Authorization', adminAuth)
        .send({ userAccountId: userRes.body.data.id })
        .expect(200);
      const loginRes = await request(countingApp.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId, email, password })
        .expect(200);
      const driverAuth = `Bearer ${loginRes.body.data.accessToken as string}`;

      await request(countingApp.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .send({ loadStatus: 'EMPTY' })
        .expect(201);
    }

    it('a contagem de queries de GET /trips/empty-runs (pageSize fixo) nao cresce com o total de viagens vazias', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginOnCountingApp('N1List');
      const checkpoints = [5, 10, 15];
      const queriesByCheckpoint: number[] = [];
      let seeded = 0;
      for (const checkpoint of checkpoints) {
        while (seeded < checkpoint) {
          await seedEmptyTrip(adminAuth, tenantId);
          seeded += 1;
        }
        queryCount = 0;
        await request(countingApp.getHttpServer())
          .get('/api/v1/trips/empty-runs')
          .set('Authorization', adminAuth)
          .query({ pageSize: 5 })
          .expect(200);
        queriesByCheckpoint.push(queryCount);
      }

      const [queriesFor5, , queriesFor15] = queriesByCheckpoint;
      expect(queriesFor5).toBeGreaterThan(0);
      expect(queriesFor15).toBeLessThanOrEqual(queriesFor5 + 1);
    }, 180000);
  });
});
