import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Customer CRM (e2e)', () => {
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
      slug: `crm-${label.toLowerCase()}-${unique}`,
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

  async function createCustomer(auth: string, overrides: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', auth)
      .send({ name: 'Cliente Teste', ...overrides })
      .expect(201);
    return res.body.data as { id: string };
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

  async function createTrip(auth: string, customerId: string) {
    const vehicleId = await createVehicle(auth);
    const driverId = await createDriver(auth);
    const compositionId = await createComposition(auth, vehicleId);
    const originId = await createLocation(auth, `Origem ${randomUUID()}`);
    const destinationId = await createLocation(auth, `Destino ${randomUUID()}`);
    const res = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', auth)
      .send({
        driverId,
        compositionId,
        customerId,
        originLocationId: originId,
        destinationLocationId: destinationId,
        plannedDeparture: '2026-01-01T08:00:00.000Z',
        plannedArrival: '2026-01-02T18:00:00.000Z',
      })
      .expect(201);
    return res.body.data.id as string;
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
    return res.body.data as { id: string; status: string };
  }

  describe('regressao de Customer (create/list/get) + novos campos e PATCH', () => {
    it('cadastra cliente com informacoes comerciais e le de volta', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CustomerRegress');
      const customer = await createCustomer(adminAuth, {
        document: randomCnpj(),
        phone: '1131234567',
        email: 'contato@clienteteste.com.br',
        address: 'Av. Industrial, 1000',
      });

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/customers/${customer.id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(getRes.body.data.phone).toBe('1131234567');
      expect(getRes.body.data.email).toBe('contato@clienteteste.com.br');
      expect(getRes.body.data.address).toBe('Av. Industrial, 1000');
      expect(getRes.body.data.isActive).toBe(true);
    });

    it('lista clientes com busca e paginacao (regressao)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CustomerList');
      const unique = randomUUID().slice(0, 8);
      await createCustomer(adminAuth, { name: `Industria Alfa ${unique}` });
      await createCustomer(adminAuth, { name: `Industria Beta ${unique}` });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/customers?search=Alfa ${unique}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].name).toContain('Alfa');
      expect(res.body.data.meta.total).toBe(1);
    });

    it('filtra clientes por isActive', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CustomerActiveFilter');
      const active = await createCustomer(adminAuth, { name: `Ativo ${randomUUID().slice(0, 8)}` });
      const toDeactivate = await createCustomer(adminAuth, { name: `Inativo ${randomUUID().slice(0, 8)}` });

      await request(app.getHttpServer())
        .patch(`/api/v1/customers/${toDeactivate.id}`)
        .set('Authorization', adminAuth)
        .send({ isActive: false })
        .expect(200);

      const inactiveRes = await request(app.getHttpServer())
        .get('/api/v1/customers?isActive=false')
        .set('Authorization', adminAuth)
        .expect(200);
      const ids = inactiveRes.body.data.items.map((c: { id: string }) => c.id);
      expect(ids).toContain(toDeactivate.id);
      expect(ids).not.toContain(active.id);

      const activeRes = await request(app.getHttpServer())
        .get('/api/v1/customers?isActive=true')
        .set('Authorization', adminAuth)
        .expect(200);
      const activeIds = activeRes.body.data.items.map((c: { id: string }) => c.id);
      expect(activeIds).toContain(active.id);
      expect(activeIds).not.toContain(toDeactivate.id);
    });

    it('PATCH atualiza dados cadastrais e comerciais do cliente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CustomerPatch');
      const customer = await createCustomer(adminAuth);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/customers/${customer.id}`)
        .set('Authorization', adminAuth)
        .send({ phone: '1140028922', email: 'novo@cliente.com.br' })
        .expect(200);
      expect(res.body.data.phone).toBe('1140028922');
      expect(res.body.data.email).toBe('novo@cliente.com.br');
      expect(res.body.data.name).toBe('Cliente Teste');
    });

    it('404 ao tentar atualizar cliente inexistente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CustomerPatch404');
      await request(app.getHttpServer())
        .patch(`/api/v1/customers/${randomUUID()}`)
        .set('Authorization', adminAuth)
        .send({ phone: '1140028922' })
        .expect(404);
    });
  });

  describe('contatos (CustomerContact)', () => {
    it('CRUD completo de contato, vinculado ao cliente correto', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ContactCrud');
      const customer = await createCustomer(adminAuth);

      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/customers/${customer.id}/contacts`)
        .set('Authorization', adminAuth)
        .send({ name: 'Maria Souza', role: 'Compras', phone: '1131234567', isPrimary: true })
        .expect(201);
      const contactId = createRes.body.data.id as string;
      expect(createRes.body.data.customerId).toBe(customer.id);
      expect(createRes.body.data.isPrimary).toBe(true);

      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/customers/${customer.id}/contacts`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(listRes.body.data).toHaveLength(1);
      expect(listRes.body.data[0].id).toBe(contactId);

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/customers/${customer.id}/contacts/${contactId}`)
        .set('Authorization', adminAuth)
        .send({ role: 'Logistica' })
        .expect(200);
      expect(updateRes.body.data.role).toBe('Logistica');
      expect(updateRes.body.data.name).toBe('Maria Souza');

      await request(app.getHttpServer())
        .delete(`/api/v1/customers/${customer.id}/contacts/${contactId}`)
        .set('Authorization', adminAuth)
        .expect(204);

      const afterDeleteRes = await request(app.getHttpServer())
        .get(`/api/v1/customers/${customer.id}/contacts`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(afterDeleteRes.body.data).toHaveLength(0);
    });

    it('404 ao acessar contato de outro cliente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ContactWrongCustomer');
      const customerA = await createCustomer(adminAuth, { name: 'Cliente A' });
      const customerB = await createCustomer(adminAuth, { name: 'Cliente B' });

      const contactRes = await request(app.getHttpServer())
        .post(`/api/v1/customers/${customerA.id}/contacts`)
        .set('Authorization', adminAuth)
        .send({ name: 'Contato A' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/customers/${customerB.id}/contacts/${contactRes.body.data.id}`)
        .set('Authorization', adminAuth)
        .send({ name: 'Tentativa' })
        .expect(404);
    });
  });

  describe('observacoes/interacoes (CustomerNote)', () => {
    it('cria e lista observacoes do cliente, mais recentes primeiro', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('NotesCrud');
      const customer = await createCustomer(adminAuth);

      await request(app.getHttpServer())
        .post(`/api/v1/customers/${customer.id}/notes`)
        .set('Authorization', adminAuth)
        .send({ content: 'Primeira interacao com o cliente.' })
        .expect(201);
      const secondRes = await request(app.getHttpServer())
        .post(`/api/v1/customers/${customer.id}/notes`)
        .set('Authorization', adminAuth)
        .send({ content: 'Cliente solicitou revisao de prazo.' })
        .expect(201);

      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/customers/${customer.id}/notes`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(listRes.body.data).toHaveLength(2);
      expect(listRes.body.data[0].id).toBe(secondRes.body.data.id);
      expect(listRes.body.data[0].createdBy).toBeTruthy();
    });
  });

  describe('resumo/indicadores (GET /customers/:id/summary)', () => {
    it('agrega viagens por status, contatos, observacoes e contratos sem inventar dados', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('SummaryBasic');
      const customer = await createCustomer(adminAuth);

      await createTrip(adminAuth, customer.id);
      await createTrip(adminAuth, customer.id);
      await request(app.getHttpServer())
        .post(`/api/v1/customers/${customer.id}/contacts`)
        .set('Authorization', adminAuth)
        .send({ name: 'Contato Unico' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/customers/${customer.id}/notes`)
        .set('Authorization', adminAuth)
        .send({ content: 'Observacao unica.' })
        .expect(201);
      await createContract(adminAuth, customer.id);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/customers/${customer.id}/summary`)
        .set('Authorization', adminAuth)
        .expect(200);

      expect(res.body.data.tripsTotal).toBe(2);
      const plannedCount = res.body.data.tripsByStatus.find(
        (row: { status: string; count: number }) => row.status === 'PLANNED',
      )?.count;
      expect(plannedCount).toBe(2);
      expect(res.body.data.contactsCount).toBe(1);
      expect(res.body.data.notesCount).toBe(1);
      expect(res.body.data.contractsTotal).toBe(1);
      expect(res.body.data.activeContractsCount).toBe(0);
      expect(res.body.data.firstTripAt).not.toBeNull();
      expect(res.body.data.lastTripAt).not.toBeNull();
    });

    it('cliente sem viagens/contatos/observacoes retorna zeros, nunca inventa', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('SummaryEmpty');
      const customer = await createCustomer(adminAuth);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/customers/${customer.id}/summary`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.tripsTotal).toBe(0);
      expect(res.body.data.tripsByStatus).toEqual([]);
      expect(res.body.data.firstTripAt).toBeNull();
      expect(res.body.data.lastTripAt).toBeNull();
      expect(res.body.data.contactsCount).toBe(0);
      expect(res.body.data.notesCount).toBe(0);
    });
  });

  describe('isolamento multi-tenant', () => {
    it('cliente, contato e observacao de um tenant sao invisiveis para outro', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('TenantA');
      const tenantB = await createTenantAndLoginAsAdmin('TenantB');
      const customer = await createCustomer(tenantA.adminAuth);
      const contactRes = await request(app.getHttpServer())
        .post(`/api/v1/customers/${customer.id}/contacts`)
        .set('Authorization', tenantA.adminAuth)
        .send({ name: 'Contato Tenant A' })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/api/v1/customers/${customer.id}`)
        .set('Authorization', tenantB.adminAuth)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/v1/customers/${customer.id}/summary`)
        .set('Authorization', tenantB.adminAuth)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/v1/customers/${customer.id}/contacts`)
        .set('Authorization', tenantB.adminAuth)
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/api/v1/customers/${customer.id}/contacts/${contactRes.body.data.id}`)
        .set('Authorization', tenantB.adminAuth)
        .send({ name: 'Tentativa Invasao' })
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/v1/customers/${customer.id}/notes`)
        .set('Authorization', tenantB.adminAuth)
        .send({ content: 'Tentativa invasao' })
        .expect(404);

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/customers')
        .set('Authorization', tenantB.adminAuth)
        .expect(200);
      const ids = listRes.body.data.items.map((c: { id: string }) => c.id);
      expect(ids).not.toContain(customer.id);
    });
  });

  describe('RBAC', () => {
    it('bloqueia DRIVER; AUDITOR le mas nao escreve', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('RbacCrm');
      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');
      const customer = await createCustomer(adminAuth);

      await request(app.getHttpServer())
        .get('/api/v1/customers')
        .set('Authorization', driverAuth)
        .expect(403);
      await request(app.getHttpServer())
        .post(`/api/v1/customers/${customer.id}/contacts`)
        .set('Authorization', driverAuth)
        .send({ name: 'Contato' })
        .expect(403);

      await request(app.getHttpServer())
        .get(`/api/v1/customers/${customer.id}/summary`)
        .set('Authorization', auditorAuth)
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/customers/${customer.id}`)
        .set('Authorization', auditorAuth)
        .send({ phone: '1140028922' })
        .expect(403);
      await request(app.getHttpServer())
        .post(`/api/v1/customers/${customer.id}/notes`)
        .set('Authorization', auditorAuth)
        .send({ content: 'Observacao' })
        .expect(403);
    });
  });

  // ==========================================================================
  // N+1
  // ==========================================================================
  describe('verificacao de ausencia de N+1', () => {
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
        slug: `crm-n1-${label.toLowerCase()}-${unique}`,
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

    it('a contagem de queries de GET /customers nao cresce entre 5 e 20 clientes', async () => {
      const { adminAuth } = await createTenantOnCountingApp('N1List');

      for (let i = 0; i < 5; i += 1) {
        await request(countingApp.getHttpServer())
          .post('/api/v1/customers')
          .set('Authorization', adminAuth)
          .send({ name: `Cliente ${i} ${randomUUID().slice(0, 6)}` })
          .expect(201);
      }
      queryCount = 0;
      await request(countingApp.getHttpServer()).get('/api/v1/customers?pageSize=50').set('Authorization', adminAuth).expect(200);
      const queriesFor5 = queryCount;

      for (let i = 5; i < 20; i += 1) {
        await request(countingApp.getHttpServer())
          .post('/api/v1/customers')
          .set('Authorization', adminAuth)
          .send({ name: `Cliente ${i} ${randomUUID().slice(0, 6)}` })
          .expect(201);
      }
      queryCount = 0;
      await request(countingApp.getHttpServer()).get('/api/v1/customers?pageSize=50').set('Authorization', adminAuth).expect(200);
      const queriesFor20 = queryCount;

      expect(queriesFor20).toBeLessThanOrEqual(queriesFor5 + 1);
    }, 180000);

    it('a contagem de queries de GET /customers/:id/summary nao cresce entre 5 e 20 viagens', async () => {
      const { adminAuth } = await createTenantOnCountingApp('N1Summary');
      const customerRes = await request(countingApp.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', adminAuth)
        .send({ name: 'Cliente N1 Summary' })
        .expect(201);
      const customerId = customerRes.body.data.id as string;

      async function seedTrip() {
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
        await request(countingApp.getHttpServer())
          .post('/api/v1/trips')
          .set('Authorization', adminAuth)
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
      }

      for (let i = 0; i < 5; i += 1) await seedTrip();
      queryCount = 0;
      await request(countingApp.getHttpServer()).get(`/api/v1/customers/${customerId}/summary`).set('Authorization', adminAuth).expect(200);
      const queriesFor5 = queryCount;

      for (let i = 5; i < 20; i += 1) await seedTrip();
      queryCount = 0;
      await request(countingApp.getHttpServer()).get(`/api/v1/customers/${customerId}/summary`).set('Authorization', adminAuth).expect(200);
      const queriesFor20 = queryCount;

      expect(queriesFor20).toBeLessThanOrEqual(queriesFor5 + 1);
    }, 180000);
  });
});
