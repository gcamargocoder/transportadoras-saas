import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const VALID_PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
const VALID_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const VALID_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const INVALID_PDF = Buffer.from('isto nao e um pdf de verdade');
const FAKE_EXECUTABLE = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]); // "MZ" (PE/EXE)

function buildNfeXml(accessKey: string, number: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00">
  <NFe>
    <infNFe Id="NFe${accessKey}" versao="4.00">
      <ide><serie>1</serie><nNF>${number}</nNF><dhEmi>2026-08-01T10:00:00-03:00</dhEmi></ide>
      <emit><CNPJ>12345678000199</CNPJ><xNome>Emitente Teste LTDA</xNome></emit>
      <dest><CNPJ>98765432000188</CNPJ><xNome>Destinatario Teste LTDA</xNome></dest>
      <total><ICMSTot><vNF>1500.00</vNF></ICMSTot></total>
    </infNFe>
  </NFe>
</nfeProc>`;
}

function buildCteXml(accessKey: string, number: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<cteProc versao="4.00">
  <CTe>
    <infCte Id="CTe${accessKey}" versao="4.00">
      <ide><serie>2</serie><nCT>${number}</nCT><dhEmi>2026-08-02T08:30:00-03:00</dhEmi></ide>
      <emit><CNPJ>11222333000144</CNPJ><xNome>Transportadora Teste LTDA</xNome></emit>
      <dest><CNPJ>98765432000188</CNPJ><xNome>Cliente Final LTDA</xNome></dest>
      <vPrest><vTPrest>850.50</vTPrest></vPrest>
    </infCte>
  </CTe>
</cteProc>`;
}

function buildMdfeXml(accessKey: string, number: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<mdfeProc versao="3.00">
  <MDFe>
    <infMDFe Id="MDFe${accessKey}" versao="3.00">
      <ide><serie>1</serie><nMDF>${number}</nMDF><dhEmi>2026-08-03T07:00:00-03:00</dhEmi></ide>
      <emit><CNPJ>11222333000144</CNPJ><xNome>Transportadora Teste LTDA</xNome></emit>
    </infMDFe>
  </MDFe>
</mdfeProc>`;
}

function randomAccessKey(): string {
  return Array.from({ length: 44 }, () => Math.floor(Math.random() * 10)).join('');
}

describe('Fiscal Documents (e2e)', () => {
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
      slug: `fiscal-${label.toLowerCase()}-${unique}`,
      admin: { name: `Admin ${label}`, email: `admin-${label.toLowerCase()}-${unique}@teste.com`, password: 'SenhaForte123!' },
    };
    const createRes = await request(app.getHttpServer()).post('/api/v1/tenants').send(payload).expect(201);
    const tenantId: string = createRes.body.data.id;
    createdTenantIds.push(tenantId);

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

  async function createTrip(auth: string, driverId: string, compositionId: string) {
    const originId = await createLocation(auth, `Origem ${randomUUID()}`);
    const destinationId = await createLocation(auth, `Destino ${randomUUID()}`);
    const res = await request(app.getHttpServer())
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
    return res.body.data.id as string;
  }

  async function setupTripAndVehicle(auth: string) {
    const vehicleId = await createVehicle(auth);
    const driverId = await createDriver(auth);
    const compositionId = await createComposition(auth, vehicleId);
    const tripId = await createTrip(auth, driverId, compositionId);
    return { vehicleId, driverId, tripId };
  }

  async function createCustomer(auth: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', auth)
      .send({ name: 'Cliente Teste' })
      .expect(201);
    return res.body.data.id as string;
  }

  // ==========================================================================
  // Upload
  // ==========================================================================
  describe('upload', () => {
    it('envia um PDF com metadados manuais e vinculo operacional', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('UploadPdf');
      const { tripId, vehicleId, driverId } = await setupTripAndVehicle(adminAuth);

      const res = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'DELIVERY_PROOF')
        .field('documentNumber', 'CE-001')
        .field('tripId', tripId)
        .field('vehicleId', vehicleId)
        .field('driverId', driverId)
        .attach('file', VALID_PDF, 'comprovante.pdf')
        .expect(201);

      expect(res.body.data.documentType).toBe('DELIVERY_PROOF');
      expect(res.body.data.documentNumber).toBe('CE-001');
      expect(res.body.data.source).toBe('UPLOAD');
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.fileName).toBe('comprovante.pdf');
      expect(res.body.data.mimeType).toBeTruthy();
      expect(res.body.data.sizeBytes).toBe(VALID_PDF.length);
      expect(res.body.data.tripId).toBe(tripId);
      expect(res.body.data.vehicleId).toBe(vehicleId);
      expect(res.body.data.driverId).toBe(driverId);
      expect(res.body.data.attachmentId).toBeTruthy();

      const attachment = await prisma.attachment.findUnique({ where: { id: res.body.data.attachmentId } });
      expect(attachment?.entityName).toBe('FiscalDocument');
      expect(attachment?.entityId).toBe(res.body.data.id);
    });

    it('aceita JPG/JPEG/PNG', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('UploadImages');
      for (const [buffer, filename] of [
        [VALID_JPEG, 'foto.jpg'],
        [VALID_PNG, 'foto.png'],
      ] as const) {
        await request(app.getHttpServer())
          .post('/api/v1/fiscal/documents/upload')
          .set('Authorization', adminAuth)
          .field('documentType', 'OTHER')
          .attach('file', buffer, filename)
          .expect(201);
      }
    });

    it('rejeita arquivo com assinatura binaria invalida (executavel renomeado) e nao deixa Attachment orfao', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('UploadInvalidSig');
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OTHER')
        .attach('file', FAKE_EXECUTABLE, 'malicioso.png')
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OTHER')
        .attach('file', INVALID_PDF, 'falso.pdf')
        .expect(400);

      const count = await prisma.fiscalDocument.count({ where: { tenantId } });
      expect(count).toBe(0);
    });

    it('rejeita extensao nao suportada e vinculo com registros inexistentes', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('UploadValidation');
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OTHER')
        .attach('file', Buffer.from('conteudo qualquer'), 'planilha.csv')
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OTHER')
        .field('tripId', randomUUID())
        .attach('file', VALID_PDF, 'doc.pdf')
        .expect(404);
    });
  });

  // ==========================================================================
  // Importacao de XML
  // ==========================================================================
  describe('importacao XML', () => {
    it('importa NF-e/CT-e/MDF-e extraindo os campos automaticamente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ImportTypes');

      const nfeKey = randomAccessKey();
      const nfeRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/import')
        .set('Authorization', adminAuth)
        .attach('file', Buffer.from(buildNfeXml(nfeKey, '1234')), 'nota.xml')
        .expect(201);
      expect(nfeRes.body.data.documentType).toBe('NFE');
      expect(nfeRes.body.data.accessKey).toBe(nfeKey);
      expect(nfeRes.body.data.documentNumber).toBe('1234');
      expect(nfeRes.body.data.senderName).toBe('Emitente Teste LTDA');
      expect(nfeRes.body.data.recipientName).toBe('Destinatario Teste LTDA');
      expect(nfeRes.body.data.status).toBe('VALID');
      expect(nfeRes.body.data.source).toBe('XML_IMPORT');
      expect(nfeRes.body.data.metadata).toMatchObject({ amount: 1500 });

      const cteKey = randomAccessKey();
      const cteRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/import')
        .set('Authorization', adminAuth)
        .attach('file', Buffer.from(buildCteXml(cteKey, '5678')), 'cte.xml')
        .expect(201);
      expect(cteRes.body.data.documentType).toBe('CTE');
      expect(cteRes.body.data.metadata).toMatchObject({ amount: 850.5 });

      const mdfeKey = randomAccessKey();
      const mdfeRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/import')
        .set('Authorization', adminAuth)
        .attach('file', Buffer.from(buildMdfeXml(mdfeKey, '9101')), 'mdfe.xml')
        .expect(201);
      expect(mdfeRes.body.data.documentType).toBe('MDFE');
      expect(mdfeRes.body.data.recipientName).toBeNull();
    });

    it('vincula a viagem/veiculo/motorista/cliente informados na importacao', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ImportLink');
      const { tripId, vehicleId } = await setupTripAndVehicle(adminAuth);
      const customerId = await createCustomer(adminAuth);

      const res = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/import')
        .set('Authorization', adminAuth)
        .field('tripId', tripId)
        .field('vehicleId', vehicleId)
        .field('customerId', customerId)
        .attach('file', Buffer.from(buildNfeXml(randomAccessKey(), '1')), 'nota.xml')
        .expect(201);

      expect(res.body.data.tripId).toBe(tripId);
      expect(res.body.data.vehicleId).toBe(vehicleId);
      expect(res.body.data.customerId).toBe(customerId);
      expect(res.body.data.tripLabel).toBeTruthy();
    });

    it('rejeita extensao != .xml e XML nao reconhecido (nunca inventa o tipo)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ImportRejects');
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/import')
        .set('Authorization', adminAuth)
        .attach('file', Buffer.from(buildNfeXml(randomAccessKey(), '1')), 'nota.pdf')
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/import')
        .set('Authorization', adminAuth)
        .attach('file', Buffer.from('<comprovante><foo>bar</foo></comprovante>'), 'desconhecido.xml')
        .expect(400);
    });
  });

  // ==========================================================================
  // Duplicidade e idempotencia
  // ==========================================================================
  describe('duplicidade e idempotencia', () => {
    it('upload rejeita (409) uma segunda vez com a mesma accessKey', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('DupUpload');
      const accessKey = randomAccessKey();
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'NFE')
        .field('accessKey', accessKey)
        .attach('file', VALID_PDF, 'nota1.pdf')
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'NFE')
        .field('accessKey', accessKey)
        .attach('file', VALID_PDF, 'nota2.pdf')
        .expect(409);

      expect(await prisma.fiscalDocument.count({ where: { tenantId } })).toBe(1);
    });

    it('reimportar o mesmo XML (mesma accessKey) e idempotente -- nunca duplica', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('DupImport');
      const xml = Buffer.from(buildNfeXml(randomAccessKey(), '999'));

      const first = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/import')
        .set('Authorization', adminAuth)
        .attach('file', xml, 'nota.xml')
        .expect(201);

      const second = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/import')
        .set('Authorization', adminAuth)
        .attach('file', xml, 'nota-retry.xml')
        .expect(201);

      expect(second.body.data.id).toBe(first.body.data.id);
      expect(await prisma.fiscalDocument.count({ where: { tenantId } })).toBe(1);
    });

    it('documentos sem chave: fallback de duplicidade usa tipo+numero+serie+data; sem numero nunca deduplica', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('NoKeyDup');

      // Mesma combinacao tipo+numero+serie+data, sem accessKey -- 2a rejeitada.
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'CIOT')
        .field('documentNumber', 'C-1')
        .field('series', '1')
        .field('issueDate', '2026-08-01')
        .attach('file', VALID_PDF, 'ciot1.pdf')
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'CIOT')
        .field('documentNumber', 'C-1')
        .field('series', '1')
        .field('issueDate', '2026-08-01')
        .attach('file', VALID_PDF, 'ciot1-dup.pdf')
        .expect(409);

      // Sem accessKey E sem documentNumber -- nunca deduplicado (heuristica
      // fragil demais), sempre cria um novo registro.
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OTHER')
        .attach('file', VALID_PDF, 'sem-numero-1.pdf')
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OTHER')
        .attach('file', VALID_PDF, 'sem-numero-2.pdf')
        .expect(201);

      expect(await prisma.fiscalDocument.count({ where: { tenantId } })).toBe(3); // 1 CIOT + 2 OTHER sem numero
    });
  });

  // ==========================================================================
  // Listagem e filtros
  // ==========================================================================
  describe('listagem e filtros', () => {
    it('lista paginado e filtra por tipo/status/numero/chave/veiculo/motorista/periodo', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ListFilters');
      const { vehicleId, driverId } = await setupTripAndVehicle(adminAuth);

      const nfeKey = randomAccessKey();
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'NFE')
        .field('documentNumber', 'NF-1')
        .field('accessKey', nfeKey)
        .field('issueDate', '2026-01-10')
        .field('vehicleId', vehicleId)
        .field('driverId', driverId)
        .attach('file', VALID_PDF, 'nf1.pdf')
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'CIOT')
        .field('documentNumber', 'C-2')
        .field('issueDate', '2026-06-10')
        .attach('file', VALID_PDF, 'ciot2.pdf')
        .expect(201);

      const all = await request(app.getHttpServer())
        .get('/api/v1/fiscal/documents')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(all.body.data.items).toHaveLength(2);
      expect(all.body.data.meta.total).toBe(2);

      const byType = await request(app.getHttpServer())
        .get('/api/v1/fiscal/documents?documentType=CIOT')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byType.body.data.items).toHaveLength(1);
      expect(byType.body.data.items[0].documentNumber).toBe('C-2');

      const byNumber = await request(app.getHttpServer())
        .get('/api/v1/fiscal/documents?documentNumber=NF-1')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byNumber.body.data.items).toHaveLength(1);

      const byKey = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents?accessKey=${nfeKey}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byKey.body.data.items).toHaveLength(1);

      const byVehicle = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents?vehicleId=${vehicleId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byVehicle.body.data.items).toHaveLength(1);

      const byDriver = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents?driverId=${driverId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byDriver.body.data.items).toHaveLength(1);

      const byPeriod = await request(app.getHttpServer())
        .get('/api/v1/fiscal/documents?issueDateFrom=2026-01-01&issueDateTo=2026-02-01')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byPeriod.body.data.items).toHaveLength(1);
      expect(byPeriod.body.data.items[0].documentNumber).toBe('NF-1');

      const unlinked = await request(app.getHttpServer())
        .get('/api/v1/fiscal/documents?unlinkedOnly=true')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(unlinked.body.data.items).toHaveLength(1);
      expect(unlinked.body.data.items[0].documentNumber).toBe('C-2');
    });
  });

  // ==========================================================================
  // Vinculo com viagem (link/unlink via PATCH, e a secao da tela de viagem)
  // ==========================================================================
  describe('vinculo com viagem', () => {
    it('permite vincular/desvincular depois da criacao via PATCH', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('LinkPatch');
      const { tripId } = await setupTripAndVehicle(adminAuth);

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OTHER')
        .attach('file', VALID_PDF, 'doc.pdf')
        .expect(201);
      const id = uploadRes.body.data.id;
      expect(uploadRes.body.data.tripId).toBeNull();

      const linkRes = await request(app.getHttpServer())
        .patch(`/api/v1/fiscal/documents/${id}`)
        .set('Authorization', adminAuth)
        .send({ tripId })
        .expect(200);
      expect(linkRes.body.data.tripId).toBe(tripId);

      const byTrip = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents?tripId=${tripId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byTrip.body.data.items).toHaveLength(1);

      const unlinkRes = await request(app.getHttpServer())
        .patch(`/api/v1/fiscal/documents/${id}`)
        .set('Authorization', adminAuth)
        .send({ tripId: null })
        .expect(200);
      expect(unlinkRes.body.data.tripId).toBeNull();

      const auditLogs = await prisma.auditLog.findMany({ where: { entityName: 'FiscalDocument', entityId: id } });
      expect(auditLogs.map((l) => l.action)).toEqual(
        expect.arrayContaining(['fiscal.document_uploaded', 'fiscal.document_linked']),
      );
    });

    it('historico de auditoria (GET .../history) reflete upload/atualizacao/vinculo', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('History');
      const { tripId } = await setupTripAndVehicle(adminAuth);

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OTHER')
        .attach('file', VALID_PDF, 'doc.pdf')
        .expect(201);
      const id = uploadRes.body.data.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/fiscal/documents/${id}`)
        .set('Authorization', adminAuth)
        .send({ tripId })
        .expect(200);

      const historyRes = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/${id}/history`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(historyRes.body.data.items.map((i: { action: string }) => i.action)).toEqual(
        expect.arrayContaining(['fiscal.document_uploaded', 'fiscal.document_linked']),
      );
      expect(historyRes.body.data.meta.total).toBeGreaterThanOrEqual(2);
    });
  });

  // ==========================================================================
  // Status documental da viagem (Fase 53, secao 2)
  // ==========================================================================
  describe('status documental da viagem', () => {
    it('agrega existentes/pendentes/invalidos/cancelados e tipos presentes/ausentes', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('DocStatus');
      const { tripId } = await setupTripAndVehicle(adminAuth);

      // 1 PENDING (upload sem alterar status).
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'CIOT')
        .field('tripId', tripId)
        .attach('file', VALID_PDF, 'pending.pdf')
        .expect(201);

      // 1 INVALID (upload + PATCH status).
      const invalidRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'DELIVERY_PROOF')
        .field('tripId', tripId)
        .attach('file', VALID_PDF, 'invalid.pdf')
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/fiscal/documents/${invalidRes.body.data.id}`)
        .set('Authorization', adminAuth)
        .send({ status: 'INVALID' })
        .expect(200);

      // 1 CANCELLED (upload + PATCH status).
      const cancelledRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OTHER')
        .field('tripId', tripId)
        .attach('file', VALID_PDF, 'cancelled.pdf')
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/fiscal/documents/${cancelledRes.body.data.id}`)
        .set('Authorization', adminAuth)
        .send({ status: 'CANCELLED' })
        .expect(200);

      // 1 VALID (importacao de XML, ja vinculado).
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/import')
        .set('Authorization', adminAuth)
        .field('tripId', tripId)
        .attach('file', Buffer.from(buildNfeXml(randomAccessKey(), '1')), 'nota.xml')
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/trip/${tripId}/status`)
        .set('Authorization', adminAuth)
        .expect(200);

      expect(res.body.data.tripId).toBe(tripId);
      expect(res.body.data.totalDocuments).toBe(4);
      expect(res.body.data.pendingCount).toBe(1);
      expect(res.body.data.validCount).toBe(1);
      expect(res.body.data.invalidCount).toBe(1);
      expect(res.body.data.cancelledCount).toBe(1);
      expect(res.body.data.presentTypes.sort()).toEqual(['CIOT', 'DELIVERY_PROOF', 'NFE', 'OTHER'].sort());
      expect(res.body.data.absentTypes).toEqual(
        expect.arrayContaining(['CTE', 'MDFE', 'DACTE', 'DAMDFE']),
      );
      expect(res.body.data.absentTypes).not.toEqual(expect.arrayContaining(['CIOT', 'NFE']));
    });

    it('viagem sem nenhum documento retorna tudo zerado e absentTypes = catalogo inteiro', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('DocStatusEmpty');
      const { tripId } = await setupTripAndVehicle(adminAuth);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/trip/${tripId}/status`)
        .set('Authorization', adminAuth)
        .expect(200);

      expect(res.body.data.totalDocuments).toBe(0);
      expect(res.body.data.presentTypes).toEqual([]);
      expect(res.body.data.absentTypes).toHaveLength(8);
    });
  });

  // ==========================================================================
  // Dashboard -- filtros e novos indicadores (Fase 53, secao 3)
  // ==========================================================================
  describe('dashboard -- filtros e novos indicadores', () => {
    it('linkedCount/unlinkedCount somam o total; byType ordenado; problematicDocuments so PENDING/INVALID', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('DashboardExtras');
      const { tripId } = await setupTripAndVehicle(adminAuth);

      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'CIOT')
        .field('tripId', tripId)
        .attach('file', VALID_PDF, 'linked.pdf')
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'CIOT')
        .attach('file', VALID_PDF, 'unlinked1.pdf')
        .expect(201);
      const invalidRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OTHER')
        .attach('file', VALID_PDF, 'unlinked2.pdf')
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/fiscal/documents/${invalidRes.body.data.id}`)
        .set('Authorization', adminAuth)
        .send({ status: 'INVALID' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/fiscal/documents/dashboard')
        .set('Authorization', adminAuth)
        .expect(200);

      expect(res.body.data.totalDocuments).toBe(3);
      expect(res.body.data.linkedCount).toBe(1);
      expect(res.body.data.unlinkedCount).toBe(2);
      expect(res.body.data.linkedCount + res.body.data.unlinkedCount).toBe(res.body.data.totalDocuments);
      expect(res.body.data.byType[0].count).toBeGreaterThanOrEqual(res.body.data.byType[res.body.data.byType.length - 1].count);
      expect(res.body.data.problematicDocuments).toHaveLength(3); // 2 PENDING (linked + unlinked1) + 1 INVALID (unlinked2)
      expect(res.body.data.problematicDocuments.every((d: { status: string }) => d.status === 'PENDING' || d.status === 'INVALID')).toBe(true);

      // Filtro documentType=CIOT restringe TODOS os indicadores ao mesmo escopo.
      const filtered = await request(app.getHttpServer())
        .get('/api/v1/fiscal/documents/dashboard?documentType=CIOT')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(filtered.body.data.totalDocuments).toBe(2);
      expect(filtered.body.data.linkedCount).toBe(1);
      expect(filtered.body.data.unlinkedCount).toBe(1);

      // Filtro tripId restringe ao mesmo escopo da listagem (so o documento vinculado).
      const byTrip = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/dashboard?tripId=${tripId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byTrip.body.data.totalDocuments).toBe(1);
      expect(byTrip.body.data.linkedCount).toBe(1);
      expect(byTrip.body.data.unlinkedCount).toBe(0);
    });
  });

  // ==========================================================================
  // Isolamento multi-tenant
  // ==========================================================================
  describe('isolamento multi-tenant', () => {
    it('documentos de um tenant nunca aparecem/sao acessiveis para outro tenant', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsoA');
      const tenantB = await createTenantAndLoginAsAdmin('IsoB');

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', tenantA.adminAuth)
        .field('documentType', 'OTHER')
        .attach('file', VALID_PDF, 'doc.pdf')
        .expect(201);
      const id = uploadRes.body.data.id;

      const listB = await request(app.getHttpServer())
        .get('/api/v1/fiscal/documents')
        .set('Authorization', tenantB.adminAuth)
        .expect(200);
      expect(listB.body.data.items).toEqual([]);

      await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/${id}`)
        .set('Authorization', tenantB.adminAuth)
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/api/v1/fiscal/documents/${id}`)
        .set('Authorization', tenantB.adminAuth)
        .send({ status: 'INVALID' })
        .expect(404);
      await request(app.getHttpServer())
        .delete(`/api/v1/fiscal/documents/${id}`)
        .set('Authorization', tenantB.adminAuth)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/${id}/history`)
        .set('Authorization', tenantB.adminAuth)
        .expect(404);

      const dashboardB = await request(app.getHttpServer())
        .get('/api/v1/fiscal/documents/dashboard')
        .set('Authorization', tenantB.adminAuth)
        .expect(200);
      expect(dashboardB.body.data.totalDocuments).toBe(0);
    });

    it('status documental e historico de uma viagem de outro tenant retornam 404 (nunca vazam)', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IsoTripA');
      const tenantB = await createTenantAndLoginAsAdmin('IsoTripB');
      const { tripId } = await setupTripAndVehicle(tenantA.adminAuth);

      await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/trip/${tripId}/status`)
        .set('Authorization', tenantB.adminAuth)
        .expect(404);
    });

    it('documento inexistente (uuid aleatorio) retorna 404 em todas as rotas de leitura/escrita', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('NotFound');
      const randomId = randomUUID();

      await request(app.getHttpServer()).get(`/api/v1/fiscal/documents/${randomId}`).set('Authorization', adminAuth).expect(404);
      await request(app.getHttpServer()).get(`/api/v1/fiscal/documents/${randomId}/history`).set('Authorization', adminAuth).expect(404);
      await request(app.getHttpServer())
        .patch(`/api/v1/fiscal/documents/${randomId}`)
        .set('Authorization', adminAuth)
        .send({ status: 'VALID' })
        .expect(404);
      await request(app.getHttpServer()).delete(`/api/v1/fiscal/documents/${randomId}`).set('Authorization', adminAuth).expect(404);
      await request(app.getHttpServer()).get(`/api/v1/fiscal/documents/trip/${randomId}/status`).set('Authorization', adminAuth).expect(404);
    });
  });

  // ==========================================================================
  // RBAC
  // ==========================================================================
  describe('RBAC', () => {
    it('bloqueia DRIVER em tudo; AUDITOR le mas nao escreve; SUPER_ADMIN tem acesso total', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('Rbac');
      const { tripId } = await setupTripAndVehicle(adminAuth);

      await request(app.getHttpServer()).get('/api/v1/fiscal/documents').set('Authorization', adminAuth).expect(200);
      await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/trip/${tripId}/status`)
        .set('Authorization', adminAuth)
        .expect(200);

      const driverAuth = await createUserWithRole(tenantId, adminAuth, 'DRIVER');
      await request(app.getHttpServer()).get('/api/v1/fiscal/documents').set('Authorization', driverAuth).expect(403);
      await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/trip/${tripId}/status`)
        .set('Authorization', driverAuth)
        .expect(403);
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', driverAuth)
        .field('documentType', 'OTHER')
        .attach('file', VALID_PDF, 'doc.pdf')
        .expect(403);

      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');
      await request(app.getHttpServer()).get('/api/v1/fiscal/documents').set('Authorization', auditorAuth).expect(200);
      await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/trip/${tripId}/status`)
        .set('Authorization', auditorAuth)
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', auditorAuth)
        .field('documentType', 'OTHER')
        .attach('file', VALID_PDF, 'doc.pdf')
        .expect(403);
    });
  });

  // ==========================================================================
  // Limite de upload (app isolado com limite configurado bem baixo)
  // ==========================================================================
  describe('limite de upload', () => {
    let limitedApp: INestApplication;
    const originalMaxFileSizeMb = process.env.FISCAL_DOCUMENTS_MAX_FILE_SIZE_MB;

    beforeAll(async () => {
      process.env.FISCAL_DOCUMENTS_MAX_FILE_SIZE_MB = '0.001'; // ~1KB
      const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
      limitedApp = moduleRef.createNestApplication();
      limitedApp.setGlobalPrefix('api');
      limitedApp.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
      limitedApp.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
      await limitedApp.init();
    });

    afterAll(async () => {
      await limitedApp.close();
      if (originalMaxFileSizeMb === undefined) delete process.env.FISCAL_DOCUMENTS_MAX_FILE_SIZE_MB;
      else process.env.FISCAL_DOCUMENTS_MAX_FILE_SIZE_MB = originalMaxFileSizeMb;
    });

    async function createTenantAndLoginOnLimitedApp(label: string) {
      const unique = randomUUID().replace(/-/g, '').slice(0, 12);
      const payload = {
        name: `Transportadora ${label} ${unique}`,
        document: randomCnpj(),
        slug: `fiscal-limit-${label.toLowerCase()}-${unique}`,
        admin: { name: `Admin ${label}`, email: `admin-${label.toLowerCase()}-${unique}@teste.com`, password: 'SenhaForte123!' },
      };
      const createRes = await request(limitedApp.getHttpServer()).post('/api/v1/tenants').send(payload).expect(201);
      const tenantId: string = createRes.body.data.id;
      createdTenantIds.push(tenantId);
      const loginRes = await request(limitedApp.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId, email: payload.admin.email, password: payload.admin.password })
        .expect(200);
      return `Bearer ${loginRes.body.data.accessToken as string}`;
    }

    it('rejeita arquivo maior que o limite configurado (erro do cliente bem formado, nunca 500)', async () => {
      const auth = await createTenantAndLoginOnLimitedApp('Limit');

      const oversized = Buffer.concat([VALID_PDF, Buffer.alloc(4096, 0x20)]); // > 1KB
      const res = await request(limitedApp.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', auth)
        .field('documentType', 'OTHER')
        .attach('file', oversized, 'grande.pdf')
        .expect(413); // PayloadTooLargeException -- multer rejeita antes mesmo do fileFilter/service rodarem.
      expect(res.body.success).toBe(false);
    });
  });

  // ==========================================================================
  // Verificacao real de ausencia de N+1
  // ==========================================================================
  describe('verificacao de ausencia de N+1 (contagem real de queries)', () => {
    let countingApp: INestApplication;
    let basePrisma: PrismaService;
    let queryCount = 0;

    beforeAll(async () => {
      basePrisma = new PrismaService();
      await basePrisma.$connect();
      const extendedPrisma = basePrisma.$extends({
        name: 'query-counter',
        query: { $allModels: { async $allOperations({ args, query }) { queryCount += 1; return query(args); } } },
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
        slug: `fiscal-n1-${label.toLowerCase()}-${unique}`,
        admin: { name: `Admin ${label}`, email: `admin-${label.toLowerCase()}-${unique}@teste.com`, password: 'SenhaForte123!' },
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

    async function seedFiscalDocument(adminAuth: string, index: number, tripId?: string) {
      const req = request(countingApp.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OTHER')
        .field('documentNumber', `SEED-${index}-${randomUUID()}`);
      if (tripId) req.field('tripId', tripId);
      await req.attach('file', VALID_PDF, `doc-${index}.pdf`).expect(201);
    }

    async function setupTripOnCountingApp(adminAuth: string) {
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
          plannedDeparture: '2026-01-01T08:00:00.000Z',
          plannedArrival: '2026-01-02T18:00:00.000Z',
        })
        .expect(201);
      return tripRes.body.data.id as string;
    }

    it('a contagem de queries de GET /fiscal/documents e GET .../dashboard nao cresce entre 10 e 50 documentos', async () => {
      const { adminAuth } = await createTenantAndLoginOnCountingApp('N1Check');

      for (let i = 0; i < 10; i += 1) await seedFiscalDocument(adminAuth, i);
      queryCount = 0;
      await request(countingApp.getHttpServer()).get('/api/v1/fiscal/documents').set('Authorization', adminAuth).expect(200);
      const listQueriesFor10 = queryCount;
      queryCount = 0;
      await request(countingApp.getHttpServer()).get('/api/v1/fiscal/documents/dashboard').set('Authorization', adminAuth).expect(200);
      const dashboardQueriesFor10 = queryCount;

      for (let i = 10; i < 50; i += 1) await seedFiscalDocument(adminAuth, i);
      queryCount = 0;
      await request(countingApp.getHttpServer()).get('/api/v1/fiscal/documents').set('Authorization', adminAuth).expect(200);
      const listQueriesFor50 = queryCount;
      queryCount = 0;
      await request(countingApp.getHttpServer()).get('/api/v1/fiscal/documents/dashboard').set('Authorization', adminAuth).expect(200);
      const dashboardQueriesFor50 = queryCount;

      expect(listQueriesFor50).toBeLessThanOrEqual(listQueriesFor10 + 1);
      expect(dashboardQueriesFor50).toBeLessThanOrEqual(dashboardQueriesFor10 + 1);
    }, 180000);

    it('a contagem de queries de GET /fiscal/documents/trip/:tripId/status nao cresce entre 10 e 50 documentos da mesma viagem', async () => {
      const { adminAuth } = await createTenantAndLoginOnCountingApp('N1Trip');
      const tripId = await setupTripOnCountingApp(adminAuth);

      for (let i = 0; i < 10; i += 1) await seedFiscalDocument(adminAuth, i, tripId);
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get(`/api/v1/fiscal/documents/trip/${tripId}/status`)
        .set('Authorization', adminAuth)
        .expect(200);
      const queriesFor10 = queryCount;

      for (let i = 10; i < 50; i += 1) await seedFiscalDocument(adminAuth, i, tripId);
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get(`/api/v1/fiscal/documents/trip/${tripId}/status`)
        .set('Authorization', adminAuth)
        .expect(200);
      const queriesFor50 = queryCount;

      expect(queriesFor50).toBeLessThanOrEqual(queriesFor10 + 1);
    }, 180000);
  });
});
