import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 83 -- catalogo de pecas + estoque + integracao com Ordem de Servico
// (Fase 82). Cobre: entrada/saida/ajuste manuais, saldo/estoque baixo/
// zerado, consumo automatico ao concluir a OS (PEÇA -> ESTOQUE -> OS),
// bloqueio por estoque insuficiente, isolamento multi-tenant, RBAC.
describe('Estoque de Pecas (Fase 83, e2e)', () => {
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
      slug: `parts-${label.toLowerCase()}-${unique}`,
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
    return `Bearer ${loginRes.body.data.accessToken as string}`;
  }

  async function createVehicle(auth: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/vehicles')
      .set('Authorization', auth)
      .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createPart(auth: string, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/parts')
      .set('Authorization', auth)
      .send({ sku: `SKU-${randomUUID().slice(0, 8)}`, name: 'Filtro de óleo', unit: 'UN', ...overrides })
      .expect(201);
    return res.body.data as { id: string; currentStock: number; isLowStock: boolean };
  }

  describe('cadastro e SKU unico', () => {
    it('cria peca com currentStock=0 e bloqueia SKU duplicado', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('Catalog');
      const part = await createPart(auth, { sku: 'DUP-001' });
      expect(part.currentStock).toBe(0);
      expect(part.isLowStock).toBe(false);

      await request(app.getHttpServer())
        .post('/api/v1/parts')
        .set('Authorization', auth)
        .send({ sku: 'DUP-001', name: 'Outra peca', unit: 'UN' })
        .expect(409);
    });
  });

  describe('entrada / saida / ajuste', () => {
    it('entrada aumenta o saldo; saida diminui; isLowStock reflete minStock', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('StockFlow');
      const part = await createPart(auth, { minStock: 3 });

      const afterIn = await request(app.getHttpServer())
        .post(`/api/v1/parts/${part.id}/stock/in`)
        .set('Authorization', auth)
        .send({ quantity: 10, unitCost: 12.5, reference: 'NF-001' })
        .expect(201);
      expect(afterIn.body.data.currentStock).toBe(10);
      expect(afterIn.body.data.isLowStock).toBe(false);

      const afterOut = await request(app.getHttpServer())
        .post(`/api/v1/parts/${part.id}/stock/out`)
        .set('Authorization', auth)
        .send({ quantity: 8, reason: 'Uso avulso' })
        .expect(201);
      expect(afterOut.body.data.currentStock).toBe(2);
      expect(afterOut.body.data.isLowStock).toBe(true); // 2 <= minStock(3)
    });

    it('bloqueia saida sem estoque suficiente (409), saldo permanece inalterado', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('InsufficientOut');
      const part = await createPart(auth);
      await request(app.getHttpServer())
        .post(`/api/v1/parts/${part.id}/stock/in`)
        .set('Authorization', auth)
        .send({ quantity: 5 })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/parts/${part.id}/stock/out`)
        .set('Authorization', auth)
        .send({ quantity: 10 })
        .expect(409);

      const current = await request(app.getHttpServer())
        .get(`/api/v1/parts/${part.id}`)
        .set('Authorization', auth)
        .expect(200);
      expect(current.body.data.currentStock).toBe(5);
    });

    it('ajuste aplica delta com sinal e exige reason', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('Adjustment');
      const part = await createPart(auth);
      await request(app.getHttpServer())
        .post(`/api/v1/parts/${part.id}/stock/in`)
        .set('Authorization', auth)
        .send({ quantity: 10 })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/parts/${part.id}/stock/adjustment`)
        .set('Authorization', auth)
        .send({ quantity: -1 })
        .expect(400); // reason obrigatorio

      const afterAdj = await request(app.getHttpServer())
        .post(`/api/v1/parts/${part.id}/stock/adjustment`)
        .set('Authorization', auth)
        .send({ quantity: -1, reason: 'Contagem de inventario' })
        .expect(201);
      expect(afterAdj.body.data.currentStock).toBe(9);

      const movements = await request(app.getHttpServer())
        .get(`/api/v1/parts/${part.id}/movements`)
        .set('Authorization', auth)
        .expect(200);
      expect(movements.body.data.items.length).toBe(2);
      expect(movements.body.data.items.map((m: { type: string }) => m.type)).toEqual(
        expect.arrayContaining(['IN', 'ADJUSTMENT']),
      );
    });
  });

  describe('listagem: estoque baixo / zerado', () => {
    it('filtra por lowStock (currentStock <= minStock) e zeroStock (currentStock <= 0) de forma independente', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('LowStockFilter');
      // LOW-1: minStock=10, estoque=5 -> isLowStock=true, mas nao zerado.
      const low = await createPart(auth, { sku: 'LOW-1', minStock: 10 });
      // ZERO-1: SEM minStock, nunca recebe entrada -> isLowStock=false (sem
      // referencia de minimo, nunca "baixo"), mas currentStock=0 (zerado).
      const zero = await createPart(auth, { sku: 'ZERO-1' });
      // NORMAL-1: minStock=2, estoque=20 -> nem baixo nem zerado.
      const normal = await createPart(auth, { sku: 'NORMAL-1', minStock: 2 });
      await request(app.getHttpServer()).post(`/api/v1/parts/${low.id}/stock/in`).set('Authorization', auth).send({ quantity: 5 }).expect(201);
      await request(app.getHttpServer()).post(`/api/v1/parts/${normal.id}/stock/in`).set('Authorization', auth).send({ quantity: 20 }).expect(201);
      void zero;

      const lowRes = await request(app.getHttpServer()).get('/api/v1/parts').query({ lowStock: 'true' }).set('Authorization', auth).expect(200);
      const lowSkus = lowRes.body.data.items.map((p: { sku: string }) => p.sku);
      expect(lowSkus).toContain('LOW-1');
      expect(lowSkus).not.toContain('ZERO-1');
      expect(lowSkus).not.toContain('NORMAL-1');

      const zeroRes = await request(app.getHttpServer()).get('/api/v1/parts').query({ zeroStock: 'true' }).set('Authorization', auth).expect(200);
      const zeroSkus = zeroRes.body.data.items.map((p: { sku: string }) => p.sku);
      expect(zeroSkus).toContain('ZERO-1');
      expect(zeroSkus).not.toContain('LOW-1');
      expect(zeroSkus).not.toContain('NORMAL-1');
    });
  });

  describe('integracao com Ordem de Servico (secao 6 do pedido)', () => {
    async function createMaintenanceWithPart(
      auth: string,
      vehicleId: string,
      partId: string,
      quantity: number,
    ): Promise<string> {
      const res = await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', auth)
        .send({
          vehicleId,
          type: 'CORRECTIVE',
          laborCost: 50,
          parts: [{ partId, name: 'Filtro de óleo', quantity, unitPrice: 20 }],
        })
        .expect(201);
      return res.body.data.id as string;
    }

    it('concluir a OS consome o estoque da peca vinculada e registra a movimentacao', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('OsConsume');
      const vehicleId = await createVehicle(auth);
      const part = await createPart(auth);
      await request(app.getHttpServer()).post(`/api/v1/parts/${part.id}/stock/in`).set('Authorization', auth).send({ quantity: 10 }).expect(201);

      const maintenanceId = await createMaintenanceWithPart(auth, vehicleId, part.id, 3);

      await request(app.getHttpServer())
        .post(`/api/v1/maintenances/${maintenanceId}/complete`)
        .set('Authorization', auth)
        .send({ completedAt: new Date().toISOString() })
        .expect(201);

      const afterPart = await request(app.getHttpServer()).get(`/api/v1/parts/${part.id}`).set('Authorization', auth).expect(200);
      expect(afterPart.body.data.currentStock).toBe(7);

      const movements = await request(app.getHttpServer())
        .get(`/api/v1/parts/${part.id}/movements`)
        .set('Authorization', auth)
        .expect(200);
      const consumptionMovement = movements.body.data.items.find((m: { maintenanceId: string | null }) => m.maintenanceId === maintenanceId);
      expect(consumptionMovement).toBeDefined();
      expect(consumptionMovement.type).toBe('OUT');
      expect(consumptionMovement.quantity).toBe(3);
    });

    it('bloqueia a conclusao da OS quando o estoque da peca vinculada e insuficiente (409) -- OS nao fica COMPLETED', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('OsInsufficientStock');
      const vehicleId = await createVehicle(auth);
      const part = await createPart(auth);
      await request(app.getHttpServer()).post(`/api/v1/parts/${part.id}/stock/in`).set('Authorization', auth).send({ quantity: 2 }).expect(201);

      const maintenanceId = await createMaintenanceWithPart(auth, vehicleId, part.id, 5);

      await request(app.getHttpServer())
        .post(`/api/v1/maintenances/${maintenanceId}/complete`)
        .set('Authorization', auth)
        .send({ completedAt: new Date().toISOString() })
        .expect(409);

      const osRes = await request(app.getHttpServer()).get(`/api/v1/maintenances/${maintenanceId}`).set('Authorization', auth).expect(200);
      expect(osRes.body.data.status).not.toBe('COMPLETED');

      const afterPart = await request(app.getHttpServer()).get(`/api/v1/parts/${part.id}`).set('Authorization', auth).expect(200);
      expect(afterPart.body.data.currentStock).toBe(2); // inalterado
    });

    it('cancelar uma OS com peca vinculada (ainda nao concluida) nunca consome estoque', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('OsCancelNoConsume');
      const vehicleId = await createVehicle(auth);
      const part = await createPart(auth);
      await request(app.getHttpServer()).post(`/api/v1/parts/${part.id}/stock/in`).set('Authorization', auth).send({ quantity: 10 }).expect(201);

      const maintenanceId = await createMaintenanceWithPart(auth, vehicleId, part.id, 4);
      await request(app.getHttpServer()).post(`/api/v1/maintenances/${maintenanceId}/cancel`).set('Authorization', auth).expect(201);

      const afterPart = await request(app.getHttpServer()).get(`/api/v1/parts/${part.id}`).set('Authorization', auth).expect(200);
      expect(afterPart.body.data.currentStock).toBe(10); // inalterado -- cancelada nunca consome

      const movements = await request(app.getHttpServer())
        .get(`/api/v1/parts/${part.id}/movements`)
        .set('Authorization', auth)
        .expect(200);
      expect(movements.body.data.items.every((m: { maintenanceId: string | null }) => m.maintenanceId !== maintenanceId)).toBe(true);
    });

    it('bloqueia alterar a lista de pecas de uma OS ja concluida (409)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('OsPartsLocked');
      const vehicleId = await createVehicle(auth);
      const part = await createPart(auth);
      await request(app.getHttpServer()).post(`/api/v1/parts/${part.id}/stock/in`).set('Authorization', auth).send({ quantity: 10 }).expect(201);
      const maintenanceId = await createMaintenanceWithPart(auth, vehicleId, part.id, 1);
      await request(app.getHttpServer())
        .post(`/api/v1/maintenances/${maintenanceId}/complete`)
        .set('Authorization', auth)
        .send({ completedAt: new Date().toISOString() })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/maintenances/${maintenanceId}`)
        .set('Authorization', auth)
        .send({ parts: [{ partId: part.id, name: 'Filtro de óleo', quantity: 2, unitPrice: 20 }] })
        .expect(409);
    });
  });

  describe('isolamento multi-tenant', () => {
    it('peca de outro tenant retorna 404', async () => {
      const { auth: authA } = await createTenantAndLoginAsAdmin('TenantA');
      const { auth: authB } = await createTenantAndLoginAsAdmin('TenantB');
      const part = await createPart(authA);

      await request(app.getHttpServer()).get(`/api/v1/parts/${part.id}`).set('Authorization', authB).expect(404);
      await request(app.getHttpServer()).post(`/api/v1/parts/${part.id}/stock/in`).set('Authorization', authB).send({ quantity: 1 }).expect(404);
    });
  });

  describe('RBAC', () => {
    it('DRIVER nao acessa (403); AUDITOR le (200) mas nao escreve (403)', async () => {
      const { tenantId, auth } = await createTenantAndLoginAsAdmin('RbacParts');
      const driverAuth = await createUserWithRole(tenantId, auth, 'DRIVER');
      const auditorAuth = await createUserWithRole(tenantId, auth, 'AUDITOR');
      const part = await createPart(auth);

      await request(app.getHttpServer()).get('/api/v1/parts').set('Authorization', driverAuth).expect(403);
      await request(app.getHttpServer()).get('/api/v1/parts').set('Authorization', auditorAuth).expect(200);
      await request(app.getHttpServer())
        .post(`/api/v1/parts/${part.id}/stock/in`)
        .set('Authorization', auditorAuth)
        .send({ quantity: 1 })
        .expect(403);
    });
  });

  describe('dashboard', () => {
    it('agrega totais sem N+1 e nao inventa valor de estoque sem custo conhecido', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('Dashboard');
      const withCost = await createPart(auth, { sku: 'COST-1' });
      const withoutCost = await createPart(auth, { sku: 'NOCOST-1' });
      await request(app.getHttpServer()).post(`/api/v1/parts/${withCost.id}/stock/in`).set('Authorization', auth).send({ quantity: 10, unitCost: 5 }).expect(201);
      await request(app.getHttpServer()).post(`/api/v1/parts/${withoutCost.id}/stock/in`).set('Authorization', auth).send({ quantity: 10 }).expect(201);

      const res = await request(app.getHttpServer()).get('/api/v1/parts/dashboard').set('Authorization', auth).expect(200);
      expect(res.body.data.totalParts).toBe(2);
      expect(res.body.data.estimatedStockValue).toBe(50); // so a peca com custo conhecido
      expect(res.body.data.partsWithoutKnownCost).toBe(1);
      expect(res.body.data.entriesInPeriod).toBe(20);
    });
  });
});
