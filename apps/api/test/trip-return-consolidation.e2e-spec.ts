import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase E -- GET /trips/:id/return-consolidation: consolidacao DERIVADA e
// somente-leitura da OPERACAO ida + retorno, usando EXCLUSIVAMENTE
// Trip.previousTripId (vinculo explicito da Fase D). Nunca persiste, nunca
// infere ida/retorno, nunca altera loadStatus/maquina de estados/
// VehicleIdlePeriod. Financeiro por perna = GET /trips/:id/financial-result
// (mesma regra); agregados so somam valores existentes.
describe('Consolidacao ida -> retorno (Fase E, e2e)', () => {
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

  const randomCnpj = () => Array.from({ length: 14 }, () => Math.floor(Math.random() * 10)).join('');
  const randomPlate = () =>
    `${Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('')}${Math.floor(1000 + Math.random() * 9000)}`;
  function randomValidCpf(): string {
    const d = (nums: number[], f: number) => {
      let t = 0;
      let k = f;
      for (const n of nums) {
        t += n * k;
        k -= 1;
      }
      const r = t % 11;
      return r < 2 ? 0 : 11 - r;
    };
    const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 9));
    const d1 = d(base, 10);
    return [...base, d1, d([...base, d1], 11)].join('');
  }

  async function createTenantAndLoginAsAdmin(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    const payload = {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `trc-${label.toLowerCase()}-${unique}`,
      admin: { name: `Admin ${label}`, email: `admin-${label.toLowerCase()}-${unique}@teste.com`, password: 'SenhaForte123!' },
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
    const email = `u-${role.toLowerCase()}-${randomUUID()}@teste.com`;
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', adminAuth)
      .send({ name: `U ${role}`, email, password: 'SenhaForte123!', role })
      .expect(201);
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email, password: 'SenhaForte123!' })
      .expect(200);
    return `Bearer ${loginRes.body.data.accessToken}`;
  }

  const createVehicle = async (auth: string) =>
    (
      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH', type: 'TRACTOR_UNIT' })
        .expect(201)
    ).body.data.id as string;

  const createDriver = async (auth: string) =>
    (
      await request(app.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', auth)
        .send({
          name: 'Jose',
          cpf: randomValidCpf(),
          cnhNumber: String(Math.floor(1e10 + Math.random() * 8e10)),
          cnhCategory: 'AE',
          cnhExpiresAt: '2028-06-30',
        })
        .expect(201)
    ).body.data.id as string;

  const createLocation = async (auth: string, name: string) =>
    (
      await request(app.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', auth)
        .send({ name, type: 'DISTRIBUTION_CENTER' })
        .expect(201)
    ).body.data.id as string;

  const createComposition = async (auth: string, vehicleId: string) =>
    (
      await request(app.getHttpServer())
        .post('/api/v1/trip-compositions')
        .set('Authorization', auth)
        .send({ vehicleId, trailers: [] })
        .expect(201)
    ).body.data.id as string;

  // Cria uma viagem (com previousTripId/plannedLoadStatus opcionais) +
  // motorista com login proprio (unica forma real de setar Trip.loadStatus).
  async function createLeg(
    tenantId: string,
    adminAuth: string,
    opts: { previousTripId?: string; plannedLoadStatus?: 'LOADED' | 'EMPTY' } = {},
  ) {
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
        ...(opts.previousTripId ? { previousTripId: opts.previousTripId } : {}),
        ...(opts.plannedLoadStatus ? { plannedLoadStatus: opts.plannedLoadStatus } : {}),
      })
      .expect(201);

    const unique = randomUUID().replace(/-/g, '').slice(0, 10);
    const email = `driver-${unique}@teste.com`;
    const userRes = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', adminAuth)
      .send({ name: 'Motorista App', email, password: 'SenhaForte123!', role: 'DRIVER' })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/drivers/${driverId}/user-link`)
      .set('Authorization', adminAuth)
      .send({ userAccountId: userRes.body.data.id })
      .expect(200);
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email, password: 'SenhaForte123!' })
      .expect(200);

    return { tripId: tripRes.body.data.id as string, driverId, driverAuth: `Bearer ${loginRes.body.data.accessToken as string}` };
  }

  // Roda a perna de verdade pela maquina de estados: largada (loadStatus
  // REAL informado pelo motorista) -> conclusao com hodometro final (gera
  // TripMetrics.actualDistanceKm). Nunca seta loadStatus de outra forma.
  async function runLeg(
    adminAuth: string,
    driverAuth: string,
    tripId: string,
    opts: { odometerStart: number; odometerEnd: number; loadStatus?: 'LOADED' | 'EMPTY' },
  ) {
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/start`)
      .set('Authorization', driverAuth)
      .send({ odometerKm: opts.odometerStart, ...(opts.loadStatus ? { loadStatus: opts.loadStatus } : {}) })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}/status`)
      .set('Authorization', adminAuth)
      .send({ status: 'COMPLETED', finalOdometerKm: opts.odometerEnd })
      .expect(200);
  }

  async function addApprovedExpense(adminAuth: string, tripId: string, amount: number) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/trip-expenses')
      .set('Authorization', adminAuth)
      .send({ tripId, category: 'OTHER', description: 'Despesa', expenseDate: '2026-09-02T10:00:00.000Z', amount })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/trip-expenses/${res.body.data.id}/status`)
      .set('Authorization', adminAuth)
      .send({ status: 'APPROVED' })
      .expect(200);
  }

  const getConsolidation = (auth: string, tripId: string) =>
    request(app.getHttpServer()).get(`/api/v1/trips/${tripId}/return-consolidation`).set('Authorization', auth);

  // ==========================================================================
  it('ida SEM retorno: returnLegCount = 0, outbound presente, agregados = valores da propria ida', async () => {
    const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('NoReturn');
    const ida = await createLeg(tenantId, adminAuth);
    await runLeg(adminAuth, ida.driverAuth, ida.tripId, { odometerStart: 100000, odometerEnd: 100400, loadStatus: 'LOADED' });
    await addApprovedExpense(adminAuth, ida.tripId, 900);

    const res = await getConsolidation(adminAuth, ida.tripId).expect(200);
    expect(res.body.data).toMatchObject({
      outboundTripId: ida.tripId,
      legCount: 1,
      returnLegCount: 0,
      returns: [],
      totalCompletedDistanceKm: 400,
      totalCost: 900,
      totalContractedRevenue: null,
      consolidatedOperatingResult: null,
      revenueComplete: false,
      legsWithContractedRevenue: 0,
    });
    expect(res.body.data.outbound).toMatchObject({ tripId: ida.tripId, role: 'OUTBOUND', loadCondition: 'LOADED' });
    expect(res.body.data.outbound.financialResult.totalCost).toBe(900);
  });

  it('ida com um retorno EMPTY: legCount = 2, loadCondition do retorno = EMPTY, distancias/custos somados', async () => {
    const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('OneEmpty');
    const ida = await createLeg(tenantId, adminAuth);
    await runLeg(adminAuth, ida.driverAuth, ida.tripId, { odometerStart: 100000, odometerEnd: 100500, loadStatus: 'LOADED' });
    await addApprovedExpense(adminAuth, ida.tripId, 1000);

    const ret = await createLeg(tenantId, adminAuth, { previousTripId: ida.tripId });
    await runLeg(adminAuth, ret.driverAuth, ret.tripId, { odometerStart: 100500, odometerEnd: 100800, loadStatus: 'EMPTY' });
    await addApprovedExpense(adminAuth, ret.tripId, 300);

    const res = await getConsolidation(adminAuth, ida.tripId).expect(200);
    expect(res.body.data).toMatchObject({
      legCount: 2,
      returnLegCount: 1,
      totalCompletedDistanceKm: 800,
      totalCost: 1300,
    });
    expect(res.body.data.returns).toHaveLength(1);
    expect(res.body.data.returns[0]).toMatchObject({
      tripId: ret.tripId,
      role: 'RETURN',
      previousTripId: ida.tripId,
      loadCondition: 'EMPTY',
      loadStatus: 'EMPTY',
    });
    expect(res.body.data.returns[0].financialResult.totalCost).toBe(300);
  });

  it('ida com um retorno LOADED: loadCondition do retorno = LOADED', async () => {
    const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('OneLoaded');
    const ida = await createLeg(tenantId, adminAuth);
    await runLeg(adminAuth, ida.driverAuth, ida.tripId, { odometerStart: 100000, odometerEnd: 100200, loadStatus: 'LOADED' });
    const ret = await createLeg(tenantId, adminAuth, { previousTripId: ida.tripId });
    await runLeg(adminAuth, ret.driverAuth, ret.tripId, { odometerStart: 100200, odometerEnd: 100450, loadStatus: 'LOADED' });

    const res = await getConsolidation(adminAuth, ida.tripId).expect(200);
    expect(res.body.data.returns[0]).toMatchObject({ loadCondition: 'LOADED', loadStatus: 'LOADED' });
  });

  it('ida com MULTIPLOS retornos (modelo permite -- previousTripId nao e unique): returnLegCount = 2, tudo somado', async () => {
    const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('MultiReturn');
    const ida = await createLeg(tenantId, adminAuth);
    await runLeg(adminAuth, ida.driverAuth, ida.tripId, { odometerStart: 100000, odometerEnd: 100300, loadStatus: 'LOADED' });
    await addApprovedExpense(adminAuth, ida.tripId, 500);

    const r1 = await createLeg(tenantId, adminAuth, { previousTripId: ida.tripId });
    await runLeg(adminAuth, r1.driverAuth, r1.tripId, { odometerStart: 100300, odometerEnd: 100500, loadStatus: 'EMPTY' });
    await addApprovedExpense(adminAuth, r1.tripId, 200);

    const r2 = await createLeg(tenantId, adminAuth, { previousTripId: ida.tripId });
    await runLeg(adminAuth, r2.driverAuth, r2.tripId, { odometerStart: 100500, odometerEnd: 100700, loadStatus: 'LOADED' });
    await addApprovedExpense(adminAuth, r2.tripId, 250);

    const res = await getConsolidation(adminAuth, ida.tripId).expect(200);
    expect(res.body.data.legCount).toBe(3);
    expect(res.body.data.returnLegCount).toBe(2);
    expect(res.body.data.totalCompletedDistanceKm).toBe(700); // 300 + 200 + 200
    expect(res.body.data.totalCost).toBe(950); // 500 + 200 + 250
    expect(res.body.data.returns.map((r: { tripId: string }) => r.tripId).sort()).toEqual([r1.tripId, r2.tripId].sort());
  });

  it('retorno SEM previousTripId nunca entra na consolidacao (vinculo so explicito)', async () => {
    const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('NoLink');
    const ida = await createLeg(tenantId, adminAuth);
    await runLeg(adminAuth, ida.driverAuth, ida.tripId, { odometerStart: 100000, odometerEnd: 100100, loadStatus: 'LOADED' });

    // viagem "de volta" de fato, mesmo destino invertido, mesmo periodo --
    // MAS sem previousTripId: NUNCA inferida como retorno.
    const solta = await createLeg(tenantId, adminAuth);
    await runLeg(adminAuth, solta.driverAuth, solta.tripId, { odometerStart: 100100, odometerEnd: 100200, loadStatus: 'EMPTY' });

    const res = await getConsolidation(adminAuth, ida.tripId).expect(200);
    expect(res.body.data.returnLegCount).toBe(0);
    expect(res.body.data.returns).toHaveLength(0);
  });

  it('plannedLoadStatus diferente de loadStatus NAO altera loadCondition (derivada so do real)', async () => {
    const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('PlanVsReal');
    const ida = await createLeg(tenantId, adminAuth);
    await runLeg(adminAuth, ida.driverAuth, ida.tripId, { odometerStart: 100000, odometerEnd: 100100, loadStatus: 'LOADED' });

    // escritorio planejou retorno VAZIO, motorista saiu CARREGADO
    const ret = await createLeg(tenantId, adminAuth, { previousTripId: ida.tripId, plannedLoadStatus: 'EMPTY' });
    await runLeg(adminAuth, ret.driverAuth, ret.tripId, { odometerStart: 100100, odometerEnd: 100200, loadStatus: 'LOADED' });

    const res = await getConsolidation(adminAuth, ida.tripId).expect(200);
    expect(res.body.data.returns[0]).toMatchObject({
      plannedLoadStatus: 'EMPTY',
      loadStatus: 'LOADED',
      loadCondition: 'LOADED', // segue o REAL, nunca o planejado
    });
  });

  it('isolamento multi-tenant: tenant B nao consulta a consolidacao de uma viagem do tenant A (404)', async () => {
    const { tenantId: tenantA, adminAuth: authA } = await createTenantAndLoginAsAdmin('IsoA');
    const ida = await createLeg(tenantA, authA);
    const { adminAuth: authB } = await createTenantAndLoginAsAdmin('IsoB');
    await getConsolidation(authB, ida.tripId).expect(404);
  });

  it('RBAC: DRIVER recebe 403; papeis operacionais (OPERATOR) leem', async () => {
    const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Rbac');
    const ida = await createLeg(tenantId, adminAuth);
    const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
    const operatorAuth = await createUserWithRole(tenantId, adminAuth, 'OPERATOR');

    await getConsolidation(driverAuth, ida.tripId).expect(403);
    await getConsolidation(operatorAuth, ida.tripId).expect(200);
  });

  it('viagem inexistente -> 404', async () => {
    const { adminAuth } = await createTenantAndLoginAsAdmin('Missing');
    await getConsolidation(adminAuth, randomUUID()).expect(404);
  });

  it('valores financeiros/metricas continuam INDIVIDUAIS -- a consolidacao so agrega na leitura, nao altera nada', async () => {
    const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Individual');
    const ida = await createLeg(tenantId, adminAuth);
    await runLeg(adminAuth, ida.driverAuth, ida.tripId, { odometerStart: 100000, odometerEnd: 100500, loadStatus: 'LOADED' });
    await addApprovedExpense(adminAuth, ida.tripId, 1000);
    const ret = await createLeg(tenantId, adminAuth, { previousTripId: ida.tripId });
    await runLeg(adminAuth, ret.driverAuth, ret.tripId, { odometerStart: 100500, odometerEnd: 100800, loadStatus: 'EMPTY' });
    await addApprovedExpense(adminAuth, ret.tripId, 300);

    // financial-result individual ANTES da consolidacao
    const idaFinBefore = await request(app.getHttpServer())
      .get(`/api/v1/trips/${ida.tripId}/financial-result`)
      .set('Authorization', adminAuth)
      .expect(200);
    const retFinBefore = await request(app.getHttpServer())
      .get(`/api/v1/trips/${ret.tripId}/financial-result`)
      .set('Authorization', adminAuth)
      .expect(200);

    const cons = await getConsolidation(adminAuth, ida.tripId).expect(200);

    // financial-result individual DEPOIS -- inalterado
    const idaFinAfter = await request(app.getHttpServer())
      .get(`/api/v1/trips/${ida.tripId}/financial-result`)
      .set('Authorization', adminAuth)
      .expect(200);
    const retFinAfter = await request(app.getHttpServer())
      .get(`/api/v1/trips/${ret.tripId}/financial-result`)
      .set('Authorization', adminAuth)
      .expect(200);

    expect(idaFinAfter.body.data).toEqual(idaFinBefore.body.data);
    expect(retFinAfter.body.data).toEqual(retFinBefore.body.data);
    expect(idaFinBefore.body.data.totalCost).toBe(1000);
    expect(retFinBefore.body.data.totalCost).toBe(300);

    // consolidacao = SOMA exata das pernas individuais
    expect(cons.body.data.totalCost).toBe(
      idaFinBefore.body.data.totalCost + retFinBefore.body.data.totalCost,
    );
    expect(cons.body.data.outbound.financialResult).toEqual(idaFinAfter.body.data);
    expect(cons.body.data.returns[0].financialResult).toEqual(retFinAfter.body.data);

    // nada persistido: sem TripSettlement criado so por consultar
    const settlement = await prisma.tripSettlement.findFirst({ where: { tenantId, tripId: ida.tripId } });
    expect(settlement).toBeNull();
  });

  it('sem N+1: a contagem de queries e invariante ao tamanho do tenant e cresce so com o numero de RETORNOS vinculados', async () => {
    let queryCount = 0;
    // Mesmo padrao de trips.e2e-spec.ts: PrismaService estendido com um
    // contador de queries, injetado via overrideProvider.
    const basePrisma = new PrismaService();
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
    const countingApp = moduleRef.createNestApplication();
    countingApp.setGlobalPrefix('api');
    countingApp.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    countingApp.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await countingApp.init();

    const mk = {
      tenant: async (label: string) => {
        const unique = randomUUID().replace(/-/g, '').slice(0, 12);
        const payload = {
          name: `Transportadora ${label} ${unique}`,
          document: randomCnpj(),
          slug: `trcn-${label.toLowerCase()}-${unique}`,
          admin: {
            name: `Admin ${label}`,
            email: `admin-${label.toLowerCase()}-${unique}@teste.com`,
            password: 'SenhaForte123!',
          },
        };
        const r = await request(countingApp.getHttpServer()).post('/api/v1/tenants').send(payload).expect(201);
        const tenantId = r.body.data.id as string;
        createdTenantIds.push(tenantId);
        await basePrisma.userAccount.update({
          where: { tenantId_email: { tenantId, email: payload.admin.email } },
          data: { role: 'SUPER_ADMIN' },
        });
        const login = await request(countingApp.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ tenantId, email: payload.admin.email, password: 'SenhaForte123!' })
          .expect(200);
        return { tenantId, auth: `Bearer ${login.body.data.accessToken as string}` };
      },
      trip: async (auth: string, previousTripId?: string) => {
        const veh = await request(countingApp.getHttpServer())
          .post('/api/v1/vehicles')
          .set('Authorization', auth)
          .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH', type: 'TRACTOR_UNIT' })
          .expect(201);
        const drv = await request(countingApp.getHttpServer())
          .post('/api/v1/drivers')
          .set('Authorization', auth)
          .send({ name: 'Jose', cpf: randomValidCpf(), cnhNumber: String(Math.floor(1e10 + Math.random() * 8e10)), cnhCategory: 'AE', cnhExpiresAt: '2028-06-30' })
          .expect(201);
        const comp = await request(countingApp.getHttpServer())
          .post('/api/v1/trip-compositions')
          .set('Authorization', auth)
          .send({ vehicleId: veh.body.data.id, trailers: [] })
          .expect(201);
        const o = await request(countingApp.getHttpServer()).post('/api/v1/locations').set('Authorization', auth).send({ name: `O ${randomUUID()}`, type: 'DISTRIBUTION_CENTER' }).expect(201);
        const d = await request(countingApp.getHttpServer()).post('/api/v1/locations').set('Authorization', auth).send({ name: `D ${randomUUID()}`, type: 'DISTRIBUTION_CENTER' }).expect(201);
        const t = await request(countingApp.getHttpServer())
          .post('/api/v1/trips')
          .set('Authorization', auth)
          .send({
            driverId: drv.body.data.id,
            compositionId: comp.body.data.id,
            originLocationId: o.body.data.id,
            destinationLocationId: d.body.data.id,
            plannedDeparture: '2026-09-01T08:00:00.000Z',
            plannedArrival: '2026-09-02T18:00:00.000Z',
            ...(previousTripId ? { previousTripId } : {}),
          })
          .expect(201);
        return t.body.data.id as string;
      },
    };

    try {
      const { auth } = await mk.tenant('N1');
      const ida = await mk.trip(auth);
      await mk.trip(auth, ida); // retorno 1 (previousTripId = ida)

      // baseline: 1 ida + 1 retorno
      queryCount = 0;
      await request(countingApp.getHttpServer()).get(`/api/v1/trips/${ida}/return-consolidation`).set('Authorization', auth).expect(200);
      const baseline = queryCount;
      expect(baseline).toBeGreaterThan(0);

      // muitas viagens NAO relacionadas no mesmo tenant -> contagem inalterada
      for (let i = 0; i < 8; i += 1) await mk.trip(auth);
      queryCount = 0;
      await request(countingApp.getHttpServer()).get(`/api/v1/trips/${ida}/return-consolidation`).set('Authorization', auth).expect(200);
      const withNoise = queryCount;
      expect(withNoise).toBe(baseline);

      // +1 retorno vinculado -> cresce de forma BOUNDED (uma perna a mais),
      // nunca proporcional ao tenant
      await mk.trip(auth, ida);
      queryCount = 0;
      await request(countingApp.getHttpServer()).get(`/api/v1/trips/${ida}/return-consolidation`).set('Authorization', auth).expect(200);
      const withExtraReturn = queryCount;
      expect(withExtraReturn).toBeGreaterThan(baseline);
      expect(withExtraReturn - baseline).toBeLessThanOrEqual(15); // 1 perna extra = 1 getFinancialResult (~10 queries)
    } finally {
      await countingApp.close();
      await basePrisma.$disconnect();
    }
  }, 120000);
});
