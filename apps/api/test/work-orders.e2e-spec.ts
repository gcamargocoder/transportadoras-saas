import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 82 -- Ordens de Servico (OS) de manutencao: ciclo de vida dedicado
// (diagnose/submit-for-approval/approve/start/complete/cancel), sobre o
// MESMO VehicleMaintenance ja testado por maintenances.e2e-spec.ts e
// maintenance-vehicle-integration.e2e-spec.ts (nao duplicado aqui). Cobre
// apenas o que e NOVO: as 6 acoes dedicadas, os 2 conflitos de disponibilidade
// (secao 6/18 do pedido), isolamento multi-tenant, RBAC e o historico.
describe('Ordens de Servico / Work Orders (Fase 82, e2e)', () => {
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
      slug: `wo-${label.toLowerCase()}-${unique}`,
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
      .send({ vehicleId, trailers: [] })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createMaintenance(auth: string, vehicleId: string, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/maintenances')
      .set('Authorization', auth)
      .send({ vehicleId, type: 'CORRECTIVE', laborCost: 100, partsCost: 0, ...overrides })
      .expect(201);
    return res.body.data.id as string;
  }

  async function getVehicle(auth: string, id: string) {
    const res = await request(app.getHttpServer()).get(`/api/v1/vehicles/${id}`).set('Authorization', auth).expect(200);
    return res.body.data;
  }

  describe('ciclo de vida completo', () => {
    it('OPEN -> DIAGNOSING -> AWAITING_APPROVAL -> APPROVED -> IN_PROGRESS -> COMPLETED', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('Lifecycle');
      const vehicleId = await createVehicle(auth);
      const id = await createMaintenance(auth, vehicleId);

      const diagnoseRes = await request(app.getHttpServer())
        .post(`/api/v1/maintenances/${id}/diagnose`)
        .set('Authorization', auth)
        .send({ diagnosis: 'Correia dentada desgastada.' })
        .expect(201);
      expect(diagnoseRes.body.data.status).toBe('DIAGNOSING');
      expect(diagnoseRes.body.data.diagnosis).toBe('Correia dentada desgastada.');

      const submitRes = await request(app.getHttpServer())
        .post(`/api/v1/maintenances/${id}/submit-for-approval`)
        .set('Authorization', auth)
        .expect(201);
      expect(submitRes.body.data.status).toBe('AWAITING_APPROVAL');

      const approveRes = await request(app.getHttpServer())
        .post(`/api/v1/maintenances/${id}/approve`)
        .set('Authorization', auth)
        .expect(201);
      expect(approveRes.body.data.status).toBe('APPROVED');

      expect((await getVehicle(auth, vehicleId)).status).toBe('ACTIVE');

      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/maintenances/${id}/start`)
        .set('Authorization', auth)
        .expect(201);
      expect(startRes.body.data.status).toBe('IN_PROGRESS');
      expect(startRes.body.data.startedAt).toBeTruthy();
      expect((await getVehicle(auth, vehicleId)).status).toBe('MAINTENANCE');

      const completeRes = await request(app.getHttpServer())
        .post(`/api/v1/maintenances/${id}/complete`)
        .set('Authorization', auth)
        .send({ completedAt: new Date().toISOString(), completionOdometerKm: 125430 })
        .expect(201);
      expect(completeRes.body.data.status).toBe('COMPLETED');
      expect(completeRes.body.data.completionOdometerKm).toBe(125430);
      expect((await getVehicle(auth, vehicleId)).status).toBe('ACTIVE');
    });
  });

  describe('transicoes invalidas (409)', () => {
    it('diagnose so a partir de OPEN', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('InvalidDiagnose');
      const vehicleId = await createVehicle(auth);
      const id = await createMaintenance(auth, vehicleId);
      await request(app.getHttpServer())
        .post(`/api/v1/maintenances/${id}/diagnose`)
        .set('Authorization', auth)
        .send({ diagnosis: 'x' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/maintenances/${id}/diagnose`)
        .set('Authorization', auth)
        .send({ diagnosis: 'y' })
        .expect(409);
    });

    it('approve exige AWAITING_APPROVAL (nao aceita OPEN direto)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('InvalidApprove');
      const vehicleId = await createVehicle(auth);
      const id = await createMaintenance(auth, vehicleId);
      await request(app.getHttpServer())
        .post(`/api/v1/maintenances/${id}/approve`)
        .set('Authorization', auth)
        .expect(409);
    });

    it('start nao aceita AWAITING_APPROVAL (precisa ser aprovada antes)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('InvalidStart');
      const vehicleId = await createVehicle(auth);
      const id = await createMaintenance(auth, vehicleId);
      await request(app.getHttpServer())
        .post(`/api/v1/maintenances/${id}/submit-for-approval`)
        .set('Authorization', auth)
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/maintenances/${id}/start`)
        .set('Authorization', auth)
        .expect(409);
    });

    it('nenhuma acao e aceita apos CANCELLED (estado terminal)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('InvalidCancelled');
      const vehicleId = await createVehicle(auth);
      const id = await createMaintenance(auth, vehicleId);
      await request(app.getHttpServer()).post(`/api/v1/maintenances/${id}/cancel`).set('Authorization', auth).expect(201);

      await request(app.getHttpServer()).post(`/api/v1/maintenances/${id}/diagnose`).set('Authorization', auth).send({ diagnosis: 'x' }).expect(409);
      await request(app.getHttpServer()).post(`/api/v1/maintenances/${id}/start`).set('Authorization', auth).expect(409);
    });
  });

  describe('conflito de disponibilidade ao iniciar execucao (secao 6/18 do pedido)', () => {
    it('bloqueia start quando o veiculo esta em viagem agora (VehicleAvailabilityService)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('ConflictTrip');
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);
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
          plannedArrival: '2026-09-02T08:00:00.000Z',
        })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripRes.body.data.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      const id = await createMaintenance(auth, vehicleId);
      await request(app.getHttpServer()).post(`/api/v1/maintenances/${id}/start`).set('Authorization', auth).expect(409);
    });

    it('bloqueia start quando ja existe outra OS IN_PROGRESS para o mesmo veiculo', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('ConflictConcurrentOs');
      const vehicleId = await createVehicle(auth);
      const idA = await createMaintenance(auth, vehicleId);
      const idB = await createMaintenance(auth, vehicleId);

      await request(app.getHttpServer()).post(`/api/v1/maintenances/${idA}/start`).set('Authorization', auth).expect(201);
      await request(app.getHttpServer()).post(`/api/v1/maintenances/${idB}/start`).set('Authorization', auth).expect(409);
    });
  });

  describe('isolamento multi-tenant', () => {
    it('OS de outro tenant retorna 404 em todas as acoes novas', async () => {
      const { auth: authA } = await createTenantAndLoginAsAdmin('TenantA');
      const { auth: authB } = await createTenantAndLoginAsAdmin('TenantB');
      const vehicleId = await createVehicle(authA);
      const id = await createMaintenance(authA, vehicleId);

      await request(app.getHttpServer()).post(`/api/v1/maintenances/${id}/diagnose`).set('Authorization', authB).send({ diagnosis: 'x' }).expect(404);
      await request(app.getHttpServer()).post(`/api/v1/maintenances/${id}/submit-for-approval`).set('Authorization', authB).expect(404);
      await request(app.getHttpServer()).post(`/api/v1/maintenances/${id}/approve`).set('Authorization', authB).expect(404);
      await request(app.getHttpServer()).post(`/api/v1/maintenances/${id}/start`).set('Authorization', authB).expect(404);
      await request(app.getHttpServer()).post(`/api/v1/maintenances/${id}/complete`).set('Authorization', authB).expect(404);
      await request(app.getHttpServer()).post(`/api/v1/maintenances/${id}/cancel`).set('Authorization', authB).expect(404);
      await request(app.getHttpServer()).get(`/api/v1/maintenances/${id}/history`).set('Authorization', authB).expect(404);
    });
  });

  describe('RBAC', () => {
    it('DRIVER nao acessa (403) nenhuma acao nem o historico', async () => {
      const { tenantId, auth } = await createTenantAndLoginAsAdmin('RbacDriver');
      const driverAuth = await createUserWithRole(tenantId, auth, 'DRIVER');
      const vehicleId = await createVehicle(auth);
      const id = await createMaintenance(auth, vehicleId);

      await request(app.getHttpServer()).post(`/api/v1/maintenances/${id}/diagnose`).set('Authorization', driverAuth).send({ diagnosis: 'x' }).expect(403);
      await request(app.getHttpServer()).get(`/api/v1/maintenances/${id}/history`).set('Authorization', driverAuth).expect(403);
    });

    it('AUDITOR le o historico (200) mas nao executa acoes de escrita (403)', async () => {
      const { tenantId, auth } = await createTenantAndLoginAsAdmin('RbacAuditor');
      const auditorAuth = await createUserWithRole(tenantId, auth, 'AUDITOR');
      const vehicleId = await createVehicle(auth);
      const id = await createMaintenance(auth, vehicleId);

      await request(app.getHttpServer()).get(`/api/v1/maintenances/${id}/history`).set('Authorization', auditorAuth).expect(200);
      await request(app.getHttpServer()).post(`/api/v1/maintenances/${id}/diagnose`).set('Authorization', auditorAuth).send({ diagnosis: 'x' }).expect(403);
      await request(app.getHttpServer()).post(`/api/v1/maintenances/${id}/start`).set('Authorization', auditorAuth).expect(403);
    });
  });

  describe('GET /maintenances/:id/history', () => {
    it('reflete as acoes do ciclo de vida em ordem', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('History');
      const vehicleId = await createVehicle(auth);
      const id = await createMaintenance(auth, vehicleId);
      await request(app.getHttpServer()).post(`/api/v1/maintenances/${id}/diagnose`).set('Authorization', auth).send({ diagnosis: 'x' }).expect(201);
      await request(app.getHttpServer()).post(`/api/v1/maintenances/${id}/submit-for-approval`).set('Authorization', auth).expect(201);
      await request(app.getHttpServer()).post(`/api/v1/maintenances/${id}/approve`).set('Authorization', auth).expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/maintenances/${id}/history`)
        .set('Authorization', auth)
        .expect(200);

      const actions = (res.body.data.items as { action: string }[]).map((i) => i.action);
      expect(actions).toContain('maintenance.created');
      expect(actions).toContain('maintenance.diagnosing');
      expect(actions).toContain('maintenance.awaiting_approval');
      expect(actions).toContain('maintenance.approved');
    });
  });
});
