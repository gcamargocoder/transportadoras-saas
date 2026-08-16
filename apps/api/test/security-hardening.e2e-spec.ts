import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AppConfig } from '../src/config/configuration';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase 46 -- testes dos MECANISMOS NOVOS desta fase. Cobertura ja existente
// e reaproveitada, nunca duplicada aqui: auth.e2e-spec.ts ja cobre refresh
// invalido/reuso bloqueado/token pos-logout/login cross-tenant/usuario
// inativo; drivers.e2e-spec.ts, tenants.e2e-spec.ts e driver-trips.e2e-spec.ts
// ja cobrem IDOR/RBAC/isolamento multi-tenant por dominio (paradao
// findOwnedOrThrow auditado nesta fase, consistente em todos os modulos de
// escrita). Testes de upload com assinatura de conteudo invalida ficam nos
// specs de dominio (toll-import.e2e-spec.ts, checklists.e2e-spec.ts) --
// reaproveitam a infraestrutura de fixture ja existente la, evitando
// duplicar setup pesado aqui.
//
// NAO ha teste e2e de "429 apos exceder o rate limit": o ThrottlerGuard
// inteiro e desligado quando NODE_ENV=test (throttler.config.ts, decisao
// PRE-EXISTENTE e deliberada, para nao gerar 429 espurio no volume de
// requisicoes da suite inteira) -- nao alterado nesta fase para nao
// arriscar instabilidade em todos os outros specs. A aplicacao do preset
// UPLOAD_THROTTLE/ADMIN_THROTTLE nos endpoints novos foi verificada por
// leitura direta do codigo (ver relatorio final), nao por e2e.
describe('Security hardening (Fase 46) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let jwtConfig: AppConfig['jwt'];
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
    jwtService = moduleRef.get(JwtService);
    const configService = moduleRef.get<ConfigService<AppConfig, true>>(ConfigService);
    jwtConfig = configService.get('jwt', { infer: true });
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

  async function createTenantAndLoginAsAdmin(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    const password = 'SenhaForte123!';
    const email = `admin-${label.toLowerCase()}-${unique}@teste.com`;
    const payload = {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `sec-${label.toLowerCase()}-${unique}`,
      admin: { name: `Admin ${label}`, email, password },
    };

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/tenants')
      .send(payload)
      .expect(201);
    const tenantId: string = createRes.body.data.id;
    createdTenantIds.push(tenantId);

    await prisma.userAccount.update({
      where: { tenantId_email: { tenantId, email } },
      data: { role: 'SUPER_ADMIN' },
    });

    return { tenantId, email, password };
  }

  async function login(tenantId: string, email: string, password: string) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email, password });
  }

  // ==========================================================================
  // Bloqueio temporario por conta (brute force) -- LoginProtectionService
  // ==========================================================================
  describe('bloqueio temporario de login por conta', () => {
    it('bloqueia a conta apos 5 falhas mesmo com a senha CORRETA na 6a tentativa', async () => {
      const { tenantId, email, password } = await createTenantAndLoginAsAdmin('Lockout');

      // 5 tentativas com senha errada -- todas 401 (resposta generica).
      for (let i = 0; i < 5; i += 1) {
        const res = await login(tenantId, email, 'senha-errada-de-proposito-1');
        expect(res.status).toBe(401);
      }

      // 6a tentativa: senha CORRETA, mas a conta ja esta temporariamente
      // bloqueada -- continua 401 (nunca revela o estado de bloqueio,
      // resposta identica a credencial invalida).
      const blockedRes = await login(tenantId, email, password);
      expect(blockedRes.status).toBe(401);
    });

    // A chave do bloqueio e tenantId+email (LoginProtectionService) --
    // este caso usa um tenant/conta totalmente diferente do teste acima e
    // loga com sucesso de primeira, provando implicitamente que o
    // bloqueio do teste anterior nao vazou para outra conta (o
    // LoginProtectionService e um singleton compartilhado por todos os
    // testes deste arquivo, na mesma instancia da aplicacao).
    it('login bem-sucedido limpa o contador -- 4 falhas + 1 sucesso + mais 4 falhas nao bloqueia (nunca acumula entre janelas resetadas)', async () => {
      const { tenantId, email, password } = await createTenantAndLoginAsAdmin('LockoutReset');

      for (let i = 0; i < 4; i += 1) {
        await login(tenantId, email, 'senha-errada-de-proposito-2');
      }

      // Sucesso limpa o contador.
      const successRes = await login(tenantId, email, password);
      expect(successRes.status).toBe(200);

      // Mais 4 falhas (menos que o limite de 5) -- ainda nao bloqueia,
      // prova que o sucesso realmente resetou a contagem anterior.
      for (let i = 0; i < 4; i += 1) {
        await login(tenantId, email, 'senha-errada-de-proposito-3');
      }
      const stillWorksRes = await login(tenantId, email, password);
      expect(stillWorksRes.status).toBe(200);
    });
  });

  // ==========================================================================
  // Token JWT expirado
  // ==========================================================================
  describe('token expirado', () => {
    it('access token com exp no passado (mesmo segredo/payload validos) e rejeitado com 401', async () => {
      const { tenantId, email, password } = await createTenantAndLoginAsAdmin('ExpiredJwt');
      const loginRes = await login(tenantId, email, password);
      const { user } = loginRes.body.data;

      const expiredToken = await jwtService.signAsync(
        { sub: user.id, tenantId: user.tenantId, role: user.role, email: user.email },
        { secret: jwtConfig.accessSecret, expiresIn: -10 },
      );

      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });
  });

  // ==========================================================================
  // Politica de complexidade de senha
  // ==========================================================================
  describe('politica de complexidade de senha', () => {
    it('rejeita senha sem numero na criacao de usuario (400)', async () => {
      const { tenantId, email, password } = await createTenantAndLoginAsAdmin('WeakPwUser');
      const loginRes = await login(tenantId, email, password);
      const auth = `Bearer ${loginRes.body.data.accessToken as string}`;

      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', auth)
        .send({ name: 'Usuario Fraco', email: `fraco-${randomUUID()}@teste.com`, password: 'apenasletras', role: 'OPERATOR' })
        .expect(400);
    });

    it('rejeita senha sem letra na criacao do admin inicial do tenant (400)', async () => {
      const unique = randomUUID().replace(/-/g, '').slice(0, 12);
      await request(app.getHttpServer())
        .post('/api/v1/tenants')
        .send({
          name: `Transportadora WeakPwTenant ${unique}`,
          document: randomCnpj(),
          slug: `sec-weakpwtenant-${unique}`,
          admin: { name: 'Admin Fraco', email: `admin-fraco-${unique}@teste.com`, password: '12345678' },
        })
        .expect(400);
    });

    it('aceita senha com letra+numero (>=8) normalmente (201)', async () => {
      const { tenantId, email, password } = await createTenantAndLoginAsAdmin('OkPw');
      const loginRes = await login(tenantId, email, password);
      const auth = `Bearer ${loginRes.body.data.accessToken as string}`;

      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', auth)
        .send({ name: 'Usuario Ok', email: `ok-${randomUUID()}@teste.com`, password: 'SenhaValida789!', role: 'OPERATOR' })
        .expect(201);
    });
  });

  // ==========================================================================
  // IDOR -- spot-check representativo (cobertura completa por dominio ja
  // existe nos specs proprios, ver comentario do topo do arquivo)
  // ==========================================================================
  describe('IDOR (spot-check)', () => {
    it('tenant B nao consegue ler/alterar/excluir veiculo do tenant A so pelo id', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IdorA');
      const tenantB = await createTenantAndLoginAsAdmin('IdorB');
      const authA = `Bearer ${(await login(tenantA.tenantId, tenantA.email, tenantA.password)).body.data.accessToken as string}`;
      const authB = `Bearer ${(await login(tenantB.tenantId, tenantB.email, tenantB.password)).body.data.accessToken as string}`;

      const vehicleRes = await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', authA)
        .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
        .expect(201);
      const vehicleId = vehicleRes.body.data.id as string;

      await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleId}`)
        .set('Authorization', authB)
        .expect(404);

      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleId}`)
        .set('Authorization', authB)
        .send({ brand: 'Scania' })
        .expect(404);

      await request(app.getHttpServer())
        .delete(`/api/v1/vehicles/${vehicleId}`)
        .set('Authorization', authB)
        .expect(404);

      const stillOwnedByA = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
      expect(stillOwnedByA?.tenantId).toBe(tenantA.tenantId);
      expect(stillOwnedByA?.brand).toBe('Volvo');
      expect(stillOwnedByA?.deletedAt).toBeNull();
    });
  });
});
