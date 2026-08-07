import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Fleet (e2e)', () => {
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

  async function createTenantAndLoginAsAdmin(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    const payload = {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `fleet-${label.toLowerCase()}-${unique}`,
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

  // Promove o admin auto-criado a SUPER_ADMIN diretamente no banco -- nao ha
  // fluxo publico para criar um Super Admin (mesmo padrao ja usado em
  // tenants.e2e-spec.ts).
  async function createTenantWithSuperAdmin(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    const payload = {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `fleet-${label.toLowerCase()}-${unique}`,
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

  function randomPlate(): string {
    const letters = Array.from({ length: 3 }, () =>
      String.fromCharCode(65 + Math.floor(Math.random() * 26)),
    ).join('');
    const digits = Math.floor(1000 + Math.random() * 9000);
    return `${letters}${digits}`;
  }

  // brand/model sao obrigatorios (Fase 10) -- helper centraliza o payload
  // minimo valido para nao repetir esses dois campos em todo teste que so
  // precisa de "um veiculo qualquer" como pre-requisito.
  function buildVehiclePayload(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      plate: randomPlate(),
      brand: 'Volvo',
      model: 'FH 540',
      type: 'TRACTOR_UNIT',
      ...overrides,
    };
  }

  // ==========================================================================
  // FLEETS
  // ==========================================================================
  describe('/fleets', () => {
    it('CRUD completo de frota', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('FleetCrud');
      const auth = `Bearer ${adminAccessToken}`;

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/fleets')
        .set('Authorization', auth)
        .send({ name: 'Filial SP', type: 'OWN' })
        .expect(201);
      const fleetId = createRes.body.data.id;
      expect(createRes.body.data.isActive).toBe(true);

      await request(app.getHttpServer())
        .get(`/api/v1/fleets/${fleetId}`)
        .set('Authorization', auth)
        .expect(200);

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/fleets/${fleetId}`)
        .set('Authorization', auth)
        .send({ name: 'Filial SP - Zona Sul', type: 'AGGREGATED' })
        .expect(200);
      expect(updateRes.body.data.name).toBe('Filial SP - Zona Sul');
      expect(updateRes.body.data.type).toBe('AGGREGATED');

      const deactivateRes = await request(app.getHttpServer())
        .patch(`/api/v1/fleets/${fleetId}/status`)
        .set('Authorization', auth)
        .send({ isActive: false })
        .expect(200);
      expect(deactivateRes.body.data.isActive).toBe(false);

      await request(app.getHttpServer())
        .delete(`/api/v1/fleets/${fleetId}`)
        .set('Authorization', auth)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/fleets/${fleetId}`)
        .set('Authorization', auth)
        .expect(404);
    });

    it('lista com busca e filtro por tipo', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('FleetSearch');
      const auth = `Bearer ${adminAccessToken}`;

      await request(app.getHttpServer())
        .post('/api/v1/fleets')
        .set('Authorization', auth)
        .send({ name: 'Matriz', type: 'OWN' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/fleets')
        .set('Authorization', auth)
        .send({ name: 'Frota Terceirizada', type: 'OUTSOURCED' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleets?search=Matriz')
        .set('Authorization', auth)
        .expect(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].name).toBe('Matriz');

      const byType = await request(app.getHttpServer())
        .get('/api/v1/fleets?type=OUTSOURCED')
        .set('Authorization', auth)
        .expect(200);
      expect(byType.body.data.items).toHaveLength(1);
      expect(byType.body.data.items[0].type).toBe('OUTSOURCED');
    });
  });

  // ==========================================================================
  // VEHICLES
  // ==========================================================================
  describe('/vehicles', () => {
    it('rejeita placa invalida com 400', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('VehInvalid');
      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ plate: '1234', type: 'TRACTOR_UNIT' })
        .expect(400);
    });

    it('rejeita ano de fabricacao invalido com 400', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('VehYear');
      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(buildVehiclePayload({ manufactureYear: 1800 }))
        .expect(400);
    });

    it('rejeita marca ausente com 400', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('VehBrandMissing');
      const payload = buildVehiclePayload();
      delete (payload as Record<string, unknown>).brand;
      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(payload)
        .expect(400);
    });

    it('rejeita modelo ausente com 400', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('VehModelMissing');
      const payload = buildVehiclePayload();
      delete (payload as Record<string, unknown>).model;
      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(payload)
        .expect(400);
    });

    it('rejeita RENAVAM invalido com 400', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('VehRenavamInvalid');
      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(buildVehiclePayload({ renavam: '123' }))
        .expect(400);
    });

    it('rejeita chassi invalido com 400', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('VehChassisInvalid');
      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(buildVehiclePayload({ chassisNumber: 'CHASSI-CURTO' }))
        .expect(400);
    });

    it('rejeita ano do modelo anterior ao ano de fabricacao (ano inconsistente) com 409', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('VehYearInconsistent');
      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(buildVehiclePayload({ manufactureYear: 2023, modelYear: 2022 }))
        .expect(409);
    });

    it('rejeita quilometragem negativa com 400', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('VehOdometerNegative');
      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(buildVehiclePayload({ odometerKm: -1 }))
        .expect(400);
    });

    it('aceita quilometragem igual a zero', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('VehOdometerZero');
      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(buildVehiclePayload({ odometerKm: 0 }))
        .expect(201);
    });

    it('rejeita capacidades zero ou negativas quando informadas com 400', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('VehCapacityInvalid');
      const auth = `Bearer ${adminAccessToken}`;

      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send(buildVehiclePayload({ tankCapacityLiters: 0 }))
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send(buildVehiclePayload({ grossWeightKg: -10 }))
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send(buildVehiclePayload({ axleCount: 1 }))
        .expect(400);
    });

    it('aceita placa no formato antigo e Mercosul', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('VehPlateFormats');
      const auth = `Bearer ${adminAccessToken}`;

      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send(buildVehiclePayload({ plate: 'ABC1234', type: 'TRUCK' }))
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send(buildVehiclePayload({ plate: 'ABC1D23', type: 'TRUCK' }))
        .expect(201);
    });

    it('CRUD completo, associacao a frota e conflitos de unicidade', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('VehCrud');
      const auth = `Bearer ${adminAccessToken}`;

      const fleetRes = await request(app.getHttpServer())
        .post('/api/v1/fleets')
        .set('Authorization', auth)
        .send({ name: 'Frota Propria', type: 'OWN' })
        .expect(201);
      const fleetId = fleetRes.body.data.id;

      const plate = randomPlate();
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send({
          plate,
          fleetId,
          renavam: '00123456789',
          chassisNumber: '9BWZZZ377VT004251',
          brand: 'Volvo',
          model: 'FH 540',
          manufactureYear: 2023,
          modelYear: 2024,
          color: 'Branco',
          type: 'TRACTOR_UNIT',
          category: 'Cavalo Trucado',
          fuelType: 'DIESEL_S10',
          tankCapacityLiters: 400,
          averageConsumptionKmL: 3.5,
          odometerKm: 12000,
          grossWeightKg: 23000,
          netWeightKg: 8000,
          cargoCapacityKg: 15000,
          axleCount: 3,
        })
        .expect(201);
      const vehicleId = createRes.body.data.id;
      expect(createRes.body.data.fleetId).toBe(fleetId);
      expect(createRes.body.data.status).toBe('ACTIVE');
      expect(createRes.body.data.fuelType).toBe('DIESEL_S10');
      expect(createRes.body.data.tankCapacityLiters).toBe(400);
      expect(createRes.body.data.averageConsumptionKmL).toBe(3.5);
      expect(createRes.body.data.odometerKm).toBe(12000);
      expect(createRes.body.data.grossWeightKg).toBe(23000);
      expect(createRes.body.data.netWeightKg).toBe(8000);
      expect(createRes.body.data.cargoCapacityKg).toBe(15000);
      expect(createRes.body.data.axleCount).toBe(3);

      // Placa duplicada -> 409.
      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send(buildVehiclePayload({ plate, type: 'TRUCK' }))
        .expect(409);

      // Renavam duplicado -> 409.
      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send(buildVehiclePayload({ renavam: '00123456789', type: 'TRUCK' }))
        .expect(409);

      // Chassi duplicado -> 409.
      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send(buildVehiclePayload({ chassisNumber: '9BWZZZ377VT004251', type: 'TRUCK' }))
        .expect(409);

      // fleetId de outro tenant -> 404.
      const otherTenant = await createTenantAndLoginAsAdmin('VehCrudOther');
      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send(buildVehiclePayload({ fleetId: otherTenant.tenantId, type: 'TRUCK' }))
        .expect(404);

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleId}`)
        .set('Authorization', auth)
        .send({ color: 'Prata' })
        .expect(200);
      expect(updateRes.body.data.color).toBe('Prata');

      const statusRes = await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleId}/status`)
        .set('Authorization', auth)
        .send({ status: 'MAINTENANCE' })
        .expect(200);
      expect(statusRes.body.data.status).toBe('MAINTENANCE');

      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleId}/status`)
        .set('Authorization', auth)
        .send({ status: 'INVALIDO' })
        .expect(400);

      await request(app.getHttpServer())
        .delete(`/api/v1/vehicles/${vehicleId}`)
        .set('Authorization', auth)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleId}`)
        .set('Authorization', auth)
        .expect(404);
    });

    it('isolamento multi-tenant entre veiculos', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('VehIsolA');
      const tenantB = await createTenantAndLoginAsAdmin('VehIsolB');

      const createInB = await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${tenantB.adminAccessToken}`)
        .send(buildVehiclePayload({ type: 'TRUCK' }))
        .expect(201);
      const vehicleBId = createInB.body.data.id;

      await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleBId}`)
        .set('Authorization', `Bearer ${tenantA.adminAccessToken}`)
        .expect(404);

      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleBId}`)
        .set('Authorization', `Bearer ${tenantA.adminAccessToken}`)
        .send({ color: 'Sequestrado' })
        .expect(404);
    });

    it('veiculo inexistente retorna 404 em GET, PATCH e DELETE', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('VehMissing');
      const auth = `Bearer ${adminAccessToken}`;
      const missingId = randomUUID();

      await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${missingId}`)
        .set('Authorization', auth)
        .expect(404);

      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${missingId}`)
        .set('Authorization', auth)
        .send({ color: 'Azul' })
        .expect(404);

      await request(app.getHttpServer())
        .delete(`/api/v1/vehicles/${missingId}`)
        .set('Authorization', auth)
        .expect(404);
    });

    it('filtra por placa, marca, modelo, status e frota, com paginacao/ordenacao', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('VehFilters');
      const auth = `Bearer ${adminAccessToken}`;

      const fleetRes = await request(app.getHttpServer())
        .post('/api/v1/fleets')
        .set('Authorization', auth)
        .send({ name: 'Frota Filtro', type: 'OWN' })
        .expect(201);
      const fleetId = fleetRes.body.data.id;

      const alvo = await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send(
          buildVehiclePayload({
            brand: 'Scania',
            model: 'R450',
            fleetId,
            category: 'Cavalo Trucado',
            manufactureYear: 2022,
          }),
        )
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send(
          buildVehiclePayload({
            brand: 'Mercedes-Benz',
            model: 'Actros',
            category: 'Toco',
            manufactureYear: 2023,
          }),
        )
        .expect(201);

      const inMaintenance = await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send(buildVehiclePayload({ brand: 'Volkswagen', model: 'Constellation' }))
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${inMaintenance.body.data.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'MAINTENANCE' })
        .expect(200);

      const byPlate = await request(app.getHttpServer())
        .get(`/api/v1/vehicles?plate=${alvo.body.data.plate}`)
        .set('Authorization', auth)
        .expect(200);
      expect(byPlate.body.data.items).toHaveLength(1);
      expect(byPlate.body.data.items[0].id).toBe(alvo.body.data.id);

      const byBrand = await request(app.getHttpServer())
        .get('/api/v1/vehicles?brand=Scania')
        .set('Authorization', auth)
        .expect(200);
      expect(byBrand.body.data.items).toHaveLength(1);
      expect(byBrand.body.data.items[0].brand).toBe('Scania');

      const byModel = await request(app.getHttpServer())
        .get('/api/v1/vehicles?model=Actros')
        .set('Authorization', auth)
        .expect(200);
      expect(byModel.body.data.items).toHaveLength(1);
      expect(byModel.body.data.items[0].model).toBe('Actros');

      const byCategory = await request(app.getHttpServer())
        .get('/api/v1/vehicles?category=Cavalo')
        .set('Authorization', auth)
        .expect(200);
      expect(byCategory.body.data.items).toHaveLength(1);
      expect(byCategory.body.data.items[0].brand).toBe('Scania');

      const byManufactureYear = await request(app.getHttpServer())
        .get('/api/v1/vehicles?manufactureYear=2022')
        .set('Authorization', auth)
        .expect(200);
      expect(byManufactureYear.body.data.items).toHaveLength(1);
      expect(byManufactureYear.body.data.items[0].brand).toBe('Scania');

      const byStatus = await request(app.getHttpServer())
        .get('/api/v1/vehicles?status=MAINTENANCE')
        .set('Authorization', auth)
        .expect(200);
      expect(byStatus.body.data.items).toHaveLength(1);
      expect(byStatus.body.data.items[0].brand).toBe('Volkswagen');

      const byFleet = await request(app.getHttpServer())
        .get(`/api/v1/vehicles?fleetId=${fleetId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(byFleet.body.data.items).toHaveLength(1);
      expect(byFleet.body.data.items[0].id).toBe(alvo.body.data.id);

      const paginated = await request(app.getHttpServer())
        .get('/api/v1/vehicles?status=ACTIVE&page=1&pageSize=1&sortBy=brand&sortOrder=asc')
        .set('Authorization', auth)
        .expect(200);
      expect(paginated.body.data.items).toHaveLength(1);
      expect(paginated.body.data.meta).toMatchObject({ total: 2, page: 1, pageSize: 1 });
      expect(paginated.body.data.items[0].brand).toBe('Mercedes-Benz');
    });

    it('bloqueia exclusao quando ha composicao vinculada a viagem em andamento', async () => {
      const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('VehDeleteGuard');
      const auth = `Bearer ${adminAccessToken}`;

      const vehicleRes = await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send(buildVehiclePayload())
        .expect(201);
      const vehicleId = vehicleRes.body.data.id;

      // Composicao sem viagem ainda -- ja e o suficiente para bloquear
      // (composicao "ativa": ainda nao concluida/cancelada).
      const compositionRes = await request(app.getHttpServer())
        .post('/api/v1/trip-compositions')
        .set('Authorization', auth)
        .send({ vehicleId, trailers: [] })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/v1/vehicles/${vehicleId}`)
        .set('Authorization', auth)
        .expect(409);

      // Remove a composicao -- exclusao passa a ser permitida.
      await request(app.getHttpServer())
        .delete(`/api/v1/trip-compositions/${compositionRes.body.data.id}`)
        .set('Authorization', auth)
        .expect(204);

      await request(app.getHttpServer())
        .delete(`/api/v1/vehicles/${vehicleId}`)
        .set('Authorization', auth)
        .expect(204);

      // Segundo veiculo: bloqueado por viagem IN_PROGRESS vinculada via composicao.
      const vehicle2Res = await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send(buildVehiclePayload())
        .expect(201);
      const vehicle2Id = vehicle2Res.body.data.id;

      const origin = await prisma.location.create({
        data: { tenantId, name: 'Origem Frota', type: 'OTHER' },
      });
      const destination = await prisma.location.create({
        data: { tenantId, name: 'Destino Frota', type: 'OTHER' },
      });
      const trip = await prisma.trip.create({
        data: {
          tenantId,
          originLocationId: origin.id,
          destinationLocationId: destination.id,
          status: 'IN_PROGRESS',
        },
      });
      await prisma.tripComposition.create({
        data: { tenantId, vehicleId: vehicle2Id, tripId: trip.id },
      });

      await request(app.getHttpServer())
        .delete(`/api/v1/vehicles/${vehicle2Id}`)
        .set('Authorization', auth)
        .expect(409);
    });

    it('bloqueia exclusao quando ha manutencao aberta vinculada', async () => {
      const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('VehMaintGuard');
      const auth = `Bearer ${adminAccessToken}`;

      const vehicleRes = await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send(buildVehiclePayload())
        .expect(201);
      const vehicleId = vehicleRes.body.data.id;

      // Nao ha endpoint de CRUD de manutencao nesta fase (fora do escopo) --
      // o registro e criado diretamente via Prisma, mesmo padrao usado para
      // Trip/TripComposition no teste de guarda acima.
      const maintenance = await prisma.vehicleMaintenance.create({
        data: { tenantId, vehicleId, status: 'OPEN', description: 'Troca de pneus' },
      });

      await request(app.getHttpServer())
        .delete(`/api/v1/vehicles/${vehicleId}`)
        .set('Authorization', auth)
        .expect(409);

      // Conclui a manutencao -- exclusao passa a ser permitida.
      await prisma.vehicleMaintenance.update({
        where: { id: maintenance.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });

      await request(app.getHttpServer())
        .delete(`/api/v1/vehicles/${vehicleId}`)
        .set('Authorization', auth)
        .expect(204);
    });

    it('retorna o historico de auditoria do veiculo (GET /vehicles/:id/history)', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('VehHistory');
      const auth = `Bearer ${adminAccessToken}`;

      const vehicleRes = await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send(buildVehiclePayload())
        .expect(201);
      const vehicleId = vehicleRes.body.data.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleId}`)
        .set('Authorization', auth)
        .send({ color: 'Prata' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleId}/status`)
        .set('Authorization', auth)
        .send({ status: 'MAINTENANCE' })
        .expect(200);

      const historyRes = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleId}/history`)
        .set('Authorization', auth)
        .expect(200);

      expect(historyRes.body.data.items.length).toBeGreaterThanOrEqual(3);
      const actions = historyRes.body.data.items.map((i: { action: string }) => i.action);
      expect(actions).toEqual(
        expect.arrayContaining(['vehicle.created', 'vehicle.updated', 'vehicle.status_changed']),
      );
      // Ordenado do mais recente para o mais antigo.
      expect(historyRes.body.data.items[0].action).toBe('vehicle.status_changed');
      expect(historyRes.body.data.items[0].entityId).toBe(vehicleId);
      expect(historyRes.body.data.items[0].userId).toBeTruthy();
      expect(historyRes.body.data.meta.total).toBeGreaterThanOrEqual(3);
    });

    it('historico de veiculo inexistente retorna 404', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('VehHistoryMissing');
      await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${randomUUID()}/history`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(404);
    });
  });

  // ==========================================================================
  // TRAILERS
  // ==========================================================================
  describe('/trailers', () => {
    it('CRUD completo com os tipos de implemento', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('TrailerCrud');
      const auth = `Bearer ${adminAccessToken}`;

      for (const type of [
        'BITREM',
        'RODOTREM',
        'VANDERLEIA',
        'FULL_TRAILER',
        'SEMI_TRAILER',
        'DOLLY',
      ]) {
        await request(app.getHttpServer())
          .post('/api/v1/trailers')
          .set('Authorization', auth)
          .send({ plate: randomPlate(), type })
          .expect(201);
      }

      const plate = randomPlate();
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/trailers')
        .set('Authorization', auth)
        .send({ plate, type: 'SIMPLE', notes: 'Carreta graneleira' })
        .expect(201);
      const trailerId = createRes.body.data.id;

      await request(app.getHttpServer())
        .post('/api/v1/trailers')
        .set('Authorization', auth)
        .send({ plate, type: 'SIMPLE' })
        .expect(409);

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/trailers/${trailerId}`)
        .set('Authorization', auth)
        .send({ notes: 'Atualizado' })
        .expect(200);
      expect(updateRes.body.data.notes).toBe('Atualizado');

      await request(app.getHttpServer())
        .patch(`/api/v1/trailers/${trailerId}/status`)
        .set('Authorization', auth)
        .send({ isActive: false })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/v1/trailers/${trailerId}`)
        .set('Authorization', auth)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/trailers/${trailerId}`)
        .set('Authorization', auth)
        .expect(404);
    });
  });

  // ==========================================================================
  // TAG PROVIDERS + VEHICLE TAGS
  // ==========================================================================
  describe('/tag-providers e /vehicles/:id/tags', () => {
    it('lista as operadoras seedadas', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('TagProviders');
      const res = await request(app.getHttpServer())
        .get('/api/v1/tag-providers')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      const names = res.body.data.map((p: { name: string }) => p.name).sort();
      expect(names).toEqual(['ConectCar', 'Move Mais', 'Sem Parar', 'Veloe'].sort());
    });

    it('vincula, lista, ativa/desativa e remove uma tag do veiculo', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('VehicleTags');
      const auth = `Bearer ${adminAccessToken}`;

      const vehicleRes = await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send(buildVehiclePayload())
        .expect(201);
      const vehicleId = vehicleRes.body.data.id;

      const providersRes = await request(app.getHttpServer())
        .get('/api/v1/tag-providers')
        .set('Authorization', auth)
        .expect(200);
      const semParar = providersRes.body.data.find((p: { name: string }) => p.name === 'Sem Parar');

      const tagNumber = String(Math.floor(1_000_000_000 + Math.random() * 8_999_999_999));
      const createTagRes = await request(app.getHttpServer())
        .post(`/api/v1/vehicles/${vehicleId}/tags`)
        .set('Authorization', auth)
        .send({
          tagProviderId: semParar.id,
          tagNumber,
          activatedAt: '2026-01-01',
          expiresAt: '2027-01-01',
        })
        .expect(201);
      const tagId = createTagRes.body.data.id;
      expect(createTagRes.body.data.isActive).toBe(true);
      expect(createTagRes.body.data.expiresAt).toBeTruthy();

      const updateTagRes = await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleId}/tags/${tagId}`)
        .set('Authorization', auth)
        .send({ expiresAt: '2028-01-01' })
        .expect(200);
      expect(updateTagRes.body.data.expiresAt).toContain('2028');

      // Numero de tag duplicado para a MESMA operadora -> 409.
      await request(app.getHttpServer())
        .post(`/api/v1/vehicles/${vehicleId}/tags`)
        .set('Authorization', auth)
        .send({ tagProviderId: semParar.id, tagNumber })
        .expect(409);

      // Operadora inexistente -> 404.
      await request(app.getHttpServer())
        .post(`/api/v1/vehicles/${vehicleId}/tags`)
        .set('Authorization', auth)
        .send({ tagProviderId: randomUUID(), tagNumber: '999999' })
        .expect(404);

      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleId}/tags`)
        .set('Authorization', auth)
        .expect(200);
      expect(listRes.body.data).toHaveLength(1);

      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleId}/tags/${tagId}/status`)
        .set('Authorization', auth)
        .send({ isActive: false })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/v1/vehicles/${vehicleId}/tags/${tagId}`)
        .set('Authorization', auth)
        .expect(204);

      const listAfterRemove = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleId}/tags`)
        .set('Authorization', auth)
        .expect(200);
      expect(listAfterRemove.body.data).toHaveLength(0);
    });

    it('SUPER_ADMIN cadastra, atualiza, ativa/desativa e exclui uma operadora', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('TagProviderCrud');
      const auth = `Bearer ${superAdminAccessToken}`;
      const name = `Operadora Teste ${randomUUID()}`;

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/tag-providers')
        .set('Authorization', auth)
        .send({ name, website: 'https://exemplo.com', phone: '0800123456' })
        .expect(201);
      const providerId = createRes.body.data.id;
      expect(createRes.body.data.isActive).toBe(true);

      await request(app.getHttpServer())
        .post('/api/v1/tag-providers')
        .set('Authorization', auth)
        .send({ name })
        .expect(409);

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/tag-providers/${providerId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(getRes.body.data.website).toBe('https://exemplo.com');

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/tag-providers/${providerId}`)
        .set('Authorization', auth)
        .send({ notes: 'Observacao de teste' })
        .expect(200);
      expect(updateRes.body.data.notes).toBe('Observacao de teste');

      await request(app.getHttpServer())
        .patch(`/api/v1/tag-providers/${providerId}/status`)
        .set('Authorization', auth)
        .send({ isActive: false })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/v1/tag-providers/${providerId}`)
        .set('Authorization', auth)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/tag-providers/${providerId}`)
        .set('Authorization', auth)
        .expect(404);
    });

    it('rejeita escrita em operadoras por usuario que nao e SUPER_ADMIN (403)', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('TagProviderForbidden');
      await request(app.getHttpServer())
        .post('/api/v1/tag-providers')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ name: `Operadora Proibida ${randomUUID()}` })
        .expect(403);
    });

    it('bloqueia exclusao de operadora com tags vinculadas', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('TagProviderInUse');
      const auth = `Bearer ${superAdminAccessToken}`;

      const providersRes = await request(app.getHttpServer())
        .get('/api/v1/tag-providers')
        .set('Authorization', auth)
        .expect(200);
      const semParar = providersRes.body.data.find((p: { name: string }) => p.name === 'Sem Parar');

      const vehicleRes = await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send(buildVehiclePayload())
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/vehicles/${vehicleRes.body.data.id}/tags`)
        .set('Authorization', auth)
        .send({ tagProviderId: semParar.id, tagNumber: String(Math.floor(Math.random() * 1e10)) })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/v1/tag-providers/${semParar.id}`)
        .set('Authorization', auth)
        .expect(409);
    });
  });

  // ==========================================================================
  // TRIP COMPOSITIONS + AXLE CONFIGURATION
  // ==========================================================================
  describe('/trip-compositions', () => {
    async function setupVehicleAndTrailers(auth: string) {
      const vehicleRes = await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send(buildVehiclePayload())
        .expect(201);

      const trailer1 = await request(app.getHttpServer())
        .post('/api/v1/trailers')
        .set('Authorization', auth)
        .send({ plate: randomPlate(), type: 'SEMI_TRAILER' })
        .expect(201);

      const trailer2 = await request(app.getHttpServer())
        .post('/api/v1/trailers')
        .set('Authorization', auth)
        .send({ plate: randomPlate(), type: 'SEMI_TRAILER' })
        .expect(201);

      return {
        vehicleId: vehicleRes.body.data.id as string,
        trailer1Id: trailer1.body.data.id as string,
        trailer2Id: trailer2.body.data.id as string,
      };
    }

    it('monta uma composicao bitrem (2 implementos ordenados) com config de eixos', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('CompBitrem');
      const auth = `Bearer ${adminAccessToken}`;
      const { vehicleId, trailer1Id, trailer2Id } = await setupVehicleAndTrailers(auth);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/trip-compositions')
        .set('Authorization', auth)
        .send({
          vehicleId,
          trailers: [
            { trailerId: trailer2Id, positionOrder: 2 },
            { trailerId: trailer1Id, positionOrder: 1 },
          ],
          axleConfiguration: {
            totalAxles: 9,
            raisedAxles: 1,
            loweredAxles: 6,
            suspendedAxles: 0,
            steeringAxles: 1,
            tractionAxles: 2,
            billableCategory: '9 eixos',
          },
        })
        .expect(201);

      const composition = createRes.body.data;
      expect(composition.tripId).toBeNull();
      expect(composition.vehicleId).toBe(vehicleId);
      // Retorna ordenado por positionOrder, independente da ordem enviada.
      expect(composition.trailers.map((t: { trailerId: string }) => t.trailerId)).toEqual([
        trailer1Id,
        trailer2Id,
      ]);
      expect(composition.axleConfiguration.billableCategory).toBe('9 eixos');

      return composition.id as string;
    });

    it('rejeita positionOrder duplicado com 409', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('CompDupPos');
      const auth = `Bearer ${adminAccessToken}`;
      const { vehicleId, trailer1Id, trailer2Id } = await setupVehicleAndTrailers(auth);

      await request(app.getHttpServer())
        .post('/api/v1/trip-compositions')
        .set('Authorization', auth)
        .send({
          vehicleId,
          trailers: [
            { trailerId: trailer1Id, positionOrder: 1 },
            { trailerId: trailer2Id, positionOrder: 1 },
          ],
        })
        .expect(409);
    });

    it('rejeita implemento de outro tenant com 404', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('CompIsolA');
      const tenantB = await createTenantAndLoginAsAdmin('CompIsolB');
      const authA = `Bearer ${tenantA.adminAccessToken}`;
      const { vehicleId } = await setupVehicleAndTrailers(authA);

      const trailerInB = await request(app.getHttpServer())
        .post('/api/v1/trailers')
        .set('Authorization', `Bearer ${tenantB.adminAccessToken}`)
        .send({ plate: randomPlate(), type: 'SEMI_TRAILER' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/trip-compositions')
        .set('Authorization', authA)
        .send({ vehicleId, trailers: [{ trailerId: trailerInB.body.data.id, positionOrder: 1 }] })
        .expect(404);
    });

    it('atualiza (substitui) a lista de implementos e faz upsert da config de eixos', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('CompUpdate');
      const auth = `Bearer ${adminAccessToken}`;
      const { vehicleId, trailer1Id, trailer2Id } = await setupVehicleAndTrailers(auth);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/trip-compositions')
        .set('Authorization', auth)
        .send({ vehicleId, trailers: [{ trailerId: trailer1Id, positionOrder: 1 }] })
        .expect(201);
      const compositionId = createRes.body.data.id;
      expect(createRes.body.data.axleConfiguration).toBeNull();

      // Substitui a lista (agora so o trailer2).
      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/trip-compositions/${compositionId}`)
        .set('Authorization', auth)
        .send({ trailers: [{ trailerId: trailer2Id, positionOrder: 1 }] })
        .expect(200);
      expect(updateRes.body.data.trailers).toHaveLength(1);
      expect(updateRes.body.data.trailers[0].trailerId).toBe(trailer2Id);

      // Cria a config de eixos via endpoint dedicado.
      const axleCreateRes = await request(app.getHttpServer())
        .patch(`/api/v1/trip-compositions/${compositionId}/axle-configuration`)
        .set('Authorization', auth)
        .send({
          totalAxles: 6,
          raisedAxles: 0,
          loweredAxles: 4,
          suspendedAxles: 0,
          steeringAxles: 1,
          tractionAxles: 1,
          billableCategory: '6 eixos',
        })
        .expect(200);
      expect(axleCreateRes.body.data.axleConfiguration.billableCategory).toBe('6 eixos');

      // Upsert de novo (agora update, nao create).
      const axleUpdateRes = await request(app.getHttpServer())
        .patch(`/api/v1/trip-compositions/${compositionId}/axle-configuration`)
        .set('Authorization', auth)
        .send({
          totalAxles: 9,
          raisedAxles: 1,
          loweredAxles: 6,
          suspendedAxles: 0,
          steeringAxles: 1,
          tractionAxles: 2,
          billableCategory: '9 eixos',
        })
        .expect(200);
      expect(axleUpdateRes.body.data.axleConfiguration.billableCategory).toBe('9 eixos');
      expect(axleUpdateRes.body.data.axleConfiguration.totalAxles).toBe(9);

      // Remove a composicao -- cascata remove trailers/axleConfiguration.
      await request(app.getHttpServer())
        .delete(`/api/v1/trip-compositions/${compositionId}`)
        .set('Authorization', auth)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/trip-compositions/${compositionId}`)
        .set('Authorization', auth)
        .expect(404);

      const axleConfigInDb = await prisma.axleConfiguration.findUnique({
        where: { tripCompositionId: compositionId },
      });
      expect(axleConfigInDb).toBeNull();
    });

    it('lista composicoes filtrando por veiculo', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('CompList');
      const auth = `Bearer ${adminAccessToken}`;
      const { vehicleId, trailer1Id } = await setupVehicleAndTrailers(auth);

      await request(app.getHttpServer())
        .post('/api/v1/trip-compositions')
        .set('Authorization', auth)
        .send({ vehicleId, trailers: [{ trailerId: trailer1Id, positionOrder: 1 }] })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/trip-compositions?vehicleId=${vehicleId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.meta.total).toBe(1);
    });
  });

  // ==========================================================================
  // PERMISSOES
  // ==========================================================================
  describe('permissoes por perfil', () => {
    it('OPERATOR le mas nao cria veiculos (403)', async () => {
      const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('FleetRoles');
      const operatorEmail = `operator-fleet-${randomUUID()}@teste.com`;
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
        .get('/api/v1/vehicles')
        .set('Authorization', operatorAuth)
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', operatorAuth)
        .send({ plate: randomPlate(), type: 'TRUCK' })
        .expect(403);
    });

    it('usuario com role DRIVER nao acessa o modulo de frota (403)', async () => {
      const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('FleetRolesDriver');
      const driverEmail = `driver-fleet-${randomUUID()}@teste.com`;
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          name: 'Conta de Motorista',
          email: driverEmail,
          password: 'SenhaForte123!',
          role: 'DRIVER',
        })
        .expect(201);

      const driverLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId, email: driverEmail, password: 'SenhaForte123!' })
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/v1/vehicles')
        .set('Authorization', `Bearer ${driverLogin.body.data.accessToken}`)
        .expect(403);
    });
  });
});
