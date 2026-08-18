import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Drivers (e2e)', () => {
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

  // Gera um CPF sintaticamente valido (digitos verificadores corretos) --
  // os testes de isolamento/duplicidade precisam de varios CPFs distintos e
  // validos, nao apenas um fixo.
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
    const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 9)); // evita so 9s (sequencia)
    const d1 = calcDigit(base, 10);
    const d2 = calcDigit([...base, d1], 11);
    return [...base, d1, d2].join('');
  }

  async function createTenantAndLoginAsAdmin(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    const payload = {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `drv-${label.toLowerCase()}-${unique}`,
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

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email: payload.admin.email, password: payload.admin.password })
      .expect(200);

    return { tenantId, adminAccessToken: loginRes.body.data.accessToken as string };
  }

  function buildDriverPayload(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      name: 'José da Silva',
      cpf: randomValidCpf(),
      cnhNumber: String(Math.floor(10000000000 + Math.random() * 89999999999)),
      cnhCategory: 'AE',
      cnhExpiresAt: '2027-06-30',
      phone: '11987654321',
      email: `motorista-${randomUUID()}@teste.com`,
      admissionDate: '2024-01-15',
      ...overrides,
    };
  }

  describe('validacoes', () => {
    let adminAccessToken: string;

    beforeAll(async () => {
      ({ adminAccessToken } = await createTenantAndLoginAsAdmin('Valid'));
    });

    it('rejeita CPF invalido com 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(buildDriverPayload({ cpf: '111.111.111-11' }))
        .expect(400);
    });

    it('rejeita categoria de CNH invalida com 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(buildDriverPayload({ cnhCategory: 'Z' }))
        .expect(400);
    });

    it('rejeita ausencia de CNH (campo obrigatorio) com 400', async () => {
      const payload = buildDriverPayload();
      delete (payload as Record<string, unknown>).cnhNumber;
      await request(app.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(payload)
        .expect(400);
    });

    it('rejeita ausencia de validade da CNH com 400', async () => {
      const payload = buildDriverPayload();
      delete (payload as Record<string, unknown>).cnhExpiresAt;
      await request(app.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(payload)
        .expect(400);
    });

    it('rejeita e-mail invalido com 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(buildDriverPayload({ email: 'nao-e-email' }))
        .expect(400);
    });
  });

  describe('CRUD completo', () => {
    let adminAccessToken: string;

    beforeAll(async () => {
      ({ adminAccessToken } = await createTenantAndLoginAsAdmin('Crud'));
    });

    it('cria, consulta, atualiza, ativa/desativa e exclui logicamente um motorista', async () => {
      const auth = `Bearer ${adminAccessToken}`;
      const payload = buildDriverPayload();

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', auth)
        .send(payload)
        .expect(201);

      const driver = createRes.body.data;
      expect(driver.name).toBe(payload.name);
      expect(driver.cpf).toBe(payload.cpf);
      expect(driver.cnhCategory).toBe('AE');
      expect(driver.isActive).toBe(true);

      // CPF duplicado no mesmo tenant -> 409.
      await request(app.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', auth)
        .send(buildDriverPayload({ cpf: payload.cpf }))
        .expect(409);

      // CNH duplicada no mesmo tenant -> 409.
      await request(app.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', auth)
        .send(buildDriverPayload({ cnhNumber: payload.cnhNumber }))
        .expect(409);

      // Consulta.
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/drivers/${driver.id}`)
        .set('Authorization', auth)
        .expect(200);
      expect(getRes.body.data.id).toBe(driver.id);

      // Atualiza.
      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/drivers/${driver.id}`)
        .set('Authorization', auth)
        .send({ city: 'Belo Horizonte', state: 'mg', notes: 'Motorista experiente.' })
        .expect(200);
      expect(updateRes.body.data.city).toBe('Belo Horizonte');
      expect(updateRes.body.data.state).toBe('MG');

      // Desativa.
      const deactivateRes = await request(app.getHttpServer())
        .patch(`/api/v1/drivers/${driver.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'INACTIVE' })
        .expect(200);
      expect(deactivateRes.body.data.isActive).toBe(false);

      // Reativa.
      const reactivateRes = await request(app.getHttpServer())
        .patch(`/api/v1/drivers/${driver.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'ACTIVE' })
        .expect(200);
      expect(reactivateRes.body.data.isActive).toBe(true);

      // Exclui logicamente.
      await request(app.getHttpServer())
        .delete(`/api/v1/drivers/${driver.id}`)
        .set('Authorization', auth)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/drivers/${driver.id}`)
        .set('Authorization', auth)
        .expect(404);
    });
  });

  describe('pesquisa, paginacao, ordenacao e filtros', () => {
    let adminAccessToken: string;

    beforeAll(async () => {
      ({ adminAccessToken } = await createTenantAndLoginAsAdmin('Search'));
      const auth = `Bearer ${adminAccessToken}`;

      const seedDrivers = [
        buildDriverPayload({ name: 'Ana Pereira', phone: '11911112222' }),
        buildDriverPayload({ name: 'Bruno Souza', phone: '11933334444' }),
        buildDriverPayload({ name: 'Carla Lima', phone: '11955556666' }),
      ];
      for (const d of seedDrivers) {
        await request(app.getHttpServer())
          .post('/api/v1/drivers')
          .set('Authorization', auth)
          .send(d)
          .expect(201);
      }

      // Um motorista inativo para testar o filtro isActive.
      const inactive = buildDriverPayload({ name: 'Daniela Inativa' });
      const inactiveRes = await request(app.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', auth)
        .send(inactive)
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/drivers/${inactiveRes.body.data.id}/status`)
        .set('Authorization', auth)
        .send({ status: 'INACTIVE' })
        .expect(200);
    });

    it('busca por nome (search)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/drivers?search=Bruno')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].name).toBe('Bruno Souza');
    });

    it('filtra por status (isActive=false)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/drivers?isActive=false')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].name).toBe('Daniela Inativa');
    });

    it('pagina e ordena por nome', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/drivers?isActive=true&page=1&pageSize=2&sortBy=name&sortOrder=asc')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.meta).toMatchObject({ total: 3, page: 1, pageSize: 2, totalPages: 2 });
      const names = res.body.data.items.map((d: { name: string }) => d.name);
      expect(names).toEqual(['Ana Pereira', 'Bruno Souza']);
    });
  });

  describe('isolamento multi-tenant', () => {
    it('admin de uma empresa nao ve nem modifica motoristas de outra', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('DrvIsolA');
      const tenantB = await createTenantAndLoginAsAdmin('DrvIsolB');

      const createInB = await request(app.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', `Bearer ${tenantB.adminAccessToken}`)
        .send(buildDriverPayload({ name: 'Motorista B' }))
        .expect(201);
      const driverBId = createInB.body.data.id;

      const listInA = await request(app.getHttpServer())
        .get('/api/v1/drivers')
        .set('Authorization', `Bearer ${tenantA.adminAccessToken}`)
        .expect(200);
      expect(
        listInA.body.data.items.find((d: { id: string }) => d.id === driverBId),
      ).toBeUndefined();

      await request(app.getHttpServer())
        .get(`/api/v1/drivers/${driverBId}`)
        .set('Authorization', `Bearer ${tenantA.adminAccessToken}`)
        .expect(404);

      await request(app.getHttpServer())
        .patch(`/api/v1/drivers/${driverBId}`)
        .set('Authorization', `Bearer ${tenantA.adminAccessToken}`)
        .send({ name: 'Tentativa de Sequestro' })
        .expect(404);

      await request(app.getHttpServer())
        .delete(`/api/v1/drivers/${driverBId}`)
        .set('Authorization', `Bearer ${tenantA.adminAccessToken}`)
        .expect(404);

      // Tambem nao consegue cadastrar documento para motorista de outro tenant.
      await request(app.getHttpServer())
        .post(`/api/v1/drivers/${driverBId}/documents`)
        .set('Authorization', `Bearer ${tenantA.adminAccessToken}`)
        .send({ type: 'CNH', number: '123' })
        .expect(404);

      const stillThere = await prisma.driver.findUnique({ where: { id: driverBId } });
      expect(stillThere?.name).toBe('Motorista B');
      expect(stillThere?.deletedAt).toBeNull();
    });
  });

  describe('permissoes por perfil', () => {
    it('OPERATOR consegue listar mas nao cadastrar motoristas (403)', async () => {
      const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('RolesOp');
      const operatorEmail = `operator-drv-${randomUUID()}@teste.com`;
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          name: 'Operador',
          email: operatorEmail,
          password: 'SenhaForte123!',
          role: 'OPERATOR',
        })
        .expect(201);

      const operatorLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId, email: operatorEmail, password: 'SenhaForte123!' })
        .expect(200);
      const operatorAuth = `Bearer ${operatorLogin.body.data.accessToken}`;

      await request(app.getHttpServer())
        .get('/api/v1/drivers')
        .set('Authorization', operatorAuth)
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', operatorAuth)
        .send(buildDriverPayload())
        .expect(403);
    });

    it('usuario com role DRIVER nao acessa o modulo administrativo de motoristas (403)', async () => {
      const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('RolesDriver');
      const driverUserEmail = `driver-user-${randomUUID()}@teste.com`;
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          name: 'Conta de Motorista',
          email: driverUserEmail,
          password: 'SenhaForte123!',
          role: 'DRIVER',
        })
        .expect(201);

      const driverLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId, email: driverUserEmail, password: 'SenhaForte123!' })
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/v1/drivers')
        .set('Authorization', `Bearer ${driverLogin.body.data.accessToken}`)
        .expect(403);
    });
  });

  describe('documentos do motorista', () => {
    it('cadastra e lista documentos (CNH, exame medico, MOPP)', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Docs');
      const auth = `Bearer ${adminAccessToken}`;

      const driverRes = await request(app.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', auth)
        .send(buildDriverPayload())
        .expect(201);
      const driverId = driverRes.body.data.id;

      await request(app.getHttpServer())
        .post(`/api/v1/drivers/${driverId}/documents`)
        .set('Authorization', auth)
        .send({
          type: 'CNH',
          number: '12345678900',
          issuedAt: '2022-01-01',
          expiresAt: '2027-01-01',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/drivers/${driverId}/documents`)
        .set('Authorization', auth)
        .send({ type: 'MEDICAL_EXAM', issuedAt: '2026-01-01', expiresAt: '2027-01-01' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/drivers/${driverId}/documents`)
        .set('Authorization', auth)
        .send({ type: 'MOPP' })
        .expect(201);

      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/drivers/${driverId}/documents`)
        .set('Authorization', auth)
        .expect(200);

      expect(listRes.body.data).toHaveLength(3);
      const types = listRes.body.data.map((doc: { type: string }) => doc.type).sort();
      expect(types).toEqual(['CNH', 'MEDICAL_EXAM', 'MOPP'].sort());
    });

    it('rejeita documento para motorista inexistente com 404', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('DocsMissing');
      await request(app.getHttpServer())
        .post(`/api/v1/drivers/${randomUUID()}/documents`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ type: 'CNH' })
        .expect(404);
    });
  });

  describe('motorista inexistente', () => {
    it('GET, PATCH e DELETE com id inexistente retornam 404', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Missing');
      const auth = `Bearer ${adminAccessToken}`;
      const missingId = randomUUID();

      await request(app.getHttpServer())
        .get(`/api/v1/drivers/${missingId}`)
        .set('Authorization', auth)
        .expect(404);

      await request(app.getHttpServer())
        .patch(`/api/v1/drivers/${missingId}`)
        .set('Authorization', auth)
        .send({ name: 'Nao Existe' })
        .expect(404);

      await request(app.getHttpServer())
        .delete(`/api/v1/drivers/${missingId}`)
        .set('Authorization', auth)
        .expect(404);
    });
  });

  describe('filtros adicionais (CPF exato, categoria de CNH, CNH vencendo)', () => {
    let adminAccessToken: string;
    let cpfAlvo: string;

    beforeAll(async () => {
      ({ adminAccessToken } = await createTenantAndLoginAsAdmin('Filters'));
      const auth = `Bearer ${adminAccessToken}`;

      cpfAlvo = randomValidCpf();
      await request(app.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', auth)
        .send(buildDriverPayload({ name: 'Motorista Categoria B', cpf: cpfAlvo, cnhCategory: 'B' }))
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', auth)
        .send(
          buildDriverPayload({
            name: 'Motorista CNH Vencendo',
            cnhCategory: 'AE',
            cnhExpiresAt: '2026-08-20',
          }),
        )
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', auth)
        .send(
          buildDriverPayload({
            name: 'Motorista CNH em dia',
            cnhCategory: 'AE',
            cnhExpiresAt: '2030-01-01',
          }),
        )
        .expect(201);
    });

    it('filtra por CPF exato', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/drivers?cpf=${cpfAlvo}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].cpf).toBe(cpfAlvo);
    });

    it('filtra por categoria de CNH', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/drivers?cnhCategory=B')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].name).toBe('Motorista Categoria B');
    });

    it('rejeita categoria de CNH invalida no filtro com 400', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/drivers?cnhCategory=Z')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(400);
    });

    it('filtra motoristas com CNH vencendo nos proximos N dias', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/drivers?cnhExpiringInDays=60')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
      const names = res.body.data.items.map((d: { name: string }) => d.name);
      expect(names).toContain('Motorista CNH Vencendo');
      expect(names).not.toContain('Motorista CNH em dia');
    });
  });

  describe('vinculo com usuario (login opcional)', () => {
    it('vincula, rejeita reutilizacao e desvincula um UserAccount existente', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('LinkUser');
      const auth = `Bearer ${adminAccessToken}`;

      const driverRes = await request(app.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', auth)
        .send(buildDriverPayload())
        .expect(201);
      const driverId = driverRes.body.data.id;

      const userEmail = `driver-login-${randomUUID()}@teste.com`;
      const userRes = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', auth)
        .send({
          name: 'Login do Motorista',
          email: userEmail,
          password: 'SenhaForte123!',
          role: 'DRIVER',
        })
        .expect(201);
      const userAccountId = userRes.body.data.id;

      const linkRes = await request(app.getHttpServer())
        .patch(`/api/v1/drivers/${driverId}/user-link`)
        .set('Authorization', auth)
        .send({ userAccountId })
        .expect(200);
      expect(linkRes.body.data.userAccountId).toBe(userAccountId);

      // Outro motorista nao pode reutilizar o mesmo usuario -> 409.
      const otherDriverRes = await request(app.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', auth)
        .send(buildDriverPayload())
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/drivers/${otherDriverRes.body.data.id}/user-link`)
        .set('Authorization', auth)
        .send({ userAccountId })
        .expect(409);

      // Usuario de outro tenant nao pode ser vinculado -> 404.
      const otherTenant = await createTenantAndLoginAsAdmin('LinkUserOther');
      const foreignUserRes = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${otherTenant.adminAccessToken}`)
        .send({
          name: 'Usuario de outro tenant',
          email: `foreign-${randomUUID()}@teste.com`,
          password: 'SenhaForte123!',
          role: 'DRIVER',
        })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/drivers/${otherDriverRes.body.data.id}/user-link`)
        .set('Authorization', auth)
        .send({ userAccountId: foreignUserRes.body.data.id })
        .expect(404);

      // Desvincula.
      const unlinkRes = await request(app.getHttpServer())
        .delete(`/api/v1/drivers/${driverId}/user-link`)
        .set('Authorization', auth)
        .expect(200);
      expect(unlinkRes.body.data.userAccountId).toBeNull();

      // Desvincular de novo (ja sem usuario) -> 409.
      await request(app.getHttpServer())
        .delete(`/api/v1/drivers/${driverId}/user-link`)
        .set('Authorization', auth)
        .expect(409);
    });
  });

  describe('exclusao bloqueada por viagem ativa', () => {
    it('bloqueia DELETE quando o motorista tem viagem PLANNED/IN_PROGRESS vinculada', async () => {
      const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('DeleteGuard');
      const auth = `Bearer ${adminAccessToken}`;

      const driverRes = await request(app.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', auth)
        .send(buildDriverPayload())
        .expect(201);
      const driverId = driverRes.body.data.id;

      const origin = await prisma.location.create({
        data: { tenantId, name: 'Origem Teste', type: 'OTHER' },
      });
      const destination = await prisma.location.create({
        data: { tenantId, name: 'Destino Teste', type: 'OTHER' },
      });
      const trip = await prisma.trip.create({
        data: {
          tenantId,
          driverId,
          originLocationId: origin.id,
          destinationLocationId: destination.id,
          status: 'PLANNED',
        },
      });

      await request(app.getHttpServer())
        .delete(`/api/v1/drivers/${driverId}`)
        .set('Authorization', auth)
        .expect(409);

      // Cancela a viagem -- exclusao passa a ser permitida.
      await prisma.trip.update({ where: { id: trip.id }, data: { status: 'CANCELLED' } });

      await request(app.getHttpServer())
        .delete(`/api/v1/drivers/${driverId}`)
        .set('Authorization', auth)
        .expect(204);
    });
  });
});
