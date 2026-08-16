import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// "Composicao" (GET /fleet-operations/compositions) -- uso de veiculo+carreta
// por viagem. Eixo e atributo de AxleConfiguration (1:1 com TripComposition,
// nunca da carreta isolada). Tempo parado por carreta so cobre TripStop com
// tripId (paradas administrativas sem tripId nunca sao atribuidas). Composicao
// com varias carretas atribui a duracao INTEIRA a cada carreta (nunca dividida).
describe('Fleet Operations Compositions (e2e)', () => {
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
      slug: `compositions-${label.toLowerCase()}-${unique}`,
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

  async function createVehicle(auth: string, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/vehicles')
      .set('Authorization', auth)
      .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT', ...overrides })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createTrailer(auth: string, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/trailers')
      .set('Authorization', auth)
      .send({ plate: randomPlate(), type: 'SIMPLE', ...overrides })
      .expect(201);
    return res.body.data.id as string;
  }

  async function deactivateTrailer(auth: string, trailerId: string) {
    await request(app.getHttpServer())
      .patch(`/api/v1/trailers/${trailerId}/status`)
      .set('Authorization', auth)
      .send({ isActive: false })
      .expect(200);
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

  async function createComposition(
    auth: string,
    vehicleId: string,
    trailers: { trailerId: string; positionOrder: number }[] = [],
    axleConfiguration: Record<string, unknown> = { totalAxles: 6, billableCategory: '6 eixos' },
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/trip-compositions')
      .set('Authorization', auth)
      .send({ vehicleId, trailers, axleConfiguration })
      .expect(201);
    return res.body.data.id as string;
  }

  // Cria motorista + viagem PLANNED usando uma composicao ja existente +
  // login proprio, inicia e conclui a viagem, sobrescreve actualDurationMin
  // (determinístico, fora do que a API expoe -- mesmo padrao ja usado em
  // fleet-operations-downtime-cost.e2e-spec.ts). Retorna o tripId.
  async function completeTrip(adminAuth: string, tenantId: string, compositionId: string, actualDurationMin: number) {
    const driverId = await createDriver(adminAuth);
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
        plannedDeparture: '2026-01-01T08:00:00.000Z',
        plannedArrival: '2026-01-02T18:00:00.000Z',
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
    await request(app.getHttpServer())
      .patch(`/api/v1/drivers/${driverId}/user-link`)
      .set('Authorization', adminAuth)
      .send({ userAccountId: userRes.body.data.id })
      .expect(200);
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email, password })
      .expect(200);
    const driverAuth = `Bearer ${loginRes.body.data.accessToken as string}`;

    await request(app.getHttpServer()).post(`/api/v1/driver/trips/${tripId}/start`).set('Authorization', driverAuth).expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}/status`)
      .set('Authorization', adminAuth)
      .send({ status: 'COMPLETED' })
      .expect(200);
    await prisma.tripMetrics.update({ where: { tripId }, data: { actualDurationMin } });

    return tripId;
  }

  async function createStop(
    auth: string,
    vehicleId: string,
    driverId: string,
    type: string,
    startedAt: string,
    endedAt: string,
    tripId?: string,
  ) {
    await request(app.getHttpServer())
      .post('/api/v1/trip-stops')
      .set('Authorization', auth)
      .send({ vehicleId, driverId, type, startedAt, endedAt, ...(tripId ? { tripId } : {}) })
      .expect(201);
  }

  // ==========================================================================
  // Estado vazio
  // ==========================================================================
  describe('estado vazio', () => {
    it('retorna tudo zerado/vazio', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Empty');

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/compositions')
        .set('Authorization', adminAuth)
        .expect(200);
      const data = res.body.data;

      expect(data.totalTrailers).toBe(0);
      expect(data.activeCount).toBe(0);
      expect(data.inactiveCount).toBe(0);
      expect(data.trailersOnTrip).toBe(0);
      expect(data.trailersAvailable).toBe(0);
      expect(data.byType).toEqual([]);
      expect(data.axleCategoryBreakdown).toEqual([]);
      expect(data.topTrailersByTripCount).toEqual([]);
      expect(data.topTrailersByInUseMinutes).toEqual([]);
      expect(data.trailers).toEqual([]);
      expect(data.monthlyTrendTripCount).toHaveLength(12);
    });
  });

  // ==========================================================================
  // Composicao/disponibilidade da frota de carretas
  // ==========================================================================
  describe('composicao da frota de carretas', () => {
    it('conta por tipo, ativa/inativa e disponibilidade (em viagem vs. disponivel)', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Fleet');
      const simple = await createTrailer(adminAuth, { type: 'SIMPLE' });
      const bitrem = await createTrailer(adminAuth, { type: 'BITREM' });
      const inactive = await createTrailer(adminAuth, { type: 'SIMPLE' });
      await deactivateTrailer(adminAuth, inactive);

      const vehicleId = await createVehicle(adminAuth);
      const compositionId = await createComposition(adminAuth, vehicleId, [{ trailerId: simple, positionOrder: 1 }]);
      const driverId = await createDriver(adminAuth);
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
          plannedDeparture: '2026-01-01T08:00:00.000Z',
          plannedArrival: '2026-01-02T18:00:00.000Z',
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
      await request(app.getHttpServer())
        .patch(`/api/v1/drivers/${driverId}/user-link`)
        .set('Authorization', adminAuth)
        .send({ userAccountId: userRes.body.data.id })
        .expect(200);
      const driverLoginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId, email, password })
        .expect(200);
      const driverAuth = `Bearer ${driverLoginRes.body.data.accessToken as string}`;
      await request(app.getHttpServer()).post(`/api/v1/driver/trips/${tripId}/start`).set('Authorization', driverAuth).expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/compositions')
        .set('Authorization', adminAuth)
        .expect(200);
      const data = res.body.data;

      expect(data.totalTrailers).toBe(3);
      expect(data.activeCount).toBe(2);
      expect(data.inactiveCount).toBe(1);
      expect(data.trailersOnTrip).toBe(1);
      expect(data.trailersAvailable).toBe(1);
      const byType = data.byType as { type: string; count: number }[];
      expect(byType.find((b) => b.type === 'SIMPLE')?.count).toBe(2);
      expect(byType.find((b) => b.type === 'BITREM')?.count).toBe(1);
      expect(bitrem).toBeTruthy();
    });
  });

  // ==========================================================================
  // Configuracao de eixos por composicao no periodo
  // ==========================================================================
  describe('configuracao de eixos', () => {
    it('agrupa por billableCategory das composicoes de viagens no escopo', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Axle');
      const vehicleA = await createVehicle(adminAuth);
      const vehicleB = await createVehicle(adminAuth);
      const compositionA = await createComposition(adminAuth, vehicleA, [], { totalAxles: 6, billableCategory: '6 eixos' });
      const compositionB = await createComposition(adminAuth, vehicleB, [], { totalAxles: 9, billableCategory: '9 eixos' });

      await completeTrip(adminAuth, tenantId, compositionA, 300);
      await completeTrip(adminAuth, tenantId, compositionB, 300);

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/compositions')
        .set('Authorization', adminAuth)
        .expect(200);
      const breakdown = res.body.data.axleCategoryBreakdown as { billableCategory: string; totalAxles: number; count: number }[];

      expect(breakdown.find((b) => b.billableCategory === '6 eixos')).toMatchObject({ totalAxles: 6, count: 1 });
      expect(breakdown.find((b) => b.billableCategory === '9 eixos')).toMatchObject({ totalAxles: 9, count: 1 });
    });
  });

  // ==========================================================================
  // Ranking + tempo em uso + tempo parado por carreta
  // ==========================================================================
  describe('ranking de carretas e tempo parado vs. em uso', () => {
    it('acumula tempo em uso (viagens concluidas) e atribui parada com tripId a carreta; sem tripId nao atribui', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Ranking');
      const vehicleId = await createVehicle(adminAuth);
      const driverId = await createDriver(adminAuth);
      const trailerId = await createTrailer(adminAuth);
      const compositionId = await createComposition(adminAuth, vehicleId, [{ trailerId, positionOrder: 1 }]);

      const tripId = await completeTrip(adminAuth, tenantId, compositionId, 600);

      // Parada COM tripId -- atribuida a carreta.
      await createStop(adminAuth, vehicleId, driverId, 'MAINTENANCE', '2026-01-10T08:00:00.000Z', '2026-01-10T09:00:00.000Z', tripId);
      // Parada administrativa SEM tripId -- nunca atribuida a nenhuma carreta.
      await createStop(adminAuth, vehicleId, driverId, 'REST', '2026-01-11T08:00:00.000Z', '2026-01-11T08:30:00.000Z');

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/compositions')
        .set('Authorization', adminAuth)
        .expect(200);
      const data = res.body.data;

      const trailerRow = data.trailers.find((t: { trailerId: string }) => t.trailerId === trailerId);
      expect(trailerRow).toMatchObject({ inUseMinutes: 600, tripCount: 1, downtimeMinutes: 60 });

      expect(data.topTrailersByTripCount[0]).toMatchObject({ trailerId, count: 1 });
      expect(data.topTrailersByInUseMinutes[0]).toMatchObject({ trailerId, value: 600 });
      expect(data.monthlyTrendTripCount).toHaveLength(12);
    });

    it('composicao com 2 carretas (bitrem) atribui a duracao INTEIRA a cada uma, nunca dividida', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Bitrem');
      const vehicleId = await createVehicle(adminAuth);
      const driverId = await createDriver(adminAuth);
      const trailer1 = await createTrailer(adminAuth, { type: 'BITREM' });
      const trailer2 = await createTrailer(adminAuth, { type: 'BITREM' });
      const compositionId = await createComposition(adminAuth, vehicleId, [
        { trailerId: trailer1, positionOrder: 1 },
        { trailerId: trailer2, positionOrder: 2 },
      ]);

      const tripId = await completeTrip(adminAuth, tenantId, compositionId, 400);
      await createStop(adminAuth, vehicleId, driverId, 'BREAKDOWN', '2026-01-10T08:00:00.000Z', '2026-01-10T08:40:00.000Z', tripId);

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/compositions')
        .set('Authorization', adminAuth)
        .expect(200);
      const data = res.body.data;

      const row1 = data.trailers.find((t: { trailerId: string }) => t.trailerId === trailer1);
      const row2 = data.trailers.find((t: { trailerId: string }) => t.trailerId === trailer2);
      expect(row1).toMatchObject({ inUseMinutes: 400, downtimeMinutes: 40, tripCount: 1 });
      expect(row2).toMatchObject({ inUseMinutes: 400, downtimeMinutes: 40, tripCount: 1 });
    });
  });

  // ==========================================================================
  // Isolamento multi-tenant
  // ==========================================================================
  describe('isolamento multi-tenant', () => {
    it('carretas/viagens de um tenant nunca aparecem no dashboard de outro', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsoA');
      const tenantB = await createTenantAndLoginAsAdmin('IsoB');

      const trailerId = await createTrailer(tenantA.adminAuth);
      const vehicleId = await createVehicle(tenantA.adminAuth);
      await createComposition(tenantA.adminAuth, vehicleId, [{ trailerId, positionOrder: 1 }]);

      const resB = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/compositions')
        .set('Authorization', tenantB.adminAuth)
        .expect(200);

      expect(resB.body.data.totalTrailers).toBe(0);
      expect(resB.body.data.trailers).toEqual([]);
    });
  });

  // ==========================================================================
  // RBAC
  // ==========================================================================
  describe('RBAC', () => {
    it('bloqueia DRIVER (403) e permite SUPER_ADMIN', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Rbac');

      await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/compositions')
        .set('Authorization', adminAuth)
        .expect(200);

      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/compositions')
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
        slug: `compositions-n1-${label.toLowerCase()}-${unique}`,
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

    async function seedTrailerWithCompositionAndStop(adminAuth: string, tenantId: string) {
      // Cada iteracao cria seu proprio motorista -- TripsService.assertDriverAvailable
      // rejeita 2 viagens planejadas no mesmo periodo para o mesmo motorista.
      const driverRes = await request(countingApp.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', adminAuth)
        .send({
          name: 'Jose da Silva',
          cpf: randomValidCpf(),
          cnhNumber: String(Math.floor(10000000000 + Math.random() * 89999999999)),
          cnhCategory: 'AE',
          cnhExpiresAt: '2027-06-30',
        })
        .expect(201);
      const driverId = driverRes.body.data.id as string;

      const vehicleRes = await request(countingApp.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', adminAuth)
        .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
        .expect(201);
      const vehicleId = vehicleRes.body.data.id as string;

      const trailerRes = await request(countingApp.getHttpServer())
        .post('/api/v1/trailers')
        .set('Authorization', adminAuth)
        .send({ plate: randomPlate(), type: 'SIMPLE' })
        .expect(201);
      const trailerId = trailerRes.body.data.id as string;

      const compositionRes = await request(countingApp.getHttpServer())
        .post('/api/v1/trip-compositions')
        .set('Authorization', adminAuth)
        .send({ vehicleId, trailers: [{ trailerId, positionOrder: 1 }], axleConfiguration: { totalAxles: 6, billableCategory: '6 eixos' } })
        .expect(201);
      const compositionId = compositionRes.body.data.id as string;

      const originId = await createLocationOnCountingApp(adminAuth, `Origem ${randomUUID()}`);
      const destinationId = await createLocationOnCountingApp(adminAuth, `Destino ${randomUUID()}`);
      const tripRes = await request(countingApp.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', adminAuth)
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

      await request(countingApp.getHttpServer())
        .post('/api/v1/trip-stops')
        .set('Authorization', adminAuth)
        .send({ vehicleId, driverId, type: 'MAINTENANCE', startedAt: '2026-01-10T08:00:00.000Z', endedAt: '2026-01-10T09:00:00.000Z', tripId })
        .expect(201);
    }

    async function createLocationOnCountingApp(adminAuth: string, name: string) {
      const res = await request(countingApp.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', adminAuth)
        .send({ name, type: 'DISTRIBUTION_CENTER' })
        .expect(201);
      return res.body.data.id as string;
    }

    it('a contagem de queries de GET /fleet-operations/compositions nao cresce entre 10 e 50 carretas', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginOnCountingApp('N1Check');

      for (let i = 0; i < 10; i += 1) {
        await seedTrailerWithCompositionAndStop(adminAuth, tenantId);
      }
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/fleet-operations/compositions')
        .set('Authorization', adminAuth)
        .expect(200);
      const queriesFor10 = queryCount;

      for (let i = 0; i < 40; i += 1) {
        await seedTrailerWithCompositionAndStop(adminAuth, tenantId);
      }
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/fleet-operations/compositions')
        .set('Authorization', adminAuth)
        .expect(200);
      const queriesFor50 = queryCount;

      expect(queriesFor50).toBeLessThanOrEqual(queriesFor10 + 1);
    }, 120000);
  });
});
