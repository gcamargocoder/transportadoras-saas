import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 63 -- integracao manutencao <-> disponibilidade/bloqueio de viagem
// (secoes 3, 8 e 9 do pedido). CRUD basico de VehicleMaintenance ja e
// coberto por maintenances.e2e-spec.ts e o dashboard/planos por
// fleet-maintenance.e2e-spec.ts -- aqui: (a) validacao de transicao de
// status, (b) sincronizacao automatica de Vehicle.status/disponibilidade
// quando uma manutencao fica IN_PROGRESS/deixa de estar, (c) bloqueio real
// de nova viagem por essa via, (d) alertas granulares do overview, (e) os
// dois novos indicadores do dashboard agregado.
describe('Manutencao <-> Veiculo (Fase 63, e2e)', () => {
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
      slug: `mvi-${label.toLowerCase()}-${unique}`,
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

  function setMaintenanceStatus(auth: string, id: string, status: string, extra: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .patch(`/api/v1/maintenances/${id}/status`)
      .set('Authorization', auth)
      .send({ status, ...extra });
  }

  async function getVehicle(auth: string, id: string) {
    const res = await request(app.getHttpServer()).get(`/api/v1/vehicles/${id}`).set('Authorization', auth).expect(200);
    return res.body.data;
  }

  describe('validacao de transicao de status', () => {
    it('rejeita qualquer alteracao apos COMPLETED (409)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('TransCompleted');
      const vehicleId = await createVehicle(auth);
      const maintenanceId = await createMaintenance(auth, vehicleId);
      await setMaintenanceStatus(auth, maintenanceId, 'COMPLETED', { completedAt: new Date().toISOString() }).expect(200);

      await setMaintenanceStatus(auth, maintenanceId, 'IN_PROGRESS').expect(409);
      await setMaintenanceStatus(auth, maintenanceId, 'OPEN').expect(409);
    });

    it('rejeita qualquer alteracao apos CANCELLED (409)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('TransCancelled');
      const vehicleId = await createVehicle(auth);
      const maintenanceId = await createMaintenance(auth, vehicleId);
      await setMaintenanceStatus(auth, maintenanceId, 'CANCELLED').expect(200);

      await setMaintenanceStatus(auth, maintenanceId, 'IN_PROGRESS').expect(409);
      await setMaintenanceStatus(auth, maintenanceId, 'OPEN').expect(409);
    });
  });

  describe('sincronizacao Vehicle.status/disponibilidade', () => {
    it('IN_PROGRESS torna o veiculo MAINTENANCE/indisponivel; concluir reverte para ACTIVE/disponivel', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('SyncBasic');
      const vehicleId = await createVehicle(auth);
      expect((await getVehicle(auth, vehicleId)).status).toBe('ACTIVE');
      expect((await getVehicle(auth, vehicleId)).availability).toBe('AVAILABLE');

      const maintenanceId = await createMaintenance(auth, vehicleId);
      await setMaintenanceStatus(auth, maintenanceId, 'IN_PROGRESS').expect(200);

      const duringVehicle = await getVehicle(auth, vehicleId);
      expect(duringVehicle.status).toBe('MAINTENANCE');
      expect(duringVehicle.availability).toBe('UNAVAILABLE');

      await setMaintenanceStatus(auth, maintenanceId, 'COMPLETED', { completedAt: new Date().toISOString() }).expect(200);

      const afterVehicle = await getVehicle(auth, vehicleId);
      expect(afterVehicle.status).toBe('ACTIVE');
      expect(afterVehicle.availability).toBe('AVAILABLE');
    });

    it('cancelar a manutencao tambem reverte o veiculo para ACTIVE', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('SyncCancel');
      const vehicleId = await createVehicle(auth);
      const maintenanceId = await createMaintenance(auth, vehicleId);
      await setMaintenanceStatus(auth, maintenanceId, 'IN_PROGRESS').expect(200);
      expect((await getVehicle(auth, vehicleId)).status).toBe('MAINTENANCE');

      await setMaintenanceStatus(auth, maintenanceId, 'CANCELLED').expect(200);
      expect((await getVehicle(auth, vehicleId)).status).toBe('ACTIVE');
    });

    it('duas manutencoes IN_PROGRESS simultaneas: concluir uma mantem o veiculo em MAINTENANCE ate a outra tambem resolver', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('SyncMultiple');
      const vehicleId = await createVehicle(auth);
      const maintenanceA = await createMaintenance(auth, vehicleId);
      const maintenanceB = await createMaintenance(auth, vehicleId);
      await setMaintenanceStatus(auth, maintenanceA, 'IN_PROGRESS').expect(200);
      await setMaintenanceStatus(auth, maintenanceB, 'IN_PROGRESS').expect(200);
      expect((await getVehicle(auth, vehicleId)).status).toBe('MAINTENANCE');

      await setMaintenanceStatus(auth, maintenanceA, 'COMPLETED', { completedAt: new Date().toISOString() }).expect(200);
      expect((await getVehicle(auth, vehicleId)).status).toBe('MAINTENANCE');

      await setMaintenanceStatus(auth, maintenanceB, 'COMPLETED', { completedAt: new Date().toISOString() }).expect(200);
      expect((await getVehicle(auth, vehicleId)).status).toBe('ACTIVE');
    });

    it('veiculo SUSPENDED manualmente nao e sobrescrito para MAINTENANCE nem revertido para ACTIVE', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('SyncSuspended');
      const vehicleId = await createVehicle(auth);
      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleId}/status`)
        .set('Authorization', auth)
        .send({ status: 'SUSPENDED' })
        .expect(200);

      const maintenanceId = await createMaintenance(auth, vehicleId);
      await setMaintenanceStatus(auth, maintenanceId, 'IN_PROGRESS').expect(200);
      expect((await getVehicle(auth, vehicleId)).status).toBe('SUSPENDED');

      await setMaintenanceStatus(auth, maintenanceId, 'COMPLETED', { completedAt: new Date().toISOString() }).expect(200);
      expect((await getVehicle(auth, vehicleId)).status).toBe('SUSPENDED');
    });
  });

  describe('bloqueio real de nova viagem', () => {
    it('manutencao IN_PROGRESS (nao apenas status manual) bloqueia inicio de viagem', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('TripBlock');
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

      const maintenanceId = await createMaintenance(auth, vehicleId);
      await setMaintenanceStatus(auth, maintenanceId, 'IN_PROGRESS').expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripRes.body.data.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'IN_PROGRESS' })
        .expect(409);

      // Concluindo a manutencao, o veiculo volta a ACTIVE e a viagem pode iniciar normalmente.
      await setMaintenanceStatus(auth, maintenanceId, 'COMPLETED', { completedAt: new Date().toISOString() }).expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripRes.body.data.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
    });
  });

  describe('alertas granulares (GET /vehicles/:id/overview)', () => {
    it('diferencia em andamento, programada e atrasada', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('AlertsGranular');
      const vehicleId = await createVehicle(auth);

      const inProgressId = await createMaintenance(auth, vehicleId, { description: 'Em andamento' });
      await setMaintenanceStatus(auth, inProgressId, 'IN_PROGRESS').expect(200);

      const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
      await createMaintenance(auth, vehicleId, { description: 'Programada', scheduledAt: future });

      const past = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      await createMaintenance(auth, vehicleId, { description: 'Atrasada', scheduledAt: past });

      const overviewRes = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleId}/overview`)
        .set('Authorization', auth)
        .expect(200);

      const alertTypes = (overviewRes.body.data.alerts as { type: string }[]).map((a) => a.type);
      expect(alertTypes).toContain('VEHICLE_MAINTENANCE_IN_PROGRESS');
      expect(alertTypes).toContain('VEHICLE_MAINTENANCE_SCHEDULED');
      expect(alertTypes).toContain('VEHICLE_MAINTENANCE_OVERDUE');
      expect(alertTypes).toContain('VEHICLE_UNAVAILABLE_MAINTENANCE');
      expect(alertTypes).toContain('VEHICLE_OPEN_MAINTENANCE');
    });
  });

  describe('GET /fleet-operations/maintenance -- novos indicadores', () => {
    it('inProgressCount e vehiclesInMaintenanceCount refletem manutencoes IN_PROGRESS', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('DashboardCounts');
      const vehicleA = await createVehicle(auth);
      const vehicleB = await createVehicle(auth);

      const maintA = await createMaintenance(auth, vehicleA);
      await setMaintenanceStatus(auth, maintA, 'IN_PROGRESS').expect(200);
      const maintB = await createMaintenance(auth, vehicleB);
      await setMaintenanceStatus(auth, maintB, 'IN_PROGRESS').expect(200);
      await createMaintenance(auth, vehicleA); // OPEN, nao entra em inProgressCount

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/maintenance')
        .set('Authorization', auth)
        .expect(200);

      expect(res.body.data.inProgressCount).toBe(2);
      expect(res.body.data.vehiclesInMaintenanceCount).toBe(2);
    });
  });
});
