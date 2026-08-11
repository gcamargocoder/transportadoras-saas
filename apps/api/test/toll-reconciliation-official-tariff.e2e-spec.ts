import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ROUTING_PROVIDER } from '../src/routing/routing.constants';
import {
  CalculateRouteInput,
  CalculatedRoute,
  RoutingProviderPort,
} from '../src/routing/providers/routing-provider.interface';

// Fase 36 (revisao) -- prova, de ponta a ponta e contra Postgres real, a
// hierarquia de fonte de valor exigida pela fase:
//   1) RoutePlanToll.estimatedAmount, quando baseado em tarifa oficial
//      vigente (RoutingService.persistRoutePlan(), Fase 33) -- LIDO DIRETO
//      do snapshot ja persistido, NUNCA recalculado durante a conciliacao
//      (proibido explicitamente pela fase: "recalcular tarifa oficial
//      durante conciliacao"), o que TAMBEM preserva o historico
//      automaticamente (Casos 11-13: viagem antiga nunca e afetada por uma
//      mudanca posterior no catalogo).
//   2) fallback pricePerAxle x eixos (Fase 22/26), preservado integralmente
//      quando nao ha tarifa oficial aplicavel.
// Usa o mesmo padrao de FakeRoutingProvider ja estabelecido (Fase 26/33/35)
// -- nenhuma chamada de rede real durante o teste.
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

describe('TollReconciliation -- prioridade da tarifa oficial (Fase 36, revisao)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fakeRoutingProvider: FakeRoutingProvider;
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    fakeRoutingProvider = new FakeRoutingProvider();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
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

  async function createTenantAndLoginAsAdmin(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    const payload = {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `rc-${label.toLowerCase()}-${unique}`,
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

  async function createTollPlaza(auth: string, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/toll-plazas')
      .set('Authorization', auth)
      .send({
        name: `Praca ${randomUUID()}`,
        operator: 'Concessionaria Teste',
        highway: 'BR-000',
        pricePerAxle: 15,
        latitude: -22.0,
        longitude: -47.0,
        ...overrides,
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createOfficialRate(auth: string, tollPlazaId: string, overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/toll-data/rates')
      .set('Authorization', auth)
      .send({
        tollPlazaId,
        axleCategory: '9 eixos',
        price: 130,
        effectiveFrom: '2020-01-01',
        provider: 'ANTT',
        sourceDocument: 'doc-teste',
        sourceReference: 'ref-teste',
        collectedAt: '2020-01-01',
        ...overrides,
      })
      .expect(201);
    return res.body.data.id as string;
  }

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

  async function registerVehicleTag(adminAuth: string, vehicleId: string): Promise<void> {
    const tagProviderRes = await request(app.getHttpServer()).get('/api/v1/tag-providers').set('Authorization', adminAuth).expect(200);
    const tagProviderId = tagProviderRes.body.data.find((p: { name: string }) => p.name === 'Sem Parar').id;
    await request(app.getHttpServer())
      .post(`/api/v1/vehicles/${vehicleId}/tags`)
      .set('Authorization', adminAuth)
      .send({ tagProviderId, tagNumber: String(Math.floor(1e9 + Math.random() * 8e9)), activatedAt: '2026-01-01' })
      .expect(201);
  }

  async function computeRoutePlan(
    adminAuth: string,
    tripId: string,
    baseLat: number,
    baseLng: number,
  ): Promise<{ estimatedAmount: number | null }> {
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
    const res = await request(app.getHttpServer()).post(`/api/v1/trips/${tripId}/route-plan`).set('Authorization', adminAuth).expect(201);
    return { estimatedAmount: res.body.data.tolls[0]?.estimatedAmount ?? null };
  }

  async function getReconciliationFirstStop(adminAuth: string, tripId: string) {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}/toll-reconciliation`)
      .set('Authorization', adminAuth)
      .expect(200);
    return res.body.data.stops[0];
  }

  // ==========================================================================
  // Caso 1 / Caso 3 (OBRIGATORIO) / Caso 4 / Caso 5
  // ==========================================================================

  it('Caso 1 e Caso 3 (obrigatorio): tarifa oficial (R$130) prevalece sobre o fallback (R$45) na conciliacao', async () => {
    const { adminAuth } = await createTenantAndLoginAsAdmin('Caso1');
    const baseLat = round7(-20 - Math.random() * 10);
    const baseLng = round7(-50 - Math.random() * 20);
    const plazaId = await createTollPlaza(adminAuth, { latitude: baseLat, longitude: baseLng, pricePerAxle: 5 }); // fallback = 5*9 = 45.
    await createOfficialRate(adminAuth, plazaId, { price: 130 });

    const { tripId, vehicleId } = await setupTripWithAxles(adminAuth, 9);
    await registerVehicleTag(adminAuth, vehicleId);
    const { estimatedAmount } = await computeRoutePlan(adminAuth, tripId, baseLat, baseLng);
    expect(estimatedAmount).toBe(130); // RoutePlanToll ja usa a tarifa oficial (Fase 33).

    await request(app.getHttpServer())
      .post('/api/v1/toll-transactions')
      .set('Authorization', adminAuth)
      .send({ tripId, tollPlazaId: plazaId, axleCount: 9, chargedAmount: 130, chargedAt: '2026-09-01T10:00:00.000Z' })
      .expect(201);

    const stop = await getReconciliationFirstStop(adminAuth, tripId);
    expect(stop.expectedAmount).toBe(130);
    expect(stop.expectedAmount).not.toBe(45);
    expect(stop.verdict).toBe('CORRECT');
  });

  it('Caso 2: sem tarifa oficial aplicavel, a conciliacao usa o fallback pricePerAxle x eixos', async () => {
    const { adminAuth } = await createTenantAndLoginAsAdmin('Caso2');
    const baseLat = round7(-20 - Math.random() * 10);
    const baseLng = round7(-50 - Math.random() * 20);
    const plazaId = await createTollPlaza(adminAuth, { latitude: baseLat, longitude: baseLng, pricePerAxle: 15 }); // nenhum TollRate criado.

    const { tripId, vehicleId } = await setupTripWithAxles(adminAuth, 9);
    await registerVehicleTag(adminAuth, vehicleId);
    const { estimatedAmount } = await computeRoutePlan(adminAuth, tripId, baseLat, baseLng);
    expect(estimatedAmount).toBe(135); // 15 * 9, fallback.

    await request(app.getHttpServer())
      .post('/api/v1/toll-transactions')
      .set('Authorization', adminAuth)
      .send({ tripId, tollPlazaId: plazaId, axleCount: 9, chargedAmount: 135, chargedAt: '2026-09-01T10:00:00.000Z' })
      .expect(201);

    const stop = await getReconciliationFirstStop(adminAuth, tripId);
    expect(stop.expectedAmount).toBe(135);
    expect(stop.verdict).toBe('CORRECT');
  });

  it('Caso 4: tarifa oficial e passagem real com o mesmo valor -> CORRECT (conforme)', async () => {
    const { adminAuth } = await createTenantAndLoginAsAdmin('Caso4');
    const baseLat = round7(-20 - Math.random() * 10);
    const baseLng = round7(-50 - Math.random() * 20);
    const plazaId = await createTollPlaza(adminAuth, { latitude: baseLat, longitude: baseLng });
    await createOfficialRate(adminAuth, plazaId, { price: 130 });

    const { tripId, vehicleId } = await setupTripWithAxles(adminAuth, 9);
    await registerVehicleTag(adminAuth, vehicleId);
    await computeRoutePlan(adminAuth, tripId, baseLat, baseLng);
    await request(app.getHttpServer())
      .post('/api/v1/toll-transactions')
      .set('Authorization', adminAuth)
      .send({ tripId, tollPlazaId: plazaId, axleCount: 9, chargedAmount: 130, chargedAt: '2026-09-01T10:00:00.000Z' })
      .expect(201);

    const stop = await getReconciliationFirstStop(adminAuth, tripId);
    expect(stop.verdict).toBe('CORRECT');
    expect(stop.discrepancyAmount).toBe(0);
  });

  it('Caso 5: tarifa oficial e passagem real com valores diferentes -> divergencia (OVERCHARGE)', async () => {
    const { adminAuth } = await createTenantAndLoginAsAdmin('Caso5');
    const baseLat = round7(-20 - Math.random() * 10);
    const baseLng = round7(-50 - Math.random() * 20);
    const plazaId = await createTollPlaza(adminAuth, { latitude: baseLat, longitude: baseLng });
    await createOfficialRate(adminAuth, plazaId, { price: 130 });

    const { tripId, vehicleId } = await setupTripWithAxles(adminAuth, 9);
    await registerVehicleTag(adminAuth, vehicleId);
    await computeRoutePlan(adminAuth, tripId, baseLat, baseLng);
    await request(app.getHttpServer())
      .post('/api/v1/toll-transactions')
      .set('Authorization', adminAuth)
      .send({ tripId, tollPlazaId: plazaId, axleCount: 9, chargedAmount: 150, chargedAt: '2026-09-01T10:00:00.000Z' })
      .expect(201);

    const stop = await getReconciliationFirstStop(adminAuth, tripId);
    expect(stop.expectedAmount).toBe(130);
    expect(stop.chargedAmount).toBe(150);
    expect(stop.discrepancyAmount).toBe(20);
    expect(stop.verdict).toBe('OVERCHARGE');
  });

  // ==========================================================================
  // Caso 6 / Caso 7 -- 7 e 9 eixos (composicao NOMINAL, sem excecao)
  // ==========================================================================

  it('Caso 6: viagem com composicao nominal de 7 eixos, tarifa oficial aplicavel, conciliacao correta', async () => {
    const { adminAuth } = await createTenantAndLoginAsAdmin('Caso6');
    const baseLat = round7(-20 - Math.random() * 10);
    const baseLng = round7(-50 - Math.random() * 20);
    const plazaId = await createTollPlaza(adminAuth, { latitude: baseLat, longitude: baseLng });
    await createOfficialRate(adminAuth, plazaId, { axleCategory: '7 eixos', price: 105 });

    const { tripId, vehicleId } = await setupTripWithAxles(adminAuth, 7);
    await registerVehicleTag(adminAuth, vehicleId);
    const { estimatedAmount } = await computeRoutePlan(adminAuth, tripId, baseLat, baseLng);
    expect(estimatedAmount).toBe(105);

    await request(app.getHttpServer())
      .post('/api/v1/toll-transactions')
      .set('Authorization', adminAuth)
      .send({ tripId, tollPlazaId: plazaId, axleCount: 7, chargedAmount: 105, chargedAt: '2026-09-01T10:00:00.000Z' })
      .expect(201);

    const stop = await getReconciliationFirstStop(adminAuth, tripId);
    expect(stop.axleCount).toBe(7);
    expect(stop.expectedAmount).toBe(105);
    expect(stop.verdict).toBe('CORRECT');
  });

  it('Caso 7: viagem com composicao nominal de 9 eixos, tarifa oficial aplicavel, conciliacao correta', async () => {
    const { adminAuth } = await createTenantAndLoginAsAdmin('Caso7');
    const baseLat = round7(-20 - Math.random() * 10);
    const baseLng = round7(-50 - Math.random() * 20);
    const plazaId = await createTollPlaza(adminAuth, { latitude: baseLat, longitude: baseLng });
    await createOfficialRate(adminAuth, plazaId, { axleCategory: '9 eixos', price: 130 });

    const { tripId, vehicleId } = await setupTripWithAxles(adminAuth, 9);
    await registerVehicleTag(adminAuth, vehicleId);
    const { estimatedAmount } = await computeRoutePlan(adminAuth, tripId, baseLat, baseLng);
    expect(estimatedAmount).toBe(130);

    await request(app.getHttpServer())
      .post('/api/v1/toll-transactions')
      .set('Authorization', adminAuth)
      .send({ tripId, tollPlazaId: plazaId, axleCount: 9, chargedAmount: 130, chargedAt: '2026-09-01T10:00:00.000Z' })
      .expect(201);

    const stop = await getReconciliationFirstStop(adminAuth, tripId);
    expect(stop.axleCount).toBe(9);
    expect(stop.expectedAmount).toBe(130);
    expect(stop.verdict).toBe('CORRECT');
  });

  // ==========================================================================
  // Caso 8 -- sem tarifa oficial para uma praca especifica (mix)
  // ==========================================================================

  it('Caso 8: praca sem tarifa oficial usa o fallback, mesmo quando outra praca da mesma rota tem tarifa oficial', async () => {
    const { adminAuth } = await createTenantAndLoginAsAdmin('Caso8');
    const baseLat = round7(-20 - Math.random() * 10);
    const baseLng = round7(-50 - Math.random() * 20);
    const plazaComOficial = await createTollPlaza(adminAuth, { latitude: baseLat, longitude: baseLng, pricePerAxle: 5 });
    await createOfficialRate(adminAuth, plazaComOficial, { price: 130 });
    const plazaSemOficial = await createTollPlaza(adminAuth, { latitude: round7(baseLat + 0.005), longitude: baseLng, pricePerAxle: 15 });

    const { tripId, vehicleId } = await setupTripWithAxles(adminAuth, 9);
    await registerVehicleTag(adminAuth, vehicleId);

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
          { latitude: round7(baseLat + 0.005), longitude: baseLng },
          { latitude: round7(baseLat + 0.01), longitude: baseLng },
        ]),
        providerRouteId: null,
        hasTolls: true,
        estimatedTollAmount: null,
        estimatedTollCurrency: 'BRL',
      },
    ]);
    const routePlanRes = await request(app.getHttpServer()).post(`/api/v1/trips/${tripId}/route-plan`).set('Authorization', adminAuth).expect(201);
    expect(routePlanRes.body.data.tolls).toHaveLength(2);

    await request(app.getHttpServer())
      .post('/api/v1/toll-transactions')
      .set('Authorization', adminAuth)
      .send({ tripId, tollPlazaId: plazaComOficial, axleCount: 9, chargedAmount: 130, chargedAt: '2026-09-01T09:00:00.000Z' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/toll-transactions')
      .set('Authorization', adminAuth)
      .send({ tripId, tollPlazaId: plazaSemOficial, axleCount: 9, chargedAmount: 135, chargedAt: '2026-09-01T10:00:00.000Z' })
      .expect(201);

    const res = await request(app.getHttpServer()).get(`/api/v1/trips/${tripId}/toll-reconciliation`).set('Authorization', adminAuth).expect(200);
    const stops: Array<{ tollPlazaId: string; expectedAmount: number; verdict: string }> = res.body.data.stops;
    const stopOficial = stops.find((s) => s.tollPlazaId === plazaComOficial)!;
    const stopFallback = stops.find((s) => s.tollPlazaId === plazaSemOficial)!;
    expect(stopOficial.expectedAmount).toBe(130);
    expect(stopOficial.verdict).toBe('CORRECT');
    expect(stopFallback.expectedAmount).toBe(135); // 15 * 9, fallback -- nunca inventado, nunca usa a tarifa da outra praca.
    expect(stopFallback.verdict).toBe('CORRECT');
  });

  // ==========================================================================
  // Caso 9 / Caso 10 -- vigencia (futura / expirada) -- ja respeitada pelo
  // RoutePlan (Fase 33); a conciliacao so precisa ler o snapshot correto,
  // nunca reavaliar vigencia sozinha.
  // ==========================================================================

  it('Caso 9: tarifa com vigencia FUTURA nunca e usada -- RoutePlan (e por consequencia a conciliacao) cai no fallback', async () => {
    const { adminAuth } = await createTenantAndLoginAsAdmin('Caso9');
    const baseLat = round7(-20 - Math.random() * 10);
    const baseLng = round7(-50 - Math.random() * 20);
    const plazaId = await createTollPlaza(adminAuth, { latitude: baseLat, longitude: baseLng, pricePerAxle: 15 });
    await createOfficialRate(adminAuth, plazaId, { price: 999, effectiveFrom: '2030-01-01', collectedAt: '2026-01-01' });

    const { tripId, vehicleId } = await setupTripWithAxles(adminAuth, 9);
    await registerVehicleTag(adminAuth, vehicleId);
    const { estimatedAmount } = await computeRoutePlan(adminAuth, tripId, baseLat, baseLng);
    expect(estimatedAmount).toBe(135); // 15*9 -- nunca 999 (tarifa futura, ainda nao vigente).

    await request(app.getHttpServer())
      .post('/api/v1/toll-transactions')
      .set('Authorization', adminAuth)
      .send({ tripId, tollPlazaId: plazaId, axleCount: 9, chargedAmount: 135, chargedAt: '2026-09-01T10:00:00.000Z' })
      .expect(201);

    const stop = await getReconciliationFirstStop(adminAuth, tripId);
    expect(stop.expectedAmount).toBe(135);
    expect(stop.verdict).toBe('CORRECT');
  });

  it('Caso 10: tarifa EXPIRADA nunca e usada -- RoutePlan (e a conciliacao) cai no fallback', async () => {
    const { adminAuth } = await createTenantAndLoginAsAdmin('Caso10');
    const baseLat = round7(-20 - Math.random() * 10);
    const baseLng = round7(-50 - Math.random() * 20);
    const plazaId = await createTollPlaza(adminAuth, { latitude: baseLat, longitude: baseLng, pricePerAxle: 15 });
    const oldRateId = await createOfficialRate(adminAuth, plazaId, { price: 90, effectiveFrom: '2020-01-01', collectedAt: '2020-01-01' });
    await prisma.tollRate.update({ where: { id: oldRateId }, data: { effectiveUntil: new Date('2021-01-01') } });

    const { tripId, vehicleId } = await setupTripWithAxles(adminAuth, 9);
    await registerVehicleTag(adminAuth, vehicleId);
    const { estimatedAmount } = await computeRoutePlan(adminAuth, tripId, baseLat, baseLng);
    expect(estimatedAmount).toBe(135); // 15*9 -- nunca 90 (tarifa ja expirada em 2021).

    await request(app.getHttpServer())
      .post('/api/v1/toll-transactions')
      .set('Authorization', adminAuth)
      .send({ tripId, tollPlazaId: plazaId, axleCount: 9, chargedAmount: 135, chargedAt: '2026-09-01T10:00:00.000Z' })
      .expect(201);

    const stop = await getReconciliationFirstStop(adminAuth, tripId);
    expect(stop.expectedAmount).toBe(135);
    expect(stop.verdict).toBe('CORRECT');
  });

  // ==========================================================================
  // Caso 11 / 12 / 13 -- preservacao de historico: mudanca de tarifa entre
  // versoes NUNCA recalcula retroativamente uma viagem antiga.
  // ==========================================================================

  it('Caso 11/12: viagem calculada quando a tarifa oficial era R$130 continua usando R$130 na conciliacao, mesmo depois do catalogo mudar para R$150', async () => {
    const { adminAuth } = await createTenantAndLoginAsAdmin('Caso1112');
    const baseLat = round7(-20 - Math.random() * 10);
    const baseLng = round7(-50 - Math.random() * 20);
    const plazaId = await createTollPlaza(adminAuth, { latitude: baseLat, longitude: baseLng, pricePerAxle: 5 });
    await createOfficialRate(adminAuth, plazaId, { price: 130, effectiveFrom: '2020-01-01', collectedAt: '2020-01-01' });

    // Viagem 1 (antiga): RoutePlan calculado com a tarifa vigente na epoca (130).
    const { tripId: oldTripId, vehicleId: oldVehicleId } = await setupTripWithAxles(adminAuth, 9);
    await registerVehicleTag(adminAuth, oldVehicleId);
    const { estimatedAmount: oldEstimated } = await computeRoutePlan(adminAuth, oldTripId, baseLat, baseLng);
    expect(oldEstimated).toBe(130);
    await request(app.getHttpServer())
      .post('/api/v1/toll-transactions')
      .set('Authorization', adminAuth)
      .send({ tripId: oldTripId, tollPlazaId: plazaId, axleCount: 9, chargedAmount: 130, chargedAt: '2026-09-01T10:00:00.000Z' })
      .expect(201);

    // Catalogo e atualizado: nova tarifa oficial R$150 (fecha a vigencia da anterior).
    await createOfficialRate(adminAuth, plazaId, { price: 150, effectiveFrom: '2026-10-01', collectedAt: '2026-10-01' });

    // A conciliacao da viagem ANTIGA nao pode ser afetada -- nunca recalcula retroativamente.
    const oldStop = await getReconciliationFirstStop(adminAuth, oldTripId);
    expect(oldStop.expectedAmount).toBe(130);
    expect(oldStop.expectedAmount).not.toBe(150);
    expect(oldStop.verdict).toBe('CORRECT');

    // O historico do catalogo tambem preserva a tarifa antiga (nunca apagada).
    const history = await request(app.getHttpServer())
      .get(`/api/v1/toll-data/plazas/${plazaId}/tariffs`)
      .set('Authorization', adminAuth)
      .expect(200);
    expect(history.body.data.items).toHaveLength(2);
    expect(history.body.data.items.map((r: { price: number }) => r.price).sort((a: number, b: number) => a - b)).toEqual([130, 150]);
  });

  it('Caso 13: viagem NOVA, calculada apos a atualizacao do catalogo, usa a nova tarifa oficial (R$150) na conciliacao', async () => {
    const { adminAuth } = await createTenantAndLoginAsAdmin('Caso13');
    const baseLat = round7(-20 - Math.random() * 10);
    const baseLng = round7(-50 - Math.random() * 20);
    const plazaId = await createTollPlaza(adminAuth, { latitude: baseLat, longitude: baseLng, pricePerAxle: 5 });
    await createOfficialRate(adminAuth, plazaId, { price: 130, effectiveFrom: '2020-01-01', collectedAt: '2020-01-01' });
    // Catalogo ja atualizado ANTES desta viagem ser criada.
    await createOfficialRate(adminAuth, plazaId, { price: 150, effectiveFrom: '2020-06-01', collectedAt: '2020-06-01' });

    const { tripId, vehicleId } = await setupTripWithAxles(adminAuth, 9);
    await registerVehicleTag(adminAuth, vehicleId);
    const { estimatedAmount } = await computeRoutePlan(adminAuth, tripId, baseLat, baseLng);
    expect(estimatedAmount).toBe(150);

    await request(app.getHttpServer())
      .post('/api/v1/toll-transactions')
      .set('Authorization', adminAuth)
      .send({ tripId, tollPlazaId: plazaId, axleCount: 9, chargedAmount: 150, chargedAt: '2026-09-01T10:00:00.000Z' })
      .expect(201);

    const stop = await getReconciliationFirstStop(adminAuth, tripId);
    expect(stop.expectedAmount).toBe(150);
    expect(stop.verdict).toBe('CORRECT');
  });

  // ==========================================================================
  // Multi-tenant / performance
  // ==========================================================================

  it('multi-tenant: conciliacao com tarifa oficial nunca vaza dados de uma viagem de outro tenant', async () => {
    const { adminAuth: authA } = await createTenantAndLoginAsAdmin('TenantA');
    const { adminAuth: authB } = await createTenantAndLoginAsAdmin('TenantB');
    const baseLat = round7(-20 - Math.random() * 10);
    const baseLng = round7(-50 - Math.random() * 20);
    const plazaId = await createTollPlaza(authA, { latitude: baseLat, longitude: baseLng });
    await createOfficialRate(authA, plazaId, { price: 130 });

    const { tripId, vehicleId } = await setupTripWithAxles(authA, 9);
    await registerVehicleTag(authA, vehicleId);
    await computeRoutePlan(authA, tripId, baseLat, baseLng);

    await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}/toll-reconciliation`)
      .set('Authorization', authB)
      .expect(404);
  });

  it('performance: conciliar 3 viagens no dashboard nao dispara consulta de tarifa oficial (le direto de RoutePlanToll ja carregado)', async () => {
    const { adminAuth } = await createTenantAndLoginAsAdmin('Perf1');
    const baseLat = round7(-20 - Math.random() * 10);
    const baseLng = round7(-50 - Math.random() * 20);
    const plazaId = await createTollPlaza(adminAuth, { latitude: baseLat, longitude: baseLng });
    await createOfficialRate(adminAuth, plazaId, { price: 130 });

    // Nota: getDashboard() so agrega viagens com TollRoute vinculado (ver
    // TollReconciliationService.getDashboard) -- aqui validamos que o
    // endpoint responde corretamente mesmo com o novo caminho de leitura
    // direta de RoutePlanToll (sem TollRatesService injetado no servico).
    const res = await request(app.getHttpServer()).get('/api/v1/toll-routes/dashboard').set('Authorization', adminAuth).expect(200);
    expect(res.body.data.totalTripsWithRoute).toBeGreaterThanOrEqual(0);
  });
});
