import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 64 -- gaps reais identificados na auditoria do modulo de pneus
// (ja maduro desde a Fase 20): (a) GET /vehicles/:id/overview nao mostrava
// nada sobre os pneus do veiculo, (b) GET /tires/:id nao tinha indicadores
// de vida util (secao 10 do pedido), (c) GET /fleet-operations/tires nao
// tinha "pneus por posicao" nem "custo medio por pneu". CRUD/movimentacao/
// recapagem/inspecao/descarte/isolamento/RBAC ja cobertos por
// tire-management.e2e-spec.ts e fleet-operations-tires.e2e-spec.ts -- nao
// duplicados aqui.
describe('Pneus <-> Veiculo (Fase 64, e2e)', () => {
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

  function randomCnpj(): string {
    return Array.from({ length: 14 }, () => Math.floor(Math.random() * 10)).join('');
  }

  function randomPlate(): string {
    const letters = Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
    const digits = Math.floor(1000 + Math.random() * 9000);
    return `${letters}${digits}`;
  }

  async function createTenantAndLoginAsAdmin(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    const payload = {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `tvi-${label.toLowerCase()}-${unique}`,
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
    return { tenantId, auth: `Bearer ${loginRes.body.data.accessToken as string}` };
  }

  async function createVehicle(auth: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/vehicles')
      .set('Authorization', auth)
      .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createTire(auth: string, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tires')
      .set('Authorization', auth)
      .send({
        fireNumber: `FG-${randomUUID()}`,
        manufacturer: 'Michelin',
        model: 'X Multi',
        size: '295/80R22.5',
        purchasePrice: 1500,
        initialTreadDepthMm: 20,
        ...overrides,
      })
      .expect(201);
    return res.body.data.id as string;
  }

  function installOnVehicle(
    auth: string,
    tireId: string,
    vehicleId: string,
    overrides: Partial<Record<string, unknown>> = {},
  ) {
    return request(app.getHttpServer())
      .post(`/api/v1/tires/${tireId}/movements`)
      .set('Authorization', auth)
      .send({ newLocationType: 'VEHICLE', newVehicleId: vehicleId, newPosition: 'Dianteiro Esquerdo', ...overrides })
      .expect(201);
  }

  describe('GET /vehicles/:id/overview -- pneus montados', () => {
    it('mostra pneus montados, contagem e alerta de proximidade de troca', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('OverviewTires');
      const vehicleId = await createVehicle(auth);

      const wornTireId = await createTire(auth, { currentTreadDepthMm: 2 });
      await installOnVehicle(auth, wornTireId, vehicleId, { newPosition: 'Dianteiro Esquerdo' });

      const okTireId = await createTire(auth, { currentTreadDepthMm: 15 });
      await installOnVehicle(auth, okTireId, vehicleId, { newPosition: 'Dianteiro Direito' });

      const overviewRes = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleId}/overview`)
        .set('Authorization', auth)
        .expect(200);

      const overview = overviewRes.body.data;
      expect(overview.tires).toHaveLength(2);
      expect(overview.metrics.tiresCount).toBe(2);
      expect(overview.metrics.tiresNearReplacement).toBe(1);

      const wornEntry = overview.tires.find((t: { tireId: string }) => t.tireId === wornTireId);
      expect(wornEntry).toMatchObject({ position: 'Dianteiro Esquerdo', currentTreadDepthMm: 2 });
      expect(wornEntry.installedAt).toBeTruthy();

      const alertTypes = (overview.alerts as { type: string }[]).map((a) => a.type);
      expect(alertTypes).toContain('VEHICLE_TIRE_NEAR_REPLACEMENT');
    });

    it('pneu descartado nunca aparece na lista de pneus montados do veiculo', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('OverviewScrapped');
      const vehicleId = await createVehicle(auth);
      const tireId = await createTire(auth);
      await installOnVehicle(auth, tireId, vehicleId);

      await request(app.getHttpServer())
        .post(`/api/v1/tires/${tireId}/disposal`)
        .set('Authorization', auth)
        .send({ reason: 'Danificado', disposalDate: new Date().toISOString() })
        .expect(201);

      const overviewRes = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleId}/overview`)
        .set('Authorization', auth)
        .expect(200);
      expect(overviewRes.body.data.tires).toHaveLength(0);
      expect(overviewRes.body.data.metrics.tiresCount).toBe(0);
    });
  });

  describe('GET /tires/:id -- indicadores de vida util (lifecycle)', () => {
    it('calcula totalCost (compra + recapagens) e interventionsCount (recapagens + inspecoes)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('LifecycleCost');
      const tireId = await createTire(auth, { purchasePrice: 1000 });

      await request(app.getHttpServer())
        .post(`/api/v1/tires/${tireId}/retreads`)
        .set('Authorization', auth)
        .send({ company: 'Recapadora XYZ', cost: 300, retreadDate: new Date().toISOString() })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/tires/${tireId}/inspections`)
        .set('Authorization', auth)
        .send({ treadDepthMm: 10 })
        .expect(201);

      const res = await request(app.getHttpServer()).get(`/api/v1/tires/${tireId}`).set('Authorization', auth).expect(200);
      expect(res.body.data.lifecycle).toMatchObject({ totalCost: 1300, interventionsCount: 2 });
    });

    it('daysInstalled fica null enquanto o pneu esta em estoque; nao-null apos instalar', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('LifecycleDays');
      const vehicleId = await createVehicle(auth);
      const tireId = await createTire(auth);

      const beforeInstall = await request(app.getHttpServer()).get(`/api/v1/tires/${tireId}`).set('Authorization', auth).expect(200);
      expect(beforeInstall.body.data.lifecycle.daysInstalled).toBeNull();

      await installOnVehicle(auth, tireId, vehicleId);

      const afterInstall = await request(app.getHttpServer()).get(`/api/v1/tires/${tireId}`).set('Authorization', auth).expect(200);
      expect(afterInstall.body.data.lifecycle.daysInstalled).toBeGreaterThanOrEqual(0);
    });

    it('costPerKm indisponivel com menos de 2 leituras de odometro; disponivel com 2+', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('LifecycleCostPerKm');
      const vehicleId = await createVehicle(auth);
      const tireId = await createTire(auth, { purchasePrice: 1000 });

      const oneReading = await request(app.getHttpServer()).get(`/api/v1/tires/${tireId}`).set('Authorization', auth).expect(200);
      expect(oneReading.body.data.lifecycle.costPerKm).toMatchObject({ available: false, value: null });

      await installOnVehicle(auth, tireId, vehicleId, { odometerKm: 100000 });
      await request(app.getHttpServer())
        .post(`/api/v1/tires/${tireId}/movements`)
        .set('Authorization', auth)
        .send({ newLocationType: 'STOCK', odometerKm: 105000 })
        .expect(201);

      const twoReadings = await request(app.getHttpServer()).get(`/api/v1/tires/${tireId}`).set('Authorization', auth).expect(200);
      expect(twoReadings.body.data.lifecycle.costPerKm).toMatchObject({ available: true, value: 1000 / 5000 });
    });

    it('GET /tires (listagem) nunca calcula lifecycle -- sempre null', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('LifecycleListNull');
      await createTire(auth);

      const res = await request(app.getHttpServer()).get('/api/v1/tires').set('Authorization', auth).expect(200);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      for (const item of res.body.data.items) {
        expect(item.lifecycle).toBeNull();
      }
    });
  });

  describe('GET /fleet-operations/tires -- byPosition e averageCostPerTire', () => {
    it('agrupa por posicao (so pneus montados em veiculo) e calcula custo medio', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('DashboardPosition');
      const vehicleA = await createVehicle(auth);
      const vehicleB = await createVehicle(auth);

      const tireA = await createTire(auth, { purchasePrice: 1000 });
      await installOnVehicle(auth, tireA, vehicleA, { newPosition: 'Dianteiro Esquerdo' });
      const tireB = await createTire(auth, { purchasePrice: 2000 });
      await installOnVehicle(auth, tireB, vehicleB, { newPosition: 'Dianteiro Esquerdo' });
      const tireC = await createTire(auth, { purchasePrice: 500 }); // em estoque, nunca conta em byPosition

      const res = await request(app.getHttpServer()).get('/api/v1/fleet-operations/tires').set('Authorization', auth).expect(200);
      const dashboard = res.body.data;

      const position = (dashboard.byPosition as { position: string; count: number }[]).find(
        (p) => p.position === 'Dianteiro Esquerdo',
      );
      expect(position).toMatchObject({ count: 2 });
      expect(dashboard.averageCostPerTire).toBeCloseTo((1000 + 2000 + 500) / 3, 5);
      expect(tireC).toEqual(expect.any(String));
    });

    it('averageCostPerTire fica null sem nenhum pneu (nunca dividir por zero)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('DashboardEmpty');
      const res = await request(app.getHttpServer()).get('/api/v1/fleet-operations/tires').set('Authorization', auth).expect(200);
      expect(res.body.data.averageCostPerTire).toBeNull();
      expect(res.body.data.byPosition).toEqual([]);
    });
  });
});
