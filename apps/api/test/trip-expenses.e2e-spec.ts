import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Trip Expenses (e2e)', () => {
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
      slug: `expenses-${label.toLowerCase()}-${unique}`,
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

  // Monta uma viagem completa (motorista + composicao/veiculo), pronta para
  // receber despesas -- driverId/vehicleId ficam disponiveis para asserts.
  async function setupTrip(auth: string) {
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
        plannedArrival: '2026-09-05T18:00:00.000Z',
      })
      .expect(201);

    return { vehicleId, driverId, tripId: tripRes.body.data.id as string };
  }

  // Sem `async`: precisa retornar o supertest.Test diretamente (nao uma
  // Promise) para o `.expect(...)` encadear na chamada, ex:
  // `createExpense(...).expect(201)`.
  function createExpense(
    auth: string,
    tripId: string,
    overrides: Partial<Record<string, unknown>> = {},
  ) {
    return request(app.getHttpServer())
      .post('/api/v1/trip-expenses')
      .set('Authorization', auth)
      .send({
        tripId,
        category: 'FUEL',
        description: 'Abastecimento posto Graal',
        expenseDate: '2026-09-02T10:00:00.000Z',
        amount: 350.5,
        ...overrides,
      });
  }

  describe('CRUD + derivacao automatica de driverId/vehicleId', () => {
    it('cria, consulta, atualiza e exclui uma despesa', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Crud');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId, driverId, vehicleId } = await setupTrip(auth);

      const createRes = await createExpense(auth, tripId, {
        supplier: 'Posto Graal',
        documentNumber: 'NF-1',
        paymentMethod: 'CREDIT_CARD',
      }).expect(201);

      expect(createRes.body.data.tripId).toBe(tripId);
      expect(createRes.body.data.driverId).toBe(driverId);
      expect(createRes.body.data.vehicleId).toBe(vehicleId);
      expect(createRes.body.data.status).toBe('PENDING');
      expect(createRes.body.data.amount).toBe(350.5);
      expect(createRes.body.data.currency).toBe('BRL');
      expect(createRes.body.data.createdBy).toBeTruthy();

      const id = createRes.body.data.id;
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/trip-expenses/${id}`)
        .set('Authorization', auth)
        .expect(200);
      expect(getRes.body.data.supplier).toBe('Posto Graal');

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/trip-expenses/${id}`)
        .set('Authorization', auth)
        .send({ amount: 400, description: 'Abastecimento corrigido' })
        .expect(200);
      expect(updateRes.body.data.amount).toBe(400);
      expect(updateRes.body.data.updatedBy).toBeTruthy();

      await request(app.getHttpServer())
        .delete(`/api/v1/trip-expenses/${id}`)
        .set('Authorization', auth)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/trip-expenses/${id}`)
        .set('Authorization', auth)
        .expect(404);
    });

    it('rejeita driverId/vehicleId/status/createdBy enviados pelo cliente (whitelist do DTO) e deriva tudo automaticamente quando ausentes', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('IgnoreClientIds');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId, driverId, vehicleId } = await setupTrip(auth);

      // ValidationPipe global (whitelist + forbidNonWhitelisted) rejeita de
      // cara qualquer campo nao declarado no DTO -- driverId/vehicleId/
      // status/createdBy nunca chegam a ser considerados.
      await createExpense(auth, tripId, { driverId: randomUUID() }).expect(400);
      await createExpense(auth, tripId, { vehicleId: randomUUID() }).expect(400);
      await createExpense(auth, tripId, { status: 'APPROVED' }).expect(400);
      await createExpense(auth, tripId, { createdBy: randomUUID() }).expect(400);

      const res = await createExpense(auth, tripId).expect(201);
      expect(res.body.data.driverId).toBe(driverId);
      expect(res.body.data.vehicleId).toBe(vehicleId);
      expect(res.body.data.status).toBe('PENDING');
    });
  });

  describe('validacoes', () => {
    it('rejeita viagem inexistente com 404', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('MissingTrip');
      const auth = `Bearer ${adminAccessToken}`;
      await createExpense(auth, randomUUID()).expect(404);
    });

    it('rejeita valor menor ou igual a zero, categoria/data/descricao ausentes com 400', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('BadFields');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId } = await setupTrip(auth);

      await createExpense(auth, tripId, { amount: 0 }).expect(400);
      await createExpense(auth, tripId, { amount: -10 }).expect(400);

      await request(app.getHttpServer())
        .post('/api/v1/trip-expenses')
        .set('Authorization', auth)
        .send({ tripId, amount: 10, expenseDate: '2026-09-02T10:00:00.000Z' })
        .expect(400);
    });

    it('nao permite despesa em viagem cancelada', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('CancelledTrip');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId } = await setupTrip(auth);

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/cancel`)
        .set('Authorization', auth)
        .expect(200);

      await createExpense(auth, tripId).expect(409);
    });

    it('rejeita attachmentId inexistente com 404', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('BadAttachment');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId } = await setupTrip(auth);

      await createExpense(auth, tripId, { attachmentId: randomUUID() }).expect(404);
    });

    it('aceita vinculo com Attachment existente', async () => {
      const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('GoodAttachment');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId } = await setupTrip(auth);

      const attachment = await prisma.attachment.create({
        data: {
          tenantId,
          entityName: 'TripExpense',
          entityId: randomUUID(),
          storageKey: `receipts/${randomUUID()}.pdf`,
        },
      });

      const res = await createExpense(auth, tripId, { attachmentId: attachment.id }).expect(201);
      expect(res.body.data.attachmentId).toBe(attachment.id);
    });

    it('nao permite editar despesa que ja saiu de PENDING', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('EditApproved');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId } = await setupTrip(auth);
      const createRes = await createExpense(auth, tripId).expect(201);
      const id = createRes.body.data.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/trip-expenses/${id}/status`)
        .set('Authorization', auth)
        .send({ status: 'APPROVED' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/trip-expenses/${id}`)
        .set('Authorization', auth)
        .send({ amount: 999 })
        .expect(409);
    });
  });

  describe('aprovacao, rejeicao e cancelamento', () => {
    it('aprova uma despesa PENDING e registra approvedBy/approvedAt', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Approve');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId } = await setupTrip(auth);
      const createRes = await createExpense(auth, tripId).expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/trip-expenses/${createRes.body.data.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'APPROVED' })
        .expect(200);

      expect(res.body.data.status).toBe('APPROVED');
      expect(res.body.data.approvedBy).toBeTruthy();
      expect(res.body.data.approvedAt).toBeTruthy();
    });

    it('rejeita uma despesa PENDING', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Reject');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId } = await setupTrip(auth);
      const createRes = await createExpense(auth, tripId).expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/trip-expenses/${createRes.body.data.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'REJECTED' })
        .expect(200);

      expect(res.body.data.status).toBe('REJECTED');
      expect(res.body.data.approvedBy).toBeTruthy();
    });

    it('cancela uma despesa ja aprovada, mas nao permite REJECTED -> APPROVED', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('CancelFlow');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId } = await setupTrip(auth);
      const createRes = await createExpense(auth, tripId).expect(201);
      const id = createRes.body.data.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/trip-expenses/${id}/status`)
        .set('Authorization', auth)
        .send({ status: 'APPROVED' })
        .expect(200);

      const cancelRes = await request(app.getHttpServer())
        .patch(`/api/v1/trip-expenses/${id}/status`)
        .set('Authorization', auth)
        .send({ status: 'CANCELLED' })
        .expect(200);
      expect(cancelRes.body.data.status).toBe('CANCELLED');

      const create2 = await createExpense(auth, tripId).expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/trip-expenses/${create2.body.data.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'REJECTED' })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/trip-expenses/${create2.body.data.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'APPROVED' })
        .expect(409);
    });
  });

  describe('filtros e paginacao', () => {
    it('filtra por categoria, status, motorista, veiculo, fornecedor, periodo e faixa de valor', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Filters');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId, driverId, vehicleId } = await setupTrip(auth);

      const fuel = await createExpense(auth, tripId, {
        category: 'FUEL',
        supplier: 'Posto Ipiranga',
        amount: 300,
        expenseDate: '2026-01-10T10:00:00.000Z',
      }).expect(201);

      const food = await createExpense(auth, tripId, {
        category: 'FOOD',
        supplier: 'Restaurante do Zé',
        amount: 50,
        expenseDate: '2026-06-10T10:00:00.000Z',
      }).expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/trip-expenses/${food.body.data.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'APPROVED' })
        .expect(200);

      const byCategory = await request(app.getHttpServer())
        .get('/api/v1/trip-expenses?category=FUEL')
        .set('Authorization', auth)
        .expect(200);
      expect(byCategory.body.data.items).toHaveLength(1);
      expect(byCategory.body.data.items[0].id).toBe(fuel.body.data.id);

      const byStatus = await request(app.getHttpServer())
        .get('/api/v1/trip-expenses?status=APPROVED')
        .set('Authorization', auth)
        .expect(200);
      expect(byStatus.body.data.items).toHaveLength(1);
      expect(byStatus.body.data.items[0].id).toBe(food.body.data.id);

      const byDriver = await request(app.getHttpServer())
        .get(`/api/v1/trip-expenses?driverId=${driverId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(byDriver.body.data.items).toHaveLength(2);

      const byVehicle = await request(app.getHttpServer())
        .get(`/api/v1/trip-expenses?vehicleId=${vehicleId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(byVehicle.body.data.items).toHaveLength(2);

      const bySupplier = await request(app.getHttpServer())
        .get('/api/v1/trip-expenses?supplier=ipiranga')
        .set('Authorization', auth)
        .expect(200);
      expect(bySupplier.body.data.items).toHaveLength(1);
      expect(bySupplier.body.data.items[0].id).toBe(fuel.body.data.id);

      const byPeriod = await request(app.getHttpServer())
        .get('/api/v1/trip-expenses?expenseDateFrom=2026-01-01&expenseDateTo=2026-02-01')
        .set('Authorization', auth)
        .expect(200);
      expect(byPeriod.body.data.items).toHaveLength(1);
      expect(byPeriod.body.data.items[0].id).toBe(fuel.body.data.id);

      const byAmount = await request(app.getHttpServer())
        .get('/api/v1/trip-expenses?minAmount=100&maxAmount=1000')
        .set('Authorization', auth)
        .expect(200);
      expect(byAmount.body.data.items).toHaveLength(1);
      expect(byAmount.body.data.items[0].id).toBe(fuel.body.data.id);

      const paginated = await request(app.getHttpServer())
        .get(
          `/api/v1/trip-expenses?tripId=${tripId}&page=1&pageSize=1&sortBy=amount&sortOrder=desc`,
        )
        .set('Authorization', auth)
        .expect(200);
      expect(paginated.body.data.items).toHaveLength(1);
      expect(paginated.body.data.meta).toMatchObject({ total: 2, page: 1, pageSize: 1 });
      expect(paginated.body.data.items[0].id).toBe(fuel.body.data.id);
    });

    it('GET /trips/:id/expenses retorna as despesas da viagem', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('TripExpensesSubroute');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId } = await setupTrip(auth);
      await createExpense(auth, tripId).expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/expenses`)
        .set('Authorization', auth)
        .expect(200);
      expect(res.body.data.items).toHaveLength(1);

      await request(app.getHttpServer())
        .get(`/api/v1/trips/${randomUUID()}/expenses`)
        .set('Authorization', auth)
        .expect(404);
    });
  });

  describe('GET /trips/:id/financial-summary', () => {
    it('agrega por categoria, ignora REJECTED/CANCELLED e calcula media/maior despesa', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('FinancialSummary');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId } = await setupTrip(auth);

      await createExpense(auth, tripId, { category: 'FUEL', amount: 300 }).expect(201);
      await createExpense(auth, tripId, { category: 'FOOD', amount: 50 }).expect(201);
      await createExpense(auth, tripId, { category: 'HOTEL', amount: 200 }).expect(201);
      await createExpense(auth, tripId, { category: 'MAINTENANCE', amount: 150 }).expect(201);
      await createExpense(auth, tripId, { category: 'TOLL_EXTRA', amount: 40 }).expect(201);
      await createExpense(auth, tripId, { category: 'TIRES', amount: 500 }).expect(201);
      await createExpense(auth, tripId, { category: 'PARKING', amount: 20 }).expect(201);

      const rejected = await createExpense(auth, tripId, { category: 'FUEL', amount: 999 }).expect(
        201,
      );
      await request(app.getHttpServer())
        .patch(`/api/v1/trip-expenses/${rejected.body.data.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'REJECTED' })
        .expect(200);

      const cancelled = await createExpense(auth, tripId, { category: 'FOOD', amount: 888 }).expect(
        201,
      );
      await request(app.getHttpServer())
        .patch(`/api/v1/trip-expenses/${cancelled.body.data.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'CANCELLED' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/financial-summary`)
        .set('Authorization', auth)
        .expect(200);

      const summary = res.body.data;
      expect(summary.tripId).toBe(tripId);
      expect(summary.fuelExpenses).toBe(300);
      expect(summary.foodExpenses).toBe(50);
      expect(summary.hotelExpenses).toBe(200);
      expect(summary.maintenanceExpenses).toBe(150);
      expect(summary.tollExpenses).toBe(40);
      expect(summary.otherExpenses).toBe(520); // TIRES 500 + PARKING 20
      expect(summary.totalExpenses).toBe(1260); // soma acima, sem REJECTED/CANCELLED
      expect(summary.expenseCount).toBe(7);
      expect(summary.largestExpense).toBe(500);
      expect(summary.averageExpense).toBeCloseTo(1260 / 7, 2);
    });
  });

  describe('isolamento multi-tenant', () => {
    it('nunca permite acesso cruzado entre tenants', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolA');
      const tenantB = await createTenantAndLoginAsAdmin('IsolB');
      const authA = `Bearer ${tenantA.adminAccessToken}`;
      const authB = `Bearer ${tenantB.adminAccessToken}`;

      const { tripId } = await setupTrip(authA);
      const expenseRes = await createExpense(authA, tripId).expect(201);

      await request(app.getHttpServer())
        .get(`/api/v1/trip-expenses/${expenseRes.body.data.id}`)
        .set('Authorization', authB)
        .expect(404);

      const listInB = await request(app.getHttpServer())
        .get('/api/v1/trip-expenses')
        .set('Authorization', authB)
        .expect(200);
      expect(
        listInB.body.data.items.find((e: { id: string }) => e.id === expenseRes.body.data.id),
      ).toBeUndefined();

      await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/financial-summary`)
        .set('Authorization', authB)
        .expect(404);
    });
  });

  describe('permissoes por perfil (RBAC)', () => {
    it('OPERATOR cria e le, mas nao aprova/rejeita/cancela/exclui (403)', async () => {
      const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('RolesOperator');
      const adminAuth = `Bearer ${adminAccessToken}`;
      const operatorAuth = await createUserWithRole(tenantId, adminAuth, 'OPERATOR');
      const { tripId } = await setupTrip(adminAuth);

      const createRes = await createExpense(operatorAuth, tripId).expect(201);

      await request(app.getHttpServer())
        .get(`/api/v1/trip-expenses/${createRes.body.data.id}`)
        .set('Authorization', operatorAuth)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/trip-expenses/${createRes.body.data.id}/status`)
        .set('Authorization', operatorAuth)
        .send({ status: 'APPROVED' })
        .expect(403);

      await request(app.getHttpServer())
        .delete(`/api/v1/trip-expenses/${createRes.body.data.id}`)
        .set('Authorization', operatorAuth)
        .expect(403);
    });

    it('AUDITOR le mas nao cria despesas (403)', async () => {
      const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('RolesAuditor');
      const adminAuth = `Bearer ${adminAccessToken}`;
      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');
      const { tripId } = await setupTrip(adminAuth);

      await request(app.getHttpServer())
        .get('/api/v1/trip-expenses')
        .set('Authorization', auditorAuth)
        .expect(200);

      await createExpense(auditorAuth, tripId).expect(403);
    });

    it('ADMIN pode aprovar, rejeitar, cancelar e excluir', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('RolesAdmin');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId } = await setupTrip(auth);
      const createRes = await createExpense(auth, tripId).expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/trip-expenses/${createRes.body.data.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'APPROVED' })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/v1/trip-expenses/${createRes.body.data.id}`)
        .set('Authorization', auth)
        .expect(204);
    });
  });

  describe('auditoria', () => {
    it('registra quem, quando, IP, User-Agent, tenant, antes e depois em cada mutacao', async () => {
      const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('Audit');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId } = await setupTrip(auth);

      const createRes = await createExpense(auth, tripId).expect(201);
      const id = createRes.body.data.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/trip-expenses/${id}`)
        .set('Authorization', auth)
        .set('User-Agent', 'jest-e2e-agent')
        .send({ amount: 500 })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/trip-expenses/${id}/status`)
        .set('Authorization', auth)
        .send({ status: 'APPROVED' })
        .expect(200);

      const logs = await prisma.auditLog.findMany({
        where: { tenantId, entityName: 'TripExpense', entityId: id },
        orderBy: { createdAt: 'asc' },
      });

      expect(logs.map((l) => l.action)).toEqual([
        'trip_expense.created',
        'trip_expense.updated',
        'trip_expense.approved',
      ]);
      for (const log of logs) {
        expect(log.tenantId).toBe(tenantId);
        expect(log.userId).toBeTruthy();
        expect(log.createdAt).toBeTruthy();
      }
      const updateLog = logs.find((l) => l.action === 'trip_expense.updated');
      expect(updateLog?.deviceInfo).toBe('jest-e2e-agent');
      expect(updateLog?.ipAddress).toBeTruthy();
      expect(updateLog?.previousValue).toBeTruthy();
      expect(updateLog?.newValue).toBeTruthy();
    });
  });
});
