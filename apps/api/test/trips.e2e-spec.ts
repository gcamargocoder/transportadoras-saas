import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Trips (e2e)', () => {
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
      slug: `trip-${label.toLowerCase()}-${unique}`,
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

  async function createVehicle(auth: string, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/vehicles')
      .set('Authorization', auth)
      .send({
        plate: randomPlate(),
        brand: 'Volvo',
        model: 'FH 540',
        type: 'TRACTOR_UNIT',
        ...overrides,
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createDriver(auth: string, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/drivers')
      .set('Authorization', auth)
      .send({
        name: 'Jose da Silva',
        cpf: randomValidCpf(),
        cnhNumber: String(Math.floor(10000000000 + Math.random() * 89999999999)),
        cnhCategory: 'AE',
        cnhExpiresAt: '2027-06-30',
        ...overrides,
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

  async function setupTripPrerequisites(auth: string) {
    const vehicleId = await createVehicle(auth);
    const driverId = await createDriver(auth);
    const compositionId = await createComposition(auth, vehicleId);
    const originId = await createLocation(auth, `Origem ${randomUUID()}`);
    const destinationId = await createLocation(auth, `Destino ${randomUUID()}`);
    return { vehicleId, driverId, compositionId, originId, destinationId };
  }

  function buildTripPayload(
    prereqs: { driverId: string; compositionId: string; originId: string; destinationId: string },
    overrides: Partial<Record<string, unknown>> = {},
  ) {
    return {
      driverId: prereqs.driverId,
      compositionId: prereqs.compositionId,
      originLocationId: prereqs.originId,
      destinationLocationId: prereqs.destinationId,
      plannedDeparture: '2026-09-01T08:00:00.000Z',
      plannedArrival: '2026-09-02T18:00:00.000Z',
      ...overrides,
    };
  }

  describe('validacoes de criacao', () => {
    it('rejeita ausencia de origem, destino, motorista, veiculo ou data de inicio com 400', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Required');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqs = await setupTripPrerequisites(auth);
      const full = buildTripPayload(prereqs);

      for (const field of [
        'originLocationId',
        'destinationLocationId',
        'driverId',
        'compositionId',
        'plannedDeparture',
      ]) {
        const payload = { ...full } as Record<string, unknown>;
        delete payload[field];
        await request(app.getHttpServer())
          .post('/api/v1/trips')
          .set('Authorization', auth)
          .send(payload)
          .expect(400);
      }
    });

    it('rejeita origem igual ao destino com 400', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('SameLocation');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqs = await setupTripPrerequisites(auth);

      await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(buildTripPayload(prereqs, { destinationLocationId: prereqs.originId }))
        .expect(400);
    });

    it('rejeita chegada prevista anterior/igual a partida prevista com 400', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('BadDates');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqs = await setupTripPrerequisites(auth);

      await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(
          buildTripPayload(prereqs, {
            plannedDeparture: '2026-09-02T18:00:00.000Z',
            plannedArrival: '2026-09-01T08:00:00.000Z',
          }),
        )
        .expect(400);
    });

    it('rejeita motorista inexistente/inativo e composicao inexistente com 404', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Missing');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqs = await setupTripPrerequisites(auth);

      await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(buildTripPayload(prereqs, { driverId: randomUUID() }))
        .expect(404);

      await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(buildTripPayload(prereqs, { compositionId: randomUUID() }))
        .expect(404);
    });

    it('rejeita composicao ja vinculada a outra viagem com 409', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('CompositionBusy');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqs = await setupTripPrerequisites(auth);

      await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(buildTripPayload(prereqs))
        .expect(201);

      const otherDriverId = await createDriver(auth);
      await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(
          buildTripPayload(
            { ...prereqs, driverId: otherDriverId },
            {
              plannedDeparture: '2026-10-01T08:00:00.000Z',
              plannedArrival: '2026-10-02T08:00:00.000Z',
            },
          ),
        )
        .expect(409);
    });

    it('rejeita motorista ou veiculo com outra viagem no mesmo periodo com 409', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Overlap');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqs = await setupTripPrerequisites(auth);

      await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(buildTripPayload(prereqs))
        .expect(201);

      // Mesmo motorista, mesmo periodo, outro veiculo -> 409 (motorista ocupado).
      const otherVehicleId = await createVehicle(auth);
      const otherCompositionId = await createComposition(auth, otherVehicleId);
      await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(buildTripPayload({ ...prereqs, compositionId: otherCompositionId }))
        .expect(409);

      // Mesmo veiculo (nova composicao), mesmo periodo, outro motorista -> 409 (veiculo ocupado).
      const otherDriverId = await createDriver(auth);
      const anotherCompositionSameVehicle = await createComposition(auth, prereqs.vehicleId);
      await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(
          buildTripPayload({
            ...prereqs,
            driverId: otherDriverId,
            compositionId: anotherCompositionSameVehicle,
          }),
        )
        .expect(409);
    });
  });

  describe('CRUD completo', () => {
    it('cria, consulta, lista, atualiza (somente PLANNED) e exclui', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Crud');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqs = await setupTripPrerequisites(auth);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(buildTripPayload(prereqs, { plannedMetrics: { distanceKm: 450, totalCost: 2500 } }))
        .expect(201);

      const trip = createRes.body.data;
      expect(trip.driverId).toBe(prereqs.driverId);
      expect(trip.compositionId).toBe(prereqs.compositionId);
      expect(trip.vehiclePlate).toBeTruthy();
      expect(trip.status).toBe('PLANNED');

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/trips/${trip.id}`)
        .set('Authorization', auth)
        .expect(200);
      expect(getRes.body.data.id).toBe(trip.id);

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/trips')
        .set('Authorization', auth)
        .expect(200);
      expect(listRes.body.data.items.find((t: { id: string }) => t.id === trip.id)).toBeTruthy();

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/trips/${trip.id}`)
        .set('Authorization', auth)
        .send({ notes: 'Carga fragil' })
        .expect(200);
      expect(updateRes.body.data.notes).toBe('Carga fragil');

      await request(app.getHttpServer())
        .delete(`/api/v1/trips/${trip.id}`)
        .set('Authorization', auth)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/trips/${trip.id}`)
        .set('Authorization', auth)
        .expect(404);
    });

    it('viagem inexistente retorna 404 em GET, PATCH e DELETE', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('TripMissing');
      const auth = `Bearer ${adminAccessToken}`;
      const missingId = randomUUID();

      await request(app.getHttpServer())
        .get(`/api/v1/trips/${missingId}`)
        .set('Authorization', auth)
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${missingId}`)
        .set('Authorization', auth)
        .send({ notes: 'x' })
        .expect(404);
      await request(app.getHttpServer())
        .delete(`/api/v1/trips/${missingId}`)
        .set('Authorization', auth)
        .expect(404);
    });
  });

  describe('maquina de status', () => {
    it('rejeita transicao de status invalida com 409', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('BadTransition');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqs = await setupTripPrerequisites(auth);
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(buildTripPayload(prereqs))
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${createRes.body.data.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'PAUSED' })
        .expect(409);
    });

    it('percorre o fluxo completo e registra data final, duracao e km final automaticamente', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('FullFlow');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqs = await setupTripPrerequisites(auth);
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(buildTripPayload(prereqs))
        .expect(201);
      const tripId = createRes.body.data.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/status`)
        .set('Authorization', auth)
        .send({ status: 'WAITING_DRIVER' })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/status`)
        .set('Authorization', auth)
        .send({ status: 'WAITING_DEPARTURE' })
        .expect(200);

      const startedRes = await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/status`)
        .set('Authorization', auth)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      expect(startedRes.body.data.actualDeparture).toBeTruthy();

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/status`)
        .set('Authorization', auth)
        .send({ status: 'PAUSED' })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/status`)
        .set('Authorization', auth)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      const completedRes = await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/status`)
        .set('Authorization', auth)
        .send({ status: 'COMPLETED', finalOdometerKm: 150000 })
        .expect(200);
      expect(completedRes.body.data.status).toBe('COMPLETED');
      expect(completedRes.body.data.actualArrival).toBeTruthy();

      const metrics = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/metrics`)
        .set('Authorization', auth)
        .expect(200);
      expect(metrics.body.data.actualDurationMin).toBeGreaterThanOrEqual(0);

      const vehicleRes = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${prereqs.vehicleId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(vehicleRes.body.data.odometerKm).toBe(150000);

      // Terminal -- nao aceita mais transicoes.
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/status`)
        .set('Authorization', auth)
        .send({ status: 'CANCELLED' })
        .expect(409);
    });

    it('cancela viagem a partir de PLANNED', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Cancel');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqs = await setupTripPrerequisites(auth);
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(buildTripPayload(prereqs))
        .expect(201);

      const cancelRes = await request(app.getHttpServer())
        .patch(`/api/v1/trips/${createRes.body.data.id}/cancel`)
        .set('Authorization', auth)
        .expect(200);
      expect(cancelRes.body.data.status).toBe('CANCELLED');
    });
  });

  describe('nao permitir iniciar viagem', () => {
    it('bloqueia inicio com motorista inativo', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('DriverInactive');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqs = await setupTripPrerequisites(auth);
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(buildTripPayload(prereqs))
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/drivers/${prereqs.driverId}/status`)
        .set('Authorization', auth)
        .send({ status: 'INACTIVE' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${createRes.body.data.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'IN_PROGRESS' })
        .expect(409);
    });

    it('bloqueia inicio com veiculo inativo', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('VehicleInactive');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqs = await setupTripPrerequisites(auth);
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(buildTripPayload(prereqs))
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${prereqs.vehicleId}/status`)
        .set('Authorization', auth)
        .send({ status: 'INACTIVE' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${createRes.body.data.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'IN_PROGRESS' })
        .expect(409);
    });

    it('bloqueia inicio com veiculo em manutencao', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('VehicleMaintenance');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqs = await setupTripPrerequisites(auth);
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(buildTripPayload(prereqs))
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${prereqs.vehicleId}/status`)
        .set('Authorization', auth)
        .send({ status: 'MAINTENANCE' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${createRes.body.data.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'IN_PROGRESS' })
        .expect(409);
    });

    it('bloqueia inicio quando motorista ou veiculo ja estao em outra viagem ativa', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('AlreadyActive');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqs = await setupTripPrerequisites(auth);

      const trip1 = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(buildTripPayload(prereqs))
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${trip1.body.data.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      // Trip2: mesmo motorista e mesmo veiculo (via uma NOVA composicao --
      // a composicao de trip1 ja esta vinculada e nao pode ser reutilizada),
      // periodo diferente (nao colide na criacao) -- mas trip1 continua
      // IN_PROGRESS, entao trip2 nao pode iniciar (motorista/veiculo ja em
      // viagem ativa agora).
      const composition2Id = await createComposition(auth, prereqs.vehicleId);
      const trip2 = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(
          buildTripPayload(
            { ...prereqs, compositionId: composition2Id },
            {
              plannedDeparture: '2026-11-01T08:00:00.000Z',
              plannedArrival: '2026-11-02T08:00:00.000Z',
            },
          ),
        )
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${trip2.body.data.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'IN_PROGRESS' })
        .expect(409);
    });
  });

  describe('viagem ativa impede exclusao de motorista/veiculo', () => {
    it('bloqueia exclusao do motorista e do veiculo enquanto a viagem nao termina', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('BlockDeletion');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqs = await setupTripPrerequisites(auth);
      await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(buildTripPayload(prereqs))
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/v1/drivers/${prereqs.driverId}`)
        .set('Authorization', auth)
        .expect(409);

      await request(app.getHttpServer())
        .delete(`/api/v1/vehicles/${prereqs.vehicleId}`)
        .set('Authorization', auth)
        .expect(409);
    });
  });

  describe('GET /trips/:id/timeline', () => {
    // Fase 67 -- timeline evoluida de "so AuditLog" para uma projecao
    // unificada (ver test/trip-timeline.e2e-spec.ts para a cobertura
    // completa de agregacao/filtros/paginacao/N+1). Este bloco cobre so o
    // caso basico (eventos de auditoria da propria viagem, origin=AUDIT) --
    // preservado aqui por ja existir desde a Fase 28.
    it('registra eventos de auditoria da viagem (origin=AUDIT) com rotulo legivel', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Timeline');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqs = await setupTripPrerequisites(auth);
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(buildTripPayload(prereqs))
        .expect(201);
      const tripId = createRes.body.data.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/status`)
        .set('Authorization', auth)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      const timelineRes = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/timeline`)
        .set('Authorization', auth)
        .expect(200);

      const auditItems = timelineRes.body.data.items.filter((i: { origin: string }) => i.origin === 'AUDIT');
      const types = auditItems.map((i: { type: string }) => i.type);
      expect(types).toEqual(
        expect.arrayContaining([
          'trip.created',
          'trip.driver_linked',
          'trip.vehicle_linked',
          'trip.started',
        ]),
      );
      const startedItem = auditItems.find((i: { type: string }) => i.type === 'trip.started');
      expect(startedItem.label).toBe('Viagem iniciada');
      expect(startedItem.occurredAt).toBeTruthy();
    });

    it('timeline de viagem inexistente retorna 404', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('TimelineMissing');
      await request(app.getHttpServer())
        .get(`/api/v1/trips/${randomUUID()}/timeline`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(404);
    });
  });

  describe('GET /trips/:id/summary', () => {
    it('retorna motorista, veiculo, origem, destino, tempo, status, distancia, pedagios e custos', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Summary');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqs = await setupTripPrerequisites(auth);
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(buildTripPayload(prereqs, { plannedMetrics: { distanceKm: 450, totalCost: 2500 } }))
        .expect(201);

      const summaryRes = await request(app.getHttpServer())
        .get(`/api/v1/trips/${createRes.body.data.id}/summary`)
        .set('Authorization', auth)
        .expect(200);

      const summary = summaryRes.body.data;
      expect(summary.driverId).toBe(prereqs.driverId);
      expect(summary.vehicleId).toBe(prereqs.vehicleId);
      expect(summary.originName).toBeTruthy();
      expect(summary.destinationName).toBeTruthy();
      expect(summary.status).toBe('PLANNED');
      expect(summary.distanceKm).toBe(450);
      expect(summary.plannedTotalCost).toBe(2500);
      expect(summary.tollTransactionsCount).toBe(0);
      expect(summary.tollTransactionsTotal).toBe(0);
    });
  });

  describe('filtros', () => {
    it('filtra por status, motorista, veiculo, origem, destino e periodo', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Filters');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqsA = await setupTripPrerequisites(auth);
      const tripA = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(
          buildTripPayload(prereqsA, {
            plannedDeparture: '2026-01-10T08:00:00.000Z',
            plannedArrival: '2026-01-11T08:00:00.000Z',
          }),
        )
        .expect(201);

      const prereqsB = await setupTripPrerequisites(auth);
      const tripB = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(
          buildTripPayload(prereqsB, {
            plannedDeparture: '2026-05-10T08:00:00.000Z',
            plannedArrival: '2026-05-11T08:00:00.000Z',
          }),
        )
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripB.body.data.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'WAITING_DRIVER' })
        .expect(200);

      const byStatus = await request(app.getHttpServer())
        .get('/api/v1/trips?status=WAITING_DRIVER')
        .set('Authorization', auth)
        .expect(200);
      expect(byStatus.body.data.items).toHaveLength(1);
      expect(byStatus.body.data.items[0].id).toBe(tripB.body.data.id);

      const byDriver = await request(app.getHttpServer())
        .get(`/api/v1/trips?driverId=${prereqsA.driverId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(byDriver.body.data.items).toHaveLength(1);
      expect(byDriver.body.data.items[0].id).toBe(tripA.body.data.id);

      const byVehicle = await request(app.getHttpServer())
        .get(`/api/v1/trips?vehicleId=${prereqsB.vehicleId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(byVehicle.body.data.items).toHaveLength(1);
      expect(byVehicle.body.data.items[0].id).toBe(tripB.body.data.id);

      const byOrigin = await request(app.getHttpServer())
        .get(`/api/v1/trips?originLocationId=${prereqsA.originId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(byOrigin.body.data.items).toHaveLength(1);

      const byDestination = await request(app.getHttpServer())
        .get(`/api/v1/trips?destinationLocationId=${prereqsB.destinationId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(byDestination.body.data.items).toHaveLength(1);

      const byPeriod = await request(app.getHttpServer())
        .get('/api/v1/trips?departureFrom=2026-01-01&departureTo=2026-02-01')
        .set('Authorization', auth)
        .expect(200);
      expect(byPeriod.body.data.items).toHaveLength(1);
      expect(byPeriod.body.data.items[0].id).toBe(tripA.body.data.id);
    });

    it('filtra por cliente', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('CustomerFilter');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqs = await setupTripPrerequisites(auth);

      const customerRes = await request(app.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', auth)
        .send({ name: 'Industria Exemplo' })
        .expect(201);
      const customerId = customerRes.body.data.id;

      const tripRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(buildTripPayload(prereqs, { customerId }))
        .expect(201);

      const byCustomer = await request(app.getHttpServer())
        .get(`/api/v1/trips?customerId=${customerId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(byCustomer.body.data.items).toHaveLength(1);
      expect(byCustomer.body.data.items[0].id).toBe(tripRes.body.data.id);
    });
  });

  describe('isolamento multi-tenant', () => {
    it('nunca permite acesso cruzado entre tenants', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolA');
      const tenantB = await createTenantAndLoginAsAdmin('IsolB');
      const authA = `Bearer ${tenantA.adminAccessToken}`;
      const authB = `Bearer ${tenantB.adminAccessToken}`;

      const prereqs = await setupTripPrerequisites(authA);
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', authA)
        .send(buildTripPayload(prereqs))
        .expect(201);
      const tripId = createRes.body.data.id;

      await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}`)
        .set('Authorization', authB)
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}`)
        .set('Authorization', authB)
        .send({ notes: 'Sequestrado' })
        .expect(404);
      await request(app.getHttpServer())
        .delete(`/api/v1/trips/${tripId}`)
        .set('Authorization', authB)
        .expect(404);

      const listInB = await request(app.getHttpServer())
        .get('/api/v1/trips')
        .set('Authorization', authB)
        .expect(200);
      expect(listInB.body.data.items.find((t: { id: string }) => t.id === tripId)).toBeUndefined();
    });
  });

  describe('permissoes por perfil', () => {
    it('AUDITOR le mas nao cria viagens (403)', async () => {
      const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('RolesAuditor');
      const auditorEmail = `auditor-trip-${randomUUID()}@teste.com`;
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          name: 'Auditor',
          email: auditorEmail,
          password: 'SenhaForte123!',
          role: 'AUDITOR',
        })
        .expect(201);

      const auditorLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId, email: auditorEmail, password: 'SenhaForte123!' })
        .expect(200);
      const auditorAuth = `Bearer ${auditorLogin.body.data.accessToken}`;

      await request(app.getHttpServer())
        .get('/api/v1/trips')
        .set('Authorization', auditorAuth)
        .expect(200);

      const prereqs = await setupTripPrerequisites(`Bearer ${adminAccessToken}`);
      await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auditorAuth)
        .send(buildTripPayload(prereqs))
        .expect(403);
    });
  });
});
