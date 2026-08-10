import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Maintenances (e2e)', () => {
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

  // completedAt precisa ser POSTERIOR a openedAt (default = momento real da
  // criacao, quando o payload nao informa openedAt -- ver
  // MaintenancesService.assertDatesConsistent). Uma data literal fixa (ex:
  // '2026-08-10') se torna invalida assim que o relogio real ultrapassa esse
  // valor durante sessoes de desenvolvimento longas -- por isso relativa a
  // "agora" (sempre no futuro em relacao ao openedAt default), nunca um
  // literal que pode expirar.
  function futureDateOnly(daysFromNow: number): string {
    const date = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 10);
  }

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

  function buildVehiclePayload(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      plate: randomPlate(),
      brand: 'Volvo',
      model: 'FH 540',
      type: 'TRACTOR_UNIT',
      ...overrides,
    };
  }

  async function createTenantAndLoginAsAdmin(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    const payload = {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `maint-${label.toLowerCase()}-${unique}`,
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

  async function createVehicle(auth: string, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/vehicles')
      .set('Authorization', auth)
      .send(buildVehiclePayload(overrides))
      .expect(201);
    return res.body.data.id as string;
  }

  function buildMaintenancePayload(
    vehicleId: string,
    overrides: Partial<Record<string, unknown>> = {},
  ) {
    return {
      vehicleId,
      type: 'PREVENTIVE',
      description: 'Troca de oleo e filtros',
      ...overrides,
    };
  }

  describe('CRUD completo', () => {
    it('cria, consulta, atualiza (calcula totalCost automaticamente) e altera status', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Crud');
      const auth = `Bearer ${adminAccessToken}`;
      const vehicleId = await createVehicle(auth);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', auth)
        .send(buildMaintenancePayload(vehicleId, { priority: 'HIGH', workshop: 'Oficina Central' }))
        .expect(201);

      const maintenance = createRes.body.data;
      expect(maintenance.vehicleId).toBe(vehicleId);
      expect(maintenance.status).toBe('OPEN');
      expect(maintenance.priority).toBe('HIGH');
      expect(maintenance.totalCost).toBeNull();

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/maintenances/${maintenance.id}`)
        .set('Authorization', auth)
        .expect(200);
      expect(getRes.body.data.id).toBe(maintenance.id);

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/maintenances/${maintenance.id}`)
        .set('Authorization', auth)
        .send({ laborCost: 350.5, partsCost: 890, mechanic: 'Joao' })
        .expect(200);
      expect(updateRes.body.data.laborCost).toBe(350.5);
      expect(updateRes.body.data.partsCost).toBe(890);
      expect(updateRes.body.data.totalCost).toBe(1240.5);

      const statusRes = await request(app.getHttpServer())
        .patch(`/api/v1/maintenances/${maintenance.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      expect(statusRes.body.data.status).toBe('IN_PROGRESS');
    });

    it('exclui manutencao recem criada sem alteracoes', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('DeleteFresh');
      const auth = `Bearer ${adminAccessToken}`;
      const vehicleId = await createVehicle(auth);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', auth)
        .send(buildMaintenancePayload(vehicleId))
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/v1/maintenances/${createRes.body.data.id}`)
        .set('Authorization', auth)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/maintenances/${createRes.body.data.id}`)
        .set('Authorization', auth)
        .expect(404);
    });

    it('bloqueia exclusao apos qualquer alteracao (usada por auditoria)', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('DeleteAudited');
      const auth = `Bearer ${adminAccessToken}`;
      const vehicleId = await createVehicle(auth);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', auth)
        .send(buildMaintenancePayload(vehicleId))
        .expect(201);
      const maintenanceId = createRes.body.data.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/maintenances/${maintenanceId}`)
        .set('Authorization', auth)
        .send({ notes: 'Atualizado' })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/v1/maintenances/${maintenanceId}`)
        .set('Authorization', auth)
        .expect(409);
    });

    it('bloqueia exclusao de manutencao concluida', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('DeleteCompleted');
      const auth = `Bearer ${adminAccessToken}`;
      const vehicleId = await createVehicle(auth);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', auth)
        .send(buildMaintenancePayload(vehicleId))
        .expect(201);
      const maintenanceId = createRes.body.data.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/maintenances/${maintenanceId}`)
        .set('Authorization', auth)
        .send({ laborCost: 100 })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/maintenances/${maintenanceId}/status`)
        .set('Authorization', auth)
        .send({ status: 'COMPLETED', completedAt: futureDateOnly(1) })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/v1/maintenances/${maintenanceId}`)
        .set('Authorization', auth)
        .expect(409);
    });
  });

  describe('validacoes', () => {
    it('rejeita veiculo inexistente com 404', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('VehMissing');
      await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(buildMaintenancePayload(randomUUID()))
        .expect(404);
    });

    it('rejeita veiculo de outro tenant com 404', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('VehOtherA');
      const tenantB = await createTenantAndLoginAsAdmin('VehOtherB');
      const vehicleInB = await createVehicle(`Bearer ${tenantB.adminAccessToken}`);

      await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', `Bearer ${tenantA.adminAccessToken}`)
        .send(buildMaintenancePayload(vehicleInB))
        .expect(404);
    });

    it('rejeita valores negativos (laborCost, partsCost, odometerKm) com 400', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('NegativeValues');
      const auth = `Bearer ${adminAccessToken}`;
      const vehicleId = await createVehicle(auth);

      await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', auth)
        .send(buildMaintenancePayload(vehicleId, { laborCost: -1 }))
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', auth)
        .send(buildMaintenancePayload(vehicleId, { partsCost: -1 }))
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', auth)
        .send(buildMaintenancePayload(vehicleId, { odometerKm: -1 }))
        .expect(400);
    });

    it('rejeita conclusao sem data de conclusao com 409', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('CompleteNoDate');
      const auth = `Bearer ${adminAccessToken}`;
      const vehicleId = await createVehicle(auth);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', auth)
        .send(buildMaintenancePayload(vehicleId))
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/maintenances/${createRes.body.data.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'COMPLETED' })
        .expect(409);
    });

    it('rejeita conclusao sem valor total com 409', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('CompleteNoCost');
      const auth = `Bearer ${adminAccessToken}`;
      const vehicleId = await createVehicle(auth);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', auth)
        .send(buildMaintenancePayload(vehicleId))
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/maintenances/${createRes.body.data.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'COMPLETED', completedAt: futureDateOnly(1) })
        .expect(409);
    });

    it('rejeita data de conclusao anterior a data de abertura com 409', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('DateInconsistent');
      const auth = `Bearer ${adminAccessToken}`;
      const vehicleId = await createVehicle(auth);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', auth)
        .send(buildMaintenancePayload(vehicleId, { openedAt: '2026-08-10', laborCost: 100 }))
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/maintenances/${createRes.body.data.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'COMPLETED', completedAt: '2026-08-01' })
        .expect(409);
    });
  });

  describe('filtros, paginacao e ordenacao', () => {
    it('filtra por status, tipo, prioridade, veiculo, placa, oficina, fornecedor, periodo e busca livre', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Filters');
      const auth = `Bearer ${adminAccessToken}`;
      const vehicleA = await createVehicle(auth);
      const vehicleARes = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleA}`)
        .set('Authorization', auth)
        .expect(200);
      const vehicleAPlate = vehicleARes.body.data.plate;
      const vehicleB = await createVehicle(auth);

      const preventive = await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', auth)
        .send(
          buildMaintenancePayload(vehicleA, {
            type: 'PREVENTIVE',
            priority: 'LOW',
            workshop: 'Oficina Norte',
            supplier: 'Volvo Pecas',
            openedAt: '2026-01-10',
            serviceOrderNumber: 'OS-0001',
          }),
        )
        .expect(201);

      const corrective = await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', auth)
        .send(
          buildMaintenancePayload(vehicleB, {
            type: 'CORRECTIVE',
            priority: 'CRITICAL',
            workshop: 'Oficina Sul',
            supplier: 'Scania Pecas',
            openedAt: '2026-03-15',
            description: 'Falha no motor',
          }),
        )
        .expect(201);

      const byStatus = await request(app.getHttpServer())
        .get('/api/v1/maintenances?status=OPEN')
        .set('Authorization', auth)
        .expect(200);
      expect(byStatus.body.data.items.length).toBeGreaterThanOrEqual(2);

      const byType = await request(app.getHttpServer())
        .get('/api/v1/maintenances?type=CORRECTIVE')
        .set('Authorization', auth)
        .expect(200);
      expect(byType.body.data.items).toHaveLength(1);
      expect(byType.body.data.items[0].id).toBe(corrective.body.data.id);

      const byPriority = await request(app.getHttpServer())
        .get('/api/v1/maintenances?priority=CRITICAL')
        .set('Authorization', auth)
        .expect(200);
      expect(byPriority.body.data.items).toHaveLength(1);
      expect(byPriority.body.data.items[0].id).toBe(corrective.body.data.id);

      const byVehicle = await request(app.getHttpServer())
        .get(`/api/v1/maintenances?vehicleId=${vehicleA}`)
        .set('Authorization', auth)
        .expect(200);
      expect(byVehicle.body.data.items).toHaveLength(1);
      expect(byVehicle.body.data.items[0].id).toBe(preventive.body.data.id);

      const byPlate = await request(app.getHttpServer())
        .get(`/api/v1/maintenances?plate=${vehicleAPlate}`)
        .set('Authorization', auth)
        .expect(200);
      expect(byPlate.body.data.items).toHaveLength(1);
      expect(byPlate.body.data.items[0].id).toBe(preventive.body.data.id);

      const byWorkshop = await request(app.getHttpServer())
        .get('/api/v1/maintenances?workshop=Sul')
        .set('Authorization', auth)
        .expect(200);
      expect(byWorkshop.body.data.items).toHaveLength(1);
      expect(byWorkshop.body.data.items[0].id).toBe(corrective.body.data.id);

      const bySupplier = await request(app.getHttpServer())
        .get('/api/v1/maintenances?supplier=Volvo')
        .set('Authorization', auth)
        .expect(200);
      expect(bySupplier.body.data.items).toHaveLength(1);
      expect(bySupplier.body.data.items[0].id).toBe(preventive.body.data.id);

      const byPeriod = await request(app.getHttpServer())
        .get('/api/v1/maintenances?openedFrom=2026-01-01&openedTo=2026-02-01')
        .set('Authorization', auth)
        .expect(200);
      expect(byPeriod.body.data.items).toHaveLength(1);
      expect(byPeriod.body.data.items[0].id).toBe(preventive.body.data.id);

      const bySearch = await request(app.getHttpServer())
        .get('/api/v1/maintenances?search=motor')
        .set('Authorization', auth)
        .expect(200);
      expect(bySearch.body.data.items).toHaveLength(1);
      expect(bySearch.body.data.items[0].id).toBe(corrective.body.data.id);

      const paginated = await request(app.getHttpServer())
        .get('/api/v1/maintenances?page=1&pageSize=1&sortBy=openedAt&sortOrder=asc')
        .set('Authorization', auth)
        .expect(200);
      expect(paginated.body.data.items).toHaveLength(1);
      expect(paginated.body.data.items[0].id).toBe(preventive.body.data.id);
      expect(paginated.body.data.meta).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    });
  });

  describe('isolamento multi-tenant', () => {
    it('nunca permite acesso cruzado entre tenants', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolA');
      const tenantB = await createTenantAndLoginAsAdmin('IsolB');
      const authA = `Bearer ${tenantA.adminAccessToken}`;
      const authB = `Bearer ${tenantB.adminAccessToken}`;
      const vehicleA = await createVehicle(authA);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', authA)
        .send(buildMaintenancePayload(vehicleA))
        .expect(201);
      const maintenanceId = createRes.body.data.id;

      await request(app.getHttpServer())
        .get(`/api/v1/maintenances/${maintenanceId}`)
        .set('Authorization', authB)
        .expect(404);

      await request(app.getHttpServer())
        .patch(`/api/v1/maintenances/${maintenanceId}`)
        .set('Authorization', authB)
        .send({ notes: 'Sequestrado' })
        .expect(404);

      await request(app.getHttpServer())
        .delete(`/api/v1/maintenances/${maintenanceId}`)
        .set('Authorization', authB)
        .expect(404);

      const listInB = await request(app.getHttpServer())
        .get('/api/v1/maintenances')
        .set('Authorization', authB)
        .expect(200);
      expect(
        listInB.body.data.items.find((m: { id: string }) => m.id === maintenanceId),
      ).toBeUndefined();
    });
  });

  describe('GET /vehicles/:vehicleId/maintenances', () => {
    it('lista apenas as manutencoes do veiculo informado', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('NestedList');
      const auth = `Bearer ${adminAccessToken}`;
      const vehicleA = await createVehicle(auth);
      const vehicleB = await createVehicle(auth);

      const maintA = await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', auth)
        .send(buildMaintenancePayload(vehicleA))
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', auth)
        .send(buildMaintenancePayload(vehicleB))
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleA}/maintenances`)
        .set('Authorization', auth)
        .expect(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].id).toBe(maintA.body.data.id);
    });

    it('retorna 404 para veiculo inexistente', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('NestedMissing');
      await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${randomUUID()}/maintenances`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(404);
    });
  });

  describe('permissoes por perfil', () => {
    it('OPERATOR le mas nao cria manutencoes (403)', async () => {
      const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('RolesOperator');
      const operatorEmail = `operator-maint-${randomUUID()}@teste.com`;
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          name: 'Operador',
          email: operatorEmail,
          password: 'SenhaForte123!',
          role: 'OPERATOR',
        })
        .expect(201);

      const operatorLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId, email: operatorEmail, password: 'SenhaForte123!' })
        .expect(200);
      const operatorAuth = `Bearer ${operatorLogin.body.data.accessToken}`;

      await request(app.getHttpServer())
        .get('/api/v1/maintenances')
        .set('Authorization', operatorAuth)
        .expect(200);

      const vehicleId = await createVehicle(`Bearer ${adminAccessToken}`);
      await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', operatorAuth)
        .send(buildMaintenancePayload(vehicleId))
        .expect(403);
    });
  });
});
