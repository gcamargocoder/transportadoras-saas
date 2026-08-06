import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Users (e2e)', () => {
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
    // document exige exatamente 14 digitos numericos (sem letras) --
    // randomUUID() tem letras hexadecimais, entao geramos digitos puros.
    return Array.from({ length: 14 }, () => Math.floor(Math.random() * 10)).join('');
  }

  // Cria um tenant completo (via POST /tenants) e retorna o access token do
  // admin criado -- helper para nao repetir esse boilerplate em cada teste.
  async function createTenantAndLoginAsAdmin(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    const payload = {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `users-${label.toLowerCase()}-${unique}`,
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

  it('CRUD completo de usuario dentro do proprio tenant', async () => {
    const { adminAccessToken } = await createTenantAndLoginAsAdmin('Crud');
    const auth = `Bearer ${adminAccessToken}`;

    // Lista inicial: so o admin criado junto com o tenant.
    const initialList = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', auth)
      .expect(200);
    expect(initialList.body.data).toHaveLength(1);

    // Cria.
    const newUserEmail = `operador-${randomUUID()}@teste.com`;
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', auth)
      .send({
        name: 'Operador Teste',
        email: newUserEmail,
        password: 'SenhaForte123!',
        role: 'OPERATOR',
      })
      .expect(201);
    const userId = createRes.body.data.id;
    expect(createRes.body.data.role).toBe('OPERATOR');
    expect(createRes.body.data.passwordHash).toBeUndefined();

    // E-mail duplicado no mesmo tenant -> 409.
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', auth)
      .send({ name: 'Outro', email: newUserEmail, password: 'SenhaForte123!', role: 'OPERATOR' })
      .expect(409);

    // Lista agora com 2.
    const listAfterCreate = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', auth)
      .expect(200);
    expect(listAfterCreate.body.data).toHaveLength(2);

    // Atualiza (inclui redefinicao de senha).
    const updateRes = await request(app.getHttpServer())
      .patch(`/api/v1/users/${userId}`)
      .set('Authorization', auth)
      .send({ name: 'Operador Renomeado', password: 'NovaSenhaForte456!' })
      .expect(200);
    expect(updateRes.body.data.name).toBe('Operador Renomeado');

    // Desativa.
    const deactivateRes = await request(app.getHttpServer())
      .patch(`/api/v1/users/${userId}/status`)
      .set('Authorization', auth)
      .send({ isActive: false })
      .expect(200);
    expect(deactivateRes.body.data.isActive).toBe(false);

    // Reativa.
    const reactivateRes = await request(app.getHttpServer())
      .patch(`/api/v1/users/${userId}/status`)
      .set('Authorization', auth)
      .send({ isActive: true })
      .expect(200);
    expect(reactivateRes.body.data.isActive).toBe(true);

    // Exclui logicamente.
    await request(app.getHttpServer())
      .delete(`/api/v1/users/${userId}`)
      .set('Authorization', auth)
      .expect(204);

    // Nao aparece mais na listagem nem e encontrado por id.
    const listAfterDelete = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', auth)
      .expect(200);
    expect(listAfterDelete.body.data).toHaveLength(1);

    await request(app.getHttpServer())
      .patch(`/api/v1/users/${userId}/status`)
      .set('Authorization', auth)
      .send({ isActive: true })
      .expect(404);
  });

  it('isolamento multi-tenant: admin de uma empresa nao ve nem modifica usuarios de outra', async () => {
    const tenantA = await createTenantAndLoginAsAdmin('IsolA');
    const tenantB = await createTenantAndLoginAsAdmin('IsolB');

    // Cria um usuario no tenant B.
    const userBEmail = `user-b-${randomUUID()}@teste.com`;
    const createInB = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${tenantB.adminAccessToken}`)
      .send({ name: 'Usuario B', email: userBEmail, password: 'SenhaForte123!', role: 'OPERATOR' })
      .expect(201);
    const userBId = createInB.body.data.id;

    // Admin do tenant A nao ve o usuario do tenant B na listagem.
    const listInA = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${tenantA.adminAccessToken}`)
      .expect(200);
    expect(listInA.body.data.find((u: { id: string }) => u.id === userBId)).toBeUndefined();

    // Admin do tenant A tentando editar/desativar/excluir o usuario do
    // tenant B pelo id direto -> 404 (nao vaza existencia do registro).
    await request(app.getHttpServer())
      .patch(`/api/v1/users/${userBId}`)
      .set('Authorization', `Bearer ${tenantA.adminAccessToken}`)
      .send({ name: 'Tentativa de Sequestro' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/v1/users/${userBId}`)
      .set('Authorization', `Bearer ${tenantA.adminAccessToken}`)
      .expect(404);

    // Usuario do tenant B continua intacto.
    const stillThere = await prisma.userAccount.findUnique({ where: { id: userBId } });
    expect(stillThere?.name).toBe('Usuario B');
    expect(stillThere?.deletedAt).toBeNull();
  });

  it('RolesGuard: usuario OPERATOR nao acessa /users (403)', async () => {
    const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('Roles');

    const operatorEmail = `operator-role-${randomUUID()}@teste.com`;
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

    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${operatorLogin.body.data.accessToken}`)
      .expect(403);
  });
});
