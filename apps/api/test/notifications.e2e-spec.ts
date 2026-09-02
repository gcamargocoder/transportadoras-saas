import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/notifications/services/notifications.service';

// Fase 69 -- Centro de Alertas, Notificacoes e Acoes Operacionais.
// Fase 70 -- geracao deixou de ser sincrona (GET /notifications e GET
// /notifications/unread-count agora sao leitura pura); os testes chamam
// explicitamente POST /notifications/process (trigger manual tenant-
// escopado, mesmo mecanismo do job agendado) para materializar as
// condicoes antes de listar.
describe('Notifications (e2e)', () => {
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

  async function processNow(auth: string) {
    const res = await request(app.getHttpServer()).post('/api/v1/notifications/process').set('Authorization', auth).expect(200);
    return res.body.data.notificationsCreated as number;
  }

  async function createTenantAndLoginAsAdmin(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    const payload = {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `notif-${label.toLowerCase()}-${unique}`,
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

  async function createUserWithRole(adminAuth: string, tenantId: string, role: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 10);
    const email = `user-${role.toLowerCase()}-${unique}@teste.com`;
    const password = 'SenhaForte123!';
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', adminAuth)
      .send({ name: `Usuario ${role}`, email, password, role })
      .expect(201);
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email, password })
      .expect(200);
    return { auth: `Bearer ${loginRes.body.data.accessToken as string}` };
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

  // Fase 111 -- checklist completado com item critico+obrigatorio respondido
  // NAO, vinculado a um veiculo. Retorna o executionId para o teste montar
  // as asserts sobre a notificacao gerada.
  async function createCompletedChecklistWithCriticalAnswer(
    adminAuth: string,
    tenantId: string,
    vehicleId: string,
    booleanValue: boolean,
  ): Promise<string> {
    const driverId = await createDriver(adminAuth);
    const unique = randomUUID().replace(/-/g, '').slice(0, 10);
    const email = `driver-${unique}@teste.com`;
    const password = 'SenhaForte123!';
    const userRes = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', adminAuth)
      .send({ name: 'Motorista App', email, password, role: 'DRIVER' })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/drivers/${driverId}/user-link`)
      .set('Authorization', adminAuth)
      .send({ userAccountId: userRes.body.data.id })
      .expect(200);
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email, password })
      .expect(200);
    const driverAuth = `Bearer ${loginRes.body.data.accessToken as string}`;

    const templateRes = await request(app.getHttpServer())
      .post('/api/v1/checklists/templates')
      .set('Authorization', adminAuth)
      .send({
        name: `Pre-Viagem ${randomUUID()}`,
        type: 'PRE_TRIP',
        sections: [{ title: 'SEGURANCA', order: 1, items: [{ code: 'freio', label: 'Freio OK?', type: 'BOOLEAN', order: 1, required: true, critical: true }] }],
      })
      .expect(201);
    const templateId = templateRes.body.data.id as string;
    await request(app.getHttpServer()).post(`/api/v1/checklists/templates/${templateId}/publish`).set('Authorization', adminAuth).expect(200);

    const execRes = await request(app.getHttpServer())
      .post('/api/v1/driver/checklists')
      .set('Authorization', driverAuth)
      .send({ deviceEventId: randomUUID(), templateId, vehicleId })
      .expect(201);
    const executionId = execRes.body.data.id as string;
    const itemId = templateRes.body.data.sections[0].items[0].id as string;

    await request(app.getHttpServer())
      .post(`/api/v1/driver/checklists/${executionId}/answers`)
      .set('Authorization', driverAuth)
      .send({ answers: [{ itemId, booleanValue }] })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/driver/checklists/${executionId}/complete`)
      .set('Authorization', driverAuth)
      .expect(200);

    return executionId;
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

  // Cria motorista + veiculo + composicao + viagem + login proprio no app
  // (mesmo padrao ja usado nos e2e de Driver App desde a Fase 25).
  async function setupDriverWithTrip(adminAuth: string, tenantId: string) {
    const { tripId, vehicleId, driverId } = await setupTripWithVehicleDriver(adminAuth);

    const unique = randomUUID().replace(/-/g, '').slice(0, 10);
    const email = `driver-${unique}@teste.com`;
    const password = 'SenhaForte123!';
    const userRes = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', adminAuth)
      .send({ name: 'Motorista App', email, password, role: 'DRIVER' })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/drivers/${driverId}/user-link`)
      .set('Authorization', adminAuth)
      .send({ userAccountId: userRes.body.data.id })
      .expect(200);
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email, password })
      .expect(200);

    return { tripId, vehicleId, driverId, driverAuth: `Bearer ${loginRes.body.data.accessToken as string}` };
  }

  async function createCriticalOccurrence(auth: string, tripId: string) {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/occurrences`)
      .set('Authorization', auth)
      .send({ type: 'BREAKDOWN', severity: 'CRITICAL', description: 'Pane critica', occurredAt: '2026-09-01T10:00:00.000Z' })
      .expect(201);
    return res.body.data.id as string;
  }

  async function uploadDeliveryProof(auth: string, tripId: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/fiscal/documents/upload')
      .set('Authorization', auth)
      .field('documentType', 'DELIVERY_PROOF')
      .field('tripId', tripId)
      .attach('file', Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF'), 'comprovante.pdf')
      .expect(201);
    return res.body.data.id as string;
  }

  // ==========================================================================
  // Geracao (via trigger manual) + listagem + paginacao + filtros
  // ==========================================================================
  describe('GET /notifications', () => {
    it('gera (via POST /notifications/process) e lista notificacao de ocorrencia critica para o admin', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Basic');
      const { tripId } = await setupTripWithVehicleDriver(adminAuth);
      const occurrenceId = await createCriticalOccurrence(adminAuth, tripId);
      await processNow(adminAuth);

      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', adminAuth)
        .expect(200);

      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      const notif = res.body.data.items.find((n: { entityId: string }) => n.entityId === occurrenceId);
      expect(notif).toBeTruthy();
      expect(notif.type).toBe('CRITICAL_OCCURRENCE');
      expect(notif.severity).toBe('CRITICAL');
      expect(notif.entityType).toBe('TripOccurrence');
      expect(notif.metadata).toMatchObject({ tripId });
      expect(notif.readAt).toBeNull();
    });

    it('pagina corretamente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Paging');
      const { tripId } = await setupTripWithVehicleDriver(adminAuth);
      for (let i = 0; i < 3; i += 1) {
        await request(app.getHttpServer())
          .post(`/api/v1/trips/${tripId}/occurrences`)
          .set('Authorization', adminAuth)
          .send({ type: 'OTHER', severity: 'CRITICAL', description: `oc-${i}`, occurredAt: `2026-09-01T0${i}:00:00.000Z` })
          .expect(201);
      }
      await processNow(adminAuth);

      const page1 = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', adminAuth)
        .query({ page: 1, pageSize: 2 })
        .expect(200);
      expect(page1.body.data.items).toHaveLength(2);
      expect(page1.body.data.meta.total).toBeGreaterThanOrEqual(3);
    });

    it('filtra por unread/type/severity/entityType/periodo', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Filters');
      const { tripId } = await setupTripWithVehicleDriver(adminAuth);
      const occurrenceId = await createCriticalOccurrence(adminAuth, tripId);
      await processNow(adminAuth);

      const byType = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', adminAuth)
        .query({ type: 'CRITICAL_OCCURRENCE' })
        .expect(200);
      expect(byType.body.data.items.some((n: { entityId: string }) => n.entityId === occurrenceId)).toBe(true);

      const byEntityType = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', adminAuth)
        .query({ entityType: 'TripOccurrence' })
        .expect(200);
      expect(byEntityType.body.data.items.length).toBeGreaterThanOrEqual(1);

      const bySeverity = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', adminAuth)
        .query({ severity: 'CRITICAL' })
        .expect(200);
      expect(bySeverity.body.data.items.some((n: { entityId: string }) => n.entityId === occurrenceId)).toBe(true);

      const unreadOnly = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', adminAuth)
        .query({ unread: 'true' })
        .expect(200);
      expect(unreadOnly.body.data.items.every((n: { readAt: string | null }) => n.readAt === null)).toBe(true);

      const outOfRange = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', adminAuth)
        .query({ from: '2020-01-01', to: '2020-01-31' })
        .expect(200);
      expect(outOfRange.body.data.items).toHaveLength(0);
    });
  });

  // ==========================================================================
  // unread-count / read / read-all
  // ==========================================================================
  describe('unread-count, read e read-all', () => {
    it('GET /notifications/unread-count NUNCA gera notificacao (leitura pura, Fase 70)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('UnreadPure');
      const { tripId } = await setupTripWithVehicleDriver(adminAuth);
      await createCriticalOccurrence(adminAuth, tripId);

      // Sem processNow() -- so consultando unread-count repetidamente.
      const first = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', adminAuth)
        .expect(200);
      const second = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(first.body.data.total).toBe(0);
      expect(second.body.data.total).toBe(0);

      // So depois do trigger explicito a notificacao passa a existir.
      await processNow(adminAuth);
      const afterProcess = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(afterProcess.body.data.total).toBeGreaterThanOrEqual(1);
    });

    it('unread-count reflete total e criticas; read e idempotente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ReadFlow');
      const { tripId } = await setupTripWithVehicleDriver(adminAuth);
      await createCriticalOccurrence(adminAuth, tripId);
      await processNow(adminAuth);

      const before = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(before.body.data.total).toBeGreaterThanOrEqual(1);
      expect(before.body.data.critical).toBeGreaterThanOrEqual(1);

      const list = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', adminAuth)
        .expect(200);
      const notificationId = list.body.data.items[0].id;

      const read1 = await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${notificationId}/read`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(read1.body.data.readAt).toBeTruthy();

      // Idempotente: ler de novo nao muda o readAt.
      const read2 = await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${notificationId}/read`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(read2.body.data.readAt).toBe(read1.body.data.readAt);

      const after = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(after.body.data.total).toBe(before.body.data.total - 1);
    });

    it('read-all marca todas como lidas e e idempotente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ReadAll');
      const { tripId } = await setupTripWithVehicleDriver(adminAuth);
      await createCriticalOccurrence(adminAuth, tripId);
      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/occurrences`)
        .set('Authorization', adminAuth)
        .send({ type: 'OTHER', severity: 'CRITICAL', description: 'x', occurredAt: '2026-09-01T12:00:00.000Z' })
        .expect(201);
      await processNow(adminAuth);

      const readAll1 = await request(app.getHttpServer())
        .patch('/api/v1/notifications/read-all')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(readAll1.body.data.count).toBeGreaterThanOrEqual(2);

      const afterCount = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(afterCount.body.data.total).toBe(0);

      // Idempotente: repetir nao afeta nada (0 ja lidas restantes).
      const readAll2 = await request(app.getHttpServer())
        .patch('/api/v1/notifications/read-all')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(readAll2.body.data.count).toBe(0);
    });
  });

  // ==========================================================================
  // Deduplicacao / idempotencia do processamento
  // ==========================================================================
  describe('deduplicacao e idempotencia do processamento', () => {
    it('POST /notifications/process executado 2x nunca cria uma segunda notificacao logica', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Dedupe');
      const { tripId } = await setupTripWithVehicleDriver(adminAuth);
      const occurrenceId = await createCriticalOccurrence(adminAuth, tripId);

      const created1 = await processNow(adminAuth);
      expect(created1).toBeGreaterThanOrEqual(1);
      // 2a chamada reprocessa a MESMA condicao (ainda aberta) -- 0 novas.
      const created2 = await processNow(adminAuth);
      expect(created2).toBe(0);

      const res = await request(app.getHttpServer()).get('/api/v1/notifications').set('Authorization', adminAuth).expect(200);
      const matches = res.body.data.items.filter((n: { entityId: string }) => n.entityId === occurrenceId);
      expect(matches).toHaveLength(1);
    });

    it('resolver a ocorrencia nao apaga a notificacao historica nem gera uma nova em reprocessamentos seguintes', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ResolveKeepsHistory');
      const { tripId } = await setupTripWithVehicleDriver(adminAuth);
      const occurrenceId = await createCriticalOccurrence(adminAuth, tripId);
      await processNow(adminAuth);

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/occurrences/${occurrenceId}/resolve`)
        .set('Authorization', adminAuth)
        .expect(200);

      // Reprocessar apos a resolucao nunca cria uma nova notificacao para
      // esta mesma ocorrencia (ela nao aparece mais entre os candidatos).
      await processNow(adminAuth);

      const res = await request(app.getHttpServer()).get('/api/v1/notifications').set('Authorization', adminAuth).expect(200);
      const matches = res.body.data.items.filter((n: { entityId: string }) => n.entityId === occurrenceId);
      expect(matches).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Isolamento multi-tenant e por usuario
  // ==========================================================================
  describe('isolamento', () => {
    it('tenant B nunca ve notificacoes do tenant A', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolationTenantA');
      const tenantB = await createTenantAndLoginAsAdmin('IsolationTenantB');
      const { tripId } = await setupTripWithVehicleDriver(tenantA.adminAuth);
      await createCriticalOccurrence(tenantA.adminAuth, tripId);
      await processNow(tenantA.adminAuth);

      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', tenantB.adminAuth)
        .expect(200);
      expect(res.body.data.items).toHaveLength(0);
    });

    it('usuario B nunca le notificacao do usuario A, mesmo sabendo o id (troca de url)', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('IsolationUser');
      const { tripId } = await setupTripWithVehicleDriver(adminAuth);
      await createCriticalOccurrence(adminAuth, tripId);
      await processNow(adminAuth);

      const listA = await request(app.getHttpServer()).get('/api/v1/notifications').set('Authorization', adminAuth).expect(200);
      const notificationId = listA.body.data.items[0].id;

      const managerB = await createUserWithRole(adminAuth, tenantId, 'MANAGER');

      await request(app.getHttpServer())
        .get(`/api/v1/notifications/${notificationId}`)
        .set('Authorization', managerB.auth)
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${notificationId}/read`)
        .set('Authorization', managerB.auth)
        .expect(404);
    });

    it('sem token retorna 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/notifications').expect(401);
    });
  });

  // ==========================================================================
  // Integracao: manutencao de veiculo
  // ==========================================================================
  describe('integracao -- manutencao de veiculo', () => {
    it('manutencao aberta com data programada vencida gera VEHICLE_MAINTENANCE', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('MaintenanceIntegration');
      const vehicleId = await createVehicle(adminAuth);

      const maintenanceRes = await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', adminAuth)
        .send({ vehicleId, type: 'PREVENTIVE', component: 'ENGINE', scheduledAt: '2020-01-01' })
        .expect(201);
      await processNow(adminAuth);

      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', adminAuth)
        .query({ type: 'VEHICLE_MAINTENANCE' })
        .expect(200);

      const notif = res.body.data.items.find((n: { entityId: string }) => n.entityId === maintenanceRes.body.data.id);
      expect(notif).toBeTruthy();
      expect(notif.metadata).toMatchObject({ vehicleId });
    });

    // Fase 108 -- fecha a lacuna real: um MaintenancePlan (preventiva)
    // vencido/proximo POR KM OU DATA, SEM nenhuma VehicleMaintenance aberta
    // ainda (o caso normal -- MaintenancePlan nunca gera OS sozinho), agora
    // tambem gera notificacao (antes so aparecia no dashboard de frota).
    // Mesmo NotificationType.VEHICLE_MAINTENANCE ja existente, distinguido
    // pelo entityType='MaintenancePlan' (vs. 'VehicleMaintenance' do teste
    // acima).
    async function createPlanWithCompletedService(
      adminAuth: string,
      vehicleId: string,
      lastServiceOdometerKm: number,
    ): Promise<string> {
      const planRes = await request(app.getHttpServer())
        .post('/api/v1/maintenance/plans')
        .set('Authorization', adminAuth)
        .send({ vehicleId, name: 'Troca de óleo', component: 'ENGINE_OIL', intervalKm: 10000, alertBeforeKm: 1000 })
        .expect(201);
      const planId = planRes.body.data.id as string;

      const maintenanceRes = await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', adminAuth)
        .send({ vehicleId, type: 'PREVENTIVE', maintenancePlanId: planId, odometerKm: lastServiceOdometerKm, laborCost: 100 })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/maintenances/${maintenanceRes.body.data.id}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'COMPLETED', completedAt: new Date().toISOString() })
        .expect(200);
      return planId;
    }

    it('plano preventivo VENCIDO por km (sem nenhuma OS aberta) gera VEHICLE_MAINTENANCE com entityType=MaintenancePlan', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PlanOverdueNotif');
      const vehicleId = await createVehicle(adminAuth);
      const planId = await createPlanWithCompletedService(adminAuth, vehicleId, 90000);
      await request(app.getHttpServer()).patch(`/api/v1/vehicles/${vehicleId}`).set('Authorization', adminAuth).send({ odometerKm: 100500 }).expect(200);

      await processNow(adminAuth);

      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', adminAuth)
        .query({ type: 'VEHICLE_MAINTENANCE' })
        .expect(200);
      const notif = res.body.data.items.find((n: { entityId: string }) => n.entityId === planId);
      expect(notif).toBeTruthy();
      expect(notif.entityType).toBe('MaintenancePlan');
      expect(notif.severity).toBe('HIGH');
      expect(notif.metadata).toMatchObject({ vehicleId });
    });

    it('plano preventivo PROXIMO do vencimento por km gera notificacao com severidade MEDIUM', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PlanDueSoonNotif');
      const vehicleId = await createVehicle(adminAuth);
      const planId = await createPlanWithCompletedService(adminAuth, vehicleId, 90000);
      await request(app.getHttpServer()).patch(`/api/v1/vehicles/${vehicleId}`).set('Authorization', adminAuth).send({ odometerKm: 99500 }).expect(200);

      await processNow(adminAuth);

      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', adminAuth)
        .query({ type: 'VEHICLE_MAINTENANCE' })
        .expect(200);
      const notif = res.body.data.items.find((n: { entityId: string }) => n.entityId === planId);
      expect(notif).toBeTruthy();
      expect(notif.severity).toBe('MEDIUM');
    });

    it('plano preventivo EM DIA (nem vencido nem proximo) nunca gera notificacao', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PlanOkNoNotif');
      const vehicleId = await createVehicle(adminAuth);
      const planId = await createPlanWithCompletedService(adminAuth, vehicleId, 90000);
      await request(app.getHttpServer()).patch(`/api/v1/vehicles/${vehicleId}`).set('Authorization', adminAuth).send({ odometerKm: 91000 }).expect(200);

      await processNow(adminAuth);

      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', adminAuth)
        .query({ type: 'VEHICLE_MAINTENANCE' })
        .expect(200);
      expect(res.body.data.items.find((n: { entityId: string }) => n.entityId === planId)).toBeUndefined();
    });

    it('reprocessar (POST /notifications/process 2x) nunca duplica a notificacao do plano (deduplicacao ja existente)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PlanDedupNotif');
      const vehicleId = await createVehicle(adminAuth);
      const planId = await createPlanWithCompletedService(adminAuth, vehicleId, 90000);
      await request(app.getHttpServer()).patch(`/api/v1/vehicles/${vehicleId}`).set('Authorization', adminAuth).send({ odometerKm: 100500 }).expect(200);

      await processNow(adminAuth);
      await processNow(adminAuth);

      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', adminAuth)
        .query({ type: 'VEHICLE_MAINTENANCE' })
        .expect(200);
      const matches = res.body.data.items.filter((n: { entityId: string }) => n.entityId === planId);
      expect(matches).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Integracao: pneu proximo da troca por distancia (Fase 110)
  // ==========================================================================
  // Fase 110 -- mesmo NotificationType.TIRE_NEAR_REPLACEMENT ja existente
  // (gerado ate aqui so por sulco, ver 'integracao -- manutencao de veiculo'
  // acima para o padrao analogo de MaintenancePlan), agora tambem reage a
  // distancia percorrida vs Tire.expectedLifespanKm, distinguido por
  // entityType='TireLifespan'.
  describe('integracao -- pneu proximo da troca por distancia', () => {
    async function installWithOdometer(auth: string, tireId: string, vehicleId: string, odometerKm: number) {
      await request(app.getHttpServer())
        .post(`/api/v1/tires/${tireId}/movements`)
        .set('Authorization', auth)
        .send({ newLocationType: 'VEHICLE', newVehicleId: vehicleId, newPosition: 'Dianteiro Esquerdo', odometerKm })
        .expect(201);
    }

    it('pneu que ja rodou 90%+ da vida util esperada gera TIRE_NEAR_REPLACEMENT com entityType=TireLifespan', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('TireLifespanNotif');
      const vehicleId = await createVehicle(adminAuth);
      const tireId = await createTire(adminAuth, { expectedLifespanKm: 80000 });
      await installWithOdometer(adminAuth, tireId, vehicleId, 100000);

      const otherTireId = await createTire(adminAuth);
      await request(app.getHttpServer())
        .post(`/api/v1/tires/${otherTireId}/movements`)
        .set('Authorization', adminAuth)
        .send({ newLocationType: 'VEHICLE', newVehicleId: vehicleId, newPosition: 'Dianteiro Direito', odometerKm: 185000 })
        .expect(201);

      await processNow(adminAuth);

      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', adminAuth)
        .query({ type: 'TIRE_NEAR_REPLACEMENT' })
        .expect(200);
      const notif = res.body.data.items.find((n: { entityId: string }) => n.entityId === tireId);
      expect(notif).toBeTruthy();
      expect(notif.entityType).toBe('TireLifespan');
      expect(notif.severity).toBe('HIGH');
      expect(notif.metadata).toMatchObject({ vehicleId });
    });

    it('pneu bem abaixo da vida util esperada nunca gera notificacao por distancia', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('TireLifespanOk');
      const vehicleId = await createVehicle(adminAuth);
      const tireId = await createTire(adminAuth, { expectedLifespanKm: 80000 });
      await installWithOdometer(adminAuth, tireId, vehicleId, 100000);

      const otherTireId = await createTire(adminAuth);
      await request(app.getHttpServer())
        .post(`/api/v1/tires/${otherTireId}/movements`)
        .set('Authorization', adminAuth)
        .send({ newLocationType: 'VEHICLE', newVehicleId: vehicleId, newPosition: 'Dianteiro Direito', odometerKm: 110000 })
        .expect(201);

      await processNow(adminAuth);

      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', adminAuth)
        .query({ type: 'TIRE_NEAR_REPLACEMENT' })
        .expect(200);
      expect(res.body.data.items.find((n: { entityId: string }) => n.entityId === tireId)).toBeUndefined();
    });

    it('pneu sem expectedLifespanKm cadastrado nunca gera notificacao por distancia (nunca inventa um limite)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('TireLifespanNoExpected');
      const vehicleId = await createVehicle(adminAuth);
      const tireId = await createTire(adminAuth);
      await installWithOdometer(adminAuth, tireId, vehicleId, 200000);

      await processNow(adminAuth);

      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', adminAuth)
        .query({ type: 'TIRE_NEAR_REPLACEMENT' })
        .expect(200);
      expect(res.body.data.items.find((n: { entityId: string }) => n.entityId === tireId)).toBeUndefined();
    });
  });

  // ==========================================================================
  // Integracao: checklist com nao-conformidade critica (Fase 111)
  // ==========================================================================
  // Fase 111 -- reaproveita a MESMA hasCriticalNonConformity ja usada em
  // GET /checklists/executions e em TripsService.assertPreTripChecklistSatisfied
  // -- nenhuma segunda regra. Mesmo NotificationType.CHECKLIST_CRITICAL_NON_CONFORMITY
  // novo, distinguido de outros tipos por entityType='ChecklistExecution'.
  describe('integracao -- checklist com nao-conformidade critica', () => {
    it('checklist COMPLETED com item critico respondido NAO gera CHECKLIST_CRITICAL_NON_CONFORMITY', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('ChecklistCriticalNotif');
      const vehicleId = await createVehicle(adminAuth);
      const executionId = await createCompletedChecklistWithCriticalAnswer(adminAuth, tenantId, vehicleId, false);

      await processNow(adminAuth);

      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', adminAuth)
        .query({ type: 'CHECKLIST_CRITICAL_NON_CONFORMITY' })
        .expect(200);
      const notif = res.body.data.items.find((n: { entityId: string }) => n.entityId === executionId);
      expect(notif).toBeTruthy();
      expect(notif.entityType).toBe('ChecklistExecution');
      expect(notif.severity).toBe('HIGH');
      expect(notif.metadata).toMatchObject({ vehicleId });
    });

    it('checklist COMPLETED sem nao-conformidade critica nunca gera notificacao', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('ChecklistCriticalOk');
      const vehicleId = await createVehicle(adminAuth);
      const executionId = await createCompletedChecklistWithCriticalAnswer(adminAuth, tenantId, vehicleId, true);

      await processNow(adminAuth);

      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', adminAuth)
        .query({ type: 'CHECKLIST_CRITICAL_NON_CONFORMITY' })
        .expect(200);
      expect(res.body.data.items.find((n: { entityId: string }) => n.entityId === executionId)).toBeUndefined();
    });

    it('reprocessar (POST /notifications/process 2x) nunca duplica a notificacao do checklist', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('ChecklistCriticalDedup');
      const vehicleId = await createVehicle(adminAuth);
      const executionId = await createCompletedChecklistWithCriticalAnswer(adminAuth, tenantId, vehicleId, false);

      await processNow(adminAuth);
      await processNow(adminAuth);

      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', adminAuth)
        .query({ type: 'CHECKLIST_CRITICAL_NON_CONFORMITY' })
        .expect(200);
      const matches = res.body.data.items.filter((n: { entityId: string }) => n.entityId === executionId);
      expect(matches).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Integracao: veiculo indisponivel
  // ==========================================================================
  describe('integracao -- veiculo indisponivel', () => {
    it('veiculo SUSPENDED gera VEHICLE_UNAVAILABLE', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('VehicleIntegration');
      const vehicleId = await createVehicle(adminAuth);

      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'SUSPENDED' })
        .expect(200);
      await processNow(adminAuth);

      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', adminAuth)
        .query({ type: 'VEHICLE_UNAVAILABLE' })
        .expect(200);
      expect(res.body.data.items.some((n: { entityId: string }) => n.entityId === vehicleId)).toBe(true);
    });
  });

  // ==========================================================================
  // Fase A -- veiculo OCIOSO ha muito tempo (tempo SEM VIAGEM entre
  // operacoes). Limiar em TenantSettings.preferences.idleAlertThresholdMinutes
  // (SEM migration). Reaproveita NotificationType.VEHICLE_UNAVAILABLE (nenhum
  // enum novo), distinguido por entityType='VehicleIdle'.
  // ==========================================================================
  describe('integracao -- veiculo ocioso (Fase A)', () => {
    async function setIdleThreshold(auth: string, minutes: number | null) {
      await request(app.getHttpServer())
        .patch('/api/v1/tenant-settings')
        .set('Authorization', auth)
        .send({ preferences: minutes === null ? {} : { idleAlertThresholdMinutes: minutes } })
        .expect(200);
    }

    // Veiculo com 1 viagem CONCLUIDA que chegou ha `hoursAgo` horas e sem
    // viagem posterior -> ocioso agora ha ~hoursAgo horas.
    async function makeIdleVehicle(auth: string, hoursAgo: number) {
      const { tripId, vehicleId } = await setupTripWithVehicleDriver(auth);
      await prisma.trip.update({
        where: { id: tripId },
        data: {
          status: 'COMPLETED',
          actualDeparture: new Date(Date.now() - (hoursAgo + 24) * 60 * 60 * 1000),
          actualArrival: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
        },
      });
      return vehicleId;
    }

    it('sem limiar configurado -> NENHUM alerta de ociosidade (nunca um numero magico)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('IdleNoThreshold');
      await makeIdleVehicle(adminAuth, 48);
      await processNow(adminAuth);
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', adminAuth)
        .query({ type: 'VEHICLE_UNAVAILABLE' })
        .expect(200);
      expect(res.body.data.items.filter((n: { entityType: string }) => n.entityType === 'VehicleIdle')).toHaveLength(0);
    });

    it('veiculo ocioso acima do limiar -> VEHICLE_UNAVAILABLE com entityType=VehicleIdle e metadata da ociosidade', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('IdleOver');
      await setIdleThreshold(adminAuth, 60); // 1h
      const vehicleId = await makeIdleVehicle(adminAuth, 10); // ocioso ha ~10h
      await processNow(adminAuth);

      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', adminAuth)
        .query({ type: 'VEHICLE_UNAVAILABLE', entityType: 'VehicleIdle' })
        .expect(200);
      const notif = res.body.data.items.find((n: { entityId: string }) => n.entityId === vehicleId);
      expect(notif).toBeTruthy();
      expect(notif.type).toBe('VEHICLE_UNAVAILABLE');
      expect(notif.entityType).toBe('VehicleIdle');
      expect(notif.metadata).toMatchObject({ thresholdMinutes: 60 });
      expect(notif.metadata.netIdleMinutes).toBeGreaterThanOrEqual(9 * 60);
    });

    it('veiculo ocioso ABAIXO do limiar -> nenhum alerta', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('IdleUnder');
      await setIdleThreshold(adminAuth, 100000); // limiar altissimo
      await makeIdleVehicle(adminAuth, 5);
      await processNow(adminAuth);
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', adminAuth)
        .query({ type: 'VEHICLE_UNAVAILABLE', entityType: 'VehicleIdle' })
        .expect(200);
      expect(res.body.data.items).toHaveLength(0);
    });

    it('reprocessar (POST /notifications/process 2x) NUNCA duplica a notificacao de ociosidade', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('IdleDedup');
      await setIdleThreshold(adminAuth, 60);
      const vehicleId = await makeIdleVehicle(adminAuth, 12);

      await processNow(adminAuth);
      await processNow(adminAuth);

      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', adminAuth)
        .query({ type: 'VEHICLE_UNAVAILABLE', entityType: 'VehicleIdle' })
        .expect(200);
      const matches = res.body.data.items.filter((n: { entityId: string }) => n.entityId === vehicleId);
      expect(matches).toHaveLength(1);
    });

    it('isolamento multi-tenant: o alerta de ociosidade do tenant A nunca vaza para o tenant B', async () => {
      const a = await createTenantAndLoginAsAdmin('IdleIsoA');
      const b = await createTenantAndLoginAsAdmin('IdleIsoB');
      await setIdleThreshold(a.adminAuth, 60);
      await setIdleThreshold(b.adminAuth, 60);
      await makeIdleVehicle(a.adminAuth, 20);
      await processNow(a.adminAuth);
      await processNow(b.adminAuth);

      const resB = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', b.adminAuth)
        .query({ type: 'VEHICLE_UNAVAILABLE', entityType: 'VehicleIdle' })
        .expect(200);
      expect(resB.body.data.items).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Integracao: contrato vencendo (Fase 98) -- Fase 111 fecha uma lacuna real
  // de cobertura de teste (nao um comportamento novo): esta suite nunca
  // exercitava CONTRACT_EXPIRING, o que deixou passar despercebido um bug
  // real de desalinhamento no Promise.all de collectCandidates (introduzido
  // na Fase 110, corrigido nesta fase -- ver comentario em
  // NotificationsService.collectCandidates) que descartava silenciosamente
  // as notificacoes desse tipo.
  // ==========================================================================
  describe('integracao -- contrato vencendo', () => {
    async function createCustomer(auth: string) {
      const res = await request(app.getHttpServer()).post('/api/v1/customers').set('Authorization', auth).send({ name: 'Cliente Teste' }).expect(201);
      return res.body.data.id as string;
    }

    async function createActiveContract(auth: string, endDate: string) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/freight/contracts')
        .set('Authorization', auth)
        .send({ customerId: await createCustomer(auth), code: `CTR-${randomUUID().slice(0, 8)}`, startDate: '2026-01-01T00:00:00.000Z', endDate })
        .expect(201);
      const contractId = res.body.data.id as string;
      await request(app.getHttpServer())
        .patch(`/api/v1/freight/contracts/${contractId}`)
        .set('Authorization', auth)
        .send({ status: 'ACTIVE' })
        .expect(200);
      return contractId;
    }

    it('contrato ACTIVE vencendo dentro de 30 dias gera CONTRACT_EXPIRING', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ContractExpiring');
      const endDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
      const contractId = await createActiveContract(adminAuth, endDate);

      await processNow(adminAuth);

      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', adminAuth)
        .query({ type: 'CONTRACT_EXPIRING' })
        .expect(200);
      const notif = res.body.data.items.find((n: { entityId: string }) => n.entityId === contractId);
      expect(notif).toBeTruthy();
      expect(notif.entityType).toBe('Contract');
      expect(notif.severity).toBe('MEDIUM');
    });

    it('contrato ACTIVE com vencimento distante nunca gera CONTRACT_EXPIRING', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ContractFar');
      const endDate = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000).toISOString();
      const contractId = await createActiveContract(adminAuth, endDate);

      await processNow(adminAuth);

      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', adminAuth)
        .query({ type: 'CONTRACT_EXPIRING' })
        .expect(200);
      expect(res.body.data.items.find((n: { entityId: string }) => n.entityId === contractId)).toBeUndefined();
    });
  });

  // ==========================================================================
  // Integracao: fiscal (documento generico)
  // ==========================================================================
  describe('integracao -- fiscal', () => {
    it('documento fiscal marcado INVALID gera FISCAL_DOCUMENT_PROBLEM', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('FiscalIntegration');
      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'CTE')
        .attach('file', Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF'), 'doc.pdf')
        .expect(201);
      const documentId = uploadRes.body.data.id as string;

      await request(app.getHttpServer())
        .patch(`/api/v1/fiscal/documents/${documentId}`)
        .set('Authorization', adminAuth)
        .send({ status: 'INVALID' })
        .expect(200);
      await processNow(adminAuth);

      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', adminAuth)
        .query({ type: 'FISCAL_DOCUMENT_PROBLEM' })
        .expect(200);
      expect(res.body.data.items.some((n: { entityId: string }) => n.entityId === documentId)).toBe(true);
    });
  });

  // ==========================================================================
  // Integracao: comprovante de entrega (Fase 70 -- pendencia fechada)
  // ==========================================================================
  describe('integracao -- comprovante de entrega (DELIVERY_PROOF_PENDING/PROBLEM)', () => {
    it('comprovante enviado (status PENDING) gera DELIVERY_PROOF_PENDING para o admin e para o motorista da viagem', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('DeliveryPending');
      const { tripId, driverAuth } = await setupDriverWithTrip(adminAuth, tenantId);
      const documentId = await uploadDeliveryProof(adminAuth, tripId);
      await processNow(adminAuth);

      const adminList = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', adminAuth)
        .query({ type: 'DELIVERY_PROOF_PENDING' })
        .expect(200);
      const adminNotif = adminList.body.data.items.find((n: { entityId: string }) => n.entityId === documentId);
      expect(adminNotif).toBeTruthy();
      expect(adminNotif.metadata).toMatchObject({ tripId });

      const driverList = await request(app.getHttpServer())
        .get('/api/v1/driver/notifications')
        .set('Authorization', driverAuth)
        .query({ type: 'DELIVERY_PROOF_PENDING' })
        .expect(200);
      expect(driverList.body.data.items.some((n: { entityId: string }) => n.entityId === documentId)).toBe(true);
    });

    it('comprovante marcado INVALID gera DELIVERY_PROOF_PROBLEM para admin e motorista', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('DeliveryProblem');
      const { tripId, driverAuth } = await setupDriverWithTrip(adminAuth, tenantId);
      const documentId = await uploadDeliveryProof(adminAuth, tripId);

      await request(app.getHttpServer())
        .patch(`/api/v1/fiscal/documents/${documentId}`)
        .set('Authorization', adminAuth)
        .send({ status: 'INVALID' })
        .expect(200);
      await processNow(adminAuth);

      const adminList = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', adminAuth)
        .query({ type: 'DELIVERY_PROOF_PROBLEM' })
        .expect(200);
      expect(adminList.body.data.items.some((n: { entityId: string }) => n.entityId === documentId)).toBe(true);

      const driverList = await request(app.getHttpServer())
        .get('/api/v1/driver/notifications')
        .set('Authorization', driverAuth)
        .query({ type: 'DELIVERY_PROOF_PROBLEM' })
        .expect(200);
      expect(driverList.body.data.items.some((n: { entityId: string }) => n.entityId === documentId)).toBe(true);
    });

    it('comprovante VALID nunca gera DELIVERY_PROOF_PENDING/PROBLEM', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('DeliveryValid');
      const { tripId } = await setupDriverWithTrip(adminAuth, tenantId);
      const documentId = await uploadDeliveryProof(adminAuth, tripId);
      await request(app.getHttpServer())
        .patch(`/api/v1/fiscal/documents/${documentId}`)
        .set('Authorization', adminAuth)
        .send({ status: 'VALID' })
        .expect(200);
      await processNow(adminAuth);

      const res = await request(app.getHttpServer()).get('/api/v1/notifications').set('Authorization', adminAuth).expect(200);
      expect(res.body.data.items.some((n: { entityId: string }) => n.entityId === documentId)).toBe(false);
    });
  });

  // ==========================================================================
  // Driver App -- camada interna de consulta (Fase 70: NotificationsScreen)
  // ==========================================================================
  describe('Driver App -- GET/PATCH driver/notifications', () => {
    it('motorista consegue consultar/ler as proprias notificacoes; nunca administrativas', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('DriverNotifications');
      const { tripId, driverAuth } = await setupDriverWithTrip(adminAuth, tenantId);
      await createCriticalOccurrence(adminAuth, tripId);
      await uploadDeliveryProof(adminAuth, tripId);
      await processNow(adminAuth);

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/driver/notifications')
        .set('Authorization', driverAuth)
        .expect(200);
      // Recebe DELIVERY_PROOF_PENDING (destinatario direto), nunca
      // CRITICAL_OCCURRENCE (tipo administrativo, sem role DRIVER elegivel).
      expect(listRes.body.data.items.some((n: { type: string }) => n.type === 'DELIVERY_PROOF_PENDING')).toBe(true);
      expect(listRes.body.data.items.some((n: { type: string }) => n.type === 'CRITICAL_OCCURRENCE')).toBe(false);

      const countRes = await request(app.getHttpServer())
        .get('/api/v1/driver/notifications/unread-count')
        .set('Authorization', driverAuth)
        .expect(200);
      expect(countRes.body.data.total).toBeGreaterThanOrEqual(1);

      const notificationId = listRes.body.data.items[0].id;
      const readRes = await request(app.getHttpServer())
        .patch(`/api/v1/driver/notifications/${notificationId}/read`)
        .set('Authorization', driverAuth)
        .expect(200);
      expect(readRes.body.data.readAt).toBeTruthy();
    });

    it('motorista A nunca ve notificacoes do motorista B (mesmo tenant)', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('DriverIsolation');
      const driverA = await setupDriverWithTrip(adminAuth, tenantId);
      const driverB = await setupDriverWithTrip(adminAuth, tenantId);
      await uploadDeliveryProof(adminAuth, driverA.tripId);
      await processNow(adminAuth);

      const listB = await request(app.getHttpServer())
        .get('/api/v1/driver/notifications')
        .set('Authorization', driverB.driverAuth)
        .expect(200);
      expect(listB.body.data.items).toHaveLength(0);
    });

    it('sem notificacoes destinadas ao motorista, a lista vem vazia (nenhum dos tipos administrativos e enviado a DRIVER)', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('DriverEmpty');
      const { tripId, driverAuth } = await setupDriverWithTrip(adminAuth, tenantId);
      await createCriticalOccurrence(adminAuth, tripId);
      await processNow(adminAuth);

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/driver/notifications')
        .set('Authorization', driverAuth)
        .expect(200);
      expect(listRes.body.data.items).toEqual([]);
    });
  });

  // ==========================================================================
  // Job agendado (processAllTenants) -- chamado direto via DI, mesmo
  // mecanismo do NotificationsProcessingScheduler.
  // ==========================================================================
  describe('job de background (processAllTenants)', () => {
    it('processa varios tenants numa unica chamada e e idempotente entre execucoes', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('JobTenantA');
      const tenantB = await createTenantAndLoginAsAdmin('JobTenantB');
      const { tripId: tripA } = await setupTripWithVehicleDriver(tenantA.adminAuth);
      const { tripId: tripB } = await setupTripWithVehicleDriver(tenantB.adminAuth);
      await createCriticalOccurrence(tenantA.adminAuth, tripA);
      await createCriticalOccurrence(tenantB.adminAuth, tripB);

      const notificationsService = app.get(NotificationsService);
      const result1 = await notificationsService.processAllTenants();
      expect(result1.notificationsCreated).toBeGreaterThanOrEqual(2);

      const result2 = await notificationsService.processAllTenants();
      expect(result2.notificationsCreated).toBe(0);

      const listA = await request(app.getHttpServer()).get('/api/v1/notifications').set('Authorization', tenantA.adminAuth).expect(200);
      const listB = await request(app.getHttpServer()).get('/api/v1/notifications').set('Authorization', tenantB.adminAuth).expect(200);
      expect(listA.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(listB.body.data.items.length).toBeGreaterThanOrEqual(1);
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
        slug: `notif-n1-${label.toLowerCase()}-${unique}`,
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
      return tripRes.body.data.id as string;
    }

    async function seedOccurrence(adminAuth: string, tripId: string, index: number) {
      await request(countingApp.getHttpServer())
        .post(`/api/v1/trips/${tripId}/occurrences`)
        .set('Authorization', adminAuth)
        .send({
          type: 'OTHER',
          severity: 'CRITICAL',
          description: `oc-${index}`,
          occurredAt: `2026-09-01T${String(index % 24).padStart(2, '0')}:00:00.000Z`,
        })
        .expect(201);
    }

    it('a contagem de queries de POST /notifications/process nao cresce entre 10 e 50 condicoes', async () => {
      const { adminAuth } = await createTenantAndLoginOnCountingApp('N1Check');
      const tripId = await setupTripOnCountingApp(adminAuth);

      for (let i = 0; i < 10; i += 1) {
        await seedOccurrence(adminAuth, tripId, i);
      }
      queryCount = 0;
      await request(countingApp.getHttpServer()).post('/api/v1/notifications/process').set('Authorization', adminAuth).expect(200);
      const queriesFor10 = queryCount;
      expect(queriesFor10).toBeGreaterThan(0);

      for (let i = 10; i < 50; i += 1) {
        await seedOccurrence(adminAuth, tripId, i);
      }
      queryCount = 0;
      await request(countingApp.getHttpServer()).post('/api/v1/notifications/process').set('Authorization', adminAuth).expect(200);
      const queriesFor50 = queryCount;

      // O(1): numero FIXO de queries (1 por coletor + 1 de destinatarios +
      // 1 createMany), nunca 1 por condicao/notificacao.
      expect(queriesFor50).toBeLessThanOrEqual(queriesFor10 + 1);
    }, 120000);

    it('GET /notifications/unread-count e O(1) independente do numero de notificacoes ja existentes', async () => {
      const { adminAuth } = await createTenantAndLoginOnCountingApp('UnreadN1');
      const tripId = await setupTripOnCountingApp(adminAuth);
      for (let i = 0; i < 20; i += 1) {
        await seedOccurrence(adminAuth, tripId, i);
      }
      await request(countingApp.getHttpServer()).post('/api/v1/notifications/process').set('Authorization', adminAuth).expect(200);

      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', adminAuth)
        .expect(200);
      const queriesWith20 = queryCount;
      expect(queriesWith20).toBeGreaterThan(0);

      for (let i = 20; i < 60; i += 1) {
        await seedOccurrence(adminAuth, tripId, i);
      }
      await request(countingApp.getHttpServer()).post('/api/v1/notifications/process').set('Authorization', adminAuth).expect(200);

      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', adminAuth)
        .expect(200);
      const queriesWith60 = queryCount;

      // Leitura pura (Fase 70): so os 2 counts do service (+ eventual
      // overhead fixo de auth/tenant-context, igual em toda requisicao
      // autenticada) -- nunca cresce com o volume de notificacoes/dados.
      expect(queriesWith60).toBe(queriesWith20);
    }, 60000);
  });
});
