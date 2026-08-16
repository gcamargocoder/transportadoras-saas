import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Iteracao de redesign visual -- dashboard de pneus (GET
// /fleet-operations/tires). Distinto de GET /tires/dashboard
// (TiresService.getDashboard, sem filtro, ja coberto por
// tire-management.e2e-spec.ts e reaproveitado tal como esta no card
// "Pneus" do executivo -- nao alterado). Este arquivo so cobre o que e
// genuinamente novo: filtros, breakdown por frota, evolucao mensal, gauge
// de desgaste (leitura direta de inspecao) e ranking por veiculo.
describe('Fleet Operations Tires Overview (e2e)', () => {
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

  async function createTenantAndLoginAsAdmin(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    const payload = {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `tire-fops-${label.toLowerCase()}-${unique}`,
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

  async function createTire(auth: string, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tires')
      .set('Authorization', auth)
      .send({
        fireNumber: `FG-${randomUUID().slice(0, 10)}`,
        manufacturer: 'Michelin',
        model: 'X Multi Energy Z',
        size: '295/80R22.5',
        initialTreadDepthMm: 18,
        ...overrides,
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function mountTireOnVehicle(auth: string, tireId: string, vehicleId: string, position = 'Dianteiro Esquerdo') {
    await request(app.getHttpServer())
      .post(`/api/v1/tires/${tireId}/movements`)
      .set('Authorization', auth)
      .send({ newLocationType: 'VEHICLE', newVehicleId: vehicleId, newPosition: position, odometerKm: 50000, reason: 'Instalacao' })
      .expect(201);
  }

  async function inspectTire(auth: string, tireId: string, treadDepthMm: number) {
    await request(app.getHttpServer())
      .post(`/api/v1/tires/${tireId}/inspections`)
      .set('Authorization', auth)
      .send({ treadDepthMm })
      .expect(201);
  }

  async function retreadTire(auth: string, tireId: string, cost: number, retreadDate: string) {
    await request(app.getHttpServer())
      .post(`/api/v1/tires/${tireId}/retreads`)
      .set('Authorization', auth)
      .send({ company: 'Recapadora Central', cost, retreadDate })
      .expect(201);
  }

  // ==========================================================================
  // Estado vazio
  // ==========================================================================
  describe('estado vazio', () => {
    it('retorna contagens/custos zerados, medias indisponiveis e listas vazias (nunca NaN)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Empty');

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/tires')
        .set('Authorization', adminAuth)
        .expect(200);
      const data = res.body.data;

      expect(data).toMatchObject({
        totalTires: 0,
        newCount: 0,
        inUseCount: 0,
        stockCount: 0,
        retreadedCount: 0,
        scrappedCount: 0,
        investedValue: 0,
        retreadValue: 0,
        averageLifespanKm: null,
        nearReplacementCount: 0,
      });
      expect(data.byStatus).toEqual([]);
      expect(data.byFleet).toEqual([]);
      expect(data.monthlyTrendCost).toHaveLength(12);
      expect(data.tireWear).toEqual([]);
      expect(data.topVehiclesByTireCost).toEqual([]);
      expect(data.tireAlerts).toEqual([]);
    });
  });

  // ==========================================================================
  // Composicao real por status + byFleet (com "Sem frota")
  // ==========================================================================
  describe('composicao real', () => {
    it('conta por status e agrupa por frota (so pneus montados), com "Sem frota"', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Composition');
      const fleetA = await createFleet(adminAuth, { name: 'Frota SP' });
      const vehicleWithFleet = await createVehicle(adminAuth, { fleetId: fleetA });
      const vehicleNoFleet = await createVehicle(adminAuth);

      await createTire(adminAuth); // STOCK

      const mountedA = await createTire(adminAuth, { purchasePrice: 1000 });
      await mountTireOnVehicle(adminAuth, mountedA, vehicleWithFleet);

      const mountedNoFleet = await createTire(adminAuth, { purchasePrice: 500 });
      await mountTireOnVehicle(adminAuth, mountedNoFleet, vehicleNoFleet);

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/tires')
        .set('Authorization', adminAuth)
        .expect(200);
      const data = res.body.data;

      expect(data.totalTires).toBe(3);
      expect(data.stockCount).toBe(1);
      expect(data.inUseCount).toBe(2);

      const byFleet = data.byFleet as { fleetId: string | null; fleetName: string; count: number; cost: number }[];
      expect(byFleet.find((f) => f.fleetId === fleetA)).toMatchObject({ fleetName: 'Frota SP', count: 1, cost: 1000 });
      expect(byFleet.find((f) => f.fleetId === null)).toMatchObject({ fleetName: 'Sem frota', count: 1, cost: 500 });
    });
  });

  // ==========================================================================
  // Custo investido/recapagem com filtro de periodo
  // ==========================================================================
  describe('custo investido e de recapagem', () => {
    it('soma purchasePrice/retreadCost no periodo filtrado', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Cost');
      await createTire(adminAuth, { purchasePrice: 800, purchaseDate: '2026-02-01' });
      const outOfRange = await createTire(adminAuth, { purchasePrice: 900, purchaseDate: '2025-01-01' });
      await retreadTire(adminAuth, outOfRange, 300, '2026-02-05');

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/tires?startDate=2026-02-01&endDate=2026-02-28')
        .set('Authorization', adminAuth)
        .expect(200);

      expect(res.body.data.investedValue).toBe(800);
      expect(res.body.data.retreadValue).toBe(300);

      const unfiltered = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/tires')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(unfiltered.body.data.investedValue).toBe(1700);
    });
  });

  // ==========================================================================
  // Desgaste (tireWear) disponivel/indisponivel + ordenacao
  // ==========================================================================
  describe('desgaste dos pneus (tireWear)', () => {
    it('calcula wearPercentRemaining a partir da inspecao mais recente; indisponivel sem initialTreadDepthMm', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Wear');
      const vehicle = await createVehicle(adminAuth);

      const worn = await createTire(adminAuth, { initialTreadDepthMm: 20 });
      await mountTireOnVehicle(adminAuth, worn, vehicle);
      await inspectTire(adminAuth, worn, 5); // 5/20 = 25%

      const fresh = await createTire(adminAuth, { initialTreadDepthMm: 20 });
      await mountTireOnVehicle(adminAuth, fresh, vehicle, 'Dianteiro Direito'); // 20/20 = 100% (sem inspecao adicional)

      const noInitial = await createTire(adminAuth, { initialTreadDepthMm: undefined });
      await mountTireOnVehicle(adminAuth, noInitial, vehicle, 'Traseiro Esquerdo');

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/tires')
        .set('Authorization', adminAuth)
        .expect(200);
      const tireWear = res.body.data.tireWear as {
        tireId: string;
        wearPercentRemaining: number | null;
        available: boolean;
        reason: string | null;
      }[];

      expect(tireWear).toHaveLength(3);
      // Ordenado por wearPercentRemaining ascendente entre disponiveis; indisponivel por ultimo.
      expect(tireWear[0]).toMatchObject({ tireId: worn, wearPercentRemaining: 25, available: true, reason: null });
      expect(tireWear[1]).toMatchObject({ tireId: fresh, wearPercentRemaining: 100, available: true, reason: null });
      expect(tireWear[2]).toMatchObject({ tireId: noInitial, wearPercentRemaining: null, available: false, reason: 'INITIAL_TREAD_DEPTH_NOT_CONFIGURED' });
    });
  });

  // ==========================================================================
  // nearReplacementCount / tireAlerts a partir do threshold real
  // ==========================================================================
  describe('alerta de proximidade de troca', () => {
    it('gera TIRE_NEAR_REPLACEMENT so para pneus IN_USE com currentTreadDepthMm <= 3mm', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('NearReplacement');
      const vehicle = await createVehicle(adminAuth);

      const critical = await createTire(adminAuth, { initialTreadDepthMm: 20 });
      await mountTireOnVehicle(adminAuth, critical, vehicle);
      await inspectTire(adminAuth, critical, 2);

      const ok = await createTire(adminAuth, { initialTreadDepthMm: 20 });
      await mountTireOnVehicle(adminAuth, ok, vehicle, 'Dianteiro Direito');
      await inspectTire(adminAuth, ok, 15);

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/tires')
        .set('Authorization', adminAuth)
        .expect(200);
      const data = res.body.data;

      expect(data.nearReplacementCount).toBe(1);
      const alert = data.tireAlerts.find((a: { type: string; vehicleId: string }) => a.type === 'TIRE_NEAR_REPLACEMENT' && a.vehicleId === vehicle);
      expect(alert).toMatchObject({ severity: 'ATTENTION', value: 2 });
    });
  });

  // ==========================================================================
  // Ranking de veiculos por custo de pneu -- so purchasePrice, sem recapagem
  // ==========================================================================
  describe('ranking de veiculos por custo de pneu', () => {
    it('ranqueia por soma de purchasePrice dos pneus montados, sem incluir recapagem', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Ranking');
      const high = await createVehicle(adminAuth);
      const low = await createVehicle(adminAuth);

      const highTire = await createTire(adminAuth, { purchasePrice: 2000 });
      await mountTireOnVehicle(adminAuth, highTire, high);
      // Recapagem so muda o status (RETREADED) -- vehicleId permanece o
      // mesmo (createRetread nunca toca locationType/vehicleId). O custo
      // de 9999 NAO deve entrar no ranking (so purchasePrice conta).
      await retreadTire(adminAuth, highTire, 9999, '2026-01-01');

      const lowTire = await createTire(adminAuth, { purchasePrice: 100 });
      await mountTireOnVehicle(adminAuth, lowTire, low);

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/tires')
        .set('Authorization', adminAuth)
        .expect(200);
      const ranking = res.body.data.topVehiclesByTireCost as { vehicleId: string; value: number }[];

      expect(ranking[0]).toMatchObject({ vehicleId: high, value: 2000 });
      expect(ranking.find((r) => r.vehicleId === low)).toMatchObject({ value: 100 });
    });
  });

  // ==========================================================================
  // Evolucao mensal (sempre ultimos 12 meses)
  // ==========================================================================
  describe('evolucao mensal (monthlyTrendCost)', () => {
    it('inclui no ultimo balde uma compra lancada agora', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Trend');
      const now = new Date().toISOString();
      await createTire(adminAuth, { purchasePrice: 450, purchaseDate: now });

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/tires')
        .set('Authorization', adminAuth)
        .expect(200);

      expect(res.body.data.monthlyTrendCost).toHaveLength(12);
      expect(res.body.data.monthlyTrendCost[11].value).toBe(450);
    });
  });

  // ==========================================================================
  // Filtros: vehicleId, fleetId, tireStatus
  // ==========================================================================
  describe('filtros', () => {
    it('filtra por vehicleId, fleetId e tireStatus', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Filters');
      const fleetA = await createFleet(adminAuth);
      const vehicleA = await createVehicle(adminAuth, { fleetId: fleetA });
      const vehicleB = await createVehicle(adminAuth);

      const tireA = await createTire(adminAuth);
      await mountTireOnVehicle(adminAuth, tireA, vehicleA);
      const tireB = await createTire(adminAuth);
      await mountTireOnVehicle(adminAuth, tireB, vehicleB);
      await createTire(adminAuth); // STOCK, sem veiculo

      const byVehicle = await request(app.getHttpServer())
        .get(`/api/v1/fleet-operations/tires?vehicleId=${vehicleA}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byVehicle.body.data.totalTires).toBe(1);

      const byFleet = await request(app.getHttpServer())
        .get(`/api/v1/fleet-operations/tires?fleetId=${fleetA}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byFleet.body.data.totalTires).toBe(1);

      const byStatus = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/tires?tireStatus=STOCK')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byStatus.body.data.totalTires).toBe(1);
      expect(byStatus.body.data.stockCount).toBe(1);

      const unfiltered = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/tires')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(unfiltered.body.data.totalTires).toBe(3);
    });
  });

  // ==========================================================================
  // Isolamento multi-tenant
  // ==========================================================================
  describe('isolamento multi-tenant', () => {
    it('tenant B nunca ve pneus do tenant A', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolA');
      await createTire(tenantA.adminAuth, { purchasePrice: 500 });

      const tenantB = await createTenantAndLoginAsAdmin('IsolB');
      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/tires')
        .set('Authorization', tenantB.adminAuth)
        .expect(200);

      expect(res.body.data.totalTires).toBe(0);
      expect(res.body.data.investedValue).toBe(0);
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
          .get('/api/v1/fleet-operations/tires')
          .set('Authorization', auth)
          .expect(200);
      }

      await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/tires')
        .set('Authorization', adminAuth) // SUPER_ADMIN
        .expect(200);

      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/tires')
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
        slug: `tire-n1-${label.toLowerCase()}-${unique}`,
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

    async function seedMountedTire(adminAuth: string, fleetId: string) {
      const vehicleRes = await request(countingApp.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', adminAuth)
        .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT', fleetId })
        .expect(201);
      const vehicleId = vehicleRes.body.data.id as string;

      const tireRes = await request(countingApp.getHttpServer())
        .post('/api/v1/tires')
        .set('Authorization', adminAuth)
        .send({
          fireNumber: `FG-${randomUUID().slice(0, 10)}`,
          manufacturer: 'Michelin',
          model: 'X Multi Energy Z',
          size: '295/80R22.5',
          initialTreadDepthMm: 18,
          purchasePrice: 1000,
        })
        .expect(201);
      const tireId = tireRes.body.data.id as string;

      await request(countingApp.getHttpServer())
        .post(`/api/v1/tires/${tireId}/movements`)
        .set('Authorization', adminAuth)
        .send({ newLocationType: 'VEHICLE', newVehicleId: vehicleId, newPosition: 'Dianteiro Esquerdo', odometerKm: 50000, reason: 'Instalacao' })
        .expect(201);
    }

    it('a contagem de queries de GET /fleet-operations/tires nao cresce entre 10 e 50 pneus', async () => {
      const { adminAuth } = await createTenantAndLoginOnCountingApp('N1Check');
      const fleetRes = await request(countingApp.getHttpServer())
        .post('/api/v1/fleets')
        .set('Authorization', adminAuth)
        .send({ name: `Frota ${randomUUID()}`, type: 'OWN' })
        .expect(201);
      const fleetId = fleetRes.body.data.id as string;

      for (let i = 0; i < 10; i += 1) {
        await seedMountedTire(adminAuth, fleetId);
      }
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/fleet-operations/tires')
        .set('Authorization', adminAuth)
        .expect(200);
      const queriesFor10 = queryCount;
      expect(queriesFor10).toBeGreaterThan(0);

      for (let i = 0; i < 40; i += 1) {
        await seedMountedTire(adminAuth, fleetId);
      }
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/fleet-operations/tires')
        .set('Authorization', adminAuth)
        .expect(200);
      const queriesFor50 = queryCount;

      expect(queriesFor50).toBeLessThanOrEqual(queriesFor10 + 1);
    }, 120000);
  });
});
