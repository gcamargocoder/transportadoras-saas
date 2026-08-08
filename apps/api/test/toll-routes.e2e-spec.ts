import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Toll Routes + Conciliacao (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdTenantIds: string[] = [];
  let superAdminAuth: string;

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

    const superAdmin = await createTenantWithSuperAdmin('TollRoutesGlobalAdmin');
    superAdminAuth = `Bearer ${superAdmin.superAdminAccessToken}`;
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
      slug: `tr-${label.toLowerCase()}-${unique}`,
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

  async function createTenantWithSuperAdmin(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    const payload = {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `tr-${label.toLowerCase()}-${unique}`,
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

    return { tenantId, superAdminAccessToken: loginRes.body.data.accessToken as string };
  }

  async function createTollPlaza(overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/toll-plazas')
      .set('Authorization', superAdminAuth)
      .send({
        name: `Praca ${randomUUID()}`,
        operator: 'CCR ViaOeste',
        highway: 'SP-310',
        pricePerAxle: 15,
        ...overrides,
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createRoute(auth: string, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/toll-routes')
      .set('Authorization', auth)
      .send({
        name: `Rota ${randomUUID()}`,
        originLabel: 'Sao Jose do Rio Preto',
        destinationLabel: 'Sao Paulo',
        ...overrides,
      })
      .expect(201);
    return res.body.data.id as string;
  }

  function replaceStops(auth: string, routeId: string, plazaIds: string[]) {
    return request(app.getHttpServer())
      .put(`/api/v1/toll-routes/${routeId}/stops`)
      .set('Authorization', auth)
      .send({ stops: plazaIds.map((tollPlazaId) => ({ tollPlazaId })) });
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

  async function createComposition(auth: string, vehicleId: string, totalAxles?: number) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/trip-compositions')
      .set('Authorization', auth)
      .send({
        vehicleId,
        trailers: [],
        ...(totalAxles
          ? { axleConfiguration: { totalAxles, billableCategory: `${totalAxles} eixos` } }
          : {}),
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

  async function createVehicleTag(auth: string, vehicleId: string, tagProviderId: string) {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/vehicles/${vehicleId}/tags`)
      .set('Authorization', auth)
      .send({
        tagProviderId,
        tagNumber: String(Math.floor(1_000_000_000 + Math.random() * 8_999_999_999)),
        activatedAt: '2026-01-01',
      })
      .expect(201);
    return res.body.data.id as string;
  }

  // Monta uma viagem completa (motorista, veiculo com tag ativa, composicao
  // com eixos), opcionalmente ja vinculada a uma rota de pedagio.
  async function setupTrip(
    auth: string,
    options: { tollRouteId?: string; totalAxles?: number } = {},
  ) {
    const vehicleId = await createVehicle(auth);
    const driverId = await createDriver(auth);
    const compositionId = await createComposition(auth, vehicleId, options.totalAxles ?? 4);
    const originId = await createLocation(auth, `Origem ${randomUUID()}`);
    const destinationId = await createLocation(auth, `Destino ${randomUUID()}`);
    const tagProviderId = await getSemParar(auth);
    await createVehicleTag(auth, vehicleId, tagProviderId);

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
        ...(options.tollRouteId ? { tollRouteId: options.tollRouteId } : {}),
      })
      .expect(201);

    return { vehicleId, driverId, compositionId, tripId: tripRes.body.data.id as string };
  }

  async function registerToll(
    auth: string,
    tripId: string,
    tollPlazaId: string,
    chargedAmount: number,
    chargedAt = '2026-09-01T10:00:00.000Z',
  ) {
    return request(app.getHttpServer())
      .post('/api/v1/toll-transactions')
      .set('Authorization', auth)
      .send({ tripId, tollPlazaId, axleCount: 4, chargedAmount, chargedAt })
      .expect(201);
  }

  describe('CRUD de rotas', () => {
    it('cria, consulta, atualiza, ativa/desativa e exclui uma rota', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('RouteCrud');
      const auth = `Bearer ${adminAccessToken}`;

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/toll-routes')
        .set('Authorization', auth)
        .send({ name: 'Rota Teste', originLabel: 'Origem X', destinationLabel: 'Destino Y' })
        .expect(201);
      const routeId = createRes.body.data.id;
      expect(createRes.body.data.isActive).toBe(true);
      expect(createRes.body.data.stops).toEqual([]);

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/toll-routes/${routeId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(getRes.body.data.name).toBe('Rota Teste');

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/toll-routes/${routeId}`)
        .set('Authorization', auth)
        .send({ name: 'Rota Teste Renomeada' })
        .expect(200);
      expect(updateRes.body.data.name).toBe('Rota Teste Renomeada');

      const deactivateRes = await request(app.getHttpServer())
        .patch(`/api/v1/toll-routes/${routeId}/status`)
        .set('Authorization', auth)
        .send({ isActive: false })
        .expect(200);
      expect(deactivateRes.body.data.isActive).toBe(false);

      await request(app.getHttpServer())
        .delete(`/api/v1/toll-routes/${routeId}`)
        .set('Authorization', auth)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/toll-routes/${routeId}`)
        .set('Authorization', auth)
        .expect(404);
    });

    it('nunca duplica uma mesma praca na mesma rota (409)', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('RouteNoDup');
      const auth = `Bearer ${adminAccessToken}`;
      const routeId = await createRoute(auth);
      const plazaId = await createTollPlaza();

      await replaceStops(auth, routeId, [plazaId, plazaId]).expect(409);
    });

    it('substitui a lista de paradas na ordem enviada e permite reordenar', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('RouteOrder');
      const auth = `Bearer ${adminAccessToken}`;
      const routeId = await createRoute(auth);
      const plazaA = await createTollPlaza({ name: 'Praca A' });
      const plazaB = await createTollPlaza({ name: 'Praca B' });
      const plazaC = await createTollPlaza({ name: 'Praca C' });

      const firstRes = await replaceStops(auth, routeId, [plazaA, plazaB, plazaC]).expect(200);
      expect(firstRes.body.data.stops.map((s: { tollPlazaId: string }) => s.tollPlazaId)).toEqual([
        plazaA,
        plazaB,
        plazaC,
      ]);
      expect(firstRes.body.data.stops.map((s: { sequence: number }) => s.sequence)).toEqual([
        1, 2, 3,
      ]);

      // reordena (C, A, B) e remove nenhuma -- o array enviado e a nova ordem inteira.
      const reorderedRes = await replaceStops(auth, routeId, [plazaC, plazaA, plazaB]).expect(200);
      expect(
        reorderedRes.body.data.stops.map((s: { tollPlazaId: string }) => s.tollPlazaId),
      ).toEqual([plazaC, plazaA, plazaB]);

      // remove uma praca (so A e B ficam).
      const removedRes = await replaceStops(auth, routeId, [plazaA, plazaB]).expect(200);
      expect(removedRes.body.data.stops).toHaveLength(2);
    });

    it('bloqueia vincular rota INATIVA a uma nova viagem (409)', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('RouteInactive');
      const auth = `Bearer ${adminAccessToken}`;
      const routeId = await createRoute(auth);
      await request(app.getHttpServer())
        .patch(`/api/v1/toll-routes/${routeId}/status`)
        .set('Authorization', auth)
        .send({ isActive: false })
        .expect(200);

      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);
      const compositionId = await createComposition(auth, vehicleId);
      const originId = await createLocation(auth, `Origem ${randomUUID()}`);
      const destinationId = await createLocation(auth, `Destino ${randomUUID()}`);

      await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send({
          driverId,
          compositionId,
          originLocationId: originId,
          destinationLocationId: destinationId,
          plannedDeparture: '2026-09-01T08:00:00.000Z',
          plannedArrival: '2026-09-02T18:00:00.000Z',
          tollRouteId: routeId,
        })
        .expect(409);
    });

    it('bloqueia exclusao de rota com viagens vinculadas (409)', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('RouteInUse');
      const auth = `Bearer ${adminAccessToken}`;
      const routeId = await createRoute(auth);
      await setupTrip(auth, { tollRouteId: routeId });

      await request(app.getHttpServer())
        .delete(`/api/v1/toll-routes/${routeId}`)
        .set('Authorization', auth)
        .expect(409);
    });
  });

  describe('vinculo rota <-> viagem', () => {
    it('permite pesquisar, selecionar e limpar (null) a rota de uma viagem', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('TripRouteLink');
      const auth = `Bearer ${adminAccessToken}`;
      const routeId = await createRoute(auth);
      const { tripId } = await setupTrip(auth, { tollRouteId: routeId });

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(getRes.body.data.tollRouteId).toBe(routeId);

      const clearRes = await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}`)
        .set('Authorization', auth)
        .send({ tollRouteId: null })
        .expect(200);
      expect(clearRes.body.data.tollRouteId).toBeNull();
      expect(clearRes.body.data.tollRouteName).toBeNull();
    });

    it('viagem sem rota vinculada continua funcionando normalmente', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('TripNoRoute');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId } = await setupTrip(auth);

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(getRes.body.data.tollRouteId).toBeNull();
    });
  });

  describe('GET /trips/:id/toll-reconciliation', () => {
    it('retorna hasRoute=false quando a viagem nao tem rota vinculada', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('ReconNoRoute');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId } = await setupTrip(auth);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/toll-reconciliation`)
        .set('Authorization', auth)
        .expect(200);

      expect(res.body.data.hasRoute).toBe(false);
      expect(res.body.data.stops).toEqual([]);
    });

    it('fluxo completo: cria rota -> adiciona pracas -> cria viagem -> registra pedagios -> concilia', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('ReconFull');
      const auth = `Bearer ${adminAccessToken}`;

      const plazaA = await createTollPlaza({ name: 'Praca A', pricePerAxle: 15 });
      const plazaB = await createTollPlaza({ name: 'Praca B', pricePerAxle: 15 });
      const plazaC = await createTollPlaza({ name: 'Praca C', pricePerAxle: 15 });
      const plazaD = await createTollPlaza({ name: 'Praca D', pricePerAxle: 15 });
      const plazaX = await createTollPlaza({ name: 'Praca X (fora da rota)', pricePerAxle: 15 });

      const routeId = await createRoute(auth, {
        name: 'Sao Jose do Rio Preto -> Sao Paulo',
        originLabel: 'Sao Jose do Rio Preto',
        destinationLabel: 'Sao Paulo',
      });
      await replaceStops(auth, routeId, [plazaA, plazaB, plazaC, plazaD]).expect(200);

      const { tripId } = await setupTrip(auth, { tollRouteId: routeId, totalAxles: 4 });

      // A: correto (4 x 15 = 60). B: acima do esperado (+15). C: nao
      // registrado (fica NOT_REGISTERED). X: pedagio nao previsto pela rota.
      await registerToll(auth, tripId, plazaA, 60);
      await registerToll(auth, tripId, plazaB, 75);
      await registerToll(auth, tripId, plazaD, 60);
      await registerToll(auth, tripId, plazaX, 20);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/toll-reconciliation`)
        .set('Authorization', auth)
        .expect(200);

      const recon = res.body.data;
      expect(recon.hasRoute).toBe(true);
      expect(recon.tollRouteId).toBe(routeId);
      expect(recon.expectedStopsCount).toBe(4);
      expect(recon.registeredStopsCount).toBe(3);

      const byPlaza = Object.fromEntries(
        recon.stops.map((s: { tollPlazaId: string; verdict: string }) => [
          s.tollPlazaId,
          s.verdict,
        ]),
      );
      expect(byPlaza[plazaA]).toBe('CORRECT');
      expect(byPlaza[plazaB]).toBe('OVERCHARGE');
      expect(byPlaza[plazaC]).toBe('NOT_REGISTERED');
      expect(byPlaza[plazaD]).toBe('CORRECT');

      expect(recon.unplannedTransactions).toHaveLength(1);
      expect(recon.unplannedTransactions[0].tollPlazaId).toBe(plazaX);
      expect(recon.unplannedTotalAmount).toBe(20);
      expect(recon.isFullyReconciled).toBe(false);
    });

    it('viagem nao encontrada retorna 404', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('ReconMissing');
      const auth = `Bearer ${adminAccessToken}`;
      await request(app.getHttpServer())
        .get(`/api/v1/trips/${randomUUID()}/toll-reconciliation`)
        .set('Authorization', auth)
        .expect(404);
    });
  });

  describe('GET /toll-routes/dashboard', () => {
    it('agrega conciliacao de todas as viagens do tenant com rota vinculada', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('ReconDashboard');
      const auth = `Bearer ${adminAccessToken}`;

      const plazaA = await createTollPlaza({ pricePerAxle: 15 });
      const plazaB = await createTollPlaza({ pricePerAxle: 15 });
      const routeId = await createRoute(auth);
      await replaceStops(auth, routeId, [plazaA, plazaB]).expect(200);

      const tripWithRoute = await setupTrip(auth, { tollRouteId: routeId, totalAxles: 4 });
      await registerToll(auth, tripWithRoute.tripId, plazaA, 60);
      // plazaB fica sem registro -- NOT_REGISTERED.

      const tripWithoutRoute = await setupTrip(auth);
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripWithoutRoute.tripId}`)
        .set('Authorization', auth)
        .send({ notes: 'viagem sem rota, nao deve entrar no dashboard de conciliacao' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/toll-routes/dashboard')
        .set('Authorization', auth)
        .expect(200);

      const dashboard = res.body.data;
      expect(dashboard.totalTripsWithRoute).toBe(1);
      expect(dashboard.reconciledTripsCount).toBe(0);
      expect(dashboard.nonReconciledTripsCount).toBe(1);
      expect(dashboard.totalExpectedStops).toBe(2);
      expect(dashboard.totalRegisteredStops).toBe(1);
      expect(dashboard.totalNotRegisteredStops).toBe(1);
      expect(dashboard.totalUnplannedTransactions).toBe(0);
    });

    it('nunca mistura dados de tenants diferentes', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('ReconDashIsolA');
      const tenantB = await createTenantAndLoginAsAdmin('ReconDashIsolB');
      const authA = `Bearer ${tenantA.adminAccessToken}`;
      const authB = `Bearer ${tenantB.adminAccessToken}`;

      const plazaA = await createTollPlaza({ pricePerAxle: 15 });
      const routeIdA = await createRoute(authA);
      await replaceStops(authA, routeIdA, [plazaA]).expect(200);
      await setupTrip(authA, { tollRouteId: routeIdA, totalAxles: 4 });

      const dashboardB = await request(app.getHttpServer())
        .get('/api/v1/toll-routes/dashboard')
        .set('Authorization', authB)
        .expect(200);
      expect(dashboardB.body.data.totalTripsWithRoute).toBe(0);
    });
  });

  describe('isolamento multi-tenant', () => {
    it('nunca permite acesso cruzado entre tenants (rotas)', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolRouteA');
      const tenantB = await createTenantAndLoginAsAdmin('IsolRouteB');
      const authA = `Bearer ${tenantA.adminAccessToken}`;
      const authB = `Bearer ${tenantB.adminAccessToken}`;

      const routeId = await createRoute(authA);

      await request(app.getHttpServer())
        .get(`/api/v1/toll-routes/${routeId}`)
        .set('Authorization', authB)
        .expect(404);

      const listInB = await request(app.getHttpServer())
        .get('/api/v1/toll-routes')
        .set('Authorization', authB)
        .expect(200);
      expect(listInB.body.data.items.find((r: { id: string }) => r.id === routeId)).toBeUndefined();
    });

    it('nunca permite associar a rota do tenant B a uma viagem do tenant A', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolTripRouteA');
      const tenantB = await createTenantAndLoginAsAdmin('IsolTripRouteB');
      const authA = `Bearer ${tenantA.adminAccessToken}`;
      const authB = `Bearer ${tenantB.adminAccessToken}`;

      const routeIdB = await createRoute(authB);

      const vehicleId = await createVehicle(authA);
      const driverId = await createDriver(authA);
      const compositionId = await createComposition(authA, vehicleId);
      const originId = await createLocation(authA, `Origem ${randomUUID()}`);
      const destinationId = await createLocation(authA, `Destino ${randomUUID()}`);

      await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', authA)
        .send({
          driverId,
          compositionId,
          originLocationId: originId,
          destinationLocationId: destinationId,
          plannedDeparture: '2026-09-01T08:00:00.000Z',
          plannedArrival: '2026-09-02T18:00:00.000Z',
          tollRouteId: routeIdB,
        })
        .expect(404);
    });

    it('conciliacao de uma viagem nunca e visivel para outro tenant', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolReconA');
      const tenantB = await createTenantAndLoginAsAdmin('IsolReconB');
      const authA = `Bearer ${tenantA.adminAccessToken}`;
      const authB = `Bearer ${tenantB.adminAccessToken}`;
      const { tripId } = await setupTrip(authA);

      await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/toll-reconciliation`)
        .set('Authorization', authB)
        .expect(404);
    });
  });

  describe('permissoes por perfil (RBAC)', () => {
    it('AUDITOR le rotas mas nao pode criar (403)', async () => {
      const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('RolesAuditorRoute');
      const auditorEmail = `auditor-route-${randomUUID()}@teste.com`;
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
        .get('/api/v1/toll-routes')
        .set('Authorization', auditorAuth)
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/toll-routes')
        .set('Authorization', auditorAuth)
        .send({ name: 'Rota Proibida', originLabel: 'X', destinationLabel: 'Y' })
        .expect(403);
    });
  });
});
