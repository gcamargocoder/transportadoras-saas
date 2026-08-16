import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// "Tempo parado e receita perdida" (GET /fleet-operations/downtime-cost).
// Tempo parado vem SOMENTE de TripStop (nunca somado com
// VehicleMaintenance.downtimeMinutes -- as duas fontes nao tem vinculo
// nenhum entre si). Receita perdida e uma ESTIMATIVA: horas paradas x taxa
// de receita/hora do PROPRIO veiculo (historico COMPLETO de viagens
// concluidas, nunca R$/km).
describe('Fleet Operations Downtime Cost (e2e)', () => {
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
      slug: `downtime-${label.toLowerCase()}-${unique}`,
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

  async function createFleet(auth: string, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/fleets')
      .set('Authorization', auth)
      .send({ name: `Frota ${randomUUID()}`, type: 'OWN', ...overrides })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createVehicle(auth: string, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/vehicles')
      .set('Authorization', auth)
      .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT', ...overrides })
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

  // Cria motorista + composicao + viagem PLANNED + login proprio, inicia e
  // conclui a viagem, sobrescreve actualDurationMin (determinístico, fora
  // do que a API expoe -- mesmo padrao ja usado em fleet-operations.e2e-spec.ts)
  // e opcionalmente lanca receita. Retorna o tripId.
  async function completeTripWithRevenue(
    adminAuth: string,
    tenantId: string,
    vehicleId: string,
    actualDurationMin: number,
    revenueAmount: number | null,
  ) {
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
        plannedDeparture: '2026-01-01T08:00:00.000Z',
        plannedArrival: '2026-01-02T18:00:00.000Z',
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
    const driverAuth = `Bearer ${loginRes.body.data.accessToken as string}`;

    await request(app.getHttpServer()).post(`/api/v1/driver/trips/${tripId}/start`).set('Authorization', driverAuth).expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}/status`)
      .set('Authorization', adminAuth)
      .send({ status: 'COMPLETED' })
      .expect(200);
    await prisma.tripMetrics.update({ where: { tripId }, data: { actualDurationMin } });

    if (revenueAmount !== null) {
      await request(app.getHttpServer())
        .post('/api/v1/trip-revenues')
        .set('Authorization', adminAuth)
        .send({ tripId, category: 'FREIGHT', description: 'Frete', amount: revenueAmount, receivedAt: '2026-01-01T00:00:00.000Z' })
        .expect(201);
    }
    return tripId;
  }

  async function createStop(auth: string, vehicleId: string, driverId: string, type: string, startedAt: string, endedAt: string) {
    await request(app.getHttpServer())
      .post('/api/v1/trip-stops')
      .set('Authorization', auth)
      .send({ vehicleId, driverId, type, startedAt, endedAt })
      .expect(201);
  }

  // ==========================================================================
  // Estado vazio
  // ==========================================================================
  describe('estado vazio', () => {
    it('retorna tudo zerado/vazio, receita perdida indisponivel (nunca R$0 falso)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Empty');

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/downtime-cost')
        .set('Authorization', adminAuth)
        .expect(200);
      const data = res.body.data;

      expect(data.totalStops).toBe(0);
      expect(data.totalDowntimeMinutes).toBe(0);
      expect(data.totalEstimatedLostRevenue).toMatchObject({ value: null, available: false, reason: 'NO_VEHICLE_WITH_REVENUE_RATE' });
      expect(data.vehicles).toEqual([]);
      expect(data.topVehiclesByLostRevenue).toEqual([]);
      expect(data.topVehiclesByDowntimeMinutes).toEqual([]);
      expect(data.monthlyTrendDowntimeMinutes).toHaveLength(12);
      expect(data.downtimeCostAlerts).toEqual([]);
      for (const category of data.byCategory) {
        expect(category).toMatchObject({ durationMinutes: 0, count: 0, estimatedLostRevenue: null });
      }
    });
  });

  // ==========================================================================
  // Tempo parado por categoria + taxa disponivel/indisponivel + receita
  // perdida calculada corretamente
  // ==========================================================================
  describe('tempo parado por categoria e receita perdida estimada', () => {
    it('categoriza MAINTENANCE/BREAKDOWN/FUEL/outras e calcula a receita perdida quando a taxa esta disponivel', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Category');
      const vehicleId = await createVehicle(adminAuth);
      const driverId = await createDriver(adminAuth);

      // Taxa: 2 viagens concluidas, 10h totais, R$5000 -> 500 R$/h.
      await completeTripWithRevenue(adminAuth, tenantId, vehicleId, 300, 2000);
      await completeTripWithRevenue(adminAuth, tenantId, vehicleId, 300, 3000);

      // Paradas: manutencao 60min, quebra 30min, abastecimento 20min, descanso (outras) 10min.
      await createStop(adminAuth, vehicleId, driverId, 'MAINTENANCE', '2026-01-10T08:00:00.000Z', '2026-01-10T09:00:00.000Z');
      await createStop(adminAuth, vehicleId, driverId, 'BREAKDOWN', '2026-01-10T10:00:00.000Z', '2026-01-10T10:30:00.000Z');
      await createStop(adminAuth, vehicleId, driverId, 'FUEL', '2026-01-10T11:00:00.000Z', '2026-01-10T11:20:00.000Z');
      await createStop(adminAuth, vehicleId, driverId, 'REST', '2026-01-10T12:00:00.000Z', '2026-01-10T12:10:00.000Z');

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/downtime-cost')
        .set('Authorization', adminAuth)
        .expect(200);
      const data = res.body.data;

      expect(data.totalStops).toBe(4);
      expect(data.totalDowntimeMinutes).toBe(120);

      const vehicle = data.vehicles.find((v: { vehicleId: string }) => v.vehicleId === vehicleId);
      expect(vehicle.revenuePerHour).toMatchObject({ value: 500, available: true, reason: null, basedOnTripCount: 2 });
      // 120 min = 2h; 2h * 500 R$/h = 1000.
      expect(vehicle.estimatedLostRevenue).toMatchObject({ value: 1000, available: true, reason: null });

      const byCategory = vehicle.byCategory as { category: string; durationMinutes: number; estimatedLostRevenue: number }[];
      expect(byCategory.find((c) => c.category === 'MAINTENANCE')).toMatchObject({ durationMinutes: 60, estimatedLostRevenue: 500 });
      expect(byCategory.find((c) => c.category === 'BREAKDOWN')).toMatchObject({ durationMinutes: 30, estimatedLostRevenue: 250 });
      expect(byCategory.find((c) => c.category === 'FUEL')).toMatchObject({ durationMinutes: 20 });
      expect(byCategory.find((c) => c.category === 'OTHER')).toMatchObject({ durationMinutes: 10 }); // REST cai em "Outras"

      expect(data.totalEstimatedLostRevenue).toMatchObject({ value: 1000, available: true, reason: null });
    });

    it('fica indisponivel quando o veiculo tem menos de 2 viagens concluidas (nunca inventa uma taxa)', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Insufficient');
      const vehicleId = await createVehicle(adminAuth);
      const driverId = await createDriver(adminAuth);

      await completeTripWithRevenue(adminAuth, tenantId, vehicleId, 300, 2000); // so 1 viagem
      await createStop(adminAuth, vehicleId, driverId, 'MAINTENANCE', '2026-01-10T08:00:00.000Z', '2026-01-10T09:00:00.000Z');

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/downtime-cost')
        .set('Authorization', adminAuth)
        .expect(200);
      const vehicle = res.body.data.vehicles.find((v: { vehicleId: string }) => v.vehicleId === vehicleId);

      expect(vehicle.revenuePerHour).toMatchObject({ value: null, available: false, reason: 'INSUFFICIENT_TRIP_HISTORY', basedOnTripCount: 1 });
      expect(vehicle.estimatedLostRevenue).toMatchObject({ value: null, available: false, reason: 'INSUFFICIENT_TRIP_HISTORY' });
    });
  });

  // ==========================================================================
  // Taxa ignora periodo, tempo parado respeita periodo
  // ==========================================================================
  describe('escopo de periodo', () => {
    it('a taxa usa o historico COMPLETO de viagens, mas o tempo parado so conta o periodo filtrado', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('PeriodScope');
      const vehicleId = await createVehicle(adminAuth);
      const driverId = await createDriver(adminAuth);

      // Viagens concluidas fora do periodo do filtro abaixo -- devem contar
      // mesmo assim para a taxa (ignora startDate/endDate).
      await completeTripWithRevenue(adminAuth, tenantId, vehicleId, 300, 2000);
      await completeTripWithRevenue(adminAuth, tenantId, vehicleId, 300, 3000);

      await createStop(adminAuth, vehicleId, driverId, 'MAINTENANCE', '2026-03-10T08:00:00.000Z', '2026-03-10T09:00:00.000Z'); // dentro do filtro
      await createStop(adminAuth, vehicleId, driverId, 'MAINTENANCE', '2026-02-01T08:00:00.000Z', '2026-02-01T09:00:00.000Z'); // fora do filtro

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/downtime-cost?startDate=2026-03-01&endDate=2026-03-31')
        .set('Authorization', adminAuth)
        .expect(200);
      const data = res.body.data;
      const vehicle = data.vehicles.find((v: { vehicleId: string }) => v.vehicleId === vehicleId);

      expect(data.totalDowntimeMinutes).toBe(60); // so a parada de marco
      expect(vehicle.revenuePerHour).toMatchObject({ available: true, value: 500 }); // taxa continua disponivel (historico completo)
    });
  });

  // ==========================================================================
  // totalEstimatedLostRevenue so soma veiculos com taxa disponivel
  // ==========================================================================
  describe('total de receita perdida', () => {
    it('soma so os veiculos com taxa disponivel, ignorando os indisponiveis (nunca R$0 no lugar de indisponivel)', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('TotalSum');
      const driverId = await createDriver(adminAuth);

      const available = await createVehicle(adminAuth);
      await completeTripWithRevenue(adminAuth, tenantId, available, 300, 2000);
      await completeTripWithRevenue(adminAuth, tenantId, available, 300, 3000); // 500 R$/h
      await createStop(adminAuth, available, driverId, 'MAINTENANCE', '2026-01-10T08:00:00.000Z', '2026-01-10T09:00:00.000Z'); // 60min -> 500

      const unavailable = await createVehicle(adminAuth);
      await createStop(adminAuth, unavailable, driverId, 'BREAKDOWN', '2026-01-10T08:00:00.000Z', '2026-01-10T10:00:00.000Z'); // 120min, sem viagem

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/downtime-cost')
        .set('Authorization', adminAuth)
        .expect(200);

      expect(res.body.data.totalEstimatedLostRevenue).toMatchObject({ value: 500, available: true, reason: null });
      expect(res.body.data.totalDowntimeMinutes).toBe(180); // ambos os veiculos contam no tempo parado
    });
  });

  // ==========================================================================
  // Ranking determinístico + alerta de outlier
  // ==========================================================================
  describe('ranking e alertas', () => {
    it('ranqueia por receita perdida desc e gera DOWNTIME_COST_OUTLIER para o veiculo muito acima da media', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Ranking');
      const driverId = await createDriver(adminAuth);

      const low = await createVehicle(adminAuth);
      await completeTripWithRevenue(adminAuth, tenantId, low, 300, 500);
      await completeTripWithRevenue(adminAuth, tenantId, low, 300, 500); // 100 R$/h
      await createStop(adminAuth, low, driverId, 'FUEL', '2026-01-10T08:00:00.000Z', '2026-01-10T08:30:00.000Z'); // 30min -> 50

      // 2o veiculo "baixo" -- pura para puxar a media geral para baixo o
      // suficiente para "high" (12000) ultrapassar 2x a media (mesmo
      // criterio real de isOutlier, nao um numero escolhido a dedo).
      const low2 = await createVehicle(adminAuth);
      await completeTripWithRevenue(adminAuth, tenantId, low2, 300, 500);
      await completeTripWithRevenue(adminAuth, tenantId, low2, 300, 500);
      await createStop(adminAuth, low2, driverId, 'FUEL', '2026-01-10T08:00:00.000Z', '2026-01-10T08:30:00.000Z'); // 30min -> 50

      const high = await createVehicle(adminAuth);
      await completeTripWithRevenue(adminAuth, tenantId, high, 60, 6000);
      await completeTripWithRevenue(adminAuth, tenantId, high, 60, 6000); // 6000 R$/h
      await createStop(adminAuth, high, driverId, 'BREAKDOWN', '2026-01-10T08:00:00.000Z', '2026-01-10T10:00:00.000Z'); // 120min -> 12000

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/downtime-cost')
        .set('Authorization', adminAuth)
        .expect(200);
      const data = res.body.data;

      expect(data.topVehiclesByLostRevenue[0]).toMatchObject({ vehicleId: high, value: 12000 });
      expect(data.topVehiclesByLostRevenue.slice(1).map((v: { vehicleId: string }) => v.vehicleId).sort()).toEqual([low, low2].sort());

      const alert = data.downtimeCostAlerts.find((a: { type: string; vehicleId: string }) => a.type === 'DOWNTIME_COST_OUTLIER' && a.vehicleId === high);
      expect(alert).toMatchObject({ severity: 'ATTENTION' });
    });
  });

  // ==========================================================================
  // Filtros: vehicleId, fleetId
  // ==========================================================================
  describe('filtros', () => {
    it('filtra por vehicleId e fleetId', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Filters');
      const driverId = await createDriver(adminAuth);
      const fleetA = await createFleet(adminAuth);

      const vehicleA = await createVehicle(adminAuth, { fleetId: fleetA });
      await createStop(adminAuth, vehicleA, driverId, 'MAINTENANCE', '2026-01-10T08:00:00.000Z', '2026-01-10T09:00:00.000Z');

      const vehicleB = await createVehicle(adminAuth);
      await createStop(adminAuth, vehicleB, driverId, 'MAINTENANCE', '2026-01-10T08:00:00.000Z', '2026-01-10T09:00:00.000Z');

      const byVehicle = await request(app.getHttpServer())
        .get(`/api/v1/fleet-operations/downtime-cost?vehicleId=${vehicleA}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byVehicle.body.data.totalStops).toBe(1);
      expect(byVehicle.body.data.vehicles).toHaveLength(1);
      expect(byVehicle.body.data.vehicles[0].vehicleId).toBe(vehicleA);

      const byFleet = await request(app.getHttpServer())
        .get(`/api/v1/fleet-operations/downtime-cost?fleetId=${fleetA}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byFleet.body.data.totalStops).toBe(1);

      const unfiltered = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/downtime-cost')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(unfiltered.body.data.totalStops).toBe(2);
    });
  });

  // ==========================================================================
  // Isolamento multi-tenant
  // ==========================================================================
  describe('isolamento multi-tenant', () => {
    it('tenant B nunca ve paradas/receita do tenant A', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolA');
      const driverId = await createDriver(tenantA.adminAuth);
      const vehicleId = await createVehicle(tenantA.adminAuth);
      await createStop(tenantA.adminAuth, vehicleId, driverId, 'MAINTENANCE', '2026-01-10T08:00:00.000Z', '2026-01-10T09:00:00.000Z');

      const tenantB = await createTenantAndLoginAsAdmin('IsolB');
      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/downtime-cost')
        .set('Authorization', tenantB.adminAuth)
        .expect(200);

      expect(res.body.data.totalStops).toBe(0);
      expect(res.body.data.vehicles).toEqual([]);
    });
  });

  // ==========================================================================
  // RBAC
  // ==========================================================================
  describe('RBAC', () => {
    it('permite SUPER_ADMIN/ADMIN/MANAGER/OPERATOR/DISPATCHER/AUDITOR; bloqueia DRIVER com 403', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Rbac');

      for (const role of ['MANAGER', 'OPERATOR', 'DISPATCHER', 'AUDITOR']) {
        const auth = await createUserWithRole(tenantId, adminAuth, role);
        await request(app.getHttpServer())
          .get('/api/v1/fleet-operations/downtime-cost')
          .set('Authorization', auth)
          .expect(200);
      }

      await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/downtime-cost')
        .set('Authorization', adminAuth) // SUPER_ADMIN
        .expect(200);

      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/downtime-cost')
        .set('Authorization', driverAuth)
        .expect(403);
    });
  });

  // ==========================================================================
  // Verificacao real de ausencia de N+1
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
        slug: `downtime-n1-${label.toLowerCase()}-${unique}`,
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

    async function seedVehicleWithStop(adminAuth: string, driverId: string) {
      const vehicleRes = await request(countingApp.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', adminAuth)
        .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
        .expect(201);
      const vehicleId = vehicleRes.body.data.id as string;

      await request(countingApp.getHttpServer())
        .post('/api/v1/trip-stops')
        .set('Authorization', adminAuth)
        .send({ vehicleId, driverId, type: 'MAINTENANCE', startedAt: '2026-01-10T08:00:00.000Z', endedAt: '2026-01-10T09:00:00.000Z' })
        .expect(201);
    }

    it('a contagem de queries de GET /fleet-operations/downtime-cost nao cresce entre 10 e 50 veiculos', async () => {
      const { adminAuth } = await createTenantAndLoginOnCountingApp('N1Check');
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
      const driverId = driverRes.body.data.id as string;

      for (let i = 0; i < 10; i += 1) {
        await seedVehicleWithStop(adminAuth, driverId);
      }
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/fleet-operations/downtime-cost')
        .set('Authorization', adminAuth)
        .expect(200);
      const queriesFor10 = queryCount;
      expect(queriesFor10).toBeGreaterThan(0);

      for (let i = 0; i < 40; i += 1) {
        await seedVehicleWithStop(adminAuth, driverId);
      }
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/fleet-operations/downtime-cost')
        .set('Authorization', adminAuth)
        .expect(200);
      const queriesFor50 = queryCount;

      expect(queriesFor50).toBeLessThanOrEqual(queriesFor10 + 1);
    }, 120000);
  });
});
