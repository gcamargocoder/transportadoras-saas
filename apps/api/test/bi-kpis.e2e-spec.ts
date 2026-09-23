import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// BI 1 -- camada oficial de KPIs (GET /bi/kpis, /bi/kpis/summary,
// /bi/kpis/:kpiId/evidence). Cobre: valores contra os endpoints ja
// existentes (mesma fonte, mesmo numero), comparacao entre periodos,
// limites de periodo, evidencias somando o total, isolamento multi-tenant,
// RBAC e validacao.
describe('BI 1 -- camada de KPIs (e2e)', () => {
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

  // --------------------------------------------------------------------------
  // helpers
  // --------------------------------------------------------------------------
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
      slug: `bi-${label.toLowerCase()}-${unique}`,
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

  async function createFuelSupply(auth: string, ids: Seed, odometerKm: number, totalAmount: number, supplyDate: string) {
    await post(auth, '/fuel-supplies', {
      vehicleId: ids.vehicleId,
      driverId: ids.driverId,
      fuelStationId: ids.fuelStationId,
      fuelType: 'DIESEL_S10',
      liters: 100,
      pricePerLiter: totalAmount / 100,
      odometerKm,
      supplyDate,
    });
  }

  async function createRevenue(auth: string, tripId: string, amount: number, receivedAt: string) {
    return post(auth, '/trip-revenues', { tripId, category: 'FREIGHT', description: 'Frete', amount, receivedAt });
  }

  async function createApprovedExpense(auth: string, tripId: string, category: string, amount: number, expenseDate: string) {
    const id = await post(auth, '/trip-expenses', { tripId, category, description: 'Despesa', expenseDate, amount });
    await request(app.getHttpServer())
      .patch(`/api/v1/trip-expenses/${id}/status`)
      .set('Authorization', auth)
      .send({ status: 'APPROVED' })
      .expect(200);
  }

  interface Seed {
    tenantId: string;
    auth: string;
    fleetId: string;
    vehicleId: string;
    driverId: string;
    tripId: string;
    fuelStationId: string;
  }

  // Cenario base de janeiro/2026 para 1 veiculo de uma frota.
  async function seedTenant(label: string): Promise<Seed> {
    const { tenantId, auth } = await createTenantAndLoginAsAdmin(label);
    const fleetId = await post(auth, '/fleets', { name: `Frota ${randomUUID()}`, type: 'OWN' });
    const vehicleId = await post(auth, '/vehicles', {
      plate: randomPlate(),
      brand: 'Volvo',
      model: 'FH 540',
      type: 'TRACTOR_UNIT',
      fleetId,
      odometerKm: 90000,
    });
    // Veiculo "existe" desde antes do periodo (capacidade da frota usa createdAt).
    await prisma.vehicle.update({ where: { id: vehicleId }, data: { createdAt: new Date('2025-01-01T00:00:00Z') } });
    const driverId = await post(auth, '/drivers', {
      name: 'Jose da Silva',
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
      plannedDeparture: '2026-01-10T00:00:00.000Z',
      plannedArrival: '2026-01-11T00:00:00.000Z',
    });
    const fuelStationId = await post(auth, '/fuel-stations', { name: `Posto ${randomUUID()}` });
    return { tenantId, auth, fleetId, vehicleId, driverId, tripId, fuelStationId };
  }

  async function seedJanuaryOperation(s: Seed) {
    // Distancia 1.000 km, combustivel R$ 1.000.
    await createFuelSupply(s.auth, s, 100000, 500, '2026-01-05T10:00:00.000Z');
    await createFuelSupply(s.auth, s, 101000, 500, '2026-01-20T10:00:00.000Z');
    // Receita: 3.000 em janeiro (uma no ultimo minuto do dia 31), 1.000 em dezembro.
    await createRevenue(s.auth, s.tripId, 2000, '2026-01-10T10:00:00.000Z');
    await createRevenue(s.auth, s.tripId, 1000, '2026-01-31T23:30:00.000Z');
    await createRevenue(s.auth, s.tripId, 1000, '2025-12-10T10:00:00.000Z');
    await createRevenue(s.auth, s.tripId, 700, '2026-02-01T00:00:00.000Z'); // fora do periodo
    // Outras despesas: FOOD entra (R$ 200); FUEL nao (fonte primaria e FuelSupply).
    await createApprovedExpense(s.auth, s.tripId, 'FOOD', 200, '2026-01-12T10:00:00.000Z');
    await createApprovedExpense(s.auth, s.tripId, 'FUEL', 999, '2026-01-12T10:00:00.000Z');

    // Execucao real da viagem (24h em janeiro) -- lifecycle completo nao e o
    // objeto deste teste; so as colunas que o BI le.
    await prisma.trip.update({
      where: { id: s.tripId },
      data: {
        status: 'COMPLETED',
        actualDeparture: new Date('2026-01-10T00:00:00.000Z'),
        actualArrival: new Date('2026-01-11T00:00:00.000Z'),
      },
    });

    // Entregas: 1 no prazo, 1 atrasada, 1 sem previsao (fora do denominador).
    const locationId = await createLocation(s.auth);
    const stops = [
      { sequence: 1, plannedArrival: '2026-01-10T12:00:00Z', actualArrival: '2026-01-10T11:00:00Z' },
      { sequence: 2, plannedArrival: '2026-01-10T15:00:00Z', actualArrival: '2026-01-10T16:00:00Z' },
      { sequence: 3, plannedArrival: null, actualArrival: '2026-01-10T20:00:00Z' },
    ];
    for (const stop of stops) {
      await prisma.tripDeliveryStop.create({
        data: {
          tenantId: s.tenantId,
          tripId: s.tripId,
          sequence: stop.sequence,
          locationId,
          status: 'COMPLETED',
          plannedArrival: stop.plannedArrival ? new Date(stop.plannedArrival) : null,
          actualArrival: new Date(stop.actualArrival),
          deliveredAt: new Date(stop.actualArrival),
        },
      });
    }

    // Ocorrencias: 1 critica valida, 1 cancelada (nao conta).
    const createdBy = (await prisma.userAccount.findFirstOrThrow({ where: { tenantId: s.tenantId } })).id;
    for (const cancelledAt of [null, new Date('2026-01-10T13:00:00Z')]) {
      await prisma.tripOccurrence.create({
        data: {
          tenantId: s.tenantId,
          tripId: s.tripId,
          vehicleId: s.vehicleId,
          type: 'BREAKDOWN',
          severity: 'CRITICAL',
          description: 'Pane',
          occurredAt: new Date('2026-01-10T12:00:00Z'),
          cancelledAt,
          createdBy,
        },
      });
    }
  }

  function getSummary(auth: string, query: Record<string, string>) {
    return request(app.getHttpServer()).get('/api/v1/bi/kpis/summary').query(query).set('Authorization', auth);
  }

  interface KpiBody {
    id: string;
    status: string;
    value: number | null;
    unavailableReason: string | null;
    comparison: { value: number | null; absoluteChange: number | null; percentChange: number | null };
    evidence: { source: string; recordCount: number }[];
  }

  function kpi(body: { data: { kpis: KpiBody[] } }, id: string): KpiBody {
    const found = body.data.kpis.find((k) => k.id === id);
    if (!found) throw new Error(`KPI ${id} ausente`);
    return found;
  }

  // --------------------------------------------------------------------------
  // cenario principal (compartilhado)
  // --------------------------------------------------------------------------
  let a: Seed;
  let b: Seed;

  beforeAll(async () => {
    a = await seedTenant('A');
    await seedJanuaryOperation(a);
    // Tenant B com valores bem diferentes -- nunca podem aparecer em A.
    b = await seedTenant('B');
    await createRevenue(b.auth, b.tripId, 50000, '2026-01-15T10:00:00.000Z');
    await createFuelSupply(b.auth, b, 200000, 9000, '2026-01-06T10:00:00.000Z');
  }, 120000);

  describe('catalogo', () => {
    it('lista KPIs com formula/fonte/unidade e dependencias pendentes', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/bi/kpis').set('Authorization', a.auth).expect(200);
      expect(res.body.data.catalogVersion).toBe('1');
      const ids = res.body.data.kpis.map((k: { id: string }) => k.id);
      expect(ids).toEqual(expect.arrayContaining(['revenue', 'operating_cost', 'cost_per_km', 'on_time_delivery_rate']));
      for (const k of res.body.data.kpis) {
        expect(k.formula).toEqual(expect.any(String));
        expect(k.sources.length).toBeGreaterThan(0);
      }
      expect(res.body.data.pending.length).toBeGreaterThan(0);
    });
  });

  describe('valores e formulas', () => {
    it('financeiro, operacional, nivel de servico e frota no periodo', async () => {
      const res = await getSummary(a.auth, { ...JANUARY, comparison: 'NONE' }).expect(200);
      const body = res.body;
      expect(kpi(body, 'revenue').value).toBeCloseTo(3000, 2);
      expect(kpi(body, 'fuel_cost').value).toBeCloseTo(1000, 2);
      expect(kpi(body, 'operating_cost').value).toBeCloseTo(1200, 2); // 1000 combustivel + 200 FOOD
      expect(kpi(body, 'operating_result').value).toBeCloseTo(1800, 2);
      expect(kpi(body, 'operating_margin').value).toBeCloseTo(60, 5);
      expect(kpi(body, 'distance_km').value).toBe(1000);
      expect(kpi(body, 'cost_per_km').value).toBeCloseTo(1.2, 5);
      expect(kpi(body, 'revenue_per_km').value).toBeCloseTo(3, 5);
      expect(kpi(body, 'fuel_liters').value).toBeCloseTo(200, 3);
      expect(kpi(body, 'trips_completed').value).toBe(1);
      expect(kpi(body, 'deliveries_completed').value).toBe(3);
      expect(kpi(body, 'on_time_delivery_rate').value).toBeCloseTo(50, 5);
      expect(kpi(body, 'occurrences_total').value).toBe(1);
      expect(kpi(body, 'occurrences_critical').value).toBe(1);
      // 24h em viagem / (1 veiculo x 744h de janeiro)
      expect(kpi(body, 'fleet_utilization').value).toBeCloseTo((24 / 744) * 100, 3);
      expect(kpi(body, 'fleet_availability').value).toBeCloseTo(100, 5);
      expect(body.data.scope.tenantId).toBe(a.tenantId);
      expect(body.data.comparisonPeriod).toBeNull();
    });

    it('fim do periodo inclui o dia inteiro e exclui o dia seguinte', async () => {
      const res = await getSummary(a.auth, { ...JANUARY, comparison: 'NONE', kpis: 'revenue' }).expect(200);
      expect(res.body.data.kpis).toHaveLength(1);
      expect(kpi(res.body, 'revenue').value).toBeCloseTo(3000, 2); // inclui 31/01 23:30, exclui 01/02 00:00
    });

    it('periodo sem dados: KPIs de razao indisponiveis com motivo (nunca 0 inventado)', async () => {
      const res = await getSummary(a.auth, { startDate: '2024-03-01', endDate: '2024-03-31', comparison: 'NONE' }).expect(200);
      expect(kpi(res.body, 'revenue').value).toBe(0);
      for (const id of ['operating_margin', 'cost_per_km', 'on_time_delivery_rate']) {
        expect(kpi(res.body, id).status).toBe('UNAVAILABLE');
        expect(kpi(res.body, id).value).toBeNull();
        expect(kpi(res.body, id).unavailableReason).toEqual(expect.any(String));
      }
    });
  });

  describe('consistencia com os endpoints existentes (fonte unica)', () => {
    it('despesas e custo/km batem com GET /fleet-operations/costs', async () => {
      const [bi, costs] = await Promise.all([
        getSummary(a.auth, { ...JANUARY, comparison: 'NONE', kpis: 'operating_cost,cost_per_km,distance_km' }).expect(200),
        request(app.getHttpServer())
          .get('/api/v1/fleet-operations/costs')
          .query({ startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-01-31T23:59:59.999Z' })
          .set('Authorization', a.auth)
          .expect(200),
      ]);
      expect(kpi(bi.body, 'operating_cost').value).toBeCloseTo(costs.body.data.totalCost, 6);
      expect(kpi(bi.body, 'cost_per_km').value).toBeCloseTo(costs.body.data.costPerKm.value, 6);
      expect(kpi(bi.body, 'distance_km').value).toBe(costs.body.data.costPerKm.distanceKm);
    });

    it('resultado bate com GET /fleet-operations/financial (summary.result)', async () => {
      const [bi, financial] = await Promise.all([
        getSummary(a.auth, { ...JANUARY, comparison: 'NONE', kpis: 'operating_result,revenue' }).expect(200),
        request(app.getHttpServer())
          .get('/api/v1/fleet-operations/financial')
          .query({ startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-01-31T23:59:59.999Z' })
          .set('Authorization', a.auth)
          .expect(200),
      ]);
      expect(kpi(bi.body, 'revenue').value).toBeCloseTo(financial.body.data.summary.totalRevenue, 6);
      expect(kpi(bi.body, 'operating_result').value).toBeCloseTo(financial.body.data.summary.result, 6);
    });
  });

  describe('comparacao entre periodos', () => {
    it('PREVIOUS_PERIOD (padrao) compara com dezembro e calcula variacoes', async () => {
      const res = await getSummary(a.auth, { ...JANUARY, kpis: 'revenue' }).expect(200);
      expect(res.body.data.comparisonMode).toBe('PREVIOUS_PERIOD');
      expect(res.body.data.comparisonPeriod.end).toBe('2025-12-31T23:59:59.999Z');
      const revenue = kpi(res.body, 'revenue');
      expect(revenue.comparison.value).toBeCloseTo(1000, 2);
      expect(revenue.comparison.absoluteChange).toBeCloseTo(2000, 2);
      expect(revenue.comparison.percentChange).toBeCloseTo(200, 5);
    });

    it('CUSTOM exige as duas datas; PREVIOUS_YEAR desloca 1 ano', async () => {
      await getSummary(a.auth, { ...JANUARY, comparison: 'CUSTOM' }).expect(400);
      const custom = await getSummary(a.auth, {
        ...JANUARY,
        comparison: 'CUSTOM',
        compareStartDate: '2025-12-01',
        compareEndDate: '2025-12-31',
        kpis: 'revenue',
      }).expect(200);
      expect(kpi(custom.body, 'revenue').comparison.value).toBeCloseTo(1000, 2);
      const yoy = await getSummary(a.auth, { ...JANUARY, comparison: 'PREVIOUS_YEAR', kpis: 'revenue' }).expect(200);
      expect(yoy.body.data.comparisonPeriod.start).toBe('2025-01-01T00:00:00.000Z');
      expect(kpi(yoy.body, 'revenue').comparison.percentChange).toBeNull(); // anterior = 0
    });
  });

  describe('rastreabilidade (evidencias)', () => {
    it('registros listados somam o valor do KPI e respeitam a exclusao de categorias', async () => {
      const summary = await getSummary(a.auth, { ...JANUARY, comparison: 'NONE', kpis: 'operating_cost' }).expect(200);
      const cost = kpi(summary.body, 'operating_cost');
      let listedTotal = 0;
      for (const evidence of cost.evidence) {
        const res = await request(app.getHttpServer())
          .get('/api/v1/bi/kpis/operating_cost/evidence')
          .query({ ...JANUARY, source: evidence.source, pageSize: '100' })
          .set('Authorization', a.auth)
          .expect(200);
        expect(res.body.data.meta.total).toBe(evidence.recordCount);
        listedTotal += res.body.data.items.reduce((sum: number, r: { amount: number | null }) => sum + (r.amount ?? 0), 0);
      }
      expect(listedTotal).toBeCloseTo(cost.value ?? NaN, 2);

      const other = await request(app.getHttpServer())
        .get('/api/v1/bi/kpis/operating_cost/evidence')
        .query({ ...JANUARY, source: 'TRIP_EXPENSE_OTHER' })
        .set('Authorization', a.auth)
        .expect(200);
      expect(other.body.data.items).toHaveLength(1);
      expect(other.body.data.items[0].description).toContain('FOOD');
    });

    it('fonte que nao compoe o KPI ou derivada => 400; KPI desconhecido => 404', async () => {
      const base = request(app.getHttpServer());
      await base.get('/api/v1/bi/kpis/revenue/evidence').query({ ...JANUARY, source: 'FUEL_SUPPLY' }).set('Authorization', a.auth).expect(400);
      await request(app.getHttpServer())
        .get('/api/v1/bi/kpis/fleet_utilization/evidence')
        .query({ ...JANUARY, source: 'FLEET_TIME' })
        .set('Authorization', a.auth)
        .expect(400);
      await request(app.getHttpServer())
        .get('/api/v1/bi/kpis/nao_existe/evidence')
        .query({ ...JANUARY, source: 'TRIP_REVENUE' })
        .set('Authorization', a.auth)
        .expect(404);
    });
  });

  describe('multi-tenant', () => {
    it('tenant A nunca enxerga dados do tenant B (e vice-versa)', async () => {
      const [resA, resB] = await Promise.all([
        getSummary(a.auth, { ...JANUARY, comparison: 'NONE', kpis: 'revenue,fuel_cost' }).expect(200),
        getSummary(b.auth, { ...JANUARY, comparison: 'NONE', kpis: 'revenue,fuel_cost' }).expect(200),
      ]);
      expect(kpi(resA.body, 'revenue').value).toBeCloseTo(3000, 2);
      expect(kpi(resB.body, 'revenue').value).toBeCloseTo(50000, 2);
      expect(kpi(resA.body, 'fuel_cost').value).toBeCloseTo(1000, 2);
      expect(kpi(resB.body, 'fuel_cost').value).toBeCloseTo(9000, 2);
    });

    it('vehicleId/fleetId de outro tenant => 404 (nunca vaza nem zera silenciosamente)', async () => {
      await getSummary(a.auth, { ...JANUARY, vehicleId: b.vehicleId }).expect(404);
      await getSummary(a.auth, { ...JANUARY, fleetId: b.fleetId }).expect(404);
      await request(app.getHttpServer())
        .get('/api/v1/bi/kpis/revenue/evidence')
        .query({ ...JANUARY, source: 'TRIP_REVENUE', vehicleId: b.vehicleId })
        .set('Authorization', a.auth)
        .expect(404);
    });

    it('evidencias de A nunca listam registros de B', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/bi/kpis/revenue/evidence')
        .query({ ...JANUARY, source: 'TRIP_REVENUE' })
        .set('Authorization', a.auth)
        .expect(200);
      expect(res.body.data.items.every((r: { tripId: string }) => r.tripId === a.tripId)).toBe(true);
    });

    it('filtro por veiculo/frota proprios recorta o escopo', async () => {
      const res = await getSummary(a.auth, { ...JANUARY, comparison: 'NONE', vehicleId: a.vehicleId, fleetId: a.fleetId, kpis: 'revenue' }).expect(200);
      expect(kpi(res.body, 'revenue').value).toBeCloseTo(3000, 2);
      expect(res.body.data.scope).toMatchObject({ vehicleId: a.vehicleId, fleetId: a.fleetId });
    });
  });

  describe('permissoes', () => {
    it.each(['OPERATOR', 'DISPATCHER', 'AUDITOR'])('%s recebe 403 (dado financeiro sensivel)', async (role) => {
      const auth = await createUserWithRole(a.tenantId, a.auth, role);
      await getSummary(auth, JANUARY).expect(403);
      await request(app.getHttpServer()).get('/api/v1/bi/kpis').set('Authorization', auth).expect(403);
    });

    it('MANAGER tem acesso', async () => {
      const auth = await createUserWithRole(a.tenantId, a.auth, 'MANAGER');
      await getSummary(auth, { ...JANUARY, kpis: 'revenue' }).expect(200);
    });

    it('sem token => 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/bi/kpis/summary').query(JANUARY).expect(401);
    });
  });

  describe('validacao', () => {
    it('periodo obrigatorio, fim >= inicio, KPI e comparacao validos', async () => {
      await getSummary(a.auth, {}).expect(400);
      await getSummary(a.auth, { startDate: '2026-02-01', endDate: '2026-01-01' }).expect(400);
      await getSummary(a.auth, { ...JANUARY, kpis: 'revenue,nao_existe' }).expect(400);
      await getSummary(a.auth, { ...JANUARY, comparison: 'SEMANA' }).expect(400);
      await getSummary(a.auth, { startDate: '2020-01-01', endDate: '2026-01-01' }).expect(400);
    });
  });
});
