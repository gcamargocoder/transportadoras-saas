import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/utils/password.util';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const password = 'SenhaForte123!';
  let tenantId: string;
  let userEmail: string;

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

    userEmail = `auth-e2e-${randomUUID()}@teste.com`;
    // document e VARCHAR(20) no schema (CNPJ) -- usar um recorte curto do
    // uuid para caber, mantendo unicidade suficiente para o teste.
    const uniqueSuffix = randomUUID().replace(/-/g, '').slice(0, 17);
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Empresa Teste E2E',
        document: `E2E${uniqueSuffix}`,
        slug: `e2e-${uniqueSuffix}`,
      },
    });
    tenantId = tenant.id;

    await prisma.userAccount.create({
      data: {
        tenantId,
        name: 'Usuario Teste',
        email: userEmail,
        passwordHash: await hashPassword(password),
        role: 'ADMIN',
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    // Cascade (onDelete: Cascade) remove UserAccount + RefreshToken junto.
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await app.close();
  });

  it('rejeita senha incorreta com 401', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email: userEmail, password: 'senha-errada-123' })
      .expect(401);
  });

  it('rejeita login com tenantId correto mas de OUTRO tenant (isolamento) com 401', async () => {
    const otherSuffix = randomUUID().replace(/-/g, '').slice(0, 17);
    const otherTenant = await prisma.tenant.create({
      data: { name: 'Outra Empresa', document: `OTR${otherSuffix}`, slug: `otr-${otherSuffix}` },
    });

    // Mesmo e-mail/senha, mas tenantId de uma empresa diferente da que o
    // usuario pertence -- deve falhar exatamente como credencial invalida.
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId: otherTenant.id, email: userEmail, password })
      .expect(401);

    await prisma.tenant.delete({ where: { id: otherTenant.id } });
  });

  it('rejeita corpo invalido (e-mail malformado) com 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email: 'nao-e-email', password: 'qualquercoisa123' })
      .expect(400);
  });

  it('rejeita corpo invalido (tenantId ausente) com 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: userEmail, password })
      .expect(400);
  });

  it('rejeita acesso a rota protegida sem token com 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  it('rejeita refresh token invalido/malformado com 401', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'isto-nao-e-um-jwt' })
      .expect(401);
  });

  it('rejeita login de usuario inativo com 403', async () => {
    const inactiveEmail = `auth-e2e-inactive-${randomUUID()}@teste.com`;
    await prisma.userAccount.create({
      data: {
        tenantId,
        name: 'Usuario Inativo',
        email: inactiveEmail,
        passwordHash: await hashPassword(password),
        role: 'OPERATOR',
        isActive: false,
      },
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email: inactiveEmail, password })
      .expect(403);
  });

  it('fluxo completo: login -> me -> refresh (rotacao) -> reuso bloqueado -> logout -> token pos-logout bloqueado', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email: userEmail, password })
      .expect(200);

    const tokens = loginRes.body.data;
    expect(tokens.accessToken).toEqual(expect.any(String));
    expect(tokens.refreshToken).toEqual(expect.any(String));
    expect(tokens.tokenType).toBe('Bearer');
    expect(tokens.user.email).toBe(userEmail);
    expect(tokens.user.tenantId).toBe(tenantId);
    expect(tokens.user.passwordHash).toBeUndefined();

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);
    expect(meRes.body.data.email).toBe(userEmail);
    expect(meRes.body.data.tenantId).toBe(tenantId);

    const refreshRes = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(200);

    const rotated = refreshRes.body.data;
    // O refresh token sempre muda (jti aleatorio a cada emissao). O access
    // token PODE coincidir se emitido dentro do mesmo segundo (iat truncado
    // + mesmo payload => mesma assinatura) -- nao e comparado aqui por isso.
    expect(rotated.refreshToken).not.toBe(tokens.refreshToken);
    expect(rotated.accessToken).toEqual(expect.any(String));

    // Reuso do refresh token ja rotacionado deve ser rejeitado.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${rotated.accessToken}`)
      .send({ refreshToken: rotated.refreshToken })
      .expect(204);

    // Apos logout, o refresh token revogado nao pode mais ser usado.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotated.refreshToken })
      .expect(401);
  });
});
