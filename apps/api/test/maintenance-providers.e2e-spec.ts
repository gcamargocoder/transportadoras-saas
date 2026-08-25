import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 84 -- oficinas e fornecedores (MaintenanceProvider, discriminado por
// `type`) + integracao com a OS (VehicleMaintenance.workshopId/supplierId).
describe('Oficinas e Fornecedores (Fase 84, e2e)', () => {
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
      slug: `mp-${label.toLowerCase()}-${unique}`,
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

  async function createProvider(auth: string, type: 'WORKSHOP' | 'SUPPLIER', overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/maintenance-providers')
      .set('Authorization', auth)
      .send({ type, name: type === 'WORKSHOP' ? 'Oficina Central' : 'Fornecedor ABC', ...overrides })
      .expect(201);
    return res.body.data as { id: string; type: string; isActive: boolean };
  }

  describe('CRUD e documento unico por tenant+type', () => {
    it('cria oficina e fornecedor, lista filtrando por type', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('Crud');
      await createProvider(auth, 'WORKSHOP', { name: 'Oficina A' });
      await createProvider(auth, 'SUPPLIER', { name: 'Fornecedor A' });

      const workshops = await request(app.getHttpServer())
        .get('/api/v1/maintenance-providers')
        .query({ type: 'WORKSHOP' })
        .set('Authorization', auth)
        .expect(200);
      expect(workshops.body.data.items.every((p: { type: string }) => p.type === 'WORKSHOP')).toBe(true);
      expect(workshops.body.data.items.some((p: { name: string }) => p.name === 'Oficina A')).toBe(true);

      const suppliers = await request(app.getHttpServer())
        .get('/api/v1/maintenance-providers')
        .query({ type: 'SUPPLIER' })
        .set('Authorization', auth)
        .expect(200);
      expect(suppliers.body.data.items.every((p: { type: string }) => p.type === 'SUPPLIER')).toBe(true);
    });

    it('bloqueia documento duplicado dentro do mesmo tenant+type, mas permite entre types diferentes', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('DocUnique');
      await createProvider(auth, 'WORKSHOP', { document: '11222333000181' });

      await request(app.getHttpServer())
        .post('/api/v1/maintenance-providers')
        .set('Authorization', auth)
        .send({ type: 'WORKSHOP', name: 'Outra Oficina', document: '11222333000181' })
        .expect(409);

      // Mesmo documento, type diferente -- permitido (entidades logicamente distintas).
      await request(app.getHttpServer())
        .post('/api/v1/maintenance-providers')
        .set('Authorization', auth)
        .send({ type: 'SUPPLIER', name: 'Fornecedor Mesmo CNPJ', document: '11222333000181' })
        .expect(201);
    });

    it('ativa/desativa e bloqueia exclusao quando ha OS vinculada', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('DeleteGuard');
      const vehicleId = await createVehicle(auth);
      const workshop = await createProvider(auth, 'WORKSHOP');

      const deactivateRes = await request(app.getHttpServer())
        .patch(`/api/v1/maintenance-providers/${workshop.id}/status`)
        .set('Authorization', auth)
        .send({ isActive: false })
        .expect(200);
      expect(deactivateRes.body.data.isActive).toBe(false);

      await request(app.getHttpServer())
        .patch(`/api/v1/maintenance-providers/${workshop.id}/status`)
        .set('Authorization', auth)
        .send({ isActive: true })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', auth)
        .send({ vehicleId, type: 'CORRECTIVE', workshopId: workshop.id })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/v1/maintenance-providers/${workshop.id}`)
        .set('Authorization', auth)
        .expect(409);
    });
  });

  describe('associacao com a OS (secao 3/8 do pedido)', () => {
    it('cria OS com workshopId/supplierId validos -- resposta inclui workshopName/supplierName', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('OsAssociation');
      const vehicleId = await createVehicle(auth);
      const workshop = await createProvider(auth, 'WORKSHOP', { name: 'Oficina XPTO' });
      const supplier = await createProvider(auth, 'SUPPLIER', { name: 'Fornecedor XPTO' });

      const res = await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', auth)
        .send({ vehicleId, type: 'CORRECTIVE', workshopId: workshop.id, supplierId: supplier.id })
        .expect(201);

      expect(res.body.data.workshopId).toBe(workshop.id);
      expect(res.body.data.workshopName).toBe('Oficina XPTO');
      expect(res.body.data.supplierId).toBe(supplier.id);
      expect(res.body.data.supplierName).toBe('Fornecedor XPTO');
    });

    it('bloqueia associacao com type errado (fornecedor como workshopId)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('OsWrongType');
      const vehicleId = await createVehicle(auth);
      const supplier = await createProvider(auth, 'SUPPLIER');

      await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', auth)
        .send({ vehicleId, type: 'CORRECTIVE', workshopId: supplier.id })
        .expect(409);
    });

    it('bloqueia associacao com oficina/fornecedor inativo', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('OsInactive');
      const vehicleId = await createVehicle(auth);
      const workshop = await createProvider(auth, 'WORKSHOP');
      await request(app.getHttpServer())
        .patch(`/api/v1/maintenance-providers/${workshop.id}/status`)
        .set('Authorization', auth)
        .send({ isActive: false })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', auth)
        .send({ vehicleId, type: 'CORRECTIVE', workshopId: workshop.id })
        .expect(409);
    });
  });

  describe('resumo/historico (GET /maintenance-providers/:id/summary)', () => {
    it('agrega OS count, veiculos atendidos, custo total e ultima utilizacao', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('Summary');
      const vehicleA = await createVehicle(auth);
      const vehicleB = await createVehicle(auth);
      const workshop = await createProvider(auth, 'WORKSHOP');

      await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', auth)
        .send({ vehicleId: vehicleA, type: 'CORRECTIVE', workshopId: workshop.id, laborCost: 100, partsCost: 0 })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', auth)
        .send({ vehicleId: vehicleB, type: 'CORRECTIVE', workshopId: workshop.id, laborCost: 200, partsCost: 0 })
        .expect(201);

      const summary = await request(app.getHttpServer())
        .get(`/api/v1/maintenance-providers/${workshop.id}/summary`)
        .set('Authorization', auth)
        .expect(200);
      expect(summary.body.data.osCount).toBe(2);
      expect(summary.body.data.vehiclesServedCount).toBe(2);
      expect(summary.body.data.totalCost).toBe(300);
      expect(summary.body.data.lastUsedAt).not.toBeNull();
    });
  });

  describe('isolamento multi-tenant', () => {
    it('oficina/fornecedor de outro tenant retorna 404 e nunca pode ser associado', async () => {
      const { auth: authA } = await createTenantAndLoginAsAdmin('TenantA');
      const { auth: authB } = await createTenantAndLoginAsAdmin('TenantB');
      const workshop = await createProvider(authA, 'WORKSHOP');
      const vehicleB = await createVehicle(authB);

      await request(app.getHttpServer()).get(`/api/v1/maintenance-providers/${workshop.id}`).set('Authorization', authB).expect(404);
      await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', authB)
        .send({ vehicleId: vehicleB, type: 'CORRECTIVE', workshopId: workshop.id })
        .expect(404);
    });
  });

  describe('RBAC', () => {
    it('DRIVER nao acessa (403); AUDITOR le (200) mas nao escreve (403)', async () => {
      const { tenantId, auth } = await createTenantAndLoginAsAdmin('Rbac');
      const driverAuth = await createUserWithRole(tenantId, auth, 'DRIVER');
      const auditorAuth = await createUserWithRole(tenantId, auth, 'AUDITOR');

      await request(app.getHttpServer()).get('/api/v1/maintenance-providers').set('Authorization', driverAuth).expect(403);
      await request(app.getHttpServer()).get('/api/v1/maintenance-providers').set('Authorization', auditorAuth).expect(200);
      await request(app.getHttpServer())
        .post('/api/v1/maintenance-providers')
        .set('Authorization', auditorAuth)
        .send({ type: 'WORKSHOP', name: 'X' })
        .expect(403);
    });
  });
});
