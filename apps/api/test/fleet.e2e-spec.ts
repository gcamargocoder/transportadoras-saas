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

  function randomPlate(): string {
    const letters = Array.from({ length: 3 }, () =>
      String.fromCharCode(65 + Math.floor(Math.random() * 26)),
    ).join('');
    const digits = Math.floor(1000 + Math.random() * 9000);
    return `${letters}${digits}`;
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
        .send({ plate: randomPlate(), type: 'TRACTOR_UNIT', manufactureYear: 1800 })
        .expect(400);
    });

    it('aceita placa no formato antigo e Mercosul', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('VehPlateFormats');
      const auth = `Bearer ${adminAccessToken}`;

      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send({ plate: 'ABC1234', type: 'TRUCK' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send({ plate: 'ABC1D23', type: 'TRUCK' })
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
        })
        .expect(201);
      const vehicleId = createRes.body.data.id;
      expect(createRes.body.data.fleetId).toBe(fleetId);

      // Placa duplicada -> 409.
      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send({ plate, type: 'TRUCK' })
        .expect(409);

      // Renavam duplicado -> 409.
      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send({ plate: randomPlate(), renavam: '00123456789', type: 'TRUCK' })
        .expect(409);

      // fleetId de outro tenant -> 404.
      const otherTenant = await createTenantAndLoginAsAdmin('VehCrudOther');
      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send({ plate: randomPlate(), fleetId: otherTenant.tenantId, type: 'TRUCK' })
        .expect(404);

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleId}`)
        .set('Authorization', auth)
        .send({ color: 'Prata' })
        .expect(200);
      expect(updateRes.body.data.color).toBe('Prata');

      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleId}/status`)
        .set('Authorization', auth)
        .send({ isActive: false })
        .expect(200);

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
        .send({ plate: randomPlate(), type: 'TRUCK' })
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
        .send({ plate: randomPlate(), type: 'TRACTOR_UNIT' })
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
        .send({ tagProviderId: semParar.id, tagNumber, activatedAt: '2026-01-01' })
        .expect(201);
      const tagId = createTagRes.body.data.id;
      expect(createTagRes.body.data.isActive).toBe(true);

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
  });

  // ==========================================================================
  // TRIP COMPOSITIONS + AXLE CONFIGURATION
  // ==========================================================================
  describe('/trip-compositions', () => {
    async function setupVehicleAndTrailers(auth: string) {
      const vehicleRes = await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', auth)
        .send({ plate: randomPlate(), type: 'TRACTOR_UNIT' })
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
