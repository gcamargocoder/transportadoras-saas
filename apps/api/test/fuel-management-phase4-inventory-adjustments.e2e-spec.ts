import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FuelTankMovementType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Gestao de Combustivel, Fase 4 -- inventario/conferencia fisica (estoque
// teorico -> medicao fisica -> divergencia -> ADJUSTMENT opcional) e
// cancelamento seguro de abastecimento interno (estorno via ADJUSTMENT
// compensatorio, nunca edita/apaga o INTERNAL_FUELING original).
describe('Gestao de Combustivel -- Inventario e Ajustes (Fase 4, e2e)', () => {
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
      slug: `fuel-p4-${label.toLowerCase()}-${unique}`,
      admin: {
        name: `Admin ${label}`,
        email: `admin-${label.toLowerCase()}-${unique}@teste.com`,
        password: 'SenhaForte123!',
      },
    };
    const createRes = await request(app.getHttpServer()).post('/api/v1/tenants').send(payload).expect(201);
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
    return `Bearer ${loginRes.body.data.accessToken as string}`;
  }

  async function createTank(auth: string, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/fuel-tanks')
      .set('Authorization', auth)
      .send({ name: 'Tanque matriz', capacityLiters: 15000, initialStockLiters: 7550, ...overrides })
      .expect(201);
    return res.body.data as { id: string; currentStockLiters: number };
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

  // Cria veiculo + motorista + viagem + usuario DRIVER vinculado e logado --
  // mesmo padrao das Fases 3.
  async function setupDriverWithTrip(adminAuth: string, tenantId: string) {
    const vehicleId = await createVehicle(adminAuth);
    const driverId = await createDriver(adminAuth);
    const compositionId = await createComposition(adminAuth, vehicleId);
    const originId = await createLocation(adminAuth, `Origem ${randomUUID()}`);
    const destinationId = await createLocation(adminAuth, `Destino ${randomUUID()}`);

    const tripRes = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', adminAuth)
      .send({
        driverId,
        compositionId,
        originLocationId: originId,
        destinationLocationId: destinationId,
        plannedDeparture: '2026-09-01T08:00:00.000Z',
        plannedArrival: '2026-09-02T18:00:00.000Z',
      })
      .expect(201);
    const tripId = tripRes.body.data.id as string;

    const unique = randomUUID().replace(/-/g, '').slice(0, 10);
    const email = `driver-${unique}@teste.com`;
    const password = 'SenhaForte123!';
    const userRes = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', adminAuth)
      .send({ name: 'Motorista App', email, password, role: 'DRIVER' })
      .expect(201);
    const userAccountId = userRes.body.data.id as string;

    await request(app.getHttpServer())
      .patch(`/api/v1/drivers/${driverId}/user-link`)
      .set('Authorization', adminAuth)
      .send({ userAccountId })
      .expect(200);

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email, password })
      .expect(200);

    return { driverId, vehicleId, tripId, driverAuth: `Bearer ${loginRes.body.data.accessToken as string}` };
  }

  async function registerInternalFueling(driverAuth: string, tripId: string, liters: number, fuelTankId: string) {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/fuel-supplies`)
      .set('Authorization', driverAuth)
      .send({ deviceEventId: randomUUID(), odometerKm: 100300, liters, fuelTankId })
      .expect(201);
    return res.body.data as { id: string; liters: number; fuelTankId: string };
  }

  describe('conferencia fisica -- sem divergencia', () => {
    it('fisico = teorico: registra a conferencia, mas NAO cria movimentacao nem altera o saldo', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('NoDivergence');
      const tank = await createTank(adminAuth, { initialStockLiters: 7550 });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/fuel-tanks/${tank.id}/inventories`)
        .set('Authorization', adminAuth)
        .send({ measuredStockLiters: 7550, applyAdjustment: true })
        .expect(201);

      expect(res.body.data.check.divergenceLiters).toBe(0);
      expect(res.body.data.check.adjusted).toBe(false);
      expect(res.body.data.check.adjustmentMovementId).toBeNull();
      expect(res.body.data.tank.currentStockLiters).toBe(7550);

      const movements = await request(app.getHttpServer())
        .get(`/api/v1/fuel-tanks/${tank.id}/movements`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(movements.body.data.items.some((m: { type: string }) => m.type === 'ADJUSTMENT')).toBe(false);
    });
  });

  describe('conferencia fisica -- divergencia negativa', () => {
    it('fisico < teorico, com ajuste confirmado: cria ADJUSTMENT negativo e reduz o saldo', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('NegativeAdjust');
      const tank = await createTank(adminAuth, { initialStockLiters: 7550 });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/fuel-tanks/${tank.id}/inventories`)
        .set('Authorization', adminAuth)
        .send({ measuredStockLiters: 7480, applyAdjustment: true, notes: 'Vazamento identificado.' })
        .expect(201);

      expect(res.body.data.check.theoreticalStockLiters).toBe(7550);
      expect(res.body.data.check.measuredStockLiters).toBe(7480);
      expect(res.body.data.check.divergenceLiters).toBe(-70);
      expect(res.body.data.check.divergencePercent).toBeCloseTo(-0.9, 5);
      expect(res.body.data.check.adjusted).toBe(true);
      expect(res.body.data.check.adjustmentMovementId).not.toBeNull();
      expect(res.body.data.tank.currentStockLiters).toBe(7480);

      const movements = await request(app.getHttpServer())
        .get(`/api/v1/fuel-tanks/${tank.id}/movements`)
        .set('Authorization', adminAuth)
        .expect(200);
      const adjustment = movements.body.data.items.find((m: { type: string }) => m.type === 'ADJUSTMENT');
      expect(adjustment.quantityLiters).toBe(-70);
      expect(adjustment.previousBalanceLiters).toBe(7550);
      expect(adjustment.newBalanceLiters).toBe(7480);
      expect(adjustment.notes).toBe('Vazamento identificado.');
    });
  });

  describe('conferencia fisica -- divergencia positiva', () => {
    it('fisico > teorico, com ajuste confirmado: cria ADJUSTMENT positivo e aumenta o saldo', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PositiveAdjust');
      const tank = await createTank(adminAuth, { initialStockLiters: 7550 });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/fuel-tanks/${tank.id}/inventories`)
        .set('Authorization', adminAuth)
        .send({ measuredStockLiters: 7620, applyAdjustment: true, notes: 'Recontagem confirmou volume maior.' })
        .expect(201);

      expect(res.body.data.check.divergenceLiters).toBe(70);
      expect(res.body.data.check.divergencePercent).toBeCloseTo(0.9, 5);
      expect(res.body.data.tank.currentStockLiters).toBe(7620);
    });
  });

  describe('conferencia fisica -- divergencia registrada sem ajuste', () => {
    it('applyAdjustment=false: registra a divergencia, mas NAO altera o saldo nem cria movimentacao', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('RecordOnly');
      const tank = await createTank(adminAuth, { initialStockLiters: 7550 });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/fuel-tanks/${tank.id}/inventories`)
        .set('Authorization', adminAuth)
        .send({ measuredStockLiters: 7480, applyAdjustment: false })
        .expect(201);

      expect(res.body.data.check.divergenceLiters).toBe(-70);
      expect(res.body.data.check.adjusted).toBe(false);
      expect(res.body.data.check.adjustmentMovementId).toBeNull();
      expect(res.body.data.tank.currentStockLiters).toBe(7550); // inalterado

      const history = await request(app.getHttpServer())
        .get(`/api/v1/fuel-tanks/${tank.id}/inventories`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(history.body.data.items).toHaveLength(1);
      expect(history.body.data.items[0].adjusted).toBe(false);
    });
  });

  describe('validacoes', () => {
    it('exige motivo (notes) quando applyAdjustment=true', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('RequireNotes');
      const tank = await createTank(adminAuth, { initialStockLiters: 7550 });

      await request(app.getHttpServer())
        .post(`/api/v1/fuel-tanks/${tank.id}/inventories`)
        .set('Authorization', adminAuth)
        .send({ measuredStockLiters: 7480, applyAdjustment: true })
        .expect(400);
    });

    it('rejeita medicao fisica acima da capacidade, mesmo sem pedir ajuste', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('OverCapacity');
      const tank = await createTank(adminAuth, { initialStockLiters: 9000, capacityLiters: 10000 });

      await request(app.getHttpServer())
        .post(`/api/v1/fuel-tanks/${tank.id}/inventories`)
        .set('Authorization', adminAuth)
        .send({ measuredStockLiters: 11000, applyAdjustment: false })
        .expect(409);

      const after = await request(app.getHttpServer()).get(`/api/v1/fuel-tanks/${tank.id}`).set('Authorization', adminAuth).expect(200);
      expect(after.body.data.currentStockLiters).toBe(9000);
    });

    it('rejeita medicao fisica negativa (400)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('NegativeMeasure');
      const tank = await createTank(adminAuth);

      await request(app.getHttpServer())
        .post(`/api/v1/fuel-tanks/${tank.id}/inventories`)
        .set('Authorization', adminAuth)
        .send({ measuredStockLiters: -10, applyAdjustment: false })
        .expect(400);
    });

    it('tanque INACTIVE: registrar-so-conferencia funciona, mas ajustar e rejeitado (409)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('InactiveTank');
      const tank = await createTank(adminAuth, { initialStockLiters: 7550 });
      await request(app.getHttpServer()).patch(`/api/v1/fuel-tanks/${tank.id}/status`).set('Authorization', adminAuth).send({ isActive: false }).expect(200);

      const recordOnly = await request(app.getHttpServer())
        .post(`/api/v1/fuel-tanks/${tank.id}/inventories`)
        .set('Authorization', adminAuth)
        .send({ measuredStockLiters: 7480, applyAdjustment: false })
        .expect(201);
      expect(recordOnly.body.data.check.adjusted).toBe(false);

      await request(app.getHttpServer())
        .post(`/api/v1/fuel-tanks/${tank.id}/inventories`)
        .set('Authorization', adminAuth)
        .send({ measuredStockLiters: 7480, applyAdjustment: true, notes: 'Tentativa em tanque inativo.' })
        .expect(409);
    });

    it('tanque de outro tenant: 404', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('CrossTenantA');
      const tenantB = await createTenantAndLoginAsAdmin('CrossTenantB');
      const tankFromB = await createTank(tenantB.adminAuth);

      await request(app.getHttpServer())
        .post(`/api/v1/fuel-tanks/${tankFromB.id}/inventories`)
        .set('Authorization', tenantA.adminAuth)
        .send({ measuredStockLiters: 100, applyAdjustment: false })
        .expect(404);
    });
  });

  describe('RBAC', () => {
    it('AUDITOR le o historico mas nao pode registrar conferencia (403)', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Rbac');
      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');
      const tank = await createTank(adminAuth);

      await request(app.getHttpServer()).get(`/api/v1/fuel-tanks/${tank.id}/inventories`).set('Authorization', auditorAuth).expect(200);
      await request(app.getHttpServer())
        .post(`/api/v1/fuel-tanks/${tank.id}/inventories`)
        .set('Authorization', auditorAuth)
        .send({ measuredStockLiters: 100, applyAdjustment: false })
        .expect(403);
    });
  });

  describe('concorrencia (secao 14 do pedido)', () => {
    it('conferencia com ajuste concorrente com abastecimento interno -- saldo final consistente com o ledger', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Concurrency');
      const tank = await createTank(adminAuth, { initialStockLiters: 5000, capacityLiters: 10000 });
      const { tripId, driverAuth } = await setupDriverWithTrip(adminAuth, tenantId);

      const checkAttempt = request(app.getHttpServer())
        .post(`/api/v1/fuel-tanks/${tank.id}/inventories`)
        .set('Authorization', adminAuth)
        .send({ measuredStockLiters: 5000, applyAdjustment: true, notes: 'Conferencia de rotina.' });
      const fuelingAttempt = request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/fuel-supplies`)
        .set('Authorization', driverAuth)
        .send({ deviceEventId: randomUUID(), odometerKm: 100300, liters: 300, fuelTankId: tank.id });

      const [checkRes, fuelingRes] = await Promise.all([checkAttempt, fuelingAttempt]);
      expect([200, 201]).toContain(checkRes.status);
      expect(fuelingRes.status).toBe(201);

      // Invariante generico (independe de qual das duas "venceu" a corrida):
      // o saldo final do tanque bate com a soma assinada de TODAS as
      // movimentacoes do ledger -- nunca uma atualizacao perdida.
      const movements = await request(app.getHttpServer())
        .get(`/api/v1/fuel-tanks/${tank.id}/movements`)
        .query({ pageSize: 50 })
        .set('Authorization', adminAuth)
        .expect(200);
      const ledgerSum = movements.body.data.items.reduce((sum: number, m: { type: string; quantityLiters: number }) => {
        if (m.type === 'INTERNAL_FUELING') return sum - m.quantityLiters;
        return sum + m.quantityLiters; // INITIAL_BALANCE/RECEIPT/ADJUSTMENT (delta com sinal)
      }, 0);

      const tankAfter = await request(app.getHttpServer()).get(`/api/v1/fuel-tanks/${tank.id}`).set('Authorization', adminAuth).expect(200);
      expect(tankAfter.body.data.currentStockLiters).toBeCloseTo(ledgerSum, 5);
    });
  });

  describe('cancelamento de abastecimento interno (secao 1/13 do pedido)', () => {
    it('excluir um FuelSupply interno devolve os litros ao tanque via ADJUSTMENT, sem tocar o INTERNAL_FUELING original', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('CancelInternal');
      const tank = await createTank(adminAuth, { initialStockLiters: 7550, capacityLiters: 15000 });
      const { tripId, driverAuth } = await setupDriverWithTrip(adminAuth, tenantId);
      const supply = await registerInternalFueling(driverAuth, tripId, 300, tank.id);

      const afterFueling = await request(app.getHttpServer()).get(`/api/v1/fuel-tanks/${tank.id}`).set('Authorization', adminAuth).expect(200);
      expect(afterFueling.body.data.currentStockLiters).toBe(7250);

      await request(app.getHttpServer()).delete(`/api/v1/fuel-supplies/${supply.id}`).set('Authorization', adminAuth).expect(204);

      const afterCancel = await request(app.getHttpServer()).get(`/api/v1/fuel-tanks/${tank.id}`).set('Authorization', adminAuth).expect(200);
      expect(afterCancel.body.data.currentStockLiters).toBe(7550); // restaurado

      const movements = await request(app.getHttpServer())
        .get(`/api/v1/fuel-tanks/${tank.id}/movements`)
        .set('Authorization', adminAuth)
        .expect(200);
      const original = movements.body.data.items.find((m: { type: string }) => m.type === 'INTERNAL_FUELING');
      expect(original).toBeDefined(); // nunca apagado
      expect(original.quantityLiters).toBe(300); // nunca editado
      expect(original.fuelSupplyId).toBeNull(); // so perde o vinculo (onDelete: SetNull)

      const reversal = movements.body.data.items.find((m: { type: string }) => m.type === 'ADJUSTMENT');
      expect(reversal).toBeDefined();
      expect(reversal.quantityLiters).toBe(300);
      expect(reversal.notes).toContain(supply.id);

      const auditLog = await prisma.auditLog.findFirst({
        where: { tenantId, action: 'fuel_tank.internal_fueling_reversed', entityId: tank.id },
      });
      expect(auditLog).not.toBeNull();
    });

    it('nao permite excluir um FuelSupply interno se o tanque estiver inativo (409), FuelSupply permanece', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('CancelInactive');
      const tank = await createTank(adminAuth, { initialStockLiters: 7550, capacityLiters: 15000 });
      const { tripId, driverAuth } = await setupDriverWithTrip(adminAuth, tenantId);
      const supply = await registerInternalFueling(driverAuth, tripId, 300, tank.id);

      await request(app.getHttpServer()).patch(`/api/v1/fuel-tanks/${tank.id}/status`).set('Authorization', adminAuth).send({ isActive: false }).expect(200);

      await request(app.getHttpServer()).delete(`/api/v1/fuel-supplies/${supply.id}`).set('Authorization', adminAuth).expect(409);

      await request(app.getHttpServer()).get(`/api/v1/fuel-supplies/${supply.id}`).set('Authorization', adminAuth).expect(200);
    });

    it('nao permite excluir se devolver os litros excederia a capacidade do tanque (409), FuelSupply permanece', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('CancelOverCapacity');
      const tank = await createTank(adminAuth, { initialStockLiters: 7550, capacityLiters: 8000 });
      const { tripId, driverAuth } = await setupDriverWithTrip(adminAuth, tenantId);
      const supply = await registerInternalFueling(driverAuth, tripId, 300, tank.id); // saldo: 7250

      // Recebe diesel suficiente para quase encher o tanque -- devolver os
      // 300L do cancelamento nao caberia mais.
      await request(app.getHttpServer())
        .post(`/api/v1/fuel-tanks/${tank.id}/receipts`)
        .set('Authorization', adminAuth)
        .send({ quantityLiters: 700, pricePerLiter: 5 }) // saldo: 7950
        .expect(201);

      await request(app.getHttpServer()).delete(`/api/v1/fuel-supplies/${supply.id}`).set('Authorization', adminAuth).expect(409);

      const tankState = await request(app.getHttpServer()).get(`/api/v1/fuel-tanks/${tank.id}`).set('Authorization', adminAuth).expect(200);
      expect(tankState.body.data.currentStockLiters).toBe(7950); // inalterado pela tentativa
      await request(app.getHttpServer()).get(`/api/v1/fuel-supplies/${supply.id}`).set('Authorization', adminAuth).expect(200);
    });

    it('bloqueia editar os litros de um abastecimento interno (409), mas permite editar outros campos', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('BlockLitersEdit');
      const tank = await createTank(adminAuth, { initialStockLiters: 7550 });
      const { tripId, driverAuth } = await setupDriverWithTrip(adminAuth, tenantId);
      const supply = await registerInternalFueling(driverAuth, tripId, 300, tank.id);

      await request(app.getHttpServer())
        .patch(`/api/v1/fuel-supplies/${supply.id}`)
        .set('Authorization', adminAuth)
        .send({ liters: 400 })
        .expect(409);

      const updateNotes = await request(app.getHttpServer())
        .patch(`/api/v1/fuel-supplies/${supply.id}`)
        .set('Authorization', adminAuth)
        .send({ notes: 'Conferido pelo administrativo.' })
        .expect(200);
      expect(updateNotes.body.data.notes).toBe('Conferido pelo administrativo.');

      const tankState = await request(app.getHttpServer()).get(`/api/v1/fuel-tanks/${tank.id}`).set('Authorization', adminAuth).expect(200);
      expect(tankState.body.data.currentStockLiters).toBe(7250); // inalterado
    });

    it('regressao: excluir um FuelSupply EXTERNO continua funcionando sem tocar nenhum tanque', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ExternalDeleteRegression');
      const tank = await createTank(adminAuth, { initialStockLiters: 7550 });
      const vehicleId = await createVehicle(adminAuth);
      const driverId = await createDriver(adminAuth);
      const station = await request(app.getHttpServer())
        .post('/api/v1/fuel-stations')
        .set('Authorization', adminAuth)
        .send({ name: `Posto ${randomUUID()}` })
        .expect(201);

      const supply = await request(app.getHttpServer())
        .post('/api/v1/fuel-supplies')
        .set('Authorization', adminAuth)
        .send({
          vehicleId,
          driverId,
          fuelStationId: station.body.data.id,
          fuelType: 'DIESEL_S10',
          liters: 200,
          pricePerLiter: 5.5,
          odometerKm: 100000,
          supplyDate: '2026-09-02T10:00:00.000Z',
        })
        .expect(201);

      await request(app.getHttpServer()).delete(`/api/v1/fuel-supplies/${supply.body.data.id}`).set('Authorization', adminAuth).expect(204);

      const tankState = await request(app.getHttpServer()).get(`/api/v1/fuel-tanks/${tank.id}`).set('Authorization', adminAuth).expect(200);
      expect(tankState.body.data.currentStockLiters).toBe(7550); // nunca tocado
      expect(await prisma.fuelTankMovement.count({ where: { tankId: tank.id, type: FuelTankMovementType.ADJUSTMENT } })).toBe(0);
    });
  });
});
