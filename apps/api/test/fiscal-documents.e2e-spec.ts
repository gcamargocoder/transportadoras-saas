import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { computeAccessKeyCheckDigit } from '../src/fiscal/utils/access-key.util';

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

// Fase 54 -- monta uma chave de acesso ESTRUTURALMENTE valida (DV mod-11
// correto, modelo do documento embutido nas posicoes 21-22) para testar o
// validador estrutural com um "documento bom" de verdade, nao so aleatorio.
function buildValidAccessKey(modelCode: '55' | '57' | '58'): string {
  const cUF = '35';
  const aamm = '2608';
  const cnpj = Array.from({ length: 14 }, () => Math.floor(Math.random() * 10)).join('');
  const serie = '001';
  const nNF = String(Math.floor(Math.random() * 999999999)).padStart(9, '0');
  const tpEmis = '1';
  const cNF = String(Math.floor(Math.random() * 99999999)).padStart(8, '0');
  const first43 = `${cUF}${aamm}${cnpj}${modelCode}${serie}${nNF}${tpEmis}${cNF}`;
  return `${first43}${computeAccessKeyCheckDigit(first43)}`;
}

function withInvalidCheckDigit(accessKey: string): string {
  const dv = Number(accessKey[43]);
  return `${accessKey.slice(0, 43)}${(dv + 1) % 10}`;
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

  async function createTrip(auth: string, driverId: string, compositionId: string, customerId?: string) {
    const originId = await createLocation(auth, `Origem ${randomUUID()}`);
    const destinationId = await createLocation(auth, `Destino ${randomUUID()}`);
    const res = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', auth)
      .send({
        driverId,
        compositionId,
        ...(customerId ? { customerId } : {}),
        originLocationId: originId,
        destinationLocationId: destinationId,
        plannedDeparture: '2026-01-01T08:00:00.000Z',
        plannedArrival: '2026-01-02T18:00:00.000Z',
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function setupTripAndVehicle(auth: string, customerId?: string) {
    const vehicleId = await createVehicle(auth);
    const driverId = await createDriver(auth);
    const compositionId = await createComposition(auth, vehicleId);
    const tripId = await createTrip(auth, driverId, compositionId, customerId);
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

  // Fase 100 -- vincula um usuario DRIVER a este motorista e faz login, para
  // testar o fluxo do Driver App (POST /driver/trips/:id/delivery-proof).
  async function loginAsDriver(tenantId: string, adminAuth: string, driverId: string) {
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

  // Fase 100 -- cria uma parada/entrega (TripDeliveryStop, Fase 88) para a
  // viagem e a leva ate COMPLETED (unico status que permite registrar POD
  // vinculado a ela). Reaproveita integralmente os endpoints ja existentes
  // de Fase 88/99 -- nenhuma logica de status duplicada aqui.
  async function createCompletedDeliveryStop(auth: string, tripId: string) {
    const locationId = await createLocation(auth, `Parada ${randomUUID()}`);
    const stopRes = await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/delivery-stops`)
      .set('Authorization', auth)
      .send({ locationId })
      .expect(201);
    const stopId = stopRes.body.data.id as string;
    await request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}/delivery-stops/${stopId}/status`)
      .set('Authorization', auth)
      .send({ status: 'COMPLETED' })
      .expect(200);
    return stopId;
  }

  // Fase 102 -- cria uma ocorrencia (TripOccurrence, Fase 67/101) para a
  // viagem, reaproveitando o endpoint administrativo ja existente -- nenhuma
  // logica de criacao duplicada aqui.
  async function createOccurrence(auth: string, tripId: string) {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/occurrences`)
      .set('Authorization', auth)
      .send({ type: 'CARGO_DAMAGE', severity: 'HIGH', description: 'Avaria identificada na carga', occurredAt: '2026-08-20T10:00:00.000Z' })
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

    it('rejeita XML malformado (tags desbalanceadas) com mensagem distinta de "tipo nao reconhecido"', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('ImportMalformed');
      const res = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/import')
        .set('Authorization', adminAuth)
        .attach('file', Buffer.from('<infNFe><ide><nNF>1</nNF></ide'), 'quebrado.xml')
        .expect(400);
      expect(res.body.message).toMatch(/malformado/i);
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
      // Fase 102 -- catalogo de FiscalDocumentType cresceu para 9 valores
      // (OCCURRENCE_EVIDENCE), entao "todo o catalogo ausente" agora e 9.
      expect(res.body.data.absentTypes).toHaveLength(9);
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
  // Fase 54 -- validacao estrutural e conformidade documental
  // ==========================================================================
  describe('Fase 54 -- validacao estrutural e conformidade documental', () => {
    it('documento consistente (upload com accessKey valida) nao tem validationIssues', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('IssuesNone');
      const accessKey = buildValidAccessKey('55');
      const res = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'NFE')
        .field('accessKey', accessKey)
        .attach('file', VALID_PDF, 'nota.pdf')
        .expect(201);
      expect(res.body.data.validationIssues).toEqual([]);
    });

    it('chave de acesso com digito verificador invalido -- INVALID_ACCESS_KEY (nunca bloqueado na escrita)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('IssuesKey');
      const badKey = withInvalidCheckDigit(buildValidAccessKey('55'));
      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'NFE')
        .field('accessKey', badKey)
        .attach('file', VALID_PDF, 'nota.pdf')
        .expect(201);
      expect(uploadRes.body.data.validationIssues).toEqual(['INVALID_ACCESS_KEY']);

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/${uploadRes.body.data.id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(getRes.body.data.validationIssues).toEqual(['INVALID_ACCESS_KEY']);
    });

    it('tipo incompativel com o modelo embutido na chave de acesso -- TYPE_MISMATCH', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('IssuesType');
      const cteKey = buildValidAccessKey('57'); // modelo 57 = CT-e
      const res = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'NFE') // mas informado como NF-e
        .field('accessKey', cteKey)
        .attach('file', VALID_PDF, 'nota.pdf')
        .expect(201);
      expect(res.body.data.validationIssues).toEqual(['TYPE_MISMATCH']);
    });

    it('importacao XML com campos essenciais ausentes -- ESSENTIAL_FIELDS_MISSING (so para source XML_IMPORT)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('IssuesMissing');
      const res = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/import')
        .set('Authorization', adminAuth)
        .attach('file', Buffer.from('<NFe><infNFe><ide><nNF>1</nNF></ide></infNFe></NFe>'), 'incompleto.xml')
        .expect(201);
      expect(res.body.data.validationIssues).toEqual(['ESSENTIAL_FIELDS_MISSING']);

      // Upload manual (source=UPLOAD) NUNCA e exigido a ter esses campos --
      // sem regra de negocio que force isso (evita falso positivo em CIOT/
      // comprovante manual legitimamente esparso).
      const manualRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'CIOT')
        .attach('file', VALID_PDF, 'ciot.pdf')
        .expect(201);
      expect(manualRes.body.data.validationIssues).toEqual([]);
    });

    it('data de emissao no futuro -- INCONSISTENT_DATE', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('IssuesDate');
      const futureYear = new Date().getUTCFullYear() + 5;
      const xml = buildNfeXml(randomAccessKey(), '1').replace('2026-08-01T10:00:00-03:00', `${futureYear}-01-01T10:00:00-03:00`);
      const res = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/import')
        .set('Authorization', adminAuth)
        .attach('file', Buffer.from(xml), 'futura.xml')
        .expect(201);
      expect(res.body.data.validationIssues).toContain('INCONSISTENT_DATE');
    });

    it('mesmo tipo+numero+serie em 2 documentos com chaves diferentes -- DUPLICATE_CANDIDATE em ambos', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('IssuesDup');
      const first = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'NFE')
        .field('documentNumber', 'DUP-1')
        .field('series', '1')
        .field('accessKey', buildValidAccessKey('55'))
        .attach('file', VALID_PDF, 'nota1.pdf')
        .expect(201);
      const second = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'NFE')
        .field('documentNumber', 'DUP-1')
        .field('series', '1')
        .field('accessKey', buildValidAccessKey('55'))
        .attach('file', VALID_PDF, 'nota2.pdf')
        .expect(201);

      const list = await request(app.getHttpServer())
        .get('/api/v1/fiscal/documents?documentNumber=DUP-1')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(list.body.data.items).toHaveLength(2);
      for (const item of list.body.data.items) {
        expect(item.validationIssues).toContain('DUPLICATE_CANDIDATE');
      }

      const detail = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/${first.body.data.id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(detail.body.data.validationIssues).toContain('DUPLICATE_CANDIDATE');
      expect(second.body.data.id).not.toBe(first.body.data.id); // nunca deduplicado -- so sinalizado
    });

    it('documento vinculado a viagem mas com veiculo diferente do da composicao -- INCONSISTENT_LINK', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('IssuesLink');
      const { tripId } = await setupTripAndVehicle(adminAuth); // veiculo real da viagem = V1
      const otherVehicleId = await createVehicle(adminAuth); // V2, sem relacao com a viagem

      const res = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OTHER')
        .field('tripId', tripId)
        .field('vehicleId', otherVehicleId)
        .attach('file', VALID_PDF, 'doc.pdf')
        .expect(201);
      expect(res.body.data.validationIssues).toContain('INCONSISTENT_LINK');
    });

    it('documento com vinculo operacional mas sem viagem -- NO_TRIP_CONTEXT; sem NENHUM vinculo nao e sinalizado', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('IssuesNoTrip');
      const vehicleId = await createVehicle(adminAuth);

      const withVehicle = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OTHER')
        .field('vehicleId', vehicleId)
        .attach('file', VALID_PDF, 'doc1.pdf')
        .expect(201);
      expect(withVehicle.body.data.validationIssues).toContain('NO_TRIP_CONTEXT');

      const withoutAnyLink = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OTHER')
        .attach('file', VALID_PDF, 'doc2.pdf')
        .expect(201);
      expect(withoutAnyLink.body.data.validationIssues).not.toContain('NO_TRIP_CONTEXT');
    });

    it('dashboard: cancelledCount, alerts agregados e problematicDocuments inclui VALID com inconsistencia', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('IssuesDashboard');
      const badKey = withInvalidCheckDigit(buildValidAccessKey('55'));
      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'NFE')
        .field('accessKey', badKey)
        .attach('file', VALID_PDF, 'nota.pdf')
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/fiscal/documents/${uploadRes.body.data.id}`)
        .set('Authorization', adminAuth)
        .send({ status: 'VALID' })
        .expect(200);

      const cancelledRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OTHER')
        .attach('file', VALID_PDF, 'cancel.pdf')
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/fiscal/documents/${cancelledRes.body.data.id}`)
        .set('Authorization', adminAuth)
        .send({ status: 'CANCELLED' })
        .expect(200);

      const dashboard = await request(app.getHttpServer())
        .get('/api/v1/fiscal/documents/dashboard')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(dashboard.body.data.cancelledCount).toBe(1);
      expect(dashboard.body.data.alerts).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'INVALID_ACCESS_KEY', count: 1 })]),
      );
      const flagged = dashboard.body.data.problematicDocuments.find((d: { id: string }) => d.id === uploadRes.body.data.id);
      expect(flagged).toBeTruthy();
      expect(flagged.status).toBe('VALID'); // problematico por inconsistencia estrutural, nao so por status
      expect(flagged.validationIssues).toContain('INVALID_ACCESS_KEY');
    });

    it('status documental da viagem: structurallyValidCount/problematicCount/completeness sempre indisponivel', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('IssuesTripStatus');
      const { tripId } = await setupTripAndVehicle(adminAuth);

      const okRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'NFE')
        .field('accessKey', buildValidAccessKey('55'))
        .field('tripId', tripId)
        .attach('file', VALID_PDF, 'ok.pdf')
        .expect(201);
      // Marca o "bom" como VALID -- so entra em structurallyValidCount quando
      // status=VALID E sem inconsistencia estrutural (upload sozinho deixa
      // PENDING, que ja conta como problematico pelo criterio herdado da
      // Fase 53).
      await request(app.getHttpServer())
        .patch(`/api/v1/fiscal/documents/${okRes.body.data.id}`)
        .set('Authorization', adminAuth)
        .send({ status: 'VALID' })
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'NFE')
        .field('accessKey', withInvalidCheckDigit(buildValidAccessKey('55')))
        .field('tripId', tripId)
        .attach('file', VALID_PDF, 'bad.pdf')
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/trip/${tripId}/status`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.problematicCount).toBe(1); // so o PENDING com INVALID_ACCESS_KEY
      expect(res.body.data.structurallyValidCount).toBe(1); // o VALID sem inconsistencia
      expect(res.body.data.problematicDocuments).toHaveLength(1);
      expect(res.body.data.problematicDocuments[0].validationIssues).toContain('INVALID_ACCESS_KEY');
      expect(res.body.data.completenessPercent).toBeNull();
      expect(res.body.data.completenessAvailable).toBe(false);
    });

    it('duplicidade nunca cruza tenants: mesmo tipo+numero+serie em tenants diferentes nao vira DUPLICATE_CANDIDATE', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('IssuesDupIsoA');
      const tenantB = await createTenantAndLoginAsAdmin('IssuesDupIsoB');

      const resA = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', tenantA.adminAuth)
        .field('documentType', 'NFE')
        .field('documentNumber', 'CROSS-1')
        .field('series', '1')
        .attach('file', VALID_PDF, 'a.pdf')
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', tenantB.adminAuth)
        .field('documentType', 'NFE')
        .field('documentNumber', 'CROSS-1')
        .field('series', '1')
        .attach('file', VALID_PDF, 'b.pdf')
        .expect(201);

      const getA = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/${resA.body.data.id}`)
        .set('Authorization', tenantA.adminAuth)
        .expect(200);
      expect(getA.body.data.validationIssues).not.toContain('DUPLICATE_CANDIDATE');
    });
  });

  // ==========================================================================
  // Fase 55 -- integracao fiscal <-> viagem
  // ==========================================================================
  describe('Fase 55 -- integracao fiscal <-> viagem', () => {
    function buildMdfeXmlWithManifest(accessKey: string, number: string, manifestedKeys: string[]): string {
      const infDoc = manifestedKeys.map((key) => `<infNFe><chNFe>${key}</chNFe></infNFe>`).join('');
      return `<?xml version="1.0" encoding="UTF-8"?>
<mdfeProc versao="3.00">
  <MDFe>
    <infMDFe Id="MDFe${accessKey}" versao="3.00">
      <ide><serie>1</serie><nMDF>${number}</nMDF><dhEmi>2026-08-03T07:00:00-03:00</dhEmi></ide>
      <emit><CNPJ>11222333000144</CNPJ><xNome>Transportadora Teste LTDA</xNome></emit>
      <infDoc>${infDoc}</infDoc>
    </infMDFe>
  </MDFe>
</mdfeProc>`;
    }

    it('viagem sem documentos: complianceStatus UNAVAILABLE, matriz toda zerada (nunca inventa problema)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CompUnavailable');
      const { tripId } = await setupTripAndVehicle(adminAuth);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/trip/${tripId}/status`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.complianceStatus).toBe('UNAVAILABLE');
      // Fase 102 -- catalogo de FiscalDocumentType cresceu para 9 valores (OCCURRENCE_EVIDENCE).
      expect(res.body.data.matrix).toHaveLength(9);
      expect(res.body.data.matrix.every((row: { totalCount: number; present: boolean }) => row.totalCount === 0 && row.present === false)).toBe(true);
    });

    it('viagem com documento estruturalmente valido (VALID, sem issues): complianceStatus OK', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CompOk');
      const { tripId } = await setupTripAndVehicle(adminAuth);

      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/import')
        .set('Authorization', adminAuth)
        // buildValidAccessKey (nao randomAccessKey) -- precisa de um DV
        // mod-11 valido, senao o proprio documento vira INVALID_ACCESS_KEY
        // e nunca fica "estruturalmente valido" (ver Fase 54).
        .field('tripId', tripId)
        .attach('file', Buffer.from(buildNfeXml(buildValidAccessKey('55'), '1')), 'nota.xml')
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/trip/${tripId}/status`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.complianceStatus).toBe('OK');
      const nfeRow = res.body.data.matrix.find((row: { documentType: string }) => row.documentType === 'NFE');
      expect(nfeRow.present).toBe(true);
      expect(nfeRow.totalCount).toBe(1);
      expect(nfeRow.structurallyValidCount).toBe(1);
    });

    it('viagem com documento PENDING (upload manual): complianceStatus ATTENTION', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CompAttention');
      const { tripId } = await setupTripAndVehicle(adminAuth);

      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'CIOT')
        .field('tripId', tripId)
        .attach('file', VALID_PDF, 'ciot.pdf')
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/trip/${tripId}/status`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.complianceStatus).toBe('ATTENTION');
    });

    it('viagem com documento INVALID: complianceStatus PROBLEMATIC', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CompProblematicInvalid');
      const { tripId } = await setupTripAndVehicle(adminAuth);

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OTHER')
        .field('tripId', tripId)
        .attach('file', VALID_PDF, 'doc.pdf')
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/fiscal/documents/${uploadRes.body.data.id}`)
        .set('Authorization', adminAuth)
        .send({ status: 'INVALID' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/trip/${tripId}/status`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.complianceStatus).toBe('PROBLEMATIC');
    });

    it('viagem com documento CANCELLED: complianceStatus PROBLEMATIC (documento cancelado com contexto operacional)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CompProblematicCancelled');
      const { tripId } = await setupTripAndVehicle(adminAuth);

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OTHER')
        .field('tripId', tripId)
        .attach('file', VALID_PDF, 'doc.pdf')
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/fiscal/documents/${uploadRes.body.data.id}`)
        .set('Authorization', adminAuth)
        .send({ status: 'CANCELLED' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/trip/${tripId}/status`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.complianceStatus).toBe('PROBLEMATIC');
    });

    it('divergencia de cliente entre documento e viagem gera INCONSISTENT_LINK e complianceStatus PROBLEMATIC', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CompCustomerDivergence');
      const tripCustomerId = await createCustomer(adminAuth);
      const otherCustomerId = await createCustomer(adminAuth);
      const { tripId } = await setupTripAndVehicle(adminAuth, tripCustomerId);

      const res = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OTHER')
        .field('tripId', tripId)
        .field('customerId', otherCustomerId)
        .attach('file', VALID_PDF, 'doc.pdf')
        .expect(201);
      expect(res.body.data.validationIssues).toContain('INCONSISTENT_LINK');

      const status = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/trip/${tripId}/status`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(status.body.data.complianceStatus).toBe('PROBLEMATIC');
    });

    it('candidatos nao vinculados: documento com o MESMO veiculo da viagem aparece em unlinkedCandidates; veiculo diferente nunca aparece', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CompCandidates');
      const { tripId, vehicleId } = await setupTripAndVehicle(adminAuth);
      const otherVehicleId = await createVehicle(adminAuth);

      const matchingRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'CIOT')
        .field('vehicleId', vehicleId)
        .attach('file', VALID_PDF, 'match.pdf')
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'CIOT')
        .field('vehicleId', otherVehicleId)
        .attach('file', VALID_PDF, 'nomatch.pdf')
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/trip/${tripId}/status`)
        .set('Authorization', adminAuth)
        .expect(200);
      const candidateIds = res.body.data.unlinkedCandidates.map((d: { id: string }) => d.id);
      expect(candidateIds).toContain(matchingRes.body.data.id);
      expect(candidateIds).toHaveLength(1);

      const ciotRow = res.body.data.matrix.find((row: { documentType: string }) => row.documentType === 'CIOT');
      expect(ciotRow.unlinkedRelatedCount).toBe(1);
    });

    it('candidatos nunca aparecem sem evidencia objetiva (viagem sem veiculo/motorista/cliente comparavel)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CompNoCandidates');
      const vehicleId = await createVehicle(adminAuth);
      const driverId = await createDriver(adminAuth);
      const compositionId = await createComposition(adminAuth, vehicleId);
      const tripId = await createTrip(adminAuth, driverId, compositionId);

      // Documento totalmente solto -- nenhum vinculo em comum com a viagem.
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OTHER')
        .attach('file', VALID_PDF, 'solto.pdf')
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/trip/${tripId}/status`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.unlinkedCandidates).toEqual([]);
    });

    it('relacionamento MDF-e -> CT-e via chaves manifestadas (chNFe/chCTe), nos dois sentidos', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CompManifest');
      const { tripId } = await setupTripAndVehicle(adminAuth);

      const cteKey = randomAccessKey();
      const cteRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/import')
        .set('Authorization', adminAuth)
        .field('tripId', tripId)
        .attach('file', Buffer.from(buildCteXml(cteKey, '1')), 'cte.xml')
        .expect(201);

      const mdfeKey = randomAccessKey();
      const mdfeRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/import')
        .set('Authorization', adminAuth)
        .field('tripId', tripId)
        .attach('file', Buffer.from(buildMdfeXmlWithManifest(mdfeKey, '1', [cteKey])), 'mdfe.xml')
        .expect(201);

      const mdfeDetail = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/${mdfeRes.body.data.id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(mdfeDetail.body.data.relatedDocumentsAvailable).toBe(true);
      expect(mdfeDetail.body.data.relatedDocuments.map((d: { id: string }) => d.id)).toContain(cteRes.body.data.id);

      const cteDetail = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/${cteRes.body.data.id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(cteDetail.body.data.relatedDocumentsAvailable).toBe(true);
      expect(cteDetail.body.data.relatedDocuments.map((d: { id: string }) => d.id)).toContain(mdfeRes.body.data.id);
    });

    it('relacionamento indisponivel quando faltam dados (MDF-e sem manifesto; NF-e/CT-e sem viagem)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CompManifestUnavailable');

      const mdfeRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/import')
        .set('Authorization', adminAuth)
        .attach('file', Buffer.from(buildMdfeXml(randomAccessKey(), '1')), 'mdfe-sem-manifesto.xml')
        .expect(201);
      const mdfeDetail = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/${mdfeRes.body.data.id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(mdfeDetail.body.data.relatedDocumentsAvailable).toBe(false);
      expect(mdfeDetail.body.data.relatedDocuments).toEqual([]);

      const cteRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/import')
        .set('Authorization', adminAuth)
        .attach('file', Buffer.from(buildCteXml(randomAccessKey(), '1')), 'cte-sem-viagem.xml')
        .expect(201);
      const cteDetail = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/${cteRes.body.data.id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(cteDetail.body.data.relatedDocumentsAvailable).toBe(false);
    });

    it('dashboard: tripsWithDocumentsOk/Problematic e operationalDivergenceCount refletem as viagens do escopo', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('CompDashboard');

      const { tripId: okTripId } = await setupTripAndVehicle(adminAuth);
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/import')
        .set('Authorization', adminAuth)
        .field('tripId', okTripId)
        .attach('file', Buffer.from(buildNfeXml(randomAccessKey(), '1')), 'ok.xml')
        .expect(201);

      const { tripId: problemTripId, vehicleId } = await setupTripAndVehicle(adminAuth);
      const otherVehicleId = await createVehicle(adminAuth);
      const divergentRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OTHER')
        .field('tripId', problemTripId)
        .field('vehicleId', otherVehicleId)
        .attach('file', VALID_PDF, 'divergente.pdf')
        .expect(201);
      expect(divergentRes.body.data.validationIssues).toContain('INCONSISTENT_LINK');
      void vehicleId;

      const dashboard = await request(app.getHttpServer())
        .get('/api/v1/fiscal/documents/dashboard')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(dashboard.body.data.tripsWithDocumentsOk).toBeGreaterThanOrEqual(1);
      expect(dashboard.body.data.tripsWithDocumentsProblematic).toBeGreaterThanOrEqual(1);
      expect(dashboard.body.data.operationalDivergenceCount).toBeGreaterThanOrEqual(1);
      expect(dashboard.body.data.problemsMonthlyEvolution).toBeInstanceOf(Array);
    });
  });

  // ==========================================================================
  // Fase 56 -- comprovante de entrega (integracao com matriz/dashboard/origin)
  // ==========================================================================
  describe('Fase 56 -- comprovante de entrega', () => {
    it('upload manual (admin) de DELIVERY_PROOF tem origin=ADMIN; matriz e deliveryProofStatus refletem o documento', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('DeliveryProofAdmin');
      const { tripId } = await setupTripAndVehicle(adminAuth);

      const before = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/trip/${tripId}/status`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(before.body.data.deliveryProofStatus).toBe('MISSING');
      const emptyRow = before.body.data.matrix.find((row: { documentType: string }) => row.documentType === 'DELIVERY_PROOF');
      expect(emptyRow.totalCount).toBe(0);

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'DELIVERY_PROOF')
        .field('tripId', tripId)
        .attach('file', VALID_PDF, 'comprovante.pdf')
        .expect(201);
      expect(uploadRes.body.data.origin).toBe('ADMIN');

      const afterUpload = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/trip/${tripId}/status`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(afterUpload.body.data.deliveryProofStatus).toBe('PENDING'); // upload manual comeca PENDING

      await request(app.getHttpServer())
        .patch(`/api/v1/fiscal/documents/${uploadRes.body.data.id}`)
        .set('Authorization', adminAuth)
        .send({ status: 'VALID' })
        .expect(200);

      const afterValid = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/trip/${tripId}/status`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(afterValid.body.data.deliveryProofStatus).toBe('AVAILABLE');
      const filledRow = afterValid.body.data.matrix.find((row: { documentType: string }) => row.documentType === 'DELIVERY_PROOF');
      expect(filledRow.totalCount).toBe(1);
      expect(filledRow.structurallyValidCount).toBe(1);
    });

    it('dashboard: tripsWithDeliveryProof/tripsWithoutDeliveryProof e cobertura refletem o escopo do filtro', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('DeliveryProofDashboard');

      const { tripId: tripWithProof } = await setupTripAndVehicle(adminAuth);
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'DELIVERY_PROOF')
        .field('tripId', tripWithProof)
        .attach('file', VALID_PDF, 'comprovante.pdf')
        .expect(201);

      const { tripId: tripWithoutProof } = await setupTripAndVehicle(adminAuth);
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'CIOT')
        .field('tripId', tripWithoutProof)
        .attach('file', VALID_PDF, 'ciot.pdf')
        .expect(201);

      const dashboard = await request(app.getHttpServer())
        .get('/api/v1/fiscal/documents/dashboard')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(dashboard.body.data.tripsWithDeliveryProof).toBeGreaterThanOrEqual(1);
      expect(dashboard.body.data.tripsWithoutDeliveryProof).toBeGreaterThanOrEqual(1);
      expect(dashboard.body.data.deliveryProofCoverageAvailable).toBe(true);
      expect(dashboard.body.data.deliveryProofCoveragePercent).not.toBeNull();
      expect(dashboard.body.data.deliveryProofMonthlyEvolution).toBeInstanceOf(Array);
    });
  });

  // ==========================================================================
  // Fase 100 -- POD vinculado diretamente a TripDeliveryStop
  // ==========================================================================
  describe('Fase 100 -- comprovante de entrega vinculado a TripDeliveryStop', () => {
    it('upload (admin) com tripDeliveryStopId de uma parada COMPLETED vincula corretamente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PodLinkOk');
      const { tripId } = await setupTripAndVehicle(adminAuth);
      const stopId = await createCompletedDeliveryStop(adminAuth, tripId);

      const res = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'DELIVERY_PROOF')
        .field('tripId', tripId)
        .field('tripDeliveryStopId', stopId)
        .attach('file', VALID_PDF, 'comprovante.pdf')
        .expect(201);
      expect(res.body.data.tripDeliveryStopId).toBe(stopId);
      expect(res.body.data.tripDeliveryStopSequence).toBe(1);
    });

    it('bloqueia (409) vincular POD a uma parada que ainda nao esta COMPLETED', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PodLinkNotCompleted');
      const { tripId } = await setupTripAndVehicle(adminAuth);
      const locationId = await createLocation(adminAuth, `Parada ${randomUUID()}`);
      const stopRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/delivery-stops`)
        .set('Authorization', adminAuth)
        .send({ locationId })
        .expect(201);
      const stopId = stopRes.body.data.id as string;

      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'DELIVERY_PROOF')
        .field('tripId', tripId)
        .field('tripDeliveryStopId', stopId)
        .attach('file', VALID_PDF, 'comprovante.pdf')
        .expect(409);

      expect(await prisma.fiscalDocument.count({ where: { tripDeliveryStopId: stopId } })).toBe(0);

      // Depois de concluida, o mesmo upload passa a funcionar.
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/delivery-stops/${stopId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'COMPLETED' })
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'DELIVERY_PROOF')
        .field('tripId', tripId)
        .field('tripDeliveryStopId', stopId)
        .attach('file', VALID_PDF, 'comprovante.pdf')
        .expect(201);
    });

    it('rejeita (400) quando tripDeliveryStopId pertence a outra viagem', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PodLinkWrongTrip');
      const { tripId: tripA } = await setupTripAndVehicle(adminAuth);
      const { tripId: tripB } = await setupTripAndVehicle(adminAuth);
      const stopOfTripB = await createCompletedDeliveryStop(adminAuth, tripB);

      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'DELIVERY_PROOF')
        .field('tripId', tripA)
        .field('tripDeliveryStopId', stopOfTripB)
        .attach('file', VALID_PDF, 'comprovante.pdf')
        .expect(400);
    });

    it('rejeita (404) tripDeliveryStopId inexistente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PodLinkMissing');
      const { tripId } = await setupTripAndVehicle(adminAuth);

      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'DELIVERY_PROOF')
        .field('tripId', tripId)
        .field('tripDeliveryStopId', randomUUID())
        .attach('file', VALID_PDF, 'comprovante.pdf')
        .expect(404);
    });

    it('permite multiplas evidencias (varios arquivos) para a MESMA parada', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PodMultiple');
      const { tripId } = await setupTripAndVehicle(adminAuth);
      const stopId = await createCompletedDeliveryStop(adminAuth, tripId);

      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'DELIVERY_PROOF')
        .field('tripId', tripId)
        .field('tripDeliveryStopId', stopId)
        .attach('file', VALID_PDF, 'foto1.pdf')
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'DELIVERY_PROOF')
        .field('tripId', tripId)
        .field('tripDeliveryStopId', stopId)
        .attach('file', VALID_JPEG, 'foto2.jpg')
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/fiscal/documents')
        .query({ tripDeliveryStopId: stopId })
        .set('Authorization', adminAuth)
        .expect(200);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.meta.total).toBe(2);
    });

    it('consulta "na entrega": GET /fiscal/documents?tripDeliveryStopId filtra so os comprovantes daquela parada', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PodQueryByStop');
      const { tripId } = await setupTripAndVehicle(adminAuth);
      const stopA = await createCompletedDeliveryStop(adminAuth, tripId);
      const stopB = await createCompletedDeliveryStop(adminAuth, tripId);

      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'DELIVERY_PROOF')
        .field('tripId', tripId)
        .field('tripDeliveryStopId', stopA)
        .attach('file', VALID_PDF, 'comprovante-a.pdf')
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'DELIVERY_PROOF')
        .field('tripId', tripId)
        .field('tripDeliveryStopId', stopB)
        .attach('file', VALID_PDF, 'comprovante-b.pdf')
        .expect(201);

      const resA = await request(app.getHttpServer())
        .get('/api/v1/fiscal/documents')
        .query({ tripDeliveryStopId: stopA })
        .set('Authorization', adminAuth)
        .expect(200);
      expect(resA.body.data.items).toHaveLength(1);
      expect(resA.body.data.items[0].tripDeliveryStopId).toBe(stopA);

      // "na viagem" continua funcionando -- ve as duas.
      const byTrip = await request(app.getHttpServer())
        .get('/api/v1/fiscal/documents')
        .query({ tripId })
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byTrip.body.data.items).toHaveLength(2);
    });

    it('PATCH permite vincular/desvincular a parada depois do upload; exige a mesma regra de COMPLETED', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PodPatchLink');
      const { tripId } = await setupTripAndVehicle(adminAuth);
      const stopId = await createCompletedDeliveryStop(adminAuth, tripId);

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'DELIVERY_PROOF')
        .field('tripId', tripId)
        .attach('file', VALID_PDF, 'comprovante.pdf')
        .expect(201);
      expect(uploadRes.body.data.tripDeliveryStopId).toBeNull();

      const linked = await request(app.getHttpServer())
        .patch(`/api/v1/fiscal/documents/${uploadRes.body.data.id}`)
        .set('Authorization', adminAuth)
        .send({ tripDeliveryStopId: stopId })
        .expect(200);
      expect(linked.body.data.tripDeliveryStopId).toBe(stopId);

      const unlinked = await request(app.getHttpServer())
        .patch(`/api/v1/fiscal/documents/${uploadRes.body.data.id}`)
        .set('Authorization', adminAuth)
        .send({ tripDeliveryStopId: null })
        .expect(200);
      expect(unlinked.body.data.tripDeliveryStopId).toBeNull();
    });

    it('preserva historico: DELETE de um comprovante de entrega e sempre bloqueado (409), vinculado ou nao a uma parada', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('PodNoDelete');
      const { tripId } = await setupTripAndVehicle(adminAuth);
      const stopId = await createCompletedDeliveryStop(adminAuth, tripId);

      const res = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'DELIVERY_PROOF')
        .field('tripId', tripId)
        .field('tripDeliveryStopId', stopId)
        .attach('file', VALID_PDF, 'comprovante.pdf')
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/v1/fiscal/documents/${res.body.data.id}`)
        .set('Authorization', adminAuth)
        .expect(409);

      expect(await prisma.fiscalDocument.findUnique({ where: { id: res.body.data.id } })).not.toBeNull();

      // Outros tipos de documento continuam removiveis normalmente (regressao).
      const ciotRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'CIOT')
        .attach('file', VALID_PDF, 'ciot.pdf')
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/api/v1/fiscal/documents/${ciotRes.body.data.id}`)
        .set('Authorization', adminAuth)
        .expect(204);
    });

    it('Driver App: POST /driver/trips/:id/delivery-proof com tripDeliveryStopId exige a parada COMPLETED', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('PodDriverStop');
      const { tripId, driverId } = await setupTripAndVehicle(adminAuth);
      const driverAuth = await loginAsDriver(tenantId, adminAuth, driverId);

      const locationId = await createLocation(adminAuth, `Parada ${randomUUID()}`);
      const stopRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/delivery-stops`)
        .set('Authorization', adminAuth)
        .send({ locationId })
        .expect(201);
      const stopId = stopRes.body.data.id as string;

      // Ainda PENDING -- bloqueado.
      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/delivery-proof`)
        .set('Authorization', driverAuth)
        .field('deviceEventId', 'dev-pod-stop-1')
        .field('tripDeliveryStopId', stopId)
        .attach('file', VALID_JPEG, 'comprovante.jpg')
        .expect(409);

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/delivery-stops/${stopId}/status`)
        .set('Authorization', adminAuth)
        .send({ status: 'COMPLETED' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/delivery-proof`)
        .set('Authorization', driverAuth)
        .field('deviceEventId', 'dev-pod-stop-2')
        .field('tripDeliveryStopId', stopId)
        .attach('file', VALID_JPEG, 'comprovante.jpg')
        .expect(201);
      expect(res.body.data.tripDeliveryStopId).toBe(stopId);
      expect(res.body.data.tripId).toBe(tripId);
      expect(res.body.data.origin).toBe('DRIVER');
    });

    it('Driver App: continua funcionando SEM tripDeliveryStopId (viagem sem paradas planejadas -- regressao Fase 56)', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('PodDriverNoStop');
      const { tripId, driverId } = await setupTripAndVehicle(adminAuth);
      const driverAuth = await loginAsDriver(tenantId, adminAuth, driverId);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/delivery-proof`)
        .set('Authorization', driverAuth)
        .field('deviceEventId', 'dev-pod-no-stop')
        .attach('file', VALID_JPEG, 'comprovante.jpg')
        .expect(201);
      expect(res.body.data.tripDeliveryStopId).toBeNull();
    });

    it('auditoria registra o vinculo com a parada na submissao pelo Driver App e no upload administrativo', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('PodAudit');
      void tenantId;
      const { tripId } = await setupTripAndVehicle(adminAuth);
      const stopId = await createCompletedDeliveryStop(adminAuth, tripId);

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'DELIVERY_PROOF')
        .field('tripId', tripId)
        .field('tripDeliveryStopId', stopId)
        .attach('file', VALID_PDF, 'comprovante.pdf')
        .expect(201);

      const historyRes = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/${uploadRes.body.data.id}/history`)
        .set('Authorization', adminAuth)
        .expect(200);
      const uploadEntry = historyRes.body.data.items.find((i: { action: string }) => i.action === 'fiscal.document_uploaded');
      expect(uploadEntry).toBeTruthy();
      expect(uploadEntry.newValue).toMatchObject({ tripDeliveryStopId: stopId });
    });

    it('isolamento multi-tenant: tenant B nunca consegue vincular POD a uma parada do tenant A, nem consulta-la via filtro', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('PodIsolA');
      const { tripId: tripA } = await setupTripAndVehicle(tenantA.adminAuth);
      const stopA = await createCompletedDeliveryStop(tenantA.adminAuth, tripA);

      const tenantB = await createTenantAndLoginAsAdmin('PodIsolB');
      const { tripId: tripB } = await setupTripAndVehicle(tenantB.adminAuth);

      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', tenantB.adminAuth)
        .field('documentType', 'DELIVERY_PROOF')
        .field('tripId', tripB)
        .field('tripDeliveryStopId', stopA)
        .attach('file', VALID_PDF, 'comprovante.pdf')
        .expect(404);

      const res = await request(app.getHttpServer())
        .get('/api/v1/fiscal/documents')
        .query({ tripDeliveryStopId: stopA })
        .set('Authorization', tenantB.adminAuth)
        .expect(200);
      expect(res.body.data.items).toHaveLength(0);
    });

    it('RBAC: AUDITOR consulta por tripDeliveryStopId mas nao pode enviar/remover comprovante', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('PodRbac');
      const { tripId } = await setupTripAndVehicle(adminAuth);
      const stopId = await createCompletedDeliveryStop(adminAuth, tripId);
      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');

      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', auditorAuth)
        .field('documentType', 'DELIVERY_PROOF')
        .field('tripId', tripId)
        .field('tripDeliveryStopId', stopId)
        .attach('file', VALID_PDF, 'comprovante.pdf')
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/fiscal/documents')
        .query({ tripDeliveryStopId: stopId })
        .set('Authorization', auditorAuth)
        .expect(200);
    });
  });

  // ==========================================================================
  // Fase 102 -- documentos/evidencias vinculados diretamente a TripOccurrence
  // ==========================================================================
  describe('Fase 102 -- documentos/anexos vinculados a TripOccurrence', () => {
    it('upload (admin) com tripOccurrenceId vincula corretamente, mesmo com a ocorrencia ainda OPEN', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('OccDocLinkOk');
      const { tripId } = await setupTripAndVehicle(adminAuth);
      const occurrenceId = await createOccurrence(adminAuth, tripId);

      const res = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OCCURRENCE_EVIDENCE')
        .field('tripId', tripId)
        .field('tripOccurrenceId', occurrenceId)
        .attach('file', VALID_PDF, 'evidencia.pdf')
        .expect(201);
      expect(res.body.data.tripOccurrenceId).toBe(occurrenceId);
      expect(res.body.data.tripOccurrenceType).toBe('CARGO_DAMAGE');
      expect(res.body.data.tripOccurrenceSeverity).toBe('HIGH');
    });

    it('nenhuma exigencia de status da ocorrencia -- funciona igual apos resolvida/cancelada', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('OccDocAnyStatus');
      const { tripId } = await setupTripAndVehicle(adminAuth);
      const occurrenceId = await createOccurrence(adminAuth, tripId);
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/occurrences/${occurrenceId}/resolve`)
        .set('Authorization', adminAuth)
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OCCURRENCE_EVIDENCE')
        .field('tripId', tripId)
        .field('tripOccurrenceId', occurrenceId)
        .attach('file', VALID_PDF, 'evidencia-pos-resolucao.pdf')
        .expect(201);
    });

    it('rejeita (400) quando tripOccurrenceId pertence a outra viagem', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('OccDocWrongTrip');
      const { tripId: tripA } = await setupTripAndVehicle(adminAuth);
      const { tripId: tripB } = await setupTripAndVehicle(adminAuth);
      const occurrenceOfTripB = await createOccurrence(adminAuth, tripB);

      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OCCURRENCE_EVIDENCE')
        .field('tripId', tripA)
        .field('tripOccurrenceId', occurrenceOfTripB)
        .attach('file', VALID_PDF, 'evidencia.pdf')
        .expect(400);
    });

    it('rejeita (404) tripOccurrenceId inexistente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('OccDocMissing');
      const { tripId } = await setupTripAndVehicle(adminAuth);

      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OCCURRENCE_EVIDENCE')
        .field('tripId', tripId)
        .field('tripOccurrenceId', randomUUID())
        .attach('file', VALID_PDF, 'evidencia.pdf')
        .expect(404);
    });

    it('permite multiplos documentos para a MESMA ocorrencia; "consulta na ocorrencia" filtra so os dela', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('OccDocMultiple');
      const { tripId } = await setupTripAndVehicle(adminAuth);
      const occurrenceA = await createOccurrence(adminAuth, tripId);
      const occurrenceB = await createOccurrence(adminAuth, tripId);

      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OCCURRENCE_EVIDENCE')
        .field('tripId', tripId)
        .field('tripOccurrenceId', occurrenceA)
        .attach('file', VALID_PDF, 'foto1.pdf')
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OCCURRENCE_EVIDENCE')
        .field('tripId', tripId)
        .field('tripOccurrenceId', occurrenceA)
        .attach('file', VALID_JPEG, 'foto2.jpg')
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OCCURRENCE_EVIDENCE')
        .field('tripId', tripId)
        .field('tripOccurrenceId', occurrenceB)
        .attach('file', VALID_PDF, 'foto-b.pdf')
        .expect(201);

      const resA = await request(app.getHttpServer())
        .get('/api/v1/fiscal/documents')
        .query({ tripOccurrenceId: occurrenceA })
        .set('Authorization', adminAuth)
        .expect(200);
      expect(resA.body.data.items).toHaveLength(2);
      expect(resA.body.data.items.every((i: { tripOccurrenceId: string }) => i.tripOccurrenceId === occurrenceA)).toBe(true);

      // "na viagem" continua funcionando -- ve os tres.
      const byTrip = await request(app.getHttpServer())
        .get('/api/v1/fiscal/documents')
        .query({ tripId })
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byTrip.body.data.items).toHaveLength(3);
    });

    it('PATCH permite vincular/desvincular a ocorrencia depois do upload', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('OccDocPatchLink');
      const { tripId } = await setupTripAndVehicle(adminAuth);
      const occurrenceId = await createOccurrence(adminAuth, tripId);

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OCCURRENCE_EVIDENCE')
        .field('tripId', tripId)
        .attach('file', VALID_PDF, 'evidencia.pdf')
        .expect(201);
      expect(uploadRes.body.data.tripOccurrenceId).toBeNull();

      const linked = await request(app.getHttpServer())
        .patch(`/api/v1/fiscal/documents/${uploadRes.body.data.id}`)
        .set('Authorization', adminAuth)
        .send({ tripOccurrenceId: occurrenceId })
        .expect(200);
      expect(linked.body.data.tripOccurrenceId).toBe(occurrenceId);

      const unlinked = await request(app.getHttpServer())
        .patch(`/api/v1/fiscal/documents/${uploadRes.body.data.id}`)
        .set('Authorization', adminAuth)
        .send({ tripOccurrenceId: null })
        .expect(200);
      expect(unlinked.body.data.tripOccurrenceId).toBeNull();
    });

    it('preserva historico: DELETE de uma evidencia de ocorrencia e sempre bloqueado (409); outros tipos continuam removiveis (regressao)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('OccDocNoDelete');
      const { tripId } = await setupTripAndVehicle(adminAuth);
      const occurrenceId = await createOccurrence(adminAuth, tripId);

      const res = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OCCURRENCE_EVIDENCE')
        .field('tripId', tripId)
        .field('tripOccurrenceId', occurrenceId)
        .attach('file', VALID_PDF, 'evidencia.pdf')
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/v1/fiscal/documents/${res.body.data.id}`)
        .set('Authorization', adminAuth)
        .expect(409);
      expect(await prisma.fiscalDocument.findUnique({ where: { id: res.body.data.id } })).not.toBeNull();

      const otherRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OTHER')
        .attach('file', VALID_PDF, 'outro.pdf')
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/api/v1/fiscal/documents/${otherRes.body.data.id}`)
        .set('Authorization', adminAuth)
        .expect(204);
    });

    it('Driver App: POST /driver/trips/:id/occurrences/:occurrenceId/evidence registra evidencia (idempotente por deviceEventId)', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('OccDocDriver');
      const { tripId, driverId } = await setupTripAndVehicle(adminAuth);
      const driverAuth = await loginAsDriver(tenantId, adminAuth, driverId);
      const occurrenceId = await createOccurrence(adminAuth, tripId);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/occurrences/${occurrenceId}/evidence`)
        .set('Authorization', driverAuth)
        .field('deviceEventId', 'dev-occ-evidence-1')
        .attach('file', VALID_JPEG, 'evidencia.jpg')
        .expect(201);
      expect(res.body.data.documentType).toBe('OCCURRENCE_EVIDENCE');
      expect(res.body.data.tripOccurrenceId).toBe(occurrenceId);
      expect(res.body.data.tripId).toBe(tripId);
      expect(res.body.data.origin).toBe('DRIVER');

      // Reenvio com o MESMO deviceEventId (fila offline) -- idempotente,
      // nunca cria uma segunda evidencia.
      const retryRes = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/occurrences/${occurrenceId}/evidence`)
        .set('Authorization', driverAuth)
        .field('deviceEventId', 'dev-occ-evidence-1')
        .attach('file', VALID_JPEG, 'evidencia-retry.jpg')
        .expect(201);
      expect(retryRes.body.data.id).toBe(res.body.data.id);
      expect(await prisma.fiscalDocument.count({ where: { tripOccurrenceId: occurrenceId } })).toBe(1);
    });

    it('Driver App: rejeita (404) ocorrencia que pertence a outra viagem do mesmo motorista', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('OccDocDriverWrongTrip');
      const { tripId: tripA, driverId } = await setupTripAndVehicle(adminAuth);
      const { tripId: tripB } = await setupTripAndVehicle(adminAuth);
      const driverAuth = await loginAsDriver(tenantId, adminAuth, driverId);
      const occurrenceOfTripB = await createOccurrence(adminAuth, tripB);

      await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripA}/occurrences/${occurrenceOfTripB}/evidence`)
        .set('Authorization', driverAuth)
        .field('deviceEventId', 'dev-occ-evidence-wrong-trip')
        .attach('file', VALID_JPEG, 'evidencia.jpg')
        .expect(400);
    });

    it('auditoria registra o vinculo com a ocorrencia no upload administrativo e na submissao pelo Driver App', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('OccDocAudit');
      const { tripId, driverId } = await setupTripAndVehicle(adminAuth);
      const driverAuth = await loginAsDriver(tenantId, adminAuth, driverId);
      const occurrenceId = await createOccurrence(adminAuth, tripId);

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'OCCURRENCE_EVIDENCE')
        .field('tripId', tripId)
        .field('tripOccurrenceId', occurrenceId)
        .attach('file', VALID_PDF, 'evidencia.pdf')
        .expect(201);
      const uploadHistory = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/${uploadRes.body.data.id}/history`)
        .set('Authorization', adminAuth)
        .expect(200);
      const uploadEntry = uploadHistory.body.data.items.find((i: { action: string }) => i.action === 'fiscal.document_uploaded');
      expect(uploadEntry.newValue).toMatchObject({ tripDeliveryStopId: null });

      const driverRes = await request(app.getHttpServer())
        .post(`/api/v1/driver/trips/${tripId}/occurrences/${occurrenceId}/evidence`)
        .set('Authorization', driverAuth)
        .field('deviceEventId', 'dev-occ-evidence-audit')
        .attach('file', VALID_JPEG, 'evidencia.jpg')
        .expect(201);
      const driverHistory = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/${driverRes.body.data.id}/history`)
        .set('Authorization', adminAuth)
        .expect(200);
      const submittedEntry = driverHistory.body.data.items.find(
        (i: { action: string }) => i.action === 'fiscal.occurrence_evidence_submitted',
      );
      expect(submittedEntry).toBeTruthy();
      expect(submittedEntry.newValue).toMatchObject({ tripOccurrenceId: occurrenceId });
    });

    it('isolamento multi-tenant: tenant B nunca consegue vincular documento a uma ocorrencia do tenant A, nem consulta-la via filtro', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('OccDocIsolA');
      const { tripId: tripA } = await setupTripAndVehicle(tenantA.adminAuth);
      const occurrenceA = await createOccurrence(tenantA.adminAuth, tripA);

      const tenantB = await createTenantAndLoginAsAdmin('OccDocIsolB');
      const { tripId: tripB } = await setupTripAndVehicle(tenantB.adminAuth);

      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', tenantB.adminAuth)
        .field('documentType', 'OCCURRENCE_EVIDENCE')
        .field('tripId', tripB)
        .field('tripOccurrenceId', occurrenceA)
        .attach('file', VALID_PDF, 'evidencia.pdf')
        .expect(404);

      const res = await request(app.getHttpServer())
        .get('/api/v1/fiscal/documents')
        .query({ tripOccurrenceId: occurrenceA })
        .set('Authorization', tenantB.adminAuth)
        .expect(200);
      expect(res.body.data.items).toHaveLength(0);
    });

    it('RBAC: AUDITOR consulta por tripOccurrenceId mas nao pode enviar/remover documento', async () => {
      const { tenantId, adminAuth } = await createTenantAndLoginAsAdmin('OccDocRbac');
      const { tripId } = await setupTripAndVehicle(adminAuth);
      const occurrenceId = await createOccurrence(adminAuth, tripId);
      const auditorAuth = await createUserWithRole(tenantId, adminAuth, 'AUDITOR');

      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', auditorAuth)
        .field('documentType', 'OCCURRENCE_EVIDENCE')
        .field('tripId', tripId)
        .field('tripOccurrenceId', occurrenceId)
        .attach('file', VALID_PDF, 'evidencia.pdf')
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/fiscal/documents')
        .query({ tripOccurrenceId: occurrenceId })
        .set('Authorization', auditorAuth)
        .expect(200);
    });

    it('regressao: o POD (Fase 100, vinculado a TripDeliveryStop) continua funcionando exatamente como antes, sem interferencia do vinculo com ocorrencia', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('OccDocPodRegression');
      const { tripId } = await setupTripAndVehicle(adminAuth);
      const stopId = await createCompletedDeliveryStop(adminAuth, tripId);

      const res = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'DELIVERY_PROOF')
        .field('tripId', tripId)
        .field('tripDeliveryStopId', stopId)
        .attach('file', VALID_PDF, 'comprovante.pdf')
        .expect(201);
      expect(res.body.data.tripDeliveryStopId).toBe(stopId);
      expect(res.body.data.tripOccurrenceId).toBeNull();
      expect(res.body.data.tripOccurrenceType).toBeNull();

      await request(app.getHttpServer())
        .delete(`/api/v1/fiscal/documents/${res.body.data.id}`)
        .set('Authorization', adminAuth)
        .expect(409);
    });
  });

  // ==========================================================================
  // Fase 57 -- CIOT (reaproveita FiscalDocument, sem tabela/service novo)
  // ==========================================================================
  describe('Fase 57 -- CIOT', () => {
    it('cadastro manual (numero, sem chave de acesso) ja vinculado a viagem/veiculo/motorista/cliente', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Ciot1');
      const { tripId, vehicleId, driverId } = await setupTripAndVehicle(adminAuth);
      const customerId = await createCustomer(adminAuth);

      const res = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'CIOT')
        .field('documentNumber', 'CIOT-000123')
        .field('tripId', tripId)
        .field('vehicleId', vehicleId)
        .field('driverId', driverId)
        .field('customerId', customerId)
        .attach('file', VALID_PDF, 'ciot.pdf')
        .expect(201);

      expect(res.body.data.documentType).toBe('CIOT');
      expect(res.body.data.documentNumber).toBe('CIOT-000123');
      expect(res.body.data.accessKey).toBeNull(); // nunca inventado -- CIOT nao tem chave de acesso SEFAZ
      expect(res.body.data.tripId).toBe(tripId);
      expect(res.body.data.vehicleId).toBe(vehicleId);
      expect(res.body.data.driverId).toBe(driverId);
      expect(res.body.data.customerId).toBe(customerId);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.validationIssues).toEqual([]);
    });

    it('valor digitado no campo chave de acesso nunca gera INVALID_ACCESS_KEY (CIOT nao tem esse formato)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Ciot2');
      const garbageKey = `${'0'.repeat(43)}9`; // DV real seria 0, nunca 9 -- invalido se avaliado como NF-e/CT-e/MDF-e

      const res = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'CIOT')
        .field('accessKey', garbageKey)
        .attach('file', VALID_PDF, 'ciot.pdf')
        .expect(201);

      expect(res.body.data.validationIssues).not.toContain('INVALID_ACCESS_KEY');
    });

    it('vincula um CIOT ja existente (sem vinculo) a uma viagem via PATCH (mesmo endpoint generico)', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Ciot3');
      const { tripId } = await setupTripAndVehicle(adminAuth);

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'CIOT')
        .field('documentNumber', 'CIOT-999')
        .attach('file', VALID_PDF, 'ciot.pdf')
        .expect(201);
      expect(uploadRes.body.data.tripId).toBeNull();

      const patchRes = await request(app.getHttpServer())
        .patch(`/api/v1/fiscal/documents/${uploadRes.body.data.id}`)
        .set('Authorization', adminAuth)
        .send({ tripId })
        .expect(200);
      expect(patchRes.body.data.tripId).toBe(tripId);

      const byType = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents?documentType=CIOT&tripId=${tripId}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(byType.body.data.items).toHaveLength(1);
    });

    it('duplicidade de CIOT (mesmo tipo+numero+serie+data, sem chave) reaproveita o mecanismo generico -- 409', async () => {
      const { adminAuth, tenantId } = await createTenantAndLoginAsAdmin('Ciot4');

      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'CIOT')
        .field('documentNumber', 'CIOT-DUP')
        .field('series', '1')
        .field('issueDate', '2026-08-01')
        .attach('file', VALID_PDF, 'ciot1.pdf')
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'CIOT')
        .field('documentNumber', 'CIOT-DUP')
        .field('series', '1')
        .field('issueDate', '2026-08-01')
        .attach('file', VALID_PDF, 'ciot2.pdf')
        .expect(409);

      expect(await prisma.fiscalDocument.count({ where: { tenantId, documentType: 'CIOT' } })).toBe(1);
    });

    it('isolamento tenant: CIOT de um tenant nunca aparece/e acessivel para outro', async () => {
      const tenantA = await createTenantAndLoginAsAdmin('Ciot5A');
      const tenantB = await createTenantAndLoginAsAdmin('Ciot5B');

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', tenantA.adminAuth)
        .field('documentType', 'CIOT')
        .field('documentNumber', 'CIOT-ISO')
        .attach('file', VALID_PDF, 'ciot.pdf')
        .expect(201);

      await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/${uploadRes.body.data.id}`)
        .set('Authorization', tenantB.adminAuth)
        .expect(404);

      const listB = await request(app.getHttpServer())
        .get('/api/v1/fiscal/documents?documentType=CIOT')
        .set('Authorization', tenantB.adminAuth)
        .expect(200);
      expect(listB.body.data.items).toEqual([]);
    });

    it('historico de auditoria reflete upload e vinculo do CIOT', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Ciot6');
      const { tripId } = await setupTripAndVehicle(adminAuth);

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'CIOT')
        .field('documentNumber', 'CIOT-HIST')
        .attach('file', VALID_PDF, 'ciot.pdf')
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/fiscal/documents/${uploadRes.body.data.id}`)
        .set('Authorization', adminAuth)
        .send({ tripId })
        .expect(200);

      const historyRes = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/${uploadRes.body.data.id}/history`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(historyRes.body.data.items.map((i: { action: string }) => i.action)).toEqual(
        expect.arrayContaining(['fiscal.document_uploaded', 'fiscal.document_linked']),
      );
    });

    it('matriz documental e complianceStatus da viagem refletem o CIOT vinculado', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Ciot7');
      const { tripId } = await setupTripAndVehicle(adminAuth);

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'CIOT')
        .field('documentNumber', 'CIOT-MATRIX')
        .field('tripId', tripId)
        .attach('file', VALID_PDF, 'ciot.pdf')
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/fiscal/documents/${uploadRes.body.data.id}`)
        .set('Authorization', adminAuth)
        .send({ status: 'VALID' })
        .expect(200);

      const statusRes = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/trip/${tripId}/status`)
        .set('Authorization', adminAuth)
        .expect(200);
      const ciotRow = statusRes.body.data.matrix.find((row: { documentType: string }) => row.documentType === 'CIOT');
      expect(ciotRow.totalCount).toBe(1);
      expect(ciotRow.structurallyValidCount).toBe(1);
      expect(statusRes.body.data.complianceStatus).toBe('OK'); // ausencia de CIOT nunca e erro; com 1 CIOT valido, viagem OK
    });

    it('dashboard: indicadores CIOT (vinculados/sem vinculo/pendentes/invalidos/problematicos/divergencia) refletem o escopo do filtro', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Ciot8');
      const { tripId, vehicleId } = await setupTripAndVehicle(adminAuth);
      const otherVehicleId = await createVehicle(adminAuth);

      // 1 vinculado, PENDING.
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'CIOT')
        .field('documentNumber', 'CIOT-A')
        .field('tripId', tripId)
        .attach('file', VALID_PDF, 'a.pdf')
        .expect(201);

      // 1 sem vinculo nenhum.
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'CIOT')
        .field('documentNumber', 'CIOT-B')
        .attach('file', VALID_PDF, 'b.pdf')
        .expect(201);

      // 1 INVALID com divergencia operacional (veiculo diferente do real da viagem).
      const divergentRes = await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'CIOT')
        .field('documentNumber', 'CIOT-C')
        .field('tripId', tripId)
        .field('vehicleId', otherVehicleId)
        .attach('file', VALID_PDF, 'c.pdf')
        .expect(201);
      expect(divergentRes.body.data.validationIssues).toContain('INCONSISTENT_LINK');
      await request(app.getHttpServer())
        .patch(`/api/v1/fiscal/documents/${divergentRes.body.data.id}`)
        .set('Authorization', adminAuth)
        .send({ status: 'INVALID' })
        .expect(200);
      void vehicleId;

      const dashboard = await request(app.getHttpServer())
        .get('/api/v1/fiscal/documents/dashboard')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(dashboard.body.data.ciotCount).toBe(3);
      expect(dashboard.body.data.ciotLinkedCount).toBe(2); // A e C linkados a trip; B sem vinculo
      expect(dashboard.body.data.ciotUnlinkedCount).toBe(1); // B
      expect(dashboard.body.data.ciotPendingCount).toBe(2); // A e B continuam PENDING (upload nunca muda status sozinho)
      expect(dashboard.body.data.ciotInvalidCount).toBe(1); // C
      expect(dashboard.body.data.ciotProblematicCount).toBe(3); // A+B (PENDING) + C (INVALID/divergente)
      expect(dashboard.body.data.ciotOperationalDivergenceCount).toBe(1);
      expect(dashboard.body.data.ciotMonthlyEvolution).toBeInstanceOf(Array);
    });
  });

  // ==========================================================================
  // Fase 58 -- relatedCount (matriz) e relatedDocumentsCount (dashboard),
  // reaproveitando o mesmo mecanismo de relacionamento da Fase 55
  // (metadata.manifestedAccessKeys) -- agora tambem agregado em lote.
  // ==========================================================================
  describe('Fase 58 -- MDF-e + CT-e + NF-e: relacionamento agregado', () => {
    function buildMdfeXmlWithManifest(accessKey: string, number: string, manifestedKeys: string[]): string {
      const infDoc = manifestedKeys.map((key) => `<infNFe><chNFe>${key}</chNFe></infNFe>`).join('');
      return `<?xml version="1.0" encoding="UTF-8"?>
<mdfeProc versao="3.00">
  <MDFe>
    <infMDFe Id="MDFe${accessKey}" versao="3.00">
      <ide><serie>1</serie><nMDF>${number}</nMDF><dhEmi>2026-08-03T07:00:00-03:00</dhEmi></ide>
      <emit><CNPJ>11222333000144</CNPJ><xNome>Transportadora Teste LTDA</xNome></emit>
      <infDoc>${infDoc}</infDoc>
    </infMDFe>
  </MDFe>
</mdfeProc>`;
    }

    it('matriz da viagem: relatedCount conta MDF-e e o CT-e/NF-e que ele manifesta; tipos sem relacao ficam 0', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Related1');
      const { tripId } = await setupTripAndVehicle(adminAuth);

      const cteKey = randomAccessKey();
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/import')
        .set('Authorization', adminAuth)
        .field('tripId', tripId)
        .attach('file', Buffer.from(buildCteXml(cteKey, '1')), 'cte.xml')
        .expect(201);

      // NF-e SOLTA, sem nenhuma chave manifestada por ninguem -- nunca
      // relacionada por aproximacao.
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/import')
        .set('Authorization', adminAuth)
        .field('tripId', tripId)
        .attach('file', Buffer.from(buildNfeXml(randomAccessKey(), '1')), 'nfe-solta.xml')
        .expect(201);

      const mdfeKey = randomAccessKey();
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/import')
        .set('Authorization', adminAuth)
        .field('tripId', tripId)
        .attach('file', Buffer.from(buildMdfeXmlWithManifest(mdfeKey, '1', [cteKey])), 'mdfe.xml')
        .expect(201);

      const statusRes = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/documents/trip/${tripId}/status`)
        .set('Authorization', adminAuth)
        .expect(200);
      const rowFor = (type: string) => statusRes.body.data.matrix.find((row: { documentType: string }) => row.documentType === type);
      expect(rowFor('MDFE').relatedCount).toBe(1);
      expect(rowFor('CTE').relatedCount).toBe(1);
      expect(rowFor('NFE').relatedCount).toBe(0); // NF-e solta -- nunca relacionada por aproximacao
      expect(rowFor('CIOT').relatedCount).toBe(0);
    });

    it('dashboard: relatedDocumentsCount conta as duas pontas quando ambas estao no escopo do filtro', async () => {
      const { adminAuth } = await createTenantAndLoginAsAdmin('Related2');
      const { tripId } = await setupTripAndVehicle(adminAuth);

      const cteKey = randomAccessKey();
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/import')
        .set('Authorization', adminAuth)
        .field('tripId', tripId)
        .attach('file', Buffer.from(buildCteXml(cteKey, '1')), 'cte.xml')
        .expect(201);

      const mdfeKey = randomAccessKey();
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/import')
        .set('Authorization', adminAuth)
        .field('tripId', tripId)
        .attach('file', Buffer.from(buildMdfeXmlWithManifest(mdfeKey, '1', [cteKey])), 'mdfe.xml')
        .expect(201);

      // Documento solto, sem relacao com nada -- nunca conta.
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/documents/upload')
        .set('Authorization', adminAuth)
        .field('documentType', 'CIOT')
        .field('documentNumber', 'CIOT-SOLTO')
        .attach('file', VALID_PDF, 'ciot.pdf')
        .expect(201);

      const dashboard = await request(app.getHttpServer())
        .get('/api/v1/fiscal/documents/dashboard')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(dashboard.body.data.relatedDocumentsCount).toBe(2); // MDF-e + CT-e manifestado

      // Filtrado so por MDF-e: o CT-e manifestado sai do escopo, entao o
      // relacionamento (que exige as DUAS pontas no escopo) deixa de ser
      // contado -- nunca inventa relacao com algo fora do filtro atual.
      const filtered = await request(app.getHttpServer())
        .get('/api/v1/fiscal/documents/dashboard?documentType=MDFE')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(filtered.body.data.relatedDocumentsCount).toBe(0);
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

    // Fase 100 -- o novo include (tripDeliveryStop) e sempre um JOIN dentro
    // da MESMA query de FISCAL_DOCUMENT_INCLUDE, nunca uma query por linha
    // -- este teste comprova isso especificamente para o padrao de consulta
    // "na entrega/na viagem" com paradas concluidas e comprovantes vinculados.
    it('a contagem de queries de GET /fiscal/documents?tripId nao cresce com paradas concluidas + comprovantes vinculados', async () => {
      const { adminAuth } = await createTenantAndLoginOnCountingApp('N1PodStops');
      const tripId = await setupTripOnCountingApp(adminAuth);

      async function seedCompletedStopWithProof(index: number): Promise<void> {
        const locationRes = await request(countingApp.getHttpServer())
          .post('/api/v1/locations')
          .set('Authorization', adminAuth)
          .send({ name: `Parada ${index} ${randomUUID()}`, type: 'CUSTOMER_SITE' })
          .expect(201);
        const stopRes = await request(countingApp.getHttpServer())
          .post(`/api/v1/trips/${tripId}/delivery-stops`)
          .set('Authorization', adminAuth)
          .send({ locationId: locationRes.body.data.id })
          .expect(201);
        const stopId = stopRes.body.data.id as string;
        await request(countingApp.getHttpServer())
          .patch(`/api/v1/trips/${tripId}/delivery-stops/${stopId}/status`)
          .set('Authorization', adminAuth)
          .send({ status: 'COMPLETED' })
          .expect(200);
        await request(countingApp.getHttpServer())
          .post('/api/v1/fiscal/documents/upload')
          .set('Authorization', adminAuth)
          .field('documentType', 'DELIVERY_PROOF')
          .field('tripId', tripId)
          .field('tripDeliveryStopId', stopId)
          .attach('file', VALID_PDF, `comprovante-${index}.pdf`)
          .expect(201);
      }

      for (let i = 0; i < 5; i += 1) await seedCompletedStopWithProof(i);
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/fiscal/documents')
        .query({ tripId })
        .set('Authorization', adminAuth)
        .expect(200);
      const queriesFor5 = queryCount;

      for (let i = 5; i < 20; i += 1) await seedCompletedStopWithProof(i);
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/fiscal/documents')
        .query({ tripId })
        .set('Authorization', adminAuth)
        .expect(200);
      const queriesFor20 = queryCount;

      expect(queriesFor5).toBeGreaterThan(0);
      expect(queriesFor20).toBeLessThanOrEqual(queriesFor5 + 1);
    }, 180000);

    // Fase 102 -- o novo include (tripOccurrence) e sempre um JOIN dentro da
    // MESMA query de FISCAL_DOCUMENT_INCLUDE, nunca uma query por linha --
    // mesmo principio ja comprovado para tripDeliveryStop (N1PodStops acima).
    it('a contagem de queries de GET /fiscal/documents?tripId nao cresce com ocorrencias + evidencias vinculadas', async () => {
      const { adminAuth } = await createTenantAndLoginOnCountingApp('N1OccEvidence');
      const tripId = await setupTripOnCountingApp(adminAuth);

      async function seedOccurrenceWithEvidence(index: number): Promise<void> {
        const occurrenceRes = await request(countingApp.getHttpServer())
          .post(`/api/v1/trips/${tripId}/occurrences`)
          .set('Authorization', adminAuth)
          .send({ type: 'OTHER', description: `Ocorrencia ${index}`, occurredAt: '2026-08-20T10:00:00.000Z' })
          .expect(201);
        const occurrenceId = occurrenceRes.body.data.id as string;
        await request(countingApp.getHttpServer())
          .post('/api/v1/fiscal/documents/upload')
          .set('Authorization', adminAuth)
          .field('documentType', 'OCCURRENCE_EVIDENCE')
          .field('tripId', tripId)
          .field('tripOccurrenceId', occurrenceId)
          .attach('file', VALID_PDF, `evidencia-${index}.pdf`)
          .expect(201);
      }

      for (let i = 0; i < 5; i += 1) await seedOccurrenceWithEvidence(i);
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/fiscal/documents')
        .query({ tripId })
        .set('Authorization', adminAuth)
        .expect(200);
      const queriesFor5 = queryCount;

      for (let i = 5; i < 20; i += 1) await seedOccurrenceWithEvidence(i);
      queryCount = 0;
      await request(countingApp.getHttpServer())
        .get('/api/v1/fiscal/documents')
        .query({ tripId })
        .set('Authorization', adminAuth)
        .expect(200);
      const queriesFor20 = queryCount;

      expect(queriesFor5).toBeGreaterThan(0);
      expect(queriesFor20).toBeLessThanOrEqual(queriesFor5 + 1);
    }, 180000);
  });
});
