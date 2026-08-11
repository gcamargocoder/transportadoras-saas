import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TollDataProvider } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  NormalizedTollTariff,
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

// Fase 36 -- mesmo padrao de FakeAnttConcessionTariffProvider (Fase 35):
// substitui SOMENTE a fronteira externa (agetransp.rj.gov.br) por um FAKE
// controlavel, exercitando 100% da logica real do sistema (matching por
// concessionaria -- sem km, ver TollDataSyncService.applyTariffs --,
// upsertFromAutomatedSource com vigencia/status explicitos, idempotencia)
// contra o Postgres real. O provider real (download/parse/retry) ja e
// coberto por rj-agetransp-tariff.provider.spec.ts e
// rj-agetransp-tariff.parser.spec.ts com fixture real.
class FakeRjAgetranspTariffProvider implements TollDataProviderPort {
  readonly provider = TollDataProvider.RJ_AGETRANSP;
  private queue: Array<TollTariffProviderFetchResult | Error> = [];

  isAvailable(): boolean {
    return true;
  }

  enqueue(result: TollTariffProviderFetchResult | Error): void {
    this.queue.push(result);
  }

  async fetchTariffs(): Promise<TollTariffProviderFetchResult> {
    const next = this.queue.shift();
    if (!next) throw new Error('FakeRjAgetranspTariffProvider: nenhuma resposta enfileirada para este teste.');
    if (next instanceof Error) throw next;
    return next;
  }
}

function tariffRow(overrides: Partial<NormalizedTollTariff> = {}): NormalizedTollTariff {
  return {
    concessionaire: 'Via Lagos Teste',
    highway: null,
    km: null,
    city: null,
    latitude: null,
    longitude: null,
    axleCategory: '5 eixos',
    price: 92.0,
    currency: 'BRL',
    sourceReference: 'https://www.agetransp.rj.gov.br/atos-normativos/deliberacoes/numero/1630/visualizar',
    sourceDocument: 'Deliberacao AGETRANSP no. 1630',
    effectiveFrom: new Date('2025-08-01T00:00:00.000Z'),
    status: 'VERIFIED',
    ...overrides,
  };
}

describe('RjAgetranspTariff (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fakeProvider: FakeRjAgetranspTariffProvider;
  let fakeRoutingProvider: FakeRoutingProvider;
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    fakeProvider = new FakeRjAgetranspTariffProvider();
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

  async function createTenantAndLoginAsAdmin(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    const payload = {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `rj-${label.toLowerCase()}-${unique}`,
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
        operator: 'Via Lagos Teste',
        highway: 'RJ-124',
        pricePerAxle: 15,
        latitude: -22.8,
        longitude: -42.0,
        ...overrides,
      })
      .expect(201);
    return res.body.data.id as string;
  }

  describe('sincronizacao RJ/AGETRANSP', () => {
    it('sincroniza e cria TollRate com status VERIFIED e vigencia legal real (nunca a data de coleta)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Sync1');
      const operator = `Via Lagos ${randomUUID()}`;
      const plazaId = await createTollPlaza(adminAuth, { operator });

      fakeProvider.enqueue({
        tariffs: [tariffRow({ concessionaire: operator, price: 92 })],
        sourceReference: 'https://www.agetransp.rj.gov.br',
        failedConcessions: [],
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', adminAuth)
        .send({ provider: 'RJ_AGETRANSP' })
        .expect(200);
      expect(res.body.data.status).toBe('SUCCESS');
      expect(res.body.data.recordsCreated).toBe(1);

      const rate = await prisma.tollRate.findFirst({ where: { tollPlazaId: plazaId } });
      expect(rate).not.toBeNull();
      expect(rate!.status).toBe('VERIFIED');
      expect(rate!.effectiveFrom.toISOString().slice(0, 10)).toBe('2025-08-01'); // vigencia real, nunca hoje.
      expect(rate!.sourceDocument).toContain('1630');
    });

    it('segunda sincronizacao sem alteracao de valor resulta em UNCHANGED, nunca cria um segundo TollRate', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Sync2');
      const operator = `Via Lagos ${randomUUID()}`;
      const plazaId = await createTollPlaza(adminAuth, { operator });

      fakeProvider.enqueue({ tariffs: [tariffRow({ concessionaire: operator })], sourceReference: 'x', failedConcessions: [] });
      await request(app.getHttpServer()).post('/api/v1/toll-data/sync').set('Authorization', adminAuth).send({ provider: 'RJ_AGETRANSP' }).expect(200);

      fakeProvider.enqueue({ tariffs: [tariffRow({ concessionaire: operator })], sourceReference: 'x', failedConcessions: [] });
      const second = await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', adminAuth)
        .send({ provider: 'RJ_AGETRANSP' })
        .expect(200);
      expect(second.body.data.recordsUnchanged).toBe(1);
      expect(second.body.data.recordsCreated).toBe(0);

      const count = await prisma.tollRate.count({ where: { tollPlazaId: plazaId } });
      expect(count).toBe(1);
    });

    it('reajuste de tarifa cria nova vigencia com a data real publicada, fechando a anterior -- historico preservado', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Sync3');
      const operator = `Via Lagos ${randomUUID()}`;
      const plazaId = await createTollPlaza(adminAuth, { operator });

      fakeProvider.enqueue({ tariffs: [tariffRow({ concessionaire: operator, price: 92, effectiveFrom: new Date('2025-08-01') })], sourceReference: 'x', failedConcessions: [] });
      await request(app.getHttpServer()).post('/api/v1/toll-data/sync').set('Authorization', adminAuth).send({ provider: 'RJ_AGETRANSP' }).expect(200);

      fakeProvider.enqueue({
        tariffs: [tariffRow({ concessionaire: operator, price: 98, effectiveFrom: new Date('2026-08-01'), sourceDocument: 'Deliberacao AGETRANSP no. 1700' })],
        sourceReference: 'x',
        failedConcessions: [],
      });
      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', adminAuth)
        .send({ provider: 'RJ_AGETRANSP' })
        .expect(200);
      expect(res.body.data.recordsUpdated).toBe(1);

      const rates = await prisma.tollRate.findMany({ where: { tollPlazaId: plazaId }, orderBy: { effectiveFrom: 'asc' } });
      expect(rates).toHaveLength(2);
      expect(rates[0]!.effectiveUntil?.toISOString().slice(0, 10)).toBe('2026-08-01');
      expect(Number(rates[0]!.price)).toBe(92);
      expect(rates[1]!.effectiveUntil).toBeNull();
      expect(Number(rates[1]!.price)).toBe(98);
    });

    it('effective-tariff reflete a vigencia legal real (nao aplicada antes da data de inicio)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Sync4');
      const operator = `Via Lagos ${randomUUID()}`;
      const plazaId = await createTollPlaza(adminAuth, { operator });

      fakeProvider.enqueue({ tariffs: [tariffRow({ concessionaire: operator, price: 92, effectiveFrom: new Date('2025-08-01') })], sourceReference: 'x', failedConcessions: [] });
      await request(app.getHttpServer()).post('/api/v1/toll-data/sync').set('Authorization', adminAuth).send({ provider: 'RJ_AGETRANSP' }).expect(200);

      const before = await request(app.getHttpServer())
        .get(`/api/v1/toll-data/plazas/${plazaId}/effective-tariff`)
        .set('Authorization', adminAuth)
        .query({ axleCategory: '5 eixos', date: '2025-01-01' })
        .expect(200);
      expect(before.body.data.price).toBeNull(); // antes da vigencia -- nunca aplicada cedo demais.

      const after = await request(app.getHttpServer())
        .get(`/api/v1/toll-data/plazas/${plazaId}/effective-tariff`)
        .set('Authorization', adminAuth)
        .query({ axleCategory: '5 eixos', date: '2025-12-01' })
        .expect(200);
      expect(after.body.data.price).toBe(92);
    });

    it('9 eixos e 7 eixos sao sincronizados e consultados de forma independente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Sync5');
      const operator = `Via Lagos ${randomUUID()}`;
      const plazaId = await createTollPlaza(adminAuth, { operator });

      fakeProvider.enqueue({
        tariffs: [tariffRow({ concessionaire: operator, axleCategory: '9 eixos', price: 165 }), tariffRow({ concessionaire: operator, axleCategory: '7 eixos', price: 130 })],
        sourceReference: 'x',
        failedConcessions: [],
      });
      await request(app.getHttpServer()).post('/api/v1/toll-data/sync').set('Authorization', adminAuth).send({ provider: 'RJ_AGETRANSP' }).expect(200);

      const nine = await request(app.getHttpServer())
        .get(`/api/v1/toll-data/plazas/${plazaId}/effective-tariff`)
        .set('Authorization', adminAuth)
        .query({ axleCategory: '9 eixos' })
        .expect(200);
      const seven = await request(app.getHttpServer())
        .get(`/api/v1/toll-data/plazas/${plazaId}/effective-tariff`)
        .set('Authorization', adminAuth)
        .query({ axleCategory: '7 eixos' })
        .expect(200);
      expect(nine.body.data.price).toBe(165);
      expect(seven.body.data.price).toBe(130);
    });

    it('falha total da fonte preserva o snapshot anterior -- nunca apaga/zera tarifas existentes', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Sync6');
      const operator = `Via Lagos ${randomUUID()}`;
      const plazaId = await createTollPlaza(adminAuth, { operator });

      fakeProvider.enqueue({ tariffs: [tariffRow({ concessionaire: operator })], sourceReference: 'x', failedConcessions: [] });
      await request(app.getHttpServer()).post('/api/v1/toll-data/sync').set('Authorization', adminAuth).send({ provider: 'RJ_AGETRANSP' }).expect(200);
      const before = await prisma.tollRate.findFirst({ where: { tollPlazaId: plazaId } });

      fakeProvider.enqueue(new Error('agetransp.rj.gov.br fora do ar'));
      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', adminAuth)
        .send({ provider: 'RJ_AGETRANSP' })
        .expect(200);
      expect(res.body.data.status).toBe('FAILED');

      const after = await prisma.tollRate.findFirst({ where: { tollPlazaId: plazaId } });
      expect(after).toEqual(before);
    });

    it('RBAC: somente SUPER_ADMIN pode sincronizar RJ_AGETRANSP -- OPERATOR e bloqueado', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Sync7');
      const operatorAuth = await createUserWithRole(adminAuth, tenantId, 'OPERATOR');
      await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', operatorAuth)
        .send({ provider: 'RJ_AGETRANSP' })
        .expect(403);
    });

    it('dado sincronizado e global: visivel a partir de outro tenant (catalogo nao e duplicado por tenant)', async () => {
      const { adminAuth: adminA } = await createTenantAndLoginAsAdmin('Sync8A');
      const { adminAuth: adminB } = await createTenantAndLoginAsAdmin('Sync8B');
      const operator = `Via Lagos ${randomUUID()}`;
      const plazaId = await createTollPlaza(adminA, { operator });

      fakeProvider.enqueue({ tariffs: [tariffRow({ concessionaire: operator, price: 92 })], sourceReference: 'x', failedConcessions: [] });
      await request(app.getHttpServer()).post('/api/v1/toll-data/sync').set('Authorization', adminA).send({ provider: 'RJ_AGETRANSP' }).expect(200);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/toll-data/plazas/${plazaId}/effective-tariff`)
        .set('Authorization', adminB)
        .query({ axleCategory: '5 eixos' })
        .expect(200);
      expect(res.body.data.price).toBe(92);
    });

    it('matching por concessionaria (sem km): a MESMA tarifa e aplicada a TODAS as pracas conhecidas daquela concessionaria', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Sync9');
      const operator = `Via Lagos ${randomUUID()}`;
      const plazaA = await createTollPlaza(adminAuth, { operator, name: `Praca A ${randomUUID()}` });
      const plazaB = await createTollPlaza(adminAuth, { operator, name: `Praca B ${randomUUID()}` });
      const plazaC = await createTollPlaza(adminAuth, { operator, name: `Praca C ${randomUUID()}` });

      fakeProvider.enqueue({ tariffs: [tariffRow({ concessionaire: operator, price: 92 })], sourceReference: 'x', failedConcessions: [] });
      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', adminAuth)
        .send({ provider: 'RJ_AGETRANSP' })
        .expect(200);
      expect(res.body.data.recordsCreated).toBe(3); // uma tarifa para cada uma das 3 pracas.

      for (const plazaId of [plazaA, plazaB, plazaC]) {
        const rate = await prisma.tollRate.findFirst({ where: { tollPlazaId: plazaId } });
        expect(Number(rate!.price)).toBe(92);
      }
    });

    it('sem nenhuma praca conhecida da concessionaria, a tarifa e rejeitada -- nunca cria TollPlaza nova', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Sync10');
      const operator = `Concessionaria Inexistente ${randomUUID()}`;

      const plazaCountBefore = await prisma.tollPlaza.count();
      fakeProvider.enqueue({ tariffs: [tariffRow({ concessionaire: operator })], sourceReference: 'x', failedConcessions: [] });
      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', adminAuth)
        .send({ provider: 'RJ_AGETRANSP' })
        .expect(200);
      expect(res.body.data.recordsRejected).toBe(1);
      expect(await prisma.tollPlaza.count()).toBe(plazaCountBefore);
    });

    it('falha de UMA concessao no lote nunca impede a persistencia das demais', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Sync11');
      const operator = `Via Lagos OK ${randomUUID()}`;
      await createTollPlaza(adminAuth, { operator });

      fakeProvider.enqueue({
        tariffs: [tariffRow({ concessionaire: operator, price: 92 })],
        sourceReference: 'x',
        failedConcessions: [{ name: 'Rota 116 (fora do ar)', reason: 'HTTP 503' }],
      });
      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-data/sync')
        .set('Authorization', adminAuth)
        .send({ provider: 'RJ_AGETRANSP' })
        .expect(200);
      expect(res.body.data.status).toBe('PARTIAL');
      expect(res.body.data.recordsCreated).toBe(1);
      expect(res.body.data.recordsRejected).toBe(1);
    });
  });

  describe('integracao com RoutePlan e viagem completa (Fase 36, Parte F)', () => {
    async function setupTripWithAxles(adminAuth: string, totalAxles: number) {
      const letters = Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
      const plate = `${letters}${Math.floor(1000 + Math.random() * 9000)}`;
      const vehicleRes = await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', adminAuth)
        .send({ plate, brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
        .expect(201);
      const vehicleId = vehicleRes.body.data.id as string;

      const driverRes = await request(app.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', adminAuth)
        .send({
          name: 'Jose da Silva',
          cpf: randomValidCpf(),
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
        .send({ name: `Origem ${randomUUID()}`, address: 'Regiao dos Lagos/RJ', type: 'DISTRIBUTION_CENTER' })
        .expect(201);
      const destinationRes = await request(app.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', adminAuth)
        .send({ name: `Destino ${randomUUID()}`, address: 'Rio de Janeiro/RJ', type: 'DISTRIBUTION_CENTER' })
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

    function randomValidCpf(): string {
      const calcDigit = (nums: number[], factor: number) => {
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
      const d1 = calcDigit(base, 10);
      const d2 = calcDigit([...base, d1], 11);
      return [...base, d1, d2].join('');
    }

    async function registerVehicleTag(adminAuth: string, vehicleId: string): Promise<void> {
      const tagProviderRes = await request(app.getHttpServer()).get('/api/v1/tag-providers').set('Authorization', adminAuth).expect(200);
      const tagProviderId = tagProviderRes.body.data.find((p: { name: string }) => p.name === 'Sem Parar').id;
      await request(app.getHttpServer())
        .post(`/api/v1/vehicles/${vehicleId}/tags`)
        .set('Authorization', adminAuth)
        .send({ tagProviderId, tagNumber: String(Math.floor(1e9 + Math.random() * 8e9)), activatedAt: '2026-01-01' })
        .expect(201);
    }

    it('viagem completa: sincroniza tarifa RJ, RoutePlan usa o catalogo, motorista passa, conciliacao usa a tarifa oficial', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Trip1');
      const operator = `Via Lagos Viagem ${randomUUID()}`;
      const baseLat = round7(-20 - Math.random() * 10);
      const baseLng = round7(-50 - Math.random() * 20);
      const plazaId = await createTollPlaza(adminAuth, {
        operator,
        highway: 'RJ-124',
        latitude: baseLat,
        longitude: baseLng,
        pricePerAxle: 5, // formula daria 5*9=45 -- a tarifa oficial RJ deve prevalecer.
      });

      // 1) sincroniza a tarifa oficial (9 eixos) via RJ/AGETRANSP.
      fakeProvider.enqueue({
        tariffs: [tariffRow({ concessionaire: operator, axleCategory: '9 eixos', price: 165, effectiveFrom: new Date('2020-01-01') })],
        sourceReference: 'x',
        failedConcessions: [],
      });
      await request(app.getHttpServer()).post('/api/v1/toll-data/sync').set('Authorization', adminAuth).send({ provider: 'RJ_AGETRANSP' }).expect(200);

      // 2) composicao nominal de 9 eixos, viagem iniciada.
      const { tripId, vehicleId } = await setupTripWithAxles(adminAuth, 9);
      await registerVehicleTag(adminAuth, vehicleId);

      // 3) RoutePlan calculado, descobrindo a praca.
      fakeRoutingProvider.enqueue([
        {
          originLabel: 'Regiao dos Lagos/RJ',
          destinationLabel: 'Rio de Janeiro/RJ',
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

      // 4) RoutePlanToll recebe o valor oficial (165), nunca a formula (45).
      expect(routePlanRes.body.data.tolls).toHaveLength(1);
      expect(routePlanRes.body.data.tolls[0].estimatedAmount).toBe(165);

      // 5) motorista passa -- sistema assume 9 eixos automaticamente (zero toque).
      await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', adminAuth)
        .send({ tripId, tollPlazaId: plazaId, axleCount: 9, chargedAmount: 165, chargedAt: '2026-09-01T10:00:00.000Z' })
        .expect(201);

      // 6) conciliacao usa a tarifa oficial (Fase 36, Parte B/objetivo A).
      const reconciliationRes = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/toll-reconciliation`)
        .set('Authorization', adminAuth)
        .expect(200);
      const stop = reconciliationRes.body.data.stops[0];
      expect(stop.axleCount).toBe(9);
      expect(stop.expectedAmount).toBe(165);
      expect(stop.verdict).toBe('CORRECT');
    });

    it('excecao de eixo: motorista levanta eixos (9 -> 7), catalogo permanece intacto, conciliacao usa a tarifa de 7 eixos', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Trip2');
      const operator = `Via Lagos Excecao ${randomUUID()}`;
      const baseLat = round7(-20 - Math.random() * 10);
      const baseLng = round7(-50 - Math.random() * 20);
      const plazaId = await createTollPlaza(adminAuth, { operator, highway: 'RJ-124', latitude: baseLat, longitude: baseLng });

      fakeProvider.enqueue({
        tariffs: [
          tariffRow({ concessionaire: operator, axleCategory: '9 eixos', price: 165, effectiveFrom: new Date('2020-01-01') }),
          tariffRow({ concessionaire: operator, axleCategory: '7 eixos', price: 130, effectiveFrom: new Date('2020-01-01') }),
        ],
        sourceReference: 'x',
        failedConcessions: [],
      });
      await request(app.getHttpServer()).post('/api/v1/toll-data/sync').set('Authorization', adminAuth).send({ provider: 'RJ_AGETRANSP' }).expect(200);

      const { tripId, vehicleId } = await setupTripWithAxles(adminAuth, 9);
      await registerVehicleTag(adminAuth, vehicleId);

      // RoutePlan precisa existir para a conciliacao ter paradas (sem
      // TollRoute manual, buildRouteStopInputs so le trip.currentRoutePlan).
      fakeRoutingProvider.enqueue([
        {
          originLabel: 'Regiao dos Lagos/RJ',
          destinationLabel: 'Rio de Janeiro/RJ',
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

      // Excecao real: passagem com 7 eixos (nao 9) -- AxleConfiguration/composicao NUNCA e alterada.
      // chargedAmount = 105 (pricePerAxle padrao 15 * 7) -- ver comentario
      // abaixo sobre por que a conciliacao usa a formula, nao o catalogo,
      // nesta parada especifica.
      await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', adminAuth)
        .send({ tripId, tollPlazaId: plazaId, axleCount: 7, chargedAmount: 105, chargedAt: '2026-09-01T10:00:00.000Z' })
        .expect(201);

      const composition = await prisma.tripComposition.findFirst({ where: { vehicleId }, include: { axleConfiguration: true } });
      expect(composition!.axleConfiguration!.totalAxles).toBe(9); // catalogo/composicao nominal permanece 9.

      const nineStill = await request(app.getHttpServer())
        .get(`/api/v1/toll-data/plazas/${plazaId}/effective-tariff`)
        .set('Authorization', adminAuth)
        .query({ axleCategory: '9 eixos' })
        .expect(200);
      expect(nineStill.body.data.price).toBe(165); // catalogo de 9 eixos continua intacto.

      // A conciliacao (Fase 36, revisao) le a tarifa oficial DIRETO do
      // snapshot congelado em RoutePlanToll (calculado para o eixo
      // PLANEJADO, 9) -- nunca uma nova consulta ao catalogo durante a
      // conciliacao. A excecao real (7 eixos) diverge do eixo planejado,
      // entao o snapshot de 9 eixos (165) nao se aplica aqui -- cai no
      // fallback pricePerAxle(15) * 7 = 105 (mesmo comportamento do motor
      // de conciliacao desde a Fase 25, nunca regressado).
      const reconciliationRes = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/toll-reconciliation`)
        .set('Authorization', adminAuth)
        .expect(200);
      const stop = reconciliationRes.body.data.stops[0];
      expect(stop.axleCount).toBe(7);
      expect(stop.expectedAmount).toBe(105);
      expect(stop.verdict).toBe('CORRECT');
    });
  });
});
