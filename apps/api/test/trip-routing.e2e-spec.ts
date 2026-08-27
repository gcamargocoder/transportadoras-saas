import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 89 -- roteirizacao operacional das paradas/entregas (TripDeliveryStop,
// Fase 88). Cobre o motor de sugestao real desta instalacao (sem provedor de
// mapas configurado -- ver docs/trip-routing.md): ordenacao por
// plannedArrival, preservacao da sequencia quando nada e aplicado, aplicacao
// explicita (reordena + versiona RouteVersion), trava de planejamento por
// status da viagem, isolamento multi-tenant, RBAC e ausencia de N+1 -- com
// requests reais contra o Postgres.
describe('Trip Routing -- sugestao/aplicacao de sequencia (e2e)', () => {
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
      slug: `trouting-${label.toLowerCase()}-${unique}`,
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

  async function createLocation(auth: string, name: string, address?: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/locations')
      .set('Authorization', auth)
      .send({ name, type: 'CUSTOMER_SITE', ...(address ? { address } : {}) })
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

  async function setupPlannedTrip(auth: string) {
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
    return { tripId: tripRes.body.data.id as string };
  }

  async function addStop(
    auth: string,
    tripId: string,
    opts: { locationName: string; address?: string; plannedArrival?: string },
  ) {
    const locationId = await createLocation(auth, opts.locationName, opts.address);
    const res = await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/delivery-stops`)
      .set('Authorization', auth)
      .send({ locationId, ...(opts.plannedArrival ? { plannedArrival: opts.plannedArrival } : {}) })
      .expect(201);
    return res.body.data.id as string;
  }

  async function startTrip(auth: string, tripId: string) {
    await request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}/status`)
      .set('Authorization', auth)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
  }

  // ==========================================================================
  // GET .../routing-suggestion -- motor de sugestao (ordena por plannedArrival)
  // ==========================================================================
  describe('GET /trips/:id/delivery-stops/routing-suggestion', () => {
    it('sugere a sequencia por previsao de chegada (plannedArrival), preservando ordem relativa de quem nao tem', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Suggest');
      const { tripId } = await setupPlannedTrip(adminAuth);

      // Criadas fora de ordem cronologica de proposito: C (12h) deveria vir
      // antes de A (14h); B sem previsao mantem sua posicao relativa apos as
      // que tem previsao.
      const stopA = await addStop(adminAuth, tripId, { locationName: 'Cliente A', plannedArrival: '2026-09-01T14:00:00.000Z' });
      const stopB = await addStop(adminAuth, tripId, { locationName: 'Cliente B' });
      const stopC = await addStop(adminAuth, tripId, { locationName: 'Cliente C', plannedArrival: '2026-09-01T12:00:00.000Z' });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/delivery-stops/routing-suggestion`)
        .set('Authorization', adminAuth)
        .expect(200);

      expect(res.body.data.changed).toBe(true);
      expect(res.body.data.distanceMeters).toBeNull();
      expect(res.body.data.durationSeconds).toBeNull();
      expect(res.body.data.items.map((i: { stopId: string }) => i.stopId)).toEqual([stopC, stopA, stopB]);
      expect(res.body.data.items.map((i: { suggestedSequence: number }) => i.suggestedSequence)).toEqual([1, 2, 3]);
      expect(Array.isArray(res.body.data.limitations)).toBe(true);
      expect(res.body.data.limitations.length).toBeGreaterThan(0);
      expect(typeof res.body.data.routingProviderConfigured).toBe('boolean');

      // Nada foi persistido: a sequencia atual das paradas continua a mesma.
      const list = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/delivery-stops`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(list.body.data.map((s: { id: string }) => s.id)).toEqual([stopA, stopB, stopC]);
    });

    it('changed=false quando a sequencia atual ja e igual a sugerida', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('SuggestUnchanged');
      const { tripId } = await setupPlannedTrip(adminAuth);
      await addStop(adminAuth, tripId, { locationName: 'Cliente A', plannedArrival: '2026-09-01T12:00:00.000Z' });
      await addStop(adminAuth, tripId, { locationName: 'Cliente B', plannedArrival: '2026-09-01T14:00:00.000Z' });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/delivery-stops/routing-suggestion`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.changed).toBe(false);
    });

    it('aponta paradas cujo local nao tem endereco cadastrado (localizacao insuficiente)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('SuggestNoAddress');
      const { tripId } = await setupPlannedTrip(adminAuth);
      await addStop(adminAuth, tripId, { locationName: 'Com Endereco', address: 'Rua Real, 123' });
      await addStop(adminAuth, tripId, { locationName: 'Sem Endereco' });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/delivery-stops/routing-suggestion`)
        .set('Authorization', adminAuth)
        .expect(200);

      const byName = new Map(res.body.data.items.map((i: { locationName: string; hasAddress: boolean }) => [i.locationName, i.hasAddress]));
      expect(byName.get('Com Endereco')).toBe(true);
      expect(byName.get('Sem Endereco')).toBe(false);
      expect(res.body.data.limitations.some((l: string) => l.includes('Sem Endereco'))).toBe(true);
    });

    it('viagem ja partida ainda permite consultar a sugestao (somente leitura)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('SuggestAfterDeparture');
      const { tripId } = await setupPlannedTrip(adminAuth);
      await addStop(adminAuth, tripId, { locationName: 'Cliente A' });
      await startTrip(adminAuth, tripId);

      await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/delivery-stops/routing-suggestion`)
        .set('Authorization', adminAuth)
        .expect(200);
    });
  });

  // ==========================================================================
  // POST .../routing-suggestion/apply
  // ==========================================================================
  describe('POST /trips/:id/delivery-stops/routing-suggestion/apply', () => {
    it('aplica a sugestao: reordena as paradas e cria uma nova RouteVersion (STOP_RESEQUENCE)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Apply');
      const { tripId } = await setupPlannedTrip(adminAuth);
      const stopA = await addStop(adminAuth, tripId, { locationName: 'Cliente A', plannedArrival: '2026-09-01T14:00:00.000Z' });
      const stopB = await addStop(adminAuth, tripId, { locationName: 'Cliente B', plannedArrival: '2026-09-01T12:00:00.000Z' });

      const versionsBefore = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/route-versions`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(versionsBefore.body.data).toHaveLength(1);

      const applyRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/delivery-stops/routing-suggestion/apply`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(applyRes.body.data.applied).toBe(true);
      expect(applyRes.body.data.routeVersionNumber).toBe(2);
      expect(applyRes.body.data.routeVersionId).toEqual(expect.any(String));

      const list = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/delivery-stops`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(list.body.data.map((s: { id: string }) => s.id)).toEqual([stopB, stopA]);

      const versionsAfter = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/route-versions`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(versionsAfter.body.data).toHaveLength(2);
      expect(versionsAfter.body.data[1]).toMatchObject({ versionNumber: 2, reason: 'STOP_RESEQUENCE' });
    });

    it('preserva a sequencia atual quando a sugestao nao e aplicada (nenhuma chamada a apply)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('NotApplied');
      const { tripId } = await setupPlannedTrip(adminAuth);
      const stopA = await addStop(adminAuth, tripId, { locationName: 'Cliente A', plannedArrival: '2026-09-01T14:00:00.000Z' });
      const stopB = await addStop(adminAuth, tripId, { locationName: 'Cliente B', plannedArrival: '2026-09-01T12:00:00.000Z' });

      // So consulta a sugestao -- nunca chama apply.
      await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/delivery-stops/routing-suggestion`)
        .set('Authorization', adminAuth)
        .expect(200);

      const list = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/delivery-stops`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(list.body.data.map((s: { id: string }) => s.id)).toEqual([stopA, stopB]);
    });

    it('e um no-op idempotente quando a sequencia atual ja e igual a sugerida (nenhuma RouteVersion nova)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ApplyNoop');
      const { tripId } = await setupPlannedTrip(adminAuth);
      await addStop(adminAuth, tripId, { locationName: 'Cliente A', plannedArrival: '2026-09-01T12:00:00.000Z' });
      await addStop(adminAuth, tripId, { locationName: 'Cliente B', plannedArrival: '2026-09-01T14:00:00.000Z' });

      const applyRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/delivery-stops/routing-suggestion/apply`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(applyRes.body.data).toMatchObject({ applied: false, routeVersionId: null, routeVersionNumber: null });

      const versions = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/route-versions`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(versions.body.data).toHaveLength(1);
    });

    it('bloqueia aplicar depois que a viagem partiu ou foi cancelada (409)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ApplyLocked');
      const { tripId } = await setupPlannedTrip(adminAuth);
      await addStop(adminAuth, tripId, { locationName: 'Cliente A', plannedArrival: '2026-09-01T14:00:00.000Z' });
      await addStop(adminAuth, tripId, { locationName: 'Cliente B', plannedArrival: '2026-09-01T12:00:00.000Z' });
      await startTrip(adminAuth, tripId);

      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/delivery-stops/routing-suggestion/apply`)
        .set('Authorization', adminAuth)
        .expect(409);

      const { tripId: tripId2 } = await setupPlannedTrip(adminAuth);
      await addStop(adminAuth, tripId2, { locationName: 'Cliente A', plannedArrival: '2026-09-01T14:00:00.000Z' });
      await addStop(adminAuth, tripId2, { locationName: 'Cliente B', plannedArrival: '2026-09-01T12:00:00.000Z' });
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId2}/cancel`)
        .set('Authorization', adminAuth)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId2}/delivery-stops/routing-suggestion/apply`)
        .set('Authorization', adminAuth)
        .expect(409);
    });
  });

  // ==========================================================================
  // Isolamento multi-tenant
  // ==========================================================================
  describe('isolamento multi-tenant', () => {
    it('tenant B nunca consegue consultar ou aplicar a sugestao de uma viagem do tenant A', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolA');
      const { tripId } = await setupPlannedTrip(tenantA.adminAuth);
      await addStop(tenantA.adminAuth, tripId, { locationName: 'Cliente A' });

      const tenantB = await createTenantAndLoginAsAdmin('IsolB');
      await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/delivery-stops/routing-suggestion`)
        .set('Authorization', tenantB.adminAuth)
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/delivery-stops/routing-suggestion/apply`)
        .set('Authorization', tenantB.adminAuth)
        .expect(404);
    });
  });

  // ==========================================================================
  // RBAC
  // ==========================================================================
  describe('RBAC', () => {
    it('leitura: MANAGER/OPERATOR/DISPATCHER/AUDITOR ok; DRIVER bloqueado (403)', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('RbacRead');
      const { tripId } = await setupPlannedTrip(adminAuth);
      await addStop(adminAuth, tripId, { locationName: 'Cliente A' });

      for (const role of ['MANAGER', 'OPERATOR', 'DISPATCHER', 'AUDITOR']) {
        const auth = await createUserWithRole(tenantId, adminAuth, role);
        await request(app.getHttpServer())
          .get(`/api/v1/trips/${tripId}/delivery-stops/routing-suggestion`)
          .set('Authorization', auth)
          .expect(200);
      }

      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/delivery-stops/routing-suggestion`)
        .set('Authorization', driverAuth)
        .expect(403);
    });

    it('escrita: AUDITOR bloqueado (403) ao aplicar; DISPATCHER pode aplicar', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('RbacWrite');
      const { tripId } = await setupPlannedTrip(adminAuth);
      await addStop(adminAuth, tripId, { locationName: 'Cliente A', plannedArrival: '2026-09-01T14:00:00.000Z' });
      await addStop(adminAuth, tripId, { locationName: 'Cliente B', plannedArrival: '2026-09-01T12:00:00.000Z' });

      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');
      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/delivery-stops/routing-suggestion/apply`)
        .set('Authorization', auditorAuth)
        .expect(403);

      const dispatcherAuth = await createUserWithRole(tenantId, adminAuth, 'DISPATCHER');
      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/delivery-stops/routing-suggestion/apply`)
        .set('Authorization', dispatcherAuth)
        .expect(200);
    });
  });

  // ==========================================================================
  // Ausencia de N+1 -- GET routing-suggestion com paradas crescentes
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
        slug: `trouting-n1-${label.toLowerCase()}-${unique}`,
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
      return { tenantId, adminAuth: `Bearer ${loginRes.body.data.accessToken as string}` };
    }

    it('a contagem de queries de GET .../routing-suggestion nao cresce com o numero de paradas', async () => {
      const { adminAuth } = await createTenantAndLoginOnCountingApp('N1');
      const vehicleRes = await request(countingApp.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', adminAuth)
        .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
        .expect(201);
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

      const checkpoints = [5, 15, 30];
      const queriesByCheckpoint: number[] = [];
      let seeded = 0;
      for (const checkpoint of checkpoints) {
        while (seeded < checkpoint) {
          const locationRes = await request(countingApp.getHttpServer())
            .post('/api/v1/locations')
            .set('Authorization', adminAuth)
            .send({ name: `Parada ${seeded} ${randomUUID()}`, type: 'CUSTOMER_SITE' })
            .expect(201);
          await request(countingApp.getHttpServer())
            .post(`/api/v1/trips/${tripId}/delivery-stops`)
            .set('Authorization', adminAuth)
            .send({ locationId: locationRes.body.data.id })
            .expect(201);
          seeded += 1;
        }
        queryCount = 0;
        await request(countingApp.getHttpServer())
          .get(`/api/v1/trips/${tripId}/delivery-stops/routing-suggestion`)
          .set('Authorization', adminAuth)
          .expect(200);
        queriesByCheckpoint.push(queryCount);
      }

      const [queriesFor5, , queriesFor30] = queriesByCheckpoint;
      expect(queriesFor5).toBeGreaterThan(0);
      expect(queriesFor30).toBeLessThanOrEqual(queriesFor5 + 1);
    }, 180000);
  });
});
