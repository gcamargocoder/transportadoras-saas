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

// Fase 91 -- previsao de chegada (ETA), SEMPRE calculada sob demanda (nunca
// persistida). NENHUMA credencial real de provider de mapas esta
// configurada neste ambiente -- mesmo padrao ja estabelecido em
// routing.e2e-spec.ts (Fase 26): substitui o RoutingProviderPort por um
// FAKE deterministico via override de DI para exercitar o caminho
// GEOGRAPHIC real do NOSSO sistema (RoutePlan + TrackingPoint reais), sem
// fingir uma chamada de rede externa. Os demais testes (DELAY_SHIFT, dados
// ausentes, estado incompativel, RBAC, multi-tenant) nao dependem do
// provider e usam o mesmo app com o fake acoplado (inofensivo quando o
// provider nunca e chamado).
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

// Mesmo algoritmo publico "Encoded Polyline" do Google, na direcao inversa
// de decodePolyline -- usado so para construir a fixture de rota reta
// (origem -> destino, sem pontos intermediarios) usada nos testes GEOGRAPHIC.
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

const ORIGIN = { latitude: -23.5, longitude: -46.6 };
const DESTINATION = { latitude: -23.5, longitude: -45.6 };
const ROUTE_DISTANCE_METERS = 100_000;
const ROUTE_DURATION_SECONDS = 7_200; // 2h -- velocidade media = 50 km/h

describe('Trip ETA -- previsao de chegada da viagem e das paradas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fakeProvider: FakeRoutingProvider;
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    fakeProvider = new FakeRoutingProvider();
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ROUTING_PROVIDER)
      .useValue(fakeProvider)
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
    const digits = Math.floor(1000 + Math.random() * 9000);
    return `${letters}${digits}`;
  }

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
      slug: `teta-${label.toLowerCase()}-${unique}`,
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

  async function createUserWithRole(tenantId: string, adminAuth: string, role: string) {
    const email = `user-${role.toLowerCase()}-${randomUUID()}@teste.com`;
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', adminAuth)
      .send({ name: `Usuario ${role}`, email, password: 'SenhaForte123!', role })
      .expect(201);
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email, password: 'SenhaForte123!' })
      .expect(200);
    return `Bearer ${loginRes.body.data.accessToken}`;
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
        cpf: randomValidCpf(),
        cnhNumber: String(Math.floor(10000000000 + Math.random() * 89999999999)),
        cnhCategory: 'AE',
        cnhExpiresAt: '2027-06-30',
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createLocation(auth: string, name: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/locations')
      .set('Authorization', auth)
      .send({ name, type: 'DISTRIBUTION_CENTER' })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createComposition(auth: string, vehicleId: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/trip-compositions')
      .set('Authorization', auth)
      .send({ vehicleId, trailers: [] })
      .expect(201);
    return res.body.data.id as string;
  }

  // plannedDeparture no passado (por padrao 5 min atras) para permitir
  // iniciar a viagem AGORA e medir um atraso REAL (delta entre actualDeparture
  // e plannedDeparture), nunca um valor hardcoded.
  async function setupTrip(
    auth: string,
    opts: { plannedDepartureOffsetMinutes?: number; destinationLocationId?: string } = {},
  ) {
    const vehicleId = await createVehicle(auth);
    const driverId = await createDriver(auth);
    const compositionId = await createComposition(auth, vehicleId);
    const originId = await createLocation(auth, `Origem ${randomUUID()}`);
    const destinationId = opts.destinationLocationId ?? (await createLocation(auth, `Destino ${randomUUID()}`));
    const offsetMinutes = opts.plannedDepartureOffsetMinutes ?? -5;
    const plannedDeparture = new Date(Date.now() + offsetMinutes * 60_000).toISOString();
    const plannedArrival = new Date(Date.now() + (offsetMinutes + 24 * 60) * 60_000).toISOString();

    const tripRes = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', auth)
      .send({
        driverId,
        compositionId,
        originLocationId: originId,
        destinationLocationId: destinationId,
        plannedDeparture,
        plannedArrival,
      })
      .expect(201);
    return { tripId: tripRes.body.data.id as string, destinationLocationId: destinationId, plannedArrival };
  }

  async function addStop(auth: string, tripId: string, locationId: string, plannedArrival?: string) {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/delivery-stops`)
      .set('Authorization', auth)
      .send({ locationId, ...(plannedArrival ? { plannedArrival } : {}) })
      .expect(201);
    return res.body.data.id as string;
  }

  async function startTrip(auth: string, tripId: string): Promise<{ actualDeparture: string; plannedDeparture: string }> {
    await request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}/status`)
      .set('Authorization', auth)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
    const trip = await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}`)
      .set('Authorization', auth)
      .expect(200);
    return { actualDeparture: trip.body.data.actualDeparture, plannedDeparture: trip.body.data.plannedDeparture };
  }

  async function computeRoutePlan(auth: string, tripId: string) {
    fakeProvider.enqueue([
      {
        originLabel: 'Origem',
        destinationLabel: 'Destino',
        originLatitude: ORIGIN.latitude,
        originLongitude: ORIGIN.longitude,
        destinationLatitude: DESTINATION.latitude,
        destinationLongitude: DESTINATION.longitude,
        distanceMeters: ROUTE_DISTANCE_METERS,
        durationSeconds: ROUTE_DURATION_SECONDS,
        encodedPolyline: encodePolyline([ORIGIN, DESTINATION]),
        providerRouteId: null,
        hasTolls: false,
        estimatedTollAmount: null,
        estimatedTollCurrency: null,
      },
    ]);
    await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/route-plan`)
      .set('Authorization', auth)
      .expect(201);
  }

  async function sendTrackingPoint(tenantId: string, tripId: string, point: { latitude: number; longitude: number }, recordedAt: Date) {
    await prisma.trackingPoint.create({
      data: {
        tenantId,
        tripId,
        latitude: point.latitude,
        longitude: point.longitude,
        recordedAt,
        deviceEventId: randomUUID(),
      },
    });
  }

  function getEta(auth: string, tripId: string) {
    return request(app.getHttpServer()).get(`/api/v1/trips/${tripId}/delivery-stops/eta`).set('Authorization', auth);
  }

  // ==========================================================================
  // ETA GEOGRAFICA (RoutePlan real via fake provider + TrackingPoint real)
  // ==========================================================================
  describe('ETA geografica -- destino final da viagem', () => {
    it('na origem exata: ETA = ultima posicao + duracao total da rota (remaining = 100%)', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('GeoFull');
      const { tripId, destinationLocationId } = await setupTrip(adminAuth);
      await computeRoutePlan(adminAuth, tripId);
      const stopId = await addStop(adminAuth, tripId, destinationLocationId);
      await startTrip(adminAuth, tripId);

      const recordedAt = new Date();
      await sendTrackingPoint(tenantId, tripId, ORIGIN, recordedAt);

      const res = await getEta(adminAuth, tripId).expect(200);
      expect(res.body.data.tripEstimatedArrivalSource).toBe('GEOGRAPHIC');
      const expectedArrival = new Date(recordedAt.getTime() + ROUTE_DURATION_SECONDS * 1000);
      expect(Math.abs(new Date(res.body.data.tripEstimatedArrival).getTime() - expectedArrival.getTime())).toBeLessThan(1000);
      expect(res.body.data.tripEstimatedArrivalBasis).toEqual(expect.stringContaining('km/h'));

      const stop = res.body.data.stops.find((s: { stopId: string }) => s.stopId === stopId);
      expect(stop.source).toBe('GEOGRAPHIC');
      expect(Math.abs(new Date(stop.estimatedArrival).getTime() - expectedArrival.getTime())).toBeLessThan(1000);

      // Deterministico: consultar de novo com os MESMOS dados produz o MESMO resultado.
      const res2 = await getEta(adminAuth, tripId).expect(200);
      expect(res2.body.data.tripEstimatedArrival).toBe(res.body.data.tripEstimatedArrival);
    });

    it('exatamente no destino: ETA = agora (remaining = 0)', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('GeoArrived');
      const { tripId, destinationLocationId } = await setupTrip(adminAuth);
      await computeRoutePlan(adminAuth, tripId);
      await addStop(adminAuth, tripId, destinationLocationId);
      await startTrip(adminAuth, tripId);

      const recordedAt = new Date();
      await sendTrackingPoint(tenantId, tripId, DESTINATION, recordedAt);

      const res = await getEta(adminAuth, tripId).expect(200);
      expect(res.body.data.tripEstimatedArrivalSource).toBe('GEOGRAPHIC');
      expect(Math.abs(new Date(res.body.data.tripEstimatedArrival).getTime() - recordedAt.getTime())).toBeLessThan(1000);
    });

    it('somente a parada cujo local e o destino final recebe ETA geografica -- as demais usam DELAY_SHIFT', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('GeoOnlyLast');
      const { tripId, destinationLocationId } = await setupTrip(adminAuth);
      await computeRoutePlan(adminAuth, tripId);
      const intermediateLocationId = await createLocation(adminAuth, `Intermediaria ${randomUUID()}`);
      const stopPlannedArrival = new Date(Date.now() + 60 * 60_000).toISOString();
      const intermediateStopId = await addStop(adminAuth, tripId, intermediateLocationId, stopPlannedArrival);
      const finalStopId = await addStop(adminAuth, tripId, destinationLocationId);
      const { actualDeparture, plannedDeparture } = await startTrip(adminAuth, tripId);

      await sendTrackingPoint(tenantId, tripId, ORIGIN, new Date());

      const res = await getEta(adminAuth, tripId).expect(200);
      const intermediate = res.body.data.stops.find((s: { stopId: string }) => s.stopId === intermediateStopId);
      const final = res.body.data.stops.find((s: { stopId: string }) => s.stopId === finalStopId);

      expect(final.source).toBe('GEOGRAPHIC');
      expect(intermediate.source).toBe('DELAY_SHIFT');
      const delaySeconds = (new Date(actualDeparture).getTime() - new Date(plannedDeparture).getTime()) / 1000;
      const expectedIntermediate = new Date(new Date(stopPlannedArrival).getTime() + delaySeconds * 1000);
      expect(Math.abs(new Date(intermediate.estimatedArrival).getTime() - expectedIntermediate.getTime())).toBeLessThan(2000);
    });
  });

  // ==========================================================================
  // DELAY_SHIFT -- sem geografia disponivel, planejado x previsto
  // ==========================================================================
  describe('DELAY_SHIFT -- planejado ajustado pelo atraso real de partida', () => {
    it('desloca plannedArrival de cada parada pelo atraso real (actualDeparture - plannedDeparture)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Delay');
      const { tripId } = await setupTrip(adminAuth, { plannedDepartureOffsetMinutes: -15 });
      const locationA = await createLocation(adminAuth, `Cliente A ${randomUUID()}`);
      const plannedArrivalA = new Date(Date.now() + 60 * 60_000).toISOString();
      const stopA = await addStop(adminAuth, tripId, locationA, plannedArrivalA);
      const { actualDeparture, plannedDeparture } = await startTrip(adminAuth, tripId);

      const res = await getEta(adminAuth, tripId).expect(200);
      const stop = res.body.data.stops.find((s: { stopId: string }) => s.stopId === stopA);
      expect(stop.source).toBe('DELAY_SHIFT');
      const delaySeconds = (new Date(actualDeparture).getTime() - new Date(plannedDeparture).getTime()) / 1000;
      expect(delaySeconds).toBeGreaterThan(0); // partiu depois do planejado (offset negativo)
      const expected = new Date(new Date(plannedArrivalA).getTime() + delaySeconds * 1000);
      expect(Math.abs(new Date(stop.estimatedArrival).getTime() - expected.getTime())).toBeLessThan(2000);
      expect(stop.varianceSeconds).toBeGreaterThan(0);
      expect(stop.delayed).toBe(true);
      expect(stop.basis).toEqual(expect.stringContaining('atraso'));
    });
  });

  // ==========================================================================
  // Multiplas entregas + proxima parada
  // ==========================================================================
  describe('multiplas entregas e proxima parada', () => {
    it('nextStopId aponta para a primeira parada nao concluida; parada concluida nunca recebe ETA', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('NextStop');
      const { tripId } = await setupTrip(adminAuth);
      const stop1 = await addStop(adminAuth, tripId, await createLocation(adminAuth, `L1 ${randomUUID()}`), new Date(Date.now() + 30 * 60_000).toISOString());
      const stop2 = await addStop(adminAuth, tripId, await createLocation(adminAuth, `L2 ${randomUUID()}`), new Date(Date.now() + 90 * 60_000).toISOString());
      const stop3 = await addStop(adminAuth, tripId, await createLocation(adminAuth, `L3 ${randomUUID()}`), new Date(Date.now() + 150 * 60_000).toISOString());
      await startTrip(adminAuth, tripId);

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/delivery-stops/${stop1}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'COMPLETED' })
        .expect(200);

      const res = await getEta(adminAuth, tripId).expect(200);
      expect(res.body.data.nextStopId).toBe(stop2);
      const s1 = res.body.data.stops.find((s: { stopId: string }) => s.stopId === stop1);
      const s2 = res.body.data.stops.find((s: { stopId: string }) => s.stopId === stop2);
      const s3 = res.body.data.stops.find((s: { stopId: string }) => s.stopId === stop3);
      expect(s1.isNextStop).toBe(false);
      expect(s1.limitation).toEqual(expect.stringContaining('concluída'));
      expect(s1.estimatedArrival).toBeNull();
      expect(s2.isNextStop).toBe(true);
      expect(s3.isNextStop).toBe(false);
      expect(s2.estimatedArrival).not.toBeNull();
      expect(s3.estimatedArrival).not.toBeNull();
    });
  });

  // ==========================================================================
  // Ausencia de dados / dados insuficientes
  // ==========================================================================
  describe('ausencia de dados', () => {
    it('parada sem plannedArrival: estimatedArrival null com limitation explicando', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('NoPlanned');
      const { tripId } = await setupTrip(adminAuth);
      const stopId = await addStop(adminAuth, tripId, await createLocation(adminAuth, `L ${randomUUID()}`));
      await startTrip(adminAuth, tripId);

      const res = await getEta(adminAuth, tripId).expect(200);
      const stop = res.body.data.stops.find((s: { stopId: string }) => s.stopId === stopId);
      expect(stop.source).toBe('NONE');
      expect(stop.estimatedArrival).toBeNull();
      expect(stop.limitation).toEqual(expect.stringContaining('plannedArrival'));
    });

    it('viagem ainda nao partiu: sem ETA algum, limitations explica; plannedArrival da viagem continua visivel', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('NotStarted');
      const { tripId, plannedArrival } = await setupTrip(adminAuth);
      const stopId = await addStop(adminAuth, tripId, await createLocation(adminAuth, `L ${randomUUID()}`), new Date().toISOString());

      const res = await getEta(adminAuth, tripId).expect(200);
      expect(res.body.data.tripEstimatedArrival).toBeNull();
      expect(res.body.data.tripEstimatedArrivalSource).toBe('NONE');
      expect(res.body.data.tripPlannedArrival).toBe(plannedArrival);
      expect(res.body.data.limitations.some((l: string) => l.includes('ainda não partiu'))).toBe(true);
      const stop = res.body.data.stops.find((s: { stopId: string }) => s.stopId === stopId);
      expect(stop.estimatedArrival).toBeNull();
      expect(stop.limitation).toEqual(expect.stringContaining('não partiu'));
    });

    it('viagem partiu mas sem RoutePlan/GPS: previsao geografica indisponivel, limitations explica', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('NoRoutePlan');
      const { tripId } = await setupTrip(adminAuth);
      await startTrip(adminAuth, tripId);

      const res = await getEta(adminAuth, tripId).expect(200);
      expect(res.body.data.tripEstimatedArrivalSource).not.toBe('GEOGRAPHIC');
      expect(res.body.data.limitations.some((l: string) => l.toLowerCase().includes('rota geográfica'))).toBe(true);
    });
  });

  // ==========================================================================
  // Viagem em estado incompativel
  // ==========================================================================
  describe('viagem em estado incompativel', () => {
    it('viagem cancelada: nenhuma previsao, limitation clara, nenhuma parada retornada', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Cancelled');
      const { tripId } = await setupTrip(adminAuth);
      await addStop(adminAuth, tripId, await createLocation(adminAuth, `L ${randomUUID()}`));
      await request(app.getHttpServer()).patch(`/api/v1/trips/${tripId}/cancel`).set('Authorization', adminAuth).expect(200);

      const res = await getEta(adminAuth, tripId).expect(200);
      expect(res.body.data.tripEstimatedArrival).toBeNull();
      expect(res.body.data.stops).toEqual([]);
      expect(res.body.data.limitations.some((l: string) => l.toLowerCase().includes('cancel'))).toBe(true);
    });
  });

  // ==========================================================================
  // Isolamento multi-tenant
  // ==========================================================================
  describe('isolamento multi-tenant', () => {
    it('tenant B nunca consegue consultar a ETA da viagem do tenant A', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolA');
      const { tripId } = await setupTrip(tenantA.adminAuth);
      const tenantB = await createTenantAndLoginAsAdmin('IsolB');

      await getEta(tenantB.adminAuth, tripId).expect(404);
    });
  });

  // ==========================================================================
  // RBAC
  // ==========================================================================
  describe('RBAC', () => {
    it('leitura: MANAGER/OPERATOR/DISPATCHER/AUDITOR ok; DRIVER bloqueado (403)', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('RbacRead');
      const { tripId } = await setupTrip(adminAuth);

      for (const role of ['MANAGER', 'OPERATOR', 'DISPATCHER', 'AUDITOR']) {
        const auth = await createUserWithRole(tenantId, adminAuth, role);
        await getEta(auth, tripId).expect(200);
      }

      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      await getEta(driverAuth, tripId).expect(403);
    });
  });

  // ==========================================================================
  // Ausencia de N+1
  // ==========================================================================
  describe('verificacao de ausencia de N+1', () => {
    let countingApp: INestApplication;
    let countingPrisma: PrismaService;
    let basePrisma: PrismaService;
    let queryCount = 0;

    beforeAll(async () => {
      basePrisma = new PrismaService();
      await basePrisma.$connect();
      const extendedPrisma = basePrisma.$extends({
        name: 'query-counter',
        query: {
          $allModels: {
            async $allOperations({ args, query }) {
              queryCount += 1;
              return query(args);
            },
          },
        },
      });

      const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PrismaService)
        .useValue(extendedPrisma)
        .compile();
      countingApp = moduleRef.createNestApplication();
      countingApp.setGlobalPrefix('api');
      countingApp.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
      countingApp.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
      await countingApp.init();
      countingPrisma = moduleRef.get(PrismaService);
    });

    afterAll(async () => {
      await countingApp.close();
      await basePrisma.$disconnect();
    });

    async function createTenantAndLoginOnCountingApp(label: string) {
      const unique = randomUUID().replace(/-/g, '').slice(0, 12);
      const payload = {
        name: `Transportadora ${label} ${unique}`,
        document: randomCnpj(),
        slug: `teta-n1-${label.toLowerCase()}-${unique}`,
        admin: {
          name: `Admin ${label}`,
          email: `admin-${label.toLowerCase()}-${unique}@teste.com`,
          password: 'SenhaForte123!',
        },
      };
      const createRes = await request(countingApp.getHttpServer()).post('/api/v1/tenants').send(payload).expect(201);
      const tenantId: string = createRes.body.data.id;
      createdTenantIds.push(tenantId);

      const loginRes = await request(countingApp.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId, email: payload.admin.email, password: payload.admin.password })
        .expect(200);
      return { tenantId, adminAuth: `Bearer ${loginRes.body.data.accessToken as string}` };
    }

    it('a contagem de queries de GET .../delivery-stops/eta nao cresce com o numero de paradas', async () => {
      const { adminAuth } = await createTenantAndLoginOnCountingApp('N1');
      const vehicleRes = await request(countingApp.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', adminAuth)
        .send({ plate: randomPlate(), brand: 'Volvo', model: 'FH 540', type: 'TRACTOR_UNIT' })
        .expect(201);
      const driverRes = await request(countingApp.getHttpServer())
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
      const compositionRes = await request(countingApp.getHttpServer())
        .post('/api/v1/trip-compositions')
        .set('Authorization', adminAuth)
        .send({ vehicleId: vehicleRes.body.data.id, trailers: [] })
        .expect(201);
      const originRes = await request(countingApp.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', adminAuth)
        .send({ name: `Origem ${randomUUID()}`, type: 'DISTRIBUTION_CENTER' })
        .expect(201);
      const destinationRes = await request(countingApp.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', adminAuth)
        .send({ name: `Destino ${randomUUID()}`, type: 'DISTRIBUTION_CENTER' })
        .expect(201);
      const tripRes = await request(countingApp.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', adminAuth)
        .send({
          driverId: driverRes.body.data.id,
          compositionId: compositionRes.body.data.id,
          originLocationId: originRes.body.data.id,
          destinationLocationId: destinationRes.body.data.id,
          plannedDeparture: new Date(Date.now() - 5 * 60_000).toISOString(),
          plannedArrival: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
        })
        .expect(201);
      const tripId = tripRes.body.data.id as string;

      const checkpoints = [5, 15, 30];
      const queriesByCheckpoint: number[] = [];
      let seeded = 0;
      for (const checkpoint of checkpoints) {
        while (seeded < checkpoint) {
          const locationRes = await request(countingApp.getHttpServer())
            .post('/api/v1/locations')
            .set('Authorization', adminAuth)
            .send({ name: `Parada ${seeded} ${randomUUID()}`, type: 'CUSTOMER_SITE' })
            .expect(201);
          await request(countingApp.getHttpServer())
            .post(`/api/v1/trips/${tripId}/delivery-stops`)
            .set('Authorization', adminAuth)
            .send({ locationId: locationRes.body.data.id, plannedArrival: new Date(Date.now() + 60 * 60_000).toISOString() })
            .expect(201);
          seeded += 1;
        }
        queryCount = 0;
        await request(countingApp.getHttpServer())
          .get(`/api/v1/trips/${tripId}/delivery-stops/eta`)
          .set('Authorization', adminAuth)
          .expect(200);
        queriesByCheckpoint.push(queryCount);
      }

      const [queriesFor5, , queriesFor30] = queriesByCheckpoint;
      expect(queriesFor5).toBeGreaterThan(0);
      expect(queriesFor30).toBeLessThanOrEqual(queriesFor5 + 1);
    }, 180000);
  });
});
