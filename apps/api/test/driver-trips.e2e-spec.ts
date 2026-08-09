import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 25 -- cobre os 24 cenarios da secao 24: viagem persistente/retomada,
// localizacao GPS, parada, abastecimento (online e "offline"/idempotente),
// excecao de eixo (padrao/timeout/exceção/retorno), conciliacao usando o
// eixo real da passagem, isolamento multi-tenant e RBAC.
describe('Driver Trips (e2e)', () => {
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
      slug: `dt-${label.toLowerCase()}-${unique}`,
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

    // Promovido a SUPER_ADMIN (mesmo padrao ja usado em toll-routes.e2e-spec.ts)
    // -- alguns cadastros globais usados aqui (POST /toll-plazas) exigem
    // SUPER_ADMIN; SUPER_ADMIN continua tendo acesso a tudo que ADMIN tinha.
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

  async function createComposition(auth: string, vehicleId: string, totalAxles: number) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/trip-compositions')
      .set('Authorization', auth)
      .send({
        vehicleId,
        trailers: [],
        axleConfiguration: { totalAxles, billableCategory: `${totalAxles} eixos` },
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createTollPlaza(auth: string, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/toll-plazas')
      .set('Authorization', auth)
      .send({
        name: `Praca ${randomUUID()}`,
        operator: 'CCR ViaOeste',
        highway: 'SP-310',
        pricePerAxle: 15,
        latitude: -23.5505,
        longitude: -46.6333,
        ...overrides,
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function getSemParar(auth: string) {
    const res = await request(app.getHttpServer())
      .get('/api/v1/tag-providers')
      .set('Authorization', auth)
      .expect(200);
    return res.body.data.find((p: { name: string }) => p.name === 'Sem Parar').id as string;
  }

  async function createVehicleTag(auth: string, vehicleId: string) {
    const tagProviderId = await getSemParar(auth);
    await request(app.getHttpServer())
      .post(`/api/v1/vehicles/${vehicleId}/tags`)
      .set('Authorization', auth)
      .send({
        tagProviderId,
        tagNumber: String(Math.floor(1_000_000_000 + Math.random() * 8_999_999_999)),
        activatedAt: '2026-01-01',
      })
      .expect(201);
  }

  async function createRoute(auth: string, plazaIds: string[]) {
    const routeRes = await request(app.getHttpServer())
      .post('/api/v1/toll-routes')
      .set('Authorization', auth)
      .send({ name: `Rota ${randomUUID()}`, originLabel: 'Origem', destinationLabel: 'Destino' })
      .expect(201);
    const routeId = routeRes.body.data.id as string;

    await request(app.getHttpServer())
      .put(`/api/v1/toll-routes/${routeId}/stops`)
      .set('Authorization', auth)
      .send({ stops: plazaIds.map((tollPlazaId) => ({ tollPlazaId })) })
      .expect(200);

    return routeId;
  }

  // Cria motorista + veiculo (N eixos) + composicao + viagem PLANNED, e da
  // ao motorista um login proprio (UserAccount role DRIVER vinculado ao
  // Driver) -- exatamente o fluxo ja existente reaproveitado (PATCH
  // /drivers/:id/user-link), sem nenhum endpoint novo so para isto.
  async function setupDriverWithTrip(
    adminAuth: string,
    tenantId: string,
    options: { totalAxles?: number; tollRouteId?: string } = {},
  ) {
    const vehicleId = await createVehicle(adminAuth);
    const driverId = await createDriver(adminAuth);
    const compositionId = await createComposition(adminAuth, vehicleId, options.totalAxles ?? 9);
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
        ...(options.tollRouteId ? { tollRouteId: options.tollRouteId } : {}),
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
  // 1-6: ciclo de vida da viagem (persistente, retomada, pausa, conclusao)
  // ==========================================================================
  describe('ciclo de vida da viagem', () => {
    it('viagem recem-despachada (PLANNED) ja aparece para o motorista poder iniciar', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Lifecycle1');
      const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId);

      const res = await request(app.getHttpServer())
        .get('/api/v1/driver/trips/active')
        .set('Authorization', driverAuth)
        .expect(200);
      expect(res.body.data.id).toBe(tripId);
      expect(res.body.data.status).toBe('PLANNED');
    });

    it('nenhuma viagem pendente depois de concluida/cancelada', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Lifecycle1b');
      const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId);
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/complete`)
        .set('Authorization', driverAuth)
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/driver/trips/active')
        .set('Authorization', driverAuth)
        .expect(200);
      expect(res.body.data).toBeNull();
    });

    it('inicia a viagem e ela passa a aparecer como ativa (retomada = GET /driver/trips/active)', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Lifecycle2');
      const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId);

      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .expect(201);
      expect(startRes.body.data.status).toBe('IN_PROGRESS');

      // "fechar o app e abrir de novo" = simplesmente reconsultar -- o
      // backend nao depende do app permanecer aberto (Fase 25, secao 1).
      const activeRes = await request(app.getHttpServer())
        .get('/api/v1/driver/trips/active')
        .set('Authorization', driverAuth)
        .expect(200);
      expect(activeRes.body.data.id).toBe(tripId);
      expect(activeRes.body.data.status).toBe('IN_PROGRESS');
    });

    it('pausa e retoma a viagem (resume e idempotente se ja ACTIVE)', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Lifecycle3');
      const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId);
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .expect(201);

      const pauseRes = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/pause`)
        .set('Authorization', driverAuth)
        .expect(201);
      expect(pauseRes.body.data.status).toBe('PAUSED');

      const resumeRes = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/resume`)
        .set('Authorization', driverAuth)
        .expect(201);
      expect(resumeRes.body.data.status).toBe('IN_PROGRESS');

      // resume novamente (ja ACTIVE) -- idempotente, nunca 409.
      const resumeAgainRes = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/resume`)
        .set('Authorization', driverAuth)
        .expect(201);
      expect(resumeAgainRes.body.data.status).toBe('IN_PROGRESS');
    });

    it('conclui a viagem', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Lifecycle4');
      const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId);
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .expect(201);

      const completeRes = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/complete`)
        .set('Authorization', driverAuth)
        .expect(201);
      expect(completeRes.body.data.status).toBe('COMPLETED');

      // Concluida nao aparece mais como ativa.
      const activeRes = await request(app.getHttpServer())
        .get('/api/v1/driver/trips/active')
        .set('Authorization', driverAuth)
        .expect(200);
      expect(activeRes.body.data).toBeNull();
    });
  });

  // ==========================================================================
  // Fase 27 -- tela "INICIAR VIAGEM" (KM/carga na largada)
  // ==========================================================================
  describe('inicio de viagem (Fase 27)', () => {
    it('start com KM e carga grava Trip.initialOdometerKm/loadStatus e atualiza Vehicle.odometerKm', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Start1');
      const { driverAuth, tripId, vehicleId } = await setupDriverWithTrip(adminAuth, tenantId);

      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .send({ odometerKm: 152340.5, loadStatus: 'LOADED' })
        .expect(201);

      expect(startRes.body.data.status).toBe('IN_PROGRESS');
      expect(startRes.body.data.initialOdometerKm).toBe(152340.5);
      expect(startRes.body.data.currentOdometerKm).toBe(152340.5);
      expect(startRes.body.data.loadStatus).toBe('LOADED');
      expect(startRes.body.data.defaultAxles).toBe(9);

      const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
      expect(Number(vehicle?.odometerKm)).toBe(152340.5);
    });

    it('start sem corpo continua funcionando (compatibilidade retroativa)', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Start2');
      const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId);

      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .expect(201);

      expect(startRes.body.data.status).toBe('IN_PROGRESS');
      expect(startRes.body.data.initialOdometerKm).toBeNull();
      expect(startRes.body.data.loadStatus).toBeNull();
    });

    it('um segundo "start" (idempotente, ja ACTIVE) nunca sobrescreve o initialOdometerKm ja gravado', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Start3');
      const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId);

      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .send({ odometerKm: 100000, loadStatus: 'EMPTY' })
        .expect(201);

      // Segundo toque (app reaberto), com um KM diferente -- nao deve alterar
      // o que ja foi registrado na largada real.
      const secondRes = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .send({ odometerKm: 999999, loadStatus: 'LOADED' })
        .expect(201);

      expect(secondRes.body.data.initialOdometerKm).toBe(100000);
      expect(secondRes.body.data.loadStatus).toBe('EMPTY');
    });

    it('abastecimento inicial pode ser registrado ANTES do start (viagem ainda PLANNED)', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Start4');
      const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/fuel-supplies`)
        .set('Authorization', driverAuth)
        .send({ deviceEventId: randomUUID(), odometerKm: 100000, liters: 300, pricePerLiter: 6 })
        .expect(201);
      expect(res.body.data.tripId).toBe(tripId);

      const tripBefore = await prisma.trip.findUnique({ where: { id: tripId } });
      expect(tripBefore?.status).toBe('PLANNED');

      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .send({ odometerKm: 100000, loadStatus: 'LOADED' })
        .expect(201);
    });
  });

  // ==========================================================================
  // 7: localizacao GPS (lote, idempotente por deviceEventId)
  // ==========================================================================
  describe('localizacao', () => {
    it('registra um lote de posicoes e reenviar o mesmo lote nao duplica (idempotencia)', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Location1');
      const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId);
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .expect(201);

      const points = [
        {
          deviceEventId: randomUUID(),
          latitude: -23.55,
          longitude: -46.63,
          recordedAt: '2026-09-01T09:00:00.000Z',
        },
        {
          deviceEventId: randomUUID(),
          latitude: -23.551,
          longitude: -46.631,
          recordedAt: '2026-09-01T09:01:00.000Z',
        },
      ];

      const firstRes = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/locations`)
        .set('Authorization', driverAuth)
        .send({ points })
        .expect(201);
      expect(firstRes.body.data.created).toBe(2);
      expect(firstRes.body.data.duplicates).toBe(0);

      // Reenvio (ex: apos reconexao) -- mesmo deviceEventId, nunca duplica.
      const secondRes = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/locations`)
        .set('Authorization', driverAuth)
        .send({ points })
        .expect(201);
      expect(secondRes.body.data.created).toBe(0);
      expect(secondRes.body.data.duplicates).toBe(2);

      const stored = await prisma.trackingPoint.count({ where: { tripId } });
      expect(stored).toBe(2);
    });
  });

  // ==========================================================================
  // 8: parada operacional
  // ==========================================================================
  describe('parada', () => {
    it('abre e fecha uma parada -- duracao sempre calculada pelo backend', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Stop1');
      const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId);
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .expect(201);

      const openRes = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/stops`)
        .set('Authorization', driverAuth)
        .send({
          deviceEventId: randomUUID(),
          latitude: -23.5,
          longitude: -46.6,
          startedAt: '2026-09-01T12:00:00.000Z',
        })
        .expect(201);
      expect(openRes.body.data.type).toBe('UNKNOWN');
      const stopId = openRes.body.data.id as string;

      const closeRes = await request(app.getHttpServer())
        .patch(`/api/v1/driver/trips/${tripId}/stops/${stopId}/close`)
        .set('Authorization', driverAuth)
        .send({ endedAt: '2026-09-01T12:25:00.000Z', type: 'REST' })
        .expect(200);
      expect(closeRes.body.data.durationMinutes).toBe(25);
      expect(closeRes.body.data.type).toBe('REST');

      // Visibilidade administrativa (Fase 25, secao 20).
      const adminListRes = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/stops`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(adminListRes.body.data).toHaveLength(1);
    });
  });

  // ==========================================================================
  // 9-11: abastecimento (online, "offline"/idempotente, sem posto)
  // ==========================================================================
  describe('abastecimento', () => {
    it('registra abastecimento so com KM + litros (sem fuelStationId, sem posto inventado)', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Fuel1');
      const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId);
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .expect(201);

      const deviceEventId = randomUUID();
      const res = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/fuel-supplies`)
        .set('Authorization', driverAuth)
        .send({ deviceEventId, odometerKm: 125000, liters: 250.5, latitude: -23.5, longitude: -46.6 })
        .expect(201);

      expect(res.body.data.fuelStationId).toBeNull();
      expect(res.body.data.tripId).toBe(tripId);
      expect(res.body.data.liters).toBe(250.5);

      // Reenvio (simula sincronizacao apos ficar offline) -- idempotente,
      // devolve o MESMO registro, nunca cria um segundo.
      const secondRes = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/fuel-supplies`)
        .set('Authorization', driverAuth)
        .send({ deviceEventId, odometerKm: 125000, liters: 250.5 })
        .expect(201);
      expect(secondRes.body.data.id).toBe(res.body.data.id);

      const count = await prisma.fuelSupply.count({ where: { tripId, deviceEventId } });
      expect(count).toBe(1);
    });
  });

  // ==========================================================================
  // 12-19 + 22-24: eixos (padrao, excecao, retorno, timeout) + conciliacao
  // ==========================================================================
  describe('eixos e conciliacao', () => {
    it('passagem automatica assume o padrao da composicao (9) quando o motorista nao responde (timeout)', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Axle1');
      const plazaId = await createTollPlaza(adminAuth);
      const routeId = await createRoute(adminAuth, [plazaId]);
      const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId, {
        totalAxles: 9,
        tollRouteId: routeId,
      });
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/axle-events`)
        .set('Authorization', driverAuth)
        .send({
          deviceEventId: randomUUID(),
          tollPlazaId: plazaId,
          source: 'TIMEOUT_DEFAULT',
          latitude: -23.55,
          longitude: -46.63,
        })
        .expect(201);

      expect(res.body.data.defaultAxles).toBe(9);
      expect(res.body.data.declaredAxles).toBe(9);
      expect(res.body.data.suspendedAxles).toBe(0);
    });

    it('motorista altera para 7 eixos, e apos a praca a configuracao volta implicitamente ao padrao (9)', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Axle2');
      const plazaId = await createTollPlaza(adminAuth);
      const routeId = await createRoute(adminAuth, [plazaId]);
      const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId, {
        totalAxles: 9,
        tollRouteId: routeId,
      });
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .expect(201);

      const openRes = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/axle-events`)
        .set('Authorization', driverAuth)
        .send({
          deviceEventId: randomUUID(),
          tollPlazaId: plazaId,
          declaredAxles: 7,
          source: 'DRIVER_INPUT',
          latitude: -23.55,
          longitude: -46.63,
        })
        .expect(201);
      expect(openRes.body.data.defaultAxles).toBe(9);
      expect(openRes.body.data.declaredAxles).toBe(7);
      expect(openRes.body.data.suspendedAxles).toBe(2);
      const eventId = openRes.body.data.id as string;

      const closeRes = await request(app.getHttpServer())
        .patch(`/api/v1/driver/trips/${tripId}/axle-events/${eventId}/close`)
        .set('Authorization', driverAuth)
        .send({ endedAt: '2026-09-01T13:05:00.000Z' })
        .expect(200);
      expect(closeRes.body.data.endedAt).not.toBeNull();

      // AxleConfiguration NUNCA e alterada -- continua 9 (padrao permanente).
      const axleConfig = await prisma.axleConfiguration.findFirst({
        where: { tripComposition: { tripId } },
      });
      expect(axleConfig?.totalAxles).toBe(9);

      // Proxima passagem sem excecao (timeout) volta a assumir 9 automaticamente.
      const nextRes = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/axle-events`)
        .set('Authorization', driverAuth)
        .send({
          deviceEventId: randomUUID(),
          tollPlazaId: plazaId,
          source: 'TIMEOUT_DEFAULT',
          latitude: -23.55,
          longitude: -46.63,
        })
        .expect(201);
      expect(nextRes.body.data.declaredAxles).toBe(9);
    });

    it('conciliacao usa 7 eixos quando a TollTransaction daquela praca foi registrada com excecao, e 9 quando nao houve excecao', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Axle3');
      const plazaException = await createTollPlaza(adminAuth, { name: 'Praca com excecao' });
      const plazaNormal = await createTollPlaza(adminAuth, { name: 'Praca normal' });
      const routeId = await createRoute(adminAuth, [plazaException, plazaNormal]);
      const { driverAuth, tripId, vehicleId } = await setupDriverWithTrip(adminAuth, tenantId, {
        totalAxles: 9,
        tollRouteId: routeId,
      });
      await createVehicleTag(adminAuth, vehicleId);
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .expect(201);

      // Motorista registra a excecao (7 eixos) na 1a praca.
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/axle-events`)
        .set('Authorization', driverAuth)
        .send({
          deviceEventId: randomUUID(),
          tollPlazaId: plazaException,
          declaredAxles: 7,
          source: 'DRIVER_INPUT',
          latitude: -23.55,
          longitude: -46.63,
        })
        .expect(201);

      // O administrativo lanca as duas transacoes reais: 7 eixos na praca
      // com excecao (105 = 15 * 7), 9 eixos na praca normal (135 = 15 * 9).
      await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', adminAuth)
        .send({
          tripId,
          tollPlazaId: plazaException,
          axleCount: 7,
          chargedAmount: 105,
          chargedAt: '2026-09-01T13:00:00.000Z',
        })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', adminAuth)
        .send({
          tripId,
          tollPlazaId: plazaNormal,
          axleCount: 9,
          chargedAmount: 135,
          chargedAt: '2026-09-01T14:00:00.000Z',
        })
        .expect(201);

      const reconciliationRes = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/toll-reconciliation`)
        .set('Authorization', adminAuth)
        .expect(200);

      const stops = reconciliationRes.body.data.stops as Array<{
        tollPlazaId: string;
        axleCount: number;
        expectedAmount: number;
        verdict: string;
      }>;
      const exceptionStop = stops.find((s) => s.tollPlazaId === plazaException)!;
      const normalStop = stops.find((s) => s.tollPlazaId === plazaNormal)!;

      expect(exceptionStop.axleCount).toBe(7);
      expect(exceptionStop.expectedAmount).toBe(105);
      expect(exceptionStop.verdict).toBe('CORRECT');

      expect(normalStop.axleCount).toBe(9);
      expect(normalStop.expectedAmount).toBe(135);
      expect(normalStop.verdict).toBe('CORRECT');
    });

    it('TollTransaction sem axleCount resolve automaticamente para o declaredAxles do AxleEvent da praca (Fase 27)', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Axle4');
      const plazaId = await createTollPlaza(adminAuth);
      const routeId = await createRoute(adminAuth, [plazaId]);
      const { driverAuth, tripId, vehicleId } = await setupDriverWithTrip(adminAuth, tenantId, {
        totalAxles: 9,
        tollRouteId: routeId,
      });
      await createVehicleTag(adminAuth, vehicleId);
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/axle-events`)
        .set('Authorization', driverAuth)
        .send({
          deviceEventId: randomUUID(),
          tollPlazaId: plazaId,
          declaredAxles: 7,
          source: 'DRIVER_INPUT',
          latitude: -23.55,
          longitude: -46.63,
        })
        .expect(201);

      // axleCount OMITIDO -- deve resolver para 7 (declaredAxles do AxleEvent).
      const txRes = await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', adminAuth)
        .send({ tripId, tollPlazaId: plazaId, chargedAmount: 105, chargedAt: '2026-09-01T13:00:00.000Z' })
        .expect(201);
      expect(txRes.body.data.axleCount).toBe(7);
      expect(txRes.body.data.expectedAmount).toBe(105);

      // AxleConfiguration (padrao permanente) nunca e alterada por isso.
      const axleConfig = await prisma.axleConfiguration.findFirst({
        where: { tripComposition: { tripId } },
      });
      expect(axleConfig?.totalAxles).toBe(9);
    });

    it('TollTransaction sem axleCount e sem AxleEvent resolve para o padrao da composicao (9)', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Axle5');
      const plazaId = await createTollPlaza(adminAuth);
      const routeId = await createRoute(adminAuth, [plazaId]);
      const { driverAuth, tripId, vehicleId } = await setupDriverWithTrip(adminAuth, tenantId, {
        totalAxles: 9,
        tollRouteId: routeId,
      });
      await createVehicleTag(adminAuth, vehicleId);
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .expect(201);

      // Nenhum AxleEvent registrado nesta praca -- deve cair no padrao (9).
      const txRes = await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', adminAuth)
        .send({ tripId, tollPlazaId: plazaId, chargedAmount: 135, chargedAt: '2026-09-01T13:00:00.000Z' })
        .expect(201);
      expect(txRes.body.data.axleCount).toBe(9);
      expect(txRes.body.data.expectedAmount).toBe(135);
    });
  });

  // ==========================================================================
  // 20-23: isolamento multi-tenant e RBAC
  // ==========================================================================
  describe('isolamento multi-tenant e RBAC', () => {
    it('motorista nao acessa viagem de outro motorista (mesmo tenant) -- 403', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Rbac1');
      const driverA = await setupDriverWithTrip(adminAuth, tenantId);
      const driverB = await setupDriverWithTrip(adminAuth, tenantId);

      await request(app.getHttpServer())
        .get(`/api/v1/driver/trips/${driverB.tripId}`)
        .set('Authorization', driverA.driverAuth)
        .expect(403);
    });

    it('motorista de um tenant nao acessa viagem de outro tenant -- 404', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('Rbac2A');
      const tenantB = await createTenantAndLoginAsAdmin('Rbac2B');
      const driverA = await setupDriverWithTrip(tenantA.adminAuth, tenantA.tenantId);
      const driverB = await setupDriverWithTrip(tenantB.adminAuth, tenantB.tenantId);

      await request(app.getHttpServer())
        .get(`/api/v1/driver/trips/${driverA.tripId}`)
        .set('Authorization', driverB.driverAuth)
        .expect(404);
    });

    it('um DRIVER nao acessa o modulo administrativo de viagens (403)', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Rbac3');
      const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId);

      await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}`)
        .set('Authorization', driverAuth)
        .expect(403);
    });

    it('um usuario administrativo (nao DRIVER) nao acessa a API do motorista (403)', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Rbac4');
      const { tripId } = await setupDriverWithTrip(adminAuth, tenantId);

      await request(app.getHttpServer())
        .get(`/api/v1/driver/trips/${tripId}`)
        .set('Authorization', adminAuth)
        .expect(403);
    });
  });
});
