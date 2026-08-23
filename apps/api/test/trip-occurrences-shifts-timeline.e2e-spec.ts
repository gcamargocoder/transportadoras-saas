import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 67 -- Timeline Operacional, Ocorrencias e Jornada da Viagem.
describe('Trip Occurrences, Driver Shifts e Timeline unificada (e2e)', () => {
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
      slug: `occ-${label.toLowerCase()}-${unique}`,
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

    return {
      driverId,
      vehicleId,
      compositionId,
      tripId,
      driverAuth: `Bearer ${loginRes.body.data.accessToken as string}`,
    };
  }

  // ==========================================================================
  // Ocorrencias
  // ==========================================================================
  describe('TripOccurrence', () => {
    it('admin registra, lista, resolve e cancela uma ocorrencia (idempotente)', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('OccAdmin');
      const { tripId } = await setupDriverWithTrip(adminAuth, tenantId);

      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/occurrences`)
        .set('Authorization', adminAuth)
        .send({ type: 'BREAKDOWN', severity: 'CRITICAL', description: 'Pane no motor', occurredAt: '2026-09-01T10:00:00.000Z' })
        .expect(201);
      const occurrenceId = createRes.body.data.id as string;
      expect(createRes.body.data.status).toBe('OPEN');

      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/occurrences`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(listRes.body.data).toHaveLength(1);

      const resolveRes = await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/occurrences/${occurrenceId}/resolve`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(resolveRes.body.data.status).toBe('RESOLVED');
      expect(resolveRes.body.data.resolvedAt).toBeTruthy();

      // Idempotente -- resolver de novo nao muda resolvedAt.
      const resolveAgain = await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/occurrences/${occurrenceId}/resolve`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(resolveAgain.body.data.resolvedAt).toBe(resolveRes.body.data.resolvedAt);

      const cancelRes = await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/occurrences/${occurrenceId}/cancel`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(cancelRes.body.data.status).toBe('CANCELLED');
    });

    it('motorista registra ocorrencia propria; deviceEventId repetido nao duplica', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('OccDriver');
      const { tripId, driverAuth } = await setupDriverWithTrip(adminAuth, tenantId);
      await request(app.getHttpServer()).post(`/api/v1/driver/trips/${tripId}/start`).set('Authorization', driverAuth).send({}).expect(201);

      const deviceEventId = `dev-${randomUUID()}`;
      const payload = {
        deviceEventId,
        type: 'ROUTE_DEVIATION',
        description: 'Desvio por bloqueio na via',
        occurredAt: '2026-09-01T11:00:00.000Z',
      };

      const first = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/occurrences`)
        .set('Authorization', driverAuth)
        .send(payload)
        .expect(201);

      const second = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/occurrences`)
        .set('Authorization', driverAuth)
        .send(payload)
        .expect(201);

      expect(second.body.data.id).toBe(first.body.data.id);

      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/driver/trips/${tripId}/occurrences`)
        .set('Authorization', driverAuth)
        .expect(200);
      expect(listRes.body.data).toHaveLength(1);
      expect(listRes.body.data[0].vehicleId).toBeTruthy();
    });

    it('isolamento multi-tenant: ocorrencia de outro tenant retorna 404', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('OccTenantA');
      const tenantB = await createTenantAndLoginAsAdmin('OccTenantB');
      const { tripId } = await setupDriverWithTrip(tenantA.adminAuth, tenantA.tenantId);

      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/occurrences`)
        .set('Authorization', tenantB.adminAuth)
        .send({ type: 'OTHER', description: 'x', occurredAt: '2026-09-01T10:00:00.000Z' })
        .expect(404);
    });

    it('auditor nao consegue criar ocorrencia (somente leitura)', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('OccAuditor');
      const { tripId } = await setupDriverWithTrip(adminAuth, tenantId);

      const unique = randomUUID().replace(/-/g, '').slice(0, 10);
      const email = `auditor-${unique}@teste.com`;
      const password = 'SenhaForte123!';
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', adminAuth)
        .send({ name: 'Auditor', email, password, role: 'AUDITOR' })
        .expect(201);
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId, email, password })
        .expect(200);
      const auditorAuth = `Bearer ${loginRes.body.data.accessToken as string}`;

      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/occurrences`)
        .set('Authorization', auditorAuth)
        .send({ type: 'OTHER', description: 'x', occurredAt: '2026-09-01T10:00:00.000Z' })
        .expect(403);

      await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/occurrences`)
        .set('Authorization', auditorAuth)
        .expect(200);
    });
  });

  // ==========================================================================
  // DriverShift / ShiftBreak
  // ==========================================================================
  describe('DriverShift / ShiftBreak', () => {
    it('inicia, pausa, retoma e encerra a jornada (idempotente em cada etapa)', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('ShiftFlow');
      const { tripId, driverAuth } = await setupDriverWithTrip(adminAuth, tenantId);

      const start1 = await request(app.getHttpServer())
        .post('/api/v1/driver/shifts/start')
        .set('Authorization', driverAuth)
        .send({ tripId })
        .expect(201);
      const shiftId = start1.body.data.id as string;
      expect(start1.body.data.status).toBe('OPEN');

      // Idempotente: iniciar de novo com jornada ja aberta devolve a MESMA.
      const start2 = await request(app.getHttpServer())
        .post('/api/v1/driver/shifts/start')
        .set('Authorization', driverAuth)
        .send({})
        .expect(201);
      expect(start2.body.data.id).toBe(shiftId);

      const active = await request(app.getHttpServer())
        .get('/api/v1/driver/shifts/active')
        .set('Authorization', driverAuth)
        .expect(200);
      expect(active.body.data.id).toBe(shiftId);

      const pause1 = await request(app.getHttpServer())
        .post(`/api/v1/driver/shifts/${shiftId}/breaks`)
        .set('Authorization', driverAuth)
        .send({ type: 'MEAL' })
        .expect(201);
      expect(pause1.body.data.breaks).toHaveLength(1);
      expect(pause1.body.data.breaks[0].endedAt).toBeNull();

      // Idempotente: pausar de novo com uma pausa ja em aberto nao cria outra.
      const pause2 = await request(app.getHttpServer())
        .post(`/api/v1/driver/shifts/${shiftId}/breaks`)
        .set('Authorization', driverAuth)
        .send({ type: 'MEAL' })
        .expect(201);
      expect(pause2.body.data.breaks).toHaveLength(1);

      const resume1 = await request(app.getHttpServer())
        .post(`/api/v1/driver/shifts/${shiftId}/breaks/end`)
        .set('Authorization', driverAuth)
        .expect(201);
      expect(resume1.body.data.breaks[0].endedAt).toBeTruthy();
      expect(resume1.body.data.breaks[0].durationMinutes).not.toBeNull();

      const end1 = await request(app.getHttpServer())
        .post(`/api/v1/driver/shifts/${shiftId}/end`)
        .set('Authorization', driverAuth)
        .expect(201);
      expect(end1.body.data.status).toBe('CLOSED');
      expect(end1.body.data.durationMinutes).not.toBeNull();
      expect(end1.body.data.workedMinutes).not.toBeNull();

      // Idempotente: encerrar de novo devolve o mesmo endedAt.
      const end2 = await request(app.getHttpServer())
        .post(`/api/v1/driver/shifts/${shiftId}/end`)
        .set('Authorization', driverAuth)
        .expect(201);
      expect(end2.body.data.endedAt).toBe(end1.body.data.endedAt);

      const adminList = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/shifts`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(adminList.body.data).toHaveLength(1);
      expect(adminList.body.data[0].id).toBe(shiftId);
    });

    it('encerrar a jornada com pausa em aberto fecha a pausa automaticamente', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('ShiftAutoClose');
      const { driverAuth } = await setupDriverWithTrip(adminAuth, tenantId);

      const start = await request(app.getHttpServer())
        .post('/api/v1/driver/shifts/start')
        .set('Authorization', driverAuth)
        .send({})
        .expect(201);
      const shiftId = start.body.data.id as string;

      await request(app.getHttpServer())
        .post(`/api/v1/driver/shifts/${shiftId}/breaks`)
        .set('Authorization', driverAuth)
        .send({ type: 'REST' })
        .expect(201);

      const end = await request(app.getHttpServer())
        .post(`/api/v1/driver/shifts/${shiftId}/end`)
        .set('Authorization', driverAuth)
        .expect(201);

      expect(end.body.data.breaks[0].endedAt).toBeTruthy();
    });

    it('cancela uma jornada aberta por engano (idempotente)', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('ShiftCancel');
      const { driverAuth } = await setupDriverWithTrip(adminAuth, tenantId);

      const start = await request(app.getHttpServer())
        .post('/api/v1/driver/shifts/start')
        .set('Authorization', driverAuth)
        .send({})
        .expect(201);
      const shiftId = start.body.data.id as string;

      const cancel1 = await request(app.getHttpServer())
        .post(`/api/v1/driver/shifts/${shiftId}/cancel`)
        .set('Authorization', driverAuth)
        .expect(201);
      expect(cancel1.body.data.status).toBe('CANCELLED');

      const cancel2 = await request(app.getHttpServer())
        .post(`/api/v1/driver/shifts/${shiftId}/cancel`)
        .set('Authorization', driverAuth)
        .expect(201);
      expect(cancel2.body.data.cancelledAt).toBe(cancel1.body.data.cancelledAt);

      const active = await request(app.getHttpServer())
        .get('/api/v1/driver/shifts/active')
        .set('Authorization', driverAuth)
        .expect(200);
      expect(active.body.data).toBeNull();
    });

    it('um motorista nunca ve/altera a jornada de outro (DriverGuard, isolamento por driverId)', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('ShiftIsolation');
      const driverA = await setupDriverWithTrip(adminAuth, tenantId);
      const driverB = await setupDriverWithTrip(adminAuth, tenantId);

      const start = await request(app.getHttpServer())
        .post('/api/v1/driver/shifts/start')
        .set('Authorization', driverA.driverAuth)
        .send({})
        .expect(201);
      const shiftId = start.body.data.id as string;

      await request(app.getHttpServer())
        .post(`/api/v1/driver/shifts/${shiftId}/end`)
        .set('Authorization', driverB.driverAuth)
        .expect(404);
    });
  });

  // ==========================================================================
  // Timeline unificada
  // ==========================================================================
  describe('GET /trips/:id/timeline (Fase 67 -- agregacao multi-origem)', () => {
    it('agrega paradas, abastecimento e ocorrencia junto com a auditoria da viagem', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('TimelineAgg');
      const { tripId, driverAuth } = await setupDriverWithTrip(adminAuth, tenantId);
      await request(app.getHttpServer()).post(`/api/v1/driver/trips/${tripId}/start`).set('Authorization', driverAuth).send({}).expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/stops`)
        .set('Authorization', driverAuth)
        .send({ deviceEventId: `stop-${randomUUID()}`, latitude: -23.5, longitude: -46.6, startedAt: '2026-09-01T09:00:00.000Z' })
        .expect(201);

      const stationRes = await request(app.getHttpServer())
        .post('/api/v1/fuel-stations')
        .set('Authorization', adminAuth)
        .send({ name: `Posto ${randomUUID()}` })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/fuel-supplies')
        .set('Authorization', adminAuth)
        .send({
          tripId,
          fuelStationId: stationRes.body.data.id,
          fuelType: 'DIESEL_S10',
          liters: 100,
          pricePerLiter: 5.5,
          odometerKm: 5000,
          supplyDate: '2026-09-01T09:30:00.000Z',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/occurrences`)
        .set('Authorization', adminAuth)
        .send({ type: 'DELAY', description: 'Atraso no carregamento', occurredAt: '2026-09-01T09:45:00.000Z' })
        .expect(201);

      const timelineRes = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/timeline`)
        .set('Authorization', adminAuth)
        .query({ pageSize: 100 })
        .expect(200);

      const origins = timelineRes.body.data.items.map((i: { origin: string }) => i.origin);
      expect(origins).toEqual(expect.arrayContaining(['STOP', 'FUEL', 'OCCURRENCE', 'AUDIT']));

      // Ordenacao desc por padrao -- o item mais recente vem primeiro.
      const occurredAts = timelineRes.body.data.items.map((i: { occurredAt: string }) => new Date(i.occurredAt).getTime());
      const sorted = [...occurredAts].sort((a, b) => b - a);
      expect(occurredAts).toEqual(sorted);
    });

    it('filtra por origin/type/periodo e ordena asc quando pedido', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('TimelineFilters');
      const { tripId } = await setupDriverWithTrip(adminAuth, tenantId);

      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/occurrences`)
        .set('Authorization', adminAuth)
        .send({ type: 'BREAKDOWN', description: 'a', occurredAt: '2026-09-01T08:00:00.000Z' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/occurrences`)
        .set('Authorization', adminAuth)
        .send({ type: 'DELAY', description: 'b', occurredAt: '2026-09-01T09:00:00.000Z' })
        .expect(201);

      const onlyBreakdown = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/timeline`)
        .set('Authorization', adminAuth)
        .query({ origin: 'OCCURRENCE', type: 'BREAKDOWN' })
        .expect(200);
      expect(onlyBreakdown.body.data.items).toHaveLength(1);
      expect(onlyBreakdown.body.data.items[0].type).toBe('BREAKDOWN');

      const asc = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/timeline`)
        .set('Authorization', adminAuth)
        .query({ origin: 'OCCURRENCE', order: 'asc' })
        .expect(200);
      expect(asc.body.data.items[0].type).toBe('BREAKDOWN');
      expect(asc.body.data.items[1].type).toBe('DELAY');

      const outOfRange = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/timeline`)
        .set('Authorization', adminAuth)
        .query({ origin: 'OCCURRENCE', from: '2026-09-02', to: '2026-09-03' })
        .expect(200);
      expect(outOfRange.body.data.items).toHaveLength(0);
    });

    it('pagina corretamente com meta.total refletindo o total agregado', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('TimelinePaging');
      const { tripId } = await setupDriverWithTrip(adminAuth, tenantId);

      for (let i = 0; i < 5; i += 1) {
        await request(app.getHttpServer())
          .post(`/api/v1/trips/${tripId}/occurrences`)
          .set('Authorization', adminAuth)
          .send({ type: 'OTHER', description: `oc-${i}`, occurredAt: `2026-09-01T0${i}:00:00.000Z` })
          .expect(201);
      }

      const page1 = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/timeline`)
        .set('Authorization', adminAuth)
        .query({ origin: 'OCCURRENCE', page: 1, pageSize: 2 })
        .expect(200);
      expect(page1.body.data.items).toHaveLength(2);
      expect(page1.body.data.meta.total).toBe(5);

      const page3 = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/timeline`)
        .set('Authorization', adminAuth)
        .query({ origin: 'OCCURRENCE', page: 3, pageSize: 2 })
        .expect(200);
      expect(page3.body.data.items).toHaveLength(1);
    });

    it('isolamento multi-tenant: timeline de viagem de outro tenant retorna 404', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('TimelineTenantA');
      const tenantB = await createTenantAndLoginAsAdmin('TimelineTenantB');
      const { tripId } = await setupDriverWithTrip(tenantA.adminAuth, tenantA.tenantId);

      await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/timeline`)
        .set('Authorization', tenantB.adminAuth)
        .expect(404);
    });
  });

  // ==========================================================================
  // Verificacao real de ausencia de N+1 -- mesmo padrao ja usado em
  // fleet-operations-fuel.e2e-spec.ts: conta as queries Prisma efetivamente
  // executadas por GET /trips/:id/timeline com 10 vs 50 ocorrencias.
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
        slug: `tl-n1-${label.toLowerCase()}-${unique}`,
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

    async function setupTripOnCountingApp(adminAuth: string) {
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
      return tripRes.body.data.id as string;
    }

    async function seedOccurrence(adminAuth: string, tripId: string, index: number) {
      await request(countingApp.getHttpServer())
        .post(`/api/v1/trips/${tripId}/occurrences`)
        .set('Authorization', adminAuth)
        .send({ type: 'OTHER', description: `oc-${index}`, occurredAt: `2026-09-01T${String(index % 24).padStart(2, '0')}:00:00.000Z` })
        .expect(201);
    }

    it('a contagem de queries de GET /trips/:id/timeline nao cresce entre 10 e 50 eventos', async () => {
      const { adminAuth } = await createTenantAndLoginOnCountingApp('N1Check');
      const tripId = await setupTripOnCountingApp(adminAuth);

      for (let i = 0; i < 10; i += 1) {
        await seedOccurrence(adminAuth, tripId, i);
      }
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get(`/api/v1/trips/${tripId}/timeline`)
        .set('Authorization', adminAuth)
        .query({ pageSize: 100 })
        .expect(200);
      const queriesFor10 = queryCount;
      expect(queriesFor10).toBeGreaterThan(0);

      for (let i = 10; i < 50; i += 1) {
        await seedOccurrence(adminAuth, tripId, i);
      }
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get(`/api/v1/trips/${tripId}/timeline`)
        .set('Authorization', adminAuth)
        .query({ pageSize: 100 })
        .expect(200);
      const queriesFor50 = queryCount;

      // O(1): numero FIXO de queries (uma por origem agregada + a checagem
      // de existencia da viagem), nunca 1 query por evento.
      expect(queriesFor50).toBeLessThanOrEqual(queriesFor10 + 1);
    }, 120000);
  });
});
