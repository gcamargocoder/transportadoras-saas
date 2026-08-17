import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Freight (Fase 59, e2e)', () => {
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
      slug: `freight-${label.toLowerCase()}-${unique}`,
      admin: { name: `Admin ${label}`, email: `admin-${label.toLowerCase()}-${unique}@teste.com`, password: 'SenhaForte123!' },
    };
    const createRes = await request(app.getHttpServer()).post('/api/v1/tenants').send(payload).expect(201);
    const tenantId: string = createRes.body.data.id;
    createdTenantIds.push(tenantId);

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

  async function createCustomer(auth: string, name = 'Cliente Teste') {
    const res = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', auth)
      .send({ name })
      .expect(201);
    return res.body.data.id as string;
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

  async function createTrip(auth: string, driverId: string, compositionId: string, customerId?: string) {
    const originId = await createLocation(auth, `Origem ${randomUUID()}`);
    const destinationId = await createLocation(auth, `Destino ${randomUUID()}`);
    const res = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', auth)
      .send({
        driverId,
        compositionId,
        ...(customerId ? { customerId } : {}),
        originLocationId: originId,
        destinationLocationId: destinationId,
        plannedDeparture: '2026-01-01T08:00:00.000Z',
        plannedArrival: '2026-01-02T18:00:00.000Z',
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function setupTripWithCustomer(auth: string, customerId: string) {
    const vehicleId = await createVehicle(auth);
    const driverId = await createDriver(auth);
    const compositionId = await createComposition(auth, vehicleId);
    return createTrip(auth, driverId, compositionId, customerId);
  }

  async function createContract(auth: string, customerId: string, overrides: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/freight/contracts')
      .set('Authorization', auth)
      .send({
        customerId,
        code: `CTR-${randomUUID().slice(0, 8)}`,
        startDate: '2026-01-01T00:00:00.000Z',
        ...overrides,
      })
      .expect(201);
    return res.body.data as { id: string; status: string; code: string };
  }

  async function createFreightTable(auth: string, customerId: string, overrides: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/freight/tables')
      .set('Authorization', auth)
      .send({
        customerId,
        name: `Tabela ${randomUUID().slice(0, 8)}`,
        code: `TAB-${randomUUID().slice(0, 8)}`,
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        ...overrides,
      })
      .expect(201);
    return res.body.data as { id: string; status: string };
  }

  async function activateTable(auth: string, tableId: string) {
    await request(app.getHttpServer())
      .patch(`/api/v1/freight/tables/${tableId}`)
      .set('Authorization', auth)
      .send({ status: 'ACTIVE' })
      .expect(200);
  }

  async function createFreightRule(auth: string, freightTableId: string, overrides: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/freight/rules')
      .set('Authorization', auth)
      .send({ freightTableId, baseAmount: 500, perKmAmount: 2, ...overrides })
      .expect(201);
    return res.body.data as { id: string; version: number; status: string };
  }

  // ==========================================================================
  // Contratos
  // ==========================================================================
  describe('contratos', () => {
    it('cria, consulta, edita e transiciona status (ativacao/suspensao/cancelamento) auditados', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ContractCrud');
      const customerId = await createCustomer(adminAuth);

      const contract = await createContract(adminAuth, customerId);
      expect(contract.status).toBe('DRAFT');

      const activated = await request(app.getHttpServer())
        .patch(`/api/v1/freight/contracts/${contract.id}`)
        .set('Authorization', adminAuth)
        .send({ status: 'ACTIVE' })
        .expect(200);
      expect(activated.body.data.status).toBe('ACTIVE');

      const suspended = await request(app.getHttpServer())
        .patch(`/api/v1/freight/contracts/${contract.id}`)
        .set('Authorization', adminAuth)
        .send({ status: 'SUSPENDED' })
        .expect(200);
      expect(suspended.body.data.status).toBe('SUSPENDED');

      const history = await prisma.auditLog.findMany({
        where: { entityName: 'Contract', entityId: contract.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(history.map((h) => h.action)).toEqual(['contract.created', 'contract.activated', 'contract.suspended']);
    });

    it('nao permite codigo duplicado no mesmo tenant (409)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ContractDup');
      const customerId = await createCustomer(adminAuth);
      const contract = await createContract(adminAuth, customerId);

      await request(app.getHttpServer())
        .post('/api/v1/freight/contracts')
        .set('Authorization', adminAuth)
        .send({ customerId, code: contract.code, startDate: '2026-01-01T00:00:00.000Z' })
        .expect(409);
    });

    it('contrato vencido (endDate no passado) nunca pode ser usado para uma nova viagem', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ContractExpired');
      const customerId = await createCustomer(adminAuth);
      const contract = await createContract(adminAuth, customerId, {
        startDate: '2020-01-01T00:00:00.000Z',
        endDate: '2020-12-31T00:00:00.000Z',
      });
      await request(app.getHttpServer())
        .patch(`/api/v1/freight/contracts/${contract.id}`)
        .set('Authorization', adminAuth)
        .send({ status: 'ACTIVE' })
        .expect(200);

      const tripId = await setupTripWithCustomer(adminAuth, customerId);
      await request(app.getHttpServer())
        .post(`/api/v1/freight/trips/${tripId}/apply`)
        .set('Authorization', adminAuth)
        .send({ customerId, contractId: contract.id })
        .expect(409);
    });
  });

  // ==========================================================================
  // Tabelas + regras + versionamento
  // ==========================================================================
  describe('tabelas de frete e versionamento de regras', () => {
    it('revisar uma regra preserva a versao anterior (ARCHIVED) e cria a proxima (ACTIVE)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('RuleVersion');
      const customerId = await createCustomer(adminAuth);
      const table = await createFreightTable(adminAuth, customerId);
      const ruleV1 = await createFreightRule(adminAuth, table.id, { baseAmount: 500 });
      expect(ruleV1.version).toBe(1);
      expect(ruleV1.status).toBe('ACTIVE');

      const revised = await request(app.getHttpServer())
        .post(`/api/v1/freight/rules/${ruleV1.id}/revise`)
        .set('Authorization', adminAuth)
        .send({ baseAmount: 900 })
        .expect(201);
      expect(revised.body.data.version).toBe(2);
      expect(revised.body.data.status).toBe('ACTIVE');
      expect(revised.body.data.previousVersionId).toBe(ruleV1.id);
      // Campo omitido (perKmAmount) foi herdado da versao anterior.
      expect(revised.body.data.perKmAmount).toBe(2);

      const oldVersion = await request(app.getHttpServer())
        .get(`/api/v1/freight/rules/${ruleV1.id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(oldVersion.body.data.status).toBe('ARCHIVED');
      expect(oldVersion.body.data.baseAmount).toBe(500);
      expect(oldVersion.body.data.nextVersionId).toBe(revised.body.data.id);
    });

    it('nao permite revisar uma versao ja ARCHIVED (409)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('RuleReviseArchived');
      const customerId = await createCustomer(adminAuth);
      const table = await createFreightTable(adminAuth, customerId);
      const ruleV1 = await createFreightRule(adminAuth, table.id);
      await request(app.getHttpServer())
        .post(`/api/v1/freight/rules/${ruleV1.id}/revise`)
        .set('Authorization', adminAuth)
        .send({})
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/freight/rules/${ruleV1.id}/revise`)
        .set('Authorization', adminAuth)
        .send({})
        .expect(409);
    });
  });

  // ==========================================================================
  // Simulacao
  // ==========================================================================
  describe('simulacao de frete', () => {
    it('retorna available=false quando o cliente nao tem nenhuma tabela ACTIVE', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('SimNoTable');
      const customerId = await createCustomer(adminAuth);

      const res = await request(app.getHttpServer())
        .post('/api/v1/freight/simulate')
        .set('Authorization', adminAuth)
        .send({ customerId, distanceKm: 100 })
        .expect(201);
      expect(res.body.data.available).toBe(false);
      expect(res.body.data.totalAmount).toBeNull();
      expect(res.body.data.reason).toBeTruthy();
    });

    it('retorna available=false quando ha tabela mas nenhuma regra bate com o peso informado', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('SimNoRuleMatch');
      const customerId = await createCustomer(adminAuth);
      const table = await createFreightTable(adminAuth, customerId);
      await activateTable(adminAuth, table.id);
      await createFreightRule(adminAuth, table.id, { minWeightKg: 1000, maxWeightKg: 5000 });

      const res = await request(app.getHttpServer())
        .post('/api/v1/freight/simulate')
        .set('Authorization', adminAuth)
        .send({ customerId, weightKg: 100 })
        .expect(201);
      expect(res.body.data.available).toBe(false);
    });

    it('calcula o valor quando existe regra aplicavel (base + km + adicionais + pedagio + taxas)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('SimMatch');
      const customerId = await createCustomer(adminAuth);
      const table = await createFreightTable(adminAuth, customerId);
      await activateTable(adminAuth, table.id);
      await createFreightRule(adminAuth, table.id, {
        baseAmount: 500,
        perKmAmount: 2,
        tollAmount: 50,
        riskAdditionalAmount: 100,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/freight/simulate')
        .set('Authorization', adminAuth)
        .send({ customerId, distanceKm: 100, riskCargo: true })
        .expect(201);
      expect(res.body.data.available).toBe(true);
      // base = 500 + 2*100 = 700; adicionais = 100; pedagio = 50; total = 850
      expect(res.body.data.baseAmount).toBe(700);
      expect(res.body.data.additionsAmount).toBe(100);
      expect(res.body.data.tollAmount).toBe(50);
      expect(res.body.data.totalAmount).toBe(850);
    });

    it('regra com effectiveUntil no passado (vencida) nunca e usada pela simulacao', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('SimExpiredRule');
      const customerId = await createCustomer(adminAuth);
      const table = await createFreightTable(adminAuth, customerId);
      await activateTable(adminAuth, table.id);
      const rule = await createFreightRule(adminAuth, table.id, { baseAmount: 500 });
      // Revisar fecha a v1 com effectiveUntil = agora -- simular com asOf no
      // passado (antes da criacao) nunca deveria pegar a v1 hoje encerrada,
      // e simular "agora" deve pegar a v2.
      const revised = await request(app.getHttpServer())
        .post(`/api/v1/freight/rules/${rule.id}/revise`)
        .set('Authorization', adminAuth)
        .send({ baseAmount: 999 })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/v1/freight/simulate')
        .set('Authorization', adminAuth)
        .send({ customerId })
        .expect(201);
      expect(res.body.data.ruleId).toBe(revised.body.data.id);
      expect(res.body.data.baseAmount).toBe(999);
    });
  });

  // ==========================================================================
  // Aplicacao a viagem + integracao financeira
  // ==========================================================================
  describe('aplicacao a viagem e integracao financeira', () => {
    it('aplica a cotacao a viagem, grava snapshot, e reaplicar nunca sobrescreve contractedAmount', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ApplyTrip');
      const customerId = await createCustomer(adminAuth);
      const table = await createFreightTable(adminAuth, customerId);
      await activateTable(adminAuth, table.id);
      await createFreightRule(adminAuth, table.id, { baseAmount: 1000 });
      const tripId = await setupTripWithCustomer(adminAuth, customerId);

      const applied = await request(app.getHttpServer())
        .post(`/api/v1/freight/trips/${tripId}/apply`)
        .set('Authorization', adminAuth)
        .send({ customerId })
        .expect(201);
      expect(applied.body.data.estimatedAmount).toBe(1000);
      expect(applied.body.data.contractedAmount).toBeNull();

      await request(app.getHttpServer())
        .patch(`/api/v1/freight/trips/${tripId}`)
        .set('Authorization', adminAuth)
        .send({ contractedAmount: 1200 })
        .expect(200);

      const reapplied = await request(app.getHttpServer())
        .post(`/api/v1/freight/trips/${tripId}/apply`)
        .set('Authorization', adminAuth)
        .send({ customerId })
        .expect(201);
      expect(reapplied.body.data.estimatedAmount).toBe(1000);
      // contractedAmount definido manualmente nunca e sobrescrito por um
      // recalculo (secao 7/8).
      expect(reapplied.body.data.contractedAmount).toBe(1200);
    });

    it('alterar a tabela/regra (nova versao) nunca altera o valor ja gravado em viagens antigas', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('HistoricalTrip');
      const customerId = await createCustomer(adminAuth);
      const table = await createFreightTable(adminAuth, customerId);
      await activateTable(adminAuth, table.id);
      const rule = await createFreightRule(adminAuth, table.id, { baseAmount: 500 });
      const tripId = await setupTripWithCustomer(adminAuth, customerId);

      await request(app.getHttpServer())
        .post(`/api/v1/freight/trips/${tripId}/apply`)
        .set('Authorization', adminAuth)
        .send({ customerId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/freight/rules/${rule.id}/revise`)
        .set('Authorization', adminAuth)
        .send({ baseAmount: 5000 })
        .expect(201);

      const stillOld = await request(app.getHttpServer())
        .get(`/api/v1/freight/trips/${tripId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(stillOld.body.data.estimatedAmount).toBe(500);
    });

    it('gera receita a partir do valor comercial e nunca duplica ao reaplicar', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ApplyRevenue');
      const customerId = await createCustomer(adminAuth);
      const table = await createFreightTable(adminAuth, customerId);
      await activateTable(adminAuth, table.id);
      await createFreightRule(adminAuth, table.id, { baseAmount: 2000 });
      const tripId = await setupTripWithCustomer(adminAuth, customerId);
      await request(app.getHttpServer())
        .post(`/api/v1/freight/trips/${tripId}/apply`)
        .set('Authorization', adminAuth)
        .send({ customerId })
        .expect(201);

      const first = await request(app.getHttpServer())
        .post(`/api/v1/freight/trips/${tripId}/apply-revenue`)
        .set('Authorization', adminAuth)
        .expect(201);
      expect(first.body.data.revenueId).toBeTruthy();

      await request(app.getHttpServer())
        .post(`/api/v1/freight/trips/${tripId}/apply-revenue`)
        .set('Authorization', adminAuth)
        .expect(409);

      const revenues = await prisma.tripRevenue.findMany({ where: { tripId } });
      expect(revenues).toHaveLength(1);
      expect(Number(revenues[0].amount)).toBe(2000);
    });

    it('rentabilidade da viagem reflete contratado x realizado (reaproveita o financeiro)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Profitability');
      const customerId = await createCustomer(adminAuth);
      const table = await createFreightTable(adminAuth, customerId);
      await activateTable(adminAuth, table.id);
      await createFreightRule(adminAuth, table.id, { baseAmount: 1000 });
      const tripId = await setupTripWithCustomer(adminAuth, customerId);
      await request(app.getHttpServer())
        .post(`/api/v1/freight/trips/${tripId}/apply`)
        .set('Authorization', adminAuth)
        .send({ customerId })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/freight/trips/${tripId}/profitability`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.contractedAmount).toBe(1000);
      expect(res.body.data.contractedAmountAvailable).toBe(true);
      expect(res.body.data.realizedRevenue).toBe(0);
      expect(res.body.data.realizedCost).toBe(0);
      expect(res.body.data.projectedMargin).toBe(1000);
    });

    it('viagem sem nenhuma cotacao aplicada retorna profitability com contractedAmountAvailable=false', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ProfitabilityNone');
      const customerId = await createCustomer(adminAuth);
      const tripId = await setupTripWithCustomer(adminAuth, customerId);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/freight/trips/${tripId}/profitability`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.contractedAmountAvailable).toBe(false);
      expect(res.body.data.contractedAmount).toBeNull();
    });
  });

  // ==========================================================================
  // Dashboard
  // ==========================================================================
  describe('dashboard comercial', () => {
    it('reflete o valor contratado das viagens aplicadas no periodo', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Dashboard');
      const customerId = await createCustomer(adminAuth);
      const table = await createFreightTable(adminAuth, customerId);
      await activateTable(adminAuth, table.id);
      await createFreightRule(adminAuth, table.id, { baseAmount: 1000 });
      const tripId = await setupTripWithCustomer(adminAuth, customerId);
      await request(app.getHttpServer())
        .post(`/api/v1/freight/trips/${tripId}/apply`)
        .set('Authorization', adminAuth)
        .send({ customerId })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/freight/dashboard')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.freightsCount).toBe(1);
      expect(res.body.data.contractedAmountTotal).toBe(1000);
      expect(res.body.data.averageTicket).toBe(1000);
      expect(res.body.data.topCustomers).toHaveLength(1);
      expect(res.body.data.topCustomers[0].customerId).toBe(customerId);
    });

    it('conta viagens com cliente definido sem tabela/regra aplicavel', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('DashboardNoRule');
      const customerId = await createCustomer(adminAuth);
      await setupTripWithCustomer(adminAuth, customerId);

      const res = await request(app.getHttpServer())
        .get('/api/v1/freight/dashboard')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.tripsWithoutApplicableRuleCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // Isolamento multi-tenant e RBAC
  // ==========================================================================
  describe('isolamento multi-tenant', () => {
    it('contrato/tabela/regra de um tenant nunca aparecem/sao acessiveis para outro tenant', async () => {
      const { adminAuth: authA } = await createTenantAndLoginAsAdmin('TenantA');
      const { adminAuth: authB } = await createTenantAndLoginAsAdmin('TenantB');
      const customerId = await createCustomer(authA);
      const contract = await createContract(authA, customerId);
      const table = await createFreightTable(authA, customerId);
      const rule = await createFreightRule(authA, table.id);

      await request(app.getHttpServer())
        .get(`/api/v1/freight/contracts/${contract.id}`)
        .set('Authorization', authB)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/v1/freight/tables/${table.id}`)
        .set('Authorization', authB)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/v1/freight/rules/${rule.id}`)
        .set('Authorization', authB)
        .expect(404);
    });
  });

  describe('RBAC', () => {
    it('bloqueia DRIVER em todas as rotas; AUDITOR le mas nao escreve', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('RbacFreight');
      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');
      const customerId = await createCustomer(adminAuth);
      const contract = await createContract(adminAuth, customerId);

      await request(app.getHttpServer())
        .get('/api/v1/freight/contracts')
        .set('Authorization', driverAuth)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/freight/contracts')
        .set('Authorization', auditorAuth)
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/freight/contracts/${contract.id}`)
        .set('Authorization', auditorAuth)
        .send({ status: 'ACTIVE' })
        .expect(403);
    });
  });

  // ==========================================================================
  // N+1
  // ==========================================================================
  describe('verificacao de ausencia de N+1 (dashboard)', () => {
    let countingApp: INestApplication;
    let basePrisma: PrismaService;
    let queryCount = 0;

    beforeAll(async () => {
      basePrisma = new PrismaService();
      await basePrisma.$connect();
      const extendedPrisma = basePrisma.$extends({
        name: 'query-counter',
        query: { $allModels: { async $allOperations({ args, query }) { queryCount += 1; return query(args); } } },
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

    async function createTenantOnCountingApp(label: string) {
      const unique = randomUUID().replace(/-/g, '').slice(0, 12);
      const payload = {
        name: `Transportadora ${label} ${unique}`,
        document: randomCnpj(),
        slug: `freight-n1-${label.toLowerCase()}-${unique}`,
        admin: { name: `Admin ${label}`, email: `admin-n1-${label.toLowerCase()}-${unique}@teste.com`, password: 'SenhaForte123!' },
      };
      const createRes = await request(countingApp.getHttpServer()).post('/api/v1/tenants').send(payload).expect(201);
      const tenantId: string = createRes.body.data.id;
      createdTenantIds.push(tenantId);
      const loginRes = await request(countingApp.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId, email: payload.admin.email, password: payload.admin.password })
        .expect(200);
      return { tenantId, adminAuth: `Bearer ${loginRes.body.data.accessToken as string}` };
    }

    async function seedAppliedTrip(auth: string, customerId: string, tableId: string) {
      const vehicleRes = await request(countingApp.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
        .expect(201);
      const driverRes = await request(countingApp.getHttpServer())
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
      const compositionRes = await request(countingApp.getHttpServer())
        .post('/api/v1/trip-compositions')
        .set('Authorization', auth)
        .send({ vehicleId: vehicleRes.body.data.id, trailers: [] })
        .expect(201);
      const originRes = await request(countingApp.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', auth)
        .send({ name: `Origem ${randomUUID()}`, type: 'DISTRIBUTION_CENTER' })
        .expect(201);
      const destinationRes = await request(countingApp.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', auth)
        .send({ name: `Destino ${randomUUID()}`, type: 'DISTRIBUTION_CENTER' })
        .expect(201);
      const tripRes = await request(countingApp.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send({
          driverId: driverRes.body.data.id,
          compositionId: compositionRes.body.data.id,
          customerId,
          originLocationId: originRes.body.data.id,
          destinationLocationId: destinationRes.body.data.id,
          plannedDeparture: '2026-01-01T08:00:00.000Z',
          plannedArrival: '2026-01-02T18:00:00.000Z',
        })
        .expect(201);
      await request(countingApp.getHttpServer())
        .post(`/api/v1/freight/trips/${tripRes.body.data.id}/apply`)
        .set('Authorization', auth)
        .send({ customerId, freightTableId: tableId })
        .expect(201);
    }

    it('a contagem de queries de GET /freight/dashboard nao cresce entre 5 e 20 fretes aplicados', async () => {
      const { adminAuth } = await createTenantOnCountingApp('N1Dashboard');
      const customerRes = await request(countingApp.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', adminAuth)
        .send({ name: 'Cliente N1' })
        .expect(201);
      const customerId = customerRes.body.data.id as string;

      const tableRes = await request(countingApp.getHttpServer())
        .post('/api/v1/freight/tables')
        .set('Authorization', adminAuth)
        .send({
          customerId,
          name: 'Tabela N1',
          code: `TAB-N1-${randomUUID().slice(0, 8)}`,
          effectiveFrom: '2026-01-01T00:00:00.000Z',
        })
        .expect(201);
      const tableId = tableRes.body.data.id as string;
      await request(countingApp.getHttpServer())
        .patch(`/api/v1/freight/tables/${tableId}`)
        .set('Authorization', adminAuth)
        .send({ status: 'ACTIVE' })
        .expect(200);
      await request(countingApp.getHttpServer())
        .post('/api/v1/freight/rules')
        .set('Authorization', adminAuth)
        .send({ freightTableId: tableId, baseAmount: 500 })
        .expect(201);

      for (let i = 0; i < 5; i += 1) await seedAppliedTrip(adminAuth, customerId, tableId);
      queryCount = 0;
      await request(countingApp.getHttpServer()).get('/api/v1/freight/dashboard').set('Authorization', adminAuth).expect(200);
      const queriesFor5 = queryCount;

      for (let i = 5; i < 20; i += 1) await seedAppliedTrip(adminAuth, customerId, tableId);
      queryCount = 0;
      await request(countingApp.getHttpServer()).get('/api/v1/freight/dashboard').set('Authorization', adminAuth).expect(200);
      const queriesFor20 = queryCount;

      expect(queriesFor20).toBeLessThanOrEqual(queriesFor5 + 1);
    }, 180000);
  });
});
