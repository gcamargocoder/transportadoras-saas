import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Gestao Avancada de Veiculos e Frota (Fase 62, e2e)', () => {
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

  function buildCreateTenantPayload(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    return {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `vm-${label.toLowerCase()}-${unique}`,
      admin: { name: `Admin ${label}`, email: `admin-${label.toLowerCase()}-${unique}@teste.com`, password: 'SenhaForte123!' },
    };
  }

  async function createTenantAndLoginAsSuperAdmin(label: string) {
    const payload = buildCreateTenantPayload(label);
    const createRes = await request(app.getHttpServer()).post('/api/v1/tenants').send(payload).expect(201);
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

  async function createVehicle(auth: string, overrides: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/vehicles')
      .set('Authorization', auth)
      .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT', ...overrides })
      .expect(201);
    return res.body.data as { id: string; status: string; ownershipType: string };
  }

  async function createDriver(auth: string, overrides: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/drivers')
      .set('Authorization', auth)
      .send({
        name: 'Jose da Silva',
        cpf: randomValidCpf(),
        cnhNumber: String(Math.floor(10000000000 + Math.random() * 89999999999)),
        cnhCategory: 'AE',
        cnhExpiresAt: '2027-06-30',
        ...overrides,
      })
      .expect(201);
    return res.body.data as { id: string };
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
      });
    return res;
  }

  async function startTrip(auth: string, tripId: string) {
    await request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}/status`)
      .set('Authorization', auth)
      .send({ status: 'WAITING_DRIVER' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}/status`)
      .set('Authorization', auth)
      .send({ status: 'WAITING_DEPARTURE' })
      .expect(200);
    return request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}/status`)
      .set('Authorization', auth)
      .send({ status: 'IN_PROGRESS' });
  }

  // ==========================================================================
  // Classificacao (OWN/AGGREGATED/THIRD_PARTY)
  // ==========================================================================
  describe('classificacao de propriedade', () => {
    it('cria veiculo OWN por padrao quando ownershipType nao e informado (compatibilidade)', async () => {
      const { adminAuth } = await createTenantAndLoginAsSuperAdmin('OwnDefault');
      const vehicle = await createVehicle(adminAuth);
      expect(vehicle.ownershipType).toBe('OWN');
      expect(vehicle.status).toBe('ACTIVE');
    });

    it('cria veiculo AGGREGATED e THIRD_PARTY explicitamente', async () => {
      const { adminAuth } = await createTenantAndLoginAsSuperAdmin('OwnTypes');
      const aggregated = await createVehicle(adminAuth, { ownershipType: 'AGGREGATED' });
      const thirdParty = await createVehicle(adminAuth, { ownershipType: 'THIRD_PARTY' });
      expect(aggregated.ownershipType).toBe('AGGREGATED');
      expect(thirdParty.ownershipType).toBe('THIRD_PARTY');
    });

    it('altera a classificacao via PATCH e audita vehicle.ownership_changed', async () => {
      const { adminAuth } = await createTenantAndLoginAsSuperAdmin('ChangeOwnership');
      const vehicle = await createVehicle(adminAuth, { ownershipType: 'OWN' });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicle.id}`)
        .set('Authorization', adminAuth)
        .send({ ownershipType: 'AGGREGATED' })
        .expect(200);
      expect(res.body.data.ownershipType).toBe('AGGREGATED');

      const history = await prisma.auditLog.findMany({
        where: { entityName: 'Vehicle', entityId: vehicle.id },
      });
      expect(history.map((h) => h.action)).toContain('vehicle.ownership_changed');
    });
  });

  // ==========================================================================
  // Status operacional (SUSPENDED e transicoes)
  // ==========================================================================
  describe('status operacional', () => {
    it('suspende e reativa um veiculo, auditando cada transicao distintamente', async () => {
      const { adminAuth } = await createTenantAndLoginAsSuperAdmin('SuspendReactivate');
      const vehicle = await createVehicle(adminAuth);

      const suspended = await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicle.id}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'SUSPENDED' })
        .expect(200);
      expect(suspended.body.data.status).toBe('SUSPENDED');
      expect(suspended.body.data.availability).toBe('UNAVAILABLE');

      const reactivated = await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicle.id}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'ACTIVE' })
        .expect(200);
      expect(reactivated.body.data.status).toBe('ACTIVE');
      expect(reactivated.body.data.availability).toBe('AVAILABLE');

      const history = await prisma.auditLog.findMany({
        where: { entityName: 'Vehicle', entityId: vehicle.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(history.map((h) => h.action)).toEqual(
        expect.arrayContaining(['vehicle.created', 'vehicle.suspended', 'vehicle.activated']),
      );
    });

    it('desativa (INACTIVE) e depois reativa, auditando vehicle.deactivated e vehicle.reactivated', async () => {
      const { adminAuth } = await createTenantAndLoginAsSuperAdmin('DeactivateReactivate');
      const vehicle = await createVehicle(adminAuth);

      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicle.id}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'INACTIVE' })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicle.id}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'ACTIVE' })
        .expect(200);

      const history = await prisma.auditLog.findMany({
        where: { entityName: 'Vehicle', entityId: vehicle.id },
      });
      expect(history.map((h) => h.action)).toEqual(
        expect.arrayContaining(['vehicle.deactivated', 'vehicle.reactivated']),
      );
    });

    it('preserva o comportamento pre-existente de MAINTENANCE (vehicle.status_changed, nunca quebrado)', async () => {
      const { adminAuth } = await createTenantAndLoginAsSuperAdmin('MaintenanceCompat');
      const vehicle = await createVehicle(adminAuth);

      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicle.id}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'MAINTENANCE' })
        .expect(200);

      const history = await prisma.auditLog.findMany({
        where: { entityName: 'Vehicle', entityId: vehicle.id, action: 'vehicle.status_changed' },
      });
      expect(history).toHaveLength(1);
    });

    it('veiculo SUSPENDED nunca pode ter uma viagem iniciada (bloqueio central reaproveitado, sem duplicar logica)', async () => {
      const { adminAuth } = await createTenantAndLoginAsSuperAdmin('SuspendedStart');
      const vehicle = await createVehicle(adminAuth);
      const driver = await createDriver(adminAuth);
      const compositionId = await createComposition(adminAuth, vehicle.id);
      const tripRes = await createTrip(adminAuth, driver.id, compositionId);
      expect(tripRes.status).toBe(201);
      const tripId = tripRes.body.data.id as string;

      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicle.id}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'SUSPENDED' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'WAITING_DRIVER' })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'WAITING_DEPARTURE' })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'IN_PROGRESS' })
        .expect(409);
    });

    it('viagem historica preserva o veiculo mesmo depois de suspende-lo (nunca altera dados historicos)', async () => {
      const { adminAuth } = await createTenantAndLoginAsSuperAdmin('HistoricalTrip');
      const vehicle = await createVehicle(adminAuth);
      const driver = await createDriver(adminAuth);
      const compositionId = await createComposition(adminAuth, vehicle.id);
      const tripRes = await createTrip(adminAuth, driver.id, compositionId);
      const tripId = tripRes.body.data.id as string;

      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicle.id}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'SUSPENDED' })
        .expect(200);

      const tripAfter = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(tripAfter.body.data.compositionId).toBe(compositionId);
    });
  });

  // ==========================================================================
  // Motorista atual + historico (direcao inversa de DriverVehicleAssignment)
  // ==========================================================================
  describe('motorista atual e historico', () => {
    it('reflete o motorista atual no proprio veiculo e no historico, sem duplicar a tabela', async () => {
      const { adminAuth } = await createTenantAndLoginAsSuperAdmin('CurrentDriver');
      const vehicle = await createVehicle(adminAuth);
      const driverA = await createDriver(adminAuth);
      const driverB = await createDriver(adminAuth, { cpf: randomValidCpf(), cnhNumber: String(Math.floor(10000000000 + Math.random() * 89999999999)) });

      await request(app.getHttpServer())
        .post(`/api/v1/drivers/${driverA.id}/vehicle-assignments`)
        .set('Authorization', adminAuth)
        .send({ vehicleId: vehicle.id })
        .expect(201);

      const afterFirst = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicle.id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(afterFirst.body.data.currentDriverId).toBe(driverA.id);

      await request(app.getHttpServer())
        .post(`/api/v1/drivers/${driverB.id}/vehicle-assignments`)
        .set('Authorization', adminAuth)
        .send({ vehicleId: vehicle.id })
        .expect(201);

      const afterSwitch = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicle.id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(afterSwitch.body.data.currentDriverId).toBe(driverB.id);

      const history = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicle.id}/driver-assignments`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(history.body.data).toHaveLength(2);
      const entryA = history.body.data.find((e: { driverId: string }) => e.driverId === driverA.id);
      expect(entryA.endedAt).not.toBeNull();
      const entryB = history.body.data.find((e: { driverId: string }) => e.driverId === driverB.id);
      expect(entryB.endedAt).toBeNull();
    });
  });

  // ==========================================================================
  // Overview (GET /vehicles/:id/overview)
  // ==========================================================================
  describe('overview do veiculo', () => {
    it('consolida motorista atual, viagem atual, metricas, documentos, alertas, historico e viagens recentes', async () => {
      const { adminAuth } = await createTenantAndLoginAsSuperAdmin('Overview');
      const vehicle = await createVehicle(adminAuth);
      const driver = await createDriver(adminAuth);
      await request(app.getHttpServer())
        .post(`/api/v1/drivers/${driver.id}/vehicle-assignments`)
        .set('Authorization', adminAuth)
        .send({ vehicleId: vehicle.id })
        .expect(201);

      const compositionId = await createComposition(adminAuth, vehicle.id);
      const tripRes = await createTrip(adminAuth, driver.id, compositionId);
      const tripId = tripRes.body.data.id as string;
      const started = await startTrip(adminAuth, tripId);
      expect(started.status).toBe(200);

      await request(app.getHttpServer())
        .post(`/api/v1/vehicles/${vehicle.id}/documents`)
        .set('Authorization', adminAuth)
        .send({ type: 'CRLV', expiresAt: '2020-01-01' })
        .expect(201);

      const overview = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicle.id}/overview`)
        .set('Authorization', adminAuth)
        .expect(200);

      const data = overview.body.data;
      expect(data.vehicle.id).toBe(vehicle.id);
      expect(data.currentDriver.driverId).toBe(driver.id);
      expect(data.currentTrip).not.toBeNull();
      expect(data.currentTrip.tripId).toBe(tripId);
      expect(data.currentTripInconsistent).toBe(false);
      expect(data.vehicle.availability).toBe('ON_TRIP');
      expect(data.metrics.totalTrips).toBeGreaterThanOrEqual(1);
      expect(data.metrics.inProgressTrips).toBeGreaterThanOrEqual(1);
      expect(data.metrics.documentsCount).toBe(1);
      expect(data.metrics.documentsProblematic).toBe(1);
      expect(data.documents).toHaveLength(1);
      expect(data.documents[0].expiryStatus).toBe('EXPIRED');
      expect(data.driverHistory.length).toBeGreaterThanOrEqual(1);
      expect(data.recentTrips.length).toBeGreaterThanOrEqual(1);
      expect(data.history.length).toBeGreaterThanOrEqual(1);
      expect(data.alerts.some((a: { type: string }) => a.type === 'VEHICLE_DOCUMENT_EXPIRED')).toBe(true);
    });

    it('emite alerta VEHICLE_SUSPENDED quando o veiculo esta suspenso', async () => {
      const { adminAuth } = await createTenantAndLoginAsSuperAdmin('OverviewSuspendedAlert');
      const vehicle = await createVehicle(adminAuth);
      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicle.id}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'SUSPENDED' })
        .expect(200);

      const overview = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicle.id}/overview`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(overview.body.data.alerts.some((a: { type: string; severity: string }) => a.type === 'VEHICLE_SUSPENDED' && a.severity === 'CRITICAL')).toBe(true);
    });

    it('overview de veiculo inexistente retorna 404', async () => {
      const { adminAuth } = await createTenantAndLoginAsSuperAdmin('OverviewNotFound');
      await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${randomUUID()}/overview`)
        .set('Authorization', adminAuth)
        .expect(404);
    });
  });

  // ==========================================================================
  // Documentos do veiculo
  // ==========================================================================
  describe('documentos do veiculo', () => {
    it('cadastra e lista documentos, calculando expiryStatus corretamente', async () => {
      const { adminAuth } = await createTenantAndLoginAsSuperAdmin('Documents');
      const vehicle = await createVehicle(adminAuth);

      const future = new Date();
      future.setFullYear(future.getFullYear() + 2);

      await request(app.getHttpServer())
        .post(`/api/v1/vehicles/${vehicle.id}/documents`)
        .set('Authorization', adminAuth)
        .send({ type: 'CRLV', expiresAt: future.toISOString().slice(0, 10) })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/vehicles/${vehicle.id}/documents`)
        .set('Authorization', adminAuth)
        .send({ type: 'INSURANCE', expiresAt: '2020-01-01' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicle.id}/documents`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data).toHaveLength(2);
      const valid = res.body.data.find((d: { type: string }) => d.type === 'CRLV');
      const expired = res.body.data.find((d: { type: string }) => d.type === 'INSURANCE');
      expect(valid.expiryStatus).toBe('VALID');
      expect(expired.expiryStatus).toBe('EXPIRED');
    });
  });

  // ==========================================================================
  // Indicadores (summary)
  // ==========================================================================
  describe('indicadores (summary)', () => {
    it('reflete contagens corretas por status e propriedade', async () => {
      const { adminAuth } = await createTenantAndLoginAsSuperAdmin('Summary');
      await createVehicle(adminAuth, { ownershipType: 'OWN' });
      const aggregated = await createVehicle(adminAuth, { ownershipType: 'AGGREGATED' });
      await createVehicle(adminAuth, { ownershipType: 'THIRD_PARTY' });
      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${aggregated.id}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'SUSPENDED' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/vehicles/summary')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.total).toBe(3);
      expect(res.body.data.totalOwn).toBe(1);
      expect(res.body.data.totalAggregated).toBe(1);
      expect(res.body.data.totalThirdParty).toBe(1);
      expect(res.body.data.totalSuspended).toBe(1);
      expect(res.body.data.totalActive).toBe(2);
      expect(res.body.data.totalAvailable).toBe(2);
    });
  });

  // ==========================================================================
  // Listagem e filtros
  // ==========================================================================
  describe('listagem e filtros', () => {
    it('filtra por ownershipType, status e disponibilidade', async () => {
      const { adminAuth } = await createTenantAndLoginAsSuperAdmin('Filters');
      await createVehicle(adminAuth, { ownershipType: 'OWN' });
      const aggregated = await createVehicle(adminAuth, { ownershipType: 'AGGREGATED' });
      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${aggregated.id}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'SUSPENDED' })
        .expect(200);

      const byOwnership = await request(app.getHttpServer())
        .get('/api/v1/vehicles?ownershipType=AGGREGATED')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byOwnership.body.data.items).toHaveLength(1);
      expect(byOwnership.body.data.items[0].id).toBe(aggregated.id);

      const byAvailability = await request(app.getHttpServer())
        .get('/api/v1/vehicles?availability=UNAVAILABLE')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byAvailability.body.data.items.map((v: { id: string }) => v.id)).toContain(aggregated.id);

      const byStatus = await request(app.getHttpServer())
        .get('/api/v1/vehicles?status=SUSPENDED')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byStatus.body.data.items).toHaveLength(1);
    });

    it('filtra por currentDriverId', async () => {
      const { adminAuth } = await createTenantAndLoginAsSuperAdmin('FilterDriver');
      const vehicle = await createVehicle(adminAuth);
      const driver = await createDriver(adminAuth);
      await request(app.getHttpServer())
        .post(`/api/v1/drivers/${driver.id}/vehicle-assignments`)
        .set('Authorization', adminAuth)
        .send({ vehicleId: vehicle.id })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/vehicles?currentDriverId=${driver.id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].id).toBe(vehicle.id);
    });
  });

  // ==========================================================================
  // Limite de plano (Fase 48) -- classificacao nunca burla o limite
  // ==========================================================================
  describe('limite de plano', () => {
    it('classificacao OWN/AGGREGATED/THIRD_PARTY nunca burla o limite compartilhado de veiculos', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsSuperAdmin('PlanLimit');
      await request(app.getHttpServer())
        .patch(`/api/v1/tenants/${tenantId}/plan`)
        .set('Authorization', adminAuth)
        .send({ maxVehicles: 1 })
        .expect(200);

      await createVehicle(adminAuth, { ownershipType: 'OWN' });

      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', adminAuth)
        .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT', ownershipType: 'AGGREGATED' })
        .expect(409);
    });
  });

  // ==========================================================================
  // Isolamento multi-tenant
  // ==========================================================================
  describe('isolamento multi-tenant', () => {
    it('veiculo de um tenant nunca e acessivel/alteravel por outro tenant', async () => {
      const { adminAuth: authA } = await createTenantAndLoginAsSuperAdmin('TenantA');
      const { adminAuth: authB } = await createTenantAndLoginAsSuperAdmin('TenantB');
      const vehicle = await createVehicle(authA);

      await request(app.getHttpServer()).get(`/api/v1/vehicles/${vehicle.id}`).set('Authorization', authB).expect(404);
      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicle.id}/status`)
        .set('Authorization', authB)
        .send({ status: 'SUSPENDED' })
        .expect(404);
      await request(app.getHttpServer()).get(`/api/v1/vehicles/${vehicle.id}/overview`).set('Authorization', authB).expect(404);
      await request(app.getHttpServer()).get(`/api/v1/vehicles/${vehicle.id}/driver-assignments`).set('Authorization', authB).expect(404);
      await request(app.getHttpServer()).get(`/api/v1/vehicles/${vehicle.id}/documents`).set('Authorization', authB).expect(404);
    });
  });

  // ==========================================================================
  // RBAC
  // ==========================================================================
  describe('RBAC', () => {
    it('bloqueia DRIVER (role de login) em tudo; AUDITOR le mas nao escreve', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsSuperAdmin('RbacVehicles');
      const driverRoleAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');
      const vehicle = await createVehicle(adminAuth);

      await request(app.getHttpServer()).get('/api/v1/vehicles').set('Authorization', driverRoleAuth).expect(403);

      await request(app.getHttpServer()).get('/api/v1/vehicles').set('Authorization', auditorAuth).expect(200);
      await request(app.getHttpServer()).get(`/api/v1/vehicles/${vehicle.id}/overview`).set('Authorization', auditorAuth).expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicle.id}/status`)
        .set('Authorization', auditorAuth)
        .send({ status: 'SUSPENDED' })
        .expect(403);
      await request(app.getHttpServer())
        .post(`/api/v1/vehicles/${vehicle.id}/documents`)
        .set('Authorization', auditorAuth)
        .send({ type: 'CRLV' })
        .expect(403);
    });
  });

  // ==========================================================================
  // Verificacao real de ausencia de N+1
  // ==========================================================================
  describe('verificacao de ausencia de N+1 (contagem real de queries)', () => {
    let countingApp: INestApplication;
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
    });

    afterAll(async () => {
      await countingApp.close();
      await basePrisma.$disconnect();
    });

    it('GET /vehicles mantem quantidade de queries limitada independente da quantidade de veiculos (10 vs 50)', async () => {
      const payload = buildCreateTenantPayload('N1Vehicles');
      const createRes = await request(countingApp.getHttpServer()).post('/api/v1/tenants').send(payload).expect(201);
      const tenantId: string = createRes.body.data.id;
      createdTenantIds.push(tenantId);
      const loginRes = await request(countingApp.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId, email: payload.admin.email, password: payload.admin.password })
        .expect(200);
      const adminAuth = `Bearer ${loginRes.body.data.accessToken as string}`;

      for (let i = 0; i < 10; i += 1) {
        await createVehicle(adminAuth);
      }
      queryCount = 0;
      await request(countingApp.getHttpServer()).get('/api/v1/vehicles?pageSize=50').set('Authorization', adminAuth).expect(200);
      const queriesFor10 = queryCount;
      expect(queriesFor10).toBeGreaterThan(0);

      for (let i = 0; i < 40; i += 1) {
        await createVehicle(adminAuth);
      }
      queryCount = 0;
      await request(countingApp.getHttpServer()).get('/api/v1/vehicles?pageSize=50').set('Authorization', adminAuth).expect(200);
      const queriesFor50 = queryCount;

      expect(queriesFor50).toBeLessThanOrEqual(queriesFor10 + 1);
    }, 120000);
  });
});
