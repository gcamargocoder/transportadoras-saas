import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 45 -- modulo completo de manutencao (planos preventivos + extensao
// do dashboard GET /fleet-operations/maintenance). CRUD basico de
// VehicleMaintenance (POST/PATCH/DELETE /maintenances) ja e coberto por
// maintenances.e2e-spec.ts -- aqui: planos (/maintenance/plans, novo),
// campos novos do registro (component/downtimeMinutes/nextOdometerKm/
// invoiceNumber/maintenancePlanId/parts) e os indicadores/rankings/alertas
// novos do dashboard.
describe('Fleet Maintenance -- planos e dashboard (e2e)', () => {
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

  async function createTenantAndLoginAsAdmin(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    const payload = {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `fmaint-${label.toLowerCase()}-${unique}`,
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

  async function createVehicle(auth: string, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/vehicles')
      .set('Authorization', auth)
      .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT', ...overrides })
      .expect(201);
    return res.body.data.id as string;
  }

  async function setVehicleOdometer(auth: string, vehicleId: string, odometerKm: number) {
    await request(app.getHttpServer())
      .patch(`/api/v1/vehicles/${vehicleId}`)
      .set('Authorization', auth)
      .send({ odometerKm })
      .expect(200);
  }

  async function createMaintenance(auth: string, vehicleId: string, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/maintenances')
      .set('Authorization', auth)
      .send({ vehicleId, type: 'PREVENTIVE', laborCost: 0, partsCost: 0, ...overrides })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createCompletedMaintenance(
    auth: string,
    vehicleId: string,
    overrides: Partial<Record<string, unknown>> = {},
  ) {
    const openedAt = (overrides.openedAt as string | undefined) ?? new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const id = await createMaintenance(auth, vehicleId, { openedAt, laborCost: 100, partsCost: 50, ...overrides });
    const completedAt = (overrides.completedAt as string | undefined) ?? new Date().toISOString();
    await request(app.getHttpServer())
      .patch(`/api/v1/maintenances/${id}/status`)
      .set('Authorization', auth)
      .send({ status: 'COMPLETED', completedAt })
      .expect(200);
    return id;
  }

  // ==========================================================================
  // POST/GET/PATCH/DELETE /maintenance/plans
  // ==========================================================================
  describe('/maintenance/plans', () => {
    it('CRUD completo', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PlanCrud');
      const vehicleId = await createVehicle(adminAuth);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/maintenance/plans')
        .set('Authorization', adminAuth)
        .send({ vehicleId, name: 'Troca de óleo', component: 'ENGINE_OIL', intervalKm: 10000, alertBeforeKm: 1000 })
        .expect(201);
      expect(createRes.body.data).toMatchObject({ vehicleId, name: 'Troca de óleo', component: 'ENGINE_OIL', active: true });
      const planId = createRes.body.data.id as string;

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/maintenance/plans/${planId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(getRes.body.data.id).toBe(planId);

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/maintenance/plans')
        .set('Authorization', adminAuth)
        .query({ vehicleId })
        .expect(200);
      expect(listRes.body.data.meta.total).toBe(1);

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/maintenance/plans/${planId}`)
        .set('Authorization', adminAuth)
        .send({ intervalKm: 12000, active: false })
        .expect(200);
      expect(updateRes.body.data).toMatchObject({ intervalKm: 12000, active: false });

      await request(app.getHttpServer()).delete(`/api/v1/maintenance/plans/${planId}`).set('Authorization', adminAuth).expect(204);
      await request(app.getHttpServer()).get(`/api/v1/maintenance/plans/${planId}`).set('Authorization', adminAuth).expect(404);
    });

    it('rejeita plano sem nenhum intervalo informado (400)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PlanNoInterval');
      const vehicleId = await createVehicle(adminAuth);
      await request(app.getHttpServer())
        .post('/api/v1/maintenance/plans')
        .set('Authorization', adminAuth)
        .send({ vehicleId, name: 'Sem intervalo', component: 'ENGINE' })
        .expect(400);
    });

    it('rejeita veiculo inexistente/de outro tenant (404)', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('PlanVehA');
      const vehicleOfA = await createVehicle(tenantA.adminAuth);
      const tenantB = await createTenantAndLoginAsAdmin('PlanVehB');

      await request(app.getHttpServer())
        .post('/api/v1/maintenance/plans')
        .set('Authorization', tenantB.adminAuth)
        .send({ vehicleId: vehicleOfA, name: 'X', component: 'ENGINE', intervalKm: 1000 })
        .expect(404);
      await request(app.getHttpServer())
        .post('/api/v1/maintenance/plans')
        .set('Authorization', tenantA.adminAuth)
        .send({ vehicleId: randomUUID(), name: 'X', component: 'ENGINE', intervalKm: 1000 })
        .expect(404);
    });

    it('bloqueia exclusao quando ha manutencao vinculada (409)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PlanDeleteBlocked');
      const vehicleId = await createVehicle(adminAuth);
      const planRes = await request(app.getHttpServer())
        .post('/api/v1/maintenance/plans')
        .set('Authorization', adminAuth)
        .send({ vehicleId, name: 'Plano', component: 'ENGINE', intervalKm: 10000 })
        .expect(201);
      const planId = planRes.body.data.id as string;
      await createMaintenance(adminAuth, vehicleId, { maintenancePlanId: planId });

      await request(app.getHttpServer()).delete(`/api/v1/maintenance/plans/${planId}`).set('Authorization', adminAuth).expect(409);
    });

    it('isolamento multi-tenant: tenant B nunca ve/edita/exclui plano do tenant A', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('PlanIsolA');
      const vehicleId = await createVehicle(tenantA.adminAuth);
      const planRes = await request(app.getHttpServer())
        .post('/api/v1/maintenance/plans')
        .set('Authorization', tenantA.adminAuth)
        .send({ vehicleId, name: 'Plano', component: 'ENGINE', intervalKm: 10000 })
        .expect(201);
      const planId = planRes.body.data.id as string;

      const tenantB = await createTenantAndLoginAsAdmin('PlanIsolB');
      await request(app.getHttpServer()).get(`/api/v1/maintenance/plans/${planId}`).set('Authorization', tenantB.adminAuth).expect(404);
      await request(app.getHttpServer())
        .patch(`/api/v1/maintenance/plans/${planId}`)
        .set('Authorization', tenantB.adminAuth)
        .send({ active: false })
        .expect(404);
      await request(app.getHttpServer()).delete(`/api/v1/maintenance/plans/${planId}`).set('Authorization', tenantB.adminAuth).expect(404);
      const listRes = await request(app.getHttpServer()).get('/api/v1/maintenance/plans').set('Authorization', tenantB.adminAuth).expect(200);
      expect(listRes.body.data.meta.total).toBe(0);
    });

    it('RBAC: leitura ampla (inclui AUDITOR), escrita restrita (AUDITOR/DRIVER bloqueados)', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('PlanRbac');
      const vehicleId = await createVehicle(adminAuth);

      for (const role of ['MANAGER', 'OPERATOR', 'DISPATCHER', 'AUDITOR']) {
        const auth = await createUserWithRole(tenantId, adminAuth, role);
        await request(app.getHttpServer()).get('/api/v1/maintenance/plans').set('Authorization', auth).expect(200);
      }

      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');
      await request(app.getHttpServer())
        .post('/api/v1/maintenance/plans')
        .set('Authorization', auditorAuth)
        .send({ vehicleId, name: 'X', component: 'ENGINE', intervalKm: 1000 })
        .expect(403);

      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      await request(app.getHttpServer()).get('/api/v1/maintenance/plans').set('Authorization', driverAuth).expect(403);
    });

    // Fase 108 -- fecha a lacuna real: ate aqui so o dashboard de frota
    // (GET /fleet-operations/maintenance) mostrava a avaliacao de vencimento
    // de um plano; as rotas de CRUD de /maintenance/plans nunca devolviam
    // isso. Reaproveita a MESMA funcao pura (evaluateMaintenancePlan),
    // testada isoladamente em maintenance-plan-status.util.spec.ts -- aqui
    // so confirma que o service liga os dados reais (VehicleMaintenance
    // COMPLETED + Vehicle.odometerKm) corretamente via a rota HTTP.
    describe('avaliacao de vencimento (Fase 108)', () => {
      async function createPlanWithLastService(
        adminAuth: string,
        vehicleId: string,
        lastServiceOdometerKm: number,
      ): Promise<string> {
        const planRes = await request(app.getHttpServer())
          .post('/api/v1/maintenance/plans')
          .set('Authorization', adminAuth)
          .send({ vehicleId, name: 'Troca de óleo', component: 'ENGINE_OIL', intervalKm: 10000, alertBeforeKm: 1000 })
          .expect(201);
        const planId = planRes.body.data.id as string;
        await createCompletedMaintenance(adminAuth, vehicleId, {
          maintenancePlanId: planId,
          odometerKm: lastServiceOdometerKm,
        });
        return planId;
      }

      it('UNKNOWN quando o plano nunca teve um servico COMPLETED vinculado', async () => {
        const { adminAuth } = await createTenantAndLoginAsAdmin('PlanEvalUnknown');
        const vehicleId = await createVehicle(adminAuth);
        const planRes = await request(app.getHttpServer())
          .post('/api/v1/maintenance/plans')
          .set('Authorization', adminAuth)
          .send({ vehicleId, name: 'Troca de óleo', component: 'ENGINE_OIL', intervalKm: 10000 })
          .expect(201);

        expect(planRes.body.data.status).toBe('UNKNOWN');
        expect(planRes.body.data.dueOdometerKm).toBeNull();
      });

      it('OK quando falta mais que alertBeforeKm para o proximo vencimento', async () => {
        const { adminAuth } = await createTenantAndLoginAsAdmin('PlanEvalOk');
        const vehicleId = await createVehicle(adminAuth);
        const planId = await createPlanWithLastService(adminAuth, vehicleId, 90000);
        await setVehicleOdometer(adminAuth, vehicleId, 91000); // proximo vencimento: 100000, faltam 9000

        const res = await request(app.getHttpServer())
          .get(`/api/v1/maintenance/plans/${planId}`)
          .set('Authorization', adminAuth)
          .expect(200);
        expect(res.body.data.status).toBe('OK');
        expect(res.body.data.dueOdometerKm).toBe(100000);
      });

      it('DUE_SOON quando falta menos que alertBeforeKm para o vencimento', async () => {
        const { adminAuth } = await createTenantAndLoginAsAdmin('PlanEvalDueSoon');
        const vehicleId = await createVehicle(adminAuth);
        const planId = await createPlanWithLastService(adminAuth, vehicleId, 90000);
        await setVehicleOdometer(adminAuth, vehicleId, 99500); // faltam 500, alertBeforeKm=1000

        const res = await request(app.getHttpServer())
          .get(`/api/v1/maintenance/plans/${planId}`)
          .set('Authorization', adminAuth)
          .expect(200);
        expect(res.body.data.status).toBe('DUE_SOON');
      });

      it('OVERDUE quando o odometro atual ja passou do vencimento, com overdueByKm correto', async () => {
        const { adminAuth } = await createTenantAndLoginAsAdmin('PlanEvalOverdue');
        const vehicleId = await createVehicle(adminAuth);
        const planId = await createPlanWithLastService(adminAuth, vehicleId, 90000);
        await setVehicleOdometer(adminAuth, vehicleId, 100500);

        const res = await request(app.getHttpServer())
          .get(`/api/v1/maintenance/plans/${planId}`)
          .set('Authorization', adminAuth)
          .expect(200);
        expect(res.body.data.status).toBe('OVERDUE');
        expect(res.body.data.overdueByKm).toBe(500);

        // Mesma avaliacao refletida na listagem (sem N+1 -- ver suite dedicada abaixo).
        const listRes = await request(app.getHttpServer())
          .get('/api/v1/maintenance/plans')
          .set('Authorization', adminAuth)
          .query({ vehicleId })
          .expect(200);
        expect(listRes.body.data.items[0].status).toBe('OVERDUE');
      });
    });

    describe('auditoria', () => {
      it('registra maintenance_plan.created/.updated/.deleted', async () => {
        const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('PlanAudit');
        const vehicleId = await createVehicle(adminAuth);

        const createRes = await request(app.getHttpServer())
          .post('/api/v1/maintenance/plans')
          .set('Authorization', adminAuth)
          .send({ vehicleId, name: 'Troca de óleo', component: 'ENGINE_OIL', intervalKm: 10000 })
          .expect(201);
        const planId = createRes.body.data.id as string;

        await request(app.getHttpServer())
          .patch(`/api/v1/maintenance/plans/${planId}`)
          .set('Authorization', adminAuth)
          .send({ intervalKm: 12000 })
          .expect(200);
        await request(app.getHttpServer()).delete(`/api/v1/maintenance/plans/${planId}`).set('Authorization', adminAuth).expect(204);

        const logs = await prisma.auditLog.findMany({
          where: { tenantId, entityName: 'MaintenancePlan', entityId: planId },
          orderBy: { createdAt: 'asc' },
        });
        expect(logs.map((l) => l.action)).toEqual([
          'maintenance_plan.created',
          'maintenance_plan.updated',
          'maintenance_plan.deleted',
        ]);
        for (const log of logs) {
          expect(log.tenantId).toBe(tenantId);
          expect(log.userId).toBeTruthy();
          expect(log.ipAddress).toBeTruthy();
        }
      });
    });

    // ========================================================================
    // Fase 81 -- observacoes, status granular (5 valores) e "registrar
    // execucao" (reaproveita o historico VehicleMaintenance COMPLETED --
    // nenhuma tabela nova, nenhuma OS aberta, odometro real intocado).
    // ========================================================================
    describe('registro de execucao + status granular (Fase 81)', () => {
      const DAY = 24 * 60 * 60 * 1000;

      async function createPlan(adminAuth: string, vehicleId: string, body: Record<string, unknown>) {
        const res = await request(app.getHttpServer())
          .post('/api/v1/maintenance/plans')
          .set('Authorization', adminAuth)
          .send({ vehicleId, name: 'Troca de óleo', component: 'ENGINE_OIL', ...body })
          .expect(201);
        return res.body.data.id as string;
      }

      const registerExecution = (auth: string, planId: string, body: Record<string, unknown> = {}) =>
        request(app.getHttpServer())
          .post(`/api/v1/maintenance/plans/${planId}/executions`)
          .set('Authorization', auth)
          .send(body);

      it('notes: round-trip no create, no PATCH e no GET', async () => {
        const { adminAuth } = await createTenantAndLoginAsAdmin('PlanNotes');
        const vehicleId = await createVehicle(adminAuth);
        const planId = await createPlan(adminAuth, vehicleId, { intervalKm: 10000, notes: 'Usar óleo 15W40 sintético' });

        const getRes = await request(app.getHttpServer())
          .get(`/api/v1/maintenance/plans/${planId}`)
          .set('Authorization', adminAuth)
          .expect(200);
        expect(getRes.body.data.notes).toBe('Usar óleo 15W40 sintético');

        const patchRes = await request(app.getHttpServer())
          .patch(`/api/v1/maintenance/plans/${planId}`)
          .set('Authorization', adminAuth)
          .send({ notes: 'Trocar também o filtro' })
          .expect(200);
        expect(patchRes.body.data.notes).toBe('Trocar também o filtro');
      });

      it('status granular: OVERDUE por KM => overdueReason "KM"', async () => {
        const { adminAuth } = await createTenantAndLoginAsAdmin('PlanOverdueKm');
        const vehicleId = await createVehicle(adminAuth);
        const planId = await createPlan(adminAuth, vehicleId, { intervalKm: 10000, intervalDays: 3650, alertBeforeKm: 1000 });
        await registerExecution(adminAuth, planId, { executedAt: new Date(Date.now() - 10 * DAY).toISOString(), odometerKm: 100000 }).expect(201);
        await setVehicleOdometer(adminAuth, vehicleId, 111000); // +11000 > intervalKm

        const res = await request(app.getHttpServer()).get(`/api/v1/maintenance/plans/${planId}`).set('Authorization', adminAuth).expect(200);
        expect(res.body.data.status).toBe('OVERDUE');
        expect(res.body.data.overdueReason).toBe('KM');
      });

      it('status granular: OVERDUE por DATA => overdueReason "DATE"', async () => {
        const { adminAuth } = await createTenantAndLoginAsAdmin('PlanOverdueDate');
        const vehicleId = await createVehicle(adminAuth);
        const planId = await createPlan(adminAuth, vehicleId, { intervalKm: 1000000, intervalDays: 30, alertBeforeDays: 5 });
        await registerExecution(adminAuth, planId, { executedAt: new Date(Date.now() - 90 * DAY).toISOString(), odometerKm: 100000 }).expect(201);
        await setVehicleOdometer(adminAuth, vehicleId, 100500); // KM ainda OK

        const res = await request(app.getHttpServer()).get(`/api/v1/maintenance/plans/${planId}`).set('Authorization', adminAuth).expect(200);
        expect(res.body.data.status).toBe('OVERDUE');
        expect(res.body.data.overdueReason).toBe('DATE');
      });

      it('status granular: OVERDUE pelos DOIS => overdueReason "BOTH"', async () => {
        const { adminAuth } = await createTenantAndLoginAsAdmin('PlanOverdueBoth');
        const vehicleId = await createVehicle(adminAuth);
        const planId = await createPlan(adminAuth, vehicleId, { intervalKm: 10000, intervalDays: 30, alertBeforeKm: 1000, alertBeforeDays: 5 });
        await registerExecution(adminAuth, planId, { executedAt: new Date(Date.now() - 90 * DAY).toISOString(), odometerKm: 100000 }).expect(201);
        await setVehicleOdometer(adminAuth, vehicleId, 115000);

        const res = await request(app.getHttpServer()).get(`/api/v1/maintenance/plans/${planId}`).set('Authorization', adminAuth).expect(200);
        expect(res.body.data.status).toBe('OVERDUE');
        expect(res.body.data.overdueReason).toBe('BOTH');
      });

      it('status granular: DUE_SOON / OK / UNKNOWN tem overdueReason null', async () => {
        const { adminAuth } = await createTenantAndLoginAsAdmin('PlanReasonNull');
        const vehicleId = await createVehicle(adminAuth);

        const unknownPlan = await createPlan(adminAuth, vehicleId, { intervalKm: 10000 });
        const unknownRes = await request(app.getHttpServer()).get(`/api/v1/maintenance/plans/${unknownPlan}`).set('Authorization', adminAuth).expect(200);
        expect(unknownRes.body.data.status).toBe('UNKNOWN');
        expect(unknownRes.body.data.overdueReason).toBeNull();

        const okPlan = await createPlan(adminAuth, vehicleId, { intervalKm: 10000, alertBeforeKm: 1000 });
        await registerExecution(adminAuth, okPlan, { odometerKm: 100000 }).expect(201);
        await setVehicleOdometer(adminAuth, vehicleId, 105000);
        const okRes = await request(app.getHttpServer()).get(`/api/v1/maintenance/plans/${okPlan}`).set('Authorization', adminAuth).expect(200);
        expect(okRes.body.data.status).toBe('OK');
        expect(okRes.body.data.overdueReason).toBeNull();
      });

      it('registrar execucao: recalcula o proximo vencimento e devolve o plano reavaliado (OVERDUE -> OK)', async () => {
        const { adminAuth } = await createTenantAndLoginAsAdmin('PlanExecRecalc');
        const vehicleId = await createVehicle(adminAuth);
        const planId = await createPlan(adminAuth, vehicleId, { intervalKm: 10000, alertBeforeKm: 1000 });
        await registerExecution(adminAuth, planId, { odometerKm: 90000 }).expect(201);
        await setVehicleOdometer(adminAuth, vehicleId, 105000); // vencido: proximo era 100000

        const overdue = await request(app.getHttpServer()).get(`/api/v1/maintenance/plans/${planId}`).set('Authorization', adminAuth).expect(200);
        expect(overdue.body.data.status).toBe('OVERDUE');

        // registra a execucao AGORA, com o KM atual
        const execRes = await registerExecution(adminAuth, planId, { odometerKm: 105000 }).expect(201);
        expect(execRes.body.data.status).toBe('OK');
        expect(execRes.body.data.dueOdometerKm).toBe(115000); // 105000 + 10000
        expect(execRes.body.data.lastExecution.odometerKm).toBe(105000);
      });

      it('historico: append-only -- registrar novas execucoes nunca apaga as anteriores', async () => {
        const { adminAuth } = await createTenantAndLoginAsAdmin('PlanExecHistory');
        const vehicleId = await createVehicle(adminAuth);
        const planId = await createPlan(adminAuth, vehicleId, { intervalKm: 10000 });

        await registerExecution(adminAuth, planId, { executedAt: new Date(Date.now() - 60 * DAY).toISOString(), odometerKm: 80000, notes: 'primeira' }).expect(201);
        await registerExecution(adminAuth, planId, { executedAt: new Date(Date.now() - 30 * DAY).toISOString(), odometerKm: 90000, notes: 'segunda' }).expect(201);
        await registerExecution(adminAuth, planId, { odometerKm: 100000, notes: 'terceira' }).expect(201);

        const histRes = await request(app.getHttpServer())
          .get(`/api/v1/maintenance/plans/${planId}/executions`)
          .set('Authorization', adminAuth)
          .expect(200);
        expect(histRes.body.data.meta.total).toBe(3);
        // mais recente primeiro
        expect(histRes.body.data.items.map((e: { odometerKm: number }) => e.odometerKm)).toEqual([100000, 90000, 80000]);
        expect(histRes.body.data.items[0].notes).toBe('terceira');
      });

      it('validacao: odometerKm negativo -> 400', async () => {
        const { adminAuth } = await createTenantAndLoginAsAdmin('PlanExecNeg');
        const vehicleId = await createVehicle(adminAuth);
        const planId = await createPlan(adminAuth, vehicleId, { intervalKm: 10000 });
        await registerExecution(adminAuth, planId, { odometerKm: -1 }).expect(400);
      });

      it('isolamento multi-tenant: registrar/consultar execucao de plano de outro tenant -> 404', async () => {
        const { adminAuth } = await createTenantAndLoginAsAdmin('PlanExecIsoA');
        const vehicleId = await createVehicle(adminAuth);
        const planId = await createPlan(adminAuth, vehicleId, { intervalKm: 10000 });
        const { adminAuth: authB } = await createTenantAndLoginAsAdmin('PlanExecIsoB');

        await registerExecution(authB, planId, { odometerKm: 100000 }).expect(404);
        await request(app.getHttpServer()).get(`/api/v1/maintenance/plans/${planId}/executions`).set('Authorization', authB).expect(404);
      });

      it('RBAC: DRIVER nao registra execucao (403); leitura de plano ja e bloqueada para DRIVER', async () => {
        const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('PlanExecRbac');
        const vehicleId = await createVehicle(adminAuth);
        const planId = await createPlan(adminAuth, vehicleId, { intervalKm: 10000 });
        const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
        await registerExecution(driverAuth, planId, { odometerKm: 100000 }).expect(403);
      });

      it('registrar execucao NAO altera odometro do veiculo, nem Trip/TripMetrics/VehicleIdlePeriod, e audita', async () => {
        const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('PlanExecNoSideEffect');
        const vehicleId = await createVehicle(adminAuth);
        await setVehicleOdometer(adminAuth, vehicleId, 123456);
        const planId = await createPlan(adminAuth, vehicleId, { intervalKm: 10000 });

        const tripsBefore = await prisma.trip.count({ where: { tenantId } });
        const metricsBefore = await prisma.tripMetrics.count({ where: { tenantId } });
        const idleBefore = await prisma.vehicleIdlePeriod.count({ where: { tenantId } });

        await registerExecution(adminAuth, planId, { odometerKm: 100000 }).expect(201);

        const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId } });
        expect(Number(vehicle?.odometerKm)).toBe(123456); // odometro REAL intocado
        expect(await prisma.trip.count({ where: { tenantId } })).toBe(tripsBefore);
        expect(await prisma.tripMetrics.count({ where: { tenantId } })).toBe(metricsBefore);
        expect(await prisma.vehicleIdlePeriod.count({ where: { tenantId } })).toBe(idleBefore);

        // veiculo NAO entrou em manutencao (nenhuma OS OPEN foi criada)
        const refreshed = await request(app.getHttpServer()).get(`/api/v1/vehicles/${vehicleId}`).set('Authorization', adminAuth).expect(200);
        expect(refreshed.body.data.status).toBe('ACTIVE');

        const auditLogs = await prisma.auditLog.findMany({
          where: { tenantId, entityName: 'MaintenancePlan', entityId: planId, action: 'maintenance_plan.execution_registered' },
        });
        expect(auditLogs).toHaveLength(1);
        expect(auditLogs[0]!.userId).toBeTruthy();
      });

      it('a execucao registrada e uma manutencao PREVENTIVE COMPLETED (distinta de corretiva)', async () => {
        const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('PlanExecPreventive');
        const vehicleId = await createVehicle(adminAuth);
        const planId = await createPlan(adminAuth, vehicleId, { intervalKm: 10000 });
        await registerExecution(adminAuth, planId, { odometerKm: 100000 }).expect(201);

        const rows = await prisma.vehicleMaintenance.findMany({ where: { tenantId, maintenancePlanId: planId } });
        expect(rows).toHaveLength(1);
        expect(rows[0]!.type).toBe('PREVENTIVE');
        expect(rows[0]!.status).toBe('COMPLETED');
      });
    });
  });

  // ==========================================================================
  // Campos novos de VehicleMaintenance (Fase 45)
  // ==========================================================================
  describe('POST/PATCH /maintenances -- campos novos', () => {
    it('aceita component/downtimeMinutes/nextOdometerKm/invoiceNumber/maintenancePlanId', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('RecordFields');
      const vehicleId = await createVehicle(adminAuth);
      const planRes = await request(app.getHttpServer())
        .post('/api/v1/maintenance/plans')
        .set('Authorization', adminAuth)
        .send({ vehicleId, name: 'Plano', component: 'ENGINE', intervalKm: 10000 })
        .expect(201);
      const planId = planRes.body.data.id as string;

      const res = await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', adminAuth)
        .send({
          vehicleId,
          type: 'PREVENTIVE',
          component: 'ENGINE',
          downtimeMinutes: 180,
          nextOdometerKm: 120000,
          invoiceNumber: 'NF-999',
          maintenancePlanId: planId,
        })
        .expect(201);

      expect(res.body.data).toMatchObject({
        component: 'ENGINE',
        downtimeMinutes: 180,
        nextOdometerKm: 120000,
        invoiceNumber: 'NF-999',
        maintenancePlanId: planId,
        parts: [],
      });
    });

    it('itens (parts): partsCost e totalCost sempre calculados como a soma, nunca aceitos soltos junto de parts', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('RecordParts');
      const vehicleId = await createVehicle(adminAuth);

      const res = await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', adminAuth)
        .send({
          vehicleId,
          type: 'CORRECTIVE',
          laborCost: 100,
          partsCost: 999999, // deve ser IGNORADO -- parts manda
          parts: [
            { name: 'Filtro de óleo', quantity: 2, unitPrice: 45.9 },
            { name: 'Correia', quantity: 1, unitPrice: 120 },
          ],
        })
        .expect(201);

      expect(res.body.data.parts).toHaveLength(2);
      expect(res.body.data.partsCost).toBe(211.8); // 2*45.9 + 1*120
      expect(res.body.data.totalCost).toBe(311.8); // labor 100 + partsCost 211.8

      const id = res.body.data.id as string;
      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/maintenances/${id}`)
        .set('Authorization', adminAuth)
        .send({ parts: [{ name: 'Item unico', quantity: 1, unitPrice: 50 }] })
        .expect(200);
      expect(updateRes.body.data.parts).toHaveLength(1);
      expect(updateRes.body.data.partsCost).toBe(50);
    });

    it('rejeita maintenancePlanId de outro tenant (404)', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('RecordPlanA');
      const vehicleOfA = await createVehicle(tenantA.adminAuth);
      const planRes = await request(app.getHttpServer())
        .post('/api/v1/maintenance/plans')
        .set('Authorization', tenantA.adminAuth)
        .send({ vehicleId: vehicleOfA, name: 'Plano', component: 'ENGINE', intervalKm: 10000 })
        .expect(201);

      const tenantB = await createTenantAndLoginAsAdmin('RecordPlanB');
      const vehicleOfB = await createVehicle(tenantB.adminAuth);
      await request(app.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', tenantB.adminAuth)
        .send({ vehicleId: vehicleOfB, type: 'PREVENTIVE', maintenancePlanId: planRes.body.data.id })
        .expect(404);
    });

    it('filtra listagem por component', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('RecordComponentFilter');
      const vehicleId = await createVehicle(adminAuth);
      await createMaintenance(adminAuth, vehicleId, { component: 'ENGINE' });
      await createMaintenance(adminAuth, vehicleId, { component: 'BRAKES' });

      const res = await request(app.getHttpServer())
        .get('/api/v1/maintenances')
        .set('Authorization', adminAuth)
        .query({ component: 'BRAKES' })
        .expect(200);
      expect(res.body.data.meta.total).toBe(1);
      expect(res.body.data.items[0].component).toBe('BRAKES');
    });
  });

  // ==========================================================================
  // GET /fleet-operations/maintenance -- indicadores/rankings/alertas novos
  // ==========================================================================
  describe('GET /fleet-operations/maintenance -- Fase 45', () => {
    it('manutencao cancelada NUNCA entra em nenhum indicador/ranking (bug corrigido nesta fase)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CancelledExclusion');
      const vehicleId = await createVehicle(adminAuth);
      await createCompletedMaintenance(adminAuth, vehicleId, { laborCost: 500, partsCost: 0, component: 'ENGINE' });
      const cancelledId = await createMaintenance(adminAuth, vehicleId, { laborCost: 9999, partsCost: 9999, component: 'BRAKES' });
      await request(app.getHttpServer())
        .patch(`/api/v1/maintenances/${cancelledId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'CANCELLED' })
        .expect(200);

      const res = await request(app.getHttpServer()).get('/api/v1/fleet-operations/maintenance').set('Authorization', adminAuth).expect(200);
      const dashboard = res.body.data;

      expect(dashboard.totalCount).toBe(1);
      expect(dashboard.cancelledCount).toBe(1);
      expect(dashboard.completedCount).toBe(1);
      expect(dashboard.totalCost).toBe(500);
      expect(dashboard.byComponent.find((c: { component: string }) => c.component === 'BRAKES')).toBeUndefined();
      expect(dashboard.topVehiclesByCost[0].value).toBe(500);
    });

    it('conta preventivas/corretivas/programadas/canceladas separadamente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CountsBreakdown');
      const vehicleId = await createVehicle(adminAuth);
      await createMaintenance(adminAuth, vehicleId, { type: 'PREVENTIVE' });
      const correctiveId = await createMaintenance(adminAuth, vehicleId, { type: 'CORRECTIVE' });
      await request(app.getHttpServer())
        .patch(`/api/v1/maintenances/${correctiveId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'CANCELLED' })
        .expect(200);
      const scheduledId = await createMaintenance(adminAuth, vehicleId, {
        type: 'PREVENTIVE',
        scheduledAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      });
      expect(scheduledId).toEqual(expect.any(String));

      const res = await request(app.getHttpServer()).get('/api/v1/fleet-operations/maintenance').set('Authorization', adminAuth).expect(200);
      expect(res.body.data).toMatchObject({ preventiveCount: 2, correctiveCount: 0, cancelledCount: 1, scheduledCount: 1 });
    });

    it('laborCostTotal/partsCostTotal somam separadamente; downtime so disponivel quando informado', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CostBreakdown');
      const vehicleId = await createVehicle(adminAuth);
      await createMaintenance(adminAuth, vehicleId, { laborCost: 300, partsCost: 200, downtimeMinutes: 120 });
      await createMaintenance(adminAuth, vehicleId, { laborCost: 100, partsCost: 50 }); // sem downtime

      const res = await request(app.getHttpServer()).get('/api/v1/fleet-operations/maintenance').set('Authorization', adminAuth).expect(200);
      expect(res.body.data.laborCostTotal).toBe(400);
      expect(res.body.data.partsCostTotal).toBe(250);
      expect(res.body.data.totalDowntimeMinutes).toBe(120);
      expect(res.body.data.averageDowntimeMinutes).toBe(120);
    });

    it('sem NENHUM registro de manutencao: downtime/custo-por-km ficam indisponiveis (nunca zero falso)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('EmptyDashboard');
      const res = await request(app.getHttpServer()).get('/api/v1/fleet-operations/maintenance').set('Authorization', adminAuth).expect(200);
      expect(res.body.data.totalDowntimeMinutes).toBeNull();
      expect(res.body.data.averageDowntimeMinutes).toBeNull();
      expect(res.body.data.costPerKm).toMatchObject({ value: null, available: false, reason: 'INSUFFICIENT_ODOMETER_READINGS' });
      expect(res.body.data.totalCount).toBe(0);
      expect(res.body.data.overdueMaintenances).toEqual([]);
      expect(res.body.data.maintenanceAlerts).toEqual([]);
    });

    it('custo por km: disponivel com >= 2 leituras de odometro por veiculo, indisponivel sem isso', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CostPerKm');
      const vehicleId = await createVehicle(adminAuth);
      await createMaintenance(adminAuth, vehicleId, { odometerKm: 100000, laborCost: 100, partsCost: 0 });
      await createMaintenance(adminAuth, vehicleId, { odometerKm: 105000, laborCost: 400, partsCost: 0 });

      const res = await request(app.getHttpServer()).get('/api/v1/fleet-operations/maintenance').set('Authorization', adminAuth).expect(200);
      expect(res.body.data.costPerKm.available).toBe(true);
      expect(res.body.data.costPerKm.value).toBeCloseTo(500 / 5000, 5);
    });

    it('byComponent/topComponentsByCost/topComponentsByCount', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ComponentRankings');
      const vehicleId = await createVehicle(adminAuth);
      await createMaintenance(adminAuth, vehicleId, { component: 'ENGINE', laborCost: 1000, partsCost: 0 });
      await createMaintenance(adminAuth, vehicleId, { component: 'BRAKES', laborCost: 100, partsCost: 0 });
      await createMaintenance(adminAuth, vehicleId, { component: 'BRAKES', laborCost: 100, partsCost: 0 });

      const res = await request(app.getHttpServer()).get('/api/v1/fleet-operations/maintenance').set('Authorization', adminAuth).expect(200);
      const byComponent = res.body.data.byComponent as { component: string; count: number; cost: number }[];
      expect(byComponent.find((c) => c.component === 'ENGINE')).toMatchObject({ count: 1, cost: 1000 });
      expect(byComponent.find((c) => c.component === 'BRAKES')).toMatchObject({ count: 2, cost: 200 });
      expect(res.body.data.topComponentsByCost[0]).toMatchObject({ component: 'ENGINE', cost: 1000 });
      expect(res.body.data.topComponentsByCount[0]).toMatchObject({ component: 'BRAKES', count: 2 });
    });

    it('bottomVehiclesByCost (ASC) e topVehiclesByDowntime', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('BottomTop');
      const vehicleCheap = await createVehicle(adminAuth);
      const vehicleExpensive = await createVehicle(adminAuth);
      await createMaintenance(adminAuth, vehicleCheap, { laborCost: 50, partsCost: 0, downtimeMinutes: 10 });
      await createMaintenance(adminAuth, vehicleExpensive, { laborCost: 5000, partsCost: 0, downtimeMinutes: 900 });

      const res = await request(app.getHttpServer()).get('/api/v1/fleet-operations/maintenance').set('Authorization', adminAuth).expect(200);
      expect(res.body.data.bottomVehiclesByCost[0]).toMatchObject({ vehicleId: vehicleCheap, value: 50 });
      expect(res.body.data.topVehiclesByDowntime[0]).toMatchObject({ vehicleId: vehicleExpensive, value: 900 });
    });

    it('plano vencido (OVERDUE) e proximo (DUE_SOON) aparecem em overdueMaintenances/upcomingMaintenances e geram alerta', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PlanOverdue');
      const overdueVehicle = await createVehicle(adminAuth);
      const dueSoonVehicle = await createVehicle(adminAuth);

      const overduePlanRes = await request(app.getHttpServer())
        .post('/api/v1/maintenance/plans')
        .set('Authorization', adminAuth)
        .send({ vehicleId: overdueVehicle, name: 'Troca de óleo', component: 'ENGINE_OIL', intervalKm: 10000, alertBeforeKm: 1000 })
        .expect(201);
      await createCompletedMaintenance(adminAuth, overdueVehicle, {
        maintenancePlanId: overduePlanRes.body.data.id,
        odometerKm: 100000,
      });
      await setVehicleOdometer(adminAuth, overdueVehicle, 111000); // venceu em 110000, ja passou 1000km

      const dueSoonPlanRes = await request(app.getHttpServer())
        .post('/api/v1/maintenance/plans')
        .set('Authorization', adminAuth)
        .send({ vehicleId: dueSoonVehicle, name: 'Troca de óleo', component: 'ENGINE_OIL', intervalKm: 10000, alertBeforeKm: 1000 })
        .expect(201);
      await createCompletedMaintenance(adminAuth, dueSoonVehicle, {
        maintenancePlanId: dueSoonPlanRes.body.data.id,
        odometerKm: 100000,
      });
      await setVehicleOdometer(adminAuth, dueSoonVehicle, 109500); // faltam 500km (< alertBeforeKm 1000)

      const res = await request(app.getHttpServer()).get('/api/v1/fleet-operations/maintenance').set('Authorization', adminAuth).expect(200);
      expect(res.body.data.overdueCount).toBe(1);
      expect(res.body.data.dueSoonCount).toBe(1);
      expect(res.body.data.overdueMaintenances[0]).toMatchObject({ vehicleId: overdueVehicle, overdueByKm: 1000 });
      expect(res.body.data.upcomingMaintenances[0]).toMatchObject({ vehicleId: dueSoonVehicle });

      const alertTypes = (res.body.data.maintenanceAlerts as { type: string }[]).map((a) => a.type);
      expect(alertTypes).toContain('MAINTENANCE_OVERDUE');
      expect(alertTypes).toContain('MAINTENANCE_DUE_SOON');
    });

    it('plano sem nenhum servico concluido nunca aparece como vencido (sem base real de calculo)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PlanNoHistory');
      const vehicleId = await createVehicle(adminAuth);
      await setVehicleOdometer(adminAuth, vehicleId, 999999);
      await request(app.getHttpServer())
        .post('/api/v1/maintenance/plans')
        .set('Authorization', adminAuth)
        .send({ vehicleId, name: 'Plano novo', component: 'ENGINE', intervalKm: 1000, alertBeforeKm: 500 })
        .expect(201);

      const res = await request(app.getHttpServer()).get('/api/v1/fleet-operations/maintenance').set('Authorization', adminAuth).expect(200);
      expect(res.body.data.overdueCount).toBe(0);
      expect(res.body.data.dueSoonCount).toBe(0);
    });

    it('CRITICAL_COMPONENT: manutencao CRITICAL ainda aberta gera alerta', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CriticalOpen');
      const vehicleId = await createVehicle(adminAuth);
      await createMaintenance(adminAuth, vehicleId, { priority: 'CRITICAL', component: 'BRAKES' });

      const res = await request(app.getHttpServer()).get('/api/v1/fleet-operations/maintenance').set('Authorization', adminAuth).expect(200);
      const critical = (res.body.data.maintenanceAlerts as { type: string; vehicleId: string }[]).find((a) => a.type === 'CRITICAL_COMPONENT');
      expect(critical).toMatchObject({ vehicleId });
    });

    it('isolamento multi-tenant: tenant B nunca ve dados de manutencao do tenant A', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('DashIsolA');
      const vehicleA = await createVehicle(tenantA.adminAuth);
      await createCompletedMaintenance(tenantA.adminAuth, vehicleA, { laborCost: 1000, partsCost: 0 });

      const tenantB = await createTenantAndLoginAsAdmin('DashIsolB');
      const res = await request(app.getHttpServer()).get('/api/v1/fleet-operations/maintenance').set('Authorization', tenantB.adminAuth).expect(200);
      expect(res.body.data.totalCount).toBe(0);
      expect(res.body.data.totalCost).toBe(0);
      expect(res.body.data.byComponent).toEqual([]);
      expect(res.body.data.topVehiclesByCost).toEqual([]);
    });
  });

  // ==========================================================================
  // Verificacao real de ausencia de N+1 -- 10/25/50/100 veiculos, mesmo
  // mecanismo de contagem via $extends ja usado nas Fases 42-44.
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
        slug: `fmaint-n1-${label.toLowerCase()}-${unique}`,
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

    async function seedVehicleWithMaintenance(adminAuth: string) {
      const vehicleRes = await request(countingApp.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', adminAuth)
        .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
        .expect(201);
      const vehicleId = vehicleRes.body.data.id as string;

      const planRes = await request(countingApp.getHttpServer())
        .post('/api/v1/maintenance/plans')
        .set('Authorization', adminAuth)
        .send({ vehicleId, name: 'Plano', component: 'ENGINE', intervalKm: 10000, alertBeforeKm: 1000 })
        .expect(201);

      await request(countingApp.getHttpServer())
        .post('/api/v1/maintenances')
        .set('Authorization', adminAuth)
        .send({
          vehicleId,
          type: 'PREVENTIVE',
          component: 'ENGINE',
          priority: 'CRITICAL',
          odometerKm: 10000,
          laborCost: 100,
          partsCost: 50,
          downtimeMinutes: 60,
          maintenancePlanId: planRes.body.data.id,
          openedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .expect(201);
    }

    it('a contagem de queries de GET /fleet-operations/maintenance nao cresce entre 10, 25, 50 e 100 veiculos', async () => {
      const { adminAuth } = await createTenantAndLoginOnCountingApp('N1Maint');
      const checkpoints = [10, 25, 50, 100];
      const queriesByCheckpoint: number[] = [];
      let seeded = 0;

      for (const checkpoint of checkpoints) {
        while (seeded < checkpoint) {
          await seedVehicleWithMaintenance(adminAuth);
          seeded += 1;
        }
        queryCount = 0;
        await request(countingApp.getHttpServer())
          .get('/api/v1/fleet-operations/maintenance')
          .set('Authorization', adminAuth)
          .expect(200);
        queriesByCheckpoint.push(queryCount);
      }

      const [queriesFor10, , , queriesFor100] = queriesByCheckpoint;
      expect(queriesFor10).toBeGreaterThan(0);
      expect(queriesFor100).toBeLessThanOrEqual(queriesFor10 + 1);
    }, 180000);

    // Fase 108 -- a avaliacao de vencimento (evaluatePlansInBatch) adicionada
    // ao GET /maintenance/plans usa o MESMO padrao de 2 queries em lote
    // (nunca 1 por plano) ja comprovado acima para o dashboard -- confirma
    // que a contagem tambem nao cresce aqui.
    it('a contagem de queries de GET /maintenance/plans nao cresce entre 10, 25, 50 e 100 planos', async () => {
      const { adminAuth } = await createTenantAndLoginOnCountingApp('N1Plans');
      const checkpoints = [10, 25, 50, 100];
      const queriesByCheckpoint: number[] = [];
      let seeded = 0;

      for (const checkpoint of checkpoints) {
        while (seeded < checkpoint) {
          await seedVehicleWithMaintenance(adminAuth);
          seeded += 1;
        }
        queryCount = 0;
        const res = await request(countingApp.getHttpServer())
          .get('/api/v1/maintenance/plans')
          .set('Authorization', adminAuth)
          .query({ pageSize: 100 })
          .expect(200);
        expect(res.body.data.items).toHaveLength(checkpoint);
        queriesByCheckpoint.push(queryCount);
      }

      const [queriesFor10, , , queriesFor100] = queriesByCheckpoint;
      expect(queriesFor10).toBeGreaterThan(0);
      expect(queriesFor100).toBeLessThanOrEqual(queriesFor10 + 1);
    }, 180000);
  });
});
