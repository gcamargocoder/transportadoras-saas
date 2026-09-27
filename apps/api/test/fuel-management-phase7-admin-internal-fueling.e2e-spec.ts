import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Gestao de Combustivel, Fase 7 -- fechamento do ciclo: o administrativo
// (POST /fuel-supplies) passa a aceitar fuelTankId, gerando exatamente a
// MESMA operacao atomica (FuelSupply + FuelTankMovement(INTERNAL_FUELING) +
// baixa do tanque) ja usada pelo Driver App (createFromDriverApp, Fase 3),
// via a mesma FuelTanksService.registerInternalFueling -- nenhum ledger/
// motor de saldo paralelo. Cobre: interno/externo administrativo, exclusao
// mutua fuelTankId x fuelStationId, preco opcional so quando interno,
// isolamento multi-tenant, concorrencia, reversao e edicao protegida --
// exatamente as mesmas garantias ja validadas para o Driver App na Fase 3.
describe('Gestao de Combustivel -- Fechamento do Ciclo (Fase 7, e2e)', () => {
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
      slug: `fuel-p7-${label.toLowerCase()}-${unique}`,
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

  async function createVehicle(auth: string, odometerKm = 100000) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/vehicles')
      .set('Authorization', auth)
      .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT', odometerKm })
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

  async function createFuelTank(auth: string, overrides: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/fuel-tanks')
      .set('Authorization', auth)
      .send({ name: 'Tanque matriz', capacityLiters: 15000, initialStockLiters: 1000, ...overrides })
      .expect(201);
    return res.body.data as { id: string; currentStockLiters: number };
  }

  async function createFuelStation(auth: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/fuel-stations')
      .set('Authorization', auth)
      .send({ name: `Posto ${randomUUID()}` })
      .expect(201);
    return res.body.data.id as string;
  }

  function supplyPayload(overrides: Record<string, unknown> = {}) {
    return {
      fuelType: 'DIESEL_S10',
      liters: 100,
      odometerKm: 100500,
      supplyDate: new Date().toISOString(),
      ...overrides,
    };
  }

  async function getTank(auth: string, id: string) {
    const res = await request(app.getHttpServer()).get(`/api/v1/fuel-tanks/${id}`).set('Authorization', auth).expect(200);
    return res.body.data as { currentStockLiters: number; status: string };
  }

  describe('abastecimento interno administrativo', () => {
    it('cria FuelSupply + FuelTankMovement(INTERNAL_FUELING) + baixa do tanque numa unica operacao', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('Interno');
      const tank = await createFuelTank(auth, { initialStockLiters: 1000 });
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);

      const res = await request(app.getHttpServer())
        .post('/api/v1/fuel-supplies')
        .set('Authorization', auth)
        .send(supplyPayload({ vehicleId, driverId, fuelTankId: tank.id, liters: 300 }))
        .expect(201);

      expect(res.body.data.fuelTankId).toBe(tank.id);
      expect(res.body.data.fuelStationId).toBeNull();
      expect(res.body.data.pricePerLiter).toBe(0);
      expect(res.body.data.totalAmount).toBe(0);
      expect(res.body.data.source).toBe('ADMIN');

      const updatedTank = await getTank(auth, tank.id);
      expect(updatedTank.currentStockLiters).toBe(700);

      const movements = await request(app.getHttpServer())
        .get(`/api/v1/fuel-tanks/${tank.id}/movements`)
        .set('Authorization', auth)
        .expect(200);
      const internal = movements.body.data.items.find((m: { type: string }) => m.type === 'INTERNAL_FUELING');
      expect(internal).toMatchObject({ quantityLiters: 300, newBalanceLiters: 700 });
    });

    it('aceita pricePerLiter explicito no abastecimento interno (nao forca sempre 0)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('InternoComPreco');
      const tank = await createFuelTank(auth, { initialStockLiters: 1000 });
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);
      const res = await request(app.getHttpServer())
        .post('/api/v1/fuel-supplies')
        .set('Authorization', auth)
        .send(supplyPayload({ vehicleId, driverId, fuelTankId: tank.id, liters: 100, pricePerLiter: 5 }))
        .expect(201);
      expect(res.body.data.pricePerLiter).toBe(5);
      expect(res.body.data.totalAmount).toBe(500);
    });

    it('rejeita fuelTankId + fuelStationId juntos (origens mutuamente exclusivas)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('Exclusividade');
      const tank = await createFuelTank(auth);
      const station = await createFuelStation(auth);
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);
      await request(app.getHttpServer())
        .post('/api/v1/fuel-supplies')
        .set('Authorization', auth)
        .send(supplyPayload({ vehicleId, driverId, fuelTankId: tank.id, fuelStationId: station, pricePerLiter: 5 }))
        .expect(400);
    });

    it('tanque com estoque insuficiente: rejeita e nao cria o FuelSupply (rollback)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('SemEstoque');
      const tank = await createFuelTank(auth, { initialStockLiters: 50 });
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);
      await request(app.getHttpServer())
        .post('/api/v1/fuel-supplies')
        .set('Authorization', auth)
        .send(supplyPayload({ vehicleId, driverId, fuelTankId: tank.id, liters: 500 }))
        .expect(409);

      const stillFull = await getTank(auth, tank.id);
      expect(stillFull.currentStockLiters).toBe(50);
      const list = await request(app.getHttpServer()).get('/api/v1/fuel-supplies').set('Authorization', auth).expect(200);
      expect(list.body.data.items).toHaveLength(0);
    });

    it('tanque inativo: rejeita o abastecimento interno', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('TanqueInativo');
      const tank = await createFuelTank(auth, { initialStockLiters: 1000 });
      await request(app.getHttpServer())
        .patch(`/api/v1/fuel-tanks/${tank.id}/status`)
        .set('Authorization', auth)
        .send({ isActive: false })
        .expect(200);
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);
      await request(app.getHttpServer())
        .post('/api/v1/fuel-supplies')
        .set('Authorization', auth)
        .send(supplyPayload({ vehicleId, driverId, fuelTankId: tank.id, liters: 100 }))
        .expect(409);
    });

    it('cross-tenant: fuelTankId de outro tenant retorna 404, nunca vaza dado de outra empresa', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('CrossA');
      const tenantB = await createTenantAndLoginAsAdmin('CrossB');
      const tankB = await createFuelTank(tenantB.auth, { initialStockLiters: 1000 });
      const vehicleId = await createVehicle(tenantA.auth);
      const driverId = await createDriver(tenantA.auth);
      await request(app.getHttpServer())
        .post('/api/v1/fuel-supplies')
        .set('Authorization', tenantA.auth)
        .send(supplyPayload({ vehicleId, driverId, fuelTankId: tankB.id, liters: 100 }))
        .expect(404);
    });

    it('cross-tenant: veiculo/motorista de outro tenant nunca passam mesmo com fuelTankId valido', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('CrossVeiculoA');
      const tenantB = await createTenantAndLoginAsAdmin('CrossVeiculoB');
      const tank = await createFuelTank(tenantA.auth, { initialStockLiters: 1000 });
      const vehicleB = await createVehicle(tenantB.auth);
      const driverB = await createDriver(tenantB.auth);
      const driverA = await createDriver(tenantA.auth);
      const vehicleA = await createVehicle(tenantA.auth);

      await request(app.getHttpServer())
        .post('/api/v1/fuel-supplies')
        .set('Authorization', tenantA.auth)
        .send(supplyPayload({ vehicleId: vehicleB, driverId: driverA, fuelTankId: tank.id, liters: 100 }))
        .expect(404);
      await request(app.getHttpServer())
        .post('/api/v1/fuel-supplies')
        .set('Authorization', tenantA.auth)
        .send(supplyPayload({ vehicleId: vehicleA, driverId: driverB, fuelTankId: tank.id, liters: 100 }))
        .expect(404);

      // tanque de A nao foi debitado por nenhuma das tentativas rejeitadas.
      const stillFull = await getTank(tenantA.auth, tank.id);
      expect(stillFull.currentStockLiters).toBe(1000);
    });

    it('concorrencia: duas requisicoes simultaneas so uma consegue quando o estoque so cobre uma', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('Concorrencia');
      const tank = await createFuelTank(auth, { initialStockLiters: 300 });
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);

      const attempt = () =>
        request(app.getHttpServer())
          .post('/api/v1/fuel-supplies')
          .set('Authorization', auth)
          .send(supplyPayload({ vehicleId, driverId, fuelTankId: tank.id, liters: 300 }));

      const [first, second] = await Promise.all([attempt(), attempt()]);
      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([201, 409]);

      const finalTank = await getTank(auth, tank.id);
      expect(finalTank.currentStockLiters).toBe(0);
      const list = await request(app.getHttpServer()).get('/api/v1/fuel-supplies').set('Authorization', auth).expect(200);
      expect(list.body.data.items).toHaveLength(1);
    });
  });

  describe('abastecimento externo administrativo', () => {
    it('sem fuelTankId: cria FuelSupply normalmente e nunca toca no tanque', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('Externo');
      const tank = await createFuelTank(auth, { initialStockLiters: 1000 });
      const station = await createFuelStation(auth);
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);

      const res = await request(app.getHttpServer())
        .post('/api/v1/fuel-supplies')
        .set('Authorization', auth)
        .send(supplyPayload({ vehicleId, driverId, fuelStationId: station, pricePerLiter: 6, liters: 200 }))
        .expect(201);
      expect(res.body.data.fuelTankId).toBeNull();
      expect(res.body.data.source).toBe('ADMIN');

      const unchangedTank = await getTank(auth, tank.id);
      expect(unchangedTank.currentStockLiters).toBe(1000);
    });

    it('externo sem posto conhecido (equipamento nao cadastrado): fuelStationId opcional', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('SemPosto');
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);
      const res = await request(app.getHttpServer())
        .post('/api/v1/fuel-supplies')
        .set('Authorization', auth)
        .send(supplyPayload({ vehicleId, driverId, pricePerLiter: 6, liters: 50 }))
        .expect(201);
      expect(res.body.data.fuelStationId).toBeNull();
      expect(res.body.data.fuelTankId).toBeNull();
    });

    it('externo sem pricePerLiter: rejeitado (obrigatorio quando nao ha tanque)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('ExternoSemPreco');
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);
      await request(app.getHttpServer())
        .post('/api/v1/fuel-supplies')
        .set('Authorization', auth)
        .send(supplyPayload({ vehicleId, driverId, liters: 50 }))
        .expect(400);
    });
  });

  describe('reversao e edicao protegida (unificado com o Driver App)', () => {
    it('excluir um abastecimento interno ADMINISTRATIVO devolve os litros ao tanque (mesmo estorno do Driver App)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('Reversao');
      const tank = await createFuelTank(auth, { initialStockLiters: 1000 });
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);
      const created = await request(app.getHttpServer())
        .post('/api/v1/fuel-supplies')
        .set('Authorization', auth)
        .send(supplyPayload({ vehicleId, driverId, fuelTankId: tank.id, liters: 400 }))
        .expect(201);
      expect((await getTank(auth, tank.id)).currentStockLiters).toBe(600);

      await request(app.getHttpServer())
        .delete(`/api/v1/fuel-supplies/${created.body.data.id}`)
        .set('Authorization', auth)
        .expect(204);

      expect((await getTank(auth, tank.id)).currentStockLiters).toBe(1000);
      const movements = await request(app.getHttpServer())
        .get(`/api/v1/fuel-tanks/${tank.id}/movements`)
        .set('Authorization', auth)
        .expect(200);
      const adjustment = movements.body.data.items.find((m: { type: string }) => m.type === 'ADJUSTMENT');
      expect(adjustment).toMatchObject({ quantityLiters: 400 });
      const internalStillThere = movements.body.data.items.find((m: { type: string }) => m.type === 'INTERNAL_FUELING');
      expect(internalStillThere).toBeTruthy(); // o movimento original nunca e apagado/editado
    });

    it('nao permite alterar litros de um abastecimento interno administrativo', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('EdicaoLitros');
      const tank = await createFuelTank(auth, { initialStockLiters: 1000 });
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);
      const created = await request(app.getHttpServer())
        .post('/api/v1/fuel-supplies')
        .set('Authorization', auth)
        .send(supplyPayload({ vehicleId, driverId, fuelTankId: tank.id, liters: 200 }))
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/fuel-supplies/${created.body.data.id}`)
        .set('Authorization', auth)
        .send({ liters: 999 })
        .expect(409);
    });

    it('nao permite definir fuelStationId num abastecimento interno existente (nunca as duas origens ao mesmo tempo)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('EdicaoPosto');
      const tank = await createFuelTank(auth, { initialStockLiters: 1000 });
      const station = await createFuelStation(auth);
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);
      const created = await request(app.getHttpServer())
        .post('/api/v1/fuel-supplies')
        .set('Authorization', auth)
        .send(supplyPayload({ vehicleId, driverId, fuelTankId: tank.id, liters: 200 }))
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/fuel-supplies/${created.body.data.id}`)
        .set('Authorization', auth)
        .send({ fuelStationId: station })
        .expect(409);
    });

    it('nao permite enviar fuelTankId na edicao (estrutural, imutavel)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('EdicaoTankId');
      const station = await createFuelStation(auth);
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);
      const created = await request(app.getHttpServer())
        .post('/api/v1/fuel-supplies')
        .set('Authorization', auth)
        .send(supplyPayload({ vehicleId, driverId, fuelStationId: station, pricePerLiter: 5 }))
        .expect(201);
      const tank = await createFuelTank(auth, { initialStockLiters: 1000 });
      await request(app.getHttpServer())
        .patch(`/api/v1/fuel-supplies/${created.body.data.id}`)
        .set('Authorization', auth)
        .send({ fuelTankId: tank.id })
        .expect(400); // forbidNonWhitelisted -- campo nao existe no DTO de update
    });
  });

  describe('origem e filtros do historico', () => {
    it('source deriva de deviceEventId: ADMIN quando ausente; filtro por source e fuelTankId funcionam', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('Origem');
      const tank = await createFuelTank(auth, { initialStockLiters: 1000 });
      const station = await createFuelStation(auth);
      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);

      await request(app.getHttpServer())
        .post('/api/v1/fuel-supplies')
        .set('Authorization', auth)
        .send(supplyPayload({ vehicleId, driverId, fuelTankId: tank.id, liters: 100 }))
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/fuel-supplies')
        .set('Authorization', auth)
        .send(supplyPayload({ vehicleId, driverId, fuelStationId: station, pricePerLiter: 5, liters: 50 }))
        .expect(201);

      const bySource = await request(app.getHttpServer())
        .get('/api/v1/fuel-supplies?source=ADMIN')
        .set('Authorization', auth)
        .expect(200);
      expect(bySource.body.data.items).toHaveLength(2);
      expect(bySource.body.data.items.every((i: { source: string }) => i.source === 'ADMIN')).toBe(true);

      const byDriverApp = await request(app.getHttpServer())
        .get('/api/v1/fuel-supplies?source=DRIVER_APP')
        .set('Authorization', auth)
        .expect(200);
      expect(byDriverApp.body.data.items).toHaveLength(0);

      const byTank = await request(app.getHttpServer())
        .get(`/api/v1/fuel-supplies?fuelTankId=${tank.id}`)
        .set('Authorization', auth)
        .expect(200);
      expect(byTank.body.data.items).toHaveLength(1);
      expect(byTank.body.data.items[0].fuelTankId).toBe(tank.id);
    });
  });
});
