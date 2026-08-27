import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 90 -- camada de decisao "qual veiculo/motorista aplicar nesta viagem
// planejada" (FleetOptimizationService, GET /trips/:id/fleet-optimization).
// Cobre disponibilidade, conflito de agenda, compatibilidade/dados
// ausentes, ranking deterministico, aplicacao via PATCH /trips/:id ja
// existente (revalidando no momento), viagem ja iniciada, isolamento
// multi-tenant, RBAC e ausencia de N+1 -- com requests reais contra o
// Postgres.
describe('Fleet Optimization -- candidatos veiculo/motorista para viagem planejada (e2e)', () => {
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
      slug: `fopt-${label.toLowerCase()}-${unique}`,
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

  async function createVehicle(auth: string, overrides: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/vehicles')
      .set('Authorization', auth)
      .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT', ...overrides })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createDriver(auth: string, overrides: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/drivers')
      .set('Authorization', auth)
      .send({
        name: 'Jose da Silva',
        cpf: randomValidCpf(),
        cnhNumber: String(Math.floor(10000000000 + Math.random() * 89999999999)),
        cnhCategory: 'AE',
        cnhExpiresAt: '2027-06-30',
        ...overrides,
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

  async function createComposition(auth: string, vehicleId: string, withAxleConfig = false) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/trip-compositions')
      .set('Authorization', auth)
      .send({
        vehicleId,
        trailers: [],
        ...(withAxleConfig ? { axleConfiguration: { totalAxles: 6, billableCategory: '6 eixos' } } : {}),
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createTrip(
    auth: string,
    opts: {
      driverId: string;
      compositionId: string;
      plannedDeparture?: string;
      plannedArrival?: string;
    },
  ) {
    const originId = await createLocation(auth, `Origem ${randomUUID()}`);
    const destinationId = await createLocation(auth, `Destino ${randomUUID()}`);
    const res = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', auth)
      .send({
        driverId: opts.driverId,
        compositionId: opts.compositionId,
        originLocationId: originId,
        destinationLocationId: destinationId,
        plannedDeparture: opts.plannedDeparture ?? '2026-09-01T08:00:00.000Z',
        plannedArrival: opts.plannedArrival ?? '2026-09-02T18:00:00.000Z',
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function setupBaseTrip(auth: string) {
    const vehicleId = await createVehicle(auth);
    const driverId = await createDriver(auth);
    const compositionId = await createComposition(auth, vehicleId);
    const tripId = await createTrip(auth, { driverId, compositionId });
    return { tripId, vehicleId, driverId, compositionId };
  }

  function getFleetOptimization(auth: string, tripId: string) {
    return request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}/fleet-optimization`)
      .set('Authorization', auth);
  }

  // ==========================================================================
  // Disponibilidade + selecao atual sempre presente
  // ==========================================================================
  describe('GET /trips/:id/fleet-optimization -- disponibilidade', () => {
    it('inclui a selecao atual da viagem, disponivel, com pontuacao base', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Current');
      const { tripId, vehicleId, driverId, compositionId } = await setupBaseTrip(adminAuth);

      const res = await getFleetOptimization(adminAuth, tripId).expect(200);
      const current = res.body.data.candidates.find((c: { isCurrentSelection: boolean }) => c.isCurrentSelection);
      expect(current).toMatchObject({
        compositionId,
        vehicleId,
        driverId,
        available: true,
        vehicleAvailable: true,
        driverAvailable: true,
        score: 100,
        rank: 1,
      });
      expect(current.justification).toEqual(expect.any(String));
      expect(current.justification.length).toBeGreaterThan(0);
    });

    it('veiculo em manutencao e motorista indisponivel nunca aparecem como candidatos disponiveis', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Unavailable');
      const { tripId, driverId: currentDriverId, compositionId: currentCompositionId } =
        await setupBaseTrip(adminAuth);

      const maintenanceVehicleId = await createVehicle(adminAuth);
      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${maintenanceVehicleId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'MAINTENANCE' })
        .expect(200);
      const maintenanceCompositionId = await createComposition(adminAuth, maintenanceVehicleId);

      const unavailableDriverId = await createDriver(adminAuth);
      await request(app.getHttpServer())
        .patch(`/api/v1/drivers/${unavailableDriverId}`)
        .set('Authorization', adminAuth)
        .send({ isAvailable: false })
        .expect(200);

      const res = await getFleetOptimization(adminAuth, tripId).expect(200);
      const ids = res.body.data.candidates.map((c: { compositionId: string; driverId: string }) => `${c.compositionId}:${c.driverId}`);
      expect(ids).not.toContain(`${maintenanceCompositionId}:${currentDriverId}`);
      expect(ids).not.toContain(`${currentCompositionId}:${unavailableDriverId}`);
    });
  });

  // ==========================================================================
  // Conflito de agenda (veiculo e motorista)
  // ==========================================================================
  describe('conflito de agenda', () => {
    it('composicao livre com o MESMO veiculo de outra viagem no mesmo periodo fica indisponivel', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('VehicleConflict');
      const vehicleId = await createVehicle(adminAuth);
      const driverA = await createDriver(adminAuth);
      const compositionA = await createComposition(adminAuth, vehicleId);
      await createTrip(adminAuth, {
        driverId: driverA,
        compositionId: compositionA,
        plannedDeparture: '2026-09-01T08:00:00.000Z',
        plannedArrival: '2026-09-05T18:00:00.000Z',
      });

      // Segunda composicao livre, MESMO veiculo -- conflito e por VEICULO,
      // nao por composicao (mesma regra de TripsService.assertVehicleAvailable).
      const compositionB = await createComposition(adminAuth, vehicleId);
      const driverB = await createDriver(adminAuth);
      const otherCompositionForTrip2 = await createComposition(adminAuth, await createVehicle(adminAuth));
      const trip2 = await createTrip(adminAuth, {
        driverId: driverB,
        compositionId: otherCompositionForTrip2,
        plannedDeparture: '2026-09-02T08:00:00.000Z',
        plannedArrival: '2026-09-03T18:00:00.000Z',
      });

      const res = await getFleetOptimization(adminAuth, trip2).expect(200);
      const candidate = res.body.data.candidates.find(
        (c: { compositionId: string; driverId: string }) => c.compositionId === compositionB && c.driverId === driverB,
      );
      // Nao entrou no ranking (indisponivel) -- confirmamos via contagem de
      // disponiveis, ja que candidates so devolve o topo + selecao atual.
      expect(candidate).toBeUndefined();
      expect(res.body.data.availableCompositionsCount).toBe(1); // so otherCompositionForTrip2 (a atual do trip2)
    });

    it('motorista com outra viagem no mesmo periodo fica indisponivel', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('DriverConflict');
      const busyDriverId = await createDriver(adminAuth);
      const compositionForTrip1 = await createComposition(adminAuth, await createVehicle(adminAuth));
      await createTrip(adminAuth, {
        driverId: busyDriverId,
        compositionId: compositionForTrip1,
        plannedDeparture: '2026-09-01T08:00:00.000Z',
        plannedArrival: '2026-09-05T18:00:00.000Z',
      });

      const { tripId: trip2 } = await setupBaseTrip(adminAuth);
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${trip2}`)
        .set('Authorization', adminAuth)
        .send({ plannedDeparture: '2026-09-02T08:00:00.000Z', plannedArrival: '2026-09-03T18:00:00.000Z' })
        .expect(200);

      const res = await getFleetOptimization(adminAuth, trip2).expect(200);
      expect(res.body.data.availableDriversCount).toBe(1); // so o motorista atual do trip2
    });
  });

  // ==========================================================================
  // Compatibilidade/dados ausentes e ranking deterministico
  // ==========================================================================
  describe('compatibilidade, dados ausentes e ranking', () => {
    it('composicao com eixos configurados pontua mais que uma sem configuracao, com placa como desempate', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Ranking');
      const { tripId } = await setupBaseTrip(adminAuth);

      const vehicleWithAxles = await createVehicle(adminAuth);
      const compositionWithAxles = await createComposition(adminAuth, vehicleWithAxles, true);
      const vehicleWithoutAxles = await createVehicle(adminAuth);
      const compositionWithoutAxles = await createComposition(adminAuth, vehicleWithoutAxles, false);
      const extraDriver = await createDriver(adminAuth);

      const res = await getFleetOptimization(adminAuth, tripId).expect(200);
      const withAxles = res.body.data.candidates.find(
        (c: { compositionId: string; driverId: string }) => c.compositionId === compositionWithAxles && c.driverId === extraDriver,
      );
      const withoutAxles = res.body.data.candidates.find(
        (c: { compositionId: string; driverId: string }) => c.compositionId === compositionWithoutAxles && c.driverId === extraDriver,
      );
      expect(withAxles.score).toBe(110);
      expect(withAxles.totalAxles).toBe(6);
      expect(withoutAxles.score).toBe(100);
      expect(withoutAxles.totalAxles).toBeNull();
      expect(withAxles.rank).toBeLessThan(withoutAxles.rank);

      // Ranking e uma funcao pura dos mesmos dados -- chamar de novo produz
      // exatamente a mesma ordem (deterministico).
      const res2 = await getFleetOptimization(adminAuth, tripId).expect(200);
      expect(res2.body.data.candidates.map((c: { compositionId: string; driverId: string }) => `${c.compositionId}:${c.driverId}`)).toEqual(
        res.body.data.candidates.map((c: { compositionId: string; driverId: string }) => `${c.compositionId}:${c.driverId}`),
      );
    });

    it('motorista com vinculo ATUAL ao veiculo (DriverVehicleAssignment) pontua mais que sem vinculo', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Assignment');
      const { tripId } = await setupBaseTrip(adminAuth);

      const vehicleId = await createVehicle(adminAuth);
      const compositionId = await createComposition(adminAuth, vehicleId);
      const habitualDriverId = await createDriver(adminAuth);
      await request(app.getHttpServer())
        .post(`/api/v1/drivers/${habitualDriverId}/vehicle-assignments`)
        .set('Authorization', adminAuth)
        .send({ vehicleId })
        .expect(201);
      const otherDriverId = await createDriver(adminAuth);

      const res = await getFleetOptimization(adminAuth, tripId).expect(200);
      const habitual = res.body.data.candidates.find(
        (c: { compositionId: string; driverId: string }) => c.compositionId === compositionId && c.driverId === habitualDriverId,
      );
      const other = res.body.data.candidates.find(
        (c: { compositionId: string; driverId: string }) => c.compositionId === compositionId && c.driverId === otherDriverId,
      );
      expect(habitual.hasCurrentDriverVehicleAssignment).toBe(true);
      expect(habitual.score).toBe(120);
      expect(other.hasCurrentDriverVehicleAssignment).toBe(false);
      expect(other.score).toBe(100);
    });

    it('nunca usa capacidade/peso como criterio de pontuacao (dado que a viagem nao possui) -- so informativo', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('NoCapacityCriteria');
      const { tripId } = await setupBaseTrip(adminAuth);
      const heavyVehicle = await createVehicle(adminAuth, { cargoCapacityKg: 40000 });
      const lightVehicle = await createVehicle(adminAuth, { cargoCapacityKg: 1000 });
      const compHeavy = await createComposition(adminAuth, heavyVehicle);
      const compLight = await createComposition(adminAuth, lightVehicle);
      const driver = await createDriver(adminAuth);

      const res = await getFleetOptimization(adminAuth, tripId).expect(200);
      const heavy = res.body.data.candidates.find(
        (c: { compositionId: string; driverId: string }) => c.compositionId === compHeavy && c.driverId === driver,
      );
      const light = res.body.data.candidates.find(
        (c: { compositionId: string; driverId: string }) => c.compositionId === compLight && c.driverId === driver,
      );
      expect(heavy.cargoCapacityKg).toBe(40000);
      expect(light.cargoCapacityKg).toBe(1000);
      expect(heavy.score).toBe(light.score); // mesma pontuacao -- capacidade nunca pontua
    });
  });

  // ==========================================================================
  // Aplicacao da selecao (reaproveita PATCH /trips/:id) e revalidacao
  // ==========================================================================
  describe('aplicacao da selecao', () => {
    it('aplica um candidato via PATCH /trips/:id (mesmo endpoint de planejamento ja existente)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Apply');
      const { tripId } = await setupBaseTrip(adminAuth);
      const newVehicleId = await createVehicle(adminAuth);
      const newCompositionId = await createComposition(adminAuth, newVehicleId);
      const newDriverId = await createDriver(adminAuth);

      const analysis = await getFleetOptimization(adminAuth, tripId).expect(200);
      const candidate = analysis.body.data.candidates.find(
        (c: { compositionId: string }) => c.compositionId === newCompositionId,
      );
      expect(candidate.available).toBe(true);

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}`)
        .set('Authorization', adminAuth)
        .send({ compositionId: newCompositionId, driverId: newDriverId })
        .expect(200);

      const trip = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(trip.body.data.compositionId).toBe(newCompositionId);
      expect(trip.body.data.driverId).toBe(newDriverId);
    });

    it('revalida no momento da aplicacao: candidato que ficou indisponivel entre a analise e o PATCH e rejeitado (409)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Revalidate');
      const { tripId } = await setupBaseTrip(adminAuth);
      const candidateVehicleId = await createVehicle(adminAuth);
      const candidateCompositionId = await createComposition(adminAuth, candidateVehicleId);
      const candidateDriverId = await createDriver(adminAuth);

      const analysis = await getFleetOptimization(adminAuth, tripId).expect(200);
      const candidate = analysis.body.data.candidates.find(
        (c: { compositionId: string }) => c.compositionId === candidateCompositionId,
      );
      expect(candidate.available).toBe(true);

      // Estado muda DEPOIS da analise (outro admin colocou o veiculo em
      // manutencao) -- a aplicacao deve revalidar e rejeitar, nunca confiar
      // no resultado antigo da analise.
      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${candidateVehicleId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'MAINTENANCE' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}`)
        .set('Authorization', adminAuth)
        .send({ compositionId: candidateCompositionId, driverId: candidateDriverId })
        .expect(409);
    });

    it('viagem ja iniciada: analise continua disponivel (leitura), mas aplicar e bloqueado pelo planejamento ja encerrado', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Started');
      const { tripId } = await setupBaseTrip(adminAuth);
      const newCompositionId = await createComposition(adminAuth, await createVehicle(adminAuth));
      const newDriverId = await createDriver(adminAuth);

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      await getFleetOptimization(adminAuth, tripId).expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}`)
        .set('Authorization', adminAuth)
        .send({ compositionId: newCompositionId, driverId: newDriverId })
        .expect(409);
    });
  });

  // ==========================================================================
  // Isolamento multi-tenant
  // ==========================================================================
  describe('isolamento multi-tenant', () => {
    it('tenant B nunca consegue analisar a viagem do tenant A', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolA');
      const { tripId } = await setupBaseTrip(tenantA.adminAuth);
      const tenantB = await createTenantAndLoginAsAdmin('IsolB');

      await getFleetOptimization(tenantB.adminAuth, tripId).expect(404);
    });
  });

  // ==========================================================================
  // RBAC
  // ==========================================================================
  describe('RBAC', () => {
    it('leitura: MANAGER/OPERATOR/DISPATCHER/AUDITOR ok; DRIVER bloqueado (403)', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('RbacRead');
      const { tripId } = await setupBaseTrip(adminAuth);

      for (const role of ['MANAGER', 'OPERATOR', 'DISPATCHER', 'AUDITOR']) {
        const auth = await createUserWithRole(tenantId, adminAuth, role);
        await getFleetOptimization(auth, tripId).expect(200);
      }

      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      await getFleetOptimization(driverAuth, tripId).expect(403);
    });
  });

  // ==========================================================================
  // Ausencia de N+1
  // ==========================================================================
  describe('verificacao de ausencia de N+1', () => {
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
        slug: `fopt-n1-${label.toLowerCase()}-${unique}`,
        admin: {
          name: `Admin ${label}`,
          email: `admin-${label.toLowerCase()}-${unique}@teste.com`,
          password: 'SenhaForte123!',
        },
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

    it('a contagem de queries de GET .../fleet-optimization nao cresce com o numero de veiculos/motoristas', async () => {
      const { adminAuth } = await createTenantAndLoginOnCountingApp('N1');

      async function seedVehicle() {
        const vehicleRes = await request(countingApp.getHttpServer())
          .post('/api/v1/vehicles')
          .set('Authorization', adminAuth)
          .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
          .expect(201);
        await request(countingApp.getHttpServer())
          .post('/api/v1/trip-compositions')
          .set('Authorization', adminAuth)
          .send({ vehicleId: vehicleRes.body.data.id, trailers: [] })
          .expect(201);
      }
      async function seedDriver() {
        await request(countingApp.getHttpServer())
          .post('/api/v1/drivers')
          .set('Authorization', adminAuth)
          .send({
            name: 'Motorista Extra',
            cpf: randomValidCpf(),
            cnhNumber: String(Math.floor(10000000000 + Math.random() * 89999999999)),
            cnhCategory: 'AE',
            cnhExpiresAt: '2027-06-30',
          })
          .expect(201);
      }

      const baseVehicleRes = await request(countingApp.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', adminAuth)
        .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
        .expect(201);
      const baseCompositionRes = await request(countingApp.getHttpServer())
        .post('/api/v1/trip-compositions')
        .set('Authorization', adminAuth)
        .send({ vehicleId: baseVehicleRes.body.data.id, trailers: [] })
        .expect(201);
      const baseDriverRes = await request(countingApp.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', adminAuth)
        .send({
          name: 'Motorista Base',
          cpf: randomValidCpf(),
          cnhNumber: String(Math.floor(10000000000 + Math.random() * 89999999999)),
          cnhCategory: 'AE',
          cnhExpiresAt: '2027-06-30',
        })
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
          driverId: baseDriverRes.body.data.id,
          compositionId: baseCompositionRes.body.data.id,
          originLocationId: originRes.body.data.id,
          destinationLocationId: destinationRes.body.data.id,
          plannedDeparture: '2026-09-01T08:00:00.000Z',
          plannedArrival: '2026-09-02T18:00:00.000Z',
        })
        .expect(201);
      const tripId = tripRes.body.data.id as string;

      const checkpoints = [5, 15, 30];
      const queriesByCheckpoint: number[] = [];
      let seeded = 0;
      for (const checkpoint of checkpoints) {
        while (seeded < checkpoint) {
          await seedVehicle();
          await seedDriver();
          seeded += 1;
        }
        queryCount = 0;
        await request(countingApp.getHttpServer())
          .get(`/api/v1/trips/${tripId}/fleet-optimization`)
          .set('Authorization', adminAuth)
          .expect(200);
        queriesByCheckpoint.push(queryCount);
      }

      const [queriesFor5, , queriesFor30] = queriesByCheckpoint;
      expect(queriesFor5).toBeGreaterThan(0);
      expect(queriesFor30).toBeLessThanOrEqual(queriesFor5 + 1);
    }, 180000);
  });
});
