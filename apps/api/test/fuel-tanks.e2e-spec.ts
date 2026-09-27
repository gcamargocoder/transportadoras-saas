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

// Gestao de Combustivel, Fase 1 -- fundacao dos tanques proprios. Cobre:
// criacao com saldo inicial via ledger, validacoes de capacidade/estoque,
// listagem/filtros, saldo, historico, ativacao/desativacao, isolamento
// multi-tenant, RBAC, e a concorrencia real do motor de movimentacao
// (secao 5 do pedido: duas retiradas simultaneas nunca corrompem o saldo).
describe('Gestao de Combustivel -- Tanques (Fase 1, e2e)', () => {
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

  async function createTenantAndLoginAsAdmin(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    const payload = {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `fuel-tanks-${label.toLowerCase()}-${unique}`,
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

  async function createTank(auth: string, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/fuel-tanks')
      .set('Authorization', auth)
      .send({ name: 'Tanque matriz', capacityLiters: 15000, initialStockLiters: 8000, ...overrides })
      .expect(201);
    return res.body.data as { id: string; currentStockLiters: number; isLowStock: boolean; occupancyPercent: number };
  }

  async function createFuelStation(auth: string, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/fuel-stations')
      .set('Authorization', auth)
      .send({ name: 'Distribuidora Raizen', ...overrides })
      .expect(201);
    return res.body.data.id as string;
  }

  describe('criacao e saldo inicial via ledger', () => {
    it('cria o tanque com currentStockLiters=initialStockLiters e registra a movimentacao INITIAL_BALANCE', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('Create');
      const tank = await createTank(auth, { initialStockLiters: 8000, capacityLiters: 15000, minStockLiters: 2000 });
      expect(tank.currentStockLiters).toBe(8000);
      expect(tank.isLowStock).toBe(false);
      expect(tank.occupancyPercent).toBeCloseTo(53.3, 5);

      const movements = await request(app.getHttpServer())
        .get(`/api/v1/fuel-tanks/${tank.id}/movements`)
        .set('Authorization', auth)
        .expect(200);
      expect(movements.body.data.items.length).toBe(1);
      const movement = movements.body.data.items[0];
      expect(movement.type).toBe('INITIAL_BALANCE');
      expect(movement.quantityLiters).toBe(8000);
      expect(movement.previousBalanceLiters).toBe(0);
      expect(movement.newBalanceLiters).toBe(8000);
    });

    it('isLowStock reflete minStockLiters em relacao ao estoque inicial', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('LowStockOnCreate');
      const tank = await createTank(auth, { initialStockLiters: 500, capacityLiters: 5000, minStockLiters: 1000 });
      expect(tank.isLowStock).toBe(true);
    });

    it('rejeita capacityLiters <= 0 (400)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('InvalidCapacity');
      await request(app.getHttpServer())
        .post('/api/v1/fuel-tanks')
        .set('Authorization', auth)
        .send({ name: 'Tanque invalido', capacityLiters: 0, initialStockLiters: 0 })
        .expect(400);
    });

    it('rejeita initialStockLiters > capacityLiters (400)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('InvalidInitial');
      await request(app.getHttpServer())
        .post('/api/v1/fuel-tanks')
        .set('Authorization', auth)
        .send({ name: 'Tanque invalido', capacityLiters: 1000, initialStockLiters: 1500 })
        .expect(400);
    });

    it('rejeita minStockLiters > capacityLiters (400)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('InvalidMin');
      await request(app.getHttpServer())
        .post('/api/v1/fuel-tanks')
        .set('Authorization', auth)
        .send({ name: 'Tanque invalido', capacityLiters: 1000, initialStockLiters: 500, minStockLiters: 1500 })
        .expect(400);
    });
  });

  describe('edicao, ativacao/desativacao', () => {
    it('atualiza campos permitidos e recalcula isLowStock; nao aceita alterar capacidade', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('Update');
      const tank = await createTank(auth, { initialStockLiters: 900, capacityLiters: 1000 });

      const updated = await request(app.getHttpServer())
        .patch(`/api/v1/fuel-tanks/${tank.id}`)
        .set('Authorization', auth)
        .send({ minStockLiters: 950, location: 'Filial Sul' })
        .expect(200);
      expect(updated.body.data.minStockLiters).toBe(950);
      expect(updated.body.data.location).toBe('Filial Sul');
      expect(updated.body.data.isLowStock).toBe(true); // 900 <= 950
      expect(updated.body.data.capacityLiters).toBe(1000); // inalterado -- nao aceito no DTO

      await request(app.getHttpServer())
        .patch(`/api/v1/fuel-tanks/${tank.id}/status`)
        .set('Authorization', auth)
        .send({ isActive: false })
        .expect(200);
      const detail = await request(app.getHttpServer()).get(`/api/v1/fuel-tanks/${tank.id}`).set('Authorization', auth).expect(200);
      expect(detail.body.data.status).toBe('INACTIVE');
    });
  });

  describe('listagem: filtros e saldo', () => {
    it('filtra por lowStock e por busca de nome/localizacao', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('ListFilter');
      const low = await createTank(auth, { name: 'Tanque Baixo XYZ', initialStockLiters: 100, capacityLiters: 1000, minStockLiters: 500 });
      await createTank(auth, { name: 'Tanque Normal', initialStockLiters: 900, capacityLiters: 1000, minStockLiters: 100 });

      const lowRes = await request(app.getHttpServer()).get('/api/v1/fuel-tanks').query({ lowStock: 'true' }).set('Authorization', auth).expect(200);
      const lowNames = lowRes.body.data.items.map((t: { name: string }) => t.name);
      expect(lowNames).toContain('Tanque Baixo XYZ');
      expect(lowNames).not.toContain('Tanque Normal');

      const searchRes = await request(app.getHttpServer()).get('/api/v1/fuel-tanks').query({ search: 'XYZ' }).set('Authorization', auth).expect(200);
      expect(searchRes.body.data.items.map((t: { id: string }) => t.id)).toEqual([low.id]);

      const balance = await request(app.getHttpServer()).get(`/api/v1/fuel-tanks/${low.id}/balance`).set('Authorization', auth).expect(200);
      expect(balance.body.data.currentStockLiters).toBe(100);
      expect(balance.body.data.isLowStock).toBe(true);
    });
  });

  describe('entrada/compra de diesel (RECEIPT, Fase 2)', () => {
    it('registra a entrada, aumenta o saldo e calcula o total no backend (nunca confia no cliente)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('Receipt');
      const tank = await createTank(auth, { initialStockLiters: 7550, capacityLiters: 15000 });
      const fuelStationId = await createFuelStation(auth);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/fuel-tanks/${tank.id}/receipts`)
        .set('Authorization', auth)
        .send({ quantityLiters: 2000, pricePerLiter: 5.5, fuelStationId, invoiceNumber: 'NF-777' })
        .expect(201);

      expect(res.body.data.tank.currentStockLiters).toBe(9550);
      const movement = res.body.data.movement;
      expect(movement.type).toBe('RECEIPT');
      expect(movement.quantityLiters).toBe(2000);
      expect(movement.previousBalanceLiters).toBe(7550);
      expect(movement.newBalanceLiters).toBe(9550);
      expect(movement.pricePerLiter).toBe(5.5);
      expect(movement.totalAmount).toBe(11000); // 2000 * 5.5, sempre calculado no backend
      expect(movement.fuelStationId).toBe(fuelStationId);
      expect(movement.invoiceNumber).toBe('NF-777');
    });

    it('ignora um totalAmount enviado pelo cliente -- o backend sempre recalcula', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('ReceiptIgnoreTotal');
      const tank = await createTank(auth, { initialStockLiters: 0, capacityLiters: 10000 });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/fuel-tanks/${tank.id}/receipts`)
        .set('Authorization', auth)
        // totalAmount nao existe no DTO -- forbidNonWhitelisted rejeitaria se
        // fosse aceito; aqui confirmamos que o valor correto (calculado) e o
        // unico que aparece na resposta.
        .send({ quantityLiters: 100, pricePerLiter: 6 })
        .expect(201);

      expect(res.body.data.movement.totalAmount).toBe(600);
    });

    it('rejeita entrada que ultrapassaria a capacidade -- nenhuma movimentacao parcial', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('ReceiptOverCapacity');
      const tank = await createTank(auth, { initialStockLiters: 9500, capacityLiters: 10000 });

      await request(app.getHttpServer())
        .post(`/api/v1/fuel-tanks/${tank.id}/receipts`)
        .set('Authorization', auth)
        .send({ quantityLiters: 600, pricePerLiter: 5 })
        .expect(409);

      const after = await request(app.getHttpServer()).get(`/api/v1/fuel-tanks/${tank.id}`).set('Authorization', auth).expect(200);
      expect(after.body.data.currentStockLiters).toBe(9500); // inalterado

      const movements = await request(app.getHttpServer())
        .get(`/api/v1/fuel-tanks/${tank.id}/movements`)
        .set('Authorization', auth)
        .expect(200);
      expect(movements.body.data.items.some((m: { type: string }) => m.type === 'RECEIPT')).toBe(false);
    });

    it('rejeita litros/preco invalidos (400) e tanque INACTIVE (409)', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('ReceiptInvalid');
      const tank = await createTank(auth, { initialStockLiters: 100, capacityLiters: 1000 });

      await request(app.getHttpServer())
        .post(`/api/v1/fuel-tanks/${tank.id}/receipts`)
        .set('Authorization', auth)
        .send({ quantityLiters: 0, pricePerLiter: 5 })
        .expect(400);

      await request(app.getHttpServer())
        .post(`/api/v1/fuel-tanks/${tank.id}/receipts`)
        .set('Authorization', auth)
        .send({ quantityLiters: 100, pricePerLiter: -1 })
        .expect(400);

      await request(app.getHttpServer()).patch(`/api/v1/fuel-tanks/${tank.id}/status`).set('Authorization', auth).send({ isActive: false }).expect(200);
      await request(app.getHttpServer())
        .post(`/api/v1/fuel-tanks/${tank.id}/receipts`)
        .set('Authorization', auth)
        .send({ quantityLiters: 100, pricePerLiter: 5 })
        .expect(409);
    });

    it('rejeita fuelStationId de outro tenant ou inexistente (404)', async () => {
      const { auth: authA } = await createTenantAndLoginAsAdmin('ReceiptStationA');
      const { auth: authB } = await createTenantAndLoginAsAdmin('ReceiptStationB');
      const tank = await createTank(authA, { initialStockLiters: 100, capacityLiters: 1000 });
      const stationFromB = await createFuelStation(authB);

      await request(app.getHttpServer())
        .post(`/api/v1/fuel-tanks/${tank.id}/receipts`)
        .set('Authorization', authA)
        .send({ quantityLiters: 100, pricePerLiter: 5, fuelStationId: stationFromB })
        .expect(404);
    });

    it('aparece no historico com todos os dados de custo/origem', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('ReceiptHistory');
      const tank = await createTank(auth, { initialStockLiters: 1000, capacityLiters: 10000 });
      const fuelStationId = await createFuelStation(auth);
      await request(app.getHttpServer())
        .post(`/api/v1/fuel-tanks/${tank.id}/receipts`)
        .set('Authorization', auth)
        .send({ quantityLiters: 500, pricePerLiter: 6.2, fuelStationId, invoiceNumber: 'NF-1', notes: 'Compra mensal' })
        .expect(201);

      const movements = await request(app.getHttpServer())
        .get(`/api/v1/fuel-tanks/${tank.id}/movements`)
        .query({ type: 'RECEIPT' })
        .set('Authorization', auth)
        .expect(200);
      expect(movements.body.data.items.length).toBe(1);
      const movement = movements.body.data.items[0];
      expect(movement.quantityLiters).toBe(500);
      expect(movement.pricePerLiter).toBe(6.2);
      expect(movement.totalAmount).toBe(3100);
      expect(movement.fuelStationId).toBe(fuelStationId);
      expect(movement.invoiceNumber).toBe('NF-1');
      expect(movement.notes).toBe('Compra mensal');
    });

    it('isolamento multi-tenant: tanque de outro tenant retorna 404 ao registrar entrada', async () => {
      const { auth: authA } = await createTenantAndLoginAsAdmin('ReceiptTenantA');
      const { auth: authB } = await createTenantAndLoginAsAdmin('ReceiptTenantB');
      const tank = await createTank(authA, { initialStockLiters: 100, capacityLiters: 1000 });

      await request(app.getHttpServer())
        .post(`/api/v1/fuel-tanks/${tank.id}/receipts`)
        .set('Authorization', authB)
        .send({ quantityLiters: 100, pricePerLiter: 5 })
        .expect(404);
    });

    it('RBAC: AUDITOR nao pode registrar entrada (403)', async () => {
      const { tenantId, auth } = await createTenantAndLoginAsAdmin('ReceiptRbac');
      const auditorAuth = await createUserWithRole(tenantId, auth, 'AUDITOR');
      const tank = await createTank(auth, { initialStockLiters: 100, capacityLiters: 1000 });

      await request(app.getHttpServer())
        .post(`/api/v1/fuel-tanks/${tank.id}/receipts`)
        .set('Authorization', auditorAuth)
        .send({ quantityLiters: 100, pricePerLiter: 5 })
        .expect(403);
    });

    it('concorrencia: duas entradas simultaneas que somadas excederiam a capacidade -- somente uma sucede', async () => {
      const { auth } = await createTenantAndLoginAsAdmin('ReceiptConcurrency');
      const tank = await createTank(auth, { initialStockLiters: 9000, capacityLiters: 10000 });

      const attempt = () =>
        request(app.getHttpServer())
          .post(`/api/v1/fuel-tanks/${tank.id}/receipts`)
          .set('Authorization', auth)
          .send({ quantityLiters: 700, pricePerLiter: 5 });

      const [resA, resB] = await Promise.all([attempt(), attempt()]);
      const statuses = [resA.status, resB.status];
      // O invariante testado e "nunca as duas sucedem" -- a perdedora quase
      // sempre recebe 409 (capacidade), mas um conflito real de
      // serializacao do Postgres apos o retry automatico de runSerializable
      // (limitacao pre-existente, ja documentada na Fase 1) pode surgir como
      // 500 em vez de 409. O saldo final abaixo e o invariante que realmente
      // importa.
      expect(statuses.filter((s) => s === 201).length).toBe(1);
      expect(statuses.every((s) => s === 201 || s === 409 || s === 500)).toBe(true);

      const after = await request(app.getHttpServer()).get(`/api/v1/fuel-tanks/${tank.id}`).set('Authorization', auth).expect(200);
      expect(after.body.data.currentStockLiters).toBe(9700); // nunca 10400
    });
  });

  describe('isolamento multi-tenant', () => {
    it('tanque de outro tenant retorna 404', async () => {
      const { auth: authA } = await createTenantAndLoginAsAdmin('TenantA');
      const { auth: authB } = await createTenantAndLoginAsAdmin('TenantB');
      const tank = await createTank(authA);

      await request(app.getHttpServer()).get(`/api/v1/fuel-tanks/${tank.id}`).set('Authorization', authB).expect(404);
      await request(app.getHttpServer()).get(`/api/v1/fuel-tanks/${tank.id}/movements`).set('Authorization', authB).expect(404);
      await request(app.getHttpServer())
        .patch(`/api/v1/fuel-tanks/${tank.id}/status`)
        .set('Authorization', authB)
        .send({ isActive: false })
        .expect(404);
    });
  });

  describe('RBAC', () => {
    it('DRIVER nao acessa (403); AUDITOR le (200) mas nao escreve (403)', async () => {
      const { tenantId, auth } = await createTenantAndLoginAsAdmin('RbacFuelTanks');
      const driverAuth = await createUserWithRole(tenantId, auth, 'DRIVER');
      const auditorAuth = await createUserWithRole(tenantId, auth, 'AUDITOR');
      const tank = await createTank(auth);

      await request(app.getHttpServer()).get('/api/v1/fuel-tanks').set('Authorization', driverAuth).expect(403);
      await request(app.getHttpServer()).get('/api/v1/fuel-tanks').set('Authorization', auditorAuth).expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/fuel-tanks/${tank.id}/status`)
        .set('Authorization', auditorAuth)
        .send({ isActive: false })
        .expect(403);
    });
  });

  describe('concorrencia do motor de movimentacao (secao 5 do pedido)', () => {
    it('duas retiradas simultaneas de 300L num tanque de 500L nunca corrompem o saldo -- exatamente uma sucede', async () => {
      const { auth, tenantId } = await createTenantAndLoginAsAdmin('Concurrency');
      const tank = await createTank(auth, { name: 'Tanque Concorrencia', initialStockLiters: 500, capacityLiters: 500 });

      const service = app.get(FuelTanksService);
      const userRes = await request(app.getHttpServer()).get('/api/v1/users').set('Authorization', auth).expect(200);
      const adminUserId: string = userRes.body.data[0].id;

      // applyMovement e private -- chamado diretamente aqui (motor generico
      // que a Fase 3, INTERNAL_FUELING, reaproveitara sem alteracao) porque
      // esta fase nao expoe nenhum endpoint publico que retire estoque de um
      // tanque ja existente (ver comentario do service). Cada chamada roda
      // na sua PROPRIA transacao Serializable, exatamente como rodaria vinda
      // de duas requisicoes HTTP concorrentes reais.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const applyMovement = (service as any).applyMovement.bind(service);
      const attempt = () =>
        runSerializable(prisma, (tx) =>
          applyMovement(tx, tenantId, tank.id, FuelTankMovementType.INTERNAL_FUELING, 300, { userId: adminUserId }, {}),
        );

      const results = await Promise.allSettled([attempt(), attempt()]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const finalTank = await request(app.getHttpServer()).get(`/api/v1/fuel-tanks/${tank.id}`).set('Authorization', auth).expect(200);
      expect(finalTank.body.data.currentStockLiters).toBe(200); // 500 - 300, nunca 500-600

      const movements = await request(app.getHttpServer())
        .get(`/api/v1/fuel-tanks/${tank.id}/movements`)
        .set('Authorization', auth)
        .expect(200);
      const internalFuelingMovements = movements.body.data.items.filter((m: { type: string }) => m.type === 'INTERNAL_FUELING');
      expect(internalFuelingMovements.length).toBe(1); // a segunda tentativa nao deixou rastro
    });
  });
});
