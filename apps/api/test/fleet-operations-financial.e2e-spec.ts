import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 51 -- GET /fleet-operations/financial. Receitas/despesas/adiantamentos
// e "custo total" sao reaproveitados verbatim (TripRevenue/TripExpense/
// TripAdvance/computeCosts ja existentes) -- este arquivo cobre apenas a
// CONSOLIDACAO nova (summary/evolucao/rankings/detalhamento), o escopo de
// filtro compartilhado, isolamento multi-tenant, RBAC e ausencia de N+1.
// CRUD/validacoes de TripRevenue/TripExpense/TripAdvance ja cobertos em
// trip-finance.e2e-spec.ts / trip-expenses.e2e-spec.ts (nao reteste aqui).
describe('Fleet Operations Financial (e2e)', () => {
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
      slug: `ffin-${label.toLowerCase()}-${unique}`,
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

  async function createCustomer(auth: string, name = 'Cliente Teste') {
    const res = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', auth)
      .send({ name })
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

  async function createTrip(auth: string, driverId: string, compositionId: string) {
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
        plannedDeparture: '2026-01-01T08:00:00.000Z',
        plannedArrival: '2026-01-02T18:00:00.000Z',
      })
      .expect(201);
    return res.body.data.id as string;
  }

  // Motorista + composicao + viagem PLANNED para um veiculo ja existente
  // (revenue/expense/advance nao exigem a viagem iniciada/concluida).
  async function setupTripForVehicle(auth: string, vehicleId: string) {
    const driverId = await createDriver(auth);
    const compositionId = await createComposition(auth, vehicleId);
    const tripId = await createTrip(auth, driverId, compositionId);
    return { driverId, tripId };
  }

  function createRevenue(auth: string, tripId: string, overrides: Partial<Record<string, unknown>> = {}) {
    return request(app.getHttpServer())
      .post('/api/v1/trip-revenues')
      .set('Authorization', auth)
      .send({ tripId, category: 'FREIGHT', description: 'Frete', amount: 1000, receivedAt: '2026-01-10T10:00:00.000Z', ...overrides })
      .expect(201);
  }

  function createAdvance(auth: string, tripId: string, overrides: Partial<Record<string, unknown>> = {}) {
    return request(app.getHttpServer())
      .post('/api/v1/trip-advances')
      .set('Authorization', auth)
      .send({ tripId, description: 'Adiantamento', amount: 100, paidAt: '2026-01-01T08:00:00.000Z', ...overrides })
      .expect(201);
  }

  async function createApprovedExpense(
    auth: string,
    tripId: string,
    category: string,
    amount: number,
    overrides: Partial<Record<string, unknown>> = {},
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/trip-expenses')
      .set('Authorization', auth)
      .send({ tripId, category, description: 'Despesa', expenseDate: '2026-01-10T10:00:00.000Z', amount, ...overrides })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/trip-expenses/${res.body.data.id}/status`)
      .set('Authorization', auth)
      .send({ status: 'APPROVED' })
      .expect(200);
    return res.body.data.id as string;
  }

  // ==========================================================================
  // Estado vazio
  // ==========================================================================
  describe('estado vazio', () => {
    it('retorna tudo zerado/nulo, nunca NaN', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Empty');

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/financial')
        .set('Authorization', adminAuth)
        .expect(200);
      const data = res.body.data;

      expect(data.summary).toMatchObject({
        totalRevenue: 0,
        totalExpenses: 0,
        totalCost: 0,
        totalAdvances: 0,
        pendingExpenses: 0,
        result: 0,
        marginPercent: null,
      });
      expect(data.monthlyRevenue).toHaveLength(12);
      expect(data.monthlyExpenses).toHaveLength(12);
      expect(data.monthlyResult).toHaveLength(12);
      expect(data.topVehiclesByRevenue).toEqual([]);
      expect(data.topVehiclesByExpense).toEqual([]);
      // topExpenseCategories reaproveita FleetCostsEntity.costByCategory, que
      // sempre retorna as 4 categorias fixas (FUEL/MAINTENANCE/TIRES/TOLL)
      // zeradas -- nunca uma lista vazia (mesmo padrao ja coberto em
      // fleet-operations.e2e-spec.ts para GET /fleet-operations/costs).
      for (const c of data.topExpenseCategories) expect(c.amount).toBe(0);
      expect(data.topTripsByCost).toEqual([]);
      expect(data.bestTripsByResult).toEqual([]);
      expect(data.worstTripsByResult).toEqual([]);
      expect(data.revenueByFleet).toEqual([]);
      expect(data.costByFleet).toEqual([]);
      expect(data.revenueByCustomer).toEqual([]);
      expect(data.byDriver).toEqual([]);
    });
  });

  // ==========================================================================
  // Calculo consolidado (fixture com valores exatos)
  // ==========================================================================
  describe('calculo consolidado', () => {
    it('agrega receita/despesa/adiantamento/resultado por veiculo/frota/cliente/motorista/viagem', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Fixture');
      const fleetA = await createFleet(adminAuth, { name: 'Frota SP' });
      const vehicleA = await createVehicle(adminAuth, { fleetId: fleetA });
      const vehicleB = await createVehicle(adminAuth);
      const customerId = await createCustomer(adminAuth);

      const { driverId: driver1, tripId: trip1 } = await setupTripForVehicle(adminAuth, vehicleA);
      const { driverId: driver2, tripId: trip2 } = await setupTripForVehicle(adminAuth, vehicleB);

      // Trip1 (vehicleA/fleetA/driver1): receitas 3000 (com cliente) + 1000 (sem cliente) = 4000.
      await createRevenue(adminAuth, trip1, { amount: 3000, category: 'FREIGHT', customerId }).expect(201);
      await createRevenue(adminAuth, trip1, { amount: 1000, category: 'BONUS' }).expect(201);
      // Despesa aprovada 800 (categoria sem fonte primaria propria -- entra em totalCost via otherCost).
      await createApprovedExpense(adminAuth, trip1, 'FOOD', 800);
      // Despesa PENDING nao entra em totalExpenses, mas conta em pendingExpenses.
      await request(app.getHttpServer())
        .post('/api/v1/trip-expenses')
        .set('Authorization', adminAuth)
        .send({ tripId: trip1, category: 'FOOD', description: 'Nao aprovada', expenseDate: '2026-01-10T10:00:00.000Z', amount: 9999 })
        .expect(201);
      await createAdvance(adminAuth, trip1, { amount: 400 }).expect(201);

      // Trip2 (vehicleB/sem frota/driver2): receita 500, despesa 100.
      await createRevenue(adminAuth, trip2, { amount: 500, category: 'FREIGHT' }).expect(201);
      await createApprovedExpense(adminAuth, trip2, 'OTHER', 100);

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/financial')
        .set('Authorization', adminAuth)
        .expect(200);
      const data = res.body.data;

      // totalCost = otherCost (FOOD+OTHER, unicas fontes de custo aqui) = 900.
      expect(data.summary.totalRevenue).toBe(4500);
      expect(data.summary.totalExpenses).toBe(900);
      expect(data.summary.totalCost).toBe(900);
      expect(data.summary.totalAdvances).toBe(400);
      expect(data.summary.pendingExpenses).toBe(9999);
      expect(data.summary.result).toBe(4500 - 900);
      expect(data.summary.marginPercent).toBeCloseTo(((4500 - 900) / 4500) * 100, 5);

      expect(data.topVehiclesByRevenue[0]).toMatchObject({ vehicleId: vehicleA, value: 4000, count: 2 });
      expect(data.topVehiclesByRevenue[1]).toMatchObject({ vehicleId: vehicleB, value: 500, count: 1 });

      const foodCategory = data.topExpenseCategories.find((c: { category: string }) => c.category === 'FOOD');
      const otherCategory = data.topExpenseCategories.find((c: { category: string }) => c.category === 'OTHER');
      expect(foodCategory?.amount).toBe(800);
      expect(otherCategory?.amount).toBe(100);

      expect(data.topTripsByCost[0]).toMatchObject({ tripId: trip1, value: 800 });
      expect(data.topTripsByCost[1]).toMatchObject({ tripId: trip2, value: 100 });
      expect(data.bestTripsByResult[0]).toMatchObject({ tripId: trip1, value: 4000 - 800 });
      expect(data.worstTripsByResult[0]).toMatchObject({ tripId: trip2, value: 500 - 100 });

      expect(data.revenueByFleet.find((f: { fleetId: string | null }) => f.fleetId === fleetA)).toMatchObject({ fleetName: 'Frota SP', amount: 4000 });
      expect(data.revenueByFleet.find((f: { fleetId: string | null }) => f.fleetId === null)).toMatchObject({ fleetName: 'Sem frota', amount: 500 });

      expect(data.revenueByCustomer.find((c: { customerId: string | null }) => c.customerId === customerId)).toMatchObject({ amount: 3000 });
      expect(data.revenueByCustomer.find((c: { customerId: string | null }) => c.customerId === null)).toMatchObject({ customerName: 'Sem cliente', amount: 1500 });

      expect(data.byDriver.find((d: { driverId: string }) => d.driverId === driver1)).toMatchObject({ expenses: 800, advances: 400 });
      expect(data.byDriver.find((d: { driverId: string }) => d.driverId === driver2)).toMatchObject({ expenses: 100, advances: 0 });
    });
  });

  // ==========================================================================
  // Custo total reaproveita GET /fleet-operations/costs (nunca recalculado)
  // ==========================================================================
  describe('custo total', () => {
    async function createFuelStation(auth: string) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/fuel-stations')
        .set('Authorization', auth)
        .send({ name: `Posto ${randomUUID()}` })
        .expect(201);
      return res.body.data.id as string;
    }

    it('summary.totalCost/topExpenseCategories/costByFleet sao identicos aos de GET /fleet-operations/costs', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CostReuse');
      const vehicleId = await createVehicle(adminAuth);
      const { tripId, driverId } = await setupTripForVehicle(adminAuth, vehicleId);

      const fuelStationId = await createFuelStation(adminAuth);
      await request(app.getHttpServer())
        .post('/api/v1/fuel-supplies')
        .set('Authorization', adminAuth)
        .send({ vehicleId, driverId, fuelStationId, fuelType: 'DIESEL_S10', liters: 100, pricePerLiter: 5, odometerKm: 10000, supplyDate: '2026-01-05T10:00:00.000Z' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', adminAuth)
        .send({ vehicleId, type: 'PREVENTIVE', laborCost: 100, partsCost: 50, workshop: 'Oficina Central' })
        .expect(201);
      await createApprovedExpense(adminAuth, tripId, 'FOOD', 80);
      await createRevenue(adminAuth, tripId, { amount: 2000 }).expect(201);

      const [financialRes, costsRes] = await Promise.all([
        request(app.getHttpServer()).get('/api/v1/fleet-operations/financial').set('Authorization', adminAuth).expect(200),
        request(app.getHttpServer()).get('/api/v1/fleet-operations/costs').set('Authorization', adminAuth).expect(200),
      ]);

      expect(financialRes.body.data.summary.totalCost).toBe(costsRes.body.data.totalCost);
      expect(financialRes.body.data.summary.totalCost).toBeCloseTo(500 + 150 + 80, 5);
      expect(financialRes.body.data.topExpenseCategories).toEqual(costsRes.body.data.costByCategory);
      expect(financialRes.body.data.costByFleet).toEqual(costsRes.body.data.costByFleet);
    });
  });

  // ==========================================================================
  // Filtros -- mesmo escopo em todos os indicadores
  // ==========================================================================
  describe('filtros', () => {
    it('filtra por vehicleId, fleetId, driverId, cliente, categoria, status e periodo', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Filters');
      const fleetA = await createFleet(adminAuth);
      const vehicleA = await createVehicle(adminAuth, { fleetId: fleetA });
      const vehicleB = await createVehicle(adminAuth);
      const customerId = await createCustomer(adminAuth);

      const { driverId: driver1, tripId: trip1 } = await setupTripForVehicle(adminAuth, vehicleA);
      const { driverId: driver2, tripId: trip2 } = await setupTripForVehicle(adminAuth, vehicleB);

      await createRevenue(adminAuth, trip1, { amount: 3000, category: 'FREIGHT', customerId, receivedAt: '2026-01-10T10:00:00.000Z' }).expect(201);
      await createApprovedExpense(adminAuth, trip1, 'FOOD', 800, { expenseDate: '2026-01-10T10:00:00.000Z' });

      await createRevenue(adminAuth, trip2, { amount: 500, category: 'BONUS', receivedAt: '2026-06-10T10:00:00.000Z' }).expect(201);
      await createApprovedExpense(adminAuth, trip2, 'OTHER', 100, { expenseDate: '2026-06-10T10:00:00.000Z' });

      const byVehicle = await request(app.getHttpServer())
        .get(`/api/v1/fleet-operations/financial?vehicleId=${vehicleA}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byVehicle.body.data.summary.totalRevenue).toBe(3000);
      expect(byVehicle.body.data.summary.totalExpenses).toBe(800);

      const byFleet = await request(app.getHttpServer())
        .get(`/api/v1/fleet-operations/financial?fleetId=${fleetA}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byFleet.body.data.summary.totalRevenue).toBe(3000);

      const byDriver1 = await request(app.getHttpServer())
        .get(`/api/v1/fleet-operations/financial?driverId=${driver1}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byDriver1.body.data.summary.totalRevenue).toBe(3000);
      expect(byDriver1.body.data.summary.totalExpenses).toBe(800);

      const byDriver2 = await request(app.getHttpServer())
        .get(`/api/v1/fleet-operations/financial?driverId=${driver2}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byDriver2.body.data.summary.totalRevenue).toBe(500);
      expect(byDriver2.body.data.summary.totalExpenses).toBe(100);

      const byCustomer = await request(app.getHttpServer())
        .get(`/api/v1/fleet-operations/financial?customerId=${customerId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byCustomer.body.data.summary.totalRevenue).toBe(3000);

      const byRevenueCategory = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/financial?revenueCategory=BONUS')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byRevenueCategory.body.data.summary.totalRevenue).toBe(500);

      const byExpenseCategory = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/financial?expenseCategory=FOOD')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byExpenseCategory.body.data.summary.totalExpenses).toBe(800);

      const byPeriod = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/financial?startDate=2026-01-01&endDate=2026-02-01')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byPeriod.body.data.summary.totalRevenue).toBe(3000);
      expect(byPeriod.body.data.summary.totalExpenses).toBe(800);
    });
  });

  // ==========================================================================
  // Isolamento multi-tenant
  // ==========================================================================
  describe('isolamento multi-tenant', () => {
    it('receitas/despesas/adiantamentos de um tenant nunca aparecem no dashboard de outro', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsoA');
      const tenantB = await createTenantAndLoginAsAdmin('IsoB');

      const vehicleId = await createVehicle(tenantA.adminAuth);
      const { tripId } = await setupTripForVehicle(tenantA.adminAuth, vehicleId);
      await createRevenue(tenantA.adminAuth, tripId, { amount: 5000 }).expect(201);
      await createApprovedExpense(tenantA.adminAuth, tripId, 'FOOD', 500);
      await createAdvance(tenantA.adminAuth, tripId, { amount: 200 }).expect(201);

      const resB = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/financial')
        .set('Authorization', tenantB.adminAuth)
        .expect(200);

      expect(resB.body.data.summary).toMatchObject({ totalRevenue: 0, totalExpenses: 0, totalAdvances: 0 });
      expect(resB.body.data.topVehiclesByRevenue).toEqual([]);

      // tenantId do cliente nunca define o escopo -- FleetOperationsQueryDto nao
      // tem esse campo e o ValidationPipe global (forbidNonWhitelisted) rejeita
      // a tentativa com 400, nunca aceitando silenciosamente.
      await request(app.getHttpServer())
        .get(`/api/v1/fleet-operations/financial?tenantId=${tenantA.tenantId}`)
        .set('Authorization', tenantB.adminAuth)
        .expect(400);
    });
  });

  // ==========================================================================
  // RBAC
  // ==========================================================================
  describe('RBAC', () => {
    it('bloqueia DRIVER (403) e permite SUPER_ADMIN', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Rbac');

      await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/financial')
        .set('Authorization', adminAuth)
        .expect(200);

      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/financial')
        .set('Authorization', driverAuth)
        .expect(403);
    });
  });

  // ==========================================================================
  // Valores ausentes
  // ==========================================================================
  describe('valores ausentes', () => {
    it('marginPercent e null quando nao ha receita (nunca 0 falso), mesmo com custo/despesa presentes', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('NoRevenue');
      const vehicleId = await createVehicle(adminAuth);
      const { tripId } = await setupTripForVehicle(adminAuth, vehicleId);
      await createApprovedExpense(adminAuth, tripId, 'FOOD', 300);

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/financial')
        .set('Authorization', adminAuth)
        .expect(200);

      expect(res.body.data.summary.totalRevenue).toBe(0);
      expect(res.body.data.summary.totalCost).toBe(300);
      expect(res.body.data.summary.result).toBe(-300);
      expect(res.body.data.summary.marginPercent).toBeNull();
    });
  });

  // ==========================================================================
  // Rankings e empates
  // ==========================================================================
  describe('rankings e empates', () => {
    it('2 veiculos com receita identica aparecem ambos no ranking (empate)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Tie');
      const vehicleA = await createVehicle(adminAuth);
      const vehicleB = await createVehicle(adminAuth);
      const { tripId: tripA } = await setupTripForVehicle(adminAuth, vehicleA);
      const { tripId: tripB } = await setupTripForVehicle(adminAuth, vehicleB);

      await createRevenue(adminAuth, tripA, { amount: 1000 }).expect(201);
      await createRevenue(adminAuth, tripB, { amount: 1000 }).expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/financial')
        .set('Authorization', adminAuth)
        .expect(200);

      expect(res.body.data.topVehiclesByRevenue).toHaveLength(2);
      expect(res.body.data.topVehiclesByRevenue).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ vehicleId: vehicleA, value: 1000, count: 1 }),
          expect.objectContaining({ vehicleId: vehicleB, value: 1000, count: 1 }),
        ]),
      );
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
        slug: `ffin-n1-${label.toLowerCase()}-${unique}`,
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

    async function seedFinancialRecord(adminAuth: string) {
      const vehicleRes = await request(countingApp.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', adminAuth)
        .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
        .expect(201);
      const vehicleId = vehicleRes.body.data.id as string;

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

      const compositionRes = await request(countingApp.getHttpServer())
        .post('/api/v1/trip-compositions')
        .set('Authorization', adminAuth)
        .send({ vehicleId, trailers: [] })
        .expect(201);
      const compositionId = compositionRes.body.data.id as string;

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
          driverId,
          compositionId,
          originLocationId: originRes.body.data.id,
          destinationLocationId: destinationRes.body.data.id,
          plannedDeparture: '2026-01-01T08:00:00.000Z',
          plannedArrival: '2026-01-02T18:00:00.000Z',
        })
        .expect(201);
      const tripId = tripRes.body.data.id as string;

      await request(countingApp.getHttpServer())
        .post('/api/v1/trip-revenues')
        .set('Authorization', adminAuth)
        .send({ tripId, category: 'FREIGHT', description: 'Frete', amount: 1000, receivedAt: '2026-01-10T10:00:00.000Z' })
        .expect(201);

      const expenseRes = await request(countingApp.getHttpServer())
        .post('/api/v1/trip-expenses')
        .set('Authorization', adminAuth)
        .send({ tripId, category: 'FOOD', description: 'Despesa', expenseDate: '2026-01-10T10:00:00.000Z', amount: 100 })
        .expect(201);
      await request(countingApp.getHttpServer())
        .patch(`/api/v1/trip-expenses/${expenseRes.body.data.id}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'APPROVED' })
        .expect(200);

      await request(countingApp.getHttpServer())
        .post('/api/v1/trip-advances')
        .set('Authorization', adminAuth)
        .send({ tripId, description: 'Adiantamento', amount: 50, paidAt: '2026-01-01T08:00:00.000Z' })
        .expect(201);
    }

    it('a contagem de queries de GET /fleet-operations/financial nao cresce entre 10 e 50 registros', async () => {
      const { adminAuth } = await createTenantAndLoginOnCountingApp('N1Check');

      for (let i = 0; i < 10; i += 1) {
        await seedFinancialRecord(adminAuth);
      }
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/fleet-operations/financial')
        .set('Authorization', adminAuth)
        .expect(200);
      const queriesFor10 = queryCount;

      for (let i = 0; i < 40; i += 1) {
        await seedFinancialRecord(adminAuth);
      }
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/fleet-operations/financial')
        .set('Authorization', adminAuth)
        .expect(200);
      const queriesFor50 = queryCount;

      expect(queriesFor50).toBeLessThanOrEqual(queriesFor10 + 1);
    }, 180000);
  });
});
