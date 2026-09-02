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

    // Fase 87 -- planejamento nunca pode assumir um veiculo indisponivel
    // (reaproveita resolveVehicleAvailability, Fase 81/86): antes desta
    // fase, so o INICIO da viagem (assertCanStart) checava o status do
    // veiculo -- o CREATE aceitava qualquer composicao livre, mesmo com o
    // veiculo INACTIVE/SUSPENDED/MAINTENANCE/SOLD.
    it('rejeita planejamento com veiculo indisponivel (status != ACTIVE) com 409', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('VehicleUnavailable');
      const auth = `Bearer ${adminAccessToken}`;

      for (const status of ['INACTIVE', 'SUSPENDED', 'MAINTENANCE', 'SOLD']) {
        const prereqs = await setupTripPrerequisites(auth);
        await request(app.getHttpServer())
          .patch(`/api/v1/vehicles/${prereqs.vehicleId}/status`)
          .set('Authorization', auth)
          .send({ status })
          .expect(200);

        await request(app.getHttpServer())
          .post('/api/v1/trips')
          .set('Authorization', auth)
          .send(buildTripPayload(prereqs))
          .expect(409);
      }
    });

    it('permite planejamento com veiculo ACTIVE normalmente (regressao do teste acima)', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('VehicleActiveOk');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqs = await setupTripPrerequisites(auth);

      await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(buildTripPayload(prereqs))
        .expect(201);
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

    // Fase 87 -- a mesma checagem de disponibilidade do veiculo (create) se
    // aplica ao trocar a composicao de uma viagem PLANNED via PATCH.
    it('rejeita trocar para uma composicao com veiculo indisponivel (409)', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('UpdateVehicleUnavailable');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqs = await setupTripPrerequisites(auth);
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(buildTripPayload(prereqs))
        .expect(201);

      const otherVehicleId = await createVehicle(auth);
      const otherCompositionId = await createComposition(auth, otherVehicleId);
      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${otherVehicleId}/status`)
        .set('Authorization', auth)
        .send({ status: 'MAINTENANCE' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${createRes.body.data.id}`)
        .set('Authorization', auth)
        .send({ compositionId: otherCompositionId })
        .expect(409);
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

  // Fase 111 -- opt-in por tenant (TenantSettings.preferences.requirePreTripChecklist,
  // default false). Fecha o gap real "bloqueio de inicio de viagem somente
  // quando houver regra operacional realmente necessaria": nenhum tenant
  // existente e afetado a menos que ative explicitamente.
  describe('checklist pre-viagem obrigatorio (Fase 111, opt-in)', () => {
    async function enableRequirePreTripChecklist(auth: string) {
      await request(app.getHttpServer())
        .patch('/api/v1/tenant-settings')
        .set('Authorization', auth)
        .send({ preferences: { requirePreTripChecklist: true } })
        .expect(200);
    }

    async function linkDriverLogin(auth: string, tenantId: string, driverId: string) {
      const unique = randomUUID().replace(/-/g, '').slice(0, 10);
      const email = `driver-${unique}@teste.com`;
      const password = 'SenhaForte123!';
      const userRes = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', auth)
        .send({ name: 'Motorista App', email, password, role: 'DRIVER' })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/drivers/${driverId}/user-link`)
        .set('Authorization', auth)
        .send({ userAccountId: userRes.body.data.id })
        .expect(200);
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId, email, password })
        .expect(200);
      return `Bearer ${loginRes.body.data.accessToken as string}`;
    }

    // 1 item BOOLEAN critical+required ("cinto_seguranca") -- suficiente
    // para exercitar hasCriticalNonConformity sem replicar o formulario
    // inteiro (mesmo template reduzido ja usado em checklists.e2e-spec.ts).
    async function createPublishedPreTripTemplate(auth: string) {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/checklists/templates')
        .set('Authorization', auth)
        .send({
          name: `Pre-Viagem ${randomUUID()}`,
          type: 'PRE_TRIP',
          sections: [
            {
              title: 'SEGURANCA',
              order: 1,
              items: [
                {
                  code: 'cinto_seguranca',
                  label: 'Cinto de seguranca OK?',
                  type: 'BOOLEAN',
                  order: 1,
                  required: true,
                  critical: true,
                },
              ],
            },
          ],
        })
        .expect(201);
      const templateId = createRes.body.data.id as string;
      await request(app.getHttpServer())
        .post(`/api/v1/checklists/templates/${templateId}/publish`)
        .set('Authorization', auth)
        .expect(200);
      return templateId;
    }

    it('desligado (default): viagem inicia normalmente mesmo sem nenhum checklist', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('ChecklistGateOff');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqs = await setupTripPrerequisites(auth);
      await createPublishedPreTripTemplate(auth);
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(buildTripPayload(prereqs))
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${createRes.body.data.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
    });

    it('ligado: bloqueia inicio quando nao ha nenhum checklist pre-viagem para a viagem', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('ChecklistGateMissing');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqs = await setupTripPrerequisites(auth);
      await createPublishedPreTripTemplate(auth);
      await enableRequirePreTripChecklist(auth);
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(buildTripPayload(prereqs))
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/trips/${createRes.body.data.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'IN_PROGRESS' })
        .expect(409);
      expect(res.body.message).toMatch(/checklist pre-viagem/i);
    });

    it('ligado: bloqueia inicio quando o checklist pre-viagem foi iniciado mas nao concluido', async () => {
      const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('ChecklistGateIncomplete');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqs = await setupTripPrerequisites(auth);
      const templateId = await createPublishedPreTripTemplate(auth);
      await enableRequirePreTripChecklist(auth);
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(buildTripPayload(prereqs))
        .expect(201);
      const tripId = createRes.body.data.id as string;

      const driverAuth = await linkDriverLogin(auth, tenantId, prereqs.driverId);
      await request(app.getHttpServer())
        .post('/api/v1/driver/checklists')
        .set('Authorization', driverAuth)
        .send({ deviceEventId: randomUUID(), templateId, tripId })
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/status`)
        .set('Authorization', auth)
        .send({ status: 'IN_PROGRESS' })
        .expect(409);
      expect(res.body.message).toMatch(/checklist pre-viagem/i);
    });

    it('ligado: bloqueia inicio quando o checklist pre-viagem concluido tem nao-conformidade critica', async () => {
      const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('ChecklistGateCritical');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqs = await setupTripPrerequisites(auth);
      const templateId = await createPublishedPreTripTemplate(auth);
      await enableRequirePreTripChecklist(auth);
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(buildTripPayload(prereqs))
        .expect(201);
      const tripId = createRes.body.data.id as string;

      const driverAuth = await linkDriverLogin(auth, tenantId, prereqs.driverId);
      const execRes = await request(app.getHttpServer())
        .post('/api/v1/driver/checklists')
        .set('Authorization', driverAuth)
        .send({ deviceEventId: randomUUID(), templateId, tripId })
        .expect(201);
      const executionId = execRes.body.data.id as string;
      const templateRes = await request(app.getHttpServer())
        .get(`/api/v1/checklists/templates/${templateId}`)
        .set('Authorization', auth)
        .expect(200);
      const cintoItemId = templateRes.body.data.sections[0].items[0].id as string;

      await request(app.getHttpServer())
        .post(`/api/v1/driver/checklists/${executionId}/answers`)
        .set('Authorization', driverAuth)
        .send({ answers: [{ itemId: cintoItemId, booleanValue: false }] })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/api/v1/driver/checklists/${executionId}/complete`)
        .set('Authorization', driverAuth)
        .expect(200);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/status`)
        .set('Authorization', auth)
        .send({ status: 'IN_PROGRESS' })
        .expect(409);
      expect(res.body.message).toMatch(/nao-conformidade critica/i);
    });

    it('ligado: permite inicio quando o checklist pre-viagem foi concluido sem nao-conformidade critica', async () => {
      const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('ChecklistGateOk');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqs = await setupTripPrerequisites(auth);
      const templateId = await createPublishedPreTripTemplate(auth);
      await enableRequirePreTripChecklist(auth);
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(buildTripPayload(prereqs))
        .expect(201);
      const tripId = createRes.body.data.id as string;

      const driverAuth = await linkDriverLogin(auth, tenantId, prereqs.driverId);
      const execRes = await request(app.getHttpServer())
        .post('/api/v1/driver/checklists')
        .set('Authorization', driverAuth)
        .send({ deviceEventId: randomUUID(), templateId, tripId })
        .expect(201);
      const executionId = execRes.body.data.id as string;
      const templateRes = await request(app.getHttpServer())
        .get(`/api/v1/checklists/templates/${templateId}`)
        .set('Authorization', auth)
        .expect(200);
      const cintoItemId = templateRes.body.data.sections[0].items[0].id as string;

      await request(app.getHttpServer())
        .post(`/api/v1/driver/checklists/${executionId}/answers`)
        .set('Authorization', driverAuth)
        .send({ answers: [{ itemId: cintoItemId, booleanValue: true }] })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/api/v1/driver/checklists/${executionId}/complete`)
        .set('Authorization', driverAuth)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/status`)
        .set('Authorization', auth)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
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

  // ==========================================================================
  // Fase 116 -- Fechamento Operacional da Viagem
  // ==========================================================================
  describe('Fase 116 -- GET /trips/:id/summary (consolidacao do encerramento)', () => {
    async function createDeliveryStop(auth: string, tripId: string) {
      const locationRes = await request(app.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', auth)
        .send({ name: `Cliente ${randomUUID()}`, type: 'DISTRIBUTION_CENTER' })
        .expect(201);
      const res = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/delivery-stops`)
        .set('Authorization', auth)
        .send({ locationId: locationRes.body.data.id })
        .expect(201);
      return res.body.data.id as string;
    }

    async function setDeliveryStopStatus(auth: string, tripId: string, stopId: string, status: string) {
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/delivery-stops/${stopId}/status`)
        .set('Authorization', auth)
        .send(status === 'FAILED' ? { status, reason: 'Cliente fechado' } : { status })
        .expect(200);
    }

    async function createOccurrence(auth: string, tripId: string, severity: string) {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/occurrences`)
        .set('Authorization', auth)
        .send({ type: 'OTHER', severity, description: `Ocorrencia ${severity}`, occurredAt: '2026-09-01T10:00:00.000Z' })
        .expect(201);
      return res.body.data.id as string;
    }

    it('deliverySummary/openOccurrencesCount refletem o estado real das entregas/ocorrencias, inclusive apos concluir a viagem', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Close01');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqs = await setupTripPrerequisites(auth);
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(buildTripPayload(prereqs))
        .expect(201);
      const tripId = createRes.body.data.id as string;

      const pendingStop = await createDeliveryStop(auth, tripId);
      const completedStop = await createDeliveryStop(auth, tripId);
      const failedStop = await createDeliveryStop(auth, tripId);
      void pendingStop;

      const criticalOccurrence = await createOccurrence(auth, tripId, 'CRITICAL');
      const resolvedOccurrence = await createOccurrence(auth, tripId, 'LOW');
      void criticalOccurrence;
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/occurrences/${resolvedOccurrence}/resolve`)
        .set('Authorization', auth)
        .expect(200);

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
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/status`)
        .set('Authorization', auth)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      await setDeliveryStopStatus(auth, tripId, completedStop, 'COMPLETED');
      await setDeliveryStopStatus(auth, tripId, failedStop, 'FAILED');

      const activeSummary = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/summary`)
        .set('Authorization', auth)
        .expect(200);
      expect(activeSummary.body.data.deliverySummary).toEqual({
        totalCount: 3,
        pendingCount: 1,
        inProgressCount: 0,
        completedCount: 1,
        failedCount: 1,
        cancelledCount: 0,
      });
      expect(activeSummary.body.data.openOccurrencesCount).toBe(1);
      expect(activeSummary.body.data.criticalOpenOccurrencesCount).toBe(1);

      // A consolidacao do fechamento continua correta depois de concluir a
      // viagem -- nunca omitida so porque a viagem terminou.
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/status`)
        .set('Authorization', auth)
        .send({ status: 'COMPLETED', finalOdometerKm: 1000 })
        .expect(200);

      const closedSummary = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/summary`)
        .set('Authorization', auth)
        .expect(200);
      expect(closedSummary.body.data.deliverySummary.pendingCount).toBe(1);
      expect(closedSummary.body.data.deliverySummary.completedCount).toBe(1);
      expect(closedSummary.body.data.deliverySummary.failedCount).toBe(1);
      expect(closedSummary.body.data.openOccurrencesCount).toBe(1);
      expect(closedSummary.body.data.criticalOpenOccurrencesCount).toBe(1);
    });

    it('viagem sem entregas/ocorrencias: contagens zeradas, nunca omitidas', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Close02');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqs = await setupTripPrerequisites(auth);
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(buildTripPayload(prereqs))
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/trips/${createRes.body.data.id}/summary`)
        .set('Authorization', auth)
        .expect(200);
      expect(res.body.data.deliverySummary).toEqual({
        totalCount: 0,
        pendingCount: 0,
        inProgressCount: 0,
        completedCount: 0,
        failedCount: 0,
        cancelledCount: 0,
      });
      expect(res.body.data.openOccurrencesCount).toBe(0);
      expect(res.body.data.criticalOpenOccurrencesCount).toBe(0);
    });

    // Bug real encontrado na auditoria da Fase 116: readyToStart/notReadyReason
    // (Fase 112) chamava assertCanStart INCONDICIONALMENTE, mesmo para uma
    // viagem que ja partiu -- podendo mostrar um motivo de bloqueio enganoso
    // (o motorista foi despachado para OUTRA viagem depois desta ja ter
    // partido). Corrigido: so avaliado enquanto a viagem ainda nao partiu.
    it('readyToStart continua true (sem motivo enganoso) para uma viagem ja partida/concluida, mesmo com o motorista ocupado em outra viagem depois', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Close03');
      const auth = `Bearer ${adminAccessToken}`;
      const driverRes = await request(app.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', auth)
        .send({
          name: 'Motorista Compartilhado',
          cpf: randomValidCpf(),
          cnhNumber: String(Math.floor(10000000000 + Math.random() * 89999999999)),
          cnhCategory: 'AE',
          cnhExpiresAt: '2027-06-30',
        })
        .expect(201);
      const driverId = driverRes.body.data.id as string;

      const vehicleAId = await createVehicle(auth);
      const compositionAId = await createComposition(auth, vehicleAId);
      const originId = await createLocation(auth, `Origem ${randomUUID()}`);
      const destinationId = await createLocation(auth, `Destino ${randomUUID()}`);

      const tripARes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(
          buildTripPayload(
            { driverId, compositionId: compositionAId, originId, destinationId },
            { plannedDeparture: '2026-09-01T08:00:00.000Z', plannedArrival: '2026-09-02T08:00:00.000Z' },
          ),
        )
        .expect(201);
      const tripAId = tripARes.body.data.id as string;

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripAId}/status`)
        .set('Authorization', auth)
        .send({ status: 'WAITING_DRIVER' })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripAId}/status`)
        .set('Authorization', auth)
        .send({ status: 'WAITING_DEPARTURE' })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripAId}/status`)
        .set('Authorization', auth)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripAId}/status`)
        .set('Authorization', auth)
        .send({ status: 'COMPLETED', finalOdometerKm: 1000 })
        .expect(200);

      // Trip B, MESMO motorista, despachada e iniciada DEPOIS que a Trip A
      // ja tinha terminado.
      const vehicleBId = await createVehicle(auth);
      const compositionBId = await createComposition(auth, vehicleBId);
      const tripBRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(
          buildTripPayload(
            { driverId, compositionId: compositionBId, originId, destinationId },
            { plannedDeparture: '2026-09-03T08:00:00.000Z', plannedArrival: '2026-09-04T08:00:00.000Z' },
          ),
        )
        .expect(201);
      const tripBId = tripBRes.body.data.id as string;
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripBId}/status`)
        .set('Authorization', auth)
        .send({ status: 'WAITING_DRIVER' })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripBId}/status`)
        .set('Authorization', auth)
        .send({ status: 'WAITING_DEPARTURE' })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripBId}/status`)
        .set('Authorization', auth)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      // Antes da correcao: assertCanStart(tripA) encontraria o motorista
      // "ja em outra viagem ativa" (a Trip B) e mostraria isso como motivo
      // de bloqueio na Trip A, ja CONCLUIDA. Depois da correcao: a Trip A ja
      // partiu, entao assertCanStart nem e chamado -- readyToStart=true.
      const summaryA = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripAId}/summary`)
        .set('Authorization', auth)
        .expect(200);
      expect(summaryA.body.data.readyToStart).toBe(true);
      expect(summaryA.body.data.notReadyReason).toBeNull();
    });
  });

  describe('Fase 116 -- PATCH /trips/:id/metrics (previstos) preserva a baseline apos a partida', () => {
    it('permite editar metricas previstas enquanto a viagem ainda nao partiu', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('MetricsGuard01');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqs = await setupTripPrerequisites(auth);
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(buildTripPayload(prereqs))
        .expect(201);
      const tripId = createRes.body.data.id as string;

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/metrics`)
        .set('Authorization', auth)
        .send({ distanceKm: 500, totalCost: 3000 })
        .expect(200);
      expect(res.body.data.plannedDistanceKm).toBe(500);
      expect(res.body.data.plannedTotalCost).toBe(3000);
    });

    it('bloqueia (409) editar metricas previstas depois que a viagem partiu, e depois de concluida', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('MetricsGuard02');
      const auth = `Bearer ${adminAccessToken}`;
      const prereqs = await setupTripPrerequisites(auth);
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send(buildTripPayload(prereqs))
        .expect(201);
      const tripId = createRes.body.data.id as string;

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
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/status`)
        .set('Authorization', auth)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/metrics`)
        .set('Authorization', auth)
        .send({ distanceKm: 999 })
        .expect(409);

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/status`)
        .set('Authorization', auth)
        .send({ status: 'COMPLETED', finalOdometerKm: 1000 })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/metrics`)
        .set('Authorization', auth)
        .send({ distanceKm: 999 })
        .expect(409);
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

  // Fase 87 -- GET /trips (visualizacao das viagens planejadas) ja
  // reaproveitava TRIP_INCLUDE numa unica query + count em paralelo (nunca 1
  // consulta por viagem); confirma que isso continua valendo apos a checagem
  // de disponibilidade adicionada nesta fase (que so roda em create/update,
  // nunca em list).
  describe('performance / N+1', () => {
    let countingApp: INestApplication;
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
      countingApp.useGlobalPipes(
        new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
      );
      await countingApp.init();
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
        slug: `trip-n1-${label.toLowerCase()}-${unique}`,
        admin: {
          name: `Admin ${label}`,
          email: `admin-${label.toLowerCase()}-${unique}@teste.com`,
          password: 'SenhaForte123!',
        },
      };
      const createRes = await request(countingApp.getHttpServer())
        .post('/api/v1/tenants')
        .send(payload)
        .expect(201);
      const tenantId: string = createRes.body.data.id;
      createdTenantIds.push(tenantId);
      const loginRes = await request(countingApp.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId, email: payload.admin.email, password: payload.admin.password })
        .expect(200);
      return `Bearer ${loginRes.body.data.accessToken as string}`;
    }

    let seedTripCounter = 0;

    async function seedTrip(auth: string) {
      seedTripCounter += 1;
      const day = String(seedTripCounter).padStart(2, '0');
      const vehicleId = await request(countingApp.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
        .expect(201)
        .then((res) => res.body.data.id as string);
      const driverId = await request(countingApp.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', auth)
        .send({
          name: 'Motorista',
          cpf: randomValidCpf(),
          cnhNumber: String(Math.floor(10000000000 + Math.random() * 89999999999)),
          cnhCategory: 'AE',
          cnhExpiresAt: '2027-06-30',
        })
        .expect(201)
        .then((res) => res.body.data.id as string);
      const compositionId = await request(countingApp.getHttpServer())
        .post('/api/v1/trip-compositions')
        .set('Authorization', auth)
        .send({ vehicleId, trailers: [] })
        .expect(201)
        .then((res) => res.body.data.id as string);
      const originId = await request(countingApp.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', auth)
        .send({ name: `Origem ${randomUUID()}`, type: 'DISTRIBUTION_CENTER' })
        .expect(201)
        .then((res) => res.body.data.id as string);
      const destinationId = await request(countingApp.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', auth)
        .send({ name: `Destino ${randomUUID()}`, type: 'DISTRIBUTION_CENTER' })
        .expect(201)
        .then((res) => res.body.data.id as string);

      await request(countingApp.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send({
          driverId,
          compositionId,
          originLocationId: originId,
          destinationLocationId: destinationId,
          plannedDeparture: `2026-01-${day}T08:00:00.000Z`,
          plannedArrival: `2026-02-${day}T18:00:00.000Z`,
        })
        .expect(201);
    }

    it('a contagem de queries de GET /trips nao cresce entre 3 e 15 viagens planejadas', async () => {
      const auth = await createTenantAndLoginOnCountingApp('N1Check');

      for (let i = 0; i < 3; i += 1) await seedTrip(auth);
      queryCount = 0;
      await request(countingApp.getHttpServer()).get('/api/v1/trips').set('Authorization', auth).expect(200);
      const queriesFor3 = queryCount;
      expect(queriesFor3).toBeGreaterThan(0);

      for (let i = 0; i < 12; i += 1) await seedTrip(auth);
      queryCount = 0;
      await request(countingApp.getHttpServer()).get('/api/v1/trips').set('Authorization', auth).expect(200);
      const queriesFor15 = queryCount;

      expect(queriesFor15).toBeLessThanOrEqual(queriesFor3 + 2);
    }, 120000);
  });

  // ==========================================================================
  // Fase D -- vinculo EXPLICITO ida -> retorno (Trip.previousTripId) +
  // intencao de carga do planejamento (Trip.plannedLoadStatus). Nunca
  // inferido automaticamente; nunca altera Trip.loadStatus (valor REAL da
  // largada, Fase 27); nunca cria Operation/roundTrip agregado.
  // ==========================================================================
  describe('Fase D -- vinculo ida -> retorno + plannedLoadStatus', () => {
    // Mesmo padrao de trip-empty-runs.e2e-spec.ts -- unica forma real de
    // setar Trip.loadStatus e POST /driver/trips/:id/start.
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

    describe('vinculo previousTripId', () => {
      it('cria viagem SEM previousTripId: previousTripId e previousTrip vem null', async () => {
        const { adminAccessToken } = await createTenantAndLoginAsAdmin('PrevNone');
        const auth = `Bearer ${adminAccessToken}`;
        const prereqs = await setupTripPrerequisites(auth);

        const res = await request(app.getHttpServer())
          .post('/api/v1/trips')
          .set('Authorization', auth)
          .send(buildTripPayload(prereqs))
          .expect(201);

        expect(res.body.data.previousTripId).toBeNull();
        expect(res.body.data.previousTrip).toBeNull();
      });

      it('cria viagem COM previousTripId valido: aparece no create e no GET (dados minimos da ida)', async () => {
        const { adminAccessToken } = await createTenantAndLoginAsAdmin('PrevValid');
        const auth = `Bearer ${adminAccessToken}`;
        const idaPrereqs = await setupTripPrerequisites(auth);
        const idaRes = await request(app.getHttpServer())
          .post('/api/v1/trips')
          .set('Authorization', auth)
          .send(buildTripPayload(idaPrereqs, { plannedDeparture: '2026-09-01T08:00:00.000Z', plannedArrival: '2026-09-02T18:00:00.000Z' }))
          .expect(201);
        const idaId = idaRes.body.data.id as string;

        const retornoPrereqs = await setupTripPrerequisites(auth);
        const retornoRes = await request(app.getHttpServer())
          .post('/api/v1/trips')
          .set('Authorization', auth)
          .send(
            buildTripPayload(retornoPrereqs, {
              previousTripId: idaId,
              plannedDeparture: '2026-09-05T08:00:00.000Z',
              plannedArrival: '2026-09-06T18:00:00.000Z',
            }),
          )
          .expect(201);
        expect(retornoRes.body.data.previousTripId).toBe(idaId);
        expect(retornoRes.body.data.previousTrip).toMatchObject({
          id: idaId,
          status: 'PLANNED',
          plannedLoadStatus: null,
          loadStatus: null,
        });
        expect(typeof retornoRes.body.data.previousTrip.originName).toBe('string');
        expect(typeof retornoRes.body.data.previousTrip.destinationName).toBe('string');

        const getRes = await request(app.getHttpServer())
          .get(`/api/v1/trips/${retornoRes.body.data.id}`)
          .set('Authorization', auth)
          .expect(200);
        expect(getRes.body.data.previousTripId).toBe(idaId);
        expect(getRes.body.data.previousTrip.id).toBe(idaId);
      });

      it('previousTripId com FK inexistente -> 404', async () => {
        const { adminAccessToken } = await createTenantAndLoginAsAdmin('PrevMissing');
        const auth = `Bearer ${adminAccessToken}`;
        const prereqs = await setupTripPrerequisites(auth);

        await request(app.getHttpServer())
          .post('/api/v1/trips')
          .set('Authorization', auth)
          .send(buildTripPayload(prereqs, { previousTripId: randomUUID() }))
          .expect(404);
      });

      it('previousTripId de outro tenant -> 404 (isolamento multi-tenant)', async () => {
        const { adminAccessToken: tokenA } = await createTenantAndLoginAsAdmin('PrevTenantA');
        const authA = `Bearer ${tokenA}`;
        const idaPrereqsA = await setupTripPrerequisites(authA);
        const idaResA = await request(app.getHttpServer())
          .post('/api/v1/trips')
          .set('Authorization', authA)
          .send(buildTripPayload(idaPrereqsA))
          .expect(201);

        const { adminAccessToken: tokenB } = await createTenantAndLoginAsAdmin('PrevTenantB');
        const authB = `Bearer ${tokenB}`;
        const prereqsB = await setupTripPrerequisites(authB);

        await request(app.getHttpServer())
          .post('/api/v1/trips')
          .set('Authorization', authB)
          .send(buildTripPayload(prereqsB, { previousTripId: idaResA.body.data.id }))
          .expect(404);
      });

      it('PATCH apontando previousTripId para a propria viagem -> 400', async () => {
        const { adminAccessToken } = await createTenantAndLoginAsAdmin('PrevSelf');
        const auth = `Bearer ${adminAccessToken}`;
        const prereqs = await setupTripPrerequisites(auth);
        const createRes = await request(app.getHttpServer())
          .post('/api/v1/trips')
          .set('Authorization', auth)
          .send(buildTripPayload(prereqs))
          .expect(201);

        await request(app.getHttpServer())
          .patch(`/api/v1/trips/${createRes.body.data.id}`)
          .set('Authorization', auth)
          .send({ previousTripId: createRes.body.data.id })
          .expect(400);
      });

      it('PATCH vincula depois da criacao e PATCH com null remove o vinculo', async () => {
        const { adminAccessToken } = await createTenantAndLoginAsAdmin('PrevPatch');
        const auth = `Bearer ${adminAccessToken}`;
        const idaPrereqs = await setupTripPrerequisites(auth);
        const idaRes = await request(app.getHttpServer())
          .post('/api/v1/trips')
          .set('Authorization', auth)
          .send(buildTripPayload(idaPrereqs))
          .expect(201);

        const retornoPrereqs = await setupTripPrerequisites(auth);
        const retornoRes = await request(app.getHttpServer())
          .post('/api/v1/trips')
          .set('Authorization', auth)
          .send(buildTripPayload(retornoPrereqs))
          .expect(201);
        const retornoId = retornoRes.body.data.id as string;

        const linked = await request(app.getHttpServer())
          .patch(`/api/v1/trips/${retornoId}`)
          .set('Authorization', auth)
          .send({ previousTripId: idaRes.body.data.id })
          .expect(200);
        expect(linked.body.data.previousTripId).toBe(idaRes.body.data.id);

        const unlinked = await request(app.getHttpServer())
          .patch(`/api/v1/trips/${retornoId}`)
          .set('Authorization', auth)
          .send({ previousTripId: null })
          .expect(200);
        expect(unlinked.body.data.previousTripId).toBeNull();
        expect(unlinked.body.data.previousTrip).toBeNull();
      });

      // TripsService.softDelete (regra ja existente, inalterada por esta
      // fase) faz DELECAO LOGICA (deletedAt = now, prisma.trip.UPDATE) --
      // nunca um DELETE fisico de linha. Por isso `DELETE /trips/:id` na
      // API NAO aciona o `ON DELETE SET NULL` do Postgres: a linha da ida
      // continua existindo (so marcada deletedAt), entao previousTripId do
      // retorno permanece apontando para ela.
      it('excluir (delecao logica) a viagem de ida pela API NAO desfaz o vinculo -- SetNull so age em exclusao FISICA de linha', async () => {
        const { adminAccessToken } = await createTenantAndLoginAsAdmin('PrevSoftDelete');
        const auth = `Bearer ${adminAccessToken}`;
        const idaPrereqs = await setupTripPrerequisites(auth);
        const idaRes = await request(app.getHttpServer())
          .post('/api/v1/trips')
          .set('Authorization', auth)
          .send(buildTripPayload(idaPrereqs))
          .expect(201);

        const retornoPrereqs = await setupTripPrerequisites(auth);
        const retornoRes = await request(app.getHttpServer())
          .post('/api/v1/trips')
          .set('Authorization', auth)
          .send(buildTripPayload(retornoPrereqs, { previousTripId: idaRes.body.data.id }))
          .expect(201);

        // A ida esta PLANNED -> pode ser excluida (regra ja existente,
        // inalterada por esta fase) -- mas e delecao LOGICA.
        await request(app.getHttpServer())
          .delete(`/api/v1/trips/${idaRes.body.data.id}`)
          .set('Authorization', auth)
          .expect(204);

        const after = await request(app.getHttpServer())
          .get(`/api/v1/trips/${retornoRes.body.data.id}`)
          .set('Authorization', auth)
          .expect(200);
        expect(after.body.data.previousTripId).toBe(idaRes.body.data.id);
        expect(after.body.data.status).toBe('PLANNED');
        // A propria ida deixa de ser acessivel (deletedAt preenchido) --
        // GET direto nela agora e 404, regra ja existente e intocada.
        await request(app.getHttpServer())
          .get(`/api/v1/trips/${idaRes.body.data.id}`)
          .set('Authorization', auth)
          .expect(404);
      });

      // Prova, no nivel do banco, que a FK `trips_previous_trip_id_fkey`
      // (ON DELETE SET NULL) realmente existe e funciona -- cenario que so
      // ocorre numa exclusao FISICA de linha (nunca disparada pela API
      // publica, que so faz delecao logica; pode ocorrer por rotina de
      // retencao de dados ou pela Cascade de Tenant.onDelete no futuro).
      it('onDelete: SetNull (nivel do banco): remover fisicamente a linha da ida limpa previousTripId do retorno', async () => {
        const { adminAccessToken } = await createTenantAndLoginAsAdmin('PrevHardDeleteFk');
        const auth = `Bearer ${adminAccessToken}`;
        const idaPrereqs = await setupTripPrerequisites(auth);
        const idaRes = await request(app.getHttpServer())
          .post('/api/v1/trips')
          .set('Authorization', auth)
          .send(buildTripPayload(idaPrereqs))
          .expect(201);

        const retornoPrereqs = await setupTripPrerequisites(auth);
        const retornoRes = await request(app.getHttpServer())
          .post('/api/v1/trips')
          .set('Authorization', auth)
          .send(buildTripPayload(retornoPrereqs, { previousTripId: idaRes.body.data.id }))
          .expect(201);

        // Satelites 1:1 (TripMetrics/RouteVersion/TripComposition) tem
        // onDelete: Cascade a partir de Trip -- o proprio Postgres os
        // remove junto. Nunca exercitado pela API publica (que so faz
        // delecao logica); usado aqui so para provar a FK do vinculo.
        await prisma.trip.delete({ where: { id: idaRes.body.data.id } });

        const after = await request(app.getHttpServer())
          .get(`/api/v1/trips/${retornoRes.body.data.id}`)
          .set('Authorization', auth)
          .expect(200);
        expect(after.body.data.previousTripId).toBeNull();
        expect(after.body.data.previousTrip).toBeNull();
        expect(after.body.data.status).toBe('PLANNED');
      });
    });

    describe('plannedLoadStatus (intencao de planejamento)', () => {
      it('create com plannedLoadStatus=LOADED / =EMPTY; sem informar fica null', async () => {
        const { adminAccessToken } = await createTenantAndLoginAsAdmin('PlanLoadCreate');
        const auth = `Bearer ${adminAccessToken}`;

        const prereqsLoaded = await setupTripPrerequisites(auth);
        const loadedRes = await request(app.getHttpServer())
          .post('/api/v1/trips')
          .set('Authorization', auth)
          .send(buildTripPayload(prereqsLoaded, { plannedLoadStatus: 'LOADED' }))
          .expect(201);
        expect(loadedRes.body.data.plannedLoadStatus).toBe('LOADED');

        const prereqsEmpty = await setupTripPrerequisites(auth);
        const emptyRes = await request(app.getHttpServer())
          .post('/api/v1/trips')
          .set('Authorization', auth)
          .send(buildTripPayload(prereqsEmpty, { plannedLoadStatus: 'EMPTY' }))
          .expect(201);
        expect(emptyRes.body.data.plannedLoadStatus).toBe('EMPTY');

        const prereqsNone = await setupTripPrerequisites(auth);
        const noneRes = await request(app.getHttpServer())
          .post('/api/v1/trips')
          .set('Authorization', auth)
          .send(buildTripPayload(prereqsNone))
          .expect(201);
        expect(noneRes.body.data.plannedLoadStatus).toBeNull();
      });

      it('PATCH com plannedLoadStatus=null limpa a intencao previamente informada', async () => {
        const { adminAccessToken } = await createTenantAndLoginAsAdmin('PlanLoadClear');
        const auth = `Bearer ${adminAccessToken}`;
        const prereqs = await setupTripPrerequisites(auth);
        const createRes = await request(app.getHttpServer())
          .post('/api/v1/trips')
          .set('Authorization', auth)
          .send(buildTripPayload(prereqs, { plannedLoadStatus: 'EMPTY' }))
          .expect(201);

        const cleared = await request(app.getHttpServer())
          .patch(`/api/v1/trips/${createRes.body.data.id}`)
          .set('Authorization', auth)
          .send({ plannedLoadStatus: null })
          .expect(200);
        expect(cleared.body.data.plannedLoadStatus).toBeNull();
      });

      it('plannedLoadStatus=EMPTY com loadStatus=LOADED real e valido -- NUNCA gera correcao/inferencia automatica', async () => {
        const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('PlanVsReal');
        const auth = `Bearer ${adminAccessToken}`;
        const prereqs = await setupTripPrerequisites(auth);
        const createRes = await request(app.getHttpServer())
          .post('/api/v1/trips')
          .set('Authorization', auth)
          .send(buildTripPayload(prereqs, { plannedLoadStatus: 'EMPTY' }))
          .expect(201);
        const tripId = createRes.body.data.id as string;

        const driverAuth = await loginAsDriver(tenantId, auth, prereqs.driverId);
        await request(app.getHttpServer())
          .post(`/api/v1/driver/trips/${tripId}/start`)
          .set('Authorization', driverAuth)
          .send({ odometerKm: 100000, loadStatus: 'LOADED' })
          .expect(201);

        const after = await request(app.getHttpServer())
          .get(`/api/v1/trips/${tripId}`)
          .set('Authorization', auth)
          .expect(200);
        // O exemplo exato do pedido: plannedLoadStatus=EMPTY e loadStatus=LOADED
        // coexistindo sem nenhuma correcao automatica de nenhum dos dois lados.
        expect(after.body.data.plannedLoadStatus).toBe('EMPTY');
        expect(after.body.data.loadStatus).toBe('LOADED');
      });

      it('loadStatus continua sendo definido SOMENTE no fluxo de largada -- create/update recusam o campo (400, nao whitelisted)', async () => {
        const { adminAccessToken } = await createTenantAndLoginAsAdmin('LoadStatusReadOnly');
        const auth = `Bearer ${adminAccessToken}`;
        const prereqs = await setupTripPrerequisites(auth);

        await request(app.getHttpServer())
          .post('/api/v1/trips')
          .set('Authorization', auth)
          .send(buildTripPayload(prereqs, { loadStatus: 'LOADED' }))
          .expect(400);

        const createRes = await request(app.getHttpServer())
          .post('/api/v1/trips')
          .set('Authorization', auth)
          .send(buildTripPayload(prereqs))
          .expect(201);
        await request(app.getHttpServer())
          .patch(`/api/v1/trips/${createRes.body.data.id}`)
          .set('Authorization', auth)
          .send({ loadStatus: 'EMPTY' })
          .expect(400);
      });
    });

    describe('nao afeta financeiro/operacional individual nem VehicleIdlePeriod', () => {
      it('ida + retorno vinculados nao alteram os calculos financeiros individuais (TripMetrics/TripSettlement continuam por tripId)', async () => {
        const { adminAccessToken } = await createTenantAndLoginAsAdmin('PrevFinance');
        const auth = `Bearer ${adminAccessToken}`;

        const idaPrereqs = await setupTripPrerequisites(auth);
        const idaRes = await request(app.getHttpServer())
          .post('/api/v1/trips')
          .set('Authorization', auth)
          .send(buildTripPayload(idaPrereqs, { plannedMetrics: { distanceKm: 500, totalCost: 3000 } }))
          .expect(201);

        const retornoPrereqs = await setupTripPrerequisites(auth);
        const retornoRes = await request(app.getHttpServer())
          .post('/api/v1/trips')
          .set('Authorization', auth)
          .send(
            buildTripPayload(retornoPrereqs, {
              previousTripId: idaRes.body.data.id,
              plannedMetrics: { distanceKm: 300, totalCost: 1200 },
            }),
          )
          .expect(201);

        const idaSummary = await request(app.getHttpServer())
          .get(`/api/v1/trips/${idaRes.body.data.id}/summary`)
          .set('Authorization', auth)
          .expect(200);
        const retornoSummary = await request(app.getHttpServer())
          .get(`/api/v1/trips/${retornoRes.body.data.id}/summary`)
          .set('Authorization', auth)
          .expect(200);

        // Cada viagem mantem seu proprio TripMetrics -- o vinculo nao soma,
        // nao mistura e nao cria nenhum agregador ida+retorno.
        expect(idaSummary.body.data.plannedTotalCost).toBe(3000);
        expect(idaSummary.body.data.distanceKm).toBe(500);
        expect(retornoSummary.body.data.plannedTotalCost).toBe(1200);
        expect(retornoSummary.body.data.distanceKm).toBe(300);
      });

      it('VehicleIdlePeriod continua fechando normalmente na partida do retorno, mesmo com previousTripId setado (coexistem sem vinculo automatico)', async () => {
        const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('PrevIdlePeriod');
        const auth = `Bearer ${adminAccessToken}`;

        const idaPrereqs = await setupTripPrerequisites(auth);
        const idaRes = await request(app.getHttpServer())
          .post('/api/v1/trips')
          .set('Authorization', auth)
          .send(buildTripPayload(idaPrereqs))
          .expect(201);
        const idaId = idaRes.body.data.id as string;

        await request(app.getHttpServer())
          .patch(`/api/v1/trips/${idaId}/status`)
          .set('Authorization', auth)
          .send({ status: 'IN_PROGRESS' })
          .expect(200);
        await request(app.getHttpServer())
          .patch(`/api/v1/trips/${idaId}/status`)
          .set('Authorization', auth)
          .send({ status: 'COMPLETED' })
          .expect(200);

        // Fase B: viagem concluida abre um VehicleIdlePeriod para o veiculo,
        // tripBeforeId = ida. Isso NUNCA cria/altera previousTripId sozinho.
        const openPeriods = await prisma.vehicleIdlePeriod.findMany({
          where: { tenantId, vehicleId: idaPrereqs.vehicleId, endedAt: null },
        });
        expect(openPeriods).toHaveLength(1);
        expect(openPeriods[0]!.tripBeforeId).toBe(idaId);

        // O retorno usa o MESMO veiculo (uma NOVA composicao -- a da ida ja
        // ficou permanentemente vinculada a ela, regra inalterada desta
        // fase) e aponta EXPLICITAMENTE para a ida via previousTripId --
        // vinculo informado pelo operador, nunca inferido pelo idle period.
        const retornoCompositionId = await createComposition(auth, idaPrereqs.vehicleId);
        const retornoOriginId = await createLocation(auth, `Origem retorno ${randomUUID()}`);
        const retornoRes = await request(app.getHttpServer())
          .post('/api/v1/trips')
          .set('Authorization', auth)
          .send({
            driverId: idaPrereqs.driverId,
            compositionId: retornoCompositionId,
            originLocationId: retornoOriginId,
            destinationLocationId: idaPrereqs.originId,
            previousTripId: idaId,
            plannedDeparture: '2026-09-10T08:00:00.000Z',
            plannedArrival: '2026-09-11T18:00:00.000Z',
          })
          .expect(201);
        const retornoId = retornoRes.body.data.id as string;

        await request(app.getHttpServer())
          .patch(`/api/v1/trips/${retornoId}/status`)
          .set('Authorization', auth)
          .send({ status: 'IN_PROGRESS' })
          .expect(200);

        // Fecha exatamente como antes da Fase D (Fase B intocada):
        // tripAfterId = retorno, endedAt = actualDeparture do retorno.
        const closedPeriod = await prisma.vehicleIdlePeriod.findFirst({
          where: { tenantId, vehicleId: idaPrereqs.vehicleId, id: openPeriods[0]!.id },
        });
        expect(closedPeriod?.endedAt).not.toBeNull();
        expect(closedPeriod?.tripAfterId).toBe(retornoId);
        expect(closedPeriod?.tripBeforeId).toBe(idaId);

        // As duas fontes coexistem naturalmente, sem se substituir: o
        // vinculo de negocio (previousTripId) e a fronteira de ociosidade
        // (VehicleIdlePeriod.tripBefore/tripAfter) apontam para as MESMAS
        // viagens, mas continuam sendo conceitos e campos independentes.
        const retorno = await request(app.getHttpServer())
          .get(`/api/v1/trips/${retornoId}`)
          .set('Authorization', auth)
          .expect(200);
        expect(retorno.body.data.previousTripId).toBe(idaId);
        expect(closedPeriod?.tripBeforeId).toBe(retorno.body.data.previousTripId);
      });
    });
  });
});
