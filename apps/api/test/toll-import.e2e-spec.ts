import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Toll Import (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdTenantIds: string[] = [];
  let superAdminAuth: string;

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

    const superAdmin = await createTenantWithSuperAdmin('TollImportGlobalAdmin');
    superAdminAuth = `Bearer ${superAdmin.superAdminAccessToken}`;
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
      slug: `tollimp-${label.toLowerCase()}-${unique}`,
      admin: {
        name: `Admin ${label}`,
        email: `admin-${label.toLowerCase()}-${unique}@teste.com`,
        password: 'SenhaForte123!',
      },
    };

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/tenants')
      .send(payload)
      .expect(201);
    const tenantId: string = createRes.body.data.id;
    createdTenantIds.push(tenantId);

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email: payload.admin.email, password: payload.admin.password })
      .expect(200);

    return { tenantId, adminAccessToken: loginRes.body.data.accessToken as string };
  }

  async function createTenantWithSuperAdmin(label: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    const payload = {
      name: `Transportadora ${label} ${unique}`,
      document: randomCnpj(),
      slug: `tollimp-${label.toLowerCase()}-${unique}`,
      admin: {
        name: `Admin ${label}`,
        email: `admin-${label.toLowerCase()}-${unique}@teste.com`,
        password: 'SenhaForte123!',
      },
    };

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/tenants')
      .send(payload)
      .expect(201);
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

    return { tenantId, superAdminAccessToken: loginRes.body.data.accessToken as string };
  }

  async function createTollPlaza(overrides: Partial<Record<string, unknown>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/toll-plazas')
      .set('Authorization', superAdminAuth)
      .send({
        name: `Praca ${randomUUID()}`,
        operator: 'CCR ViaOeste',
        highway: 'SP-280',
        pricePerAxle: 10,
        ...overrides,
      })
      .expect(201);
    return res.body.data as { id: string; name: string };
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

  async function getSemParar(auth: string) {
    const res = await request(app.getHttpServer())
      .get('/api/v1/tag-providers')
      .set('Authorization', auth)
      .expect(200);
    return res.body.data.find((p: { name: string }) => p.name === 'Sem Parar') as {
      id: string;
      name: string;
    };
  }

  async function createVehicleTag(
    auth: string,
    vehicleId: string,
    tagProviderId: string,
    tagNumber: string,
    overrides: Partial<Record<string, unknown>> = {},
  ) {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/vehicles/${vehicleId}/tags`)
      .set('Authorization', auth)
      .send({ tagProviderId, tagNumber, activatedAt: '2026-01-01', ...overrides })
      .expect(201);
    return res.body.data.id as string;
  }

  async function startTrip(auth: string, tripId: string) {
    await request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}/status`)
      .set('Authorization', auth)
      .send({ status: 'WAITING_DRIVER' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}/status`)
      .set('Authorization', auth)
      .send({ status: 'WAITING_DEPARTURE' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}/status`)
      .set('Authorization', auth)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
  }

  // Monta viagem EM ANDAMENTO (actualDeparture preenchido) com veiculo e tag
  // ativa/valida na operadora Sem Parar -- estado minimo necessario para uma
  // linha de extrato conseguir ser resolvida (tag -> veiculo -> viagem).
  async function setupInProgressTripWithTag(auth: string, tagNumber: string) {
    const vehicleId = await createVehicle(auth);
    const driverId = await createDriver(auth);
    const compositionId = await createComposition(auth, vehicleId);
    const originId = await createLocation(auth, `Origem ${randomUUID()}`);
    const destinationId = await createLocation(auth, `Destino ${randomUUID()}`);
    const provider = await getSemParar(auth);
    await createVehicleTag(auth, vehicleId, provider.id, tagNumber);

    const tripRes = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', auth)
      .send({
        driverId,
        compositionId,
        originLocationId: originId,
        destinationLocationId: destinationId,
        plannedDeparture: '2026-09-01T08:00:00.000Z',
        plannedArrival: '2026-09-05T18:00:00.000Z',
      })
      .expect(201);
    const tripId = tripRes.body.data.id as string;

    await startTrip(auth, tripId);

    return { vehicleId, driverId, tripId, providerId: provider.id, providerName: provider.name };
  }

  function buildCsv(rows: Array<Record<string, string | number>>): Buffer {
    const header = 'tag,praca,dataHora,valor,eixos';
    const lines = rows.map(
      (row) => `${row.tag},"${row.praca}",${row.dataHora},${row.valor},${row.eixos}`,
    );
    return Buffer.from([header, ...lines].join('\n'), 'utf8');
  }

  async function buildXlsx(rows: Array<Record<string, string | number>>): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('extrato');
    sheet.addRow(['tag', 'praca', 'dataHora', 'valor', 'eixos']);
    for (const row of rows) {
      sheet.addRow([row.tag, row.praca, row.dataHora, row.valor, row.eixos]);
    }
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  describe('POST /toll-import -- importacao bem-sucedida', () => {
    it('importa uma linha valida via CSV e cria a TollTransaction automaticamente', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('CsvOk');
      const auth = `Bearer ${adminAccessToken}`;
      const plaza = await createTollPlaza({ pricePerAxle: 10 });
      const tagNumber = `TAG${randomUUID().replace(/-/g, '').slice(0, 10)}`;
      const setup = await setupInProgressTripWithTag(auth, tagNumber);

      const csv = buildCsv([
        {
          tag: tagNumber,
          praca: plaza.name,
          dataHora: '2026-09-02T10:00:00.000Z',
          valor: 60,
          eixos: 6,
        },
      ]);

      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-import')
        .set('Authorization', auth)
        .field('providerId', setup.providerId)
        .attach('file', csv, 'extrato.csv')
        .expect(201);

      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.importedRecords).toBe(1);
      expect(res.body.data.ignoredRecords).toBe(0);
      expect(res.body.data.errorRecords).toBe(0);
      expect(res.body.data.fileType).toBe('CSV');
      expect(res.body.data.providerName).toBe('Sem Parar');
      expect(res.body.data.startedAt).toBeTruthy();
      expect(res.body.data.finishedAt).toBeTruthy();

      const txListRes = await request(app.getHttpServer())
        .get(`/api/v1/toll-transactions?tripId=${setup.tripId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(txListRes.body.data.items).toHaveLength(1);
      expect(txListRes.body.data.items[0].chargedAmount).toBe(60);
      expect(txListRes.body.data.items[0].expectedAmount).toBe(60);
      expect(txListRes.body.data.items[0].status).toBe('NORMAL');
      expect(txListRes.body.data.items[0].source).toBe('INTEGRATION');
    });

    it('importa uma linha valida via XLSX', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('XlsxOk');
      const auth = `Bearer ${adminAccessToken}`;
      const plaza = await createTollPlaza({ pricePerAxle: 5 });
      const tagNumber = `TAG${randomUUID().replace(/-/g, '').slice(0, 10)}`;
      const setup = await setupInProgressTripWithTag(auth, tagNumber);

      const xlsx = await buildXlsx([
        {
          tag: tagNumber,
          praca: plaza.name,
          dataHora: '2026-09-02T10:00:00.000Z',
          valor: 20,
          eixos: 4,
        },
      ]);

      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-import')
        .set('Authorization', auth)
        .field('providerId', setup.providerId)
        .attach('file', xlsx, 'extrato.xlsx')
        .expect(201);

      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.importedRecords).toBe(1);
      expect(res.body.data.fileType).toBe('XLSX');
    });
  });

  describe('validacoes por linha -- nunca interrompem a importacao inteira', () => {
    it('registra erro para tag inexistente e mantem status FAILED (0 importados)', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('BadTag');
      const auth = `Bearer ${adminAccessToken}`;
      const plaza = await createTollPlaza();
      const provider = await getSemParar(auth);

      const csv = buildCsv([
        {
          tag: 'TAG-INEXISTENTE',
          praca: plaza.name,
          dataHora: '2026-09-02T10:00:00.000Z',
          valor: 10,
          eixos: 2,
        },
      ]);

      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-import')
        .set('Authorization', auth)
        .field('providerId', provider.id)
        .attach('file', csv, 'extrato.csv')
        .expect(201);

      expect(res.body.data.status).toBe('FAILED');
      expect(res.body.data.importedRecords).toBe(0);
      expect(res.body.data.errorRecords).toBe(1);

      const errorsRes = await request(app.getHttpServer())
        .get(`/api/v1/toll-import/${res.body.data.id}/errors`)
        .set('Authorization', auth)
        .expect(200);
      expect(errorsRes.body.data.items).toHaveLength(1);
      expect(errorsRes.body.data.items[0].issueType).toBe('VALIDATION_ERROR');
      expect(errorsRes.body.data.items[0].message).toMatch(/inexistente/i);
      expect(errorsRes.body.data.items[0].rawData.tag).toBe('TAG-INEXISTENTE');
    });

    it('registra erro para praca inexistente', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('BadPlaza');
      const auth = `Bearer ${adminAccessToken}`;
      const tagNumber = `TAG${randomUUID().replace(/-/g, '').slice(0, 10)}`;
      const setup = await setupInProgressTripWithTag(auth, tagNumber);

      const csv = buildCsv([
        {
          tag: tagNumber,
          praca: 'Praca Que Nao Existe 12345',
          dataHora: '2026-09-02T10:00:00.000Z',
          valor: 10,
          eixos: 2,
        },
      ]);

      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-import')
        .set('Authorization', auth)
        .field('providerId', setup.providerId)
        .attach('file', csv, 'extrato.csv')
        .expect(201);

      expect(res.body.data.status).toBe('FAILED');
      const errorsRes = await request(app.getHttpServer())
        .get(`/api/v1/toll-import/${res.body.data.id}/errors`)
        .set('Authorization', auth)
        .expect(200);
      expect(errorsRes.body.data.items[0].message).toMatch(/Praca de pedagio inexistente/);
    });

    it('registra erro para tag vencida', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('ExpiredTag');
      const auth = `Bearer ${adminAccessToken}`;
      const plaza = await createTollPlaza();
      const tagNumber = `TAG${randomUUID().replace(/-/g, '').slice(0, 10)}`;

      const vehicleId = await createVehicle(auth);
      const driverId = await createDriver(auth);
      const compositionId = await createComposition(auth, vehicleId);
      const originId = await createLocation(auth, `Origem ${randomUUID()}`);
      const destinationId = await createLocation(auth, `Destino ${randomUUID()}`);
      const provider = await getSemParar(auth);
      await createVehicleTag(auth, vehicleId, provider.id, tagNumber, { expiresAt: '2026-01-01' });

      const tripRes = await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', auth)
        .send({
          driverId,
          compositionId,
          originLocationId: originId,
          destinationLocationId: destinationId,
          plannedDeparture: '2026-09-01T08:00:00.000Z',
          plannedArrival: '2026-09-05T18:00:00.000Z',
        })
        .expect(201);
      await startTrip(auth, tripRes.body.data.id);

      const csv = buildCsv([
        {
          tag: tagNumber,
          praca: plaza.name,
          dataHora: '2026-09-02T10:00:00.000Z',
          valor: 10,
          eixos: 2,
        },
      ]);

      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-import')
        .set('Authorization', auth)
        .field('providerId', provider.id)
        .attach('file', csv, 'extrato.csv')
        .expect(201);

      expect(res.body.data.status).toBe('FAILED');
      const errorsRes = await request(app.getHttpServer())
        .get(`/api/v1/toll-import/${res.body.data.id}/errors`)
        .set('Authorization', auth)
        .expect(200);
      expect(errorsRes.body.data.items[0].message).toMatch(/vencida/i);
    });

    it('registra erro para tag inativa', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('InactiveTag');
      const auth = `Bearer ${adminAccessToken}`;
      const plaza = await createTollPlaza();
      const tagNumber = `TAG${randomUUID().replace(/-/g, '').slice(0, 10)}`;
      const setup = await setupInProgressTripWithTag(auth, tagNumber);

      const tagsRes = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${setup.vehicleId}/tags`)
        .set('Authorization', auth)
        .expect(200);
      const tagId = tagsRes.body.data[0].id;
      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${setup.vehicleId}/tags/${tagId}/status`)
        .set('Authorization', auth)
        .send({ isActive: false })
        .expect(200);

      const csv = buildCsv([
        {
          tag: tagNumber,
          praca: plaza.name,
          dataHora: '2026-09-02T10:00:00.000Z',
          valor: 10,
          eixos: 2,
        },
      ]);

      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-import')
        .set('Authorization', auth)
        .field('providerId', setup.providerId)
        .attach('file', csv, 'extrato.csv')
        .expect(201);

      expect(res.body.data.status).toBe('FAILED');
      const errorsRes = await request(app.getHttpServer())
        .get(`/api/v1/toll-import/${res.body.data.id}/errors`)
        .set('Authorization', auth)
        .expect(200);
      expect(errorsRes.body.data.items[0].message).toMatch(/inativa/i);
    });

    it('registra erro para valor negativo e para quantidade de eixos invalida, sem interromper as demais linhas', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('MixedRows');
      const auth = `Bearer ${adminAccessToken}`;
      const plaza = await createTollPlaza({ pricePerAxle: 10 });
      const tagNumber = `TAG${randomUUID().replace(/-/g, '').slice(0, 10)}`;
      const setup = await setupInProgressTripWithTag(auth, tagNumber);

      const csv = buildCsv([
        {
          tag: tagNumber,
          praca: plaza.name,
          dataHora: '2026-09-02T10:00:00.000Z',
          valor: -10,
          eixos: 2,
        },
        {
          tag: tagNumber,
          praca: plaza.name,
          dataHora: '2026-09-02T11:00:00.000Z',
          valor: 10,
          eixos: 0,
        },
        {
          tag: tagNumber,
          praca: plaza.name,
          dataHora: '2026-09-02T12:00:00.000Z',
          valor: 50,
          eixos: 5,
        },
      ]);

      const res = await request(app.getHttpServer())
        .post('/api/v1/toll-import')
        .set('Authorization', auth)
        .field('providerId', setup.providerId)
        .attach('file', csv, 'extrato.csv')
        .expect(201);

      expect(res.body.data.status).toBe('PARTIAL_SUCCESS');
      expect(res.body.data.importedRecords).toBe(1);
      expect(res.body.data.errorRecords).toBe(2);
      expect(res.body.data.totalRecords).toBe(3);

      const errorsRes = await request(app.getHttpServer())
        .get(`/api/v1/toll-import/${res.body.data.id}/errors`)
        .set('Authorization', auth)
        .expect(200);
      expect(errorsRes.body.data.items).toHaveLength(2);
      expect(errorsRes.body.data.meta.total).toBe(2);
    });

    it('rejeita extensao de arquivo nao suportada com 400', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('BadExt');
      const auth = `Bearer ${adminAccessToken}`;
      const provider = await getSemParar(auth);

      await request(app.getHttpServer())
        .post('/api/v1/toll-import')
        .set('Authorization', auth)
        .field('providerId', provider.id)
        .attach('file', Buffer.from('conteudo qualquer'), 'extrato.txt')
        .expect(400);
    });

    // Fase 46 -- extensao correta (.csv) mas conteudo binario (nao texto) --
    // extensao sozinha nunca prova o conteudo real. O arquivo nao pode
    // ficar em disco apos a rejeicao.
    it('rejeita conteudo binario disfarcado de CSV (extensao correta, assinatura invalida) com 400', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('FakeCsv');
      const auth = `Bearer ${adminAccessToken}`;
      const provider = await getSemParar(auth);
      const fakeCsv = Buffer.from([0x4d, 0x5a, 0x00, 0x00, 0x01, 0x02, 0x00, 0x03]); // assinatura de executavel (MZ) + NUL

      const jobsBefore = await prisma.importJob.count();

      await request(app.getHttpServer())
        .post('/api/v1/toll-import')
        .set('Authorization', auth)
        .field('providerId', provider.id)
        .attach('file', fakeCsv, 'extrato.csv')
        .expect(400);

      const jobsAfter = await prisma.importJob.count();
      expect(jobsAfter).toBe(jobsBefore);
    });

    it('rejeita operadora inexistente com 404', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('BadProvider');
      const auth = `Bearer ${adminAccessToken}`;
      const csv = buildCsv([
        { tag: 'X', praca: 'Y', dataHora: '2026-09-02T10:00:00.000Z', valor: 10, eixos: 2 },
      ]);

      await request(app.getHttpServer())
        .post('/api/v1/toll-import')
        .set('Authorization', auth)
        .field('providerId', randomUUID())
        .attach('file', csv, 'extrato.csv')
        .expect(404);
    });
  });

  describe('deduplicacao', () => {
    it('nao importa novamente a mesma transacao (operadora + tag + praca + data/hora + valor)', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('Dedup');
      const auth = `Bearer ${adminAccessToken}`;
      const plaza = await createTollPlaza({ pricePerAxle: 10 });
      const tagNumber = `TAG${randomUUID().replace(/-/g, '').slice(0, 10)}`;
      const setup = await setupInProgressTripWithTag(auth, tagNumber);

      const csv = buildCsv([
        {
          tag: tagNumber,
          praca: plaza.name,
          dataHora: '2026-09-02T10:00:00.000Z',
          valor: 60,
          eixos: 6,
        },
      ]);

      const firstRes = await request(app.getHttpServer())
        .post('/api/v1/toll-import')
        .set('Authorization', auth)
        .field('providerId', setup.providerId)
        .attach('file', csv, 'extrato.csv')
        .expect(201);
      expect(firstRes.body.data.importedRecords).toBe(1);

      const secondRes = await request(app.getHttpServer())
        .post('/api/v1/toll-import')
        .set('Authorization', auth)
        .field('providerId', setup.providerId)
        .attach('file', csv, 'extrato.csv')
        .expect(201);

      expect(secondRes.body.data.status).toBe('COMPLETED');
      expect(secondRes.body.data.importedRecords).toBe(0);
      expect(secondRes.body.data.ignoredRecords).toBe(1);
      expect(secondRes.body.data.errorRecords).toBe(0);

      const errorsRes = await request(app.getHttpServer())
        .get(`/api/v1/toll-import/${secondRes.body.data.id}/errors`)
        .set('Authorization', auth)
        .expect(200);
      expect(errorsRes.body.data.items[0].issueType).toBe('DUPLICATE');

      const txListRes = await request(app.getHttpServer())
        .get(`/api/v1/toll-transactions?tripId=${setup.tripId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(txListRes.body.data.items).toHaveLength(1);
    });
  });

  describe('listagem e filtros', () => {
    it('lista jobs de importacao com filtro por operadora/status e paginacao', async () => {
      const { adminAccessToken } = await createTenantAndLoginAsAdmin('ListJobs');
      const auth = `Bearer ${adminAccessToken}`;
      const plaza = await createTollPlaza({ pricePerAxle: 10 });
      const tagA = `TAG${randomUUID().replace(/-/g, '').slice(0, 10)}`;
      const tagB = `TAG${randomUUID().replace(/-/g, '').slice(0, 10)}`;
      const setupA = await setupInProgressTripWithTag(auth, tagA);
      await setupInProgressTripWithTag(auth, tagB);

      const okCsv = buildCsv([
        { tag: tagA, praca: plaza.name, dataHora: '2026-09-02T10:00:00.000Z', valor: 60, eixos: 6 },
      ]);
      const badCsv = buildCsv([
        {
          tag: 'TAG-INEXISTENTE',
          praca: plaza.name,
          dataHora: '2026-09-02T10:00:00.000Z',
          valor: 10,
          eixos: 2,
        },
      ]);

      const okJob = await request(app.getHttpServer())
        .post('/api/v1/toll-import')
        .set('Authorization', auth)
        .field('providerId', setupA.providerId)
        .attach('file', okCsv, 'ok.csv')
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/toll-import')
        .set('Authorization', auth)
        .field('providerId', setupA.providerId)
        .attach('file', badCsv, 'bad.csv')
        .expect(201);

      const byStatus = await request(app.getHttpServer())
        .get('/api/v1/toll-import?status=COMPLETED')
        .set('Authorization', auth)
        .expect(200);
      expect(byStatus.body.data.items).toHaveLength(1);
      expect(byStatus.body.data.items[0].id).toBe(okJob.body.data.id);

      const byProvider = await request(app.getHttpServer())
        .get(`/api/v1/toll-import?providerId=${setupA.providerId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(byProvider.body.data.meta.total).toBe(2);

      const getOne = await request(app.getHttpServer())
        .get(`/api/v1/toll-import/${okJob.body.data.id}`)
        .set('Authorization', auth)
        .expect(200);
      expect(getOne.body.data.id).toBe(okJob.body.data.id);
    });
  });

  describe('isolamento multi-tenant', () => {
    it('nunca permite acesso cruzado entre tenants', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsolA');
      const tenantB = await createTenantAndLoginAsAdmin('IsolB');
      const authA = `Bearer ${tenantA.adminAccessToken}`;
      const authB = `Bearer ${tenantB.adminAccessToken}`;

      const plaza = await createTollPlaza({ pricePerAxle: 10 });
      const tagNumber = `TAG${randomUUID().replace(/-/g, '').slice(0, 10)}`;
      const setupA = await setupInProgressTripWithTag(authA, tagNumber);

      const csv = buildCsv([
        {
          tag: tagNumber,
          praca: plaza.name,
          dataHora: '2026-09-02T10:00:00.000Z',
          valor: 60,
          eixos: 6,
        },
      ]);

      const jobRes = await request(app.getHttpServer())
        .post('/api/v1/toll-import')
        .set('Authorization', authA)
        .field('providerId', setupA.providerId)
        .attach('file', csv, 'extrato.csv')
        .expect(201);

      await request(app.getHttpServer())
        .get(`/api/v1/toll-import/${jobRes.body.data.id}`)
        .set('Authorization', authB)
        .expect(404);

      const listInB = await request(app.getHttpServer())
        .get('/api/v1/toll-import')
        .set('Authorization', authB)
        .expect(200);
      expect(
        listInB.body.data.items.find((j: { id: string }) => j.id === jobRes.body.data.id),
      ).toBeUndefined();
    });
  });

  describe('permissoes por perfil', () => {
    it('AUDITOR le mas nao pode enviar extrato (403)', async () => {
      const { tenantId, adminAccessToken } = await createTenantAndLoginAsAdmin('RolesAuditor');
      const auditorEmail = `auditor-tollimport-${randomUUID()}@teste.com`;
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          name: 'Auditor',
          email: auditorEmail,
          password: 'SenhaForte123!',
          role: 'AUDITOR',
        })
        .expect(201);

      const auditorLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId, email: auditorEmail, password: 'SenhaForte123!' })
        .expect(200);
      const auditorAuth = `Bearer ${auditorLogin.body.data.accessToken}`;

      await request(app.getHttpServer())
        .get('/api/v1/toll-import')
        .set('Authorization', auditorAuth)
        .expect(200);

      const provider = await getSemParar(auditorAuth);
      const csv = buildCsv([
        { tag: 'X', praca: 'Y', dataHora: '2026-09-02T10:00:00.000Z', valor: 10, eixos: 2 },
      ]);
      await request(app.getHttpServer())
        .post('/api/v1/toll-import')
        .set('Authorization', auditorAuth)
        .field('providerId', provider.id)
        .attach('file', csv, 'extrato.csv')
        .expect(403);
    });
  });
});
