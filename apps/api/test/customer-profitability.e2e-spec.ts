import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Customer Profitability (e2e)', () => {
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
      slug: `cprof-${label.toLowerCase()}-${unique}`,
      admin: {
        name: `Admin ${label}`,
        email: `admin-${label.toLowerCase()}-${unique}@teste.com`,
        password: 'SenhaForte123!',
      },
    };
    const createRes = await request(app.getHttpServer()).post('/api/v1/tenants').send(payload).expect(201);
    const tenantId: string = createRes.body.data.id;
    createdTenantIds.push(tenantId);
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

  async function createCustomer(auth: string, name = `Cliente ${randomUUID().slice(0, 8)}`) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', auth)
      .send({ name })
      .expect(201);
    return res.body.data as { id: string; name: string };
  }

  async function createLocation(auth: string, name: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/locations')
      .set('Authorization', auth)
      .send({ name, type: 'DISTRIBUTION_CENTER' })
      .expect(201);
    return res.body.data.id as string;
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

  async function createComposition(auth: string, vehicleId: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/trip-compositions')
      .set('Authorization', auth)
      .send({ vehicleId, trailers: [] })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createTrip(auth: string, customerId: string, plannedDeparture = '2026-06-01T08:00:00.000Z') {
    const vehicleId = await createVehicle(auth);
    const driverId = await createDriver(auth);
    const compositionId = await createComposition(auth, vehicleId);
    const originId = await createLocation(auth, `Origem ${randomUUID()}`);
    const destinationId = await createLocation(auth, `Destino ${randomUUID()}`);
    const departure = new Date(plannedDeparture);
    const arrival = new Date(departure.getTime() + 24 * 60 * 60 * 1000);
    const res = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', auth)
      .send({
        customerId,
        driverId,
        compositionId,
        originLocationId: originId,
        destinationLocationId: destinationId,
        plannedDeparture: departure.toISOString(),
        plannedArrival: arrival.toISOString(),
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function addRevenue(auth: string, tripId: string, amount: number) {
    await request(app.getHttpServer())
      .post('/api/v1/trip-revenues')
      .set('Authorization', auth)
      .send({ tripId, category: 'FREIGHT', description: 'Frete', amount, receivedAt: '2026-06-02T00:00:00.000Z' })
      .expect(201);
  }

  async function addApprovedExpense(auth: string, tripId: string, amount: number) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/trip-expenses')
      .set('Authorization', auth)
      .send({ tripId, category: 'FUEL', description: 'Despesa', expenseDate: '2026-06-02T00:00:00.000Z', amount })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/trip-expenses/${res.body.data.id}/status`)
      .set('Authorization', auth)
      .send({ status: 'APPROVED' })
      .expect(200);
    return res.body.data.id as string;
  }

  async function addPendingExpense(auth: string, tripId: string, amount: number) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/trip-expenses')
      .set('Authorization', auth)
      .send({ tripId, category: 'OTHER', description: 'Despesa pendente', expenseDate: '2026-06-02T00:00:00.000Z', amount })
      .expect(201);
    return res.body.data.id as string;
  }

  async function rejectExpense(auth: string, expenseId: string) {
    await request(app.getHttpServer())
      .patch(`/api/v1/trip-expenses/${expenseId}/status`)
      .set('Authorization', auth)
      .send({ status: 'REJECTED' })
      .expect(200);
  }

  describe('calculo correto de receita, custo, resultado e margem', () => {
    it('agrega receita e custo real e calcula resultado/margem', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CalcBasic');
      const customer = await createCustomer(adminAuth);
      const tripId = await createTrip(adminAuth, customer.id);
      await addRevenue(adminAuth, tripId, 1000);
      await addApprovedExpense(adminAuth, tripId, 300);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/customer-profitability/customers/${customer.id}`)
        .set('Authorization', adminAuth)
        .expect(200);

      expect(res.body.data.revenue).toBe(1000);
      expect(res.body.data.cost).toBe(300);
      expect(res.body.data.result).toBe(700);
      expect(res.body.data.marginPercent).toBe(70);
      expect(res.body.data.tripsCount).toBe(1);
    });

    it('marginPercent e null quando nao ha receita valida (revenue <= 0)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('NoRevenue');
      const customer = await createCustomer(adminAuth);
      const tripId = await createTrip(adminAuth, customer.id);
      await addApprovedExpense(adminAuth, tripId, 150);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/customer-profitability/customers/${customer.id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.revenue).toBe(0);
      expect(res.body.data.cost).toBe(150);
      expect(res.body.data.result).toBe(-150);
      expect(res.body.data.marginPercent).toBeNull();
    });
  });

  describe('multiplas viagens do mesmo cliente', () => {
    it('soma receita/custo de todas as viagens do cliente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('MultiTrip');
      const customer = await createCustomer(adminAuth);
      const trip1 = await createTrip(adminAuth, customer.id, '2026-06-01T08:00:00.000Z');
      const trip2 = await createTrip(adminAuth, customer.id, '2026-06-10T08:00:00.000Z');
      await addRevenue(adminAuth, trip1, 1000);
      await addApprovedExpense(adminAuth, trip1, 200);
      await addRevenue(adminAuth, trip2, 500);
      await addApprovedExpense(adminAuth, trip2, 100);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/customer-profitability/customers/${customer.id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.tripsCount).toBe(2);
      expect(res.body.data.revenue).toBe(1500);
      expect(res.body.data.cost).toBe(300);
      expect(res.body.data.result).toBe(1200);
    });
  });

  describe('periodo', () => {
    it('filtra por plannedDeparture (from/to)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Period');
      const customer = await createCustomer(adminAuth);
      const inRange = await createTrip(adminAuth, customer.id, '2026-06-15T08:00:00.000Z');
      const outOfRange = await createTrip(adminAuth, customer.id, '2026-01-15T08:00:00.000Z');
      await addRevenue(adminAuth, inRange, 800);
      await addRevenue(adminAuth, outOfRange, 5000);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/customer-profitability/customers/${customer.id}?from=2026-06-01T00:00:00.000Z&to=2026-06-30T23:59:59.000Z`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.tripsCount).toBe(1);
      expect(res.body.data.revenue).toBe(800);
    });
  });

  describe('cliente sem dados', () => {
    it('cliente existente sem viagens retorna zerado, nunca 404', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('EmptyCustomer');
      const customer = await createCustomer(adminAuth);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/customer-profitability/customers/${customer.id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.tripsCount).toBe(0);
      expect(res.body.data.revenue).toBe(0);
      expect(res.body.data.cost).toBe(0);
      expect(res.body.data.result).toBe(0);
      expect(res.body.data.marginPercent).toBeNull();
    });

    it('404 quando o cliente em si nao existe', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('MissingCustomer');
      await request(app.getHttpServer())
        .get(`/api/v1/customer-profitability/customers/${randomUUID()}`)
        .set('Authorization', adminAuth)
        .expect(404);
    });

    it('cliente sem viagens nao aparece na listagem/ranking (sem inventar linha zerada la)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('EmptyNotInList');
      const withTrips = await createCustomer(adminAuth);
      const withoutTrips = await createCustomer(adminAuth);
      const tripId = await createTrip(adminAuth, withTrips.id);
      await addRevenue(adminAuth, tripId, 100);

      const res = await request(app.getHttpServer())
        .get('/api/v1/customer-profitability/customers?pageSize=50')
        .set('Authorization', adminAuth)
        .expect(200);
      const ids = res.body.data.items.map((r: { customerId: string }) => r.customerId);
      expect(ids).toContain(withTrips.id);
      expect(ids).not.toContain(withoutTrips.id);
    });
  });

  describe('ausencia de dupla contagem', () => {
    it('despesa REJECTED e PENDING nunca entram no custo', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('NoDoubleCount');
      const customer = await createCustomer(adminAuth);
      const tripId = await createTrip(adminAuth, customer.id);
      await addRevenue(adminAuth, tripId, 1000);
      await addApprovedExpense(adminAuth, tripId, 100);
      const rejectedId = await addPendingExpense(adminAuth, tripId, 9999);
      await rejectExpense(adminAuth, rejectedId);
      await addPendingExpense(adminAuth, tripId, 8888); // fica PENDING, nunca aprovada

      const res = await request(app.getHttpServer())
        .get(`/api/v1/customer-profitability/customers/${customer.id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.cost).toBe(100);
    });
  });

  describe('dashboard e ranking', () => {
    it('indicadores gerais e ranking por resultado/margem', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Dashboard');
      const customerA = await createCustomer(adminAuth, `Alfa ${randomUUID().slice(0, 6)}`);
      const customerB = await createCustomer(adminAuth, `Beta ${randomUUID().slice(0, 6)}`);
      const tripA = await createTrip(adminAuth, customerA.id);
      const tripB = await createTrip(adminAuth, customerB.id);
      await addRevenue(adminAuth, tripA, 2000);
      await addApprovedExpense(adminAuth, tripA, 500);
      await addRevenue(adminAuth, tripB, 1000);
      await addApprovedExpense(adminAuth, tripB, 900);

      const res = await request(app.getHttpServer())
        .get('/api/v1/customer-profitability/dashboard')
        .set('Authorization', adminAuth)
        .expect(200);

      expect(res.body.data.summary.totalRevenue).toBe(3000);
      expect(res.body.data.summary.totalCost).toBe(1400);
      expect(res.body.data.summary.totalResult).toBe(1600);
      expect(res.body.data.summary.customersCount).toBe(2);
      expect(res.body.data.topByResult[0].customerId).toBe(customerA.id);
      expect(res.body.data.topByMargin[0].customerId).toBe(customerA.id);
    });

    it('ordena a listagem por resultado/margem/receita/custo/viagens', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('SortListing');
      const customerA = await createCustomer(adminAuth);
      const customerB = await createCustomer(adminAuth);
      const tripA = await createTrip(adminAuth, customerA.id);
      const tripB = await createTrip(adminAuth, customerB.id);
      await addRevenue(adminAuth, tripA, 500);
      await addRevenue(adminAuth, tripB, 3000);

      const res = await request(app.getHttpServer())
        .get('/api/v1/customer-profitability/customers?sortBy=revenue&sortOrder=desc&pageSize=50')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.items[0].customerId).toBe(customerB.id);
    });
  });

  describe('isolamento multi-tenant', () => {
    it('rentabilidade de um tenant e invisivel para outro', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolationA');
      const tenantB = await createTenantAndLoginAsAdmin('IsolationB');
      const customer = await createCustomer(tenantA.adminAuth);
      const tripId = await createTrip(tenantA.adminAuth, customer.id);
      await addRevenue(tenantA.adminAuth, tripId, 1000);

      await request(app.getHttpServer())
        .get(`/api/v1/customer-profitability/customers/${customer.id}`)
        .set('Authorization', tenantB.adminAuth)
        .expect(404);

      const dashboardB = await request(app.getHttpServer())
        .get('/api/v1/customer-profitability/dashboard')
        .set('Authorization', tenantB.adminAuth)
        .expect(200);
      expect(dashboardB.body.data.summary.customersCount).toBe(0);
    });
  });

  describe('RBAC', () => {
    it('bloqueia DRIVER; AUDITOR le normalmente (modulo somente leitura)', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Rbac');
      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');

      await request(app.getHttpServer())
        .get('/api/v1/customer-profitability/dashboard')
        .set('Authorization', driverAuth)
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/v1/customer-profitability/customers')
        .set('Authorization', driverAuth)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/customer-profitability/dashboard')
        .set('Authorization', auditorAuth)
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/v1/customer-profitability/customers')
        .set('Authorization', auditorAuth)
        .expect(200);
    });
  });

  // ==========================================================================
  // N+1
  // ==========================================================================
  describe('verificacao de ausencia de N+1', () => {
    let countingApp: INestApplication;
    let basePrisma: PrismaService;
    let queryCount = 0;

    beforeAll(async () => {
      basePrisma = new PrismaService();
      await basePrisma.$connect();
      const extendedPrisma = basePrisma.$extends({
        name: 'query-counter',
        query: { $allModels: { async $allOperations({ args, query }) { queryCount += 1; return query(args); } } },
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
    });

    afterAll(async () => {
      await countingApp.close();
      await basePrisma.$disconnect();
    });

    async function createTenantOnCountingApp(label: string) {
      const unique = randomUUID().replace(/-/g, '').slice(0, 12);
      const payload = {
        name: `Transportadora ${label} ${unique}`,
        document: randomCnpj(),
        slug: `cprof-n1-${label.toLowerCase()}-${unique}`,
        admin: { name: `Admin ${label}`, email: `admin-n1-${label.toLowerCase()}-${unique}@teste.com`, password: 'SenhaForte123!' },
      };
      const createRes = await request(countingApp.getHttpServer()).post('/api/v1/tenants').send(payload).expect(201);
      const tenantId: string = createRes.body.data.id;
      createdTenantIds.push(tenantId);
      const loginRes = await request(countingApp.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId, email: payload.admin.email, password: payload.admin.password })
        .expect(200);
      return { tenantId, adminAuth: `Bearer ${loginRes.body.data.accessToken as string}` };
    }

    async function seedTripWithFinance(auth: string, customerId: string) {
      const vehicleRes = await request(countingApp.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
        .expect(201);
      const driverRes = await request(countingApp.getHttpServer())
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
      const compositionRes = await request(countingApp.getHttpServer())
        .post('/api/v1/trip-compositions')
        .set('Authorization', auth)
        .send({ vehicleId: vehicleRes.body.data.id, trailers: [] })
        .expect(201);
      const originRes = await request(countingApp.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', auth)
        .send({ name: `Origem ${randomUUID()}`, type: 'DISTRIBUTION_CENTER' })
        .expect(201);
      const destinationRes = await request(countingApp.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', auth)
        .send({ name: `Destino ${randomUUID()}`, type: 'DISTRIBUTION_CENTER' })
        .expect(201);
      const tripRes = await request(countingApp.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send({
          customerId,
          driverId: driverRes.body.data.id,
          compositionId: compositionRes.body.data.id,
          originLocationId: originRes.body.data.id,
          destinationLocationId: destinationRes.body.data.id,
          plannedDeparture: '2026-06-01T08:00:00.000Z',
          plannedArrival: '2026-06-02T18:00:00.000Z',
        })
        .expect(201);
      const tripId = tripRes.body.data.id as string;
      await request(countingApp.getHttpServer())
        .post('/api/v1/trip-revenues')
        .set('Authorization', auth)
        .send({ tripId, category: 'FREIGHT', description: 'Frete', amount: 100, receivedAt: '2026-06-02T00:00:00.000Z' })
        .expect(201);
      const expenseRes = await request(countingApp.getHttpServer())
        .post('/api/v1/trip-expenses')
        .set('Authorization', auth)
        .send({ tripId, category: 'FUEL', description: 'Despesa', expenseDate: '2026-06-02T00:00:00.000Z', amount: 30 })
        .expect(201);
      await request(countingApp.getHttpServer())
        .patch(`/api/v1/trip-expenses/${expenseRes.body.data.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'APPROVED' })
        .expect(200);
    }

    it('GET /customer-profitability/dashboard: contagem de queries nao cresce entre 5 e 20 viagens', async () => {
      const { adminAuth } = await createTenantOnCountingApp('N1Dashboard');
      const customerRes = await request(countingApp.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', adminAuth)
        .send({ name: 'Cliente N1' })
        .expect(201);
      const customerId = customerRes.body.data.id as string;

      for (let i = 0; i < 5; i += 1) await seedTripWithFinance(adminAuth, customerId);
      queryCount = 0;
      await request(countingApp.getHttpServer()).get('/api/v1/customer-profitability/dashboard').set('Authorization', adminAuth).expect(200);
      const queriesFor5 = queryCount;

      for (let i = 5; i < 20; i += 1) await seedTripWithFinance(adminAuth, customerId);
      queryCount = 0;
      await request(countingApp.getHttpServer()).get('/api/v1/customer-profitability/dashboard').set('Authorization', adminAuth).expect(200);
      const queriesFor20 = queryCount;

      expect(queriesFor20).toBeLessThanOrEqual(queriesFor5 + 1);
    }, 180000);
  });
});
