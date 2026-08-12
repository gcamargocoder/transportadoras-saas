import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 42 -- gestao avancada de abastecimento (GET /fleet-operations/fuel).
// Metodologia de consumo/custo-por-km reaproveitada INTEGRALMENTE de
// FuelSuppliesService/common/utils/fuel-consumption.util.ts (a MESMA ja
// usada por GET /fuel-supplies/dashboard, ja testada em
// fuel-management.e2e-spec.ts) -- aqui so o breakdown por veiculo/frota,
// rankings, evolucao mensal, periodo anterior e alertas sao coisas novas.
describe('Fleet Operations Fuel Analytics (e2e)', () => {
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
      slug: `fuel-fops-${label.toLowerCase()}-${unique}`,
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
      .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT', ...overrides })
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

  async function createFuelStation(auth: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/fuel-stations')
      .set('Authorization', auth)
      .send({ name: `Posto ${randomUUID()}` })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createFuelSupply(
    auth: string,
    vehicleId: string,
    driverId: string,
    fuelStationId: string,
    liters: number,
    pricePerLiter: number,
    odometerKm: number,
    supplyDate: string,
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/fuel-supplies')
      .set('Authorization', auth)
      .send({ vehicleId, driverId, fuelStationId, fuelType: 'DIESEL_S10', liters, pricePerLiter, odometerKm, supplyDate })
      .expect(201);
    return res.body.data.id as string;
  }

  // Cria veiculo + motorista + posto proprios, prontos para abastecer --
  // reduz repeticao nos testes de escala/fixture.
  async function setupVehicleWithDriverAndStation(auth: string, overrides: Partial<Record<string, unknown>> = {}) {
    const vehicleId = await createVehicle(auth, overrides);
    const driverId = await createDriver(auth);
    const fuelStationId = await createFuelStation(auth);
    return { vehicleId, driverId, fuelStationId };
  }

  // ==========================================================================
  // Caso 1 -- dashboard vazio
  // ==========================================================================
  describe('dashboard vazio', () => {
    it('retorna resumo zerado, consumo/custo-por-km indisponiveis e listas vazias (nunca NaN)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Empty');

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/fuel')
        .set('Authorization', adminAuth)
        .expect(200);
      const data = res.body.data;

      expect(data.summary).toMatchObject({
        totalCost: 0,
        totalLiters: 0,
        supplyCount: 0,
        averagePricePerLiter: null,
        averageCostPerSupply: null,
        vehiclesSupplied: 0,
        fleetsSupplied: 0,
      });
      expect(data.consumption).toMatchObject({ value: null, available: false, unit: 'km/l', reason: 'INSUFFICIENT_ODOMETER_READINGS' });
      expect(data.costPerKm).toMatchObject({ value: null, available: false, reason: 'INSUFFICIENT_ODOMETER_READINGS' });
      expect(data.monthlyTrendCost).toHaveLength(12);
      expect(data.vehicleBreakdown).toEqual([]);
      expect(data.fleetBreakdown).toEqual([]);
      expect(data.alerts).toEqual([]);
      expect(data.previousPeriod).toBeNull();

      const flatten = (obj: Record<string, unknown>): unknown[] =>
        Object.values(obj).flatMap((v) =>
          v && typeof v === 'object' && !Array.isArray(v) ? flatten(v as Record<string, unknown>) : v,
        );
      for (const value of flatten(data)) {
        if (typeof value === 'number') expect(Number.isNaN(value)).toBe(false);
      }
    });
  });

  // ==========================================================================
  // Caso 2/6/12/13/14/15 -- cenario com abastecimentos conhecidos: resumo
  // exato, consumo/custo-por-km disponivel para o veiculo com 2+ registros,
  // indisponivel para o veiculo com so 1.
  // ==========================================================================
  describe('cenario com abastecimentos conhecidos', () => {
    it('calcula resumo, consumo e custo/km exatos a partir dos registros reais', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Fixture');
      const fleetA = await createFleet(adminAuth, { name: 'Frota SP' });

      // Veiculo A (2 abastecimentos, na frota A): consumo/custo-por-km
      // DEVEM ficar disponiveis.
      const a = await setupVehicleWithDriverAndStation(adminAuth, { fleetId: fleetA });
      await createFuelSupply(adminAuth, a.vehicleId, a.driverId, a.fuelStationId, 50, 5.0, 100000, '2026-01-01T10:00:00.000Z'); // 250,00
      await createFuelSupply(adminAuth, a.vehicleId, a.driverId, a.fuelStationId, 40, 5.5, 100400, '2026-01-10T10:00:00.000Z'); // 220,00

      // Veiculo B (1 abastecimento, sem frota): consumo/custo-por-km DEVEM
      // ficar indisponiveis (menos de 2 leituras de hodometro).
      const b = await setupVehicleWithDriverAndStation(adminAuth);
      await createFuelSupply(adminAuth, b.vehicleId, b.driverId, b.fuelStationId, 30, 5.0, 50000, '2026-01-05T10:00:00.000Z'); // 150,00

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/fuel')
        .set('Authorization', adminAuth)
        .expect(200);
      const data = res.body.data;

      // Resumo: 470 (A) + 150 (B) = 620; 90 (A) + 30 (B) = 120 litros; 3 abastecimentos.
      expect(data.summary.totalCost).toBeCloseTo(620, 5);
      expect(data.summary.totalLiters).toBeCloseTo(120, 5);
      expect(data.summary.supplyCount).toBe(3);
      expect(data.summary.averagePricePerLiter).toBeCloseTo(620 / 120, 5);
      expect(data.summary.averageCostPerSupply).toBeCloseTo(620 / 3, 5);
      expect(data.summary.vehiclesSupplied).toBe(2);
      expect(data.summary.fleetsSupplied).toBe(1); // so fleetA -- "Sem frota" nunca conta como frota real.

      // Veiculo A: distancia 400km, litros entre leituras = 40 (so o 2o
      // abastecimento -- o 1o so estabelece o odometro inicial).
      const breakdownA = data.vehicleBreakdown.find((v: { vehicleId: string }) => v.vehicleId === a.vehicleId);
      expect(breakdownA.consumption).toMatchObject({ value: 10, available: true, reason: null }); // 400/40
      expect(breakdownA.costPerKm).toMatchObject({ available: true, reason: null });
      expect(breakdownA.costPerKm.value).toBeCloseTo(470 / 400, 5);
      expect(breakdownA.hasOdometerAnomaly).toBe(false);
      expect(breakdownA.fleetId).toBe(fleetA);
      expect(breakdownA.fleetName).toBe('Frota SP');

      // Veiculo B: so 1 abastecimento -- indisponivel.
      const breakdownB = data.vehicleBreakdown.find((v: { vehicleId: string }) => v.vehicleId === b.vehicleId);
      expect(breakdownB.consumption).toMatchObject({ value: null, available: false, reason: 'INSUFFICIENT_ODOMETER_READINGS' });
      expect(breakdownB.costPerKm).toMatchObject({ value: null, available: false, reason: 'INSUFFICIENT_ODOMETER_READINGS' });
      expect(breakdownB.fleetId).toBeNull();
      expect(breakdownB.fleetName).toBe('Sem frota');

      // Agregado da frota inteira: so o veiculo A contribui com distancia
      // (B nao tem segmento medivel) -- consumo/custo-por-km da FROTA
      // tambem ficam disponiveis, usando so os dados de A.
      expect(data.consumption).toMatchObject({ value: 10, available: true });
      expect(data.costPerKm.available).toBe(true);
      expect(data.costPerKm.value).toBeCloseTo(620 / 400, 5); // custo TOTAL (A+B) / distancia so de A
    });
  });

  // ==========================================================================
  // Caso 3/4/5 -- filtros (periodo, veiculo, frota)
  // ==========================================================================
  describe('filtros', () => {
    it('filtra por periodo (supplyDate), veiculo e frota', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Filters');
      const fleetA = await createFleet(adminAuth);
      const fleetB = await createFleet(adminAuth);
      const a = await setupVehicleWithDriverAndStation(adminAuth, { fleetId: fleetA });
      const b = await setupVehicleWithDriverAndStation(adminAuth, { fleetId: fleetB });

      await createFuelSupply(adminAuth, a.vehicleId, a.driverId, a.fuelStationId, 50, 5, 100000, '2026-02-01T10:00:00.000Z'); // 250
      await createFuelSupply(adminAuth, b.vehicleId, b.driverId, b.fuelStationId, 40, 5, 50000, '2026-03-01T10:00:00.000Z'); // 200

      const byVehicleA = await request(app.getHttpServer())
        .get(`/api/v1/fleet-operations/fuel?vehicleId=${a.vehicleId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byVehicleA.body.data.summary.totalCost).toBe(250);

      const byFleetB = await request(app.getHttpServer())
        .get(`/api/v1/fleet-operations/fuel?fleetId=${fleetB}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byFleetB.body.data.summary.totalCost).toBe(200);

      const byPeriod = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/fuel?startDate=2026-02-01&endDate=2026-02-28')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byPeriod.body.data.summary.totalCost).toBe(250);

      const unfiltered = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/fuel')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(unfiltered.body.data.summary.totalCost).toBe(450);
    });
  });

  // ==========================================================================
  // Caso 9 -- rankings (8 pedidos)
  // ==========================================================================
  describe('rankings', () => {
    it('rankeia por custo/volume/consumo/preco/quantidade, so incluindo consumo quando disponivel', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Rankings');

      // Veiculo com custo/volume altos e consumo disponivel (2 abastecimentos).
      const high = await setupVehicleWithDriverAndStation(adminAuth);
      await createFuelSupply(adminAuth, high.vehicleId, high.driverId, high.fuelStationId, 100, 6, 200000, '2026-01-01T10:00:00.000Z'); // 600
      await createFuelSupply(adminAuth, high.vehicleId, high.driverId, high.fuelStationId, 100, 6, 200800, '2026-01-05T10:00:00.000Z'); // 600, dist=800,litros=100 => 8km/L

      // Veiculo com custo/volume baixos, so 1 abastecimento (sem consumo disponivel).
      const low = await setupVehicleWithDriverAndStation(adminAuth);
      await createFuelSupply(adminAuth, low.vehicleId, low.driverId, low.fuelStationId, 10, 5, 10000, '2026-01-01T10:00:00.000Z'); // 50

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/fuel')
        .set('Authorization', adminAuth)
        .expect(200);
      const rankings = res.body.data.rankings;

      expect(rankings.topCost[0].vehicleId).toBe(high.vehicleId);
      expect(rankings.bottomCost[0].vehicleId).toBe(low.vehicleId);
      expect(rankings.topVolume[0].vehicleId).toBe(high.vehicleId);
      expect(rankings.bottomVolume[0].vehicleId).toBe(low.vehicleId);
      expect(rankings.topSupplyCount[0].vehicleId).toBe(high.vehicleId);
      expect(rankings.topSupplyCount[0].value).toBe(2);

      // So "high" tem consumo disponivel -- "low" nunca aparece em
      // best/worstConsumption (secao E do pedido: nunca artificialmente
      // "melhor"/"pior" sem dado suficiente).
      expect(rankings.bestConsumption).toHaveLength(1);
      expect(rankings.bestConsumption[0].vehicleId).toBe(high.vehicleId);
      expect(rankings.worstConsumption).toHaveLength(1);
      expect(rankings.worstConsumption[0].vehicleId).toBe(high.vehicleId);
    });
  });

  // ==========================================================================
  // Caso 10 -- evolucao mensal (sempre ultimos 12 meses, ignora periodo do filtro)
  // ==========================================================================
  describe('evolucao mensal (monthlyTrend)', () => {
    it('inclui no ultimo balde (mes atual) um abastecimento lancado agora', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Trend');
      const v = await setupVehicleWithDriverAndStation(adminAuth);
      // supplyDate = agora (dentro do mes atual), odometro nao importa aqui.
      await createFuelSupply(adminAuth, v.vehicleId, v.driverId, v.fuelStationId, 50, 5, 100000, new Date().toISOString());

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/fuel')
        .set('Authorization', adminAuth)
        .expect(200);
      const data = res.body.data;

      expect(data.monthlyTrendCost).toHaveLength(12);
      expect(data.monthlyTrendCost[11].value).toBe(250);
      expect(data.monthlyTrendLiters).toHaveLength(12);
      expect(data.monthlyTrendLiters[11].value).toBe(50);
      expect(data.monthlyTrendSupplyCount[11].value).toBe(1);
    });
  });

  // ==========================================================================
  // Caso 11 -- periodo anterior
  // ==========================================================================
  describe('comparacao com periodo anterior', () => {
    it('calcula custo/litros/abastecimentos atuais vs anteriores e a variacao percentual', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PrevPeriod');
      const v = await setupVehicleWithDriverAndStation(adminAuth);
      // Periodo anterior: dentro de [2026-06-23T23:59:59.999Z, 2026-06-30T23:59:59.999Z].
      await createFuelSupply(adminAuth, v.vehicleId, v.driverId, v.fuelStationId, 20, 5, 10000, '2026-06-25T00:00:00.000Z'); // 100
      // Periodo atual: dentro de [2026-07-01, 2026-07-08).
      await createFuelSupply(adminAuth, v.vehicleId, v.driverId, v.fuelStationId, 40, 5, 10500, '2026-07-03T00:00:00.000Z'); // 200

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/fuel?startDate=2026-07-01&endDate=2026-07-08')
        .set('Authorization', adminAuth)
        .expect(200);
      const previousPeriod = res.body.data.previousPeriod;

      expect(previousPeriod.currentCost).toBe(200);
      expect(previousPeriod.previousCost).toBe(100);
      expect(previousPeriod.costDeltaPercent).toBe(100);
      expect(previousPeriod.currentLiters).toBe(40);
      expect(previousPeriod.previousLiters).toBe(20);
      expect(previousPeriod.currentSupplyCount).toBe(1);
      expect(previousPeriod.previousSupplyCount).toBe(1);
    });

    it('fica null quando o periodo nao e informado', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PrevPeriodNull');
      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/fuel')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.previousPeriod).toBeNull();
    });
  });

  // ==========================================================================
  // Caso 16/17 -- hodometro inconsistente -> alerta ODOMETER_REGRESSION.
  // A validacao de escrita (assertOdometerNotBelowVehicle) so compara com o
  // ULTIMO valor aceito -- por isso um registro criado DEPOIS mas com
  // supplyDate ANTERIOR (data retroativa) pode produzir uma regressao
  // CRONOLOGICA real sem violar essa validacao (ela nunca olha supplyDate).
  // ==========================================================================
  describe('alertas -- hodometro regressivo', () => {
    it('detecta quando a ordem cronologica (supplyDate) diverge da ordem do odometro', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('OdometerAnomaly');
      const v = await setupVehicleWithDriverAndStation(adminAuth);

      // Ordem de CRIACAO (sempre odometro crescente -- unica forma aceita
      // pela validacao de escrita): 1400 -> 1600 -> 1800.
      await createFuelSupply(adminAuth, v.vehicleId, v.driverId, v.fuelStationId, 50, 5, 1400, '2026-01-01T10:00:00.000Z');
      await createFuelSupply(adminAuth, v.vehicleId, v.driverId, v.fuelStationId, 50, 5, 1600, '2026-01-10T10:00:00.000Z');
      await createFuelSupply(adminAuth, v.vehicleId, v.driverId, v.fuelStationId, 50, 5, 1800, '2026-01-05T10:00:00.000Z');
      // Ordem CRONOLOGICA (por supplyDate): 01-01(1400) -> 01-05(1800) ->
      // 01-10(1600) -- regressao real entre o 2o e o 3o da lista cronologica.

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/fuel')
        .set('Authorization', adminAuth)
        .expect(200);
      const data = res.body.data;

      const breakdown = data.vehicleBreakdown.find((row: { vehicleId: string }) => row.vehicleId === v.vehicleId);
      expect(breakdown.hasOdometerAnomaly).toBe(true);

      const alert = data.alerts.find((a: { type: string; vehicleId: string }) => a.type === 'ODOMETER_REGRESSION' && a.vehicleId === v.vehicleId);
      expect(alert).toMatchObject({ severity: 'CRITICAL' });
    });
  });

  describe('alertas -- preco, consumo e volume fora do padrao', () => {
    it('destaca veiculo com preco/litro e abastecimento com volume muito acima da media da frota', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('AlertPrice');

      const outlier = await setupVehicleWithDriverAndStation(adminAuth);
      // Preco/litro muito acima (10 vs ~5) e volume excepcional (300L).
      await createFuelSupply(adminAuth, outlier.vehicleId, outlier.driverId, outlier.fuelStationId, 300, 10, 10000, '2026-01-01T10:00:00.000Z');

      const normalA = await setupVehicleWithDriverAndStation(adminAuth);
      await createFuelSupply(adminAuth, normalA.vehicleId, normalA.driverId, normalA.fuelStationId, 50, 5, 20000, '2026-01-01T10:00:00.000Z');
      const normalB = await setupVehicleWithDriverAndStation(adminAuth);
      await createFuelSupply(adminAuth, normalB.vehicleId, normalB.driverId, normalB.fuelStationId, 50, 5, 30000, '2026-01-01T10:00:00.000Z');

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/fuel')
        .set('Authorization', adminAuth)
        .expect(200);
      const alerts = res.body.data.alerts as { type: string; vehicleId: string; severity: string }[];

      expect(alerts.find((a) => a.type === 'FUEL_PRICE_OUTLIER' && a.vehicleId === outlier.vehicleId)).toMatchObject({
        severity: 'ATTENTION',
      });
      expect(alerts.find((a) => a.type === 'SUPPLY_VOLUME_OUTLIER' && a.vehicleId === outlier.vehicleId)).toMatchObject({
        severity: 'ATTENTION',
      });
      expect(alerts.find((a) => a.type === 'FUEL_PRICE_OUTLIER' && a.vehicleId === normalA.vehicleId)).toBeUndefined();
    });
  });

  // ==========================================================================
  // Caso 18 -- isolamento multi-tenant
  // ==========================================================================
  describe('isolamento multi-tenant', () => {
    it('tenant B nunca ve abastecimentos do tenant A', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolA');
      const v = await setupVehicleWithDriverAndStation(tenantA.adminAuth);
      await createFuelSupply(tenantA.adminAuth, v.vehicleId, v.driverId, v.fuelStationId, 50, 5, 10000, '2026-01-01T10:00:00.000Z');

      const tenantB = await createTenantAndLoginAsAdmin('IsolB');
      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/fuel')
        .set('Authorization', tenantB.adminAuth)
        .expect(200);

      expect(res.body.data.summary.totalCost).toBe(0);
      expect(res.body.data.vehicleBreakdown).toEqual([]);
    });
  });

  // ==========================================================================
  // Caso 19 -- RBAC
  // ==========================================================================
  describe('RBAC', () => {
    it('permite SUPER_ADMIN/ADMIN/MANAGER/OPERATOR/DISPATCHER/AUDITOR; bloqueia DRIVER com 403', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Rbac');

      for (const role of ['MANAGER', 'OPERATOR', 'DISPATCHER', 'AUDITOR']) {
        const auth = await createUserWithRole(tenantId, adminAuth, role);
        await request(app.getHttpServer())
          .get('/api/v1/fleet-operations/fuel')
          .set('Authorization', auth)
          .expect(200);
      }

      await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/fuel')
        .set('Authorization', adminAuth) // SUPER_ADMIN
        .expect(200);

      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/fuel')
        .set('Authorization', driverAuth)
        .expect(403);
    });
  });

  // ==========================================================================
  // Casos 20-22 -- escala pratica (10/25/50 veiculos reais via HTTP e2e).
  // 100 veiculos (caso 23) fica documentado como NAO executado por HTTP e2e
  // real (custo de tempo de CI proibitivo para 100 fixtures completas via
  // requests reais) -- a garantia de O(1) query vem do caso 24 abaixo
  // (contagem real, nao proxy de tempo), que e o que realmente importa para
  // provar ausencia de N+1; a corretude com muitos veiculos ja fica coberta
  // por este teste com 50.
  // ==========================================================================
  describe('escala pratica (multiplos veiculos)', () => {
    it('agrega corretamente com 10, 25 e 50 veiculos reais', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Scale');

      for (const count of [10, 25, 50]) {
        // Cada iteracao acumula sobre o tenant -- reaproveita os veiculos
        // ja criados na iteracao anterior e so adiciona a diferenca, para
        // nao recriar tudo 3x (mais rapido, mesma cobertura).
      }

      let created = 0;
      const targets = [10, 25, 50];
      for (const target of targets) {
        while (created < target) {
          const v = await setupVehicleWithDriverAndStation(adminAuth);
          await createFuelSupply(adminAuth, v.vehicleId, v.driverId, v.fuelStationId, 50, 5, 10000, '2026-01-01T10:00:00.000Z');
          created += 1;
        }

        const res = await request(app.getHttpServer())
          .get('/api/v1/fleet-operations/fuel')
          .set('Authorization', adminAuth)
          .expect(200);

        expect(res.body.data.summary.vehiclesSupplied).toBe(target);
        expect(res.body.data.summary.totalCost).toBe(target * 250);
        expect(res.body.data.vehicleBreakdown).toHaveLength(target);
      }
    }, 60000);
  });

  // ==========================================================================
  // Caso 24 -- verificacao real de ausencia de N+1: conta as queries Prisma
  // efetivamente executadas por GET /fleet-operations/fuel com 10 vs 50
  // veiculos, usando um client Prisma instrumentado via $extends SOMENTE
  // neste TestingModule dedicado (nunca altera prisma.service.ts real).
  // ==========================================================================
  describe('verificacao de ausencia de N+1 (contagem real de queries)', () => {
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
        slug: `fuel-n1-${label.toLowerCase()}-${unique}`,
        admin: {
          name: `Admin ${label}`,
          email: `admin-${label.toLowerCase()}-${unique}@teste.com`,
          password: 'SenhaForte123!',
        },
      };
      const createRes = await request(countingApp.getHttpServer()).post('/api/v1/tenants').send(payload).expect(201);
      const tenantId: string = createRes.body.data.id;
      createdTenantIds.push(tenantId);

      await countingPrisma.userAccount.update({
        where: { tenantId_email: { tenantId, email: payload.admin.email } },
        data: { role: 'SUPER_ADMIN' },
      });

      const loginRes = await request(countingApp.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId, email: payload.admin.email, password: payload.admin.password })
        .expect(200);
      return { tenantId, adminAuth: `Bearer ${loginRes.body.data.accessToken as string}` };
    }

    async function seedVehicleWithSupply(adminAuth: string) {
      const vehicleRes = await request(countingApp.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', adminAuth)
        .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
        .expect(201);
      const vehicleId = vehicleRes.body.data.id as string;

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
      const driverId = driverRes.body.data.id as string;

      const stationRes = await request(countingApp.getHttpServer())
        .post('/api/v1/fuel-stations')
        .set('Authorization', adminAuth)
        .send({ name: `Posto ${randomUUID()}` })
        .expect(201);
      const fuelStationId = stationRes.body.data.id as string;

      await request(countingApp.getHttpServer())
        .post('/api/v1/fuel-supplies')
        .set('Authorization', adminAuth)
        .send({
          vehicleId,
          driverId,
          fuelStationId,
          fuelType: 'DIESEL_S10',
          liters: 50,
          pricePerLiter: 5,
          odometerKm: 10000,
          supplyDate: '2026-01-01T10:00:00.000Z',
        })
        .expect(201);
    }

    it('a contagem de queries de GET /fleet-operations/fuel nao cresce entre 10 e 50 veiculos', async () => {
      const { adminAuth } = await createTenantAndLoginOnCountingApp('N1Check');

      for (let i = 0; i < 10; i += 1) {
        await seedVehicleWithSupply(adminAuth);
      }
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/fleet-operations/fuel')
        .set('Authorization', adminAuth)
        .expect(200);
      const queriesFor10 = queryCount;
      expect(queriesFor10).toBeGreaterThan(0);

      for (let i = 0; i < 40; i += 1) {
        await seedVehicleWithSupply(adminAuth);
      }
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/fleet-operations/fuel')
        .set('Authorization', adminAuth)
        .expect(200);
      const queriesFor50 = queryCount;

      // O(1): a contagem de queries do ENDPOINT em si nao pode crescer com
      // o nº de veiculos -- nunca 1 query por veiculo. Tolerancia de +/-1
      // para diferencas legitimas (ex: a query de Fleet so roda quando ha
      // fleetId presente em algum veiculo).
      expect(queriesFor50).toBeLessThanOrEqual(queriesFor10 + 1);
    }, 120000);
  });
});
