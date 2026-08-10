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
import { decodePolyline } from '../src/routing/utils/polyline.util';

// Fase 26 -- roteirizacao geografica. NENHUMA credencial real de provider
// esta configurada neste ambiente (ver relatorio final): este E2E substitui
// o RoutingProviderPort por um FAKE deterministico via override de DI
// (Test.createTestingModule().overrideProvider), exercitando 100% da
// integracao real do NOSSO sistema (schema, endpoints, guards, descoberta
// de pedagios, conciliacao, deteccao de desvio) sem depender de rede
// externa nem fingir uma validacao real contra o Google.
class FakeRoutingProvider implements RoutingProviderPort {
  readonly providerName = 'FAKE';
  private queue: CalculatedRoute[][] = [];
  public calls: CalculateRouteInput[] = [];

  isConfigured(): boolean {
    return true;
  }

  enqueue(routes: CalculatedRoute[]): void {
    this.queue.push(routes);
  }

  async calculateRoutes(input: CalculateRouteInput): Promise<CalculatedRoute[]> {
    this.calls.push(input);
    const next = this.queue.shift();
    if (!next) throw new Error('FakeRoutingProvider: nenhuma resposta enfileirada para este teste.');
    return next;
  }
}

// Mesmo algoritmo publico "Encoded Polyline" do Google, na direcao inversa
// de decodePolyline (ver src/routing/utils/polyline.util.ts) -- usado so
// para construir fixtures de teste (a aplicacao em si nunca precisa
// CODIFICAR uma polyline, so decodificar as que o provider devolve).
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

// Arredonda para 7 casas decimais -- sem isso, o acumulo de imprecisao de
// ponto flutuante (ex: -23.5 + 10*0.001) gera numeros com mais de 7 casas
// decimais e a validacao de TollPlaza (maxDecimalPlaces: 7) rejeita com 400.
function buildLine(
  startLat: number,
  longitude: number,
  steps: number,
  stepDegrees: number,
): { latitude: number; longitude: number }[] {
  return Array.from({ length: steps + 1 }, (_, i) => ({
    latitude: round7(startLat + i * stepDegrees),
    longitude: round7(longitude),
  }));
}

describe('Routing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fakeProvider: FakeRoutingProvider;
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    fakeProvider = new FakeRoutingProvider();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ROUTING_PROVIDER)
      .useValue(fakeProvider)
      .compile();

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
      slug: `rt-${label.toLowerCase()}-${unique}`,
      admin: {
        name: `Admin ${label}`,
        email: `admin-${label.toLowerCase()}-${unique}@teste.com`,
        password: 'SenhaForte123!',
      },
    };
    const createRes = await request(app.getHttpServer()).post('/api/v1/tenants').send(payload).expect(201);
    const tenantId: string = createRes.body.data.id;
    createdTenantIds.push(tenantId);

    // SUPER_ADMIN necessario para cadastrar TollPlaza (dado global).
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
        operator: 'CCR ViaOeste',
        highway: 'SP-310',
        pricePerAxle: 15,
        latitude: -23.5,
        longitude: -46.6,
        ...overrides,
      })
      .expect(201);
    return res.body.data.id as string;
  }

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
      .send({
        vehicleId,
        trailers: [],
        axleConfiguration: { totalAxles, billableCategory: `${totalAxles} eixos` },
      })
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

  async function setupTrip(adminAuth: string, totalAxles: number) {
    const vehicleId = await createVehicle(adminAuth);
    const driverId = await createDriver(adminAuth);
    const compositionId = await createComposition(adminAuth, vehicleId, totalAxles);
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
    return { tripId: tripRes.body.data.id as string, vehicleId, driverId, compositionId };
  }

  async function setupDriverLogin(adminAuth: string, tenantId: string, driverId: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 10);
    const email = `driver-${unique}@teste.com`;
    const password = 'SenhaForte123!';
    const userRes = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', adminAuth)
      .send({ name: 'Motorista App', email, password, role: 'DRIVER' })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/drivers/${driverId}/user-link`)
      .set('Authorization', adminAuth)
      .send({ userAccountId: userRes.body.data.id })
      .expect(200);
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email, password })
      .expect(200);
    return `Bearer ${loginRes.body.data.accessToken as string}`;
  }

  // TollPlaza e uma tabela GLOBAL (sem tenantId, ver schema.prisma) -- cada
  // teste que cria pracas com coordenadas precisa da sua PROPRIA faixa de
  // coordenadas, isolada das demais (inclusive de outros arquivos de e2e
  // rodando no mesmo banco), senao um teste "enxerga" pracas criadas por
  // outro. Por isso as linhas sao geradas com um deslocamento aleatorio
  // amplo a cada chamada, nunca reaproveitadas como constante compartilhada.
  function makeRouteLines(): {
    original: { latitude: number; longitude: number }[];
    deviated: { latitude: number; longitude: number }[];
  } {
    const baseLat = -20 - Math.random() * 10; // -20..-30
    const baseLng = -50 - Math.random() * 20; // -50..-70
    return {
      original: buildLine(baseLat, baseLng, 40, 0.001),
      deviated: buildLine(baseLat, baseLng - 0.01, 40, 0.001),
    };
  }

  it('round-trip do encoder de teste bate com o decoder real da aplicacao', () => {
    // Guard-rail: garante que o helper de teste (encodePolyline) e o
    // decodificador real da aplicacao (decodePolyline) sao inversos --
    // sem isso, um bug no encoder de teste mascararia falsos positivos.
    const { original } = makeRouteLines();
    const decoded = decodePolyline(encodePolyline(original));
    expect(decoded).toHaveLength(original.length);
    expect(decoded[0]!.latitude).toBeCloseTo(original[0]!.latitude, 4);
    expect(decoded[40]!.longitude).toBeCloseTo(original[40]!.longitude, 4);
  });

  describe('calculo, alternativas e selecao de rota', () => {
    it('calcula a rota principal e descobre/ordena pedagios cruzando com o catalogo de TollPlaza', async () => {
      const { original: ORIGINAL_LINE } = makeRouteLines();
      const { adminAuth } = await createTenantAndLoginAsAdmin('Plan1');
      const plazaFar = await createTollPlaza(adminAuth, {
        name: 'Praca B (mais longe)',
        latitude: ORIGINAL_LINE[30]!.latitude,
        longitude: ORIGINAL_LINE[30]!.longitude,
      });
      const plazaNear = await createTollPlaza(adminAuth, {
        name: 'Praca A (mais perto)',
        latitude: ORIGINAL_LINE[10]!.latitude,
        longitude: ORIGINAL_LINE[10]!.longitude,
      });
      const { tripId } = await setupTrip(adminAuth, 9);

      fakeProvider.enqueue([
        {
          originLabel: 'Catanduva/SP',
          destinationLabel: 'Sao Paulo/SP',
          originLatitude: ORIGINAL_LINE[0]!.latitude,
          originLongitude: ORIGINAL_LINE[0]!.longitude,
          destinationLatitude: ORIGINAL_LINE[40]!.latitude,
          destinationLongitude: ORIGINAL_LINE[40]!.longitude,
          distanceMeters: 520_000,
          durationSeconds: 23_400,
          encodedPolyline: encodePolyline(ORIGINAL_LINE),
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

      expect(res.body.data.distanceMeters).toBe(520_000);
      expect(res.body.data.axleCountUsed).toBe(9);
      expect(res.body.data.isCurrent).toBe(true);
      expect(res.body.data.tollEstimateSource).toBe('MATCHED_PLAZAS');
      // ordenado por distancia da origem: A (indice 10) antes de B (indice 30),
      // mesmo tendo sido cadastrada DEPOIS e mesmo o candidato B ter sido
      // criado primeiro no catalogo.
      expect(res.body.data.tolls.map((t: { tollPlazaId: string }) => t.tollPlazaId)).toEqual([
        plazaNear,
        plazaFar,
      ]);
      expect(res.body.data.tolls[0].estimatedAmount).toBe(135); // 15 * 9
      expect(res.body.data.tolls[0].matchStatus).toBe('MATCHED');

      const currentRes = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/route-plan`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(currentRes.body.data.id).toBe(res.body.data.id);

      const tollsRes = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/route-plan/tolls`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(tollsRes.body.data).toHaveLength(2);
    });

    it('quando nenhuma TollPlaza casa, usa o valor agregado do provider (PROVIDER_AGGREGATE) sem criar pedagios', async () => {
      const { original: ORIGINAL_LINE } = makeRouteLines();
      const { adminAuth } = await createTenantAndLoginAsAdmin('Plan2');
      const { tripId } = await setupTrip(adminAuth, 9);

      fakeProvider.enqueue([
        {
          originLabel: 'Catanduva/SP',
          destinationLabel: 'Sao Paulo/SP',
          originLatitude: ORIGINAL_LINE[0]!.latitude,
          originLongitude: ORIGINAL_LINE[0]!.longitude,
          destinationLatitude: ORIGINAL_LINE[40]!.latitude,
          destinationLongitude: ORIGINAL_LINE[40]!.longitude,
          distanceMeters: 100_000,
          durationSeconds: 5_000,
          encodedPolyline: encodePolyline(ORIGINAL_LINE),
          providerRouteId: null,
          hasTolls: true,
          estimatedTollAmount: 42,
          estimatedTollCurrency: 'BRL',
        },
      ]);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/route-plan`)
        .set('Authorization', adminAuth)
        .expect(201);

      expect(res.body.data.tolls).toHaveLength(0);
      expect(res.body.data.tollEstimateSource).toBe('PROVIDER_AGGREGATE');
      expect(res.body.data.totalTollAmount).toBe(42);
    });

    it('calcula alternativas, mantem a rota principal como atual, e permite selecionar outra', async () => {
      const { original: ORIGINAL_LINE, deviated: DEVIATED_LINE } = makeRouteLines();
      const { adminAuth } = await createTenantAndLoginAsAdmin('Plan3');
      const { tripId } = await setupTrip(adminAuth, 9);

      fakeProvider.enqueue([
        {
          originLabel: 'A',
          destinationLabel: 'B',
          originLatitude: -23.5,
          originLongitude: -46.6,
          destinationLatitude: -23.46,
          destinationLongitude: -46.6,
          distanceMeters: 500_000,
          durationSeconds: 20_000,
          encodedPolyline: encodePolyline(ORIGINAL_LINE),
          providerRouteId: null,
          hasTolls: false,
          estimatedTollAmount: null,
          estimatedTollCurrency: null,
        },
      ]);
      const primaryRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/route-plan`)
        .set('Authorization', adminAuth)
        .expect(201);
      const primaryId = primaryRes.body.data.id as string;

      fakeProvider.enqueue([
        {
          originLabel: 'A',
          destinationLabel: 'B',
          originLatitude: -23.5,
          originLongitude: -46.6,
          destinationLatitude: -23.46,
          destinationLongitude: -46.6,
          distanceMeters: 480_000,
          durationSeconds: 19_000,
          encodedPolyline: encodePolyline(ORIGINAL_LINE),
          providerRouteId: null,
          hasTolls: false,
          estimatedTollAmount: null,
          estimatedTollCurrency: null,
        },
        {
          originLabel: 'A',
          destinationLabel: 'B',
          originLatitude: -23.5,
          originLongitude: -46.6,
          destinationLatitude: -23.46,
          destinationLongitude: -46.6,
          distanceMeters: 510_000,
          durationSeconds: 21_000,
          encodedPolyline: encodePolyline(DEVIATED_LINE),
          providerRouteId: null,
          hasTolls: false,
          estimatedTollAmount: null,
          estimatedTollCurrency: null,
        },
      ]);
      const alternativesRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/route-plan/alternatives`)
        .set('Authorization', adminAuth)
        .expect(201);
      expect(alternativesRes.body.data).toHaveLength(2);
      // a rota principal ja selecionada permanece a atual -- nenhuma
      // alternativa vira automaticamente a rota da viagem.
      expect(alternativesRes.body.data.every((r: { isCurrent: boolean }) => r.isCurrent === false)).toBe(
        true,
      );

      const secondAlternativeId = alternativesRes.body.data[1].id as string;
      const selectRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/route-plan/select`)
        .set('Authorization', adminAuth)
        .send({ routePlanId: secondAlternativeId })
        .expect(201);
      expect(selectRes.body.data.id).toBe(secondAlternativeId);
      expect(selectRes.body.data.isCurrent).toBe(true);

      const currentRes = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/route-plan`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(currentRes.body.data.id).toBe(secondAlternativeId);
      expect(currentRes.body.data.id).not.toBe(primaryId);
    });
  });

  describe('app do motorista: visao da rota, desvio e recalculo', () => {
    it('motorista ve a rota, envia localizacao, desvia, recebe o recalculo e o novo pedagio aparece', async () => {
      const { original: ORIGINAL_LINE, deviated: DEVIATED_LINE } = makeRouteLines();
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Driver1');
      const plazaOriginal = await createTollPlaza(adminAuth, {
        name: 'Praca da rota original',
        latitude: ORIGINAL_LINE[35]!.latitude,
        longitude: ORIGINAL_LINE[35]!.longitude,
      });
      const plazaNova = await createTollPlaza(adminAuth, {
        name: 'Praca nova (so na rota recalculada)',
        latitude: DEVIATED_LINE[20]!.latitude,
        longitude: DEVIATED_LINE[20]!.longitude,
      });
      const { tripId, driverId } = await setupTrip(adminAuth, 9);
      const driverAuth = await setupDriverLogin(adminAuth, tenantId, driverId);

      // Baixa o limiar de tempo de desvio para 0 -- torna o teste
      // deterministico sem depender de esperar minutos reais (ver
      // RoutingService.checkDeviation: span >= routeDeviationMinutes).
      await prisma.tenantSettings.upsert({
        where: { tenantId },
        update: { routeDeviationMinutes: 0, maxDeviationMeters: 300 },
        create: { tenantId, routeDeviationMinutes: 0, maxDeviationMeters: 300 },
      });

      fakeProvider.enqueue([
        {
          originLabel: 'Catanduva/SP',
          destinationLabel: 'Sao Paulo/SP',
          originLatitude: ORIGINAL_LINE[0]!.latitude,
          originLongitude: ORIGINAL_LINE[0]!.longitude,
          destinationLatitude: ORIGINAL_LINE[40]!.latitude,
          destinationLongitude: ORIGINAL_LINE[40]!.longitude,
          distanceMeters: 520_000,
          durationSeconds: 23_400,
          encodedPolyline: encodePolyline(ORIGINAL_LINE),
          providerRouteId: null,
          hasTolls: true,
          estimatedTollAmount: null,
          estimatedTollCurrency: 'BRL',
        },
      ]);
      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/route-plan`)
        .set('Authorization', adminAuth)
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .expect(201);

      const routeBeforeRes = await request(app.getHttpServer())
        .get(`/api/v1/driver/trips/${tripId}/route`)
        .set('Authorization', driverAuth)
        .expect(200);
      expect(routeBeforeRes.body.data.destinationLabel).toBe('Sao Paulo/SP');
      expect(routeBeforeRes.body.data.nextToll.name).toBe('Praca da rota original');
      expect(routeBeforeRes.body.data.hasUnresolvedDeviation).toBe(false);

      // Envia uma localizacao BEM longe da rota (~2km de desvio lateral).
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/locations`)
        .set('Authorization', driverAuth)
        .send({
          points: [
            {
              deviceEventId: randomUUID(),
              latitude: ORIGINAL_LINE[15]!.latitude,
              longitude: ORIGINAL_LINE[15]!.longitude + 0.02,
              // Levemente no "futuro" de proposito: com routeDeviationMinutes=0,
              // a janela em checkDeviation() e [now, now] no momento exato em
              // que ele roda (alguns ms DEPOIS deste ponto ser gravado) --
              // sem essa folga, o ponto poderia ficar fora da janela por pura
              // corrida entre o timestamp do request e o do processamento.
              recordedAt: new Date(Date.now() + 60_000).toISOString(),
            },
          ],
        })
        .expect(201);

      const openDeviation = await prisma.routeEvent.findFirst({
        where: { tripId, type: 'DEVIATION', resolvedAt: null },
      });
      expect(openDeviation).not.toBeNull();
      const deviationAlert = await prisma.alert.findFirst({ where: { tripId, type: 'ROUTE_DEVIATION' } });
      expect(deviationAlert).not.toBeNull();

      const routeAfterDeviationRes = await request(app.getHttpServer())
        .get(`/api/v1/driver/trips/${tripId}/route`)
        .set('Authorization', driverAuth)
        .expect(200);
      expect(routeAfterDeviationRes.body.data.hasUnresolvedDeviation).toBe(true);

      // Recalcula (motorista) -- nova rota com a praca NOVA que nao existia antes.
      fakeProvider.enqueue([
        {
          originLabel: 'Posicao atual',
          destinationLabel: 'Sao Paulo/SP',
          originLatitude: ORIGINAL_LINE[15]!.latitude,
          originLongitude: ORIGINAL_LINE[15]!.longitude + 0.02,
          destinationLatitude: DEVIATED_LINE[40]!.latitude,
          destinationLongitude: DEVIATED_LINE[40]!.longitude,
          distanceMeters: 545_000,
          durationSeconds: 24_600,
          encodedPolyline: encodePolyline(DEVIATED_LINE),
          providerRouteId: null,
          hasTolls: true,
          estimatedTollAmount: null,
          estimatedTollCurrency: 'BRL',
        },
      ]);
      const recalcRes = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/route/recalculate`)
        .set('Authorization', driverAuth)
        .expect(200);

      expect(recalcRes.body.data.previous).not.toBeNull();
      expect(recalcRes.body.data.difference.distanceMetersDiff).toBe(25_000);
      expect(recalcRes.body.data.difference.durationSecondsDiff).toBe(1_200);
      const nextTolls = recalcRes.body.data.next.tolls as Array<{ tollPlazaId: string }>;
      expect(nextTolls.map((t) => t.tollPlazaId)).toEqual([plazaNova]);
      expect(nextTolls.map((t) => t.tollPlazaId)).not.toContain(plazaOriginal);

      // O desvio foi resolvido pelo recalculo.
      const resolvedEvent = await prisma.routeEvent.findUnique({ where: { id: openDeviation!.id } });
      expect(resolvedEvent!.resolvedAt).not.toBeNull();
      expect(resolvedEvent!.resultingRoutePlanId).toBe(recalcRes.body.data.next.id);

      const routeAfterRecalcRes = await request(app.getHttpServer())
        .get(`/api/v1/driver/trips/${tripId}/route`)
        .set('Authorization', driverAuth)
        .expect(200);
      expect(routeAfterRecalcRes.body.data.hasUnresolvedDeviation).toBe(false);
    });
  });

  // ==========================================================================
  // Fase 30 -- "motorista informa pouco, sistema calcula muito": rota
  // calculada automaticamente na largada e recalculo automatico apos desvio
  // (sem nenhuma chamada manual do motorista/escritorio).
  // ==========================================================================
  describe('operacao automatica (Fase 30)', () => {
    it('POST /driver/trips/:id/start calcula a rota automaticamente quando a viagem ainda nao tem nenhuma RoutePlan', async () => {
      const { original: ORIGINAL_LINE } = makeRouteLines();
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Auto1');
      const { tripId, driverId } = await setupTrip(adminAuth, 9);
      const driverAuth = await setupDriverLogin(adminAuth, tenantId, driverId);

      // TripEntity (GET /trips/:id) nao expoe routePlanId -- verifica direto
      // no banco (mesmo padrao ja usado por outros e2e desta suite).
      const beforeTrip = await prisma.trip.findUnique({ where: { id: tripId } });
      expect(beforeTrip!.routePlanId).toBeNull();

      fakeProvider.enqueue([
        {
          originLabel: 'Catanduva/SP',
          destinationLabel: 'Sao Paulo/SP',
          originLatitude: ORIGINAL_LINE[0]!.latitude,
          originLongitude: ORIGINAL_LINE[0]!.longitude,
          destinationLatitude: ORIGINAL_LINE[40]!.latitude,
          destinationLongitude: ORIGINAL_LINE[40]!.longitude,
          distanceMeters: 500_000,
          durationSeconds: 20_000,
          encodedPolyline: encodePolyline(ORIGINAL_LINE),
          providerRouteId: null,
          hasTolls: true,
          estimatedTollAmount: null,
          estimatedTollCurrency: 'BRL',
        },
      ]);

      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .send({ odometerKm: 100000, loadStatus: 'LOADED' })
        .expect(201);

      const afterTrip = await prisma.trip.findUnique({ where: { id: tripId } });
      expect(afterTrip!.routePlanId).not.toBeNull();

      const routePlanRes = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/route-plan`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(routePlanRes.body.data.distanceMeters).toBe(500_000);
    });

    it('nao sobrescreve uma RoutePlan ja calculada manualmente antes da largada', async () => {
      const { original: ORIGINAL_LINE } = makeRouteLines();
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Auto2');
      const { tripId, driverId } = await setupTrip(adminAuth, 9);
      const driverAuth = await setupDriverLogin(adminAuth, tenantId, driverId);

      fakeProvider.enqueue([
        {
          originLabel: 'Catanduva/SP',
          destinationLabel: 'Sao Paulo/SP',
          originLatitude: ORIGINAL_LINE[0]!.latitude,
          originLongitude: ORIGINAL_LINE[0]!.longitude,
          destinationLatitude: ORIGINAL_LINE[40]!.latitude,
          destinationLongitude: ORIGINAL_LINE[40]!.longitude,
          distanceMeters: 500_000,
          durationSeconds: 20_000,
          encodedPolyline: encodePolyline(ORIGINAL_LINE),
          providerRouteId: null,
          hasTolls: false,
          estimatedTollAmount: null,
          estimatedTollCurrency: 'BRL',
        },
      ]);
      const manualRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/route-plan`)
        .set('Authorization', adminAuth)
        .expect(201);
      const manualRoutePlanId = manualRes.body.data.id as string;
      const callsBefore = fakeProvider.calls.length;

      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .expect(201);

      // Nenhuma chamada nova ao provider -- start() nunca recalcula quando ja
      // existe uma RoutePlan (guard de routePlanId !== null).
      expect(fakeProvider.calls.length).toBe(callsBefore);

      const trip = await prisma.trip.findUnique({ where: { id: tripId } });
      expect(trip!.routePlanId).toBe(manualRoutePlanId);
    });

    it('desvio dispara recalculo automatico (novo pedagio incluido) sem nenhuma chamada manual a /route/recalculate', async () => {
      const { original: ORIGINAL_LINE, deviated: DEVIATED_LINE } = makeRouteLines();
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Auto3');
      const plazaOriginal = await createTollPlaza(adminAuth, {
        name: 'Praca original (auto)',
        latitude: ORIGINAL_LINE[35]!.latitude,
        longitude: ORIGINAL_LINE[35]!.longitude,
      });
      const plazaNova = await createTollPlaza(adminAuth, {
        name: 'Praca nova (auto, so na rota recalculada)',
        latitude: DEVIATED_LINE[20]!.latitude,
        longitude: DEVIATED_LINE[20]!.longitude,
      });
      const { tripId, driverId } = await setupTrip(adminAuth, 9);
      const driverAuth = await setupDriverLogin(adminAuth, tenantId, driverId);

      await prisma.tenantSettings.upsert({
        where: { tenantId },
        update: { routeDeviationMinutes: 0, maxDeviationMeters: 300 },
        create: { tenantId, routeDeviationMinutes: 0, maxDeviationMeters: 300 },
      });

      fakeProvider.enqueue([
        {
          originLabel: 'Catanduva/SP',
          destinationLabel: 'Sao Paulo/SP',
          originLatitude: ORIGINAL_LINE[0]!.latitude,
          originLongitude: ORIGINAL_LINE[0]!.longitude,
          destinationLatitude: ORIGINAL_LINE[40]!.latitude,
          destinationLongitude: ORIGINAL_LINE[40]!.longitude,
          distanceMeters: 520_000,
          durationSeconds: 23_400,
          encodedPolyline: encodePolyline(ORIGINAL_LINE),
          providerRouteId: null,
          hasTolls: true,
          estimatedTollAmount: null,
          estimatedTollCurrency: 'BRL',
        },
      ]);
      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/route-plan`)
        .set('Authorization', adminAuth)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/start`)
        .set('Authorization', driverAuth)
        .expect(201);

      // Enfileira a rota recalculada ANTES do ponto de desvio: o recalculo
      // (Fase 30) acontece dentro do proprio POST /locations, sem nenhuma
      // chamada extra do motorista a /route/recalculate.
      fakeProvider.enqueue([
        {
          originLabel: 'Posicao atual',
          destinationLabel: 'Sao Paulo/SP',
          originLatitude: ORIGINAL_LINE[15]!.latitude,
          originLongitude: ORIGINAL_LINE[15]!.longitude + 0.02,
          destinationLatitude: DEVIATED_LINE[40]!.latitude,
          destinationLongitude: DEVIATED_LINE[40]!.longitude,
          distanceMeters: 545_000,
          durationSeconds: 24_600,
          encodedPolyline: encodePolyline(DEVIATED_LINE),
          providerRouteId: null,
          hasTolls: true,
          estimatedTollAmount: null,
          estimatedTollCurrency: 'BRL',
        },
      ]);

      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/locations`)
        .set('Authorization', driverAuth)
        .send({
          points: [
            {
              deviceEventId: randomUUID(),
              latitude: ORIGINAL_LINE[15]!.latitude,
              longitude: ORIGINAL_LINE[15]!.longitude + 0.02,
              recordedAt: new Date(Date.now() + 60_000).toISOString(),
            },
          ],
        })
        .expect(201);

      // Sem NENHUMA chamada a /route/recalculate: o desvio ja deve estar
      // resolvido automaticamente, com a rota nova e a praca nova.
      const deviationEvent = await prisma.routeEvent.findFirst({
        where: { tripId, type: 'DEVIATION' },
      });
      expect(deviationEvent).not.toBeNull();
      expect(deviationEvent!.resolvedAt).not.toBeNull();
      expect(deviationEvent!.resultingRoutePlanId).not.toBeNull();

      const routeRes = await request(app.getHttpServer())
        .get(`/api/v1/driver/trips/${tripId}/route`)
        .set('Authorization', driverAuth)
        .expect(200);
      expect(routeRes.body.data.hasUnresolvedDeviation).toBe(false);
      expect(routeRes.body.data.nextToll.name).toBe('Praca nova (auto, so na rota recalculada)');

      const tollsRes = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/route-plan/tolls`)
        .set('Authorization', adminAuth)
        .expect(200);
      const tollPlazaIds = (tollsRes.body.data as Array<{ tollPlazaId: string }>).map((t) => t.tollPlazaId);
      expect(tollPlazaIds).toContain(plazaNova);
      expect(tollPlazaIds).not.toContain(plazaOriginal);

      // Auditoria da acao automatica (ator nulo -- ninguem "clicou" em nada).
      const autoLog = await prisma.auditLog.findFirst({
        where: { tenantId, action: 'route_plan.auto_recalculated' },
      });
      expect(autoLog).not.toBeNull();
      expect(autoLog!.userId).toBeNull();
    });
  });

  describe('integracao com conciliacao e eixos (9 padrao -> 7 excecao)', () => {
    it('a conciliacao usa RoutePlan.tolls quando a viagem nao tem TollRoute manual, respeitando o axleCount real de cada transacao', async () => {
      const { original: ORIGINAL_LINE } = makeRouteLines();
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Recon1');
      const plaza = await createTollPlaza(adminAuth, {
        name: 'Praca conciliacao',
        latitude: ORIGINAL_LINE[10]!.latitude,
        longitude: ORIGINAL_LINE[10]!.longitude,
      });
      const { tripId, vehicleId } = await setupTrip(adminAuth, 9);

      const tagProviderRes = await request(app.getHttpServer())
        .get('/api/v1/tag-providers')
        .set('Authorization', adminAuth)
        .expect(200);
      const tagProviderId = tagProviderRes.body.data.find((p: { name: string }) => p.name === 'Sem Parar').id;
      await request(app.getHttpServer())
        .post(`/api/v1/vehicles/${vehicleId}/tags`)
        .set('Authorization', adminAuth)
        .send({ tagProviderId, tagNumber: String(Math.floor(1e9 + Math.random() * 8e9)), activatedAt: '2026-01-01' })
        .expect(201);

      fakeProvider.enqueue([
        {
          originLabel: 'Catanduva/SP',
          destinationLabel: 'Sao Paulo/SP',
          originLatitude: ORIGINAL_LINE[0]!.latitude,
          originLongitude: ORIGINAL_LINE[0]!.longitude,
          destinationLatitude: ORIGINAL_LINE[40]!.latitude,
          destinationLongitude: ORIGINAL_LINE[40]!.longitude,
          distanceMeters: 500_000,
          durationSeconds: 20_000,
          encodedPolyline: encodePolyline(ORIGINAL_LINE),
          providerRouteId: null,
          hasTolls: true,
          estimatedTollAmount: null,
          estimatedTollCurrency: 'BRL',
        },
      ]);
      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/route-plan`)
        .set('Authorization', adminAuth)
        .expect(201);

      // Motorista levantou eixos: passagem real registrada com 7 (nao 9).
      await request(app.getHttpServer())
        .post('/api/v1/toll-transactions')
        .set('Authorization', adminAuth)
        .send({ tripId, tollPlazaId: plaza, axleCount: 7, chargedAmount: 105, chargedAt: '2026-09-01T10:00:00.000Z' })
        .expect(201);

      const reconciliationRes = await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/toll-reconciliation`)
        .set('Authorization', adminAuth)
        .expect(200);

      expect(reconciliationRes.body.data.hasRoute).toBe(true);
      expect(reconciliationRes.body.data.tollRouteId).toBeNull(); // sem TollRoute manual
      const stop = reconciliationRes.body.data.stops[0];
      expect(stop.axleCount).toBe(7); // nao 9 -- usa o real da transacao
      expect(stop.expectedAmount).toBe(105); // 15 * 7
      expect(stop.verdict).toBe('CORRECT');
    });
  });

  describe('isolamento multi-tenant e RBAC', () => {
    it('viagem de um tenant nao e visivel para calcular/consultar rota de outro tenant', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('Rbac1A');
      const tenantB = await createTenantAndLoginAsAdmin('Rbac1B');
      const { tripId } = await setupTrip(tenantA.adminAuth, 9);

      await request(app.getHttpServer())
        .get(`/api/v1/trips/${tripId}/route-plan`)
        .set('Authorization', tenantB.adminAuth)
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/route-plan`)
        .set('Authorization', tenantB.adminAuth)
        .expect(404);
    });

    it('motorista so acessa a rota da propria viagem, nunca a de outro motorista', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Rbac2');
      const tripA = await setupTrip(adminAuth, 9);
      const tripB = await setupTrip(adminAuth, 9);
      const driverAuthA = await setupDriverLogin(adminAuth, tenantId, tripA.driverId);

      await request(app.getHttpServer())
        .get(`/api/v1/driver/trips/${tripB.tripId}/route`)
        .set('Authorization', driverAuthA)
        .expect(403);
    });
  });
});
