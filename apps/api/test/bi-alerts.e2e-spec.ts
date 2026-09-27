import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// BI 10 -- alertas deterministicos sobre os KPIs oficiais. Cobre: regras dos
// 3 tipos (limite absoluto, variacao vs. comparacao, desvio dentro do
// periodo), rastreabilidade (o `kpi` do alerta e o MESMO objeto de
// /bi/kpis/summary), filtro de severidade, RBAC e isolamento multi-tenant.
describe('BI 10 -- alertas e anomalias (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdTenantIds: string[] = [];

  const JANUARY = { startDate: '2026-01-01', endDate: '2026-01-31' };

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
    return `${letters}${Math.floor(1000 + Math.random() * 9000)}`;
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
      slug: `bi-alerts-${label.toLowerCase()}-${unique}`,
      admin: { name: `Admin ${label}`, email: `admin-${label.toLowerCase()}-${unique}@teste.com`, password: 'SenhaForte123!' },
    };
    const createRes = await request(app.getHttpServer()).post('/api/v1/tenants').send(payload).expect(201);
    const tenantId: string = createRes.body.data.id;
    createdTenantIds.push(tenantId);
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email: payload.admin.email, password: payload.admin.password })
      .expect(200);
    return { tenantId, auth: `Bearer ${loginRes.body.data.accessToken as string}` };
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
    return `Bearer ${loginRes.body.data.accessToken as string}`;
  }

  async function post(auth: string, path: string, body: Record<string, unknown>) {
    const res = await request(app.getHttpServer()).post(`/api/v1${path}`).set('Authorization', auth).send(body).expect(201);
    return res.body.data.id as string;
  }

  async function createLocation(auth: string) {
    return post(auth, '/locations', { name: `Local ${randomUUID()}`, type: 'DISTRIBUTION_CENTER' });
  }

  interface Seed {
    tenantId: string;
    auth: string;
    vehicleId: string;
    tripId: string;
  }

  // Cenario dimensionado para disparar deterministicamente os 3 tipos de
  // regra: custo/km muito acima do limite (Tipo A), queda forte de receita
  // vs. dezembro (Tipo B) e um dia com pico de ocorrencias dentro do proprio
  // janeiro (Tipo C, baseline = media dos demais dias do MESMO periodo).
  async function seedAlertScenario(label: string): Promise<Seed> {
    const { tenantId, auth } = await createTenantAndLoginAsAdmin(label);
    const fleetId = await post(auth, '/fleets', { name: `Frota ${randomUUID()}`, type: 'OWN' });
    const vehicleId = await post(auth, '/vehicles', {
      plate: randomPlate(),
      brand: 'Volvo',
      model: 'FH 540',
      type: 'TRACTOR_UNIT',
      fleetId,
      odometerKm: 100000,
    });
    await prisma.vehicle.update({ where: { id: vehicleId }, data: { createdAt: new Date('2025-01-01T00:00:00Z') } });
    const driverId = await post(auth, '/drivers', {
      name: 'Motorista Teste',
      cpf: randomValidCpf(),
      cnhNumber: String(Math.floor(10000000000 + Math.random() * 89999999999)),
      cnhCategory: 'AE',
      cnhExpiresAt: '2027-06-30',
    });
    const compositionId = await post(auth, '/trip-compositions', { vehicleId, trailers: [] });
    const tripId = await post(auth, '/trips', {
      driverId,
      compositionId,
      originLocationId: await createLocation(auth),
      destinationLocationId: await createLocation(auth),
      plannedDeparture: '2026-01-05T00:00:00.000Z',
      plannedArrival: '2026-01-25T00:00:00.000Z',
    });
    await prisma.trip.update({
      where: { id: tripId },
      data: { status: 'COMPLETED', actualDeparture: new Date('2026-01-05T00:00:00Z'), actualArrival: new Date('2026-01-25T00:00:00Z') },
    });

    // Custo/km = 1000 / 100km = 10 BRL/km (limite critico: 7).
    const fuelStationId = await post(auth, '/fuel-stations', { name: `Posto ${randomUUID()}` });
    await post(auth, '/fuel-supplies', {
      vehicleId,
      driverId,
      fuelStationId,
      fuelType: 'DIESEL_S10',
      liters: 100,
      pricePerLiter: 5,
      odometerKm: 100000,
      supplyDate: '2026-01-05T10:00:00.000Z',
    });
    await post(auth, '/fuel-supplies', {
      vehicleId,
      driverId,
      fuelStationId,
      fuelType: 'DIESEL_S10',
      liters: 100,
      pricePerLiter: 5,
      odometerKm: 100100,
      supplyDate: '2026-01-20T10:00:00.000Z',
    });

    // Receita: dezembro 100.000, janeiro 20.000 -- queda de 80% (limite critico: 30%).
    await post(auth, '/trip-revenues', { tripId, category: 'FREIGHT', description: 'Frete dezembro', amount: 100000, receivedAt: '2025-12-10T10:00:00.000Z' });
    await post(auth, '/trip-revenues', { tripId, category: 'FREIGHT', description: 'Frete janeiro', amount: 20000, receivedAt: '2026-01-10T10:00:00.000Z' });

    // 4 ocorrencias CRITICAS no ULTIMO dia do periodo (limite critico de
    // occurrences_critical: 3; tambem cria o pico do ULTIMO balde da serie
    // diaria de janeiro -- a regra de desvio compara o balde mais recente
    // contra a media dos demais do MESMO periodo).
    const createdBy = (await prisma.userAccount.findFirstOrThrow({ where: { tenantId } })).id;
    for (let i = 0; i < 4; i += 1) {
      await prisma.tripOccurrence.create({
        data: {
          tenantId,
          tripId,
          vehicleId,
          type: 'BREAKDOWN',
          severity: 'CRITICAL',
          description: `Pane ${i}`,
          occurredAt: new Date('2026-01-31T12:00:00Z'),
          createdBy,
        },
      });
    }

    return { tenantId, auth, vehicleId, tripId };
  }

  function getAlerts(auth: string, query: Record<string, string>) {
    return request(app.getHttpServer()).get('/api/v1/bi/alerts').query(query).set('Authorization', auth);
  }
  function getSummary(auth: string, query: Record<string, string>) {
    return request(app.getHttpServer()).get('/api/v1/bi/kpis/summary').query(query).set('Authorization', auth);
  }

  let a: Seed;
  let b: Seed;

  beforeAll(async () => {
    a = await seedAlertScenario('A');
    b = await seedAlertScenario('B');
  }, 120000);

  it('dispara os 3 tipos de regra com o cenario seedado', async () => {
    const res = await getAlerts(a.auth, JANUARY).expect(200);
    const byRule = new Map(res.body.data.items.map((i: { ruleId: string }) => [i.ruleId, i]));
    expect(byRule.get('cost_per_km_above_limit')).toMatchObject({ severity: 'CRITICAL', conditionType: 'ABSOLUTE_THRESHOLD' });
    expect(byRule.get('occurrences_critical_above_limit')).toMatchObject({ severity: 'CRITICAL', conditionType: 'ABSOLUTE_THRESHOLD' });
    expect(byRule.get('revenue_relevant_change')).toMatchObject({ severity: 'CRITICAL', conditionType: 'COMPARISON_CHANGE' });
    expect(byRule.get('occurrences_total_period_deviation')).toMatchObject({ conditionType: 'PERIOD_DEVIATION' });
  });

  it('rastreabilidade: o kpi do alerta e o MESMO objeto oficial de /bi/kpis/summary (nenhuma segunda formula)', async () => {
    const [alerts, summary] = await Promise.all([
      getAlerts(a.auth, JANUARY).expect(200),
      getSummary(a.auth, { ...JANUARY, comparison: 'NONE', kpis: 'cost_per_km' }).expect(200),
    ]);
    const alert = alerts.body.data.items.find((i: { ruleId: string }) => i.ruleId === 'cost_per_km_above_limit');
    const officialKpi = summary.body.data.kpis.find((k: { id: string }) => k.id === 'cost_per_km');
    expect(alert.kpi.value).toBeCloseTo(officialKpi.value, 5);
    expect(alert.kpi.formula).toBe(officialKpi.formula);
  });

  it('identidade estavel entre chamadas repetidas (nunca aleatoria)', async () => {
    const [first, second] = await Promise.all([getAlerts(a.auth, JANUARY).expect(200), getAlerts(a.auth, JANUARY).expect(200)]);
    const firstIds = first.body.data.items.map((i: { id: string }) => i.id).sort();
    const secondIds = second.body.data.items.map((i: { id: string }) => i.id).sort();
    expect(firstIds).toEqual(secondIds);
  });

  it('filtro de severidade recorta os itens', async () => {
    const res = await getAlerts(a.auth, { ...JANUARY, severity: 'CRITICAL' }).expect(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    expect(res.body.data.items.every((i: { severity: string }) => i.severity === 'CRITICAL')).toBe(true);
  });

  it('periodo sem dados suficientes para desvio: sem alerta de PERIOD_DEVIATION (nunca inventa baseline)', async () => {
    const res = await getAlerts(a.auth, { startDate: '2026-06-01', endDate: '2026-06-02' }).expect(200);
    expect(res.body.data.items.some((i: { conditionType: string }) => i.conditionType === 'PERIOD_DEVIATION')).toBe(false);
  });

  it('CUSTOM sem as duas datas => 400 (mesma validacao de /bi/kpis/summary, nao duplicada)', async () => {
    await getAlerts(a.auth, { ...JANUARY, comparison: 'CUSTOM' }).expect(400);
  });

  it('veiculo de outro tenant => 404 (mesmo resolveScope da camada de KPIs)', async () => {
    await getAlerts(a.auth, { ...JANUARY, vehicleId: b.vehicleId }).expect(404);
  });

  it('isolamento: alertas de B usam so o proprio escopo (nunca vehicleId/tripId de A)', async () => {
    const res = await getAlerts(b.auth, JANUARY).expect(200);
    expect(res.body.data.scope.tenantId).toBe(b.tenantId);
    expect(res.body.data.scope.tenantId).not.toBe(a.tenantId);
    await getAlerts(b.auth, { ...JANUARY, vehicleId: a.vehicleId }).expect(404);
  });

  it('permissoes: OPERATOR recebe 403 (mesmo RBAC financeiro da camada de KPIs)', async () => {
    const operatorAuth = await createUserWithRole(a.tenantId, a.auth, 'OPERATOR');
    await getAlerts(operatorAuth, JANUARY).expect(403);
  });

  it('sem token => 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/bi/alerts').query(JANUARY).expect(401);
  });
});
