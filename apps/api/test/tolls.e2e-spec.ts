import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Tolls (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdTenantIds: string[] = [];
  let superAdminAuth: string;

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

    const superAdmin = await createTenantWithSuperAdmin('TollsGlobalAdmin');
    superAdminAuth = `Bearer ${superAdmin.superAdminAccessToken}`;
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
      slug: `toll-${label.toLowerCase()}-${unique}`,
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

  async function createTenantWithSuperAdmin(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    const payload = {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `toll-${label.toLowerCase()}-${unique}`,
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

    await prisma.userAccount.update({
      where: { tenantId_email: { tenantId, email: payload.admin.email } },
      data: { role: 'SUPER_ADMIN' },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email: payload.admin.email, password: payload.admin.password })
      .expect(200);

    return { tenantId, superAdminAccessToken: loginRes.body.data.accessToken as string };
  }

  async function createTollPlaza(overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/toll-plazas')
      .set('Authorization', superAdminAuth)
      .send({
        name: `Praca ${randomUUID()}`,
        operator: 'CCR ViaOeste',
        highway: 'SP-280',
        pricePerAxle: 10,
        ...overrides,
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createFleet(auth: string, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/fleets')
      .set('Authorization', auth)
      .send({ name: `Frota ${randomUUID()}`, type: 'OWN', ...overrides })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createVehicle(auth: string, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/vehicles')
      .set('Authorization', auth)
      .send({
        plate: randomPlate(),
        brand: 'Volvo',
        model: 'FH 540',
        type: 'TRACTOR_UNIT',
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

  async function getSemParar(auth: string) {
    const res = await request(app.getHttpServer())
      .get('/api/v1/tag-providers')
      .set('Authorization', auth)
      .expect(200);
    return res.body.data.find((p: { name: string }) => p.name === 'Sem Parar').id as string;
  }

  async function createVehicleTag(
    auth: string,
    vehicleId: string,
    tagProviderId: string,
    overrides: Partial<Record<string, unknown>> = {},
  ) {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/vehicles/${vehicleId}/tags`)
      .set('Authorization', auth)
      .send({
        tagProviderId,
        tagNumber: String(Math.floor(1_000_000_000 + Math.random() * 8_999_999_999)),
        activatedAt: '2026-01-01',
        ...overrides,
      })
      .expect(201);
    return res.body.data.id as string;
  }

  // Monta viagem + veiculo com tag ativa e valida, pronta para registrar
  // transacao de pedagio.
  async function setupTripWithTaggedVehicle(auth: string, vehicleOverrides: Partial<Record<string, unknown>> = {}) {
    const vehicleId = await createVehicle(auth, vehicleOverrides);
    const driverId = await createDriver(auth);
    const compositionId = await createComposition(auth, vehicleId);
    const originId = await createLocation(auth, `Origem ${randomUUID()}`);
    const destinationId = await createLocation(auth, `Destino ${randomUUID()}`);
    const tagProviderId = await getSemParar(auth);
    await createVehicleTag(auth, vehicleId, tagProviderId);

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

    return { vehicleId, driverId, compositionId, tripId: tripRes.body.data.id as string };
  }

  describe('/toll-plazas (SUPER_ADMIN)', () => {
    it('cadastra, consulta, atualiza e exclui uma praca', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/toll-plazas')
        .set('Authorization', superAdminAuth)
        .send({
          name: 'Praca Teste',
          operator: 'Arteris',
          highway: 'BR-116',
          km: 45.2,
          city: 'Curitiba',
          state: 'pr',
          latitude: -25.4284,
          longitude: -49.2733,
          pricePerAxle: 8.5,
        })
        .expect(201);
      const plazaId = createRes.body.data.id;
      expect(createRes.body.data.state).toBe('PR');
      expect(createRes.body.data.pricePerAxle).toBe(8.5);

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/toll-plazas/${plazaId}`)
        .set('Authorization', superAdminAuth)
        .expect(200);
      expect(getRes.body.data.name).toBe('Praca Teste');

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/toll-plazas/${plazaId}`)
        .set('Authorization', superAdminAuth)
        .send({ pricePerAxle: 9.9 })
        .expect(200);
      expect(updateRes.body.data.pricePerAxle).toBe(9.9);

      await request(app.getHttpServer())
        .delete(`/api/v1/toll-plazas/${plazaId}`)
        .set('Authorization', superAdminAuth)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/toll-plazas/${plazaId}`)
        .set('Authorization', superAdminAuth)
        .expect(404);
    });

    it('rejeita escrita por usuario que nao e SUPER_ADMIN (403)', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('PlazaForbidden');
      await request(app.getHttpServer())
        .post('/api/v1/toll-plazas')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ name: 'Praca Proibida', operator: 'CCR' })
        .expect(403);
    });

    it('permite leitura por qualquer usuario autenticado', async () => {
      const plazaId = await createTollPlaza();
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('PlazaRead');
      await request(app.getHttpServer())
        .get(`/api/v1/toll-plazas/${plazaId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
    });

    it('bloqueia exclusao de praca com transacoes vinculadas', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('PlazaInUse');
      const auth = `Bearer ${adminAccessToken}`;
      const plazaId = await createTollPlaza();
      const { tripId } = await setupTripWithTaggedVehicle(auth);

      await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auth)
        .send({
          tripId,
          tollPlazaId: plazaId,
          axleCount: 5,
          chargedAmount: 50,
          chargedAt: '2026-09-01T10:00:00.000Z',
        })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/v1/toll-plazas/${plazaId}`)
        .set('Authorization', superAdminAuth)
        .expect(409);
    });
  });

  describe('POST /toll-transactions -- calculo automatico e classificacao', () => {
    it('calcula valor esperado, diferenca e classifica como NORMAL', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Normal');
      const auth = `Bearer ${adminAccessToken}`;
      const plazaId = await createTollPlaza({ pricePerAxle: 10 });
      const { tripId, vehicleId, driverId } = await setupTripWithTaggedVehicle(auth);

      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auth)
        .send({
          tripId,
          tollPlazaId: plazaId,
          axleCount: 6,
          chargedAmount: 60,
          chargedAt: '2026-09-01T10:00:00.000Z',
        })
        .expect(201);

      expect(res.body.data.vehicleId).toBe(vehicleId);
      expect(res.body.data.driverId).toBe(driverId);
      expect(res.body.data.expectedAmount).toBe(60);
      expect(res.body.data.discrepancyAmount).toBe(0);
      expect(res.body.data.status).toBe('NORMAL');
      expect(res.body.data.tagProviderName).toBe('Sem Parar');
    });

    it('classifica como DIVERGENT quando cobrado difere do esperado', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Divergent');
      const auth = `Bearer ${adminAccessToken}`;
      const plazaId = await createTollPlaza({ pricePerAxle: 10 });
      const { tripId } = await setupTripWithTaggedVehicle(auth);

      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auth)
        .send({
          tripId,
          tollPlazaId: plazaId,
          axleCount: 6,
          chargedAmount: 90,
          chargedAt: '2026-09-01T10:00:00.000Z',
        })
        .expect(201);

      expect(res.body.data.expectedAmount).toBe(60);
      expect(res.body.data.discrepancyAmount).toBe(30);
      expect(res.body.data.status).toBe('DIVERGENT');
    });

    it('classifica como EXEMPT quando valor cobrado e zero', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Exempt');
      const auth = `Bearer ${adminAccessToken}`;
      const plazaId = await createTollPlaza({ pricePerAxle: 10 });
      const { tripId } = await setupTripWithTaggedVehicle(auth);

      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auth)
        .send({
          tripId,
          tollPlazaId: plazaId,
          axleCount: 6,
          chargedAmount: 0,
          chargedAt: '2026-09-01T10:00:00.000Z',
        })
        .expect(201);

      expect(res.body.data.status).toBe('EXEMPT');
    });
  });

  describe('motor de conferencia (auditVerdict) -- Fase 22', () => {
    it('retorna UNVERIFIABLE com mensagem explicita quando a praca nao tem pricePerAxle cadastrado, mesmo com discrepancyAmount != 0 gravado', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('AuditUnverifiable');
      const auth = `Bearer ${adminAccessToken}`;
      const plazaId = await createTollPlaza({ pricePerAxle: undefined });
      const { tripId } = await setupTripWithTaggedVehicle(auth);

      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auth)
        .send({
          tripId,
          tollPlazaId: plazaId,
          axleCount: 6,
          chargedAmount: 60,
          chargedAt: '2026-09-01T10:00:00.000Z',
        })
        .expect(201);

      // status legado (gravado) ainda reflete o calculo antigo -- e o
      // auditVerdict (novo, calculado em tempo de leitura) que corrige o
      // falso positivo, sem alterar o contrato existente.
      expect(res.body.data.auditVerdict).toBe('UNVERIFIABLE');
      expect(res.body.data.auditMessage).toMatch(/nao foi possivel calcular/i);
    });

    it('retorna OVERCHARGE quando cobrado > esperado com tarifa conhecida', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('AuditOvercharge');
      const auth = `Bearer ${adminAccessToken}`;
      const plazaId = await createTollPlaza({ pricePerAxle: 10 });
      const { tripId } = await setupTripWithTaggedVehicle(auth);

      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auth)
        .send({
          tripId,
          tollPlazaId: plazaId,
          axleCount: 6,
          chargedAmount: 90,
          chargedAt: '2026-09-01T10:00:00.000Z',
        })
        .expect(201);

      expect(res.body.data.auditVerdict).toBe('OVERCHARGE');
      expect(res.body.data.auditMessage).toBeNull();
    });

    it('retorna UNDERCHARGE quando cobrado < esperado com tarifa conhecida', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('AuditUndercharge');
      const auth = `Bearer ${adminAccessToken}`;
      const plazaId = await createTollPlaza({ pricePerAxle: 10 });
      const { tripId } = await setupTripWithTaggedVehicle(auth);

      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auth)
        .send({
          tripId,
          tollPlazaId: plazaId,
          axleCount: 6,
          chargedAmount: 30,
          chargedAt: '2026-09-01T10:00:00.000Z',
        })
        .expect(201);

      expect(res.body.data.auditVerdict).toBe('UNDERCHARGE');
    });

    it('retorna CORRECT quando cobrado == esperado', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('AuditCorrect');
      const auth = `Bearer ${adminAccessToken}`;
      const plazaId = await createTollPlaza({ pricePerAxle: 10 });
      const { tripId } = await setupTripWithTaggedVehicle(auth);

      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auth)
        .send({
          tripId,
          tollPlazaId: plazaId,
          axleCount: 6,
          chargedAmount: 60,
          chargedAt: '2026-09-01T10:00:00.000Z',
        })
        .expect(201);

      expect(res.body.data.auditVerdict).toBe('CORRECT');
    });

    it('filtra a listagem por auditVerdict', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('AuditFilter');
      const auth = `Bearer ${adminAccessToken}`;
      const plazaKnown = await createTollPlaza({ pricePerAxle: 10 });
      const plazaUnknown = await createTollPlaza({ pricePerAxle: undefined });
      const setupOver = await setupTripWithTaggedVehicle(auth);
      const setupUnverifiable = await setupTripWithTaggedVehicle(auth);

      const overRes = await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auth)
        .send({
          tripId: setupOver.tripId,
          tollPlazaId: plazaKnown,
          axleCount: 6,
          chargedAmount: 90,
          chargedAt: '2026-09-01T10:00:00.000Z',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auth)
        .send({
          tripId: setupUnverifiable.tripId,
          tollPlazaId: plazaUnknown,
          axleCount: 6,
          chargedAmount: 60,
          chargedAt: '2026-09-01T10:00:00.000Z',
        })
        .expect(201);

      const overchargeOnly = await request(app.getHttpServer())
        .get('/api/v1/toll-transactions?auditVerdict=OVERCHARGE')
        .set('Authorization', auth)
        .expect(200);
      expect(overchargeOnly.body.data.items).toHaveLength(1);
      expect(overchargeOnly.body.data.items[0].id).toBe(overRes.body.data.id);

      const unverifiableOnly = await request(app.getHttpServer())
        .get('/api/v1/toll-transactions?auditVerdict=UNVERIFIABLE')
        .set('Authorization', auth)
        .expect(200);
      expect(unverifiableOnly.body.data.items).toHaveLength(1);
      expect(unverifiableOnly.body.data.items[0].auditVerdict).toBe('UNVERIFIABLE');
    });

    it('contabiliza corretamente conferredCount/unverifiableCount/conformityPercentage no dashboard', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('AuditDashboard');
      const auth = `Bearer ${adminAccessToken}`;
      const plazaKnown = await createTollPlaza({ pricePerAxle: 10 });
      const plazaUnknown = await createTollPlaza({ pricePerAxle: undefined });
      const setupCorrect = await setupTripWithTaggedVehicle(auth);
      const setupOver = await setupTripWithTaggedVehicle(auth);
      const setupUnverifiable = await setupTripWithTaggedVehicle(auth);

      await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auth)
        .send({
          tripId: setupCorrect.tripId,
          tollPlazaId: plazaKnown,
          axleCount: 6,
          chargedAmount: 60,
          chargedAt: '2026-09-01T10:00:00.000Z',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auth)
        .send({
          tripId: setupOver.tripId,
          tollPlazaId: plazaKnown,
          axleCount: 6,
          chargedAmount: 90,
          chargedAt: '2026-09-01T10:00:00.000Z',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auth)
        .send({
          tripId: setupUnverifiable.tripId,
          tollPlazaId: plazaUnknown,
          axleCount: 6,
          chargedAmount: 60,
          chargedAt: '2026-09-01T10:00:00.000Z',
        })
        .expect(201);

      const dashboardRes = await request(app.getHttpServer())
        .get('/api/v1/toll-transactions/dashboard')
        .set('Authorization', auth)
        .expect(200);

      const dashboard = dashboardRes.body.data;
      expect(dashboard.totalCount).toBe(3);
      expect(dashboard.unverifiableCount).toBe(1);
      expect(dashboard.correctCount).toBe(1);
      expect(dashboard.overchargeCount).toBe(1);
      expect(dashboard.underchargeCount).toBe(0);
      expect(dashboard.conferredCount).toBe(2);
      expect(dashboard.conformityPercentage).toBeCloseTo(50, 5);
    });
  });

  describe('validacoes', () => {
    it('rejeita viagem inexistente e praca inexistente com 404', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Missing');
      const auth = `Bearer ${adminAccessToken}`;
      const plazaId = await createTollPlaza();
      const { tripId } = await setupTripWithTaggedVehicle(auth);

      await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auth)
        .send({
          tripId: randomUUID(),
          tollPlazaId: plazaId,
          axleCount: 5,
          chargedAmount: 50,
          chargedAt: '2026-09-01T10:00:00.000Z',
        })
        .expect(404);

      await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auth)
        .send({
          tripId,
          tollPlazaId: randomUUID(),
          axleCount: 5,
          chargedAmount: 50,
          chargedAt: '2026-09-01T10:00:00.000Z',
        })
        .expect(404);
    });

    it('rejeita valor negativo e quantidade de eixos invalida com 400', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('NegativeValue');
      const auth = `Bearer ${adminAccessToken}`;
      const plazaId = await createTollPlaza();
      const { tripId } = await setupTripWithTaggedVehicle(auth);

      await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auth)
        .send({
          tripId,
          tollPlazaId: plazaId,
          axleCount: 5,
          chargedAmount: -10,
          chargedAt: '2026-09-01T10:00:00.000Z',
        })
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auth)
        .send({
          tripId,
          tollPlazaId: plazaId,
          axleCount: 0,
          chargedAmount: 50,
          chargedAt: '2026-09-01T10:00:00.000Z',
        })
        .expect(400);
    });

    it('rejeita veiculo sem tag com 409', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('NoTag');
      const auth = `Bearer ${adminAccessToken}`;
      const plazaId = await createTollPlaza();

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

      await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auth)
        .send({
          tripId: tripRes.body.data.id,
          tollPlazaId: plazaId,
          axleCount: 5,
          chargedAmount: 50,
          chargedAt: '2026-09-01T10:00:00.000Z',
        })
        .expect(409);
    });

    it('rejeita tag inativa com 409', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('InactiveTag');
      const auth = `Bearer ${adminAccessToken}`;
      const plazaId = await createTollPlaza();
      const { tripId, vehicleId } = await setupTripWithTaggedVehicle(auth);

      const tagsRes = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleId}/tags`)
        .set('Authorization', auth)
        .expect(200);
      const tagId = tagsRes.body.data[0].id;
      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleId}/tags/${tagId}/status`)
        .set('Authorization', auth)
        .send({ isActive: false })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auth)
        .send({
          tripId,
          tollPlazaId: plazaId,
          axleCount: 5,
          chargedAmount: 50,
          chargedAt: '2026-09-01T10:00:00.000Z',
        })
        .expect(409);
    });

    it('rejeita tag vencida com 409', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('ExpiredTag');
      const auth = `Bearer ${adminAccessToken}`;
      const plazaId = await createTollPlaza();

      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);
      const compositionId = await createComposition(auth, vehicleId);
      const originId = await createLocation(auth, `Origem ${randomUUID()}`);
      const destinationId = await createLocation(auth, `Destino ${randomUUID()}`);
      const tagProviderId = await getSemParar(auth);
      await createVehicleTag(auth, vehicleId, tagProviderId, { expiresAt: '2020-01-01' });

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

      await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auth)
        .send({
          tripId: tripRes.body.data.id,
          tollPlazaId: plazaId,
          axleCount: 5,
          chargedAmount: 50,
          chargedAt: '2026-09-01T10:00:00.000Z',
        })
        .expect(409);
    });
  });

  describe('CRUD e recalculo automatico', () => {
    it('atualiza e recalcula expectedAmount/discrepancyAmount/status', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Update');
      const auth = `Bearer ${adminAccessToken}`;
      const plazaId = await createTollPlaza({ pricePerAxle: 10 });
      const { tripId } = await setupTripWithTaggedVehicle(auth);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auth)
        .send({
          tripId,
          tollPlazaId: plazaId,
          axleCount: 5,
          chargedAmount: 50,
          chargedAt: '2026-09-01T10:00:00.000Z',
        })
        .expect(201);
      expect(createRes.body.data.status).toBe('NORMAL');

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/toll-transactions/${createRes.body.data.id}`)
        .set('Authorization', auth)
        .send({ axleCount: 9 })
        .expect(200);
      expect(updateRes.body.data.expectedAmount).toBe(90);
      expect(updateRes.body.data.discrepancyAmount).toBe(-40);
      expect(updateRes.body.data.status).toBe('DIVERGENT');

      await request(app.getHttpServer())
        .delete(`/api/v1/toll-transactions/${createRes.body.data.id}`)
        .set('Authorization', auth)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/toll-transactions/${createRes.body.data.id}`)
        .set('Authorization', auth)
        .expect(404);
    });
  });

  describe('filtros e paginacao', () => {
    it('filtra por viagem, veiculo, motorista, operadora, praca, status e periodo', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Filters');
      const auth = `Bearer ${adminAccessToken}`;
      const plazaA = await createTollPlaza({ pricePerAxle: 10 });
      const plazaB = await createTollPlaza({ pricePerAxle: 5 });
      const setupA = await setupTripWithTaggedVehicle(auth);
      const setupB = await setupTripWithTaggedVehicle(auth);

      const txA = await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auth)
        .send({
          tripId: setupA.tripId,
          tollPlazaId: plazaA,
          axleCount: 5,
          chargedAmount: 50,
          chargedAt: '2026-01-10T10:00:00.000Z',
        })
        .expect(201);

      const txB = await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auth)
        .send({
          tripId: setupB.tripId,
          tollPlazaId: plazaB,
          axleCount: 4,
          chargedAmount: 100,
          chargedAt: '2026-06-10T10:00:00.000Z',
        })
        .expect(201);

      const byTrip = await request(app.getHttpServer())
        .get(`/api/v1/toll-transactions?tripId=${setupA.tripId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(byTrip.body.data.items).toHaveLength(1);
      expect(byTrip.body.data.items[0].id).toBe(txA.body.data.id);

      const byVehicle = await request(app.getHttpServer())
        .get(`/api/v1/toll-transactions?vehicleId=${setupB.vehicleId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(byVehicle.body.data.items).toHaveLength(1);
      expect(byVehicle.body.data.items[0].id).toBe(txB.body.data.id);

      const byDriver = await request(app.getHttpServer())
        .get(`/api/v1/toll-transactions?driverId=${setupA.driverId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(byDriver.body.data.items).toHaveLength(1);

      const byPlaza = await request(app.getHttpServer())
        .get(`/api/v1/toll-transactions?tollPlazaId=${plazaB}`)
        .set('Authorization', auth)
        .expect(200);
      expect(byPlaza.body.data.items).toHaveLength(1);
      expect(byPlaza.body.data.items[0].id).toBe(txB.body.data.id);

      const byStatus = await request(app.getHttpServer())
        .get('/api/v1/toll-transactions?status=DIVERGENT')
        .set('Authorization', auth)
        .expect(200);
      expect(byStatus.body.data.items).toHaveLength(1);
      expect(byStatus.body.data.items[0].id).toBe(txB.body.data.id);

      const byPeriod = await request(app.getHttpServer())
        .get('/api/v1/toll-transactions?chargedFrom=2026-01-01&chargedTo=2026-02-01')
        .set('Authorization', auth)
        .expect(200);
      expect(byPeriod.body.data.items).toHaveLength(1);
      expect(byPeriod.body.data.items[0].id).toBe(txA.body.data.id);

      const paginated = await request(app.getHttpServer())
        .get('/api/v1/toll-transactions?page=1&pageSize=1&sortBy=chargedAt&sortOrder=asc')
        .set('Authorization', auth)
        .expect(200);
      expect(paginated.body.data.items).toHaveLength(1);
      expect(paginated.body.data.meta).toMatchObject({ total: 2, page: 1, pageSize: 1 });
      expect(paginated.body.data.items[0].id).toBe(txA.body.data.id);
    });
  });

  describe('GET /toll-transactions/dashboard', () => {
    it('retorna totais e quantidade por operadora/veiculo/motorista/praca', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Dashboard');
      const auth = `Bearer ${adminAccessToken}`;
      const plaza = await createTollPlaza({ pricePerAxle: 10 });
      const setupA = await setupTripWithTaggedVehicle(auth);
      const setupB = await setupTripWithTaggedVehicle(auth);

      await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auth)
        .send({
          tripId: setupA.tripId,
          tollPlazaId: plaza,
          axleCount: 5,
          chargedAmount: 50,
          chargedAt: '2026-09-01T10:00:00.000Z',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auth)
        .send({
          tripId: setupB.tripId,
          tollPlazaId: plaza,
          axleCount: 3,
          chargedAmount: 100,
          chargedAt: '2026-09-02T10:00:00.000Z',
        })
        .expect(201);

      const dashboardRes = await request(app.getHttpServer())
        .get('/api/v1/toll-transactions/dashboard')
        .set('Authorization', auth)
        .expect(200);

      const dashboard = dashboardRes.body.data;
      expect(dashboard.totalCount).toBe(2);
      expect(dashboard.totalChargedAmount).toBe(150);
      expect(dashboard.totalExpectedAmount).toBe(80);
      expect(dashboard.totalDiscrepancyAmount).toBe(70);
      expect(
        dashboard.countByProvider.find((g: { label: string }) => g.label === 'Sem Parar').count,
      ).toBe(2);
      expect(dashboard.countByPlaza).toHaveLength(1);
      expect(dashboard.countByPlaza[0].count).toBe(2);
      expect(dashboard.countByVehicle).toHaveLength(2);
      expect(dashboard.countByDriver).toHaveLength(2);
      const statusNormal = dashboard.countByStatus.find(
        (g: { status: string }) => g.status === 'NORMAL',
      );
      expect(statusNormal.count).toBe(1);
    });

    it('filtra por fleetId (Vehicle.fleetId)', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('DashboardFleet');
      const auth = `Bearer ${adminAccessToken}`;
      const plaza = await createTollPlaza({ pricePerAxle: 10 });
      const fleetA = await createFleet(auth);

      const setupA = await setupTripWithTaggedVehicle(auth, { fleetId: fleetA });
      await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auth)
        .send({ tripId: setupA.tripId, tollPlazaId: plaza, axleCount: 5, chargedAmount: 50, chargedAt: '2026-09-01T10:00:00.000Z' })
        .expect(201);

      const setupB = await setupTripWithTaggedVehicle(auth); // sem frota
      await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auth)
        .send({ tripId: setupB.tripId, tollPlazaId: plaza, axleCount: 5, chargedAmount: 70, chargedAt: '2026-09-01T10:00:00.000Z' })
        .expect(201);

      const byFleet = await request(app.getHttpServer())
        .get(`/api/v1/toll-transactions/dashboard?fleetId=${fleetA}`)
        .set('Authorization', auth)
        .expect(200);
      expect(byFleet.body.data.totalCount).toBe(1);
      expect(byFleet.body.data.totalChargedAmount).toBe(50);

      const unfiltered = await request(app.getHttpServer())
        .get('/api/v1/toll-transactions/dashboard')
        .set('Authorization', auth)
        .expect(200);
      expect(unfiltered.body.data.totalCount).toBe(2);
    });

    it('inclui evolucao mensal com 12 posicoes, incluindo uma transacao lancada agora', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('DashboardTrend');
      const auth = `Bearer ${adminAccessToken}`;
      const plaza = await createTollPlaza({ pricePerAxle: 10 });
      const setup = await setupTripWithTaggedVehicle(auth);

      await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auth)
        .send({ tripId: setup.tripId, tollPlazaId: plaza, axleCount: 5, chargedAmount: 50, chargedAt: new Date().toISOString() })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/toll-transactions/dashboard')
        .set('Authorization', auth)
        .expect(200);

      expect(res.body.data.monthlyTrendChargedAmount).toHaveLength(12);
      expect(res.body.data.monthlyTrendChargedAmount[11].value).toBe(50);
    });
  });

  describe('isolamento multi-tenant', () => {
    it('nunca permite acesso cruzado entre tenants', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolA');
      const tenantB = await createTenantAndLoginAsAdmin('IsolB');
      const authA = `Bearer ${tenantA.adminAccessToken}`;
      const authB = `Bearer ${tenantB.adminAccessToken}`;

      const plaza = await createTollPlaza();
      const setupA = await setupTripWithTaggedVehicle(authA);
      const txRes = await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', authA)
        .send({
          tripId: setupA.tripId,
          tollPlazaId: plaza,
          axleCount: 5,
          chargedAmount: 50,
          chargedAt: '2026-09-01T10:00:00.000Z',
        })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/api/v1/toll-transactions/${txRes.body.data.id}`)
        .set('Authorization', authB)
        .expect(404);

      const listInB = await request(app.getHttpServer())
        .get('/api/v1/toll-transactions')
        .set('Authorization', authB)
        .expect(200);
      expect(
        listInB.body.data.items.find((t: { id: string }) => t.id === txRes.body.data.id),
      ).toBeUndefined();
    });
  });

  describe('permissoes por perfil', () => {
    it('AUDITOR le mas nao cria transacoes (403)', async () => {
      const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('RolesAuditor');
      const auditorEmail = `auditor-toll-${randomUUID()}@teste.com`;
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          name: 'Auditor',
          email: auditorEmail,
          password: 'SenhaForte123!',
          role: 'AUDITOR',
        })
        .expect(201);

      const auditorLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId, email: auditorEmail, password: 'SenhaForte123!' })
        .expect(200);
      const auditorAuth = `Bearer ${auditorLogin.body.data.accessToken}`;

      await request(app.getHttpServer())
        .get('/api/v1/toll-transactions')
        .set('Authorization', auditorAuth)
        .expect(200);

      const plaza = await createTollPlaza();
      const setup = await setupTripWithTaggedVehicle(`Bearer ${adminAccessToken}`);
      await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', auditorAuth)
        .send({
          tripId: setup.tripId,
          tollPlazaId: plaza,
          axleCount: 5,
          chargedAmount: 50,
          chargedAt: '2026-09-01T10:00:00.000Z',
        })
        .expect(403);
    });
  });
});
