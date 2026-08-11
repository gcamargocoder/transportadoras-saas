import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TollDataProvider } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  NormalizedAnttConcessionTariffWithSource,
  TollDataProviderPort,
  TollTariffProviderFetchResult,
} from '../src/toll-data/interfaces/normalized-toll-plaza.interface';
import { TOLL_DATA_PROVIDERS } from '../src/toll-data/toll-data.constants';
import { ROUTING_PROVIDER } from '../src/routing/routing.constants';
import {
  CalculateRouteInput,
  CalculatedRoute,
  RoutingProviderPort,
} from '../src/routing/providers/routing-provider.interface';

// Fase 35 -- mesmo padrao de FakeTollDataProvider (Fase 33/34): substitui
// SOMENTE a fronteira externa (a fonte gov.br/antt) por um FAKE controlavel,
// exercitando 100% da logica real do sistema (matching, upsertFromAutomated
// Source, idempotencia, integracao com RoutePlan) contra o Postgres real,
// sem depender da rede da ANTT em CI. O provider real (download/parse/
// retry) ja e coberto por antt-concession-tariff.provider.spec.ts e
// antt-concession-tariff.parser.spec.ts com fixtures reais.
class FakeAnttConcessionTariffProvider implements TollDataProviderPort {
  readonly provider = TollDataProvider.ANTT_TARIFAS;
  private queue: Array<TollTariffProviderFetchResult | Error> = [];

  isAvailable(): boolean {
    return true;
  }

  enqueue(result: TollTariffProviderFetchResult | Error): void {
    this.queue.push(result);
  }

  async fetchTariffs(): Promise<TollTariffProviderFetchResult> {
    const next = this.queue.shift();
    if (!next) throw new Error('FakeAnttConcessionTariffProvider: nenhuma resposta enfileirada para este teste.');
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

function tariffRow(overrides: Partial<NormalizedAnttConcessionTariffWithSource> = {}): NormalizedAnttConcessionTariffWithSource {
  const concessionaire = overrides.concessionaire ?? 'Concessionaria Teste ANTT';
  return {
    concessionaire,
    highway: 'BR-999',
    km: 500,
    city: 'Cidade Teste',
    latitude: -22.1,
    longitude: -47.1,
    axleCategory: '9 eixos',
    price: 120.5,
    currency: 'BRL',
    sourceReference: 'https://www.gov.br/antt/exemplo/tarifas-de-pedagio',
    sourceDocument: `Tarifas de pedagio -- ${concessionaire} (gov.br/antt)`,
    ...overrides,
  };
}

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
function round7(value: number): number {
  return Math.round(value * 1e7) / 1e7;
}

describe('AnttConcessionTariff (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fakeProvider: FakeAnttConcessionTariffProvider;
  let fakeRoutingProvider: FakeRoutingProvider;
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    fakeProvider = new FakeAnttConcessionTariffProvider();
    fakeRoutingProvider = new FakeRoutingProvider();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TOLL_DATA_PROVIDERS)
      .useValue([fakeProvider])
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
  function randomPlate(): string {
    const letters = Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
    return `${letters}${Math.floor(1000 + Math.random() * 9000)}`;
  }

  async function createTenantAndLoginAsAdmin(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    const payload = {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `ct-${label.toLowerCase()}-${unique}`,
      admin: { name: `Admin ${label}`, email: `admin-${label.toLowerCase()}-${unique}@teste.com`, password: 'SenhaForte123!' },
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
    const loginRes = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ tenantId, email, password }).expect(200);
    return `Bearer ${loginRes.body.data.accessToken as string}`;
  }

  async function createTollPlaza(auth: string, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/toll-plazas')
      .set('Authorization', auth)
      .send({
        name: `Praca ${randomUUID()}`,
        operator: 'Concessionaria Teste ANTT',
        highway: 'BR-999',
        pricePerAxle: 10,
        latitude: -22.1,
        longitude: -47.1,
        ...overrides,
      })
      .expect(201);
    return res.body.data.id as string;
  }

  describe('sincronizacao de tarifas por concessao', () => {
    it('sincroniza uma concessao e cria TollRate com status PENDING_REVIEW (nunca VERIFIED sem confirmacao humana)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Sync1');
      const operator = `Concessionaria ${randomUUID()}`;
      const km = Math.round((1000 + Math.random() * 1000) * 1000) / 1000;
      const plazaId = await createTollPlaza(adminAuth, { operator, km });

      fakeProvider.enqueue({
        tariffs: [tariffRow({ concessionaire: operator, km, axleCategory: '9 eixos', price: 100 })],
        sourceReference: 'https://www.gov.br/antt/exemplo',
        failedConcessions: [],
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', adminAuth)
        .send({ provider: 'ANTT_TARIFAS' })
        .expect(200);

      expect(res.body.data.status).toBe('SUCCESS');
      expect(res.body.data.recordsCreated).toBe(1);

      const rate = await prisma.tollRate.findFirst({ where: { tollPlazaId: plazaId, axleCategory: '9 eixos' } });
      expect(rate).not.toBeNull();
      expect(rate!.status).toBe('PENDING_REVIEW');
      expect(Number(rate!.price)).toBe(100);
      expect(rate!.createdBy).toBeNull();
      expect(rate!.sourceDocument).toContain(operator);
    });

    it('segunda sincronizacao sem alteracao de valor resulta em UNCHANGED, nunca cria um segundo TollRate', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Sync2');
      const operator = `Concessionaria ${randomUUID()}`;
      const km = Math.round((2000 + Math.random() * 1000) * 1000) / 1000;
      const plazaId = await createTollPlaza(adminAuth, { operator, km });

      fakeProvider.enqueue({ tariffs: [tariffRow({ concessionaire: operator, km, price: 100 })], sourceReference: 'x', failedConcessions: [] });
      const first = await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', adminAuth)
        .send({ provider: 'ANTT_TARIFAS' })
        .expect(200);
      expect(first.body.data.recordsCreated).toBe(1);

      fakeProvider.enqueue({ tariffs: [tariffRow({ concessionaire: operator, km, price: 100 })], sourceReference: 'x', failedConcessions: [] });
      const second = await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', adminAuth)
        .send({ provider: 'ANTT_TARIFAS' })
        .expect(200);
      expect(second.body.data.recordsUnchanged).toBe(1);
      expect(second.body.data.recordsCreated).toBe(0);

      const count = await prisma.tollRate.count({ where: { tollPlazaId: plazaId, axleCategory: '9 eixos' } });
      expect(count).toBe(1);
    });

    it('mudanca de valor cria nova vigencia (UPDATED), fechando a anterior -- nunca sobrescreve historico', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Sync3');
      const operator = `Concessionaria ${randomUUID()}`;
      const km = Math.round((3000 + Math.random() * 1000) * 1000) / 1000;
      const plazaId = await createTollPlaza(adminAuth, { operator, km });

      fakeProvider.enqueue({ tariffs: [tariffRow({ concessionaire: operator, km, price: 100 })], sourceReference: 'x', failedConcessions: [] });
      await request(app.getHttpServer()).post('/api/v1/toll-data/sync').set('Authorization', adminAuth).send({ provider: 'ANTT_TARIFAS' }).expect(200);
      const firstRate = await prisma.tollRate.findFirst({ where: { tollPlazaId: plazaId, axleCategory: '9 eixos' } });
      expect(firstRate!.effectiveUntil).toBeNull();

      fakeProvider.enqueue({ tariffs: [tariffRow({ concessionaire: operator, km, price: 108 })], sourceReference: 'x', failedConcessions: [] });
      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', adminAuth)
        .send({ provider: 'ANTT_TARIFAS' })
        .expect(200);
      expect(res.body.data.recordsUpdated).toBe(1);

      const rates = await prisma.tollRate.findMany({ where: { tollPlazaId: plazaId, axleCategory: '9 eixos' }, orderBy: { effectiveFrom: 'asc' } });
      expect(rates).toHaveLength(2);
      expect(rates[0]!.effectiveUntil).not.toBeNull(); // a antiga foi fechada.
      expect(Number(rates[0]!.price)).toBe(100);
      expect(rates[1]!.effectiveUntil).toBeNull(); // a nova fica aberta.
      expect(Number(rates[1]!.price)).toBe(108);
    });

    it('GET .../effective-tariff reflete o valor sincronizado automaticamente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Sync4');
      const operator = `Concessionaria ${randomUUID()}`;
      const km = Math.round((4000 + Math.random() * 1000) * 1000) / 1000;
      const plazaId = await createTollPlaza(adminAuth, { operator, km });

      fakeProvider.enqueue({ tariffs: [tariffRow({ concessionaire: operator, km, price: 77.5 })], sourceReference: 'x', failedConcessions: [] });
      await request(app.getHttpServer()).post('/api/v1/toll-data/sync').set('Authorization', adminAuth).send({ provider: 'ANTT_TARIFAS' }).expect(200);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/toll-data/plazas/${plazaId}/effective-tariff`)
        .set('Authorization', adminAuth)
        .query({ axleCategory: '9 eixos' })
        .expect(200);
      expect(res.body.data.price).toBe(77.5);
      expect(res.body.data.status).toBe('PENDING_REVIEW');
    });

    it('9 eixos e 7 eixos sao sincronizados e consultados de forma independente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Sync5');
      const operator = `Concessionaria ${randomUUID()}`;
      const km = Math.round((5000 + Math.random() * 1000) * 1000) / 1000;
      await createTollPlaza(adminAuth, { operator, km });

      fakeProvider.enqueue({
        tariffs: [tariffRow({ concessionaire: operator, km, axleCategory: '9 eixos', price: 100 }), tariffRow({ concessionaire: operator, km, axleCategory: '7 eixos', price: 80 })],
        sourceReference: 'x',
        failedConcessions: [],
      });
      await request(app.getHttpServer()).post('/api/v1/toll-data/sync').set('Authorization', adminAuth).send({ provider: 'ANTT_TARIFAS' }).expect(200);

      const plaza = await prisma.tollPlaza.findFirst({ where: { operator, km } });
      const nine = await request(app.getHttpServer())
        .get(`/api/v1/toll-data/plazas/${plaza!.id}/effective-tariff`)
        .set('Authorization', adminAuth)
        .query({ axleCategory: '9 eixos' })
        .expect(200);
      const seven = await request(app.getHttpServer())
        .get(`/api/v1/toll-data/plazas/${plaza!.id}/effective-tariff`)
        .set('Authorization', adminAuth)
        .query({ axleCategory: '7 eixos' })
        .expect(200);
      expect(nine.body.data.price).toBe(100);
      expect(seven.body.data.price).toBe(80);
    });

    it('falha total da fonte preserva o snapshot anterior -- nunca apaga/zera tarifas existentes', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Sync6');
      const operator = `Concessionaria ${randomUUID()}`;
      const km = Math.round((6000 + Math.random() * 1000) * 1000) / 1000;
      const plazaId = await createTollPlaza(adminAuth, { operator, km });

      fakeProvider.enqueue({ tariffs: [tariffRow({ concessionaire: operator, km, price: 100 })], sourceReference: 'x', failedConcessions: [] });
      await request(app.getHttpServer()).post('/api/v1/toll-data/sync').set('Authorization', adminAuth).send({ provider: 'ANTT_TARIFAS' }).expect(200);
      const before = await prisma.tollRate.findFirst({ where: { tollPlazaId: plazaId } });

      fakeProvider.enqueue(new Error('pagina-indice da ANTT fora do ar'));
      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', adminAuth)
        .send({ provider: 'ANTT_TARIFAS' })
        .expect(200);
      expect(res.body.data.status).toBe('FAILED');

      const after = await prisma.tollRate.findFirst({ where: { tollPlazaId: plazaId } });
      expect(after).toEqual(before);
    });

    it('falha de UMA concessao (dentro do lote) nunca impede a persistencia das demais tarifas do mesmo lote', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Sync7');
      const operator = `Concessionaria OK ${randomUUID()}`;
      const km = Math.round((7000 + Math.random() * 1000) * 1000) / 1000;
      await createTollPlaza(adminAuth, { operator, km });

      fakeProvider.enqueue({
        tariffs: [tariffRow({ concessionaire: operator, km, price: 90 })],
        sourceReference: 'x',
        failedConcessions: [{ name: 'Outra Concessao (fora do ar)', reason: 'HTTP 503' }],
      });
      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', adminAuth)
        .send({ provider: 'ANTT_TARIFAS' })
        .expect(200);

      expect(res.body.data.status).toBe('PARTIAL');
      expect(res.body.data.recordsCreated).toBe(1);
      expect(res.body.data.recordsRejected).toBe(1);
      expect(res.body.data.errorMessage).toContain('Outra Concessao');

      const plaza = await prisma.tollPlaza.findFirst({ where: { operator, km } });
      const rate = await prisma.tollRate.findFirst({ where: { tollPlazaId: plaza!.id } });
      expect(rate).not.toBeNull();
    });

    it('quando 2+ pracas candidatas sao plausiveis, a tarifa e rejeitada -- nunca associada por adivinhacao', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Sync8');
      const operator = `Concessionaria Ambigua ${randomUUID()}`;
      const km = Math.round((8000 + Math.random() * 1000) * 1000) / 1000;
      await createTollPlaza(adminAuth, { operator, km: Math.round((km + 0.1) * 1000) / 1000 });
      await createTollPlaza(adminAuth, { operator, km: Math.round((km - 0.1) * 1000) / 1000 });

      fakeProvider.enqueue({ tariffs: [tariffRow({ concessionaire: operator, km, price: 55 })], sourceReference: 'x', failedConcessions: [] });
      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', adminAuth)
        .send({ provider: 'ANTT_TARIFAS' })
        .expect(200);

      expect(res.body.data.recordsRejected).toBe(1);
      expect(res.body.data.recordsCreated).toBe(0);
      const rateCount = await prisma.tollRate.count({ where: { axleCategory: '9 eixos', tollPlaza: { operator } } });
      expect(rateCount).toBe(0);
    });

    it('sem nenhuma praca candidata (concessionaria/rodovia/km desconhecidos), a tarifa e rejeitada -- nunca cria TollPlaza nova', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Sync9');
      const operator = `Concessionaria Inexistente ${randomUUID()}`;

      const plazaCountBefore = await prisma.tollPlaza.count();
      fakeProvider.enqueue({ tariffs: [tariffRow({ concessionaire: operator, km: 99999, highway: 'BR-777' })], sourceReference: 'x', failedConcessions: [] });
      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', adminAuth)
        .send({ provider: 'ANTT_TARIFAS' })
        .expect(200);

      expect(res.body.data.recordsRejected).toBe(1);
      const plazaCountAfter = await prisma.tollPlaza.count();
      expect(plazaCountAfter).toBe(plazaCountBefore); // nenhuma praca nova foi criada pelo provider de TARIFAS.
    });

    it('RBAC: somente SUPER_ADMIN pode sincronizar ANTT_TARIFAS -- OPERATOR e bloqueado', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Sync10');
      const operatorAuth = await createUserWithRole(adminAuth, tenantId, 'OPERATOR');

      await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', operatorAuth)
        .send({ provider: 'ANTT_TARIFAS' })
        .expect(403);
    });

    it('dado sincronizado e global: visivel a partir de outro tenant com papel de leitura (catalogo nao e duplicado por tenant)', async () => {
      const { adminAuth: adminA } = await createTenantAndLoginAsAdmin('Sync11A');
      const { adminAuth: adminB } = await createTenantAndLoginAsAdmin('Sync11B');
      const operator = `Concessionaria ${randomUUID()}`;
      const km = Math.round((9000 + Math.random() * 1000) * 1000) / 1000;
      const plazaId = await createTollPlaza(adminA, { operator, km });

      fakeProvider.enqueue({ tariffs: [tariffRow({ concessionaire: operator, km, price: 63 })], sourceReference: 'x', failedConcessions: [] });
      await request(app.getHttpServer()).post('/api/v1/toll-data/sync').set('Authorization', adminA).send({ provider: 'ANTT_TARIFAS' }).expect(200);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/toll-data/plazas/${plazaId}/effective-tariff`)
        .set('Authorization', adminB)
        .query({ axleCategory: '9 eixos' })
        .expect(200);
      expect(res.body.data.price).toBe(63);
    });
  });

  describe('integracao completa com viagem (Fase 35, secao 25)', () => {
    async function setupTripWithAxles(adminAuth: string, totalAxles: number) {
      const vehicleRes = await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', adminAuth)
        .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
        .expect(201);
      const vehicleId = vehicleRes.body.data.id as string;

      const driverRes = await request(app.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', adminAuth)
        .send({
          name: 'Jose da Silva',
          cpf: randomCpf(),
          cnhNumber: String(Math.floor(10000000000 + Math.random() * 89999999999)),
          cnhCategory: 'AE',
          cnhExpiresAt: '2027-06-30',
        })
        .expect(201);
      const driverId = driverRes.body.data.id as string;

      const compositionRes = await request(app.getHttpServer())
        .post('/api/v1/trip-compositions')
        .set('Authorization', adminAuth)
        .send({ vehicleId, trailers: [], axleConfiguration: { totalAxles, billableCategory: `${totalAxles} eixos` } })
        .expect(201);
      const compositionId = compositionRes.body.data.id as string;

      const originRes = await request(app.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', adminAuth)
        .send({ name: `Origem ${randomUUID()}`, address: 'Catanduva/SP', type: 'DISTRIBUTION_CENTER' })
        .expect(201);
      const destinationRes = await request(app.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', adminAuth)
        .send({ name: `Destino ${randomUUID()}`, address: 'Sao Paulo/SP', type: 'DISTRIBUTION_CENTER' })
        .expect(201);

      const tripRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', adminAuth)
        .send({
          driverId,
          compositionId,
          originLocationId: originRes.body.data.id,
          destinationLocationId: destinationRes.body.data.id,
          plannedDeparture: '2026-09-01T08:00:00.000Z',
          plannedArrival: '2026-09-02T18:00:00.000Z',
        })
        .expect(201);
      return { tripId: tripRes.body.data.id as string, vehicleId };
    }

    // TollTransactionsService exige que o veiculo tenha uma tag cadastrada
    // antes de aceitar qualquer passagem (mesmo lancamento manual) -- mesmo
    // pre-requisito ja usado em toll-data.e2e-spec.ts.
    async function registerVehicleTag(adminAuth: string, vehicleId: string): Promise<void> {
      const tagProviderRes = await request(app.getHttpServer()).get('/api/v1/tag-providers').set('Authorization', adminAuth).expect(200);
      const tagProviderId = tagProviderRes.body.data.find((p: { name: string }) => p.name === 'Sem Parar').id;
      await request(app.getHttpServer())
        .post(`/api/v1/vehicles/${vehicleId}/tags`)
        .set('Authorization', adminAuth)
        .send({ tagProviderId, tagNumber: String(Math.floor(1e9 + Math.random() * 8e9)), activatedAt: '2026-01-01' })
        .expect(201);
    }

    it('rota completa: sincroniza tarifa oficial, RoutePlan usa o catalogo, motorista passa com 9 eixos, conciliacao compara previsto x realizado', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Integ1');
      const operator = `Concessionaria Integracao ${randomUUID()}`;
      const baseLat = round7(-20 - Math.random() * 10);
      const baseLng = round7(-50 - Math.random() * 20);
      const plazaId = await createTollPlaza(adminAuth, {
        operator,
        highway: 'BR-999',
        km: Math.round((10000 + Math.random() * 1000) * 1000) / 1000,
        latitude: baseLat,
        longitude: baseLng,
        pricePerAxle: 5, // formula daria 5*9=45 -- a tarifa oficial sincronizada (130) deve prevalecer.
      });
      const plaza = await prisma.tollPlaza.findUniqueOrThrow({ where: { id: plazaId } });

      // 1) sincronizacao ANTT_TARIFAS real (via fake provider).
      fakeProvider.enqueue({
        tariffs: [tariffRow({ concessionaire: operator, highway: 'BR-999', km: Number(plaza.km), axleCategory: '9 eixos', price: 130 })],
        sourceReference: 'x',
        failedConcessions: [],
      });
      await request(app.getHttpServer()).post('/api/v1/toll-data/sync').set('Authorization', adminAuth).send({ provider: 'ANTT_TARIFAS' }).expect(200);

      // 2) viagem com composicao de 9 eixos.
      const { tripId, vehicleId } = await setupTripWithAxles(adminAuth, 9);
      await registerVehicleTag(adminAuth, vehicleId);

      // 3) RoutePlan calculado, passando exatamente pela praca.
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
      const routePlanRes = await request(app.getHttpServer()).post(`/api/v1/trips/${tripId}/route-plan`).set('Authorization', adminAuth).expect(201);

      // 4) RoutePlanToll usa a tarifa oficial (130), nunca a formula (5*9=45).
      expect(routePlanRes.body.data.tolls).toHaveLength(1);
      expect(routePlanRes.body.data.tolls[0].estimatedAmount).toBe(130);

      // 5) motorista passa com 9 eixos -- TollTransaction real.
      await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', adminAuth)
        .send({ tripId, tollPlazaId: plazaId, axleCount: 9, chargedAmount: 130, chargedAt: '2026-09-01T10:00:00.000Z' })
        .expect(201);

      // 6) conciliacao: desde a Fase 36, TollReconciliationService usa a
      // tarifa oficial vigente (catalogo TollRate) para a categoria de
      // eixos realmente usada, prevalecendo sobre a formula pricePerAxle x
      // eixos (5 * 9 = 45, que seria o valor antigo, pre-Fase-36).
      const reconciliationRes = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/toll-reconciliation`)
        .set('Authorization', adminAuth)
        .expect(200);
      const stop = reconciliationRes.body.data.stops[0];
      expect(stop.axleCount).toBe(9);
      expect(stop.expectedAmount).toBe(130);
      expect(stop.verdict).toBe('CORRECT');
    });

    it('transicao 9 -> 7 eixos: o catalogo permanece intacto, so a transacao real usa a contagem de eixos diferente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Integ2');
      const operator = `Concessionaria Transicao ${randomUUID()}`;
      const baseLat = round7(-20 - Math.random() * 10);
      const baseLng = round7(-50 - Math.random() * 20);
      const km = Math.round((11000 + Math.random() * 1000) * 1000) / 1000;
      const plazaId = await createTollPlaza(adminAuth, { operator, highway: 'BR-999', km, latitude: baseLat, longitude: baseLng, pricePerAxle: 10 });

      // Sincroniza AMBAS as categorias oficiais (9 e 7 eixos) -- exatamente
      // como a fonte real publica categorias distintas por numero de eixos.
      fakeProvider.enqueue({
        tariffs: [
          tariffRow({ concessionaire: operator, highway: 'BR-999', km, axleCategory: '9 eixos', price: 130 }),
          tariffRow({ concessionaire: operator, highway: 'BR-999', km, axleCategory: '7 eixos', price: 105 }),
        ],
        sourceReference: 'x',
        failedConcessions: [],
      });
      await request(app.getHttpServer()).post('/api/v1/toll-data/sync').set('Authorization', adminAuth).send({ provider: 'ANTT_TARIFAS' }).expect(200);

      const { tripId, vehicleId } = await setupTripWithAxles(adminAuth, 9);
      await registerVehicleTag(adminAuth, vehicleId);

      // RoutePlan precisa existir para a conciliacao ter paradas (sem
      // TollRoute manual, buildRouteStopInputs so le trip.currentRoutePlan).
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
      await request(app.getHttpServer()).post(`/api/v1/trips/${tripId}/route-plan`).set('Authorization', adminAuth).expect(201);

      // Motorista levantou eixos: passagem real com 7 (nao 9) -- AxleConfiguration/composicao NUNCA e alterada por isso.
      // chargedAmount = 70 (pricePerAxle(10) * 7) -- ver comentario abaixo
      // sobre por que a conciliacao usa a formula, nao o catalogo, nesta
      // parada especifica (excecao diverge do eixo planejado no RoutePlan).
      await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', adminAuth)
        .send({ tripId, tollPlazaId: plazaId, axleCount: 7, chargedAmount: 70, chargedAt: '2026-09-01T10:00:00.000Z' })
        .expect(201);

      // O catalogo continua tendo AMBAS as tarifas, intactas, para consulta futura.
      const nineStill = await request(app.getHttpServer())
        .get(`/api/v1/toll-data/plazas/${plazaId}/effective-tariff`)
        .set('Authorization', adminAuth)
        .query({ axleCategory: '9 eixos' })
        .expect(200);
      expect(nineStill.body.data.price).toBe(130);
      const sevenStill = await request(app.getHttpServer())
        .get(`/api/v1/toll-data/plazas/${plazaId}/effective-tariff`)
        .set('Authorization', adminAuth)
        .query({ axleCategory: '7 eixos' })
        .expect(200);
      expect(sevenStill.body.data.price).toBe(105);

      // A conciliacao (Fase 36, revisao) le a tarifa oficial DIRETO do
      // snapshot ja congelado em RoutePlanToll (calculado para o eixo
      // PLANEJADO, 9) -- nunca faz uma nova consulta ao catalogo durante a
      // conciliacao (proibido: "recalcular tarifa oficial durante
      // conciliacao"). Como a excecao real (7 eixos) diverge do eixo
      // planejado (9), o snapshot de "9 eixos"=130 nao se aplica a esta
      // parada -- cai no fallback pricePerAxle(10) * 7 = 70, exatamente
      // como o motor de conciliacao ja fazia antes da Fase 33/35 (nenhuma
      // regressao: a divergencia continua sendo detectada corretamente,
      // so a fonte do "esperado" nesta excecao especifica e a formula, nao
      // o catalogo -- ver docs/toll-data-providers.md, secao de
      // conciliacao).
      const reconciliationRes = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/toll-reconciliation`)
        .set('Authorization', adminAuth)
        .expect(200);
      const stop = reconciliationRes.body.data.stops[0];
      expect(stop.axleCount).toBe(7);
      expect(stop.expectedAmount).toBe(70);
      expect(stop.verdict).toBe('CORRECT');
    });
  });
});
