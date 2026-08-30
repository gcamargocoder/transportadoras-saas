import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 29 -- GET /trips/operations/active (painel de monitoramento
// operacional). Reaproveita a mesma infraestrutura de setup ja usada em
// driver-trips.e2e-spec.ts (motorista com login proprio, viagem via API
// administrativa) -- nao introduz nenhum mecanismo de teste novo. Cenarios
// de desvio/recalculo sao verificados semeando RouteEvent/RoutePlan
// diretamente via Prisma: a DETECCAO em si (Fase 26) ja tem cobertura
// propria em routing.e2e-spec.ts; aqui o que se testa e se o endpoint
// agregado SURFACE corretamente um estado que ja existe no banco.
describe('Monitoramento operacional (e2e) -- GET /trips/operations/active', () => {
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
      slug: `mon-${label.toLowerCase()}-${unique}`,
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

  async function setupDriverWithTrip(adminAuth: string, tenantId: string) {
    const vehicleId = await createVehicle(adminAuth);
    const driverId = await createDriver(adminAuth);
    const compositionId = await createComposition(adminAuth, vehicleId, 9);
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

  async function getActiveOperations(auth: string) {
    return request(app.getHttpServer())
      .get('/api/v1/trips/operations/active')
      .set('Authorization', auth)
      .expect(200);
  }

  it('viagem em andamento aparece com posicao, movimento e status operacional MOVING', async () => {
    const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Mon1');
    const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId);
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/start`)
      .set('Authorization', driverAuth)
      .send({ odometerKm: 100000, loadStatus: 'LOADED' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/locations`)
      .set('Authorization', driverAuth)
      .send({
        points: [
          {
            deviceEventId: randomUUID(),
            latitude: -23.55,
            longitude: -46.63,
            speedKmh: 80,
            headingDeg: 90,
            recordedAt: new Date().toISOString(),
          },
        ],
      })
      .expect(201);

    const res = await getActiveOperations(adminAuth);
    const item = res.body.data.items.find((i: { tripId: string }) => i.tripId === tripId);
    expect(item).toBeDefined();
    expect(item.status).toBe('IN_PROGRESS');
    expect(item.operationalStatus).toBe('MOVING');
    expect(item.movementStatus).toBe('MOVING');
    expect(item.locationFreshness).toBe('ONLINE');
    expect(item.lastPosition.latitude).toBeCloseTo(-23.55, 5);
    expect(item.lastPosition.speedKmh).toBe(80);
    expect(item.minutesSinceLastUpdate).toBe(0);
    expect(item.defaultAxles).toBe(9);
    expect(item.initialOdometerKm).toBe(100000);
    expect(item.currentOdometerKm).toBe(100000);
  });

  it('viagem pausada aparece com operationalStatus PAUSED', async () => {
    const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Mon2');
    const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId);
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/start`)
      .set('Authorization', driverAuth)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/pause`)
      .set('Authorization', driverAuth)
      .expect(201);

    const res = await getActiveOperations(adminAuth);
    const item = res.body.data.items.find((i: { tripId: string }) => i.tripId === tripId);
    expect(item.status).toBe('PAUSED');
    expect(item.operationalStatus).toBe('PAUSED');
  });

  it('viagem concluida NAO aparece na lista de monitoramento', async () => {
    const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Mon3');
    const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId);
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/start`)
      .set('Authorization', driverAuth)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/complete`)
      .set('Authorization', driverAuth)
      .send({ finalOdometerKm: 100500 })
      .expect(201);

    const res = await getActiveOperations(adminAuth);
    const item = res.body.data.items.find((i: { tripId: string }) => i.tripId === tripId);
    expect(item).toBeUndefined();
  });

  it('viagem sem NENHUM tracking point fica STALE (locationFreshness OFFLINE) e nao inventa posicao', async () => {
    const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Mon4');
    const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId);
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/start`)
      .set('Authorization', driverAuth)
      .expect(201);

    const res = await getActiveOperations(adminAuth);
    const item = res.body.data.items.find((i: { tripId: string }) => i.tripId === tripId);
    expect(item.operationalStatus).toBe('STALE');
    expect(item.locationFreshness).toBe('OFFLINE');
    expect(item.lastPosition).toBeNull();
    expect(item.minutesSinceLastUpdate).toBeNull();
    expect(item.movementStatus).toBe('UNKNOWN');
  });

  it('posicao antiga (acima do limiar do tenant) deixa a viagem STALE mesmo com velocidade disponivel', async () => {
    const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Mon5');
    await prisma.tenantSettings.upsert({
      where: { tenantId },
      update: { alertDelayThresholdMin: 5 },
      create: { tenantId, alertDelayThresholdMin: 5 },
    });
    const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId);
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/start`)
      .set('Authorization', driverAuth)
      .expect(201);
    await prisma.trackingPoint.create({
      data: {
        tenantId,
        tripId,
        latitude: -23.5,
        longitude: -46.6,
        speedKmh: 60,
        // 12 min atras: acima do limiar STALE (5 min) mas bem abaixo do
        // limiar OFFLINE (5 * 4 = 20 min) -- margem confortavel para o
        // tempo real de execucao do teste nao empurrar para OFFLINE.
        recordedAt: new Date(Date.now() - 12 * 60_000),
        deviceEventId: randomUUID(),
      },
    });

    const res = await getActiveOperations(adminAuth);
    const item = res.body.data.items.find((i: { tripId: string }) => i.tripId === tripId);
    expect(item.operationalStatus).toBe('STALE');
    expect(item.locationFreshness).toBe('STALE');
  });

  it('desvio em aberto aparece como hasUnresolvedDeviation=true e operationalStatus OFF_ROUTE', async () => {
    const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Mon6');
    const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId);
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/start`)
      .set('Authorization', driverAuth)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/locations`)
      .set('Authorization', driverAuth)
      .send({
        points: [
          {
            deviceEventId: randomUUID(),
            latitude: -23.5,
            longitude: -46.6,
            speedKmh: 40,
            recordedAt: new Date().toISOString(),
          },
        ],
      })
      .expect(201);
    await prisma.routeEvent.create({ data: { tenantId, tripId, type: 'DEVIATION' } });

    const res = await getActiveOperations(adminAuth);
    const item = res.body.data.items.find((i: { tripId: string }) => i.tripId === tripId);
    expect(item.hasUnresolvedDeviation).toBe(true);
    expect(item.operationalStatus).toBe('OFF_ROUTE');
  });

  it('RoutePlan recalculado (RouteEvent com resultingRoutePlanId) aparece como hasRecalculatedRoute=true', async () => {
    const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Mon7');
    const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId);
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/start`)
      .set('Authorization', driverAuth)
      .expect(201);

    const newPlan = await prisma.routePlan.create({
      data: {
        tenantId,
        tripId,
        originLabel: 'Origem',
        destinationLabel: 'Destino',
        originLatitude: -23.5,
        originLongitude: -46.6,
        destinationLatitude: -23.4,
        destinationLongitude: -46.5,
        distanceMeters: 10_000,
        durationSeconds: 900,
        encodedPolyline: 'abc',
        provider: 'FAKE',
      },
    });
    await prisma.routeEvent.create({
      data: {
        tenantId,
        tripId,
        type: 'DEVIATION',
        resolvedAt: new Date(),
        resultingRoutePlanId: newPlan.id,
      },
    });

    const res = await getActiveOperations(adminAuth);
    const item = res.body.data.items.find((i: { tripId: string }) => i.tripId === tripId);
    expect(item.hasRecalculatedRoute).toBe(true);
    // Ja resolvido -- nao deve mais contar como desvio EM ABERTO.
    expect(item.hasUnresolvedDeviation).toBe(false);
  });

  it('pedagio previsto e registrado aparecem no tollSummary (reaproveita TollReconciliationService)', async () => {
    const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Mon8');
    const { driverAuth, tripId, vehicleId } = await setupDriverWithTrip(adminAuth, tenantId);

    const plazaRes = await request(app.getHttpServer())
      .post('/api/v1/toll-plazas')
      .set('Authorization', adminAuth)
      .send({
        name: `Praca ${randomUUID()}`,
        operator: 'CCR ViaOeste',
        highway: 'SP-310',
        pricePerAxle: 15,
        latitude: -23.5,
        longitude: -46.6,
      })
      .expect(201);
    const tollPlazaId = plazaRes.body.data.id as string;

    const routeRes = await request(app.getHttpServer())
      .post('/api/v1/toll-routes')
      .set('Authorization', adminAuth)
      .send({ name: `Rota ${randomUUID()}`, originLabel: 'Origem', destinationLabel: 'Destino' })
      .expect(201);
    const tollRouteId = routeRes.body.data.id as string;
    await request(app.getHttpServer())
      .put(`/api/v1/toll-routes/${tollRouteId}/stops`)
      .set('Authorization', adminAuth)
      .send({ stops: [{ tollPlazaId }] })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}`)
      .set('Authorization', adminAuth)
      .send({ tollRouteId })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/start`)
      .set('Authorization', driverAuth)
      .expect(201);

    const tagProvidersRes = await request(app.getHttpServer())
      .get('/api/v1/tag-providers')
      .set('Authorization', adminAuth)
      .expect(200);
    const tagProviderId = tagProvidersRes.body.data.find((p: { name: string }) => p.name === 'Sem Parar').id;
    await request(app.getHttpServer())
      .post(`/api/v1/vehicles/${vehicleId}/tags`)
      .set('Authorization', adminAuth)
      .send({ tagProviderId, tagNumber: String(Math.floor(1_000_000_000 + Math.random() * 8_999_999_999)), activatedAt: '2026-01-01' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/toll-transactions')
      .set('Authorization', adminAuth)
      .send({ tripId, tollPlazaId, chargedAmount: 135, chargedAt: new Date().toISOString(), axleCount: 9 })
      .expect(201);

    const res = await getActiveOperations(adminAuth);
    const item = res.body.data.items.find((i: { tripId: string }) => i.tripId === tripId);
    expect(item.tollSummary.plannedCount).toBe(1);
    expect(item.tollSummary.registeredCount).toBe(1);
    expect(item.tollSummary.pendingCount).toBe(0);
    expect(item.tollSummary.reconciliationStatus).toBe('CONFORM');
  });

  it('isolamento multi-tenant: viagens de outro tenant nunca aparecem', async () => {
    const tenantA = await createTenantAndLoginAsAdmin('Mon9A');
    const tenantB = await createTenantAndLoginAsAdmin('Mon9B');
    const { driverAuth, tripId } = await setupDriverWithTrip(tenantA.adminAuth, tenantA.tenantId);
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/start`)
      .set('Authorization', driverAuth)
      .expect(201);

    const res = await getActiveOperations(tenantB.adminAuth);
    expect(res.body.data.items.find((i: { tripId: string }) => i.tripId === tripId)).toBeUndefined();
  });

  it('RBAC: um DRIVER nao acessa o painel administrativo de monitoramento (403)', async () => {
    const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Mon10');
    const { driverAuth } = await setupDriverWithTrip(adminAuth, tenantId);

    await request(app.getHttpServer())
      .get('/api/v1/trips/operations/active')
      .set('Authorization', driverAuth)
      .expect(403);
  });

  // Fase 105 -- Torre de Controle: enriquecimento do MESMO endpoint com
  // deliverySummary/openOccurrencesCount/criticalOpenOccurrencesCount/
  // isDelayed. Reaproveita a mesma infraestrutura de setup desta suite
  // (nenhum mecanismo de teste novo); os endpoints de paradas/ocorrencias ja
  // tem cobertura funcional propria em trip-delivery-stops.e2e-spec.ts e
  // trip-occurrences-shifts-timeline.e2e-spec.ts -- aqui so se testa se o
  // painel agregado SURFACE corretamente o que ja existe no banco.
  describe('Fase 105 -- Torre de Controle (deliverySummary/ocorrencias/atraso)', () => {
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

    async function createOccurrence(
      auth: string,
      tripId: string,
      severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    ) {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/occurrences`)
        .set('Authorization', auth)
        .send({
          type: 'BREAKDOWN',
          severity,
          description: `Ocorrencia ${severity}`,
          occurredAt: new Date().toISOString(),
        })
        .expect(201);
      return res.body.data.id as string;
    }

    it('deliverySummary reflete a contagem por status das paradas planejadas (pending/in_progress/completed/failed/cancelled)', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Mon11');
      const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId);
      // Paradas criadas ANTES da partida (mesma trava de planejamento ja
      // testada em trip-delivery-stops.e2e-spec.ts).
      const pendingStop = await createDeliveryStop(adminAuth, tripId);
      const inProgressStop = await createDeliveryStop(adminAuth, tripId);
      const completedStop = await createDeliveryStop(adminAuth, tripId);
      const failedStop = await createDeliveryStop(adminAuth, tripId);
      const cancelledStop = await createDeliveryStop(adminAuth, tripId);

      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .expect(201);

      await setDeliveryStopStatus(adminAuth, tripId, inProgressStop, 'IN_PROGRESS');
      await setDeliveryStopStatus(adminAuth, tripId, completedStop, 'COMPLETED');
      await setDeliveryStopStatus(adminAuth, tripId, failedStop, 'FAILED');
      await setDeliveryStopStatus(adminAuth, tripId, cancelledStop, 'CANCELLED');
      void pendingStop;

      const res = await getActiveOperations(adminAuth);
      const item = res.body.data.items.find((i: { tripId: string }) => i.tripId === tripId);
      expect(item.deliverySummary).toEqual({
        totalCount: 5,
        pendingCount: 1,
        inProgressCount: 1,
        completedCount: 1,
        failedCount: 1,
        cancelledCount: 1,
      });
    });

    it('viagem sem nenhuma parada planejada retorna deliverySummary zerado (nunca omitido/undefined)', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Mon12');
      const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId);
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .expect(201);

      const res = await getActiveOperations(adminAuth);
      const item = res.body.data.items.find((i: { tripId: string }) => i.tripId === tripId);
      expect(item.deliverySummary).toEqual({
        totalCount: 0,
        pendingCount: 0,
        inProgressCount: 0,
        completedCount: 0,
        failedCount: 0,
        cancelledCount: 0,
      });
    });

    it('openOccurrencesCount/criticalOpenOccurrencesCount contam so ocorrencias EM ABERTO; resolvida/cancelada sao excluidas', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Mon13');
      const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId);
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .expect(201);

      await createOccurrence(adminAuth, tripId, 'LOW');
      const criticalId = await createOccurrence(adminAuth, tripId, 'CRITICAL');
      const resolvedId = await createOccurrence(adminAuth, tripId, 'CRITICAL');
      const cancelledId = await createOccurrence(adminAuth, tripId, 'HIGH');
      void criticalId;
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/occurrences/${resolvedId}/resolve`)
        .set('Authorization', adminAuth)
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/occurrences/${cancelledId}/cancel`)
        .set('Authorization', adminAuth)
        .expect(200);

      const res = await getActiveOperations(adminAuth);
      const item = res.body.data.items.find((i: { tripId: string }) => i.tripId === tripId);
      // Em aberto: 1 LOW + 1 CRITICAL = 2 (resolvida e cancelada excluidas).
      expect(item.openOccurrencesCount).toBe(2);
      expect(item.criticalOpenOccurrencesCount).toBe(1);
    });

    it('isDelayed=true quando plannedArrival ja passou e a viagem ainda nao terminou', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Mon14');
      const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId);
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .expect(201);
      await prisma.trip.update({
        where: { id: tripId },
        data: { plannedArrival: new Date(Date.now() - 60_000) },
      });

      const res = await getActiveOperations(adminAuth);
      const item = res.body.data.items.find((i: { tripId: string }) => i.tripId === tripId);
      expect(item.isDelayed).toBe(true);
      expect(item.plannedArrival).toBeTruthy();
    });

    it('isDelayed=false quando plannedArrival ainda esta no futuro', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Mon15');
      const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId);
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .expect(201);

      const res = await getActiveOperations(adminAuth);
      const item = res.body.data.items.find((i: { tripId: string }) => i.tripId === tripId);
      expect(item.isDelayed).toBe(false);
    });

    it('isDelayed=false quando plannedArrival e null (nunca inventa atraso sem dado)', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Mon16');
      const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId);
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .expect(201);
      await prisma.trip.update({ where: { id: tripId }, data: { plannedArrival: null } });

      const res = await getActiveOperations(adminAuth);
      const item = res.body.data.items.find((i: { tripId: string }) => i.tripId === tripId);
      expect(item.isDelayed).toBe(false);
      expect(item.plannedArrival).toBeNull();
    });

    it('isolamento multi-tenant: deliverySummary/ocorrencias de outro tenant nunca vazam', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('Mon17A');
      const tenantB = await createTenantAndLoginAsAdmin('Mon17B');
      const { driverAuth: driverAuthA, tripId: tripIdA } = await setupDriverWithTrip(
        tenantA.adminAuth,
        tenantA.tenantId,
      );
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripIdA}/start`)
        .set('Authorization', driverAuthA)
        .expect(201);
      await createOccurrence(tenantA.adminAuth, tripIdA, 'CRITICAL');

      const { driverAuth: driverAuthB, tripId: tripIdB } = await setupDriverWithTrip(
        tenantB.adminAuth,
        tenantB.tenantId,
      );
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripIdB}/start`)
        .set('Authorization', driverAuthB)
        .expect(201);

      const res = await getActiveOperations(tenantB.adminAuth);
      const itemB = res.body.data.items.find((i: { tripId: string }) => i.tripId === tripIdB);
      expect(itemB.criticalOpenOccurrencesCount).toBe(0);
      expect(res.body.data.items.find((i: { tripId: string }) => i.tripId === tripIdA)).toBeUndefined();
    });
  });

  // Fase 111 -- Torre de Controle: checklist PRE_TRIP mais recente por
  // viagem (preTripChecklistStatus/preTripChecklistHasCriticalNonConformity).
  // Mesma infraestrutura de setup desta suite; funcionalidade do checklist em
  // si ja coberta em checklists.e2e-spec.ts -- aqui so se testa se o painel
  // agregado SURFACE corretamente o que ja existe no banco.
  describe('Fase 111 -- Torre de Controle (checklist pre-viagem)', () => {
    async function createPublishedPreTripTemplate(auth: string) {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/checklists/templates')
        .set('Authorization', auth)
        .send({
          name: `Pre-Viagem ${randomUUID()}`,
          type: 'PRE_TRIP',
          sections: [{ title: 'SEGURANCA', order: 1, items: [{ code: 'freio', label: 'Freio OK?', type: 'BOOLEAN', order: 1, required: true, critical: true }] }],
        })
        .expect(201);
      const templateId = createRes.body.data.id as string;
      await request(app.getHttpServer()).post(`/api/v1/checklists/templates/${templateId}/publish`).set('Authorization', auth).expect(200);
      return { templateId, itemId: createRes.body.data.sections[0].items[0].id as string };
    }

    it('sem nenhum checklist iniciado: preTripChecklistStatus null, hasCriticalNonConformity false', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Mon18');
      const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId);
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .expect(201);

      const res = await getActiveOperations(adminAuth);
      const item = res.body.data.items.find((i: { tripId: string }) => i.tripId === tripId);
      expect(item.preTripChecklistStatus).toBeNull();
      expect(item.preTripChecklistHasCriticalNonConformity).toBe(false);
    });

    it('checklist COMPLETED com item critico respondido NAO: preTripChecklistHasCriticalNonConformity true', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Mon19');
      const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId);
      const { templateId, itemId } = await createPublishedPreTripTemplate(adminAuth);

      const execRes = await request(app.getHttpServer())
        .post('/api/v1/driver/checklists')
        .set('Authorization', driverAuth)
        .send({ deviceEventId: randomUUID(), templateId, tripId })
        .expect(201);
      const executionId = execRes.body.data.id as string;
      await request(app.getHttpServer())
        .post(`/api/v1/driver/checklists/${executionId}/answers`)
        .set('Authorization', driverAuth)
        .send({ answers: [{ itemId, booleanValue: false }] })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/api/v1/driver/checklists/${executionId}/complete`)
        .set('Authorization', driverAuth)
        .expect(200);

      const res = await getActiveOperations(adminAuth);
      const item = res.body.data.items.find((i: { tripId: string }) => i.tripId === tripId);
      expect(item.preTripChecklistStatus).toBe('COMPLETED');
      expect(item.preTripChecklistHasCriticalNonConformity).toBe(true);
    });

    it('checklist COMPLETED sem nao-conformidade critica: preTripChecklistHasCriticalNonConformity false', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Mon20');
      const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId);
      const { templateId, itemId } = await createPublishedPreTripTemplate(adminAuth);

      const execRes = await request(app.getHttpServer())
        .post('/api/v1/driver/checklists')
        .set('Authorization', driverAuth)
        .send({ deviceEventId: randomUUID(), templateId, tripId })
        .expect(201);
      const executionId = execRes.body.data.id as string;
      await request(app.getHttpServer())
        .post(`/api/v1/driver/checklists/${executionId}/answers`)
        .set('Authorization', driverAuth)
        .send({ answers: [{ itemId, booleanValue: true }] })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/api/v1/driver/checklists/${executionId}/complete`)
        .set('Authorization', driverAuth)
        .expect(200);

      const res = await getActiveOperations(adminAuth);
      const item = res.body.data.items.find((i: { tripId: string }) => i.tripId === tripId);
      expect(item.preTripChecklistStatus).toBe('COMPLETED');
      expect(item.preTripChecklistHasCriticalNonConformity).toBe(false);
    });

    it('checklist iniciado mas nao concluido: preTripChecklistStatus IN_PROGRESS', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Mon21');
      const { driverAuth, tripId } = await setupDriverWithTrip(adminAuth, tenantId);
      const { templateId } = await createPublishedPreTripTemplate(adminAuth);

      await request(app.getHttpServer())
        .post('/api/v1/driver/checklists')
        .set('Authorization', driverAuth)
        .send({ deviceEventId: randomUUID(), templateId, tripId })
        .expect(201);

      const res = await getActiveOperations(adminAuth);
      const item = res.body.data.items.find((i: { tripId: string }) => i.tripId === tripId);
      expect(item.preTripChecklistStatus).toBe('IN_PROGRESS');
      expect(item.preTripChecklistHasCriticalNonConformity).toBe(false);
    });
  });

  describe('Fase 114 -- Torre de Controle (prioridade/manutencao)', () => {
    async function createPlannedTrip(auth: string, vehicleId: string, driverId: string, priority?: string) {
      const compositionId = await createComposition(auth, vehicleId, 9);
      const originId = await createLocation(auth, `Origem ${randomUUID()}`);
      const destinationId = await createLocation(auth, `Destino ${randomUUID()}`);
      const res = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send({
          driverId,
          compositionId,
          originLocationId: originId,
          destinationLocationId: destinationId,
          plannedDeparture: '2026-09-01T08:00:00.000Z',
          plannedArrival: '2026-09-02T18:00:00.000Z',
          ...(priority ? { priority } : {}),
        })
        .expect(201);
      return res.body.data.id as string;
    }

    async function createCompletedServiceAtOdometer(
      auth: string,
      vehicleId: string,
      lastServiceOdometerKm: number,
      intervalKm: number,
      alertBeforeKm: number,
    ): Promise<string> {
      const planRes = await request(app.getHttpServer())
        .post('/api/v1/maintenance/plans')
        .set('Authorization', auth)
        .send({ vehicleId, name: 'Troca de óleo', component: 'ENGINE_OIL', intervalKm, alertBeforeKm })
        .expect(201);
      const planId = planRes.body.data.id as string;

      const maintenanceRes = await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', auth)
        .send({ vehicleId, type: 'PREVENTIVE', maintenancePlanId: planId, odometerKm: lastServiceOdometerKm, laborCost: 100 })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/maintenances/${maintenanceRes.body.data.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'COMPLETED', completedAt: new Date().toISOString() })
        .expect(200);
      return planId;
    }

    it('priority reflete Trip.priority; NORMAL quando nao informada na criacao', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Mon21');
      const vehicleId = await createVehicle(adminAuth);
      const driverId = await createDriver(adminAuth);
      const urgentTripId = await createPlannedTrip(adminAuth, vehicleId, driverId, 'URGENT');

      const res = await getActiveOperations(adminAuth);
      const item = res.body.data.items.find((i: { tripId: string }) => i.tripId === urgentTripId);
      expect(item.priority).toBe('URGENT');
    });

    it('viagem sem veiculo com nenhum plano de manutencao ativo: maintenanceStatus UNKNOWN', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Mon22');
      const vehicleId = await createVehicle(adminAuth);
      const driverId = await createDriver(adminAuth);
      const tripId = await createPlannedTrip(adminAuth, vehicleId, driverId);

      const res = await getActiveOperations(adminAuth);
      const item = res.body.data.items.find((i: { tripId: string }) => i.tripId === tripId);
      expect(item.maintenanceStatus).toBe('UNKNOWN');
    });

    it('plano de manutencao VENCIDO por km: maintenanceStatus OVERDUE (mesma evaluateMaintenancePlan do dashboard de frota)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Mon23');
      const vehicleId = await createVehicle(adminAuth);
      const driverId = await createDriver(adminAuth);
      await createCompletedServiceAtOdometer(adminAuth, vehicleId, 90000, 10000, 1000);
      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleId}`)
        .set('Authorization', adminAuth)
        .send({ odometerKm: 100500 })
        .expect(200);
      const tripId = await createPlannedTrip(adminAuth, vehicleId, driverId);

      const res = await getActiveOperations(adminAuth);
      const item = res.body.data.items.find((i: { tripId: string }) => i.tripId === tripId);
      expect(item.maintenanceStatus).toBe('OVERDUE');
    });

    it('plano de manutencao PROXIMO do vencimento por km: maintenanceStatus DUE_SOON', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Mon24');
      const vehicleId = await createVehicle(adminAuth);
      const driverId = await createDriver(adminAuth);
      await createCompletedServiceAtOdometer(adminAuth, vehicleId, 90000, 10000, 1000);
      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleId}`)
        .set('Authorization', adminAuth)
        .send({ odometerKm: 99500 })
        .expect(200);
      const tripId = await createPlannedTrip(adminAuth, vehicleId, driverId);

      const res = await getActiveOperations(adminAuth);
      const item = res.body.data.items.find((i: { tripId: string }) => i.tripId === tripId);
      expect(item.maintenanceStatus).toBe('DUE_SOON');
    });

    it('plano de manutencao em dia: maintenanceStatus OK', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Mon25');
      const vehicleId = await createVehicle(adminAuth);
      const driverId = await createDriver(adminAuth);
      await createCompletedServiceAtOdometer(adminAuth, vehicleId, 90000, 10000, 1000);
      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleId}`)
        .set('Authorization', adminAuth)
        .send({ odometerKm: 91000 })
        .expect(200);
      const tripId = await createPlannedTrip(adminAuth, vehicleId, driverId);

      const res = await getActiveOperations(adminAuth);
      const item = res.body.data.items.find((i: { tripId: string }) => i.tripId === tripId);
      expect(item.maintenanceStatus).toBe('OK');
    });
  });
});
