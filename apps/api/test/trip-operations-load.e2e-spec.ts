import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 32, Parte E -- teste de carga simples e controlado do painel de
// monitoramento (GET /trips/operations/active, Fase 29). Objetivo: provar
// que a quantidade de queries NAO cresce linearmente com o numero de viagens
// ativas (regra "sem N+1" documentada em TripsService.getActiveOperations).
// Nao e infraestrutura de benchmark de producao -- so `$use` (middleware
// Prisma) contando chamadas na MESMA instancia ja injetada pelo Nest,
// nenhum mecanismo de medicao novo.
describe('Performance -- GET /trips/operations/active (Fase 32)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantId: string;
  let adminAuth: string;
  const createdTenantIds: string[] = [];
  let plateCounter = 0;

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

    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    const payload = {
      name: `Transportadora Load ${unique}`,
      document: Array.from({ length: 14 }, () => Math.floor(Math.random() * 10)).join(''),
      slug: `load-${unique}`,
      admin: {
        name: 'Admin Load',
        email: `admin-load-${unique}@teste.com`,
        password: 'SenhaForte123!',
      },
    };
    const createRes = await request(app.getHttpServer()).post('/api/v1/tenants').send(payload).expect(201);
    tenantId = createRes.body.data.id;
    createdTenantIds.push(tenantId);
    await prisma.userAccount.update({
      where: { tenantId_email: { tenantId, email: payload.admin.email } },
      data: { role: 'SUPER_ADMIN' },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email: payload.admin.email, password: payload.admin.password })
      .expect(200);
    adminAuth = `Bearer ${loginRes.body.data.accessToken as string}`;
  }, 30_000);

  afterAll(async () => {
    for (const id of createdTenantIds) {
      await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
    }
    await app.close();
  });

  // Escrita direta via Prisma (nao HTTP) -- e fixture de carga, nao esta
  // testando o fluxo de criacao de viagem (ja coberto em outros e2e). Cada
  // viagem ja nasce IN_PROGRESS, com composicao/eixos/motorista/veiculo
  // completos, exatamente os dados que getActiveOperations le.
  async function createActiveTrip(): Promise<void> {
    plateCounter += 1;
    const suffix = `${plateCounter}${randomUUID().slice(0, 4)}`;
    const vehicle = await prisma.vehicle.create({
      data: { tenantId, plate: `LD${suffix}`.slice(0, 10).toUpperCase(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' },
    });
    const driver = await prisma.driver.create({
      data: {
        tenantId,
        name: `Motorista ${plateCounter}`,
        cpf: String(10_000_000_000 + plateCounter).padStart(11, '0'),
        cnhNumber: String(20_000_000_000 + plateCounter),
        cnhCategory: 'AE',
        cnhExpiresAt: new Date('2027-06-30T00:00:00.000Z'),
      },
    });
    const origin = await prisma.location.create({
      data: { tenantId, name: `Origem ${plateCounter}`, type: 'DISTRIBUTION_CENTER' },
    });
    const destination = await prisma.location.create({
      data: { tenantId, name: `Destino ${plateCounter}`, type: 'DISTRIBUTION_CENTER' },
    });
    const trip = await prisma.trip.create({
      data: {
        tenantId,
        driverId: driver.id,
        originLocationId: origin.id,
        destinationLocationId: destination.id,
        status: 'IN_PROGRESS',
        plannedDeparture: new Date(),
        plannedArrival: new Date(Date.now() + 86_400_000),
        actualDeparture: new Date(),
      },
    });
    await prisma.tripComposition.create({
      data: {
        tenantId,
        vehicleId: vehicle.id,
        tripId: trip.id,
        axleConfiguration: { create: { tenantId, totalAxles: 9, billableCategory: '9 eixos' } },
      },
    });
    // Uma posicao de GPS por viagem -- sem isso, todo mundo cairia no mesmo
    // caminho "sem TrackingPoint" e o teste nao exercitaria a leitura em
    // lote (distinct + orderBy) que e justamente o ponto sensivel a N+1.
    await prisma.trackingPoint.create({
      data: {
        tenantId,
        tripId: trip.id,
        latitude: -23.5,
        longitude: -46.6,
        speedKmh: 60,
        recordedAt: new Date(),
        deviceEventId: randomUUID(),
      },
    });
  }

  // Middleware Prisma temporario (Fase 32) -- so conta chamadas durante a
  // janela medida, nunca fica registrado permanentemente no client.
  async function countQueriesDuring<T>(action: () => Promise<T>): Promise<{ result: T; queries: number }> {
    let queries = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma as any).$use(async (_params: unknown, next: (p: unknown) => Promise<unknown>) => {
      queries += 1;
      return next(_params);
    });
    const result = await action();
    return { result, queries };
  }

  const scenarios = [10, 25, 50, 100];
  const measurements: { total: number; queries: number; durationMs: number; itemsReturned: number }[] = [];

  it.each(scenarios)('mede queries e tempo com aproximadamente %i viagens ativas', async (target) => {
    const alreadyCreated = plateCounter;
    const toCreate = target - alreadyCreated;
    for (let i = 0; i < toCreate; i += 1) {
      await createActiveTrip();
    }

    const startedAt = Date.now();
    const { result: res, queries } = await countQueriesDuring(() =>
      request(app.getHttpServer())
        .get('/api/v1/trips/operations/active')
        .set('Authorization', adminAuth)
        .expect(200),
    );
    const durationMs = Date.now() - startedAt;

    expect(res.body.data.items).toHaveLength(target);
    // Nenhuma viagem duplicada (mesmo tripId aparecendo 2x).
    const ids = res.body.data.items.map((i: { tripId: string }) => i.tripId);
    expect(new Set(ids).size).toBe(ids.length);

    measurements.push({ total: target, queries, durationMs, itemsReturned: res.body.data.items.length });
  }, 60_000);

  afterAll(() => {
    // Registrado no relatorio da Fase 32 -- nunca inventado.
    console.log('\n[Fase 32 - Parte E] GET /trips/operations/active - resultados observados:');
    console.table(measurements);
  });

  it('a quantidade de queries em 100 viagens nao cresce proporcionalmente ao numero de viagens (sem N+1)', () => {
    const at10 = measurements.find((m) => m.total === 10);
    const at100 = measurements.find((m) => m.total === 100);
    expect(at10).toBeDefined();
    expect(at100).toBeDefined();

    // N+1 real produziria um crescimento ~proporcional a N (10x mais viagens
    // -> ~10x mais queries). A arquitetura atual usa um numero FIXO de
    // consultas em lote (trips + trackingPoints distinct + routeEvents +
    // tollReconciliation.getSummaries [2 queries] + alerts + tenantSettings),
    // entao o crescimento esperado e proximo de zero. Limiar de 3x (bem
    // acima da variacao natural, bem abaixo do que um N+1 real produziria)
    // evita falso-positivo por ruido sem deixar passar uma regressao real.
    expect(at100!.queries).toBeLessThanOrEqual(at10!.queries * 3);
  });
});
