import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 88 -- multiplas paradas/entregas planejadas por viagem
// (TripDeliveryStop, sub-recurso de Trip, distinto de TripStop
// operacional). Cobre criacao/ordenacao automatica, reordenacao explicita,
// edicao/remocao (com renumeracao), status operacional da parada, regras de
// imutabilidade por status da viagem, isolamento multi-tenant, RBAC e
// ausencia de N+1 na listagem -- com requests reais contra o Postgres.
describe('Trip Delivery Stops -- paradas/entregas planejadas (e2e)', () => {
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
      slug: `tdstops-${label.toLowerCase()}-${unique}`,
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

  async function createCustomer(auth: string, name: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', auth)
      .send({ name })
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
    return { tripId: tripRes.body.data.id as string, vehicleId, driverId };
  }

  async function startTrip(auth: string, tripId: string) {
    await request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}/status`)
      .set('Authorization', auth)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
  }

  // ==========================================================================
  // POST /trips/:id/delivery-stops -- criacao e sequencia automatica
  // ==========================================================================
  describe('POST /trips/:id/delivery-stops', () => {
    it('cria multiplas paradas com sequence automatica em ordem de criacao', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Create');
      const { tripId } = await setupPlannedTrip(adminAuth);
      const locationA = await createLocation(adminAuth, `Cliente A ${randomUUID()}`);
      const locationB = await createLocation(adminAuth, `Cliente B ${randomUUID()}`);
      const customerId = await createCustomer(adminAuth, `Industria ${randomUUID()}`);

      const first = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/delivery-stops`)
        .set('Authorization', adminAuth)
        .send({ locationId: locationA, customerId, plannedArrival: '2026-09-01T12:00:00.000Z', notes: 'Descarregar na doca 2' })
        .expect(201);
      expect(first.body.data).toMatchObject({
        tripId,
        sequence: 1,
        customerId,
        locationId: locationA,
        status: 'PENDING',
        notes: 'Descarregar na doca 2',
      });
      expect(first.body.data.customerName).toEqual(expect.any(String));
      expect(first.body.data.locationName).toEqual(expect.any(String));

      const second = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/delivery-stops`)
        .set('Authorization', adminAuth)
        .send({ locationId: locationB })
        .expect(201);
      expect(second.body.data.sequence).toBe(2);
      expect(second.body.data.customerId).toBeNull();

      const list = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/delivery-stops`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(list.body.data.map((s: { sequence: number }) => s.sequence)).toEqual([1, 2]);
    });

    it('rejeita local/cliente inexistentes nesta empresa com 404', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CreateMissing');
      const { tripId } = await setupPlannedTrip(adminAuth);

      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/delivery-stops`)
        .set('Authorization', adminAuth)
        .send({ locationId: randomUUID() })
        .expect(404);

      const locationId = await createLocation(adminAuth, `Local ${randomUUID()}`);
      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/delivery-stops`)
        .set('Authorization', adminAuth)
        .send({ locationId, customerId: randomUUID() })
        .expect(404);
    });

    it('bloqueia criar/editar/remover/reordenar depois que a viagem partiu (409)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Locked');
      const { tripId } = await setupPlannedTrip(adminAuth);
      const locationId = await createLocation(adminAuth, `Local ${randomUUID()}`);
      const stopRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/delivery-stops`)
        .set('Authorization', adminAuth)
        .send({ locationId })
        .expect(201);
      const stopId = stopRes.body.data.id as string;

      await startTrip(adminAuth, tripId);

      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/delivery-stops`)
        .set('Authorization', adminAuth)
        .send({ locationId })
        .expect(409);
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/delivery-stops/${stopId}`)
        .set('Authorization', adminAuth)
        .send({ notes: 'tentativa apos partida' })
        .expect(409);
      await request(app.getHttpServer())
        .put(`/api/v1/trips/${tripId}/delivery-stops/reorder`)
        .set('Authorization', adminAuth)
        .send({ items: [{ id: stopId, sequence: 1 }] })
        .expect(409);
      await request(app.getHttpServer())
        .delete(`/api/v1/trips/${tripId}/delivery-stops/${stopId}`)
        .set('Authorization', adminAuth)
        .expect(409);

      // Status operacional continua editavel com a viagem em andamento --
      // trava e so sobre O QUE sera entregue (planejamento), nao sobre o
      // progresso da entrega em si.
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/delivery-stops/${stopId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
    });
  });

  // ==========================================================================
  // PUT /trips/:id/delivery-stops/reorder
  // ==========================================================================
  describe('PUT /trips/:id/delivery-stops/reorder', () => {
    async function createThreeStops(adminAuth: string, tripId: string) {
      const ids: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        const locationId = await createLocation(adminAuth, `Local ${i} ${randomUUID()}`);
        const res = await request(app.getHttpServer())
          .post(`/api/v1/trips/${tripId}/delivery-stops`)
          .set('Authorization', adminAuth)
          .send({ locationId })
          .expect(201);
        ids.push(res.body.data.id);
      }
      return ids;
    }

    it('inverte a ordem das paradas com sucesso', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Reorder');
      const { tripId } = await setupPlannedTrip(adminAuth);
      const [a, b, c] = await createThreeStops(adminAuth, tripId);

      const res = await request(app.getHttpServer())
        .put(`/api/v1/trips/${tripId}/delivery-stops/reorder`)
        .set('Authorization', adminAuth)
        .send({
          items: [
            { id: a, sequence: 3 },
            { id: b, sequence: 2 },
            { id: c, sequence: 1 },
          ],
        })
        .expect(200);

      expect(res.body.data.map((s: { id: string; sequence: number }) => [s.id, s.sequence])).toEqual([
        [c, 1],
        [b, 2],
        [a, 3],
      ]);
    });

    it('rejeita quando items nao cobre exatamente as paradas atuais (400)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ReorderSubset');
      const { tripId } = await setupPlannedTrip(adminAuth);
      const [a, b] = await createThreeStops(adminAuth, tripId);

      await request(app.getHttpServer())
        .put(`/api/v1/trips/${tripId}/delivery-stops/reorder`)
        .set('Authorization', adminAuth)
        .send({ items: [{ id: a, sequence: 1 }, { id: b, sequence: 2 }] })
        .expect(400);

      await request(app.getHttpServer())
        .put(`/api/v1/trips/${tripId}/delivery-stops/reorder`)
        .set('Authorization', adminAuth)
        .send({ items: [{ id: a, sequence: 1 }, { id: randomUUID(), sequence: 2 }] })
        .expect(400);
    });

    it('rejeita sequence duplicada ou com lacunas (400)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ReorderDup');
      const { tripId } = await setupPlannedTrip(adminAuth);
      const [a, b, c] = await createThreeStops(adminAuth, tripId);

      await request(app.getHttpServer())
        .put(`/api/v1/trips/${tripId}/delivery-stops/reorder`)
        .set('Authorization', adminAuth)
        .send({
          items: [
            { id: a, sequence: 1 },
            { id: b, sequence: 1 },
            { id: c, sequence: 3 },
          ],
        })
        .expect(400);

      await request(app.getHttpServer())
        .put(`/api/v1/trips/${tripId}/delivery-stops/reorder`)
        .set('Authorization', adminAuth)
        .send({
          items: [
            { id: a, sequence: 1 },
            { id: b, sequence: 2 },
            { id: c, sequence: 5 },
          ],
        })
        .expect(400);
    });
  });

  // ==========================================================================
  // DELETE -- remove e fecha a lacuna de sequencia
  // ==========================================================================
  describe('DELETE /trips/:id/delivery-stops/:stopId', () => {
    it('remove a parada do meio e renumera as remanescentes para 1..N', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Delete');
      const { tripId } = await setupPlannedTrip(adminAuth);
      const ids: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        const locationId = await createLocation(adminAuth, `Local ${i} ${randomUUID()}`);
        const res = await request(app.getHttpServer())
          .post(`/api/v1/trips/${tripId}/delivery-stops`)
          .set('Authorization', adminAuth)
          .send({ locationId })
          .expect(201);
        ids.push(res.body.data.id);
      }

      await request(app.getHttpServer())
        .delete(`/api/v1/trips/${tripId}/delivery-stops/${ids[1]}`)
        .set('Authorization', adminAuth)
        .expect(204);

      const list = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/delivery-stops`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(list.body.data).toHaveLength(2);
      expect(list.body.data.map((s: { id: string; sequence: number }) => [s.id, s.sequence])).toEqual([
        [ids[0], 1],
        [ids[2], 2],
      ]);
    });
  });

  // ==========================================================================
  // PATCH /:stopId/status -- maquina de estados da parada
  // ==========================================================================
  describe('PATCH /trips/:id/delivery-stops/:stopId/status', () => {
    it('avanca PENDING -> IN_PROGRESS -> COMPLETED; e idempotente no mesmo status; grava execucao real (actualArrival/deliveredAt)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('StatusFlow');
      const { tripId } = await setupPlannedTrip(adminAuth);
      const locationId = await createLocation(adminAuth, `Local ${randomUUID()}`);
      const stopRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/delivery-stops`)
        .set('Authorization', adminAuth)
        .send({ locationId })
        .expect(201);
      const stopId = stopRes.body.data.id as string;
      expect(stopRes.body.data.actualArrival).toBeNull();
      expect(stopRes.body.data.deliveredAt).toBeNull();

      const toInProgress = await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/delivery-stops/${stopId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      expect(toInProgress.body.data.status).toBe('IN_PROGRESS');
      expect(toInProgress.body.data.actualArrival).toEqual(expect.any(String));
      expect(toInProgress.body.data.deliveredAt).toBeNull();
      const firstActualArrival = toInProgress.body.data.actualArrival as string;

      const idempotent = await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/delivery-stops/${stopId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      expect(idempotent.body.data.status).toBe('IN_PROGRESS');
      // Idempotente: actualArrival preserva o PRIMEIRO instante real, nunca
      // e sobrescrito por uma reentrada no mesmo status.
      expect(idempotent.body.data.actualArrival).toBe(firstActualArrival);

      const toCompleted = await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/delivery-stops/${stopId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'COMPLETED' })
        .expect(200);
      expect(toCompleted.body.data.status).toBe('COMPLETED');
      expect(toCompleted.body.data.deliveredAt).toEqual(expect.any(String));
      expect(toCompleted.body.data.actualArrival).toBe(firstActualArrival);

      // COMPLETED e terminal -- nunca volta.
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/delivery-stops/${stopId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'PENDING' })
        .expect(409);
    });

    it('FAILED (Fase 99) exige "reason", e alcancavel de PENDING e de IN_PROGRESS, e e terminal', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('StatusFailed');
      const { tripId } = await setupPlannedTrip(adminAuth);
      const locationA = await createLocation(adminAuth, `Local A ${randomUUID()}`);
      const locationB = await createLocation(adminAuth, `Local B ${randomUUID()}`);

      const stopA = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/delivery-stops`)
        .set('Authorization', adminAuth)
        .send({ locationId: locationA })
        .expect(201);
      const stopAId = stopA.body.data.id as string;

      // Sem reason -- 400.
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/delivery-stops/${stopAId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'FAILED' })
        .expect(400);

      // PENDING -> FAILED direto (problema identificado antes de qualquer tentativa).
      const failedFromPending = await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/delivery-stops/${stopAId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'FAILED', reason: 'Endereço não localizado' })
        .expect(200);
      expect(failedFromPending.body.data.status).toBe('FAILED');
      expect(failedFromPending.body.data.failureReason).toBe('Endereço não localizado');

      // FAILED e terminal -- nunca volta.
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/delivery-stops/${stopAId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'PENDING' })
        .expect(409);

      // IN_PROGRESS -> FAILED (tentativa mal sucedida no local).
      const stopB = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/delivery-stops`)
        .set('Authorization', adminAuth)
        .send({ locationId: locationB })
        .expect(201);
      const stopBId = stopB.body.data.id as string;
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/delivery-stops/${stopBId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      const failedFromInProgress = await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/delivery-stops/${stopBId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'FAILED', reason: 'Destinatário ausente' })
        .expect(200);
      expect(failedFromInProgress.body.data.status).toBe('FAILED');
      expect(failedFromInProgress.body.data.failureReason).toBe('Destinatário ausente');
    });
  });

  // ==========================================================================
  // Isolamento multi-tenant
  // ==========================================================================
  describe('isolamento multi-tenant', () => {
    it('tenant B nunca ve, edita ou remove uma parada do tenant A', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolA');
      const { tripId } = await setupPlannedTrip(tenantA.adminAuth);
      const locationId = await createLocation(tenantA.adminAuth, `Local ${randomUUID()}`);
      const stopRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/delivery-stops`)
        .set('Authorization', tenantA.adminAuth)
        .send({ locationId })
        .expect(201);
      const stopId = stopRes.body.data.id as string;

      const tenantB = await createTenantAndLoginAsAdmin('IsolB');

      await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/delivery-stops`)
        .set('Authorization', tenantB.adminAuth)
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/delivery-stops/${stopId}`)
        .set('Authorization', tenantB.adminAuth)
        .send({ notes: 'invasao' })
        .expect(404);
      await request(app.getHttpServer())
        .delete(`/api/v1/trips/${tripId}/delivery-stops/${stopId}`)
        .set('Authorization', tenantB.adminAuth)
        .expect(404);

      // Nem cria parada numa viagem de outro tenant, mesmo com um local seu.
      const locationB = await createLocation(tenantB.adminAuth, `Local B ${randomUUID()}`);
      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/delivery-stops`)
        .set('Authorization', tenantB.adminAuth)
        .send({ locationId: locationB })
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

      for (const role of ['MANAGER', 'OPERATOR', 'DISPATCHER', 'AUDITOR']) {
        const auth = await createUserWithRole(tenantId, adminAuth, role);
        await request(app.getHttpServer())
          .get(`/api/v1/trips/${tripId}/delivery-stops`)
          .set('Authorization', auth)
          .expect(200);
      }

      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/delivery-stops`)
        .set('Authorization', driverAuth)
        .expect(403);
    });

    it('escrita: AUDITOR bloqueado (403); DISPATCHER pode criar/editar/remover', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('RbacWrite');
      const { tripId } = await setupPlannedTrip(adminAuth);
      const locationId = await createLocation(adminAuth, `Local ${randomUUID()}`);

      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');
      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/delivery-stops`)
        .set('Authorization', auditorAuth)
        .send({ locationId })
        .expect(403);

      const dispatcherAuth = await createUserWithRole(tenantId, adminAuth, 'DISPATCHER');
      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/delivery-stops`)
        .set('Authorization', dispatcherAuth)
        .send({ locationId })
        .expect(201);
      const stopId = createRes.body.data.id as string;

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/delivery-stops/${stopId}`)
        .set('Authorization', dispatcherAuth)
        .send({ notes: 'ajustado' })
        .expect(200);
      await request(app.getHttpServer())
        .delete(`/api/v1/trips/${tripId}/delivery-stops/${stopId}`)
        .set('Authorization', dispatcherAuth)
        .expect(204);
    });
  });

  // ==========================================================================
  // GET /delivery-stops -- visao CROSS-TRIP (Fase 99, Gestao de Entregas)
  // ==========================================================================
  describe('GET /delivery-stops (cross-trip)', () => {
    async function setupTwoTripsWithStops(adminAuth: string) {
      const customerA = await createCustomer(adminAuth, `Industria A ${randomUUID()}`);
      const customerB = await createCustomer(adminAuth, `Industria B ${randomUUID()}`);
      const { tripId: tripA } = await setupPlannedTrip(adminAuth);
      const { tripId: tripB } = await setupPlannedTrip(adminAuth);

      const locationA = await createLocation(adminAuth, `Local A ${randomUUID()}`);
      const locationB = await createLocation(adminAuth, `Local B ${randomUUID()}`);

      const stopA = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripA}/delivery-stops`)
        .set('Authorization', adminAuth)
        .send({ locationId: locationA, customerId: customerA, plannedArrival: '2020-01-01T00:00:00.000Z' })
        .expect(201);
      const stopB = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripB}/delivery-stops`)
        .set('Authorization', adminAuth)
        .send({ locationId: locationB, customerId: customerB, plannedArrival: '2099-01-01T00:00:00.000Z' })
        .expect(201);

      return {
        tripA,
        tripB,
        customerA,
        customerB,
        stopAId: stopA.body.data.id as string,
        stopBId: stopB.body.data.id as string,
      };
    }

    it('lista entregas de TODAS as viagens do tenant, com contexto da viagem (origem/destino/motorista)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CrossTripList');
      const { tripA, stopAId } = await setupTwoTripsWithStops(adminAuth);

      const res = await request(app.getHttpServer())
        .get('/api/v1/delivery-stops')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.meta.total).toBe(2);

      const item = res.body.data.items.find((i: { id: string }) => i.id === stopAId);
      expect(item).toMatchObject({ tripId: tripA, status: 'PENDING' });
      expect(item.tripOriginName).toEqual(expect.any(String));
      expect(item.tripDestinationName).toEqual(expect.any(String));
    });

    it('filtra por customerId, tripId e status', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CrossTripFilters');
      const { tripA, customerA, stopAId } = await setupTwoTripsWithStops(adminAuth);

      const byCustomer = await request(app.getHttpServer())
        .get('/api/v1/delivery-stops')
        .query({ customerId: customerA })
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byCustomer.body.data.items).toHaveLength(1);
      expect(byCustomer.body.data.items[0].id).toBe(stopAId);

      const byTrip = await request(app.getHttpServer())
        .get('/api/v1/delivery-stops')
        .query({ tripId: tripA })
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byTrip.body.data.items).toHaveLength(1);
      expect(byTrip.body.data.items[0].id).toBe(stopAId);

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripA}/delivery-stops/${stopAId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      const byStatus = await request(app.getHttpServer())
        .get('/api/v1/delivery-stops')
        .query({ status: 'IN_PROGRESS' })
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byStatus.body.data.items).toHaveLength(1);
      expect(byStatus.body.data.items[0].id).toBe(stopAId);
    });

    it('busca por nome de cliente/local, filtra por periodo (plannedFrom/plannedTo) e por atrasada (late)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CrossTripSearch');
      const { customerA, stopAId } = await setupTwoTripsWithStops(adminAuth);
      const customerRes = await request(app.getHttpServer())
        .get(`/api/v1/customers/${customerA}`)
        .set('Authorization', adminAuth)
        .expect(200);
      const customerName = customerRes.body.data.name as string;

      const bySearch = await request(app.getHttpServer())
        .get('/api/v1/delivery-stops')
        .query({ search: customerName })
        .set('Authorization', adminAuth)
        .expect(200);
      expect(bySearch.body.data.items).toHaveLength(1);
      expect(bySearch.body.data.items[0].id).toBe(stopAId);

      // stopA tem plannedArrival em 2020 (passado) -- unica dentro do periodo/atrasada.
      const byPeriod = await request(app.getHttpServer())
        .get('/api/v1/delivery-stops')
        .query({ plannedFrom: '2019-01-01', plannedTo: '2021-01-01' })
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byPeriod.body.data.items).toHaveLength(1);
      expect(byPeriod.body.data.items[0].id).toBe(stopAId);

      const late = await request(app.getHttpServer())
        .get('/api/v1/delivery-stops')
        .query({ late: 'true' })
        .set('Authorization', adminAuth)
        .expect(200);
      expect(late.body.data.items).toHaveLength(1);
      expect(late.body.data.items[0].id).toBe(stopAId);
    });

    it('pagina server-side', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CrossTripPagination');
      await setupTwoTripsWithStops(adminAuth);

      const page1 = await request(app.getHttpServer())
        .get('/api/v1/delivery-stops')
        .query({ page: 1, pageSize: 1 })
        .set('Authorization', adminAuth)
        .expect(200);
      expect(page1.body.data.items).toHaveLength(1);
      expect(page1.body.data.meta.total).toBe(2);
      expect(page1.body.data.meta.totalPages).toBe(2);
    });

    it('isolamento multi-tenant: tenant B nunca ve entregas do tenant A na listagem cross-trip', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('CrossTripIsolA');
      await setupTwoTripsWithStops(tenantA.adminAuth);
      const tenantB = await createTenantAndLoginAsAdmin('CrossTripIsolB');

      const res = await request(app.getHttpServer())
        .get('/api/v1/delivery-stops')
        .set('Authorization', tenantB.adminAuth)
        .expect(200);
      expect(res.body.data.items).toHaveLength(0);
    });

    it('RBAC: DRIVER bloqueado (403); AUDITOR le normalmente', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('CrossTripRbac');
      await setupTwoTripsWithStops(adminAuth);
      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');

      await request(app.getHttpServer())
        .get('/api/v1/delivery-stops')
        .set('Authorization', driverAuth)
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/v1/delivery-stops')
        .set('Authorization', auditorAuth)
        .expect(200);
    });
  });

  // ==========================================================================
  // GET /delivery-stops/dashboard -- resumo operacional (Fase 99)
  // ==========================================================================
  describe('GET /delivery-stops/dashboard', () => {
    it('conta entregas por status e quantidade atrasada', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Dashboard');
      const { tripId } = await setupPlannedTrip(adminAuth);
      const locationLate = await createLocation(adminAuth, `Local atrasado ${randomUUID()}`);
      const locationFuture = await createLocation(adminAuth, `Local futuro ${randomUUID()}`);

      const lateStop = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/delivery-stops`)
        .set('Authorization', adminAuth)
        .send({ locationId: locationLate, plannedArrival: '2020-01-01T00:00:00.000Z' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/delivery-stops`)
        .set('Authorization', adminAuth)
        .send({ locationId: locationFuture, plannedArrival: '2099-01-01T00:00:00.000Z' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/delivery-stops/${lateStop.body.data.id}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/delivery-stops/dashboard')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.totalCount).toBe(2);
      expect(res.body.data.pendingCount).toBe(1);
      expect(res.body.data.inProgressCount).toBe(1);
      expect(res.body.data.completedCount).toBe(0);
      expect(res.body.data.failedCount).toBe(0);
      expect(res.body.data.cancelledCount).toBe(0);
      // A parada IN_PROGRESS com plannedArrival em 2020 esta atrasada; a
      // outra (PENDING, plannedArrival em 2099) nao.
      expect(res.body.data.lateCount).toBe(1);
    });
  });

  // ==========================================================================
  // Driver App -- somente leitura (Fase 88)
  // ==========================================================================
  describe('GET /driver/trips/:id/delivery-stops', () => {
    it('motorista consegue ler as paradas planejadas da propria viagem', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('DriverRead');
      const { tripId, driverId } = await setupPlannedTrip(adminAuth);
      const locationId = await createLocation(adminAuth, `Local ${randomUUID()}`);
      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/delivery-stops`)
        .set('Authorization', adminAuth)
        .send({ locationId })
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
      const driverAuth = `Bearer ${loginRes.body.data.accessToken as string}`;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/driver/trips/${tripId}/delivery-stops`)
        .set('Authorization', driverAuth)
        .expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({ tripId, sequence: 1, locationId });
    });
  });

  // ==========================================================================
  // Ausencia de N+1 -- GET /trips/:id/delivery-stops com paradas crescentes
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
        slug: `tdstops-n1-${label.toLowerCase()}-${unique}`,
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

    it('a contagem de queries de GET /trips/:id/delivery-stops nao cresce com o numero de paradas', async () => {
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
          .get(`/api/v1/trips/${tripId}/delivery-stops`)
          .set('Authorization', adminAuth)
          .expect(200);
        queriesByCheckpoint.push(queryCount);
      }

      const [queriesFor5, , queriesFor30] = queriesByCheckpoint;
      expect(queriesFor5).toBeGreaterThan(0);
      // O(1): a contagem de queries do GET em si nao pode crescer com o
      // numero de paradas -- sempre a mesma consulta com JOIN (customer +
      // location), nunca 1 query adicional por parada.
      expect(queriesFor30).toBeLessThanOrEqual(queriesFor5 + 1);
    }, 180000);

    it('a contagem de queries de GET /delivery-stops (cross-trip) nao cresce com o numero de viagens/entregas', async () => {
      const { adminAuth } = await createTenantAndLoginOnCountingApp('N1CrossTrip');

      async function seedTripWithStop(): Promise<void> {
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
        const stopLocationRes = await request(countingApp.getHttpServer())
          .post('/api/v1/locations')
          .set('Authorization', adminAuth)
          .send({ name: `Parada ${randomUUID()}`, type: 'CUSTOMER_SITE' })
          .expect(201);
        await request(countingApp.getHttpServer())
          .post(`/api/v1/trips/${tripRes.body.data.id}/delivery-stops`)
          .set('Authorization', adminAuth)
          .send({ locationId: stopLocationRes.body.data.id })
          .expect(201);
      }

      const checkpoints = [5, 15, 30];
      const queriesByCheckpoint: number[] = [];
      let seeded = 0;
      for (const checkpoint of checkpoints) {
        while (seeded < checkpoint) {
          await seedTripWithStop();
          seeded += 1;
        }
        queryCount = 0;
        await request(countingApp.getHttpServer())
          .get('/api/v1/delivery-stops')
          .query({ pageSize: 100 })
          .set('Authorization', adminAuth)
          .expect(200);
        queriesByCheckpoint.push(queryCount);
      }

      const [queriesFor5, , queriesFor30] = queriesByCheckpoint;
      expect(queriesFor5).toBeGreaterThan(0);
      // O(1): 1 query com JOIN (customer/local/viagem/motorista/origem/
      // destino) + 1 count, nunca 1 query adicional por entrega/viagem.
      expect(queriesFor30).toBeLessThanOrEqual(queriesFor5 + 1);
    }, 180000);
  });
});
