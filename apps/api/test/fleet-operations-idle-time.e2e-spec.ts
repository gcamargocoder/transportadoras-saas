import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase A -- GET /fleet-operations/idle-time. Tempo OCIOSO entre operacoes
// (veiculo SEM VIAGEM entre a chegada de uma viagem e a partida da
// seguinte). Distinto de /downtime-cost (parada DENTRO da viagem, TripStop).
// NENHUMA tabela/migration nova -- deriva de Trip.actualArrival/
// actualDeparture/status + VehicleMaintenance.
describe('Fleet Operations Idle Time (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
    const calcDigit = (nums: number[], factor: number): number => {
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
      slug: `idle-${label.toLowerCase()}-${unique}`,
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
      .send({ name: 'Jose da Silva', cpf: randomValidCpf(), cnhNumber: String(Math.floor(1e10 + Math.random() * 8e10)), cnhCategory: 'AE', cnhExpiresAt: '2028-06-30' })
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
      .send({ vehicleId, trailers: [], axleConfiguration: { totalAxles: 6, billableCategory: '6 eixos' } })
      .expect(201);
    return res.body.data.id as string;
  }

  // Cria uma viagem e forca status/timestamps de forma deterministica
  // (mesmo padrao de fleet-operations.e2e-spec.ts: prisma.trip.update direto
  // para o que a API nao expoe explicitamente).
  async function createTrip(
    auth: string,
    vehicleId: string,
    opts: { status: 'COMPLETED' | 'IN_PROGRESS' | 'PAUSED'; actualDeparture: string; actualArrival: string | null; destinationName?: string },
  ) {
    const driverId = await createDriver(auth);
    const compositionId = await createComposition(auth, vehicleId);
    const originId = await createLocation(auth, `Origem ${randomUUID()}`);
    const destinationId = await createLocation(auth, opts.destinationName ?? `Destino ${randomUUID()}`);
    const tripRes = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', auth)
      .send({
        driverId,
        compositionId,
        originLocationId: originId,
        destinationLocationId: destinationId,
        plannedDeparture: '2026-01-01T08:00:00.000Z',
        plannedArrival: '2026-01-02T18:00:00.000Z',
      })
      .expect(201);
    const tripId = tripRes.body.data.id as string;
    await prisma.trip.update({
      where: { id: tripId },
      data: {
        status: opts.status,
        actualDeparture: new Date(opts.actualDeparture),
        actualArrival: opts.actualArrival ? new Date(opts.actualArrival) : null,
      },
    });
    return tripId;
  }

  async function createMaintenance(
    tenantId: string,
    vehicleId: string,
    opts: { startedAt: string; completedAt: string | null; status?: string },
  ) {
    return prisma.vehicleMaintenance.create({
      data: {
        tenantId,
        vehicleId,
        type: 'CORRECTIVE',
        status: (opts.status ?? (opts.completedAt ? 'COMPLETED' : 'IN_PROGRESS')) as never,
        openedAt: new Date(opts.startedAt),
        startedAt: new Date(opts.startedAt),
        completedAt: opts.completedAt ? new Date(opts.completedAt) : null,
      },
      select: { id: true },
    });
  }

  const minutesBetween = (a: string, b: string): number =>
    Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000);

  // ==========================================================================

  it('estado vazio: sem viagens, retorna items vazio e meta zerada', async () => {
    const { adminAuth } = await createTenantAndLoginAsAdmin('Empty');
    await createVehicle(adminAuth);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fleet-operations/idle-time')
      .set('Authorization', adminAuth)
      .expect(200);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.meta.total).toBe(0);
    expect(typeof res.body.data.asOf).toBe('string');
  });

  it('uma viagem concluida -> veiculo aparece como parado ATUALMENTE (isCurrentlyIdle/isEstimate, idleEnd nulo, ultimo destino)', async () => {
    const { adminAuth } = await createTenantAndLoginAsAdmin('OneTrip');
    const vehicleId = await createVehicle(adminAuth);
    const arrival = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(); // 6h atras
    await createTrip(adminAuth, vehicleId, {
      status: 'COMPLETED',
      actualDeparture: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
      actualArrival: arrival,
      destinationName: 'CD Guarulhos/SP',
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fleet-operations/idle-time')
      .set('Authorization', adminAuth)
      .query({ vehicleId })
      .expect(200);

    expect(res.body.data.items).toHaveLength(1);
    const row = res.body.data.items[0];
    expect(row.vehicleId).toBe(vehicleId);
    expect(row.isCurrentlyIdle).toBe(true);
    expect(row.isEstimate).toBe(true);
    expect(row.idleEnd).toBeNull();
    expect(row.nextTripId).toBeNull();
    expect(row.lastDestinationLabel).toBe('CD Guarulhos/SP');
    expect(row.totalMinutes).toBeGreaterThanOrEqual(355);
    expect(row.maintenanceMinutes).toBe(0);
    expect(row.netIdleMinutes).toBe(row.totalMinutes);
  });

  it('duas viagens concluidas -> um periodo ocioso FECHADO entre a chegada da 1a e a partida da 2a', async () => {
    const { adminAuth } = await createTenantAndLoginAsAdmin('TwoTrips');
    const vehicleId = await createVehicle(adminAuth);
    const t1Arrival = '2026-06-02T00:00:00.000Z';
    const t2Departure = '2026-06-02T09:00:00.000Z';
    await createTrip(adminAuth, vehicleId, { status: 'COMPLETED', actualDeparture: '2026-06-01T06:00:00.000Z', actualArrival: t1Arrival });
    await createTrip(adminAuth, vehicleId, { status: 'COMPLETED', actualDeparture: t2Departure, actualArrival: '2026-06-03T00:00:00.000Z' });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fleet-operations/idle-time')
      .set('Authorization', adminAuth)
      .query({ vehicleId })
      .expect(200);

    const closed = res.body.data.items.find((r: { isCurrentlyIdle: boolean }) => !r.isCurrentlyIdle);
    expect(closed).toBeDefined();
    expect(closed.idleStart).toBe(new Date(t1Arrival).toISOString());
    expect(closed.idleEnd).toBe(new Date(t2Departure).toISOString());
    expect(closed.totalMinutes).toBe(minutesBetween(t1Arrival, t2Departure)); // 540
    expect(closed.isEstimate).toBe(false);
    expect(closed.nextTripId).toBeTruthy();
  });

  it('manutencao cobrindo PARTE do periodo -> maintenanceMinutes < total, netIdle = total - manutencao', async () => {
    const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('MaintPartial');
    const vehicleId = await createVehicle(adminAuth);
    const t1Arrival = '2026-06-10T00:00:00.000Z';
    const t2Departure = '2026-06-10T10:00:00.000Z'; // gap 600 min
    await createTrip(adminAuth, vehicleId, { status: 'COMPLETED', actualDeparture: '2026-06-09T00:00:00.000Z', actualArrival: t1Arrival });
    await createTrip(adminAuth, vehicleId, { status: 'COMPLETED', actualDeparture: t2Departure, actualArrival: '2026-06-11T00:00:00.000Z' });
    await createMaintenance(tenantId, vehicleId, { startedAt: '2026-06-10T02:00:00.000Z', completedAt: '2026-06-10T05:00:00.000Z' }); // 180 min

    const res = await request(app.getHttpServer())
      .get('/api/v1/fleet-operations/idle-time')
      .set('Authorization', adminAuth)
      .query({ vehicleId })
      .expect(200);
    const closed = res.body.data.items.find((r: { isCurrentlyIdle: boolean }) => !r.isCurrentlyIdle);
    expect(closed.totalMinutes).toBe(600);
    expect(closed.maintenanceMinutes).toBe(180);
    expect(closed.netIdleMinutes).toBe(420);
  });

  it('multiplas manutencoes sobrepostas cobrindo TODO o periodo -> maintenanceMinutes = total, netIdle = 0 (sem duplicar minutos)', async () => {
    const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('MaintFull');
    const vehicleId = await createVehicle(adminAuth);
    const t1Arrival = '2026-06-15T00:00:00.000Z';
    const t2Departure = '2026-06-15T08:00:00.000Z'; // 480 min
    await createTrip(adminAuth, vehicleId, { status: 'COMPLETED', actualDeparture: '2026-06-14T00:00:00.000Z', actualArrival: t1Arrival });
    await createTrip(adminAuth, vehicleId, { status: 'COMPLETED', actualDeparture: t2Departure, actualArrival: '2026-06-16T00:00:00.000Z' });
    await createMaintenance(tenantId, vehicleId, { startedAt: '2026-06-14T20:00:00.000Z', completedAt: '2026-06-15T04:00:00.000Z' });
    await createMaintenance(tenantId, vehicleId, { startedAt: '2026-06-15T03:00:00.000Z', completedAt: '2026-06-15T12:00:00.000Z' });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fleet-operations/idle-time')
      .set('Authorization', adminAuth)
      .query({ vehicleId })
      .expect(200);
    const closed = res.body.data.items.find((r: { isCurrentlyIdle: boolean }) => !r.isCurrentlyIdle);
    expect(closed.totalMinutes).toBe(480);
    expect(closed.maintenanceMinutes).toBe(480);
    expect(closed.netIdleMinutes).toBe(0);
  });

  it('veiculo ATUALMENTE em viagem (IN_PROGRESS) nunca aparece como parado agora', async () => {
    const { adminAuth } = await createTenantAndLoginAsAdmin('OnTrip');
    const vehicleId = await createVehicle(adminAuth);
    await createTrip(adminAuth, vehicleId, { status: 'COMPLETED', actualDeparture: '2026-06-01T00:00:00.000Z', actualArrival: '2026-06-02T00:00:00.000Z' });
    await createTrip(adminAuth, vehicleId, { status: 'IN_PROGRESS', actualDeparture: '2026-06-02T06:00:00.000Z', actualArrival: null });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fleet-operations/idle-time')
      .set('Authorization', adminAuth)
      .query({ vehicleId })
      .expect(200);
    expect(res.body.data.items.some((r: { isCurrentlyIdle: boolean }) => r.isCurrentlyIdle)).toBe(false);
    // ainda ha o gap fechado entre as duas viagens
    expect(res.body.data.items.some((r: { isCurrentlyIdle: boolean }) => !r.isCurrentlyIdle)).toBe(true);
  });

  it('filtro from/to mantem so os periodos que SOBREPOEM a janela (nunca um periodo inteiramente fora)', async () => {
    const { adminAuth } = await createTenantAndLoginAsAdmin('Window');
    const vehicleId = await createVehicle(adminAuth);
    // gap curto INTEIRAMENTE em marco (5h entre as 2 viagens de marco).
    await createTrip(adminAuth, vehicleId, { status: 'COMPLETED', actualDeparture: '2026-03-01T00:00:00.000Z', actualArrival: '2026-03-02T00:00:00.000Z' });
    await createTrip(adminAuth, vehicleId, { status: 'COMPLETED', actualDeparture: '2026-03-02T05:00:00.000Z', actualArrival: '2026-03-03T00:00:00.000Z' });
    // gap curto INTEIRAMENTE em abril (6h).
    await createTrip(adminAuth, vehicleId, { status: 'COMPLETED', actualDeparture: '2026-04-09T00:00:00.000Z', actualArrival: '2026-04-10T00:00:00.000Z' });
    await createTrip(adminAuth, vehicleId, { status: 'COMPLETED', actualDeparture: '2026-04-10T06:00:00.000Z', actualArrival: '2026-04-11T00:00:00.000Z' });

    const from = new Date('2026-04-01T00:00:00.000Z').getTime();
    const to = new Date('2026-04-30T23:59:59.999Z').getTime();

    const res = await request(app.getHttpServer())
      .get('/api/v1/fleet-operations/idle-time')
      .set('Authorization', adminAuth)
      .query({ vehicleId, from: '2026-04-01', to: '2026-04-30' })
      .expect(200);

    const items = res.body.data.items as { idleStart: string; idleEnd: string | null; totalMinutes: number }[];
    // o gap curto de 6h de abril esta presente
    expect(items.some((r) => r.totalMinutes === 360)).toBe(true);
    // o gap curto de 5h INTEIRAMENTE em marco (300 min, idleEnd em marco) foi excluido
    expect(items.some((r) => r.totalMinutes === 300)).toBe(false);
    // NENHUM item devolvido esta inteiramente fora da janela (regra de sobreposicao)
    for (const r of items) {
      const segStart = new Date(r.idleStart).getTime();
      const segEnd = r.idleEnd ? new Date(r.idleEnd).getTime() : Date.now();
      expect(segStart <= to && segEnd >= from).toBe(true);
    }
  });

  it('paginacao: pageSize=1 devolve 1 item e meta.total reflete o todo', async () => {
    const { adminAuth } = await createTenantAndLoginAsAdmin('Pag');
    const vehicleId = await createVehicle(adminAuth);
    await createTrip(adminAuth, vehicleId, { status: 'COMPLETED', actualDeparture: '2026-05-01T00:00:00.000Z', actualArrival: '2026-05-02T00:00:00.000Z' });
    await createTrip(adminAuth, vehicleId, { status: 'COMPLETED', actualDeparture: '2026-05-02T05:00:00.000Z', actualArrival: '2026-05-03T00:00:00.000Z' });
    await createTrip(adminAuth, vehicleId, { status: 'COMPLETED', actualDeparture: '2026-05-03T05:00:00.000Z', actualArrival: '2026-05-04T00:00:00.000Z' });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fleet-operations/idle-time')
      .set('Authorization', adminAuth)
      .query({ vehicleId, page: 1, pageSize: 1 })
      .expect(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.meta.total).toBeGreaterThanOrEqual(3); // 2 fechados + 1 corrente
    expect(res.body.data.meta.pageSize).toBe(1);
  });

  it('isolamento multi-tenant: tenant B nunca ve a ociosidade do tenant A', async () => {
    const a = await createTenantAndLoginAsAdmin('IsoA');
    const b = await createTenantAndLoginAsAdmin('IsoB');
    const vehicleA = await createVehicle(a.adminAuth);
    await createTrip(a.adminAuth, vehicleA, { status: 'COMPLETED', actualDeparture: '2026-02-01T00:00:00.000Z', actualArrival: '2026-02-02T00:00:00.000Z' });

    const resB = await request(app.getHttpServer())
      .get('/api/v1/fleet-operations/idle-time')
      .set('Authorization', b.adminAuth)
      .expect(200);
    expect(resB.body.data.items).toEqual([]);
  });

  it('RBAC: DRIVER recebe 403; ADMIN/OPERATOR ok', async () => {
    const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Rbac');
    const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
    const operatorAuth = await createUserWithRole(tenantId, adminAuth, 'OPERATOR');
    await request(app.getHttpServer()).get('/api/v1/fleet-operations/idle-time').set('Authorization', driverAuth).expect(403);
    await request(app.getHttpServer()).get('/api/v1/fleet-operations/idle-time').set('Authorization', operatorAuth).expect(200);
  });
});
