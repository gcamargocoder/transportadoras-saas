import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const VALID_PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');

// Fase 68 -- Dashboard de Ocorrencias, Alertas Criticos e Comprovantes de
// Entrega. Fecha as 3 pendencias da Fase 67.
describe('Fleet Occurrences Dashboard, FleetAlert critico e arquivo de DELIVERY_PROOF (e2e)', () => {
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
      slug: `occdash-${label.toLowerCase()}-${unique}`,
      admin: {
        name: `Admin ${label}`,
        email: `admin-${label.toLowerCase()}-${unique}@teste.com`,
        password: 'SenhaForte123!',
      },
    };
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

  async function setupTripWithVehicleDriver(auth: string) {
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
        plannedArrival: '2026-09-02T18:00:00.000Z',
      })
      .expect(201);
    return { tripId: tripRes.body.data.id as string, vehicleId, driverId };
  }

  async function createOccurrence(
    auth: string,
    tripId: string,
    overrides: Partial<Record<string, unknown>> = {},
  ) {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/occurrences`)
      .set('Authorization', auth)
      .send({
        type: 'BREAKDOWN',
        severity: 'CRITICAL',
        description: 'Ocorrencia de teste',
        occurredAt: '2026-09-01T10:00:00.000Z',
        ...overrides,
      })
      .expect(201);
    return res.body.data.id as string;
  }

  // ==========================================================================
  // GET /fleet-operations/occurrences
  // ==========================================================================
  describe('GET /fleet-operations/occurrences', () => {
    it('agrega total/status/tipo/severidade/ranking por veiculo e motorista', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('OccDash');
      const { tripId, vehicleId, driverId } = await setupTripWithVehicleDriver(adminAuth);

      const openCriticalId = await createOccurrence(adminAuth, tripId, {
        type: 'BREAKDOWN',
        severity: 'CRITICAL',
        driverId,
        vehicleId,
      });
      const toResolveId = await createOccurrence(adminAuth, tripId, {
        type: 'DELAY',
        severity: 'WARNING',
        driverId,
        vehicleId,
      });
      const toCancelId = await createOccurrence(adminAuth, tripId, {
        type: 'OTHER',
        severity: 'INFO',
        driverId,
        vehicleId,
      });
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/occurrences/${toResolveId}/resolve`)
        .set('Authorization', adminAuth)
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/occurrences/${toCancelId}/cancel`)
        .set('Authorization', adminAuth)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/occurrences')
        .set('Authorization', adminAuth)
        .expect(200);

      const data = res.body.data;
      expect(data.totalCount).toBe(3);
      expect(data.openCount).toBe(1);
      expect(data.criticalOpenCount).toBe(1);
      expect(data.resolvedCount).toBe(1);
      expect(data.cancelledCount).toBe(1);
      expect(data.byType).toEqual(expect.arrayContaining([{ type: 'BREAKDOWN', count: 1 }]));
      expect(data.bySeverity).toEqual(expect.arrayContaining([{ severity: 'CRITICAL', count: 1 }]));
      expect(data.byVehicle[0]).toMatchObject({ vehicleId, count: 3 });
      expect(data.byDriver[0]).toMatchObject({ driverId, count: 3 });
      expect(data.monthlyTrend.length).toBeGreaterThan(0);
      expect(openCriticalId).toBeTruthy();
    });

    it('filtra por type/severity/status/vehicleId/driverId/from/to', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('OccDashFilters');
      const { tripId, vehicleId, driverId } = await setupTripWithVehicleDriver(adminAuth);

      await createOccurrence(adminAuth, tripId, { type: 'BREAKDOWN', severity: 'CRITICAL', occurredAt: '2026-09-01T10:00:00.000Z' });
      await createOccurrence(adminAuth, tripId, { type: 'DELAY', severity: 'INFO', occurredAt: '2026-09-10T10:00:00.000Z' });

      const byType = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/occurrences')
        .set('Authorization', adminAuth)
        .query({ type: 'BREAKDOWN' })
        .expect(200);
      expect(byType.body.data.totalCount).toBe(1);

      const bySeverity = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/occurrences')
        .set('Authorization', adminAuth)
        .query({ severity: 'CRITICAL' })
        .expect(200);
      expect(bySeverity.body.data.totalCount).toBe(1);

      const byStatus = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/occurrences')
        .set('Authorization', adminAuth)
        .query({ status: 'OPEN' })
        .expect(200);
      expect(byStatus.body.data.totalCount).toBe(2);

      const byVehicleFilter = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/occurrences')
        .set('Authorization', adminAuth)
        .query({ vehicleId })
        .expect(200);
      expect(byVehicleFilter.body.data.totalCount).toBe(0); // occurrences acima nao vincularam vehicleId

      const byDriverFilter = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/occurrences')
        .set('Authorization', adminAuth)
        .query({ driverId })
        .expect(200);
      expect(byDriverFilter.body.data.totalCount).toBe(0);

      const byPeriod = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/occurrences')
        .set('Authorization', adminAuth)
        .query({ from: '2026-09-01', to: '2026-09-05' })
        .expect(200);
      expect(byPeriod.body.data.totalCount).toBe(1);
    });

    it('isolamento multi-tenant: ocorrencias de outro tenant nunca aparecem', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('OccDashTenantA');
      const tenantB = await createTenantAndLoginAsAdmin('OccDashTenantB');
      const { tripId } = await setupTripWithVehicleDriver(tenantA.adminAuth);
      await createOccurrence(tenantA.adminAuth, tripId, {});

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/occurrences')
        .set('Authorization', tenantB.adminAuth)
        .expect(200);
      expect(res.body.data.totalCount).toBe(0);
    });

    it('RBAC: sem token retorna 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/fleet-operations/occurrences').expect(401);
    });
  });

  // ==========================================================================
  // FleetAlert -- ocorrencia critica em aberto (fleet-wide)
  // ==========================================================================
  describe('FleetAlert TRIP_OCCURRENCE_CRITICAL (GET /fleet-operations/dashboard)', () => {
    it('ocorrencia critica em aberto aparece; some ao resolver; some ao cancelar', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('AlertCritical');
      const { tripId, vehicleId } = await setupTripWithVehicleDriver(adminAuth);
      const occurrenceId = await createOccurrence(adminAuth, tripId, { severity: 'CRITICAL', vehicleId });

      const withAlert = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/dashboard')
        .set('Authorization', adminAuth)
        .expect(200);
      const criticalAlerts = withAlert.body.data.alerts.filter(
        (a: { type: string; vehicleId: string }) => a.type === 'TRIP_OCCURRENCE_CRITICAL' && a.vehicleId === vehicleId,
      );
      expect(criticalAlerts).toHaveLength(1);

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/occurrences/${occurrenceId}/resolve`)
        .set('Authorization', adminAuth)
        .expect(200);

      const afterResolve = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/dashboard')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(
        afterResolve.body.data.alerts.filter((a: { type: string }) => a.type === 'TRIP_OCCURRENCE_CRITICAL'),
      ).toHaveLength(0);
    });

    it('ocorrencia critica cancelada nunca aparece como alerta', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('AlertCancelled');
      const { tripId, vehicleId } = await setupTripWithVehicleDriver(adminAuth);
      const occurrenceId = await createOccurrence(adminAuth, tripId, { severity: 'CRITICAL', vehicleId });
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/occurrences/${occurrenceId}/cancel`)
        .set('Authorization', adminAuth)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/dashboard')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(
        res.body.data.alerts.filter((a: { type: string }) => a.type === 'TRIP_OCCURRENCE_CRITICAL'),
      ).toHaveLength(0);
    });

    it('ocorrencia INFO/WARNING nunca vira alerta critico', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('AlertNonCritical');
      const { tripId, vehicleId } = await setupTripWithVehicleDriver(adminAuth);
      await createOccurrence(adminAuth, tripId, { severity: 'INFO', vehicleId });
      await createOccurrence(adminAuth, tripId, { severity: 'WARNING', vehicleId });

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/dashboard')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(
        res.body.data.alerts.filter((a: { type: string }) => a.type === 'TRIP_OCCURRENCE_CRITICAL'),
      ).toHaveLength(0);
      expect(res.body.data.overview.criticalOpenOccurrences).toBe(0);
      expect(res.body.data.overview.openOccurrences).toBe(2);
    });
  });

  // ==========================================================================
  // VehicleOverview -- ocorrencia critica em aberto (por veiculo)
  // ==========================================================================
  describe('GET /vehicles/:id/overview -- integracao com ocorrencia critica', () => {
    it('mostra alerta VEHICLE_OCCURRENCE_CRITICAL e metrics.criticalOpenOccurrences', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('VehicleOccAlert');
      const { tripId, vehicleId } = await setupTripWithVehicleDriver(adminAuth);
      await createOccurrence(adminAuth, tripId, { severity: 'CRITICAL', vehicleId });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleId}/overview`)
        .set('Authorization', adminAuth)
        .expect(200);

      expect(res.body.data.metrics.criticalOpenOccurrences).toBe(1);
      const vehicleAlerts = res.body.data.alerts.filter((a: { type: string }) => a.type === 'VEHICLE_OCCURRENCE_CRITICAL');
      expect(vehicleAlerts).toHaveLength(1);
    });
  });

  // ==========================================================================
  // GET /fiscal/documents/:id/file -- preview/download do comprovante
  // ==========================================================================
  describe('GET /fiscal/documents/:id/file', () => {
    async function uploadDeliveryProof(auth: string, tripId: string, vehicleId: string, driverId: string) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', auth)
        .field('documentType', 'DELIVERY_PROOF')
        .field('tripId', tripId)
        .field('vehicleId', vehicleId)
        .field('driverId', driverId)
        .attach('file', VALID_PDF, 'comprovante.pdf')
        .expect(201);
      return res.body.data.id as string;
    }

    it('baixa o arquivo com Content-Type e Content-Disposition corretos (PDF -> inline)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('FileDownload');
      const { tripId, vehicleId, driverId } = await setupTripWithVehicleDriver(adminAuth);
      const documentId = await uploadDeliveryProof(adminAuth, tripId, vehicleId, driverId);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/${documentId}/file`)
        .set('Authorization', adminAuth)
        .expect(200);

      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('inline');
      expect(res.headers['content-disposition']).toContain('comprovante.pdf');
      expect(res.body.length || res.text.length).toBeGreaterThan(0);
    });

    it('sem token retorna 401', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('FileAuth');
      const { tripId, vehicleId, driverId } = await setupTripWithVehicleDriver(adminAuth);
      const documentId = await uploadDeliveryProof(adminAuth, tripId, vehicleId, driverId);

      await request(app.getHttpServer()).get(`/api/v1/fiscal/documents/${documentId}/file`).expect(401);
    });

    it('documento de outro tenant retorna 404', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('FileTenantA');
      const tenantB = await createTenantAndLoginAsAdmin('FileTenantB');
      const { tripId, vehicleId, driverId } = await setupTripWithVehicleDriver(tenantA.adminAuth);
      const documentId = await uploadDeliveryProof(tenantA.adminAuth, tripId, vehicleId, driverId);

      await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/${documentId}/file`)
        .set('Authorization', tenantB.adminAuth)
        .expect(404);
    });

    it('documento sem attachment (importado por XML sem arquivo fisico associado) retorna 404 com mensagem clara', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('FileNoAttachment');
      // Cria um FiscalDocument diretamente sem attachmentId (simula um
      // registro legado/importado sem arquivo fisico -- nunca inventamos um
      // Attachment so para o teste passar).
      const document = await prisma.fiscalDocument.create({
        data: {
          tenantId,
          documentType: 'DELIVERY_PROOF',
          status: 'PENDING',
          source: 'UPLOAD',
          createdBy: (await prisma.userAccount.findFirstOrThrow({ where: { tenantId } })).id,
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/${document.id}/file`)
        .set('Authorization', adminAuth)
        .expect(404);
      expect(res.body.message ?? res.body.error?.message).toBeTruthy();
    });

    it('documento inexistente retorna 404', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('FileMissing');
      await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/${randomUUID()}/file`)
        .set('Authorization', adminAuth)
        .expect(404);
    });
  });

  // ==========================================================================
  // Verificacao real de ausencia de N+1 -- mesmo padrao ja usado em
  // fleet-operations-fuel.e2e-spec.ts / trip-occurrences-shifts-timeline.e2e-spec.ts.
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
        slug: `occdash-n1-${label.toLowerCase()}-${unique}`,
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

    async function setupTripOnCountingApp(adminAuth: string) {
      const vehicleRes = await request(countingApp.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', adminAuth)
        .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
        .expect(201);
      const driverRes = await request(countingApp.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', adminAuth)
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
        .set('Authorization', adminAuth)
        .send({ vehicleId: vehicleRes.body.data.id, trailers: [] })
        .expect(201);
      const originRes = await request(countingApp.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', adminAuth)
        .send({ name: `Origem ${randomUUID()}`, type: 'DISTRIBUTION_CENTER' })
        .expect(201);
      const destinationRes = await request(countingApp.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', adminAuth)
        .send({ name: `Destino ${randomUUID()}`, type: 'DISTRIBUTION_CENTER' })
        .expect(201);
      const tripRes = await request(countingApp.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', adminAuth)
        .send({
          driverId: driverRes.body.data.id,
          compositionId: compositionRes.body.data.id,
          originLocationId: originRes.body.data.id,
          destinationLocationId: destinationRes.body.data.id,
          plannedDeparture: '2026-09-01T08:00:00.000Z',
          plannedArrival: '2026-09-02T18:00:00.000Z',
        })
        .expect(201);
      return { tripId: tripRes.body.data.id as string, vehicleId: vehicleRes.body.data.id as string, driverId: driverRes.body.data.id as string };
    }

    async function seedOccurrence(adminAuth: string, tripId: string, vehicleId: string, driverId: string, index: number) {
      await request(countingApp.getHttpServer())
        .post(`/api/v1/trips/${tripId}/occurrences`)
        .set('Authorization', adminAuth)
        .send({
          type: 'OTHER',
          severity: index % 3 === 0 ? 'CRITICAL' : 'INFO',
          description: `oc-${index}`,
          occurredAt: `2026-09-01T${String(index % 24).padStart(2, '0')}:00:00.000Z`,
          vehicleId,
          driverId,
        })
        .expect(201);
    }

    it('a contagem de queries de GET /fleet-operations/occurrences nao cresce entre 10 e 50 ocorrencias', async () => {
      const { adminAuth } = await createTenantAndLoginOnCountingApp('N1Check');
      const { tripId, vehicleId, driverId } = await setupTripOnCountingApp(adminAuth);

      for (let i = 0; i < 10; i += 1) {
        await seedOccurrence(adminAuth, tripId, vehicleId, driverId, i);
      }
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/fleet-operations/occurrences')
        .set('Authorization', adminAuth)
        .expect(200);
      const queriesFor10 = queryCount;
      expect(queriesFor10).toBeGreaterThan(0);

      for (let i = 10; i < 50; i += 1) {
        await seedOccurrence(adminAuth, tripId, vehicleId, driverId, i);
      }
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/fleet-operations/occurrences')
        .set('Authorization', adminAuth)
        .expect(200);
      const queriesFor50 = queryCount;

      expect(queriesFor50).toBeLessThanOrEqual(queriesFor10 + 1);
    }, 120000);
  });
});
