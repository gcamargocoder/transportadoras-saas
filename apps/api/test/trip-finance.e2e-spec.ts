import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Trip Finance II -- Revenues, Advances, Settlement (e2e)', () => {
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
      slug: `finance-${label.toLowerCase()}-${unique}`,
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

  async function createFuelStation(auth: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/fuel-stations')
      .set('Authorization', auth)
      .send({ name: `Posto ${randomUUID()}` })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createTollPlaza(auth: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/toll-plazas')
      .set('Authorization', auth)
      .send({ name: `Praca ${randomUUID()}`, operator: 'CCR ViaOeste', highway: 'SP-280', pricePerAxle: 10 })
      .expect(201);
    return res.body.data.id as string;
  }

  // TollTransactionsService exige tag ativa e valida no veiculo antes de
  // aceitar qualquer transacao (mesmo fluxo de fleet-operations.e2e-spec.ts).
  async function createVehicleTag(auth: string, vehicleId: string) {
    const providersRes = await request(app.getHttpServer())
      .get('/api/v1/tag-providers')
      .set('Authorization', auth)
      .expect(200);
    const tagProviderId = providersRes.body.data.find((p: { name: string }) => p.name === 'Sem Parar').id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/vehicles/${vehicleId}/tags`)
      .set('Authorization', auth)
      .send({
        tagProviderId,
        tagNumber: String(Math.floor(1_000_000_000 + Math.random() * 8_999_999_999)),
        activatedAt: '2026-01-01',
      })
      .expect(201);
  }

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

  function createRevenue(
    auth: string,
    tripId: string,
    overrides: Partial<Record<string, unknown>> = {},
  ) {
    return request(app.getHttpServer())
      .post('/api/v1/trip-revenues')
      .set('Authorization', auth)
      .send({
        tripId,
        category: 'FREIGHT',
        description: 'Frete SP -> RJ',
        amount: 5000,
        receivedAt: '2026-09-05T10:00:00.000Z',
        ...overrides,
      });
  }

  function createAdvance(
    auth: string,
    tripId: string,
    overrides: Partial<Record<string, unknown>> = {},
  ) {
    return request(app.getHttpServer())
      .post('/api/v1/trip-advances')
      .set('Authorization', auth)
      .send({
        tripId,
        description: 'Adiantamento combustivel',
        amount: 500,
        paidAt: '2026-09-01T08:00:00.000Z',
        ...overrides,
      });
  }

  async function createApprovedExpense(auth: string, tripId: string, amount: number) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/trip-expenses')
      .set('Authorization', auth)
      .send({
        tripId,
        category: 'FUEL',
        description: 'Abastecimento',
        expenseDate: '2026-09-02T10:00:00.000Z',
        amount,
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/trip-expenses/${res.body.data.id}/status`)
      .set('Authorization', auth)
      .send({ status: 'APPROVED' })
      .expect(200);
    return res.body.data.id as string;
  }

  describe('TripRevenue CRUD + validacoes', () => {
    it('cria, consulta, atualiza e exclui uma receita', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('RevenueCrud');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId } = await setupTrip(auth);

      const createRes = await createRevenue(auth, tripId, { invoiceNumber: 'NF-1' }).expect(201);
      expect(createRes.body.data.tripId).toBe(tripId);
      expect(createRes.body.data.amount).toBe(5000);
      expect(createRes.body.data.category).toBe('FREIGHT');
      expect(createRes.body.data.createdBy).toBeTruthy();

      const id = createRes.body.data.id;
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/trip-revenues/${id}`)
        .set('Authorization', auth)
        .expect(200);
      expect(getRes.body.data.invoiceNumber).toBe('NF-1');

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/trip-revenues/${id}`)
        .set('Authorization', auth)
        .send({ amount: 6000 })
        .expect(200);
      expect(updateRes.body.data.amount).toBe(6000);
      expect(updateRes.body.data.updatedBy).toBeTruthy();

      await request(app.getHttpServer())
        .delete(`/api/v1/trip-revenues/${id}`)
        .set('Authorization', auth)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/trip-revenues/${id}`)
        .set('Authorization', auth)
        .expect(404);
    });

    it('rejeita valor negativo, trip inexistente, e vincula customer/attachment existentes', async () => {
      const { tenantId, adminAccessToken } =
        await createTenantAndLoginAsAdmin('RevenueValidations');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId } = await setupTrip(auth);

      await createRevenue(auth, tripId, { amount: -1 }).expect(400);
      await createRevenue(auth, randomUUID()).expect(404);
      await createRevenue(auth, tripId, { customerId: randomUUID() }).expect(404);
      await createRevenue(auth, tripId, { attachmentId: randomUUID() }).expect(404);

      const customerRes = await request(app.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', auth)
        .send({ name: 'Cliente Teste' })
        .expect(201);

      const attachment = await prisma.attachment.create({
        data: {
          tenantId,
          entityName: 'TripRevenue',
          entityId: randomUUID(),
          storageKey: `receipts/${randomUUID()}.pdf`,
        },
      });

      const res = await createRevenue(auth, tripId, {
        customerId: customerRes.body.data.id,
        attachmentId: attachment.id,
      }).expect(201);
      expect(res.body.data.customerId).toBe(customerRes.body.data.id);
      expect(res.body.data.customerName).toBe('Cliente Teste');
      expect(res.body.data.attachmentId).toBe(attachment.id);

      // Zero e aceito (nunca negativo, mas nao estritamente positivo).
      await createRevenue(auth, tripId, { amount: 0 }).expect(201);
    });

    it('filtra por categoria, cliente e periodo, e pagina', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('RevenueFilters');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId } = await setupTrip(auth);

      const freight = await createRevenue(auth, tripId, {
        category: 'FREIGHT',
        amount: 3000,
        receivedAt: '2026-01-10T10:00:00.000Z',
      }).expect(201);
      const bonus = await createRevenue(auth, tripId, {
        category: 'BONUS',
        amount: 200,
        receivedAt: '2026-06-10T10:00:00.000Z',
      }).expect(201);

      const byCategory = await request(app.getHttpServer())
        .get('/api/v1/trip-revenues?category=BONUS')
        .set('Authorization', auth)
        .expect(200);
      expect(byCategory.body.data.items).toHaveLength(1);
      expect(byCategory.body.data.items[0].id).toBe(bonus.body.data.id);

      const byPeriod = await request(app.getHttpServer())
        .get('/api/v1/trip-revenues?receivedFrom=2026-01-01&receivedTo=2026-02-01')
        .set('Authorization', auth)
        .expect(200);
      expect(byPeriod.body.data.items).toHaveLength(1);
      expect(byPeriod.body.data.items[0].id).toBe(freight.body.data.id);

      const paginated = await request(app.getHttpServer())
        .get(
          `/api/v1/trip-revenues?tripId=${tripId}&page=1&pageSize=1&sortBy=amount&sortOrder=desc`,
        )
        .set('Authorization', auth)
        .expect(200);
      expect(paginated.body.data.items).toHaveLength(1);
      expect(paginated.body.data.meta).toMatchObject({ total: 2, page: 1, pageSize: 1 });
      expect(paginated.body.data.items[0].id).toBe(freight.body.data.id);
    });
  });

  describe('TripAdvance CRUD + validacoes', () => {
    it('cria, consulta, atualiza e exclui um adiantamento, com driverId sempre derivado', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('AdvanceCrud');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId, driverId } = await setupTrip(auth);

      const createRes = await createAdvance(auth, tripId, { paymentMethod: 'PIX' }).expect(201);
      expect(createRes.body.data.driverId).toBe(driverId);
      expect(createRes.body.data.amount).toBe(500);

      const id = createRes.body.data.id;
      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/trip-advances/${id}`)
        .set('Authorization', auth)
        .send({ amount: 700 })
        .expect(200);
      expect(updateRes.body.data.amount).toBe(700);

      await request(app.getHttpServer())
        .delete(`/api/v1/trip-advances/${id}`)
        .set('Authorization', auth)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/trip-advances/${id}`)
        .set('Authorization', auth)
        .expect(404);
    });

    it('rejeita driverId enviado pelo cliente, valor <= 0, trip inexistente e viagem sem motorista', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('AdvanceValidations');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId } = await setupTrip(auth);

      await createAdvance(auth, tripId, { driverId: randomUUID() }).expect(400);
      await createAdvance(auth, tripId, { amount: 0 }).expect(400);
      await createAdvance(auth, tripId, { amount: -50 }).expect(400);
      await createAdvance(auth, randomUUID()).expect(404);

      // Viagem sem motorista nao e alcancavel via API publica (driverId e
      // obrigatorio em POST /trips) -- simulado diretamente no banco para
      // validar a guarda defensiva do service.
      await prisma.trip.update({ where: { id: tripId }, data: { driverId: null } });
      await createAdvance(auth, tripId).expect(409);
    });

    it('filtra por motorista, forma de pagamento e faixa de valor', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('AdvanceFilters');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId, driverId } = await setupTrip(auth);

      const pix = await createAdvance(auth, tripId, { amount: 300, paymentMethod: 'PIX' }).expect(
        201,
      );
      await createAdvance(auth, tripId, { amount: 900, paymentMethod: 'CASH' }).expect(201);

      const byDriver = await request(app.getHttpServer())
        .get(`/api/v1/trip-advances?driverId=${driverId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(byDriver.body.data.items).toHaveLength(2);

      const byMethod = await request(app.getHttpServer())
        .get('/api/v1/trip-advances?paymentMethod=PIX')
        .set('Authorization', auth)
        .expect(200);
      expect(byMethod.body.data.items).toHaveLength(1);
      expect(byMethod.body.data.items[0].id).toBe(pix.body.data.id);

      const byAmount = await request(app.getHttpServer())
        .get('/api/v1/trip-advances?minAmount=500')
        .set('Authorization', auth)
        .expect(200);
      expect(byAmount.body.data.items).toHaveLength(1);
    });
  });

  describe('Fechamento financeiro (GET/close/reopen)', () => {
    it('preview ao vivo (OPEN) antes de qualquer fechamento', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('SettlementPreview');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId } = await setupTrip(auth);

      await createRevenue(auth, tripId, { amount: 1000 }).expect(201);
      await createAdvance(auth, tripId, { amount: 100 }).expect(201);
      await createApprovedExpense(auth, tripId, 200);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/settlement`)
        .set('Authorization', auth)
        .expect(200);

      expect(res.body.data.id).toBeNull();
      expect(res.body.data.status).toBe('OPEN');
      expect(res.body.data.totalRevenue).toBe(1000);
      expect(res.body.data.totalExpenses).toBe(200);
      expect(res.body.data.totalAdvances).toBe(100);
      expect(res.body.data.netResult).toBe(700);
    });

    it('fecha, bloqueia fechar de novo, reabre e fecha novamente com totais recalculados', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('SettlementCloseCycle');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId } = await setupTrip(auth);

      await createRevenue(auth, tripId, { amount: 1000 }).expect(201);
      await createAdvance(auth, tripId, { amount: 100 }).expect(201);
      await createApprovedExpense(auth, tripId, 200);

      const closeRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/settlement/close`)
        .set('Authorization', auth)
        .send({ notes: 'Primeiro fechamento' })
        .expect(201);
      expect(closeRes.body.data.status).toBe('CLOSED');
      expect(closeRes.body.data.id).toBeTruthy();
      expect(closeRes.body.data.netResult).toBe(700);
      expect(closeRes.body.data.closedBy).toBeTruthy();
      expect(closeRes.body.data.notes).toBe('Primeiro fechamento');

      // Fechar de novo sem antes reabrir -- bloqueado.
      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/settlement/close`)
        .set('Authorization', auth)
        .send({})
        .expect(409);

      // Reabre com sucesso -- so o status muda, snapshot anterior preservado.
      const reopenRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/settlement/reopen`)
        .set('Authorization', auth)
        .expect(201);
      expect(reopenRes.body.data.status).toBe('REOPENED');
      expect(reopenRes.body.data.netResult).toBe(700);
      expect(reopenRes.body.data.notes).toBe('Primeiro fechamento');

      // Reabrir de novo (ja REOPENED, nao CLOSED) -- bloqueado.
      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/settlement/reopen`)
        .set('Authorization', auth)
        .expect(409);

      // Nova receita entra depois do reopen -- proximo fechamento recalcula.
      await createRevenue(auth, tripId, { amount: 500 }).expect(201);

      const secondCloseRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/settlement/close`)
        .set('Authorization', auth)
        .send({})
        .expect(201);
      expect(secondCloseRes.body.data.status).toBe('CLOSED');
      expect(secondCloseRes.body.data.totalRevenue).toBe(1500);
      expect(secondCloseRes.body.data.netResult).toBe(1200);

      // GET agora retorna o snapshot congelado (nao recalcula ao vivo).
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/settlement`)
        .set('Authorization', auth)
        .expect(200);
      expect(getRes.body.data.status).toBe('CLOSED');
      expect(getRes.body.data.totalRevenue).toBe(1500);
    });

    it('permite fechamento com resultado negativo (prejuizo)', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('SettlementLoss');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId } = await setupTrip(auth);

      await createRevenue(auth, tripId, { amount: 100 }).expect(201);
      await createApprovedExpense(auth, tripId, 500);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/settlement/close`)
        .set('Authorization', auth)
        .send({})
        .expect(201);
      expect(res.body.data.netResult).toBe(-400);
      expect(res.body.data.status).toBe('CLOSED');
    });

    it('rejeita reabrir uma viagem que nunca foi fechada', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('SettlementNeverClosed');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId } = await setupTrip(auth);

      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/settlement/reopen`)
        .set('Authorization', auth)
        .expect(409);
    });

    it('rejeita fechamento/reabertura por perfil sem permissao (403), mas permite leitura', async () => {
      const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('SettlementRbac');
      const adminAuth = `Bearer ${adminAccessToken}`;
      const operatorAuth = await createUserWithRole(tenantId, adminAuth, 'OPERATOR');
      const { tripId } = await setupTrip(adminAuth);

      await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/settlement`)
        .set('Authorization', operatorAuth)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/settlement/close`)
        .set('Authorization', operatorAuth)
        .send({})
        .expect(403);
    });
  });

  describe('GET /trips/:id/financial-dashboard', () => {
    it('agrega receitas, despesas (APPROVED) e adiantamentos, e calcula lucro/margem/resultado', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Dashboard');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId } = await setupTrip(auth);

      await createRevenue(auth, tripId, { amount: 3000 }).expect(201);
      await createRevenue(auth, tripId, { amount: 1000 }).expect(201);
      await createApprovedExpense(auth, tripId, 800);

      // Despesa PENDING (nunca aprovada) nao deve entrar no total.
      await request(app.getHttpServer())
        .post('/api/v1/trip-expenses')
        .set('Authorization', auth)
        .send({
          tripId,
          category: 'FOOD',
          description: 'Alimentacao',
          expenseDate: '2026-09-02T10:00:00.000Z',
          amount: 9999,
        })
        .expect(201);

      await createAdvance(auth, tripId, { amount: 400 }).expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/financial-dashboard`)
        .set('Authorization', auth)
        .expect(200);

      const dashboard = res.body.data;
      expect(dashboard.totalRevenue).toBe(4000);
      expect(dashboard.totalExpenses).toBe(800);
      expect(dashboard.totalAdvances).toBe(400);
      expect(dashboard.profit).toBe(3200); // 4000 - 800
      expect(dashboard.netResult).toBe(2800); // 3200 - 400
      expect(dashboard.marginPercentage).toBeCloseTo((3200 / 4000) * 100, 5);
      expect(dashboard.revenueCount).toBe(2);
      expect(dashboard.expenseCount).toBe(1); // so a APPROVED
      expect(dashboard.advanceCount).toBe(1);
      expect(dashboard.entryCount).toBe(4);
      expect(dashboard.largestRevenue).toBe(3000);
      expect(dashboard.largestExpense).toBe(800);
    });

    it('Fase 51 -- inclui custo de combustivel/pedagio vinculados a viagem (tripId real); manutencao sempre null (sem vinculo no schema)', async () => {
      const { tenantId } = await createTenantAndLoginAsAdmin('Dashboard51');
      // POST /toll-plazas exige SUPER_ADMIN (mesmo padrao de fleet-operations.e2e-spec.ts)
      // -- promove e reloga para obter um token com o role atualizado.
      const admin = await prisma.userAccount.findFirstOrThrow({ where: { tenantId, role: 'ADMIN' } });
      await prisma.userAccount.update({ where: { id: admin.id }, data: { role: 'SUPER_ADMIN' } });
      const reloginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId, email: admin.email, password: 'SenhaForte123!' })
        .expect(200);
      const auth = `Bearer ${reloginRes.body.data.accessToken as string}`;
      const { tripId, vehicleId } = await setupTrip(auth);

      await createRevenue(auth, tripId, { amount: 5000 }).expect(201);
      await createApprovedExpense(auth, tripId, 300);
      await createAdvance(auth, tripId, { amount: 200 }).expect(201);

      // Combustivel vinculado via tripId (vehicleId/driverId sempre derivados da viagem).
      const fuelStationId = await createFuelStation(auth);
      await request(app.getHttpServer())
        .post('/api/v1/fuel-supplies')
        .set('Authorization', auth)
        .send({
          tripId,
          fuelStationId,
          fuelType: 'DIESEL_S10',
          liters: 100,
          pricePerLiter: 5,
          odometerKm: 10000,
          supplyDate: '2026-09-02T10:00:00.000Z',
        })
        .expect(201);

      // Pedagio -- TollTransaction.tripId e obrigatorio no schema, sempre confiavel.
      await createVehicleTag(auth, vehicleId);
      const tollPlazaId = await createTollPlaza(auth);
      await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auth)
        .send({ tripId, tollPlazaId, axleCount: 6, chargedAmount: 60, chargedAt: '2026-09-01T10:30:00.000Z' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/financial-dashboard`)
        .set('Authorization', auth)
        .expect(200);
      const dashboard = res.body.data;

      expect(dashboard.fuelCost).toBe(500); // 100L * 5,00
      expect(dashboard.tollCost).toBe(60);
      expect(dashboard.maintenanceCost).toBeNull();
      expect(dashboard.totalCost).toBeCloseTo(300 + 500 + 60, 5); // totalExpenses + fuelCost + tollCost
      expect(dashboard.grossResult).toBeCloseTo(5000 - (300 + 500 + 60), 5);
      expect(dashboard.finalResult).toBeCloseTo(dashboard.grossResult - 200, 5);
    });

    it('Fase 51 -- fuelCost/tollCost ficam em zero quando nao ha vinculo confiavel (nunca inventa valor)', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Dashboard51Empty');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId } = await setupTrip(auth);
      await createRevenue(auth, tripId, { amount: 1000 }).expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/financial-dashboard`)
        .set('Authorization', auth)
        .expect(200);
      const dashboard = res.body.data;

      expect(dashboard.fuelCost).toBe(0);
      expect(dashboard.tollCost).toBe(0);
      expect(dashboard.maintenanceCost).toBeNull();
      expect(dashboard.totalCost).toBe(0);
      expect(dashboard.grossResult).toBe(1000);
      expect(dashboard.finalResult).toBe(1000);
    });
  });

  describe('isolamento multi-tenant', () => {
    it('nunca permite acesso cruzado entre tenants (receita, adiantamento e fechamento)', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolA');
      const tenantB = await createTenantAndLoginAsAdmin('IsolB');
      const authA = `Bearer ${tenantA.adminAccessToken}`;
      const authB = `Bearer ${tenantB.adminAccessToken}`;

      const { tripId } = await setupTrip(authA);
      const revenueRes = await createRevenue(authA, tripId).expect(201);
      const advanceRes = await createAdvance(authA, tripId).expect(201);

      await request(app.getHttpServer())
        .get(`/api/v1/trip-revenues/${revenueRes.body.data.id}`)
        .set('Authorization', authB)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/v1/trip-advances/${advanceRes.body.data.id}`)
        .set('Authorization', authB)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/settlement`)
        .set('Authorization', authB)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/financial-dashboard`)
        .set('Authorization', authB)
        .expect(404);
    });
  });

  describe('auditoria', () => {
    it('registra quem, quando, IP, User-Agent, tenant, antes e depois em cada mutacao', async () => {
      const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('Audit');
      const auth = `Bearer ${adminAccessToken}`;
      const { tripId } = await setupTrip(auth);

      const revenueRes = await createRevenue(auth, tripId).expect(201);
      const revenueId = revenueRes.body.data.id;
      await request(app.getHttpServer())
        .patch(`/api/v1/trip-revenues/${revenueId}`)
        .set('Authorization', auth)
        .set('User-Agent', 'jest-e2e-agent')
        .send({ amount: 5500 })
        .expect(200);
      await request(app.getHttpServer())
        .delete(`/api/v1/trip-revenues/${revenueId}`)
        .set('Authorization', auth)
        .expect(204);

      const advanceRes = await createAdvance(auth, tripId).expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/settlement/close`)
        .set('Authorization', auth)
        .send({})
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/settlement/reopen`)
        .set('Authorization', auth)
        .expect(201);

      const revenueLogs = await prisma.auditLog.findMany({
        where: { tenantId, entityName: 'TripRevenue', entityId: revenueId },
        orderBy: { createdAt: 'asc' },
      });
      expect(revenueLogs.map((l) => l.action)).toEqual([
        'trip_revenue.created',
        'trip_revenue.updated',
        'trip_revenue.deleted',
      ]);
      for (const log of revenueLogs) {
        expect(log.tenantId).toBe(tenantId);
        expect(log.userId).toBeTruthy();
        expect(log.ipAddress).toBeTruthy();
      }
      const updateLog = revenueLogs.find((l) => l.action === 'trip_revenue.updated');
      expect(updateLog?.deviceInfo).toBe('jest-e2e-agent');
      expect(updateLog?.previousValue).toBeTruthy();
      expect(updateLog?.newValue).toBeTruthy();

      const advanceLogs = await prisma.auditLog.findMany({
        where: { tenantId, entityName: 'TripAdvance', entityId: advanceRes.body.data.id },
      });
      expect(advanceLogs.map((l) => l.action)).toEqual(['trip_advance.created']);

      const settlementLogs = await prisma.auditLog.findMany({
        where: { tenantId, entityName: 'TripSettlement' },
        orderBy: { createdAt: 'asc' },
      });
      expect(settlementLogs.map((l) => l.action)).toEqual([
        'trip_settlement.closed',
        'trip_settlement.reopened',
      ]);
    });
  });
});
