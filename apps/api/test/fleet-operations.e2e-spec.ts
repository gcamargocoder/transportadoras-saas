import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 40 -- gestao operacional da frota. Cobre os 4 endpoints novos
// (/fleet-operations/{dashboard,costs,maintenance,stops}), o cenario de
// consistencia conhecido (fixture com valores exatos, secao 23 do pedido),
// filtros, isolamento multi-tenant e RBAC. fuel/tires (reaproveitados via
// FuelSuppliesService/TiresService.getDashboard ja testados em
// fuel-management.e2e-spec.ts/tire-management.e2e-spec.ts) sao verificados
// aqui apenas quanto a wiring (presentes, numericos, nunca NaN) -- nao
// reteste a logica interna deles.
describe('Fleet Operations (e2e)', () => {
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

  // Promovido a SUPER_ADMIN (mesmo padrao de driver-trips.e2e-spec.ts /
  // tolls.e2e-spec.ts) -- POST /toll-plazas exige SUPER_ADMIN; SUPER_ADMIN
  // continua com acesso a tudo que ADMIN tinha.
  async function createTenantAndLoginAsAdmin(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    const payload = {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `fops-${label.toLowerCase()}-${unique}`,
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

  // Motorista + veiculo + composicao + viagem PLANNED, com login proprio
  // (mesmo fluxo de driver-trips.e2e-spec.ts / checklists.e2e-spec.ts).
  async function setupDriverWithTrip(adminAuth: string, tenantId: string, vehicleId: string) {
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

    return { driverId, tripId, driverAuth: `Bearer ${loginRes.body.data.accessToken as string}` };
  }

  async function createTollPlaza(auth: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/toll-plazas')
      .set('Authorization', auth)
      .send({ name: `Praca ${randomUUID()}`, operator: 'CCR ViaOeste', highway: 'SP-280', pricePerAxle: 10 })
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
    await request(app.getHttpServer())
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
  }

  async function createMaintenance(
    auth: string,
    vehicleId: string,
    overrides: Partial<Record<string, unknown>> = {},
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/maintenances')
      .set('Authorization', auth)
      .send({ vehicleId, type: 'PREVENTIVE', laborCost: 100, partsCost: 50, workshop: 'Oficina Central', ...overrides })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createTire(auth: string, purchasePrice: number, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tires')
      .set('Authorization', auth)
      .send({
        fireNumber: `FG-${randomUUID().slice(0, 8)}`,
        manufacturer: 'Michelin',
        model: 'X Multi Energy Z',
        size: '295/80R22.5',
        purchaseDate: '2026-09-01',
        purchasePrice,
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

  // TollTransactionsService exige tag ativa e valida no veiculo antes de
  // aceitar qualquer transacao (mesmo fluxo de tolls.e2e-spec.ts).
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

  async function createTollTransaction(auth: string, tripId: string, tollPlazaId: string, chargedAmount: number) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/toll-transactions')
      .set('Authorization', auth)
      .send({ tripId, tollPlazaId, axleCount: 6, chargedAmount, chargedAt: '2026-09-01T10:30:00.000Z' })
      .expect(201);
    return res.body.data.id as string;
  }

  // vehicleId NAO faz parte do DTO -- sempre derivado da Trip (mesma
  // logica ja usada em toll-transactions), nunca aceito do cliente aqui.
  async function createApprovedExpense(auth: string, tripId: string, category: string, amount: number) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/trip-expenses')
      .set('Authorization', auth)
      .send({ tripId, category, description: 'Despesa', expenseDate: '2026-09-02T10:00:00.000Z', amount })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/trip-expenses/${res.body.data.id}/status`)
      .set('Authorization', auth)
      .send({ status: 'APPROVED' })
      .expect(200);
  }

  async function openStop(driverAuth: string, tripId: string, startedAt: string) {
    const openRes = await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/stops`)
      .set('Authorization', driverAuth)
      .send({ deviceEventId: randomUUID(), latitude: -23.5, longitude: -46.6, startedAt })
      .expect(201);
    return openRes.body.data.id as string;
  }

  async function openAndCloseStop(driverAuth: string, tripId: string, startedAt: string, endedAt: string, type: string) {
    const stopId = await openStop(driverAuth, tripId, startedAt);
    await request(app.getHttpServer())
      .patch(`/api/v1/driver/trips/${tripId}/stops/${stopId}/close`)
      .set('Authorization', driverAuth)
      .send({ endedAt, type })
      .expect(200);
  }

  function buildChecklistTemplatePayload() {
    return {
      name: `Sider Pre-Viagem ${randomUUID()}`,
      type: 'PRE_TRIP',
      sections: [
        {
          title: 'SEGURANCA',
          order: 1,
          items: [
            {
              code: 'cinto_seguranca',
              label: 'Cinto de seguranca perfeito e funcionando?',
              type: 'BOOLEAN',
              order: 1,
              required: true,
              critical: true,
            },
          ],
        },
      ],
    };
  }

  async function createPublishedChecklistTemplate(adminAuth: string) {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/checklists/templates')
      .set('Authorization', adminAuth)
      .send(buildChecklistTemplatePayload())
      .expect(201);
    const templateId = createRes.body.data.id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/checklists/templates/${templateId}/publish`)
      .set('Authorization', adminAuth)
      .expect(200);
    return { templateId, cintoItemId: createRes.body.data.sections[0].items[0].id as string };
  }

  // Execucao com o unico item (critico+obrigatorio) respondido NAO --
  // gera 1 nao-conformidade critica, depois completa (nao bloqueia, so
  // preserva a informacao -- mesma regra da Fase 38).
  async function createNonConformingChecklistExecution(driverAuth: string, templateId: string, cintoItemId: string, vehicleId: string) {
    const execRes = await request(app.getHttpServer())
      .post('/api/v1/driver/checklists')
      .set('Authorization', driverAuth)
      .send({ deviceEventId: randomUUID(), templateId, vehicleId })
      .expect(201);
    const executionId = execRes.body.data.id as string;

    await request(app.getHttpServer())
      .post(`/api/v1/driver/checklists/${executionId}/answers`)
      .set('Authorization', driverAuth)
      .send({ answers: [{ itemId: cintoItemId, booleanValue: false }] })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/driver/checklists/${executionId}/complete`)
      .set('Authorization', driverAuth)
      .expect(200);
  }

  // ==========================================================================
  // Dashboard vazio
  // ==========================================================================
  describe('dashboard vazio', () => {
    it('retorna todos os indicadores zerados/nulos (nunca NaN)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Empty');

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/dashboard')
        .set('Authorization', adminAuth)
        .expect(200);

      const dashboard = res.body.data;
      expect(dashboard.overview).toMatchObject({
        totalVehicles: 0,
        activeVehicles: 0,
        inactiveVehicles: 0,
        maintenanceVehicles: 0,
        soldVehicles: 0,
        activeTrips: 0,
        activeDrivers: 0,
        openAlerts: 0,
      });
      expect(dashboard.costs).toMatchObject({
        totalCost: 0,
        fuelCost: 0,
        maintenanceCost: 0,
        tireCost: 0,
        tollCost: 0,
        otherCost: 0,
        topVehiclesByCost: [],
        averageCostPerVehicle: null,
      });
      expect(dashboard.maintenance).toMatchObject({
        totalCount: 0,
        openCount: 0,
        completedCount: 0,
        totalCost: 0,
        averageCostPerOccurrence: null,
        averageDurationHours: null,
        topVehiclesByCost: [],
      });
      expect(dashboard.stops).toMatchObject({
        totalStops: 0,
        totalDurationMinutes: 0,
        averageDurationMinutes: null,
        maxDurationMinutes: null,
        minDurationMinutes: null,
        topVehiclesByDuration: [],
        driverRanking: [],
        durationAlerts: [],
      });
      expect(dashboard.checklist).toMatchObject({
        totalExecutions: 0,
        completedExecutions: 0,
        pendingExecutions: 0,
        criticalNonConformityCount: 0,
      });

      // fuel/tires (reaproveitados) presentes e sem NaN.
      const flatten = (obj: Record<string, unknown>): unknown[] =>
        Object.values(obj).flatMap((v) =>
          v && typeof v === 'object' && !Array.isArray(v) ? flatten(v as Record<string, unknown>) : v,
        );
      for (const value of flatten(dashboard)) {
        if (typeof value === 'number') expect(Number.isNaN(value)).toBe(false);
      }
    });
  });

  // ==========================================================================
  // Cenario de consistencia conhecido (fixture com valores exatos)
  // ==========================================================================
  describe('cenario de consistencia conhecido', () => {
    it('agrega corretamente combustivel + manutencao + pneu + pedagio + outras despesas + paradas + checklist + alerta', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Fixture');
      const vehicleId = await createVehicle(adminAuth);
      const { driverId, tripId, driverAuth } = await setupDriverWithTrip(adminAuth, tenantId, vehicleId);

      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .expect(201);

      // Combustivel: 100L@5,00 + 50L@5,50 = 500 + 275 = 775.
      const fuelStationId = await createFuelStation(adminAuth);
      await createFuelSupply(adminAuth, vehicleId, driverId, fuelStationId, 100, 5);
      await createFuelSupply(adminAuth, vehicleId, driverId, fuelStationId, 50, 5.5);

      // Manutencao: laborCost 100 + partsCost 50 = 150 (OPEN).
      await createMaintenance(adminAuth, vehicleId);

      // Pneu: compra 2450,90 (sem recapagem).
      await createTire(adminAuth, 2450.9);

      // Pedagio: 60,00 (exige tag ativa e valida no veiculo).
      await createVehicleTag(adminAuth, vehicleId);
      const tollPlazaId = await createTollPlaza(adminAuth);
      await createTollTransaction(adminAuth, tripId, tollPlazaId, 60);

      // Outra despesa aprovada (categoria sem fonte primaria propria): 80,00.
      await createApprovedExpense(adminAuth, tripId, 'FOOD', 80);
      // Despesa PENDING nao deve contar.
      const pendingRes = await request(app.getHttpServer())
        .post('/api/v1/trip-expenses')
        .set('Authorization', adminAuth)
        .send({ tripId, category: 'FOOD', description: 'Nao aprovada', expenseDate: '2026-09-02T10:00:00.000Z', amount: 9999 })
        .expect(201);
      expect(pendingRes.body.data.status).toBe('PENDING');

      // Parada: 25 minutos REST.
      await openAndCloseStop(driverAuth, tripId, '2026-09-01T12:00:00.000Z', '2026-09-01T12:25:00.000Z', 'REST');

      // Checklist: 1 execucao completa com 1 nao-conformidade critica.
      const { templateId, cintoItemId } = await createPublishedChecklistTemplate(adminAuth);
      await createNonConformingChecklistExecution(driverAuth, templateId, cintoItemId, vehicleId);

      // Alerta: sem endpoint de criacao direta (so efeito colateral real de
      // desvio de rota, ver RoutingService.checkDeviation) -- criado direto
      // via Prisma so para os agregadores terem 1 alerta para contar,
      // mesmo padrao ja usado por outros e2e (injecao de PrismaService para
      // setup fora do que a API expoe).
      await prisma.alert.create({
        data: { tenantId, tripId, type: 'ROUTE_DEVIATION', severity: 'MEDIUM', message: 'Desvio de rota detectado.' },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/dashboard')
        .set('Authorization', adminAuth)
        .expect(200);
      const dashboard = res.body.data;

      expect(dashboard.overview.totalVehicles).toBe(1);
      expect(dashboard.overview.activeVehicles).toBe(1);
      expect(dashboard.overview.activeTrips).toBe(1);
      expect(dashboard.overview.vehiclesOnTrip).toBe(1);
      expect(dashboard.overview.vehiclesAvailable).toBe(0);
      expect(dashboard.overview.activeDrivers).toBe(1);
      expect(dashboard.overview.openAlerts).toBe(1);

      expect(dashboard.costs.fuelCost).toBe(775);
      expect(dashboard.costs.maintenanceCost).toBe(150);
      expect(dashboard.costs.tireCost).toBeCloseTo(2450.9, 5);
      expect(dashboard.costs.tollCost).toBe(60);
      expect(dashboard.costs.otherCost).toBe(80);
      expect(dashboard.costs.totalCost).toBeCloseTo(775 + 150 + 2450.9 + 60 + 80, 5);
      expect(dashboard.costs.averageCostPerVehicle).toBeCloseTo(dashboard.costs.totalCost, 5);
      expect(dashboard.costs.topVehiclesByCost).toHaveLength(1);
      expect(dashboard.costs.topVehiclesByCost[0]).toMatchObject({ vehicleId, value: 775 + 150 + 60, count: 4 });
      const foodCategory = dashboard.costs.costByCategory.find((c: { category: string }) => c.category === 'FOOD');
      expect(foodCategory?.amount).toBe(80);

      expect(dashboard.maintenance.totalCount).toBe(1);
      expect(dashboard.maintenance.openCount).toBe(1);
      expect(dashboard.maintenance.completedCount).toBe(0);
      expect(dashboard.maintenance.totalCost).toBe(150);
      expect(dashboard.maintenance.averageCostPerOccurrence).toBe(150);
      expect(dashboard.maintenance.averageDurationHours).toBeNull();

      expect(dashboard.stops.totalStops).toBe(1);
      expect(dashboard.stops.totalDurationMinutes).toBe(25);
      expect(dashboard.stops.averageDurationMinutes).toBe(25);
      expect(dashboard.stops.topVehiclesByDuration[0]).toMatchObject({ vehicleId, value: 25, count: 1 });

      expect(dashboard.checklist.totalExecutions).toBe(1);
      expect(dashboard.checklist.completedExecutions).toBe(1);
      expect(dashboard.checklist.pendingExecutions).toBe(0);
      expect(dashboard.checklist.criticalNonConformityCount).toBe(1);

      // fuel/tires reaproveitados -- so confirma wiring (dado real, sem NaN).
      expect(dashboard.fuel.totalLiters).toBe(150);
      expect(dashboard.tires.investedValue).toBeCloseTo(2450.9, 5);
    });
  });

  // ==========================================================================
  // GET /fleet-operations/costs -- filtros e exclusao de dupla contagem
  // ==========================================================================
  describe('GET /fleet-operations/costs', () => {
    it('filtra por vehicleId e por periodo (data do evento real, nunca createdAt)', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('CostFilter');
      const vehicleA = await createVehicle(adminAuth);
      const vehicleB = await createVehicle(adminAuth);
      const fuelStationId = await createFuelStation(adminAuth);
      const { driverId: driverA } = await setupDriverWithTrip(adminAuth, tenantId, vehicleA);
      const { driverId: driverB } = await setupDriverWithTrip(adminAuth, tenantId, vehicleB);

      await createFuelSupply(adminAuth, vehicleA, driverA, fuelStationId, 100, 5); // 500
      await createFuelSupply(adminAuth, vehicleB, driverB, fuelStationId, 40, 5); // 200

      const byVehicleA = await request(app.getHttpServer())
        .get(`/api/v1/fleet-operations/costs?vehicleId=${vehicleA}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byVehicleA.body.data.fuelCost).toBe(500);

      const unfiltered = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/costs')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(unfiltered.body.data.fuelCost).toBe(700);

      // supplyDate fixo em 2026-09-02 (helper createFuelSupply) -- filtro de
      // periodo fora dessa data exclui tudo.
      const outsideRange = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/costs?startDate=2026-10-01&endDate=2026-10-31')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(outsideRange.body.data.fuelCost).toBe(0);

      const insideRange = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/costs?startDate=2026-09-01&endDate=2026-09-03')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(insideRange.body.data.fuelCost).toBe(700);
    });

    it('filtra por fleetId (agrupamento organizacional de veiculos)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CostFleetFilter');
      const fleetA = await createFleet(adminAuth);
      const fleetB = await createFleet(adminAuth);
      const vehicleA = await createVehicle(adminAuth, { fleetId: fleetA });
      const vehicleB = await createVehicle(adminAuth, { fleetId: fleetB });
      await createMaintenance(adminAuth, vehicleA, { laborCost: 100, partsCost: 0 });
      await createMaintenance(adminAuth, vehicleB, { laborCost: 300, partsCost: 0 });

      const byFleetA = await request(app.getHttpServer())
        .get(`/api/v1/fleet-operations/costs?fleetId=${fleetA}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byFleetA.body.data.maintenanceCost).toBe(100);

      const byFleetB = await request(app.getHttpServer())
        .get(`/api/v1/fleet-operations/costs?fleetId=${fleetB}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byFleetB.body.data.maintenanceCost).toBe(300);
    });

    it('nunca soma FUEL/MAINTENANCE/TIRES de TripExpense em cima das fontes primarias (evita dupla contagem)', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('NoDoubleCount');
      const vehicleId = await createVehicle(adminAuth);
      const { tripId } = await setupDriverWithTrip(adminAuth, tenantId, vehicleId);

      // Uma TripExpense categoria FUEL aprovada -- nao deve aparecer em
      // otherCost nem em fuelCost (que so soma FuelSupply.totalAmount).
      await createApprovedExpense(adminAuth, tripId, 'FUEL', 999);

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/costs')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.fuelCost).toBe(0);
      expect(res.body.data.otherCost).toBe(0);
      expect(res.body.data.totalCost).toBe(0);
    });
  });

  // ==========================================================================
  // GET /fleet-operations/maintenance
  // ==========================================================================
  describe('GET /fleet-operations/maintenance', () => {
    it('agrupa por tipo/prioridade/oficina e calcula tempo medio so sobre concluidas', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Maint');
      const vehicleId = await createVehicle(adminAuth);

      const openId = await createMaintenance(adminAuth, vehicleId, {
        type: 'PREVENTIVE',
        priority: 'MEDIUM',
        workshop: 'Oficina A',
        laborCost: 100,
        partsCost: 0,
      });

      const completedId = await createMaintenance(adminAuth, vehicleId, {
        type: 'CORRECTIVE',
        priority: 'HIGH',
        workshop: 'Oficina B',
        laborCost: 300,
        partsCost: 0,
        openedAt: '2026-09-01T08:00:00.000Z',
      });
      await request(app.getHttpServer())
        .patch(`/api/v1/maintenances/${completedId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'COMPLETED', completedAt: '2026-09-01T12:00:00.000Z' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/maintenance')
        .set('Authorization', adminAuth)
        .expect(200);
      const dashboard = res.body.data;

      expect(dashboard.totalCount).toBe(2);
      expect(dashboard.openCount).toBe(1);
      expect(dashboard.completedCount).toBe(1);
      expect(dashboard.totalCost).toBe(400);
      expect(dashboard.averageCostPerOccurrence).toBe(200);
      expect(dashboard.averageDurationHours).toBe(4); // so a concluida conta (4h).

      const byType = dashboard.byType as { type: string; count: number; cost: number }[];
      expect(byType.find((t) => t.type === 'PREVENTIVE')).toMatchObject({ count: 1, cost: 100 });
      expect(byType.find((t) => t.type === 'CORRECTIVE')).toMatchObject({ count: 1, cost: 300 });

      const byWorkshop = dashboard.byWorkshop as { workshop: string; count: number }[];
      expect(byWorkshop.find((w) => w.workshop === 'Oficina A')).toMatchObject({ count: 1, cost: 100 });
      expect(byWorkshop.find((w) => w.workshop === 'Oficina B')).toMatchObject({ count: 1, cost: 300 });

      expect(dashboard.topVehiclesByCost[0]).toMatchObject({ vehicleId, value: 400, count: 2 });
      expect(openId).toBeTruthy();
    });
  });

  // ==========================================================================
  // GET /fleet-operations/stops
  // ==========================================================================
  describe('GET /fleet-operations/stops', () => {
    it('agrupa duracao total por tipo e rankeia veiculos por tempo parado', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Stops');
      const vehicleId = await createVehicle(adminAuth);
      const { tripId, driverId, driverAuth } = await setupDriverWithTrip(adminAuth, tenantId, vehicleId);
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .expect(201);

      await openAndCloseStop(driverAuth, tripId, '2026-09-01T08:00:00.000Z', '2026-09-01T08:20:00.000Z', 'FUEL');
      await openAndCloseStop(driverAuth, tripId, '2026-09-01T12:00:00.000Z', '2026-09-01T12:40:00.000Z', 'MEAL');

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/stops')
        .set('Authorization', adminAuth)
        .expect(200);
      const dashboard = res.body.data;

      expect(dashboard.totalStops).toBe(2);
      expect(dashboard.totalDurationMinutes).toBe(60);
      expect(dashboard.averageDurationMinutes).toBe(30);
      expect(dashboard.maxDurationMinutes).toBe(40);
      expect(dashboard.minDurationMinutes).toBe(20);

      const byType = dashboard.byType as { type: string; count: number; totalDurationMinutes: number }[];
      expect(byType.find((t) => t.type === 'FUEL')).toMatchObject({ count: 1, totalDurationMinutes: 20 });
      expect(byType.find((t) => t.type === 'MEAL')).toMatchObject({ count: 1, totalDurationMinutes: 40 });

      expect(dashboard.topVehiclesByDuration[0]).toMatchObject({ vehicleId, value: 60, count: 2 });
      expect(dashboard.driverRanking[0]).toMatchObject({
        driverId,
        stopsCount: 2,
        totalDurationMinutes: 60,
        averageDurationMinutes: 30,
        maxDurationMinutes: 40,
        minDurationMinutes: 20,
        rankPosition: 1,
      });
    });
  });

  // ==========================================================================
  // Fase 44 -- ranking de paradas por motorista
  // ==========================================================================
  describe('GET /fleet-operations/stops -- ranking por motorista', () => {
    async function createAdminStop(
      auth: string,
      vehicleId: string,
      driverId: string,
      startedAt: string,
      endedAt: string,
      type = 'YARD',
    ) {
      await request(app.getHttpServer())
        .post('/api/v1/trip-stops')
        .set('Authorization', auth)
        .send({ vehicleId, driverId, type, startedAt, endedAt })
        .expect(201);
    }

    it('ordena por tempo total parado desc, com posicao no ranking', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('DriverRank');
      const vehicleA = await createVehicle(adminAuth);
      const vehicleB = await createVehicle(adminAuth);
      const driverA = await createDriver(adminAuth);
      const driverB = await createDriver(adminAuth);

      await createAdminStop(adminAuth, vehicleA, driverA, '2026-09-01T08:00:00.000Z', '2026-09-01T08:30:00.000Z'); // 30 min
      await createAdminStop(adminAuth, vehicleB, driverB, '2026-09-01T08:00:00.000Z', '2026-09-01T09:30:00.000Z'); // 90 min

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/stops')
        .set('Authorization', adminAuth)
        .expect(200);

      const ranking = res.body.data.driverRanking as { driverId: string; totalDurationMinutes: number; rankPosition: number }[];
      expect(ranking).toHaveLength(2);
      expect(ranking[0]).toMatchObject({ driverId: driverB, totalDurationMinutes: 90, rankPosition: 1 });
      expect(ranking[1]).toMatchObject({ driverId: driverA, totalDurationMinutes: 30, rankPosition: 2 });
    });

    it('empate em tempo total desempata por quantidade de paradas', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('DriverRankTie');
      const vehicleA = await createVehicle(adminAuth);
      const vehicleB = await createVehicle(adminAuth);
      const driverA = await createDriver(adminAuth);
      const driverB = await createDriver(adminAuth);

      // driverA: 1 parada de 60min. driverB: 2 paradas de 30min (mesmo total).
      await createAdminStop(adminAuth, vehicleA, driverA, '2026-09-01T08:00:00.000Z', '2026-09-01T09:00:00.000Z');
      await createAdminStop(adminAuth, vehicleB, driverB, '2026-09-01T08:00:00.000Z', '2026-09-01T08:30:00.000Z');
      await createAdminStop(adminAuth, vehicleB, driverB, '2026-09-02T08:00:00.000Z', '2026-09-02T08:30:00.000Z');

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/stops')
        .set('Authorization', adminAuth)
        .expect(200);

      const ranking = res.body.data.driverRanking as { driverId: string; stopsCount: number }[];
      expect(ranking[0]).toMatchObject({ driverId: driverB, stopsCount: 2 });
      expect(ranking[1]).toMatchObject({ driverId: driverA, stopsCount: 1 });
    });

    it('motorista sem paradas no periodo filtrado nao aparece no ranking (nunca inventa 0)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('DriverRankEmpty');
      const vehicleA = await createVehicle(adminAuth);
      const driverA = await createDriver(adminAuth);
      await createDriver(adminAuth); // motorista sem nenhuma parada

      await createAdminStop(adminAuth, vehicleA, driverA, '2026-09-01T08:00:00.000Z', '2026-09-01T08:30:00.000Z');

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/stops')
        .set('Authorization', adminAuth)
        .expect(200);

      expect(res.body.data.driverRanking).toHaveLength(1);
    });

    it('respeita os mesmos filtros do dashboard (vehicleId/driverId/type/status/periodo)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('DriverRankFilters');
      const vehicleA = await createVehicle(adminAuth);
      const vehicleB = await createVehicle(adminAuth);
      const driverA = await createDriver(adminAuth);
      const driverB = await createDriver(adminAuth);

      await createAdminStop(adminAuth, vehicleA, driverA, '2026-09-01T08:00:00.000Z', '2026-09-01T08:30:00.000Z', 'FUEL');
      await createAdminStop(adminAuth, vehicleB, driverB, '2026-10-01T08:00:00.000Z', '2026-10-01T09:00:00.000Z', 'MAINTENANCE');

      const byVehicle = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/stops')
        .set('Authorization', adminAuth)
        .query({ vehicleId: vehicleA })
        .expect(200);
      expect(byVehicle.body.data.driverRanking).toEqual([expect.objectContaining({ driverId: driverA })]);

      const byDriver = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/stops')
        .set('Authorization', adminAuth)
        .query({ driverId: driverB })
        .expect(200);
      expect(byDriver.body.data.driverRanking).toEqual([expect.objectContaining({ driverId: driverB })]);

      const byType = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/stops')
        .set('Authorization', adminAuth)
        .query({ type: 'FUEL' })
        .expect(200);
      expect(byType.body.data.driverRanking).toEqual([expect.objectContaining({ driverId: driverA })]);

      // endDate e comparado por lte contra o instante exato (meia-noite UTC do
      // dia informado) -- nunca fim-do-dia (comportamento ja existente,
      // compartilhado por todos os endpoints deste service); por isso o
      // intervalo cobre ate o dia seguinte para incluir o evento das 08h.
      const byPeriod = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/stops')
        .set('Authorization', adminAuth)
        .query({ startDate: '2026-10-01', endDate: '2026-10-02' })
        .expect(200);
      expect(byPeriod.body.data.driverRanking).toEqual([expect.objectContaining({ driverId: driverB })]);

      const byStatusCompleted = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/stops')
        .set('Authorization', adminAuth)
        .query({ status: 'COMPLETED' })
        .expect(200);
      expect(byStatusCompleted.body.data.driverRanking).toHaveLength(2);
    });

    it('isolamento multi-tenant: ranking do tenant B nunca inclui motoristas do tenant A', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('DriverRankIsolA');
      const vehicleA = await createVehicle(tenantA.adminAuth);
      const driverA = await createDriver(tenantA.adminAuth);
      await createAdminStop(tenantA.adminAuth, vehicleA, driverA, '2026-09-01T08:00:00.000Z', '2026-09-01T08:30:00.000Z');

      const tenantB = await createTenantAndLoginAsAdmin('DriverRankIsolB');
      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/stops')
        .set('Authorization', tenantB.adminAuth)
        .expect(200);
      expect(res.body.data.driverRanking).toEqual([]);
    });
  });

  // ==========================================================================
  // Fase 44 -- alertas de duracao longa + thresholds configuraveis por tenant
  // ==========================================================================
  describe('GET /fleet-operations/stops -- alertas de duracao longa', () => {
    async function createCompletedStop(auth: string, vehicleId: string, type: string, durationMinutes: number) {
      const startedAt = '2026-09-01T08:00:00.000Z';
      const endedAt = new Date(new Date(startedAt).getTime() + durationMinutes * 60_000).toISOString();
      const res = await request(app.getHttpServer())
        .post('/api/v1/trip-stops')
        .set('Authorization', auth)
        .send({ vehicleId, type, startedAt, endedAt })
        .expect(201);
      return res.body.data.id as string;
    }

    it('abaixo do limite padrao: sem alerta', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('AlertBelow');
      const vehicleId = await createVehicle(adminAuth);
      await createCompletedStop(adminAuth, vehicleId, 'FUEL', 20); // limite padrao FUEL=30

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/stops')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.durationAlerts).toEqual([]);
    });

    it('exatamente no limite: sem alerta (so acima dispara)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('AlertExact');
      const vehicleId = await createVehicle(adminAuth);
      await createCompletedStop(adminAuth, vehicleId, 'FUEL', 30);

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/stops')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.durationAlerts).toEqual([]);
    });

    it('acima do limite padrao: gera alerta com os campos esperados', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('AlertAbove');
      const vehicleId = await createVehicle(adminAuth);
      const { tripId, driverId, driverAuth } = await setupDriverWithTrip(adminAuth, tenantId, vehicleId);
      await request(app.getHttpServer()).post(`/api/v1/driver/trips/${tripId}/start`).set('Authorization', driverAuth).expect(201);
      await openAndCloseStop(driverAuth, tripId, '2026-09-01T08:00:00.000Z', '2026-09-01T09:15:00.000Z', 'FUEL'); // 75 min > 30

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/stops')
        .set('Authorization', adminAuth)
        .expect(200);

      expect(res.body.data.durationAlerts).toHaveLength(1);
      expect(res.body.data.durationAlerts[0]).toMatchObject({
        type: 'FUEL',
        durationMinutes: 75,
        thresholdMinutes: 30,
        excessMinutes: 45,
        vehicleId,
        driverId,
        tripId,
        status: 'COMPLETED',
      });
      expect(res.body.data.durationAlerts[0].vehiclePlate).toEqual(expect.any(String));
      expect(res.body.data.durationAlerts[0].driverName).toEqual(expect.any(String));
      expect(res.body.data.durationAlerts[0].tripReference).toContain(' -> ');
    });

    it('parada cancelada nunca gera alerta, mesmo com duracao registrada acima do limite', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('AlertCancelled');
      const vehicleId = await createVehicle(adminAuth);
      const stopId = await createCompletedStop(adminAuth, vehicleId, 'MAINTENANCE', 200); // limite padrao 180
      await request(app.getHttpServer()).patch(`/api/v1/trip-stops/${stopId}/cancel`).set('Authorization', adminAuth).expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/stops')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.durationAlerts).toEqual([]);
    });

    it('parada ainda aberta nunca gera alerta de duracao longa (fora do escopo -- ver STALLED_VEHICLE, alerta generico ja existente)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('AlertOpen');
      const vehicleId = await createVehicle(adminAuth);
      await request(app.getHttpServer())
        .post('/api/v1/trip-stops')
        .set('Authorization', adminAuth)
        .send({ vehicleId, type: 'FUEL', startedAt: '2026-01-01T08:00:00.000Z' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/stops')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.durationAlerts).toEqual([]);
    });

    it('tipos diferentes usam limites diferentes (FUEL=30 dispara em 40min; MAINTENANCE=180 nao dispara em 40min)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('AlertPerType');
      const vehicleFuel = await createVehicle(adminAuth);
      const vehicleMaint = await createVehicle(adminAuth);
      await createCompletedStop(adminAuth, vehicleFuel, 'FUEL', 40);
      await createCompletedStop(adminAuth, vehicleMaint, 'MAINTENANCE', 40);

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/stops')
        .set('Authorization', adminAuth)
        .expect(200);

      const alerts = res.body.data.durationAlerts as { type: string; vehicleId: string }[];
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject({ type: 'FUEL', vehicleId: vehicleFuel });
    });

    it('tipo sem limite padrao (ex: OTHER) nunca gera alerta, salvo se o tenant configurar um', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('AlertNoDefault');
      const vehicleId = await createVehicle(adminAuth);
      await createCompletedStop(adminAuth, vehicleId, 'OTHER', 500);

      const before = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/stops')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(before.body.data.durationAlerts).toEqual([]);

      await request(app.getHttpServer())
        .patch('/api/v1/tenant-settings')
        .set('Authorization', adminAuth)
        .send({ preferences: { stopDurationThresholdsMinutes: { OTHER: 60 } } })
        .expect(200);

      const after = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/stops')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(after.body.data.durationAlerts).toHaveLength(1);
      expect(after.body.data.durationAlerts[0]).toMatchObject({ type: 'OTHER', thresholdMinutes: 60, excessMinutes: 440 });
    });

    it('threshold configurado no tenant A nunca vaza para o tenant B (usa o padrao)', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('AlertTenantA');
      await request(app.getHttpServer())
        .patch('/api/v1/tenant-settings')
        .set('Authorization', tenantA.adminAuth)
        .send({ preferences: { stopDurationThresholdsMinutes: { FUEL: 5 } } })
        .expect(200);

      const tenantB = await createTenantAndLoginAsAdmin('AlertTenantB');
      const vehicleB = await createVehicle(tenantB.adminAuth);
      await createCompletedStop(tenantB.adminAuth, vehicleB, 'FUEL', 20); // > padrao 5 do tenant A, < padrao 30 do tenant B

      const resB = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/stops')
        .set('Authorization', tenantB.adminAuth)
        .expect(200);
      expect(resB.body.data.durationAlerts).toEqual([]); // tenant B usa o padrao (30), nao o do tenant A (5)

      const vehicleA = await createVehicle(tenantA.adminAuth);
      await createCompletedStop(tenantA.adminAuth, vehicleA, 'FUEL', 20); // > 5 (override do tenant A)
      const resA = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/stops')
        .set('Authorization', tenantA.adminAuth)
        .expect(200);
      expect(resA.body.data.durationAlerts).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Isolamento multi-tenant
  // ==========================================================================
  describe('isolamento multi-tenant', () => {
    it('nunca mistura dados de outro tenant em nenhum dos 4 endpoints', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolA');
      const vehicleId = await createVehicle(tenantA.adminAuth);
      await createMaintenance(tenantA.adminAuth, vehicleId, { laborCost: 500, partsCost: 0 });

      const tenantB = await createTenantAndLoginAsAdmin('IsolB');

      const dashboardRes = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/dashboard')
        .set('Authorization', tenantB.adminAuth)
        .expect(200);
      expect(dashboardRes.body.data.overview.totalVehicles).toBe(0);
      expect(dashboardRes.body.data.costs.maintenanceCost).toBe(0);

      const costsRes = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/costs')
        .set('Authorization', tenantB.adminAuth)
        .expect(200);
      expect(costsRes.body.data.maintenanceCost).toBe(0);

      const maintenanceRes = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/maintenance')
        .set('Authorization', tenantB.adminAuth)
        .expect(200);
      expect(maintenanceRes.body.data.totalCount).toBe(0);

      const stopsRes = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/stops')
        .set('Authorization', tenantB.adminAuth)
        .expect(200);
      expect(stopsRes.body.data.totalStops).toBe(0);
      expect(stopsRes.body.data.driverRanking).toEqual([]);
      expect(stopsRes.body.data.durationAlerts).toEqual([]);

      const operationsRes = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/operations')
        .set('Authorization', tenantB.adminAuth)
        .expect(200);
      expect(operationsRes.body.data.completedTrips).toBe(0);
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
          .get('/api/v1/fleet-operations/dashboard')
          .set('Authorization', auth)
          .expect(200);
      }

      // SUPER_ADMIN ja usado no proprio adminAuth desta suite (promovido em
      // createTenantAndLoginAsAdmin).
      await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/costs')
        .set('Authorization', adminAuth)
        .expect(200);

      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      for (const path of ['dashboard', 'costs', 'maintenance', 'stops', 'operations']) {
        await request(app.getHttpServer())
          .get(`/api/v1/fleet-operations/${path}`)
          .set('Authorization', driverAuth)
          .expect(403);
      }
    });
  });

  // ==========================================================================
  // Escala pratica (nao literalmente 100 veiculos via HTTP e2e -- a garantia
  // de ausencia de N+1 vem da arquitetura em groupBy/aggregate, ver
  // fleet-operations-metrics.service.ts; este teste confirma que o
  // agregador continua correto com multiplos veiculos simultaneos).
  // ==========================================================================
  describe('escala pratica (multiplos veiculos)', () => {
    it('agrega corretamente custos de 15 veiculos com manutencao', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Scale');
      const vehicleIds: string[] = [];
      for (let i = 0; i < 15; i += 1) {
        const vehicleId = await createVehicle(adminAuth);
        await createMaintenance(adminAuth, vehicleId, { laborCost: 100, partsCost: 0 });
        vehicleIds.push(vehicleId);
      }

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/dashboard')
        .set('Authorization', adminAuth)
        .expect(200);
      const dashboard = res.body.data;

      expect(dashboard.overview.totalVehicles).toBe(15);
      expect(dashboard.costs.maintenanceCost).toBe(1500);
      expect(dashboard.maintenance.totalCount).toBe(15);
      expect(dashboard.costs.topVehiclesByCost).toHaveLength(5); // TOP_VEHICLES_LIMIT
      expect(dashboard.costs.averageCostPerVehicle).toBe(100);
    });
  });

  // ==========================================================================
  // Fase 41 -- GET /fleet-operations/operations (indicadores operacionais)
  // ==========================================================================
  describe('GET /fleet-operations/operations', () => {
    it('calcula tempo medio de viagem, custo medio por viagem, utilizacao e ranking por nº de viagens', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Ops1');
      const vehicleId = await createVehicle(adminAuth);
      const { tripId, driverAuth } = await setupDriverWithTrip(adminAuth, tenantId, vehicleId);

      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .expect(201);

      // Backdата de createdAt/duracao via Prisma (setup determinístico, fora
      // do que a API expõe -- mesmo padrão já usado para o Alert manual) --
      // sem isso, createdAt seria "agora" e cairia fora do filtro de
      // período usado abaixo.
      await prisma.trip.update({ where: { id: tripId }, data: { createdAt: new Date('2026-07-01T09:00:00.000Z') } });

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'COMPLETED' })
        .expect(200);
      await prisma.tripMetrics.update({ where: { tripId }, data: { actualDurationMin: 60 } });

      // Custo no mesmo escopo: manutencao de 300 aberta dentro do periodo.
      await createMaintenance(adminAuth, vehicleId, {
        laborCost: 300,
        partsCost: 0,
        openedAt: '2026-07-01T10:00:00.000Z',
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/operations?startDate=2026-07-01&endDate=2026-07-02')
        .set('Authorization', adminAuth)
        .expect(200);
      const operational = res.body.data;

      expect(operational.completedTrips).toBe(1);
      expect(operational.inProgressTrips).toBe(0);
      expect(operational.cancelledTrips).toBe(0);
      expect(operational.averageTripDurationMinutes).toBe(60);
      expect(operational.averageCostPerTrip).toBe(300);
      // 60 min / (1440 min * 1 veiculo ativo) * 100 = 4.1666...%
      expect(operational.utilizationPercent).toBeCloseTo((60 / 1440) * 100, 4);
      expect(operational.topVehiclesByTripCount[0]).toMatchObject({ vehicleId, value: 1, count: 1 });
    });

    it('retorna zeros/nulos sem viagens concluidas (nunca inventa utilizacao sem periodo)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Ops2');

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/operations')
        .set('Authorization', adminAuth)
        .expect(200);
      const operational = res.body.data;

      expect(operational.completedTrips).toBe(0);
      expect(operational.averageTripDurationMinutes).toBeNull();
      expect(operational.averageCostPerTrip).toBeNull();
      expect(operational.utilizationPercent).toBeNull(); // sem startDate/endDate -- sem periodo de referencia
      expect(operational.topVehiclesByTripCount).toEqual([]);
    });
  });

  // ==========================================================================
  // Fase 41 -- evolucao mensal (monthlyTrend) -- sempre ultimos 12 meses a
  // partir de "agora" (ignora startDate/endDate), mesmo padrao do dashboard
  // executivo (DashboardService.getCharts).
  // ==========================================================================
  describe('evolucao mensal (monthlyTrend)', () => {
    it('inclui no ultimo balde (mes atual) um custo/manutencao lancado agora', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Trend');
      const vehicleId = await createVehicle(adminAuth);
      // Sem overrides de data -- openedAt nasce "agora" (dentro do mes atual).
      await createMaintenance(adminAuth, vehicleId, { laborCost: 300, partsCost: 0 });

      const costsRes = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/costs')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(costsRes.body.data.monthlyTrend).toHaveLength(12);
      expect(costsRes.body.data.monthlyTrend[11].value).toBe(300);

      const maintenanceRes = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/maintenance')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(maintenanceRes.body.data.monthlyTrend).toHaveLength(12);
      expect(maintenanceRes.body.data.monthlyTrend[11].value).toBe(300);
    });
  });

  // ==========================================================================
  // Fase 41 -- comparacao com periodo anterior (previousPeriod) -- so
  // preenchido quando startDate E endDate sao ambos informados.
  // ==========================================================================
  describe('comparacao com periodo anterior (previousPeriod)', () => {
    it('calcula o intervalo anterior de mesma duracao e a variacao percentual', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PrevPeriod');
      const vehicleId = await createVehicle(adminAuth);
      // Periodo anterior (dentro de [2026-06-23T23:59:59.999Z, 2026-06-30T23:59:59.999Z]).
      await createMaintenance(adminAuth, vehicleId, { laborCost: 100, partsCost: 0, openedAt: '2026-06-25T00:00:00.000Z' });
      // Periodo atual (dentro de [2026-07-01, 2026-07-08)).
      await createMaintenance(adminAuth, vehicleId, { laborCost: 300, partsCost: 0, openedAt: '2026-07-03T00:00:00.000Z' });

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/costs?startDate=2026-07-01&endDate=2026-07-08')
        .set('Authorization', adminAuth)
        .expect(200);
      const costs = res.body.data;

      expect(costs.maintenanceCost).toBe(300);
      expect(costs.previousPeriod).not.toBeNull();
      expect(costs.previousPeriod.totalCost).toBe(100);
      expect(costs.previousPeriod.deltaAmount).toBe(200);
      expect(costs.previousPeriod.deltaPercent).toBe(200);
    });

    it('fica null quando o periodo (startDate/endDate) nao e informado', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PrevPeriodNull');

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/costs')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.previousPeriod).toBeNull();
    });
  });

  // ==========================================================================
  // Fase 41 -- ranking por frota (costByFleet)
  // ==========================================================================
  describe('ranking por frota (costByFleet)', () => {
    it('agrupa o custo total por Vehicle.fleetId, incluindo o balde "Sem frota"', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CostByFleet');
      const fleetA = await createFleet(adminAuth, { name: 'Frota SP' });
      const vehicleA = await createVehicle(adminAuth, { fleetId: fleetA });
      const vehicleNoFleet = await createVehicle(adminAuth);
      await createMaintenance(adminAuth, vehicleA, { laborCost: 500, partsCost: 0 });
      await createMaintenance(adminAuth, vehicleNoFleet, { laborCost: 50, partsCost: 0 });

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/costs')
        .set('Authorization', adminAuth)
        .expect(200);
      const costByFleet = res.body.data.costByFleet as { fleetId: string | null; fleetName: string; amount: number }[];

      expect(costByFleet.find((f) => f.fleetId === fleetA)).toMatchObject({ fleetName: 'Frota SP', amount: 500 });
      expect(costByFleet.find((f) => f.fleetId === null)).toMatchObject({ fleetName: 'Sem frota', amount: 50 });
    });
  });

  // ==========================================================================
  // Fase 41 -- alertas operacionais (computados, nunca persistidos)
  // ==========================================================================
  describe('alertas operacionais', () => {
    it('destaca veiculo com custo/frequencia de manutencao muito acima da media da frota', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('AlertCost');
      const vehicleOutlier = await createVehicle(adminAuth);
      const vehicleB = await createVehicle(adminAuth);
      const vehicleC = await createVehicle(adminAuth);

      for (let i = 0; i < 5; i += 1) {
        await createMaintenance(adminAuth, vehicleOutlier, { laborCost: 180, partsCost: 0 });
      }
      await createMaintenance(adminAuth, vehicleB, { laborCost: 10, partsCost: 0 });
      await createMaintenance(adminAuth, vehicleC, { laborCost: 10, partsCost: 0 });

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/dashboard')
        .set('Authorization', adminAuth)
        .expect(200);
      const alerts = res.body.data.alerts as { type: string; vehicleId: string; severity: string; value: number }[];

      const costAlert = alerts.find((a) => a.type === 'COST_OUTLIER' && a.vehicleId === vehicleOutlier);
      expect(costAlert).toMatchObject({ severity: 'ATTENTION', value: 900 });
      const maintenanceAlert = alerts.find((a) => a.type === 'MAINTENANCE_OUTLIER' && a.vehicleId === vehicleOutlier);
      expect(maintenanceAlert).toMatchObject({ severity: 'ATTENTION', value: 5 });

      expect(alerts.find((a) => a.type === 'COST_OUTLIER' && a.vehicleId === vehicleB)).toBeUndefined();
      expect(alerts.find((a) => a.type === 'COST_OUTLIER' && a.vehicleId === vehicleC)).toBeUndefined();
    });

    it('destaca veiculo com parada em aberto ha muito tempo e veiculo com checklist pendente', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('AlertStall');

      const vehicleStalled = await createVehicle(adminAuth);
      const { tripId, driverAuth } = await setupDriverWithTrip(adminAuth, tenantId, vehicleStalled);
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .expect(201);
      const stopId = await openStop(driverAuth, tripId, new Date().toISOString());
      // Backdата direta via Prisma -- so assim o teste fica deterministico
      // (nunca esperar 240 minutos reais).
      await prisma.tripStop.update({
        where: { id: stopId },
        data: { startedAt: new Date(Date.now() - 300 * 60 * 1000) },
      });

      const vehiclePendingChecklist = await createVehicle(adminAuth);
      const { templateId } = await createPublishedChecklistTemplate(adminAuth);
      const { driverAuth: driverAuth2 } = await setupDriverWithTrip(adminAuth, tenantId, vehiclePendingChecklist);
      await request(app.getHttpServer())
        .post('/api/v1/driver/checklists')
        .set('Authorization', driverAuth2)
        .send({ deviceEventId: randomUUID(), templateId, vehicleId: vehiclePendingChecklist })
        .expect(201);
      // Nunca completada -- fica DRAFT/IN_PROGRESS (pendente).

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/dashboard')
        .set('Authorization', adminAuth)
        .expect(200);
      const alerts = res.body.data.alerts as { type: string; vehicleId: string; severity: string }[];

      expect(alerts.find((a) => a.type === 'STALLED_VEHICLE' && a.vehicleId === vehicleStalled)).toMatchObject({
        severity: 'CRITICAL',
      });
      expect(alerts.find((a) => a.type === 'PENDING_CHECKLIST' && a.vehicleId === vehiclePendingChecklist)).toMatchObject({
        severity: 'INFO',
      });
    });
  });
});
