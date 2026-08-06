import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Tenants (e2e)', () => {
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

  function buildCreateTenantPayload(labelSuffix: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    return {
      name: `Transportadora ${labelSuffix} ${unique}`,
      document: randomCnpj(),
      slug: `tt-${labelSuffix.toLowerCase()}-${unique}`,
      admin: {
        name: `Admin ${labelSuffix}`,
        email: `admin-${labelSuffix.toLowerCase()}-${unique}@teste.com`,
        password: 'SenhaForte123!',
      },
    };
  }

  it('rejeita payload invalido (CNPJ com formato errado) com 400', async () => {
    const payload = buildCreateTenantPayload('Invalido');
    payload.document = '123'; // invalido, precisa de 14 digitos

    await request(app.getHttpServer()).post('/api/v1/tenants').send(payload).expect(400);
  });

  it('cria transportadora + settings padrao + admin numa unica operacao, e permite login imediato', async () => {
    const payload = buildCreateTenantPayload('Criacao');

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/tenants')
      .send(payload)
      .expect(201);

    const tenant = createRes.body.data;
    createdTenantIds.push(tenant.id);

    expect(tenant.name).toBe(payload.name);
    expect(tenant.slug).toBe(payload.slug);
    expect(tenant.isActive).toBe(true);
    // Settings padrao criadas junto (mesma transacao).
    expect(tenant.settings).toBeTruthy();
    expect(tenant.settings.currency).toBe('BRL');
    expect(tenant.settings.language).toBe('pt-BR');

    // Admin foi criado e associado ao tenant -- confirma via banco.
    const adminInDb = await prisma.userAccount.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: payload.admin.email } },
    });
    expect(adminInDb).toBeTruthy();
    expect(adminInDb?.role).toBe('ADMIN');
    expect(adminInDb?.isActive).toBe(true);

    // Login usando a chave composta (tenantId + email) funciona imediatamente.
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId: tenant.id, email: payload.admin.email, password: payload.admin.password })
      .expect(200);

    expect(loginRes.body.data.user.tenantId).toBe(tenant.id);
  });

  it('rejeita CNPJ ja cadastrado com 409', async () => {
    const payload = buildCreateTenantPayload('Duplicado');
    const first = await request(app.getHttpServer())
      .post('/api/v1/tenants')
      .send(payload)
      .expect(201);
    createdTenantIds.push(first.body.data.id);

    const second = buildCreateTenantPayload('Duplicado2');
    second.document = payload.document;

    await request(app.getHttpServer()).post('/api/v1/tenants').send(second).expect(409);
  });

  describe('gestao da propria empresa (/tenants/me)', () => {
    let tenantId: string;
    let accessToken: string;
    let adminEmail: string;
    let adminPassword: string;

    beforeAll(async () => {
      const payload = buildCreateTenantPayload('Gestao');
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/tenants')
        .send(payload)
        .expect(201);
      tenantId = createRes.body.data.id;
      createdTenantIds.push(tenantId);
      adminEmail = payload.admin.email;
      adminPassword = payload.admin.password;

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId, email: adminEmail, password: adminPassword })
        .expect(200);
      accessToken = loginRes.body.data.accessToken;
    });

    it('GET /tenants/me retorna a propria empresa', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/tenants/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.data.id).toBe(tenantId);
    });

    it('rejeita GET /tenants/me sem token com 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/tenants/me').expect(401);
    });

    it('PATCH /tenants/me atualiza nome fantasia e configuracoes', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/tenants/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          tradeName: 'Novo Nome Fantasia',
          settings: { language: 'en-US', maxDeviationMeters: 999 },
        })
        .expect(200);

      expect(res.body.data.tradeName).toBe('Novo Nome Fantasia');
      expect(res.body.data.settings.language).toBe('en-US');
      expect(res.body.data.settings.maxDeviationMeters).toBe(999);
    });

    it('PATCH /tenants/me/status desativa a empresa, e bloqueia requisicoes autenticadas seguintes', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/tenants/me/status')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ isActive: false })
        .expect(200);

      // TenantGuard bloqueia QUALQUER rota autenticada apos a empresa ficar
      // inativa -- mesmo com um access token ainda tecnicamente valido.
      await request(app.getHttpServer())
        .get('/api/v1/tenants/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);

      // Login tambem passa a ser recusado, mesmo com credenciais corretas
      // (empresa inativa -> 403, distinto de credencial invalida -> 401).
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId, email: adminEmail, password: adminPassword })
        .expect(403);

      // Reativa diretamente no banco para permitir o cleanup (delete) no afterAll.
      await prisma.tenant.update({ where: { id: tenantId }, data: { isActive: true } });
    });
  });

  // Cria uma empresa (com seu admin padrao) e promove esse admin a
  // SUPER_ADMIN diretamente no banco -- nao ha fluxo publico para criar um
  // Super Admin ainda (fora do escopo desta fase).
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

  describe('administracao de transportadoras (SUPER_ADMIN)', () => {
    it('GET /tenants: SUPER_ADMIN lista todas; ADMIN comum recebe 403', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('AdminList');
      const other = buildCreateTenantPayload('AdminListOther');
      const otherRes = await request(app.getHttpServer())
        .post('/api/v1/tenants')
        .send(other)
        .expect(201);
      createdTenantIds.push(otherRes.body.data.id);

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/tenants')
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .expect(200);
      expect(listRes.body.data.meta.total).toBeGreaterThanOrEqual(2);

      const regular = buildCreateTenantPayload('AdminListRegular');
      const regularRes = await request(app.getHttpServer())
        .post('/api/v1/tenants')
        .send(regular)
        .expect(201);
      createdTenantIds.push(regularRes.body.data.id);
      const regularLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          tenantId: regularRes.body.data.id,
          email: regular.admin.email,
          password: regular.admin.password,
        })
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/v1/tenants')
        .set('Authorization', `Bearer ${regularLogin.body.data.accessToken}`)
        .expect(403);
    });

    it('GET/PATCH /tenants/:id: SUPER_ADMIN consulta e edita qualquer empresa (CNPJ, slug, logo, status)', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('AdminEditActor');
      const target = buildCreateTenantPayload('AdminEditTarget');
      const targetRes = await request(app.getHttpServer())
        .post('/api/v1/tenants')
        .send(target)
        .expect(201);
      const targetId = targetRes.body.data.id;
      createdTenantIds.push(targetId);

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/tenants/${targetId}`)
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .expect(200);
      expect(getRes.body.data.id).toBe(targetId);

      const newDocument = randomCnpj();
      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/tenants/${targetId}`)
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .send({
          document: newDocument,
          logoUrl: 'https://cdn.exemplo.com/logo.png',
          isActive: false,
          settings: { currency: 'USD' },
        })
        .expect(200);
      expect(updateRes.body.data.document).toBe(newDocument);
      expect(updateRes.body.data.logoUrl).toBe('https://cdn.exemplo.com/logo.png');
      expect(updateRes.body.data.isActive).toBe(false);
      expect(updateRes.body.data.settings.currency).toBe('USD');
    });

    it('PATCH /tenants/:id rejeita CNPJ ja usado por outra empresa com 409', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('AdminConflictActor');
      const t1 = buildCreateTenantPayload('AdminConflict1');
      const t1Res = await request(app.getHttpServer()).post('/api/v1/tenants').send(t1).expect(201);
      createdTenantIds.push(t1Res.body.data.id);
      const t2 = buildCreateTenantPayload('AdminConflict2');
      const t2Res = await request(app.getHttpServer()).post('/api/v1/tenants').send(t2).expect(201);
      createdTenantIds.push(t2Res.body.data.id);

      await request(app.getHttpServer())
        .patch(`/api/v1/tenants/${t2Res.body.data.id}`)
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .send({ document: t1.document })
        .expect(409);
    });

    it('DELETE /tenants/:id: bloqueia com usuarios vinculados (409) e permite quando vazia (204)', async () => {
      const { superAdminAccessToken } = await createTenantWithSuperAdmin('AdminDeleteActor');
      const target = buildCreateTenantPayload('AdminDeleteTarget');
      const targetRes = await request(app.getHttpServer())
        .post('/api/v1/tenants')
        .send(target)
        .expect(201);
      const targetId = targetRes.body.data.id;

      // Tem 1 usuario (o admin criado junto com a empresa) -> bloqueado.
      await request(app.getHttpServer())
        .delete(`/api/v1/tenants/${targetId}`)
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .expect(409);

      // Exclusao logica do unico usuario direto no banco (nao ha fluxo pela
      // API para remover o ultimo usuario de uma empresa) para simular uma
      // empresa "vazia".
      await prisma.userAccount.updateMany({
        where: { tenantId: targetId },
        data: { deletedAt: new Date() },
      });

      await request(app.getHttpServer())
        .delete(`/api/v1/tenants/${targetId}`)
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/tenants/${targetId}`)
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .expect(404);
    });
  });

  describe('/tenant-settings', () => {
    it('GET/PATCH retornam e atualizam as configuracoes da propria empresa', async () => {
      const payload = buildCreateTenantPayload('SettingsResource');
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/tenants')
        .send(payload)
        .expect(201);
      const tenantId = createRes.body.data.id;
      createdTenantIds.push(tenantId);

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId, email: payload.admin.email, password: payload.admin.password })
        .expect(200);
      const auth = `Bearer ${loginRes.body.data.accessToken}`;

      const getRes = await request(app.getHttpServer())
        .get('/api/v1/tenant-settings')
        .set('Authorization', auth)
        .expect(200);
      expect(getRes.body.data.currency).toBe('BRL');

      const patchRes = await request(app.getHttpServer())
        .patch('/api/v1/tenant-settings')
        .set('Authorization', auth)
        .send({ timezone: 'America/Recife', gpsPingIntervalSeconds: 60 })
        .expect(200);
      expect(patchRes.body.data.timezone).toBe('America/Recife');
      expect(patchRes.body.data.gpsPingIntervalSeconds).toBe(60);
    });

    it('rejeita GET /tenant-settings sem token com 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/tenant-settings').expect(401);
    });
  });
});
