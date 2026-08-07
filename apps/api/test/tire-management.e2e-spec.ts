import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Tire Management (e2e)', () => {
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
      slug: `tire-${label.toLowerCase()}-${unique}`,
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

  async function createTrailer(auth: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/trailers')
      .set('Authorization', auth)
      .send({ plate: randomPlate(), type: 'SEMI_TRAILER' })
      .expect(201);
    return res.body.data.id as string;
  }

  function createTire(auth: string, overrides: Partial<Record<string, unknown>> = {}) {
    return request(app.getHttpServer())
      .post('/api/v1/tires')
      .set('Authorization', auth)
      .send({
        fireNumber: `FG-${randomUUID().slice(0, 10)}`,
        manufacturer: 'Michelin',
        model: 'X Multi Energy Z',
        size: '295/80R22.5',
        initialTreadDepthMm: 18,
        ...overrides,
      });
  }

  describe('CRUD', () => {
    it('cria, consulta, lista, atualiza e exclui um pneu (sem historico)', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Crud');
      const auth = `Bearer ${adminAccessToken}`;

      const createRes = await createTire(auth, { purchasePrice: 2450.9 }).expect(201);
      expect(createRes.body.data.status).toBe('STOCK');
      expect(createRes.body.data.locationType).toBe('STOCK');
      expect(createRes.body.data.currentTreadDepthMm).toBe(18);
      expect(createRes.body.data.createdBy).toBeTruthy();
      const id = createRes.body.data.id;

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/tires/${id}`)
        .set('Authorization', auth)
        .expect(200);
      expect(getRes.body.data.manufacturer).toBe('Michelin');

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/tires')
        .set('Authorization', auth)
        .expect(200);
      expect(listRes.body.data.items.some((t: { id: string }) => t.id === id)).toBe(true);

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/tires/${id}`)
        .set('Authorization', auth)
        .send({ model: 'X Multi Energy Z2' })
        .expect(200);
      expect(updateRes.body.data.model).toBe('X Multi Energy Z2');
      expect(updateRes.body.data.updatedBy).toBeTruthy();

      await request(app.getHttpServer())
        .delete(`/api/v1/tires/${id}`)
        .set('Authorization', auth)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/tires/${id}`)
        .set('Authorization', auth)
        .expect(404);
    });

    it('rejeita numero de fogo duplicado (409) e campos obrigatorios ausentes (400)', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Duplicate');
      const auth = `Bearer ${adminAccessToken}`;

      const fireNumber = `FG-${randomUUID().slice(0, 10)}`;
      await createTire(auth, { fireNumber }).expect(201);
      await createTire(auth, { fireNumber }).expect(409);

      await request(app.getHttpServer())
        .post('/api/v1/tires')
        .set('Authorization', auth)
        .send({ manufacturer: 'Michelin' })
        .expect(400);
    });

    it('bloqueia exclusao de pneu com historico', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('DeleteGuard');
      const auth = `Bearer ${adminAccessToken}`;
      const tireRes = await createTire(auth).expect(201);
      const tireId = tireRes.body.data.id;

      await request(app.getHttpServer())
        .post(`/api/v1/tires/${tireId}/inspections`)
        .set('Authorization', auth)
        .send({ treadDepthMm: 17 })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/v1/tires/${tireId}`)
        .set('Authorization', auth)
        .expect(409);
    });
  });

  describe('Movimentacoes', () => {
    it('move um pneu para um veiculo e depois de volta ao estoque, gerando historico', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Move');
      const auth = `Bearer ${adminAccessToken}`;
      const vehicleId = await createVehicle(auth);
      const tireRes = await createTire(auth).expect(201);
      const tireId = tireRes.body.data.id;

      const moveRes = await request(app.getHttpServer())
        .post(`/api/v1/tires/${tireId}/movements`)
        .set('Authorization', auth)
        .send({
          newLocationType: 'VEHICLE',
          newVehicleId: vehicleId,
          newPosition: 'Dianteiro Esquerdo',
          odometerKm: 50000,
          reason: 'Instalacao inicial',
        })
        .expect(201);
      expect(moveRes.body.data.previousLocationType).toBe('STOCK');
      expect(moveRes.body.data.newLocationType).toBe('VEHICLE');
      expect(moveRes.body.data.newVehicleId).toBe(vehicleId);
      expect(moveRes.body.data.newPosition).toBe('Dianteiro Esquerdo');

      const afterMove = await request(app.getHttpServer())
        .get(`/api/v1/tires/${tireId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(afterMove.body.data.status).toBe('IN_USE');
      expect(afterMove.body.data.locationType).toBe('VEHICLE');
      expect(afterMove.body.data.vehicleId).toBe(vehicleId);
      expect(afterMove.body.data.position).toBe('Dianteiro Esquerdo');

      const backToStock = await request(app.getHttpServer())
        .post(`/api/v1/tires/${tireId}/movements`)
        .set('Authorization', auth)
        .send({ newLocationType: 'STOCK' })
        .expect(201);
      expect(backToStock.body.data.previousVehicleId).toBe(vehicleId);
      expect(backToStock.body.data.newLocationType).toBe('STOCK');

      const afterReturn = await request(app.getHttpServer())
        .get(`/api/v1/tires/${tireId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(afterReturn.body.data.status).toBe('STOCK');
      expect(afterReturn.body.data.vehicleId).toBeNull();
      expect(afterReturn.body.data.position).toBeNull();

      const movementsRes = await request(app.getHttpServer())
        .get(`/api/v1/tires/${tireId}/movements`)
        .set('Authorization', auth)
        .expect(200);
      expect(movementsRes.body.data.items).toHaveLength(2);
    });

    it('nunca permite dois pneus na mesma posicao do mesmo veiculo', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('PositionCollision');
      const auth = `Bearer ${adminAccessToken}`;
      const vehicleId = await createVehicle(auth);

      const tireA = await createTire(auth).expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/tires/${tireA.body.data.id}/movements`)
        .set('Authorization', auth)
        .send({ newLocationType: 'VEHICLE', newVehicleId: vehicleId, newPosition: 'Tracao 1' })
        .expect(201);

      const tireB = await createTire(auth).expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/tires/${tireB.body.data.id}/movements`)
        .set('Authorization', auth)
        .send({ newLocationType: 'VEHICLE', newVehicleId: vehicleId, newPosition: 'Tracao 1' })
        .expect(409);

      // Posicao diferente no mesmo veiculo funciona normalmente.
      await request(app.getHttpServer())
        .post(`/api/v1/tires/${tireB.body.data.id}/movements`)
        .set('Authorization', auth)
        .send({ newLocationType: 'VEHICLE', newVehicleId: vehicleId, newPosition: 'Tracao 2' })
        .expect(201);
    });

    it('move um pneu para uma carreta e rejeita veiculo/carreta inexistentes', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('TrailerMove');
      const auth = `Bearer ${adminAccessToken}`;
      const trailerId = await createTrailer(auth);
      const tireRes = await createTire(auth).expect(201);
      const tireId = tireRes.body.data.id;

      const moveRes = await request(app.getHttpServer())
        .post(`/api/v1/tires/${tireId}/movements`)
        .set('Authorization', auth)
        .send({
          newLocationType: 'TRAILER',
          newTrailerId: trailerId,
          newPosition: 'Eixo 1 Interno',
        })
        .expect(201);
      expect(moveRes.body.data.newTrailerId).toBe(trailerId);

      await request(app.getHttpServer())
        .post(`/api/v1/tires/${tireId}/movements`)
        .set('Authorization', auth)
        .send({ newLocationType: 'VEHICLE', newVehicleId: randomUUID() })
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/v1/tires/${tireId}/movements`)
        .set('Authorization', auth)
        .send({ newLocationType: 'TRAILER', newTrailerId: randomUUID() })
        .expect(404);
    });
  });

  describe('Recapagens', () => {
    it('registra multiplas recapagens e atualiza o status para RETREADED', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Retread');
      const auth = `Bearer ${adminAccessToken}`;
      const tireRes = await createTire(auth).expect(201);
      const tireId = tireRes.body.data.id;

      const retread1 = await request(app.getHttpServer())
        .post(`/api/v1/tires/${tireId}/retreads`)
        .set('Authorization', auth)
        .send({ company: 'Recapadora Central', cost: 650, retreadDate: '2026-01-10' })
        .expect(201);
      expect(retread1.body.data.cost).toBe(650);

      const afterFirst = await request(app.getHttpServer())
        .get(`/api/v1/tires/${tireId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(afterFirst.body.data.status).toBe('RETREADED');

      await request(app.getHttpServer())
        .post(`/api/v1/tires/${tireId}/retreads`)
        .set('Authorization', auth)
        .send({ company: 'Recapadora Sul', cost: 700, retreadDate: '2026-06-10' })
        .expect(201);

      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/tires/${tireId}/retreads`)
        .set('Authorization', auth)
        .expect(200);
      expect(listRes.body.data.items).toHaveLength(2);
      expect(listRes.body.data.meta.total).toBe(2);
    });
  });

  describe('Inspecoes', () => {
    it('registra inspecao e atualiza currentTreadDepthMm automaticamente', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Inspection');
      const auth = `Bearer ${adminAccessToken}`;
      const tireRes = await createTire(auth, {
        initialTreadDepthMm: 18,
        currentTreadDepthMm: 18,
      }).expect(201);
      const tireId = tireRes.body.data.id;

      const inspectionRes = await request(app.getHttpServer())
        .post(`/api/v1/tires/${tireId}/inspections`)
        .set('Authorization', auth)
        .send({ treadDepthMm: 12.5, pressurePsi: 110, notes: 'Desgaste normal' })
        .expect(201);
      expect(inspectionRes.body.data.treadDepthMm).toBe(12.5);

      const afterInspection = await request(app.getHttpServer())
        .get(`/api/v1/tires/${tireId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(afterInspection.body.data.currentTreadDepthMm).toBe(12.5);

      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/tires/${tireId}/inspections`)
        .set('Authorization', auth)
        .expect(200);
      expect(listRes.body.data.items).toHaveLength(1);
    });
  });

  describe('Descarte', () => {
    it('descarta um pneu, atualiza status/localizacao e bloqueia novas operacoes', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Disposal');
      const auth = `Bearer ${adminAccessToken}`;
      const vehicleId = await createVehicle(auth);
      const tireRes = await createTire(auth).expect(201);
      const tireId = tireRes.body.data.id;

      await request(app.getHttpServer())
        .post(`/api/v1/tires/${tireId}/movements`)
        .set('Authorization', auth)
        .send({ newLocationType: 'VEHICLE', newVehicleId: vehicleId, newPosition: 'Tracao 1' })
        .expect(201);

      const disposalRes = await request(app.getHttpServer())
        .post(`/api/v1/tires/${tireId}/disposal`)
        .set('Authorization', auth)
        .send({
          reason: 'Desgaste irreparavel',
          disposalDate: '2026-09-02',
          odometerKm: 145000,
          residualValue: 35,
        })
        .expect(201);
      expect(disposalRes.body.data.reason).toBe('Desgaste irreparavel');

      const afterDisposal = await request(app.getHttpServer())
        .get(`/api/v1/tires/${tireId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(afterDisposal.body.data.status).toBe('SCRAPPED');
      expect(afterDisposal.body.data.locationType).toBe('STOCK');
      expect(afterDisposal.body.data.vehicleId).toBeNull();
      expect(afterDisposal.body.data.position).toBeNull();

      const getDisposalRes = await request(app.getHttpServer())
        .get(`/api/v1/tires/${tireId}/disposal`)
        .set('Authorization', auth)
        .expect(200);
      expect(getDisposalRes.body.data.residualValue).toBe(35);

      await request(app.getHttpServer())
        .post(`/api/v1/tires/${tireId}/disposal`)
        .set('Authorization', auth)
        .send({ reason: 'Segundo descarte', disposalDate: '2026-09-03' })
        .expect(409);

      await request(app.getHttpServer())
        .post(`/api/v1/tires/${tireId}/movements`)
        .set('Authorization', auth)
        .send({ newLocationType: 'VEHICLE', newVehicleId: vehicleId })
        .expect(409);
      await request(app.getHttpServer())
        .post(`/api/v1/tires/${tireId}/retreads`)
        .set('Authorization', auth)
        .send({ company: 'Recapadora X', cost: 500, retreadDate: '2026-09-04' })
        .expect(409);
      await request(app.getHttpServer())
        .post(`/api/v1/tires/${tireId}/inspections`)
        .set('Authorization', auth)
        .send({ treadDepthMm: 2 })
        .expect(409);
    });

    it('retorna 404 ao consultar descarte de um pneu que nunca foi descartado', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('NoDisposal');
      const auth = `Bearer ${adminAccessToken}`;
      const tireRes = await createTire(auth).expect(201);

      await request(app.getHttpServer())
        .get(`/api/v1/tires/${tireRes.body.data.id}/disposal`)
        .set('Authorization', auth)
        .expect(404);
    });
  });

  describe('Historico completo', () => {
    it('consolida movimentacoes, recapagem, inspecao e descarte em uma timeline', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('History');
      const auth = `Bearer ${adminAccessToken}`;
      const vehicleId = await createVehicle(auth);
      const tireRes = await createTire(auth).expect(201);
      const tireId = tireRes.body.data.id;

      await request(app.getHttpServer())
        .post(`/api/v1/tires/${tireId}/movements`)
        .set('Authorization', auth)
        .send({ newLocationType: 'VEHICLE', newVehicleId: vehicleId, newPosition: 'Tracao 1' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/tires/${tireId}/inspections`)
        .set('Authorization', auth)
        .send({ treadDepthMm: 10 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/tires/${tireId}/movements`)
        .set('Authorization', auth)
        .send({ newLocationType: 'STOCK' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/tires/${tireId}/retreads`)
        .set('Authorization', auth)
        .send({ company: 'Recapadora Central', cost: 650, retreadDate: '2026-09-01' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/tires/${tireId}/disposal`)
        .set('Authorization', auth)
        .send({ reason: 'Fim de vida util', disposalDate: '2026-09-05' })
        .expect(201);

      const historyRes = await request(app.getHttpServer())
        .get(`/api/v1/tires/${tireId}/history`)
        .set('Authorization', auth)
        .expect(200);

      const events = historyRes.body.data.events as { type: string }[];
      expect(events).toHaveLength(5); // 2 movimentacoes + 1 inspecao + 1 recapagem + 1 descarte
      expect(events.filter((e) => e.type === 'MOVEMENT')).toHaveLength(2);
      expect(events.filter((e) => e.type === 'INSPECTION')).toHaveLength(1);
      expect(events.filter((e) => e.type === 'RETREAD')).toHaveLength(1);
      expect(events.filter((e) => e.type === 'DISPOSAL')).toHaveLength(1);
      expect(events[0]?.type).toBe('DISPOSAL'); // mais recente primeiro
    });
  });

  describe('GET /tires/dashboard', () => {
    it('agrega quantidade por status, valores e pneus proximos da troca', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Dashboard');
      const auth = `Bearer ${adminAccessToken}`;
      const vehicleId = await createVehicle(auth);

      const stockTire = await createTire(auth, {
        purchasePrice: 1000,
        expectedLifespanKm: 100000,
      }).expect(201);
      const inUseTire = await createTire(auth, {
        purchasePrice: 1200,
        expectedLifespanKm: 120000,
        currentTreadDepthMm: 2, // abaixo do limiar de 3mm -- "proximo da troca"
      }).expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/tires/${inUseTire.body.data.id}/movements`)
        .set('Authorization', auth)
        .send({
          newLocationType: 'VEHICLE',
          newVehicleId: vehicleId,
          newPosition: 'Tracao 1',
          odometerKm: 30000,
        })
        .expect(201);

      const retreadedTire = await createTire(auth, { purchasePrice: 900 }).expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/tires/${retreadedTire.body.data.id}/retreads`)
        .set('Authorization', auth)
        .send({ company: 'Recapadora Central', cost: 650, retreadDate: '2026-01-10' })
        .expect(201);

      const scrappedTire = await createTire(auth, { purchasePrice: 800 }).expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/tires/${scrappedTire.body.data.id}/disposal`)
        .set('Authorization', auth)
        .send({ reason: 'Fim de vida', disposalDate: '2026-09-01' })
        .expect(201);

      const dashboardRes = await request(app.getHttpServer())
        .get('/api/v1/tires/dashboard')
        .set('Authorization', auth)
        .expect(200);

      const dashboard = dashboardRes.body.data;
      expect(dashboard.stockCount).toBe(1);
      expect(dashboard.inUseCount).toBe(1);
      expect(dashboard.scrappedCount).toBe(1);
      expect(dashboard.retreadedTiresCount).toBe(1);
      expect(dashboard.investedValue).toBe(1000 + 1200 + 900 + 800);
      expect(dashboard.retreadValue).toBe(650);
      expect(dashboard.averageLifespanKm).toBeCloseTo((100000 + 120000) / 2, 5);
      expect(dashboard.nearReplacementCount).toBe(1);
      expect(
        dashboard.countByStatus.reduce((sum: number, g: { count: number }) => sum + g.count, 0),
      ).toBe(4);
    });
  });

  describe('isolamento multi-tenant', () => {
    it('nunca permite acesso cruzado entre tenants', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolA');
      const authA = `Bearer ${tenantA.adminAccessToken}`;
      const tireRes = await createTire(authA).expect(201);

      const tenantB = await createTenantAndLoginAsAdmin('IsolB');
      const authB = `Bearer ${tenantB.adminAccessToken}`;

      await request(app.getHttpServer())
        .get(`/api/v1/tires/${tireRes.body.data.id}`)
        .set('Authorization', authB)
        .expect(404);

      const listInB = await request(app.getHttpServer())
        .get('/api/v1/tires')
        .set('Authorization', authB)
        .expect(200);
      expect(listInB.body.data.items).toHaveLength(0);

      const dashboardB = await request(app.getHttpServer())
        .get('/api/v1/tires/dashboard')
        .set('Authorization', authB)
        .expect(200);
      expect(dashboardB.body.data.stockCount).toBe(0);
    });
  });

  describe('RBAC', () => {
    it('OPERATOR/AUDITOR leem mas nao escrevem (403); ADMIN/MANAGER escrevem', async () => {
      const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('Rbac');
      const adminAuth = `Bearer ${adminAccessToken}`;

      const managerAuth = await createUserWithRole(tenantId, adminAuth, 'MANAGER');
      const managerTire = await createTire(managerAuth).expect(201);
      expect(managerTire.body.data.id).toBeTruthy();

      for (const role of ['OPERATOR', 'AUDITOR']) {
        const auth = await createUserWithRole(tenantId, adminAuth, role);
        await request(app.getHttpServer())
          .get('/api/v1/tires')
          .set('Authorization', auth)
          .expect(200);
        await createTire(auth).expect(403);
      }
    });
  });

  describe('auditoria', () => {
    it('registra quem, quando, IP, User-Agent, tenant, antes e depois em cada mutacao', async () => {
      const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('Audit');
      const auth = `Bearer ${adminAccessToken}`;
      const vehicleId = await createVehicle(auth);
      const tireRes = await createTire(auth).expect(201);
      const tireId = tireRes.body.data.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/tires/${tireId}`)
        .set('Authorization', auth)
        .set('User-Agent', 'jest-e2e-agent')
        .send({ model: 'Novo modelo' })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/v1/tires/${tireId}/movements`)
        .set('Authorization', auth)
        .send({ newLocationType: 'VEHICLE', newVehicleId: vehicleId })
        .expect(201);

      const logs = await prisma.auditLog.findMany({
        where: { tenantId, entityName: 'Tire', entityId: tireId },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs.map((l) => l.action)).toEqual(['tire.created', 'tire.updated', 'tire.moved']);
      for (const log of logs) {
        expect(log.tenantId).toBe(tenantId);
        expect(log.userId).toBeTruthy();
        expect(log.ipAddress).toBeTruthy();
      }
      const updateLog = logs.find((l) => l.action === 'tire.updated');
      expect(updateLog?.deviceInfo).toBe('jest-e2e-agent');
      expect(updateLog?.previousValue).toBeTruthy();
      expect(updateLog?.newValue).toBeTruthy();
    });
  });
});
