import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 43 -- controle de paradas e tempos operacionais da frota. Cobre os
// endpoints administrativos cross-frota (POST/GET/PATCH /trip-stops,
// controller novo desta fase -- os services por tras (TripStopsService) ja
// existiam de uma fase anterior, so nao estavam expostos por nenhum
// controller) e o fechamento offline por deviceEventId (POST
// driver/trips/:id/stops/close-by-device-event). Idempotencia, validacao de
// intervalo, cancelamento, isolamento multi-tenant, RBAC e ausencia de N+1
// no dashboard de paradas (GET /fleet-operations/stops) sao verificados com
// requests reais contra o Postgres -- nenhum mock de banco.
describe('Trip Stops -- controle de paradas (e2e)', () => {
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
      slug: `tstops-${label.toLowerCase()}-${unique}`,
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
      .send({ vehicleId, trailers: [], axleConfiguration: { totalAxles: 6, billableCategory: '6 eixos' } })
      .expect(201);
    return res.body.data.id as string;
  }

  // Motorista + veiculo + composicao + viagem PLANNED, com login proprio
  // (mesmo fluxo de fleet-operations.e2e-spec.ts / driver-trips.e2e-spec.ts).
  async function setupDriverWithTrip(adminAuth: string, tenantId: string, vehicleId: string) {
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

    await request(app.getHttpServer())
      .patch(`/api/v1/drivers/${driverId}/user-link`)
      .set('Authorization', adminAuth)
      .send({ userAccountId: userRes.body.data.id })
      .expect(200);

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email, password })
      .expect(200);

    return { driverId, tripId, driverAuth: `Bearer ${loginRes.body.data.accessToken as string}` };
  }

  // ==========================================================================
  // POST /trip-stops -- criacao administrativa
  // ==========================================================================
  describe('POST /trip-stops', () => {
    it('cria uma parada administrativa sem viagem, aberta (status OPEN)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Create');
      const vehicleId = await createVehicle(adminAuth);

      const res = await request(app.getHttpServer())
        .post('/api/v1/trip-stops')
        .set('Authorization', adminAuth)
        .send({ vehicleId, type: 'YARD', startedAt: '2026-09-01T08:00:00.000Z', notes: 'Patio matriz' })
        .expect(201);

      expect(res.body.data).toMatchObject({
        vehicleId,
        tripId: null,
        driverId: null,
        type: 'YARD',
        status: 'OPEN',
        source: 'ADMIN',
        endedAt: null,
        durationMinutes: null,
        notes: 'Patio matriz',
      });
    });

    it('cria ja fechada quando endedAt e informado, com duracao calculada pelo backend', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CreateClosed');
      const vehicleId = await createVehicle(adminAuth);

      const res = await request(app.getHttpServer())
        .post('/api/v1/trip-stops')
        .set('Authorization', adminAuth)
        .send({
          vehicleId,
          type: 'BREAKDOWN',
          startedAt: '2026-09-01T08:00:00.000Z',
          endedAt: '2026-09-01T09:30:00.000Z',
        })
        .expect(201);

      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.durationMinutes).toBe(90);
    });

    it('rejeita endedAt anterior a startedAt (nunca duracao negativa)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CreateNeg');
      const vehicleId = await createVehicle(adminAuth);

      await request(app.getHttpServer())
        .post('/api/v1/trip-stops')
        .set('Authorization', adminAuth)
        .send({ vehicleId, startedAt: '2026-09-01T09:00:00.000Z', endedAt: '2026-09-01T08:00:00.000Z' })
        .expect(400);
    });

    it('e idempotente por deviceEventId -- reenviar o mesmo evento nunca duplica', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CreateIdem');
      const vehicleId = await createVehicle(adminAuth);
      const deviceEventId = `admin-${randomUUID()}`;

      const first = await request(app.getHttpServer())
        .post('/api/v1/trip-stops')
        .set('Authorization', adminAuth)
        .send({ vehicleId, type: 'GARAGE', startedAt: '2026-09-01T08:00:00.000Z', deviceEventId })
        .expect(201);

      const second = await request(app.getHttpServer())
        .post('/api/v1/trip-stops')
        .set('Authorization', adminAuth)
        .send({ vehicleId, type: 'GARAGE', startedAt: '2026-09-01T08:00:00.000Z', deviceEventId })
        .expect(201);

      expect(second.body.data.id).toBe(first.body.data.id);
      const count = await prisma.tripStop.count({ where: { deviceEventId } });
      expect(count).toBe(1);
    });

    it('bloqueia abrir uma segunda parada para um veiculo que ja tem uma em aberto', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CreateConflict');
      const vehicleId = await createVehicle(adminAuth);

      await request(app.getHttpServer())
        .post('/api/v1/trip-stops')
        .set('Authorization', adminAuth)
        .send({ vehicleId, startedAt: '2026-09-01T08:00:00.000Z' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/trip-stops')
        .set('Authorization', adminAuth)
        .send({ vehicleId, startedAt: '2026-09-01T09:00:00.000Z' })
        .expect(409);
    });
  });

  // ==========================================================================
  // PATCH /trip-stops/:id/close e /cancel
  // ==========================================================================
  describe('PATCH /trip-stops/:id/close e /cancel', () => {
    it('fecha uma parada aberta calculando a duracao', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Close');
      const vehicleId = await createVehicle(adminAuth);
      const openRes = await request(app.getHttpServer())
        .post('/api/v1/trip-stops')
        .set('Authorization', adminAuth)
        .send({ vehicleId, startedAt: '2026-09-01T08:00:00.000Z' })
        .expect(201);

      const closeRes = await request(app.getHttpServer())
        .patch(`/api/v1/trip-stops/${openRes.body.data.id}/close`)
        .set('Authorization', adminAuth)
        .send({ endedAt: '2026-09-01T08:45:00.000Z' })
        .expect(200);

      expect(closeRes.body.data.status).toBe('COMPLETED');
      expect(closeRes.body.data.durationMinutes).toBe(45);
    });

    it('fechar 2x e idempotente -- segunda chamada devolve o mesmo estado sem recalcular', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CloseIdem');
      const vehicleId = await createVehicle(adminAuth);
      const openRes = await request(app.getHttpServer())
        .post('/api/v1/trip-stops')
        .set('Authorization', adminAuth)
        .send({ vehicleId, startedAt: '2026-09-01T08:00:00.000Z' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/trip-stops/${openRes.body.data.id}/close`)
        .set('Authorization', adminAuth)
        .send({ endedAt: '2026-09-01T08:20:00.000Z' })
        .expect(200);

      const second = await request(app.getHttpServer())
        .patch(`/api/v1/trip-stops/${openRes.body.data.id}/close`)
        .set('Authorization', adminAuth)
        .send({ endedAt: '2026-09-01T10:00:00.000Z' })
        .expect(200);

      expect(second.body.data.durationMinutes).toBe(20);
    });

    it('cancela uma parada (idempotente) -- uma vez cancelada, nunca pode ser fechada', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Cancel');
      const vehicleId = await createVehicle(adminAuth);
      const openRes = await request(app.getHttpServer())
        .post('/api/v1/trip-stops')
        .set('Authorization', adminAuth)
        .send({ vehicleId, startedAt: '2026-09-01T08:00:00.000Z' })
        .expect(201);
      const id = openRes.body.data.id as string;

      const cancelRes = await request(app.getHttpServer())
        .patch(`/api/v1/trip-stops/${id}/cancel`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(cancelRes.body.data.status).toBe('CANCELLED');

      const secondCancel = await request(app.getHttpServer())
        .patch(`/api/v1/trip-stops/${id}/cancel`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(secondCancel.body.data.status).toBe('CANCELLED');

      await request(app.getHttpServer())
        .patch(`/api/v1/trip-stops/${id}/close`)
        .set('Authorization', adminAuth)
        .send({ endedAt: '2026-09-01T09:00:00.000Z' })
        .expect(409);
    });

    it('uma parada cancelada nunca conta no dashboard de paradas', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CancelDashboard');
      const vehicleId = await createVehicle(adminAuth);
      const openRes = await request(app.getHttpServer())
        .post('/api/v1/trip-stops')
        .set('Authorization', adminAuth)
        .send({ vehicleId, startedAt: '2026-09-01T08:00:00.000Z', endedAt: '2026-09-01T09:00:00.000Z' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/trip-stops/${openRes.body.data.id}/cancel`)
        .set('Authorization', adminAuth)
        .expect(200);

      const dashboard = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/stops')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(dashboard.body.data.totalStops).toBe(0);

      const list = await request(app.getHttpServer())
        .get('/api/v1/trip-stops')
        .set('Authorization', adminAuth)
        .query({ status: 'CANCELLED' })
        .expect(200);
      expect(list.body.data.meta.total).toBe(1);
    });
  });

  // ==========================================================================
  // GET /trip-stops -- listagem paginada com filtros
  // ==========================================================================
  describe('GET /trip-stops', () => {
    it('pagina e filtra por vehicleId/type/status/periodo', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('List');
      const vehicleA = await createVehicle(adminAuth);
      const vehicleB = await createVehicle(adminAuth);

      await request(app.getHttpServer())
        .post('/api/v1/trip-stops')
        .set('Authorization', adminAuth)
        .send({ vehicleId: vehicleA, type: 'MAINTENANCE', startedAt: '2026-09-01T08:00:00.000Z', endedAt: '2026-09-01T09:00:00.000Z' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/trip-stops')
        .set('Authorization', adminAuth)
        .send({ vehicleId: vehicleB, type: 'YARD', startedAt: '2026-09-05T08:00:00.000Z', endedAt: '2026-09-05T09:00:00.000Z' })
        .expect(201);

      const byVehicle = await request(app.getHttpServer())
        .get('/api/v1/trip-stops')
        .set('Authorization', adminAuth)
        .query({ vehicleId: vehicleA })
        .expect(200);
      expect(byVehicle.body.data.meta.total).toBe(1);
      expect(byVehicle.body.data.items[0].vehicleId).toBe(vehicleA);

      const byType = await request(app.getHttpServer())
        .get('/api/v1/trip-stops')
        .set('Authorization', adminAuth)
        .query({ type: 'YARD' })
        .expect(200);
      expect(byType.body.data.meta.total).toBe(1);

      const byPeriod = await request(app.getHttpServer())
        .get('/api/v1/trip-stops')
        .set('Authorization', adminAuth)
        .query({ from: '2026-09-01', to: '2026-09-01' })
        .expect(200);
      expect(byPeriod.body.data.meta.total).toBe(1);

      const all = await request(app.getHttpServer())
        .get('/api/v1/trip-stops')
        .set('Authorization', adminAuth)
        .query({ page: 1, pageSize: 1 })
        .expect(200);
      expect(all.body.data.items).toHaveLength(1);
      expect(all.body.data.meta.total).toBe(2);
      expect(all.body.data.meta.totalPages).toBe(2);
    });
  });

  // ==========================================================================
  // Integracao com viagem (driver-app) -- nunca duplica Trip, close-by-device-event
  // ==========================================================================
  describe('integracao com viagem e fechamento offline', () => {
    it('parada aberta pelo driver-app aparece em GET /trip-stops com tripId/driverId corretos', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('TripIntegration');
      const vehicleId = await createVehicle(adminAuth);
      const { tripId, driverId, driverAuth } = await setupDriverWithTrip(adminAuth, tenantId, vehicleId);

      const openRes = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/stops`)
        .set('Authorization', driverAuth)
        .send({ deviceEventId: randomUUID(), latitude: -23.5, longitude: -46.6, startedAt: '2026-09-01T09:00:00.000Z' })
        .expect(201);

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/trip-stops')
        .set('Authorization', adminAuth)
        .query({ tripId })
        .expect(200);
      expect(listRes.body.data.meta.total).toBe(1);
      expect(listRes.body.data.items[0]).toMatchObject({
        id: openRes.body.data.id,
        tripId,
        driverId,
        source: 'DRIVER_APP',
        vehiclePlate: expect.any(String),
        driverName: 'Jose da Silva',
        tripReference: expect.stringContaining(' -> '),
      });
    });

    it('POST close-by-device-event fecha pelo deviceEventId da abertura, idempotente', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('CloseByDevice');
      const vehicleId = await createVehicle(adminAuth);
      const { tripId, driverAuth } = await setupDriverWithTrip(adminAuth, tenantId, vehicleId);
      const deviceEventId = randomUUID();

      const openRes = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/stops`)
        .set('Authorization', driverAuth)
        .send({ deviceEventId, latitude: -23.5, longitude: -46.6, startedAt: '2026-09-01T09:00:00.000Z' })
        .expect(201);

      const closeRes = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/stops/close-by-device-event`)
        .set('Authorization', driverAuth)
        .send({ deviceEventId, endedAt: '2026-09-01T09:15:00.000Z' })
        .expect(201);
      expect(closeRes.body.data.id).toBe(openRes.body.data.id);
      expect(closeRes.body.data.durationMinutes).toBe(15);

      // Reenvio (retry de fila offline apos reconexao) -- idempotente, nunca
      // recalcula/duplica.
      const secondClose = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/stops/close-by-device-event`)
        .set('Authorization', driverAuth)
        .send({ deviceEventId, endedAt: '2026-09-01T23:00:00.000Z' })
        .expect(201);
      expect(secondClose.body.data.durationMinutes).toBe(15);
    });

    it('close-by-device-event com deviceEventId desconhecido retorna 404', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('CloseByDeviceUnknown');
      const vehicleId = await createVehicle(adminAuth);
      const { tripId, driverAuth } = await setupDriverWithTrip(adminAuth, tenantId, vehicleId);

      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/stops/close-by-device-event`)
        .set('Authorization', driverAuth)
        .send({ deviceEventId: randomUUID(), endedAt: '2026-09-01T09:15:00.000Z' })
        .expect(404);
    });
  });

  // ==========================================================================
  // Isolamento multi-tenant
  // ==========================================================================
  describe('isolamento multi-tenant', () => {
    it('tenant B nunca ve, fecha ou cancela uma parada do tenant A', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolStopA');
      const vehicleId = await createVehicle(tenantA.adminAuth);
      const stopRes = await request(app.getHttpServer())
        .post('/api/v1/trip-stops')
        .set('Authorization', tenantA.adminAuth)
        .send({ vehicleId, startedAt: '2026-09-01T08:00:00.000Z' })
        .expect(201);
      const stopId = stopRes.body.data.id as string;

      const tenantB = await createTenantAndLoginAsAdmin('IsolStopB');

      await request(app.getHttpServer())
        .get(`/api/v1/trip-stops/${stopId}`)
        .set('Authorization', tenantB.adminAuth)
        .expect(404);

      await request(app.getHttpServer())
        .patch(`/api/v1/trip-stops/${stopId}/close`)
        .set('Authorization', tenantB.adminAuth)
        .send({ endedAt: '2026-09-01T09:00:00.000Z' })
        .expect(404);

      await request(app.getHttpServer())
        .patch(`/api/v1/trip-stops/${stopId}/cancel`)
        .set('Authorization', tenantB.adminAuth)
        .expect(404);

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/trip-stops')
        .set('Authorization', tenantB.adminAuth)
        .expect(200);
      expect(listRes.body.data.meta.total).toBe(0);

      // Nao pode nem abrir parada num veiculo que pertence a outro tenant.
      await request(app.getHttpServer())
        .post('/api/v1/trip-stops')
        .set('Authorization', tenantB.adminAuth)
        .send({ vehicleId, startedAt: '2026-09-01T08:00:00.000Z' })
        .expect(404);
    });
  });

  // ==========================================================================
  // RBAC
  // ==========================================================================
  describe('RBAC', () => {
    it('leitura: SUPER_ADMIN/ADMIN/MANAGER/OPERATOR/DISPATCHER/AUDITOR ok; DRIVER bloqueado', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('RbacRead');

      for (const role of ['MANAGER', 'OPERATOR', 'DISPATCHER', 'AUDITOR']) {
        const auth = await createUserWithRole(tenantId, adminAuth, role);
        await request(app.getHttpServer()).get('/api/v1/trip-stops').set('Authorization', auth).expect(200);
      }

      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      await request(app.getHttpServer()).get('/api/v1/trip-stops').set('Authorization', driverAuth).expect(403);
    });

    it('escrita: AUDITOR bloqueado (403); MANAGER/OPERATOR/DISPATCHER podem criar/fechar/cancelar', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('RbacWrite');
      const vehicleId = await createVehicle(adminAuth);

      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');
      await request(app.getHttpServer())
        .post('/api/v1/trip-stops')
        .set('Authorization', auditorAuth)
        .send({ vehicleId, startedAt: '2026-09-01T08:00:00.000Z' })
        .expect(403);

      for (const role of ['MANAGER', 'OPERATOR', 'DISPATCHER']) {
        const auth = await createUserWithRole(tenantId, adminAuth, role);
        const roleVehicle = await createVehicle(adminAuth);
        const createRes = await request(app.getHttpServer())
          .post('/api/v1/trip-stops')
          .set('Authorization', auth)
          .send({ vehicleId: roleVehicle, startedAt: '2026-09-01T08:00:00.000Z' })
          .expect(201);
        await request(app.getHttpServer())
          .patch(`/api/v1/trip-stops/${createRes.body.data.id}/close`)
          .set('Authorization', auth)
          .send({ endedAt: '2026-09-01T08:30:00.000Z' })
          .expect(200);
        await request(app.getHttpServer())
          .patch(`/api/v1/trip-stops/${createRes.body.data.id}/cancel`)
          .set('Authorization', auth)
          .expect(200);
      }
    });
  });

  // ==========================================================================
  // Verificacao real de ausencia de N+1 -- GET /fleet-operations/stops com
  // 10/25/50/100 veiculos, cada um com uma parada fechada (seed via POST
  // /trip-stops, sem precisar de viagem/motorista/composicao -- o caminho
  // mais leve para gerar volume). Mesmo mecanismo de contagem via $extends
  // ja usado em fleet-operations-fuel.e2e-spec.ts (Fase 42).
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
        slug: `tstops-n1-${label.toLowerCase()}-${unique}`,
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

    async function seedVehicleWithStop(adminAuth: string) {
      const vehicleRes = await request(countingApp.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', adminAuth)
        .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
        .expect(201);
      const vehicleId = vehicleRes.body.data.id as string;

      await request(countingApp.getHttpServer())
        .post('/api/v1/trip-stops')
        .set('Authorization', adminAuth)
        .send({
          vehicleId,
          type: 'YARD',
          startedAt: '2026-09-01T08:00:00.000Z',
          endedAt: '2026-09-01T09:00:00.000Z',
        })
        .expect(201);
    }

    it('a contagem de queries de GET /fleet-operations/stops nao cresce entre 10, 25, 50 e 100 veiculos', async () => {
      const { adminAuth } = await createTenantAndLoginOnCountingApp('N1Stops');
      const checkpoints = [10, 25, 50, 100];
      const queriesByCheckpoint: number[] = [];
      let seeded = 0;

      for (const checkpoint of checkpoints) {
        while (seeded < checkpoint) {
          await seedVehicleWithStop(adminAuth);
          seeded += 1;
        }
        queryCount = 0;
        await request(countingApp.getHttpServer())
          .get('/api/v1/fleet-operations/stops')
          .set('Authorization', adminAuth)
          .expect(200);
        queriesByCheckpoint.push(queryCount);
      }

      const [queriesFor10, , , queriesFor100] = queriesByCheckpoint;
      expect(queriesFor10).toBeGreaterThan(0);
      // O(1): a contagem de queries do ENDPOINT em si nao pode crescer com o
      // nº de veiculos -- nunca 1 query por veiculo. Tolerancia de +/-1 pela
      // mesma razao documentada em fleet-operations-fuel.e2e-spec.ts.
      expect(queriesFor100).toBeLessThanOrEqual(queriesFor10 + 1);
    }, 180000);

    // GET /trip-stops (listagem administrativa) resolve placa/motorista/
    // viagem em lote (3 queries a mais, ver TripStopsService.findAllPaginated)
    // -- bounded pelo TAMANHO DA PAGINA (pageSize fixo aqui), nunca pelo
    // total de veiculos/paradas da tabela.
    it('a contagem de queries de GET /trip-stops (pageSize fixo) nao cresce entre 10, 25, 50 e 100 veiculos', async () => {
      const { adminAuth } = await createTenantAndLoginOnCountingApp('N1StopsList');
      const checkpoints = [10, 25, 50, 100];
      const queriesByCheckpoint: number[] = [];
      let seeded = 0;

      for (const checkpoint of checkpoints) {
        while (seeded < checkpoint) {
          await seedVehicleWithStop(adminAuth);
          seeded += 1;
        }
        queryCount = 0;
        await request(countingApp.getHttpServer())
          .get('/api/v1/trip-stops')
          .set('Authorization', adminAuth)
          .query({ pageSize: 20 })
          .expect(200);
        queriesByCheckpoint.push(queryCount);
      }

      const [queriesFor10, , , queriesFor100] = queriesByCheckpoint;
      expect(queriesFor10).toBeGreaterThan(0);
      expect(queriesFor100).toBeLessThanOrEqual(queriesFor10 + 1);
    }, 180000);
  });
});
