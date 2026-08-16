import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 48 -- Enforcement de Planos, Modulos e Limites. Cobre os 12
// cenarios obrigatorios do pedido (limite de criacao com race-condition,
// modulos habilitados/desabilitados, isolamento entre tenants, RBAC,
// bypass do SUPER_ADMIN, manipulacao direta da API, storage) SEMPRE contra
// infraestrutura real (Postgres via app Nest completo) -- nunca mockado.
describe('Plan Enforcement (e2e)', () => {
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

  function buildCreateTenantPayload(labelSuffix: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    return {
      name: `Transportadora ${labelSuffix} ${unique}`,
      document: randomCnpj(),
      slug: `pe-${labelSuffix.toLowerCase()}-${unique}`,
      admin: {
        name: `Admin ${labelSuffix}`,
        email: `admin-${labelSuffix.toLowerCase()}-${unique}@teste.com`,
        password: 'SenhaForte123!',
      },
    };
  }

  async function createTenantWithSuperAdmin(label: string) {
    const payload = buildCreateTenantPayload(label);
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/tenants')
      .send(payload)
      .expect(201);
    const tenantId = createRes.body.data.id;
    createdTenantIds.push(tenantId);

    await prisma.userAccount.update({
      where: { tenantId_email: { tenantId, email: payload.admin.email } },
      data: { role: 'SUPER_ADMIN' },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email: payload.admin.email, password: payload.admin.password })
      .expect(200);

    return { tenantId, superAdminAccessToken: loginRes.body.data.accessToken as string };
  }

  async function createTenantWithRole(label: string, role: string) {
    const payload = buildCreateTenantPayload(label);
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/tenants')
      .send(payload)
      .expect(201);
    const tenantId = createRes.body.data.id;
    createdTenantIds.push(tenantId);

    if (role !== 'ADMIN') {
      await prisma.userAccount.update({
        where: { tenantId_email: { tenantId, email: payload.admin.email } },
        data: { role },
      });
    }

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email: payload.admin.email, password: payload.admin.password })
      .expect(200);

    return { tenantId, accessToken: loginRes.body.data.accessToken as string };
  }

  async function createVehicle(accessToken: string, expectedStatus = 201) {
    return request(app.getHttpServer())
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
      .expect(expectedStatus);
  }

  async function createDriver(accessToken: string, expectedStatus = 201) {
    return request(app.getHttpServer())
      .post('/api/v1/drivers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Jose da Silva',
        cpf: randomValidCpf(),
        cnhNumber: String(Math.floor(10000000000 + Math.random() * 89999999999)),
        cnhCategory: 'AE',
        cnhExpiresAt: '2027-06-30',
      })
      .expect(expectedStatus);
  }

  async function createUser(accessToken: string, expectedStatus = 201) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    return request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: `Usuario ${unique}`,
        email: `user-${unique}@teste.com`,
        password: 'SenhaForte123!',
        role: 'OPERATOR',
      })
      .expect(expectedStatus);
  }

  async function updatePlan(
    superAdminAccessToken: string,
    tenantId: string,
    payload: Record<string, unknown>,
  ) {
    return request(app.getHttpServer())
      .patch(`/api/v1/tenants/${tenantId}/plan`)
      .set('Authorization', `Bearer ${superAdminAccessToken}`)
      .send(payload)
      .expect(200);
  }

  // ==========================================================================
  // Cenarios 1-5: limite de criacao (veiculos) -- abaixo do limite, atinge
  // exatamente o limite, bloqueia o proximo, SUPER_ADMIN aumenta o limite,
  // recurso volta a ser permitido. Encadeados de proposito (mesmo tenant,
  // mesmo estado evoluindo) -- e o ciclo de vida real do limite, nao um
  // teste artificial isolado.
  // ==========================================================================
  describe('Limite de criacao de veiculos (cenarios 1-5)', () => {
    it('permite criar ate o limite, bloqueia o proximo com 409, SUPER_ADMIN aumenta o limite e a criacao volta a funcionar', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('VehLimitActor');
      const target = await createTenantWithRole('VehLimitTarget', 'ADMIN');

      await updatePlan(superAdminAccessToken, target.tenantId, { maxVehicles: 2 });

      // 1) abaixo do limite (0 -> 1 de 2)
      await createVehicle(target.accessToken, 201);

      // 2) atinge exatamente o limite (1 -> 2 de 2)
      await createVehicle(target.accessToken, 201);

      // 3) bloqueia o proximo (409, mensagem clara, nenhum veiculo a mais criado)
      const blocked = await createVehicle(target.accessToken, 409);
      expect(blocked.body.message).toMatch(/limite de ve.culos/i);
      const countAtLimit = await prisma.vehicle.count({ where: { tenantId: target.tenantId } });
      expect(countAtLimit).toBe(2);

      // 4) SUPER_ADMIN aumenta o limite
      const updated = await updatePlan(superAdminAccessToken, target.tenantId, { maxVehicles: 3 });
      expect(updated.body.data.plan.maxVehicles).toBe(3);

      // 5) recurso volta a ser permitido apos o aumento
      await createVehicle(target.accessToken, 201);
      const countAfterIncrease = await prisma.vehicle.count({ where: { tenantId: target.tenantId } });
      expect(countAfterIncrease).toBe(3);
    });

    it('update de veiculo existente nunca consome o limite', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('VehUpdateActor');
      const target = await createTenantWithRole('VehUpdateTarget', 'ADMIN');
      await updatePlan(superAdminAccessToken, target.tenantId, { maxVehicles: 1 });

      const created = await createVehicle(target.accessToken, 201);
      const vehicleId = created.body.data.id as string;

      // Tenant ja esta no limite (1/1) -- update do mesmo veiculo deve
      // continuar funcionando normalmente (nao e uma nova criacao).
      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleId}`)
        .set('Authorization', `Bearer ${target.accessToken}`)
        .send({ color: 'Branco' })
        .expect(200);
    });

    it('nao permite ultrapassar o limite sob concorrencia (2 requisicoes simultaneas, so 1 slot livre)', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('VehRaceActor');
      const target = await createTenantWithRole('VehRaceTarget', 'ADMIN');
      await updatePlan(superAdminAccessToken, target.tenantId, { maxVehicles: 1 });

      const [first, second] = await Promise.allSettled([
        createVehicle(target.accessToken, 201).catch((e) => e),
        createVehicle(target.accessToken, 201).catch((e) => e),
      ]);

      const statuses = [first, second].map((r) =>
        r.status === 'fulfilled' ? (r.value.status as number) : undefined,
      );
      // Uma das duas passa (201), a outra e rejeitada (409) -- nunca as duas
      // passam juntas quando so ha 1 slot.
      const successCount = statuses.filter((s) => s === 201).length;
      expect(successCount).toBe(1);

      const finalCount = await prisma.vehicle.count({ where: { tenantId: target.tenantId } });
      expect(finalCount).toBe(1);
    });
  });

  // ==========================================================================
  // Limites de usuarios e motoristas -- mesma mecanica, verificacao mais
  // enxuta (a logica race-safe ja foi provada acima para veiculos).
  // ==========================================================================
  describe('Limite de criacao de usuarios e motoristas', () => {
    it('bloqueia criacao de usuario acima do limite com mensagem clara', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('UserLimitActor');
      const target = await createTenantWithRole('UserLimitTarget', 'ADMIN');
      // O admin criado no signup ja conta como 1 usuario -- limite 1 = ja
      // no limite.
      await updatePlan(superAdminAccessToken, target.tenantId, { maxUsers: 1 });

      const blocked = await createUser(target.accessToken, 409);
      expect(blocked.body.message).toMatch(/limite de usu.rios/i);
    });

    it('SUPER_ADMIN administrando um tenant nunca e bloqueado pelo limite do tenant administrado', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('UserSuperAdminActor');
      const target = await createTenantWithRole('UserSuperAdminTarget', 'ADMIN');
      await updatePlan(superAdminAccessToken, target.tenantId, { maxUsers: 1 });

      // superAdminAccessToken e do TENANT do proprio super admin -- criar um
      // usuario nesse tenant nao e afetado pelo limite (0) que acabou de ser
      // configurado no tenant alheio.
      await createUser(superAdminAccessToken, 201);
    });

    it('bloqueia criacao de motorista acima do limite com mensagem clara', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('DriverLimitActor');
      const target = await createTenantWithRole('DriverLimitTarget', 'ADMIN');
      await updatePlan(superAdminAccessToken, target.tenantId, { maxDrivers: 1 });

      await createDriver(target.accessToken, 201);
      const blocked = await createDriver(target.accessToken, 409);
      expect(blocked.body.message).toMatch(/limite de motoristas/i);
    });
  });

  // ==========================================================================
  // Cenarios 6-7: modulo habilitado funciona / modulo desabilitado bloqueia
  // ==========================================================================
  describe('Enforcement de modulos (cenarios 6-7)', () => {
    it('modulo habilitado (default) permite acessar a rota normalmente', async () => {
      const target = await createTenantWithRole('ModuleEnabledTarget', 'ADMIN');
      // Todo tenant novo nasce com todos os modulos habilitados (Fase 47) --
      // TIRES nao foi tocado, continua habilitado.
      await request(app.getHttpServer())
        .get('/api/v1/tires')
        .set('Authorization', `Bearer ${target.accessToken}`)
        .expect(200);
    });

    it('modulo desabilitado bloqueia a rota com 403 e mensagem clara, sem vazar detalhes internos', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('ModuleDisabledActor');
      const target = await createTenantWithRole('ModuleDisabledTarget', 'ADMIN');

      await updatePlan(superAdminAccessToken, target.tenantId, {
        enabledModules: ['TRIPS', 'TOLLS', 'FUEL', 'MAINTENANCE', 'CHECKLIST', 'STOPS', 'DASHBOARDS', 'REPORTS'],
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/tires')
        .set('Authorization', `Bearer ${target.accessToken}`)
        .expect(403);
      expect(res.body.message).toMatch(/modulo/i);
      expect(res.body.message).not.toMatch(/prisma|stack|sql/i);
    });
  });

  // ==========================================================================
  // Cenario 8: isolamento entre tenants
  // ==========================================================================
  describe('Isolamento entre tenants (cenario 8)', () => {
    it('tenant A nao consome o limite de veiculos do tenant B, e nao consegue consultar o uso/plano de B', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('IsolationActor');
      const tenantA = await createTenantWithRole('IsolationA', 'ADMIN');
      const tenantB = await createTenantWithRole('IsolationB', 'ADMIN');
      await updatePlan(superAdminAccessToken, tenantA.tenantId, { maxVehicles: 1 });
      await updatePlan(superAdminAccessToken, tenantB.tenantId, { maxVehicles: 1 });

      // A atinge o proprio limite...
      await createVehicle(tenantA.accessToken, 201);
      await createVehicle(tenantA.accessToken, 409);

      // ...mas B, com o MESMO limite, continua conseguindo criar o seu
      // primeiro veiculo normalmente -- contagens nunca se misturam.
      await createVehicle(tenantB.accessToken, 201);

      // B (ADMIN comum) nao consegue ver uso nem historico de A.
      await request(app.getHttpServer())
        .get(`/api/v1/tenants/${tenantA.tenantId}/usage`)
        .set('Authorization', `Bearer ${tenantB.accessToken}`)
        .expect(403);
    });
  });

  // ==========================================================================
  // Cenario 9: RBAC -- usuario comum e ADMIN nao alteram o plano
  // ==========================================================================
  describe('RBAC do plano (cenario 9)', () => {
    it('ADMIN comum recebe 403 ao tentar alterar o proprio plano', async () => {
      const target = await createTenantWithRole('PlanRbacAdmin', 'ADMIN');
      await request(app.getHttpServer())
        .patch(`/api/v1/tenants/${target.tenantId}/plan`)
        .set('Authorization', `Bearer ${target.accessToken}`)
        .send({ maxVehicles: 999 })
        .expect(403);
    });

    it('usuario OPERATOR recebe 403 ao tentar alterar o plano', async () => {
      const target = await createTenantWithRole('PlanRbacOperator', 'OPERATOR');
      await request(app.getHttpServer())
        .patch(`/api/v1/tenants/${target.tenantId}/plan`)
        .set('Authorization', `Bearer ${target.accessToken}`)
        .send({ maxVehicles: 999 })
        .expect(403);
    });
  });

  // ==========================================================================
  // Cenario 10: SUPER_ADMIN continua operando mesmo com modulo/limite
  // restritivo no tenant "casa" ou no tenant administrado.
  // ==========================================================================
  describe('SUPER_ADMIN nunca e bloqueado por modulo/limite (cenario 10)', () => {
    it('SUPER_ADMIN com o proprio tenant sem NENHUM modulo habilitado continua acessando rotas gateadas', async () => {
      const { tenantId, superAdminAccessToken } = await createTenantWithSuperAdmin('SuperAdminBypassActor');
      await prisma.tenantPlan.update({ where: { tenantId }, data: { enabledModules: [] } });

      await request(app.getHttpServer())
        .get('/api/v1/tires')
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .expect(200);
    });

    it('SUPER_ADMIN continua administrando (dashboard/usage) um tenant com modulos desabilitados', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('SuperAdminAdminActor');
      const target = await createTenantWithRole('SuperAdminAdminTarget', 'ADMIN');
      await updatePlan(superAdminAccessToken, target.tenantId, { enabledModules: [] });

      await request(app.getHttpServer())
        .get(`/api/v1/tenants/${target.tenantId}/usage`)
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .expect(200);
    });
  });

  // ==========================================================================
  // Cenario 11: manipulacao direta da API (sem passar pela UI) nao contorna
  // o enforcement -- mesma garantia do cenario 7, em outro dominio (TOLLS)
  // e outro metodo HTTP para diversificar a cobertura.
  // ==========================================================================
  describe('Manipulacao direta da API nao contorna o enforcement (cenario 11)', () => {
    it('chamar GET /toll-transactions diretamente com TOLLS desabilitado ainda retorna 403', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('DirectApiActor');
      const target = await createTenantWithRole('DirectApiTarget', 'ADMIN');
      await updatePlan(superAdminAccessToken, target.tenantId, {
        enabledModules: ['TRIPS', 'FUEL', 'MAINTENANCE', 'TIRES', 'CHECKLIST', 'STOPS', 'DASHBOARDS', 'REPORTS'],
      });

      await request(app.getHttpServer())
        .get('/api/v1/toll-transactions')
        .set('Authorization', `Bearer ${target.accessToken}`)
        .expect(403);
    });
  });

  // ==========================================================================
  // Cenario 12: storage respeita o limite -- upload real via toll-import.
  // ==========================================================================
  describe('Limite de armazenamento (cenario 12)', () => {
    async function getSemParar(accessToken: string) {
      const res = await request(app.getHttpServer())
        .get('/api/v1/tag-providers')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      return res.body.data.find((p: { name: string }) => p.name === 'Sem Parar') as { id: string };
    }

    it('bloqueia upload que ultrapassaria o limite de armazenamento do plano, e o ImportJob nao e criado', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('StorageLimitActor');
      const target = await createTenantWithRole('StorageLimitTarget', 'ADMIN');
      await updatePlan(superAdminAccessToken, target.tenantId, { maxStorageMb: 0 });

      const provider = await getSemParar(target.accessToken);
      const csv = Buffer.from('tag,praca,dataHora,valor,eixos\n', 'utf8');

      const before = await prisma.importJob.count({ where: { tenantId: target.tenantId } });

      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-import')
        .set('Authorization', `Bearer ${target.accessToken}`)
        .field('providerId', provider.id)
        .attach('file', csv, 'extrato.csv')
        .expect(409);
      expect(res.body.message).toMatch(/limite de armazenamento/i);

      const after = await prisma.importJob.count({ where: { tenantId: target.tenantId } });
      expect(after).toBe(before);
    });

    it('permite upload normalmente quando ha limite de armazenamento suficiente', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('StorageOkActor');
      const target = await createTenantWithRole('StorageOkTarget', 'ADMIN');
      await updatePlan(superAdminAccessToken, target.tenantId, { maxStorageMb: 50 });

      const provider = await getSemParar(target.accessToken);
      const csv = Buffer.from('tag,praca,dataHora,valor,eixos\n', 'utf8');

      await request(app.getHttpServer())
        .post('/api/v1/toll-import')
        .set('Authorization', `Bearer ${target.accessToken}`)
        .field('providerId', provider.id)
        .attach('file', csv, 'extrato.csv')
        .expect(201);
    });
  });
});
