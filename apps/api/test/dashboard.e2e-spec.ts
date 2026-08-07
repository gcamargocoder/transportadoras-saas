import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const MONTH_LABELS_PT_BR = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

describe('Dashboard (e2e)', () => {
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
      slug: `dash-${label.toLowerCase()}-${unique}`,
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

  async function createCustomer(auth: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', auth)
      .send({ name: `Cliente ${randomUUID()}` })
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

  async function setupTrip(auth: string, vehicleId: string, driverId: string, customerId?: string) {
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
        plannedArrival: '2026-09-05T18:00:00.000Z',
        ...(customerId ? { customerId } : {}),
      })
      .expect(201);

    return tripRes.body.data.id as string;
  }

  async function createRevenue(
    auth: string,
    tripId: string,
    amount: number,
    receivedAt: string,
    overrides: Partial<Record<string, unknown>> = {},
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/trip-revenues')
      .set('Authorization', auth)
      .send({
        tripId,
        category: 'FREIGHT',
        description: 'Frete',
        amount,
        receivedAt,
        ...overrides,
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createApprovedExpense(auth: string, tripId: string, amount: number) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/trip-expenses')
      .set('Authorization', auth)
      .send({
        tripId,
        category: 'FUEL',
        description: 'Abastecimento',
        expenseDate: '2026-09-02T10:00:00.000Z',
        amount,
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/trip-expenses/${res.body.data.id}/status`)
      .set('Authorization', auth)
      .send({ status: 'APPROVED' })
      .expect(200);
    return res.body.data.id as string;
  }

  async function createAdvance(auth: string, tripId: string, amount: number) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/trip-advances')
      .set('Authorization', auth)
      .send({ tripId, description: 'Adiantamento', amount, paidAt: '2026-09-01T08:00:00.000Z' })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createFuelStation(auth: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/fuel-stations')
      .set('Authorization', auth)
      .send({ name: `Posto ${randomUUID()}` })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createFuelSupply(
    auth: string,
    vehicleId: string,
    driverId: string,
    fuelStationId: string,
    liters: number,
    pricePerLiter: number,
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/fuel-supplies')
      .set('Authorization', auth)
      .send({
        vehicleId,
        driverId,
        fuelStationId,
        fuelType: 'DIESEL_S10',
        liters,
        pricePerLiter,
        odometerKm: 10000,
        supplyDate: '2026-09-02T10:00:00.000Z',
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createMaintenance(
    auth: string,
    vehicleId: string,
    laborCost: number,
    partsCost: number,
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/maintenances')
      .set('Authorization', auth)
      .send({ vehicleId, type: 'PREVENTIVE', laborCost, partsCost })
      .expect(201);
    return res.body.data.id as string;
  }

  describe('dashboard vazio', () => {
    it('retorna todos os indicadores zerados (nunca NaN) e 12 meses nos graficos', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Empty');
      const auth = `Bearer ${adminAccessToken}`;

      const res = await request(app.getHttpServer())
        .get('/api/v1/dashboard')
        .set('Authorization', auth)
        .expect(200);

      const dashboard = res.body.data;
      expect(dashboard.overview).toMatchObject({
        totalTrips: 0,
        activeTrips: 0,
        finishedTrips: 0,
        cancelledTrips: 0,
        totalDrivers: 0,
        activeDrivers: 0,
        totalVehicles: 0,
        availableVehicles: 0,
        maintenanceVehicles: 0,
        fuelStations: 0,
        customers: 0,
      });
      expect(dashboard.financial).toMatchObject({
        totalRevenue: 0,
        approvedExpenses: 0,
        advances: 0,
        profit: 0,
        netResult: 0,
        averageTripRevenue: 0,
        averageTripExpense: 0,
        largestRevenue: 0,
        largestExpense: 0,
        margin: 0,
      });
      expect(dashboard.operational).toMatchObject({
        todayTrips: 0,
        lateTrips: 0,
        tripsInProgress: 0,
        completedToday: 0,
        kmDriven: 0,
        averageTripDistance: 0,
      });
      expect(dashboard.fleet).toMatchObject({
        fuelConsumed: 0,
        fuelCost: 0,
        averageConsumptionKmL: 0,
        costPerKm: 0,
        maintenanceCost: 0,
        maintenanceOpen: 0,
        maintenanceClosed: 0,
      });

      for (const series of [
        dashboard.charts.monthlyRevenue,
        dashboard.charts.monthlyExpenses,
        dashboard.charts.monthlyFuelCost,
        dashboard.charts.monthlyTrips,
      ]) {
        expect(series).toHaveLength(12);
        expect(series.every((p: { value: number }) => p.value === 0)).toBe(true);
      }

      // Nunca NaN em nenhum campo numerico.
      const flatten = (obj: Record<string, unknown>): unknown[] =>
        Object.values(obj).flatMap((v) =>
          v && typeof v === 'object' && !Array.isArray(v)
            ? flatten(v as Record<string, unknown>)
            : v,
        );
      for (const value of flatten(dashboard)) {
        if (typeof value === 'number') expect(Number.isNaN(value)).toBe(false);
      }
    });
  });

  describe('dashboard com dados: lucro, margem e resultado liquido', () => {
    it('agrega receitas, despesas aprovadas, adiantamentos, combustivel e manutencao', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('WithData');
      const auth = `Bearer ${adminAccessToken}`;

      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);
      const customerId = await createCustomer(auth);
      const tripId = await setupTrip(auth, vehicleId, driverId, customerId);

      const now = new Date().toISOString();
      await createRevenue(auth, tripId, 1000, now);
      await createApprovedExpense(auth, tripId, 300);
      // Despesa PENDING nao deve contar.
      const pendingRes = await request(app.getHttpServer())
        .post('/api/v1/trip-expenses')
        .set('Authorization', auth)
        .send({
          tripId,
          category: 'FOOD',
          description: 'Nao aprovada',
          expenseDate: '2026-09-02T10:00:00.000Z',
          amount: 9999,
        })
        .expect(201);
      expect(pendingRes.body.data.status).toBe('PENDING');
      await createAdvance(auth, tripId, 100);

      const station = await createFuelStation(auth);
      await createFuelSupply(auth, vehicleId, driverId, station, 100, 5);
      await createMaintenance(auth, vehicleId, 100, 50);

      const res = await request(app.getHttpServer())
        .get('/api/v1/dashboard')
        .set('Authorization', auth)
        .expect(200);

      const dashboard = res.body.data;
      expect(dashboard.overview.totalTrips).toBe(1);
      expect(dashboard.overview.totalVehicles).toBe(1);
      expect(dashboard.overview.availableVehicles).toBe(1);
      expect(dashboard.overview.totalDrivers).toBe(1);
      expect(dashboard.overview.activeDrivers).toBe(1);
      expect(dashboard.overview.customers).toBe(1);
      expect(dashboard.overview.fuelStations).toBe(1);

      expect(dashboard.financial.totalRevenue).toBe(1000);
      expect(dashboard.financial.approvedExpenses).toBe(300);
      expect(dashboard.financial.advances).toBe(100);
      expect(dashboard.financial.profit).toBe(700); // 1000 - 300
      expect(dashboard.financial.netResult).toBe(600); // 700 - 100
      expect(dashboard.financial.margin).toBeCloseTo(70, 5); // 700/1000*100
      expect(dashboard.financial.averageTripRevenue).toBe(1000);
      expect(dashboard.financial.averageTripExpense).toBe(300);
      expect(dashboard.financial.largestRevenue).toBe(1000);
      expect(dashboard.financial.largestExpense).toBe(300);

      expect(dashboard.fleet.fuelConsumed).toBe(100);
      expect(dashboard.fleet.fuelCost).toBe(500);
      expect(dashboard.fleet.maintenanceCost).toBe(150);
      expect(dashboard.fleet.maintenanceOpen).toBe(1);
      expect(dashboard.fleet.maintenanceClosed).toBe(0);

      // Grafico do mes atual reflete a receita criada.
      const currentLabel = MONTH_LABELS_PT_BR[new Date().getUTCMonth()];
      const currentPoint = dashboard.charts.monthlyRevenue.find(
        (p: { month: string }) => p.month === currentLabel,
      );
      expect(dashboard.charts.monthlyRevenue[dashboard.charts.monthlyRevenue.length - 1]).toEqual(
        currentPoint,
      );
      expect(currentPoint.value).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('filtros', () => {
    it('filtra por vehicleId, driverId e customerId', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Filters');
      const auth = `Bearer ${adminAccessToken}`;
      const now = new Date().toISOString();

      const vehicleA = await createVehicle(auth);
      const driverA = await createDriver(auth);
      const customerA = await createCustomer(auth);
      const tripA = await setupTrip(auth, vehicleA, driverA, customerA);
      // TripRevenue.customerId e um campo direto e independente do
      // Trip.customerId (Fase 17 -- "customer opcional", pode divergir do
      // cliente da viagem) -- precisa ser informado explicitamente aqui
      // para o filtro customerId do dashboard encontrar esta receita.
      await createRevenue(auth, tripA, 500, now, { customerId: customerA });

      const vehicleB = await createVehicle(auth);
      const driverB = await createDriver(auth);
      const customerB = await createCustomer(auth);
      const tripB = await setupTrip(auth, vehicleB, driverB, customerB);
      await createRevenue(auth, tripB, 700, now, { customerId: customerB });

      const byVehicleA = await request(app.getHttpServer())
        .get(`/api/v1/dashboard?vehicleId=${vehicleA}`)
        .set('Authorization', auth)
        .expect(200);
      expect(byVehicleA.body.data.financial.totalRevenue).toBe(500);

      const byDriverB = await request(app.getHttpServer())
        .get(`/api/v1/dashboard?driverId=${driverB}`)
        .set('Authorization', auth)
        .expect(200);
      expect(byDriverB.body.data.financial.totalRevenue).toBe(700);

      const byCustomerA = await request(app.getHttpServer())
        .get(`/api/v1/dashboard?customerId=${customerA}`)
        .set('Authorization', auth)
        .expect(200);
      expect(byCustomerA.body.data.financial.totalRevenue).toBe(500);

      const unfiltered = await request(app.getHttpServer())
        .get('/api/v1/dashboard')
        .set('Authorization', auth)
        .expect(200);
      expect(unfiltered.body.data.financial.totalRevenue).toBe(1200);
    });

    it('startDate/endDate filtram overview/financial, mas charts sempre mostra os ultimos 12 meses', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('DateFilter');
      const auth = `Bearer ${adminAccessToken}`;

      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);
      const tripId = await setupTrip(auth, vehicleId, driverId);

      const sixMonthsAgo = new Date();
      sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 6);
      await createRevenue(auth, tripId, 900, sixMonthsAgo.toISOString());

      const todayIso = new Date().toISOString().slice(0, 10);
      const filteredRes = await request(app.getHttpServer())
        .get(`/api/v1/dashboard?startDate=${todayIso}`)
        .set('Authorization', auth)
        .expect(200);
      // A unica receita e de 6 meses atras -- excluida pelo startDate=hoje.
      expect(filteredRes.body.data.financial.totalRevenue).toBe(0);

      // Mas o grafico (sempre ultimos 12 meses) continua mostrando o valor
      // no balde correspondente a 6 meses atras, mesmo com startDate=hoje.
      const expectedLabel = MONTH_LABELS_PT_BR[sixMonthsAgo.getUTCMonth()];
      const point = filteredRes.body.data.charts.monthlyRevenue.find(
        (p: { month: string }) => p.month === expectedLabel,
      );
      expect(point?.value).toBe(900);
    });
  });

  describe('graficos: sempre 12 meses, zero nos meses sem movimentacao', () => {
    it('retorna 11 meses zerados e 1 mes com o valor lancado', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Charts');
      const auth = `Bearer ${adminAccessToken}`;
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);
      const tripId = await setupTrip(auth, vehicleId, driverId);
      await createRevenue(auth, tripId, 1000, new Date().toISOString());

      const res = await request(app.getHttpServer())
        .get('/api/v1/dashboard')
        .set('Authorization', auth)
        .expect(200);

      const series = res.body.data.charts.monthlyRevenue as { month: string; value: number }[];
      expect(series).toHaveLength(12);
      const nonZero = series.filter((p) => p.value !== 0);
      const zero = series.filter((p) => p.value === 0);
      expect(nonZero).toHaveLength(1);
      expect(zero).toHaveLength(11);
      expect(nonZero[0]?.value).toBe(1000);
      expect(series[11]?.month).toBe(nonZero[0]?.month); // mes atual e o ultimo do array
    });
  });

  describe('isolamento multi-tenant', () => {
    it('nunca mistura dados de outro tenant', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolA');
      const authA = `Bearer ${tenantA.adminAccessToken}`;
      const vehicleId = await createVehicle(authA);
      const driverId = await createDriver(authA);
      const tripId = await setupTrip(authA, vehicleId, driverId);
      await createRevenue(authA, tripId, 5000, new Date().toISOString());

      const tenantB = await createTenantAndLoginAsAdmin('IsolB');
      const authB = `Bearer ${tenantB.adminAccessToken}`;

      const res = await request(app.getHttpServer())
        .get('/api/v1/dashboard')
        .set('Authorization', authB)
        .expect(200);

      expect(res.body.data.overview.totalTrips).toBe(0);
      expect(res.body.data.financial.totalRevenue).toBe(0);
      expect(
        res.body.data.charts.monthlyRevenue.every((p: { value: number }) => p.value === 0),
      ).toBe(true);
    });
  });

  describe('RBAC', () => {
    it('permite SUPER_ADMIN, ADMIN e MANAGER; bloqueia os demais perfis com 403', async () => {
      const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('Rbac');
      const adminAuth = `Bearer ${adminAccessToken}`;

      // ADMIN (perfil ja criado com o tenant).
      await request(app.getHttpServer())
        .get('/api/v1/dashboard')
        .set('Authorization', adminAuth)
        .expect(200);

      // SUPER_ADMIN: promove o unico usuario existente (o proprio admin) e
      // reverte em seguida -- feito ANTES de criar qualquer outro usuario
      // no tenant, para o updateMany nao afetar mais ninguem.
      const adminUser = await prisma.userAccount.findFirstOrThrow({ where: { tenantId } });
      await prisma.userAccount.update({
        where: { id: adminUser.id },
        data: { role: 'SUPER_ADMIN' },
      });
      const superAdminLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId, email: adminUser.email, password: 'SenhaForte123!' })
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/v1/dashboard')
        .set('Authorization', `Bearer ${superAdminLogin.body.data.accessToken}`)
        .expect(200);
      await prisma.userAccount.update({ where: { id: adminUser.id }, data: { role: 'ADMIN' } });

      // MANAGER.
      const managerAuth = await createUserWithRole(tenantId, adminAuth, 'MANAGER');
      await request(app.getHttpServer())
        .get('/api/v1/dashboard')
        .set('Authorization', managerAuth)
        .expect(200);

      // Demais perfis -- 403.
      for (const role of ['OPERATOR', 'DISPATCHER', 'AUDITOR']) {
        const auth = await createUserWithRole(tenantId, adminAuth, role);
        await request(app.getHttpServer())
          .get('/api/v1/dashboard')
          .set('Authorization', auth)
          .expect(403);
      }
    });
  });
});
