import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FuelTankMovementType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { FuelTanksService } from '../src/fuel-tanks/services/fuel-tanks.service';
import { runSerializable } from '../src/tenants/utils/plan-limit.util';

// Fase 6 -- Gestao de Combustivel: Fundacao do BI. Cobre a extensao da
// camada de KPIs (mesmos /bi/kpis/summary|series|breakdown|:kpiId/evidence
// da Fase BI 1, nenhum endpoint novo) com o ledger do tanque proprio
// (FuelTankMovement/FuelTankInventoryCheck): valores basicos via os
// endpoints reais de recebimento/conferencia, reconstrucao do saldo num
// PONTO NO TEMPO (nunca uma soma de fluxo), sinal preservado em ajustes,
// isolamento multi-tenant, quebra por tanque/veiculo e o caso defensivo de
// abastecimento interno sem veiculo.
describe('Gestao de Combustivel -- BI (Fase 6, e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fuelTanksService: FuelTanksService;
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    fuelTanksService = app.get(FuelTanksService);
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

  async function createTenantAndLoginAsAdmin(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    const payload = {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `bi-fuel-${label.toLowerCase()}-${unique}`,
      admin: { name: `Admin ${label}`, email: `admin-${label.toLowerCase()}-${unique}@teste.com`, password: 'SenhaForte123!' },
    };
    const createRes = await request(app.getHttpServer()).post('/api/v1/tenants').send(payload).expect(201);
    const tenantId: string = createRes.body.data.id;
    createdTenantIds.push(tenantId);
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email: payload.admin.email, password: payload.admin.password })
      .expect(200);
    const auth = `Bearer ${loginRes.body.data.accessToken as string}`;
    const usersRes = await request(app.getHttpServer()).get('/api/v1/users').set('Authorization', auth).expect(200);
    const userId: string = usersRes.body.data[0].id;
    return { tenantId, auth, userId };
  }

  async function post(auth: string, path: string, body: Record<string, unknown>) {
    const res = await request(app.getHttpServer()).post(`/api/v1${path}`).set('Authorization', auth).send(body).expect(201);
    return res.body.data.id as string;
  }

  async function createTank(auth: string, overrides: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/fuel-tanks')
      .set('Authorization', auth)
      .send({ name: 'Tanque matriz', capacityLiters: 20000, initialStockLiters: 1000, ...overrides })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createReceipt(auth: string, tankId: string, quantityLiters: number, pricePerLiter: number, receivedAt?: string) {
    await request(app.getHttpServer())
      .post(`/api/v1/fuel-tanks/${tankId}/receipts`)
      .set('Authorization', auth)
      .send({ quantityLiters, pricePerLiter, ...(receivedAt ? { receivedAt } : {}) })
      .expect(201);
  }

  async function createVehicle(auth: string) {
    const fleetId = await post(auth, '/fleets', { name: `Frota ${randomUUID()}`, type: 'OWN' });
    return post(auth, '/vehicles', { plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT', fleetId, odometerKm: 1000 });
  }

  // Seeding direto do ledger via applyMovement (privado) -- mesmo padrao ja
  // usado em fuel-tanks.e2e-spec.ts (teste de concorrencia da Fase 1) para
  // cobrir tipos/datas que os endpoints publicos nao expoem diretamente
  // (INTERNAL_FUELING sem passar pelo fluxo do Driver App/viagem, e datas
  // arbitrarias no passado/futuro para testar reconstrucao historica).
  function rawApplyMovement(tenantId: string, userId: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apply = (fuelTanksService as any).applyMovement.bind(fuelTanksService);
    return (
      tankId: string,
      type: FuelTankMovementType,
      quantityLiters: number,
      extra: { vehicleId?: string; effectiveDate?: Date; notes?: string } = {},
    ) => runSerializable(prisma, (tx) => apply(tx, tenantId, tankId, type, quantityLiters, { userId }, extra));
  }

  function getSummary(auth: string, query: Record<string, string>) {
    return request(app.getHttpServer()).get('/api/v1/bi/kpis/summary').query(query).set('Authorization', auth);
  }

  interface KpiBody {
    id: string;
    status: string;
    value: number | null;
    unavailableReason: string | null;
    evidence: { source: string; recordCount: number }[];
  }

  function kpi(body: { data: { kpis: KpiBody[] } }, id: string): KpiBody {
    const found = body.data.kpis.find((k) => k.id === id);
    if (!found) throw new Error(`KPI ${id} ausente`);
    return found;
  }

  const FUEL_KPIS =
    'fuel_tank_stock,fuel_received_liters,fuel_received_cost,fuel_average_purchase_price,' +
    'fuel_internal_liters,fuel_adjustment_liters,fuel_movements_count,fuel_reconciliation_divergence_liters';

  // --------------------------------------------------------------------------

  describe('valores basicos via endpoints reais (recebimento, conferencia, abastecimento interno)', () => {
    it('recebimentos, ajuste e abastecimento interno compoem os 8 KPIs corretamente', async () => {
      const { tenantId, auth, userId } = await createTenantAndLoginAsAdmin('Basico');
      const tankId = await createTank(auth, { initialStockLiters: 1000 });
      const vehicleId = await createVehicle(auth);

      await createReceipt(auth, tankId, 500, 5.0); // +500 L, R$2500
      await createReceipt(auth, tankId, 300, 6.0); // +300 L, R$1800
      // total recebido: 800 L, R$4300 -- preco medio ponderado 4300/800=5.375

      const apply = rawApplyMovement(tenantId, userId);
      await apply(tankId, FuelTankMovementType.INTERNAL_FUELING, 200, { vehicleId }); // -200 L
      await apply(tankId, FuelTankMovementType.ADJUSTMENT, -50, { notes: 'Divergencia de teste' }); // -50 L

      // saldo esperado: 1000 + 500 + 300 - 200 - 50 = 1550
      const today = new Date().toISOString().slice(0, 10);
      const res = await getSummary(auth, { startDate: today, endDate: today, tankId, kpis: FUEL_KPIS, comparison: 'NONE' }).expect(200);

      expect(kpi(res.body, 'fuel_tank_stock').value).toBe(1550);
      expect(kpi(res.body, 'fuel_received_liters').value).toBe(800);
      expect(kpi(res.body, 'fuel_received_cost').value).toBe(4300);
      expect(kpi(res.body, 'fuel_average_purchase_price').value).toBeCloseTo(5.375, 5);
      expect(kpi(res.body, 'fuel_internal_liters').value).toBe(200);
      expect(kpi(res.body, 'fuel_adjustment_liters').value).toBe(-50);
      expect(kpi(res.body, 'fuel_movements_count').value).toBe(4); // exclui INITIAL_BALANCE
      expect(kpi(res.body, 'fuel_reconciliation_divergence_liters').value).toBe(0); // via applyMovement direto, sem FuelTankInventoryCheck

      expect(kpi(res.body, 'fuel_received_liters').evidence).toEqual([expect.objectContaining({ source: 'FUEL_TANK_RECEIPT', recordCount: 2 })]);
    });

    it('conferencia de estoque real (POST /inventories) gera divergencia positiva e fica refletida no BI', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('Conferencia');
      const tankId = await createTank(auth, { initialStockLiters: 1000 });

      await request(app.getHttpServer())
        .post(`/api/v1/fuel-tanks/${tankId}/inventories`)
        .set('Authorization', auth)
        .send({ measuredStockLiters: 1080, applyAdjustment: true, notes: 'Sobra apos calibragem do medidor' })
        .expect(201);

      const today = new Date().toISOString().slice(0, 10);
      const res = await getSummary(auth, {
        startDate: today,
        endDate: today,
        tankId,
        kpis: 'fuel_tank_stock,fuel_adjustment_liters,fuel_reconciliation_divergence_liters',
        comparison: 'NONE',
      }).expect(200);

      expect(kpi(res.body, 'fuel_tank_stock').value).toBe(1080);
      expect(kpi(res.body, 'fuel_adjustment_liters').value).toBe(80);
      expect(kpi(res.body, 'fuel_reconciliation_divergence_liters').value).toBe(80);
      expect(kpi(res.body, 'fuel_reconciliation_divergence_liters').evidence).toEqual([
        expect.objectContaining({ source: 'FUEL_TANK_INVENTORY_CHECK', recordCount: 1 }),
      ]);
    });

    it('sem nenhum recebimento com preco: fuel_average_purchase_price fica UNAVAILABLE, nunca 0', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('SemPreco');
      const tankId = await createTank(auth, { initialStockLiters: 1000 });
      const today = new Date().toISOString().slice(0, 10);
      const res = await getSummary(auth, { startDate: today, endDate: today, tankId, kpis: 'fuel_average_purchase_price', comparison: 'NONE' }).expect(
        200,
      );
      expect(kpi(res.body, 'fuel_average_purchase_price').status).toBe('UNAVAILABLE');
      expect(kpi(res.body, 'fuel_average_purchase_price').value).toBeNull();
    });
  });

  describe('reconstrucao do saldo num ponto no tempo (nunca soma de fluxo)', () => {
    it('estoque no fim do periodo reflete so as movimentacoes ate a data -- recebimento futuro nunca conta antecipadamente', async () => {
      const { tenantId, auth, userId } = await createTenantAndLoginAsAdmin('Historico');
      const tankId = await createTank(auth, { initialStockLiters: 1000 });
      const apply = rawApplyMovement(tenantId, userId);

      const now = new Date();
      const inThreeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      await apply(tankId, FuelTankMovementType.RECEIPT, 500, { effectiveDate: now }); // conta nos dois periodos
      await apply(tankId, FuelTankMovementType.RECEIPT, 800, { effectiveDate: inThreeDays }); // so no periodo 2

      const dayStr = (d: Date) => d.toISOString().slice(0, 10);
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const inFiveDays = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

      const period1 = await getSummary(auth, { startDate: dayStr(yesterday), endDate: dayStr(tomorrow), tankId, kpis: 'fuel_tank_stock', comparison: 'NONE' }).expect(200);
      expect(kpi(period1.body, 'fuel_tank_stock').value).toBe(1500); // 1000 + 500, receipt futuro (inThreeDays) fora do periodo

      const period2 = await getSummary(auth, { startDate: dayStr(yesterday), endDate: dayStr(inFiveDays), tankId, kpis: 'fuel_tank_stock', comparison: 'NONE' }).expect(200);
      expect(kpi(period2.body, 'fuel_tank_stock').value).toBe(2300); // 1000 + 500 + 800, agora dentro do periodo
    });

    it('tanque criado depois do fim do periodo fica UNAVAILABLE no escopo (nunca soma 0)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('TanqueFuturo');
      const tankId = await createTank(auth, { initialStockLiters: 1000 });
      const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const res = await getSummary(auth, { startDate: past, endDate: past, tankId, kpis: 'fuel_tank_stock', comparison: 'NONE' }).expect(200);
      expect(kpi(res.body, 'fuel_tank_stock').status).toBe('UNAVAILABLE');
      expect(kpi(res.body, 'fuel_tank_stock').value).toBeNull();
    });
  });

  describe('isolamento multi-tenant', () => {
    it('summary/breakdown/evidence de um tenant nunca enxergam o tanque de outro', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsoA');
      const tenantB = await createTenantAndLoginAsAdmin('IsoB');
      const tankA = await createTank(tenantA.auth, { initialStockLiters: 1000 });
      const tankB = await createTank(tenantB.auth, { initialStockLiters: 9000 });
      await createReceipt(tenantB.auth, tankB, 1000, 5);

      const today = new Date().toISOString().slice(0, 10);
      // tenantId de A tentando ver o tanque de B -- 404 (nunca revela o id de outro tenant).
      await getSummary(tenantA.auth, { startDate: today, endDate: today, tankId: tankB, kpis: 'fuel_tank_stock', comparison: 'NONE' }).expect(404);

      const summaryA = await getSummary(tenantA.auth, { startDate: today, endDate: today, kpis: 'fuel_tank_stock,fuel_received_liters', comparison: 'NONE' }).expect(200);
      expect(kpi(summaryA.body, 'fuel_tank_stock').value).toBe(1000); // so o proprio tanque, nunca o de B
      expect(kpi(summaryA.body, 'fuel_received_liters').value).toBe(0);

      const breakdownA = await request(app.getHttpServer())
        .get('/api/v1/bi/kpis/breakdown')
        .query({ startDate: today, endDate: today, kpiId: 'fuel_tank_stock', dimension: 'tank', limit: 10 })
        .set('Authorization', tenantA.auth)
        .expect(200);
      expect(breakdownA.body.data.items.map((i: { key: string }) => i.key)).toEqual([tankA]);
    });
  });

  describe('quebra por tanque e por veiculo', () => {
    it('breakdown x tank: soma dos itens = total (estoque somado entre tanques no mesmo instante e valido)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('QuebraTanque');
      const tank1 = await createTank(auth, { name: 'Tanque 1', initialStockLiters: 1000 });
      const tank2 = await createTank(auth, { name: 'Tanque 2', initialStockLiters: 2000 });
      const today = new Date().toISOString().slice(0, 10);

      const res = await request(app.getHttpServer())
        .get('/api/v1/bi/kpis/breakdown')
        .query({ startDate: today, endDate: today, kpiId: 'fuel_tank_stock', dimension: 'tank', limit: 10 })
        .set('Authorization', auth)
        .expect(200);
      const items = res.body.data.items as { key: string; value: number }[];
      expect(items.find((i) => i.key === tank1)).toMatchObject({ value: 1000 });
      expect(items.find((i) => i.key === tank2)).toMatchObject({ value: 2000 });
      expect(res.body.data.total).toBe(3000);
    });

    it('breakdown x vehicle de fuel_internal_liters: abastecimento sem veiculo (caso defensivo) vira "Sem veiculo", nunca some do total', async () => {
      const { tenantId, auth, userId } = await createTenantAndLoginAsAdmin('SemVeiculo');
      const tankId = await createTank(auth, { initialStockLiters: 5000 });
      const vehicleId = await createVehicle(auth);
      const apply = rawApplyMovement(tenantId, userId);
      await apply(tankId, FuelTankMovementType.INTERNAL_FUELING, 150, { vehicleId });
      await apply(tankId, FuelTankMovementType.INTERNAL_FUELING, 90, {}); // sem vehicleId -- caso defensivo

      const today = new Date().toISOString().slice(0, 10);
      const res = await request(app.getHttpServer())
        .get('/api/v1/bi/kpis/breakdown')
        .query({ startDate: today, endDate: today, kpiId: 'fuel_internal_liters', dimension: 'vehicle', limit: 10 })
        .set('Authorization', auth)
        .expect(200);
      const items = res.body.data.items as { key: string | null; label: string; value: number }[];
      expect(items.find((i) => i.key === vehicleId)).toMatchObject({ value: 150 });
      expect(items.find((i) => i.key === null && i.label === 'Sem veiculo')).toMatchObject({ value: 90 });
      expect(res.body.data.total).toBe(240);
    });
  });

  describe('recorte por dimensao nao suportada', () => {
    it('fuel_tank_stock nao aceita recorte por veiculo: fica UNAVAILABLE, nunca ignora o filtro silenciosamente', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('DimNaoSuportada');
      const tankId = await createTank(auth, { initialStockLiters: 1000 });
      const vehicleId = await createVehicle(auth);
      const today = new Date().toISOString().slice(0, 10);
      const res = await getSummary(auth, { startDate: today, endDate: today, tankId, vehicleId, kpis: 'fuel_tank_stock', comparison: 'NONE' }).expect(200);
      expect(kpi(res.body, 'fuel_tank_stock').status).toBe('UNAVAILABLE');
      expect(kpi(res.body, 'fuel_tank_stock').unavailableReason).toMatch(/veiculo/i);
    });

    it('fuel_cost (FuelSupply) nao aceita recorte por tanque', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('DimTanqueEmFuelCost');
      const tankId = await createTank(auth, { initialStockLiters: 1000 });
      const today = new Date().toISOString().slice(0, 10);
      const res = await getSummary(auth, { startDate: today, endDate: today, tankId, kpis: 'fuel_cost', comparison: 'NONE' }).expect(200);
      expect(kpi(res.body, 'fuel_cost').status).toBe('UNAVAILABLE');
      expect(kpi(res.body, 'fuel_cost').unavailableReason).toMatch(/tanque/i);
    });
  });
});
