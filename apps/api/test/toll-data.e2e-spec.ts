import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  NormalizedTollPlaza,
  TollDataProviderFetchResult,
  TollDataProviderPort,
} from '../src/toll-data/interfaces/normalized-toll-plaza.interface';
import { TOLL_DATA_PROVIDERS } from '../src/toll-data/toll-data.constants';
import { ROUTING_PROVIDER } from '../src/routing/routing.constants';
import {
  CalculateRouteInput,
  CalculatedRoute,
  RoutingProviderPort,
} from '../src/routing/providers/routing-provider.interface';

// Fase 33 -- mesmo padrao de test/routing.e2e-spec.ts (FakeRoutingProvider):
// substitui SOMENTE a fronteira externa (o provider de dados) por um FAKE
// controlavel via override de DI, exercitando 100% da logica real do NOSSO
// sistema (TollDataSyncService: matching, versionamento, idempotencia,
// tratamento de falha) contra o Postgres de teste real, sem depender de
// rede nem simular sucesso de fontes ainda nao confirmadas (ANTT real e
// ARTESP real continuam cobertas separadamente pelos specs de provider).
class FakeTollDataProvider implements TollDataProviderPort {
  readonly provider: 'ANTT' | 'ARTESP';
  available = true;
  private queue: Array<TollDataProviderFetchResult | Error> = [];

  constructor(provider: 'ANTT' | 'ARTESP') {
    this.provider = provider;
  }

  isAvailable(): boolean {
    return this.available;
  }

  enqueue(result: TollDataProviderFetchResult | Error): void {
    this.queue.push(result);
  }

  async fetchPlazas(): Promise<TollDataProviderFetchResult> {
    const next = this.queue.shift();
    if (!next) throw new Error('FakeTollDataProvider: nenhuma resposta enfileirada para este teste.');
    if (next instanceof Error) throw next;
    return next;
  }
}

class FakeRoutingProvider implements RoutingProviderPort {
  readonly providerName = 'FAKE';
  private queue: CalculatedRoute[][] = [];

  isConfigured(): boolean {
    return true;
  }

  enqueue(routes: CalculatedRoute[]): void {
    this.queue.push(routes);
  }

  async calculateRoutes(_input: CalculateRouteInput): Promise<CalculatedRoute[]> {
    const next = this.queue.shift();
    if (!next) throw new Error('FakeRoutingProvider: nenhuma resposta enfileirada para este teste.');
    return next;
  }
}

function normalizedPlaza(overrides: Partial<NormalizedTollPlaza> = {}): NormalizedTollPlaza {
  return {
    sourceKey: `test-${randomUUID()}`,
    name: 'Praca Teste ANTT',
    concessionaire: 'Concessionaria Teste',
    highway: 'BR-000',
    km: 100,
    city: 'Cidade Teste',
    state: 'SP',
    latitude: -23.5,
    longitude: -46.6,
    status: 'Ativo',
    raw: { fixture: true },
    ...overrides,
  };
}

describe('TollData (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fakeAntt: FakeTollDataProvider;
  let fakeArtesp: FakeTollDataProvider;
  let fakeRoutingProvider: FakeRoutingProvider;
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    fakeAntt = new FakeTollDataProvider('ANTT');
    fakeArtesp = new FakeTollDataProvider('ARTESP');
    fakeRoutingProvider = new FakeRoutingProvider();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TOLL_DATA_PROVIDERS)
      .useValue([fakeAntt, fakeArtesp])
      .overrideProvider(ROUTING_PROVIDER)
      .useValue(fakeRoutingProvider)
      .compile();

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
  function randomCpf(): string {
    const calc = (nums: number[], factor: number) => {
      let total = 0;
      let f = factor;
      for (const n of nums) {
        total += n * f;
        f -= 1;
      }
      const r = total % 11;
      return r < 2 ? 0 : 11 - r;
    };
    const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 9));
    const d1 = calc(base, 10);
    const d2 = calc([...base, d1], 11);
    return [...base, d1, d2].join('');
  }

  async function createTenantAndLoginAsAdmin(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    const payload = {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `td-${label.toLowerCase()}-${unique}`,
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

  async function createUserWithRole(adminAuth: string, tenantId: string, role: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 10);
    const email = `user-${role.toLowerCase()}-${unique}@teste.com`;
    const password = 'SenhaForte123!';
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', adminAuth)
      .send({ name: `Usuario ${role}`, email, password, role })
      .expect(201);
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email, password })
      .expect(200);
    return `Bearer ${loginRes.body.data.accessToken as string}`;
  }

  async function createTollPlaza(auth: string, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/toll-plazas')
      .set('Authorization', auth)
      .send({
        name: `Praca ${randomUUID()}`,
        operator: 'Concessionaria Teste',
        highway: 'BR-000',
        pricePerAxle: 10,
        latitude: -23.5,
        longitude: -46.6,
        ...overrides,
      })
      .expect(201);
    return res.body.data.id as string;
  }

  describe('RBAC', () => {
    it('somente SUPER_ADMIN pode disparar POST /toll-data/sync -- ADMIN e DRIVER sao bloqueados', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Rbac1');
      const driverAuth = await createUserWithRole(adminAuth, tenantId, 'DRIVER');
      const operatorAuth = await createUserWithRole(adminAuth, tenantId, 'OPERATOR');

      fakeAntt.enqueue({ plazas: [], sourceReference: 'test://antt' });
      await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', adminAuth)
        .send({ provider: 'ANTT' })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', driverAuth)
        .send({ provider: 'ANTT' })
        .expect(403);
      await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', operatorAuth)
        .send({ provider: 'ANTT' })
        .expect(403);
      await request(app.getHttpServer()).post('/api/v1/toll-data/sync').send({ provider: 'ANTT' }).expect(401);
    });

    it('somente SUPER_ADMIN pode registrar tarifa oficial (POST /toll-data/rates) -- OPERATOR e bloqueado', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Rbac2');
      const operatorAuth = await createUserWithRole(adminAuth, tenantId, 'OPERATOR');
      const plazaId = await createTollPlaza(adminAuth);

      await request(app.getHttpServer())
        .post('/api/v1/toll-data/rates')
        .set('Authorization', operatorAuth)
        .send({
          tollPlazaId: plazaId,
          axleCategory: '9 eixos',
          price: 100,
          effectiveFrom: '2026-01-01',
          provider: 'ANTT',
          sourceDocument: 'doc-1',
          sourceReference: 'ref-1',
          collectedAt: '2026-01-01',
        })
        .expect(403);
    });

    it('papeis operacionais (OPERATOR) podem ler o catalogo, DRIVER nao pode', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Rbac3');
      const driverAuth = await createUserWithRole(adminAuth, tenantId, 'DRIVER');
      const operatorAuth = await createUserWithRole(adminAuth, tenantId, 'OPERATOR');

      await request(app.getHttpServer()).get('/api/v1/toll-data/sources').set('Authorization', operatorAuth).expect(200);
      await request(app.getHttpServer()).get('/api/v1/toll-data/sources').set('Authorization', driverAuth).expect(403);
    });
  });

  describe('sincronizacao -- identidade de praca e versionamento', () => {
    it('primeira sincronizacao cria uma nova TollPlaza + link quando nenhum candidato casa', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Sync1');
      const operator = `Operadora ${randomUUID()}`;
      const plaza = normalizedPlaza({ concessionaire: operator, km: 12345 });
      fakeAntt.enqueue({ plazas: [plaza], sourceReference: 'test://antt/1' });

      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', adminAuth)
        .send({ provider: 'ANTT' })
        .expect(200);

      expect(res.body.data.status).toBe('SUCCESS');
      expect(res.body.data.recordsCreated).toBe(1);
      expect(res.body.data.recordsUpdated).toBe(0);

      const created = await prisma.tollPlaza.findFirst({ where: { operator, name: plaza.name } });
      expect(created).not.toBeNull();
      const link = await prisma.tollPlazaDataSourceLink.findFirst({
        where: { provider: 'ANTT', sourceKey: plaza.sourceKey },
      });
      expect(link).not.toBeNull();
      expect(link!.matchConfidence).toBe('LINKED');
      expect(link!.tollPlazaId).toBe(created!.id);
    });

    it('e idempotente: rodar a mesma sincronizacao duas vezes nao duplica a praca (segunda vez = UNCHANGED)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Sync2');
      const operator = `Operadora ${randomUUID()}`;
      const plaza = normalizedPlaza({ concessionaire: operator, km: 22345 });

      fakeAntt.enqueue({ plazas: [plaza], sourceReference: 'test://antt/2' });
      const first = await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', adminAuth)
        .send({ provider: 'ANTT' })
        .expect(200);
      expect(first.body.data.recordsCreated).toBe(1);

      const countAfterFirst = await prisma.tollPlaza.count({ where: { operator } });
      expect(countAfterFirst).toBe(1);

      fakeAntt.enqueue({ plazas: [plaza], sourceReference: 'test://antt/2' });
      const second = await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', adminAuth)
        .send({ provider: 'ANTT' })
        .expect(200);
      expect(second.body.data.recordsCreated).toBe(0);
      expect(second.body.data.recordsUnchanged).toBe(1);

      const countAfterSecond = await prisma.tollPlaza.count({ where: { operator } });
      expect(countAfterSecond).toBe(1);
    });

    it('atualiza a praca vinculada quando o dado normalizado muda (ex: nome), reconhecida pelo mesmo sourceKey', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Sync3');
      const operator = `Operadora ${randomUUID()}`;
      const plaza = normalizedPlaza({ concessionaire: operator, km: 32345, name: 'Nome Antigo' });

      fakeAntt.enqueue({ plazas: [plaza], sourceReference: 'test://antt/3' });
      await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', adminAuth)
        .send({ provider: 'ANTT' })
        .expect(200);

      const renamed = { ...plaza, name: 'Nome Novo' };
      fakeAntt.enqueue({ plazas: [renamed], sourceReference: 'test://antt/3' });
      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', adminAuth)
        .send({ provider: 'ANTT' })
        .expect(200);
      expect(res.body.data.recordsUpdated).toBe(1);
      expect(res.body.data.recordsCreated).toBe(0);

      const updated = await prisma.tollPlaza.findFirst({ where: { operator } });
      expect(updated!.name).toBe('Nome Novo');
      const stillOne = await prisma.tollPlaza.count({ where: { operator } });
      expect(stillOne).toBe(1);
    });

    it('quando 2+ pracas existentes casam com a mesma identidade, NUNCA mescla automaticamente -- cria nova com PENDING_REVIEW', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Sync4');
      const operator = `Operadora Ambigua ${randomUUID()}`;
      const highway = `BR-${Math.floor(Math.random() * 900) + 100}`;
      const km = Math.round(40000 + Math.random() * 1000);

      await createTollPlaza(adminAuth, { operator, highway, km: km + 0.1 });
      await createTollPlaza(adminAuth, { operator, highway, km: km - 0.1 });

      const countBefore = await prisma.tollPlaza.count({ where: { operator } });
      expect(countBefore).toBe(2);

      const plaza = normalizedPlaza({ concessionaire: operator, highway, km });
      fakeAntt.enqueue({ plazas: [plaza], sourceReference: 'test://antt/4' });
      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', adminAuth)
        .send({ provider: 'ANTT' })
        .expect(200);

      expect(res.body.data.recordsCreated).toBe(1);
      const countAfter = await prisma.tollPlaza.count({ where: { operator } });
      expect(countAfter).toBe(3); // as 2 antigas continuam intactas + 1 nova (nunca mesclou)

      const link = await prisma.tollPlazaDataSourceLink.findFirst({
        where: { provider: 'ANTT', sourceKey: plaza.sourceKey },
      });
      expect(link!.matchConfidence).toBe('PENDING_REVIEW');
    });

    it('quando a fonte esta indisponivel (isAvailable=false), marca a execucao como FAILED e NAO altera dados existentes', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Sync5');
      fakeArtesp.available = false;

      const before = await prisma.tollPlaza.count();
      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', adminAuth)
        .send({ provider: 'ARTESP' })
        .expect(200);

      expect(res.body.data.status).toBe('FAILED');
      expect(res.body.data.recordsCreated).toBe(0);
      const after = await prisma.tollPlaza.count();
      expect(after).toBe(before);

      const source = await prisma.tollDataSource.findUnique({ where: { provider: 'ARTESP' } });
      expect(source!.lastError).not.toBeNull();

      fakeArtesp.available = true; // nao vaza estado para os proximos testes.
    });

    it('quando o provider falha ao buscar dados (erro de rede/formato), marca FAILED e preserva o ultimo snapshot valido', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Sync6');
      const operator = `Operadora Falha ${randomUUID()}`;
      const plaza = normalizedPlaza({ concessionaire: operator, km: 55555 });

      fakeAntt.enqueue({ plazas: [plaza], sourceReference: 'test://antt/6' });
      await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', adminAuth)
        .send({ provider: 'ANTT' })
        .expect(200);
      const snapshotBefore = await prisma.tollPlaza.findFirst({ where: { operator } });

      fakeAntt.enqueue(new Error('formato inesperado da fonte'));
      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', adminAuth)
        .send({ provider: 'ANTT' })
        .expect(200);
      expect(res.body.data.status).toBe('FAILED');

      const snapshotAfter = await prisma.tollPlaza.findFirst({ where: { operator } });
      expect(snapshotAfter).toEqual(snapshotBefore); // nada foi apagado/alterado.
    });

    it('GET /toll-data/sync-runs pagina e filtra por provider/status', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Sync7');
      fakeAntt.enqueue({ plazas: [], sourceReference: 'test://antt/7' });
      const syncRes = await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', adminAuth)
        .send({ provider: 'ANTT' })
        .expect(200);

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/toll-data/sync-runs')
        .set('Authorization', adminAuth)
        .query({ provider: 'ANTT', status: 'SUCCESS', pageSize: 5 })
        .expect(200);

      expect(listRes.body.data.items.length).toBeGreaterThan(0);
      expect(listRes.body.data.items.every((r: { provider: string; status: string }) => r.provider === 'ANTT' && r.status === 'SUCCESS')).toBe(true);
      expect(listRes.body.data.items.map((r: { id: string }) => r.id)).toContain(syncRes.body.data.runId);
      expect(listRes.body.data.meta.page).toBe(1);
    });
  });

  describe('tarifas oficiais -- entrada administrativa, versionamento e consulta', () => {
    it('registra uma tarifa oficial exigindo fonte/documento/data de coleta', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Rate1');
      const plazaId = await createTollPlaza(adminAuth);

      await request(app.getHttpServer())
        .post('/api/v1/toll-data/rates')
        .set('Authorization', adminAuth)
        .send({
          tollPlazaId: plazaId,
          axleCategory: '9 eixos',
          price: 87.4,
          effectiveFrom: '2026-01-01',
          provider: 'ANTT',
          // sourceDocument faltando de proposito.
          sourceReference: 'ref-1',
          collectedAt: '2026-01-01',
        })
        .expect(400);

      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-data/rates')
        .set('Authorization', adminAuth)
        .send({
          tollPlazaId: plazaId,
          axleCategory: '9 eixos',
          price: 87.4,
          effectiveFrom: '2026-01-01',
          provider: 'ANTT',
          sourceDocument: 'Deliberacao 123',
          sourceReference: 'https://dados.antt.gov.br/exemplo',
          collectedAt: '2026-01-01',
        })
        .expect(201);

      expect(res.body.data.price).toBe(87.4);
      expect(res.body.data.status).toBe('VERIFIED');
      expect(res.body.data.sourceDocument).toBe('Deliberacao 123');
    });

    it('versiona: uma nova tarifa da mesma praca/categoria fecha automaticamente a vigencia anterior', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Rate2');
      const plazaId = await createTollPlaza(adminAuth);
      const rateDto = (price: number, effectiveFrom: string) => ({
        tollPlazaId: plazaId,
        axleCategory: '9 eixos',
        price,
        effectiveFrom,
        provider: 'ANTT',
        sourceDocument: 'doc',
        sourceReference: 'ref',
        collectedAt: effectiveFrom,
      });

      const firstRes = await request(app.getHttpServer())
        .post('/api/v1/toll-data/rates')
        .set('Authorization', adminAuth)
        .send(rateDto(80, '2026-01-01'))
        .expect(201);
      expect(firstRes.body.data.effectiveUntil).toBeNull();

      await request(app.getHttpServer())
        .post('/api/v1/toll-data/rates')
        .set('Authorization', adminAuth)
        .send(rateDto(90, '2026-06-01'))
        .expect(201);

      const closed = await prisma.tollRate.findUnique({ where: { id: firstRes.body.data.id } });
      expect(closed!.effectiveUntil?.toISOString().slice(0, 10)).toBe('2026-06-01');
    });

    it('rejeita duas tarifas com a mesma vigencia inicial (mesma praca/categoria/effectiveFrom) com 409', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Rate3');
      const plazaId = await createTollPlaza(adminAuth);
      const rateDto = {
        tollPlazaId: plazaId,
        axleCategory: '9 eixos',
        price: 80,
        effectiveFrom: '2026-01-01',
        provider: 'ANTT',
        sourceDocument: 'doc',
        sourceReference: 'ref',
        collectedAt: '2026-01-01',
      };
      await request(app.getHttpServer()).post('/api/v1/toll-data/rates').set('Authorization', adminAuth).send(rateDto).expect(201);
      await request(app.getHttpServer()).post('/api/v1/toll-data/rates').set('Authorization', adminAuth).send(rateDto).expect(409);
    });

    it('GET /toll-data/plazas/:id/tariffs devolve o historico completo (atual + anteriores)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Rate4');
      const plazaId = await createTollPlaza(adminAuth);
      const rateDto = (price: number, effectiveFrom: string) => ({
        tollPlazaId: plazaId,
        axleCategory: '9 eixos',
        price,
        effectiveFrom,
        provider: 'ANTT',
        sourceDocument: 'doc',
        sourceReference: 'ref',
        collectedAt: effectiveFrom,
      });
      await request(app.getHttpServer()).post('/api/v1/toll-data/rates').set('Authorization', adminAuth).send(rateDto(80, '2026-01-01')).expect(201);
      await request(app.getHttpServer()).post('/api/v1/toll-data/rates').set('Authorization', adminAuth).send(rateDto(90, '2026-06-01')).expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/toll-data/plazas/${plazaId}/tariffs`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.items.map((r: { price: number }) => r.price).sort()).toEqual([80, 90]);
    });

    it('GET .../effective-tariff nunca inventa valor: sem tarifa cadastrada, devolve tudo null', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Rate5');
      const plazaId = await createTollPlaza(adminAuth);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/toll-data/plazas/${plazaId}/effective-tariff`)
        .set('Authorization', adminAuth)
        .query({ axleCategory: '9 eixos' })
        .expect(200);
      expect(res.body.data.price).toBeNull();
      expect(res.body.data.status).toBeNull();
    });

    it('GET .../effective-tariff respeita a vigencia: valor antigo antes da troca, novo valor depois', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Rate6');
      const plazaId = await createTollPlaza(adminAuth);
      const rateDto = (price: number, effectiveFrom: string) => ({
        tollPlazaId: plazaId,
        axleCategory: '9 eixos',
        price,
        effectiveFrom,
        provider: 'ANTT',
        sourceDocument: 'doc',
        sourceReference: 'ref',
        collectedAt: effectiveFrom,
      });
      await request(app.getHttpServer()).post('/api/v1/toll-data/rates').set('Authorization', adminAuth).send(rateDto(80, '2026-01-01')).expect(201);
      await request(app.getHttpServer()).post('/api/v1/toll-data/rates').set('Authorization', adminAuth).send(rateDto(90, '2026-06-01')).expect(201);

      const beforeChange = await request(app.getHttpServer())
        .get(`/api/v1/toll-data/plazas/${plazaId}/effective-tariff`)
        .set('Authorization', adminAuth)
        .query({ axleCategory: '9 eixos', date: '2026-03-01' })
        .expect(200);
      expect(beforeChange.body.data.price).toBe(80);

      const afterChange = await request(app.getHttpServer())
        .get(`/api/v1/toll-data/plazas/${plazaId}/effective-tariff`)
        .set('Authorization', adminAuth)
        .query({ axleCategory: '9 eixos', date: '2026-07-01' })
        .expect(200);
      expect(afterChange.body.data.price).toBe(90);
    });

    it('9 eixos e 7 eixos sao tarifas independentes na mesma praca', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Rate7');
      const plazaId = await createTollPlaza(adminAuth);
      const rateDto = (axleCategory: string, price: number) => ({
        tollPlazaId: plazaId,
        axleCategory,
        price,
        effectiveFrom: '2026-01-01',
        provider: 'ANTT',
        sourceDocument: 'doc',
        sourceReference: 'ref',
        collectedAt: '2026-01-01',
      });
      await request(app.getHttpServer()).post('/api/v1/toll-data/rates').set('Authorization', adminAuth).send(rateDto('9 eixos', 90)).expect(201);
      await request(app.getHttpServer()).post('/api/v1/toll-data/rates').set('Authorization', adminAuth).send(rateDto('7 eixos', 70)).expect(201);

      const nineAxles = await request(app.getHttpServer())
        .get(`/api/v1/toll-data/plazas/${plazaId}/effective-tariff`)
        .set('Authorization', adminAuth)
        .query({ axleCategory: '9 eixos' })
        .expect(200);
      const sevenAxles = await request(app.getHttpServer())
        .get(`/api/v1/toll-data/plazas/${plazaId}/effective-tariff`)
        .set('Authorization', adminAuth)
        .query({ axleCategory: '7 eixos' })
        .expect(200);
      expect(nineAxles.body.data.price).toBe(90);
      expect(sevenAxles.body.data.price).toBe(70);
    });
  });

  describe('integracao com RoutePlan (secao 16/17)', () => {
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
          cpf: randomCpf(),
          cnhNumber: String(Math.floor(10000000000 + Math.random() * 89999999999)),
          cnhCategory: 'AE',
          cnhExpiresAt: '2027-06-30',
        })
        .expect(201);
      return res.body.data.id as string;
    }
    async function createComposition(auth: string, vehicleId: string, totalAxles: number) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/trip-compositions')
        .set('Authorization', auth)
        .send({ vehicleId, trailers: [], axleConfiguration: { totalAxles, billableCategory: `${totalAxles} eixos` } })
        .expect(201);
      return res.body.data.id as string;
    }
    async function createLocation(auth: string, name: string, address: string) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', auth)
        .send({ name, address, type: 'DISTRIBUTION_CENTER' })
        .expect(201);
      return res.body.data.id as string;
    }

    it('quando existe tarifa oficial vigente, RoutePlanToll.estimatedAmount usa o catalogo (nao a formula pricePerAxle)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('RoutePlan1');
      // Coordenadas proprias e isoladas desta execucao (mesmo cuidado de
      // test/routing.e2e-spec.ts): TollPlaza e uma tabela GLOBAL nunca limpa
      // entre execucoes de teste, entao uma coordenada fixa colidiria com a
      // praca criada por uma execucao anterior deste mesmo teste.
      const round7 = (value: number) => Math.round(value * 1e7) / 1e7;
      const baseLat = round7(-20 - Math.random() * 10);
      const baseLng = round7(-50 - Math.random() * 20);
      const plazaId = await createTollPlaza(adminAuth, {
        name: `Praca RoutePlan ${randomUUID()}`,
        latitude: baseLat,
        longitude: baseLng,
        pricePerAxle: 15, // formula daria 15*9=135 -- a tarifa oficial abaixo deve prevalecer.
      });
      await request(app.getHttpServer())
        .post('/api/v1/toll-data/rates')
        .set('Authorization', adminAuth)
        .send({
          tollPlazaId: plazaId,
          axleCategory: '9 eixos',
          price: 200,
          effectiveFrom: '2020-01-01',
          provider: 'ANTT',
          sourceDocument: 'doc',
          sourceReference: 'ref',
          collectedAt: '2020-01-01',
        })
        .expect(201);

      const vehicleId = await createVehicle(adminAuth);
      const driverId = await createDriver(adminAuth);
      const compositionId = await createComposition(adminAuth, vehicleId, 9);
      const originId = await createLocation(adminAuth, `Origem ${randomUUID()}`, 'Catanduva/SP');
      const destinationId = await createLocation(adminAuth, `Destino ${randomUUID()}`, 'Sao Paulo/SP');
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

      fakeRoutingProvider.enqueue([
        {
          originLabel: 'Catanduva/SP',
          destinationLabel: 'Sao Paulo/SP',
          originLatitude: baseLat,
          originLongitude: baseLng,
          destinationLatitude: round7(baseLat + 0.01),
          destinationLongitude: baseLng,
          distanceMeters: 5_000,
          durationSeconds: 600,
          // linha reta de 2 pontos passando exatamente pela praca -- reaproveita
          // o mesmo encoder inline usado por routing.e2e-spec.
          encodedPolyline: encodePolyline([
            { latitude: baseLat, longitude: baseLng },
            { latitude: round7(baseLat + 0.01), longitude: baseLng },
          ]),
          providerRouteId: null,
          hasTolls: true,
          estimatedTollAmount: null,
          estimatedTollCurrency: 'BRL',
        },
      ]);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/route-plan`)
        .set('Authorization', adminAuth)
        .expect(201);

      expect(res.body.data.tolls).toHaveLength(1);
      expect(res.body.data.tolls[0].estimatedAmount).toBe(200); // tarifa oficial, nao 135 (formula).
    });
  });
});

// Mesmo algoritmo publico "Encoded Polyline" usado em test/routing.e2e-spec.ts,
// duplicado aqui de proposito (convencao ja estabelecida neste projeto: cada
// arquivo de e2e mantem seus proprios helpers, sem modulo compartilhado).
function encodePolyline(points: { latitude: number; longitude: number }[]): string {
  let result = '';
  let prevLat = 0;
  let prevLng = 0;
  for (const point of points) {
    const lat = Math.round(point.latitude * 1e5);
    const lng = Math.round(point.longitude * 1e5);
    result += encodeValue(lat - prevLat) + encodeValue(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return result;
}

function encodeValue(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let output = '';
  while (v >= 0x20) {
    output += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  output += String.fromCharCode(v + 63);
  return output;
}
