import { FiscalDocumentSource, FiscalDocumentStatus, FiscalDocumentType } from '@prisma/client';
import { FiscalDocumentWithRelations, toFiscalDocumentEntity } from './fiscal-document.mapper';

function buildDocument(overrides: Partial<FiscalDocumentWithRelations> = {}): FiscalDocumentWithRelations {
  return {
    id: 'doc-1',
    tenantId: 'tenant-1',
    documentType: FiscalDocumentType.NFE,
    documentNumber: '1234',
    accessKey: '35260812345678000199550010000012341234567890',
    series: '1',
    issueDate: new Date('2026-08-01T10:00:00.000Z'),
    senderName: 'Emitente LTDA',
    senderDocument: '12345678000199',
    recipientName: 'Destinatario LTDA',
    recipientDocument: '98765432000188',
    status: FiscalDocumentStatus.VALID,
    source: FiscalDocumentSource.XML_IMPORT,
    attachmentId: 'attachment-1',
    fileName: 'nota.xml',
    mimeType: 'text/xml',
    sizeBytes: 2048,
    metadata: { amount: 1500 },
    tripId: null,
    vehicleId: null,
    driverId: null,
    customerId: null,
    createdBy: 'user-1',
    updatedBy: null,
    createdAt: new Date('2026-08-01T10:05:00.000Z'),
    updatedAt: new Date('2026-08-01T10:05:00.000Z'),
    trip: null,
    vehicle: null,
    driver: null,
    customer: null,
    creator: { id: 'user-1', name: 'Fulano' } as never,
    updater: null,
    ...overrides,
  } as FiscalDocumentWithRelations;
}

describe('toFiscalDocumentEntity', () => {
  it('mapeia todos os campos escalares 1:1', () => {
    const entity = toFiscalDocumentEntity(buildDocument());
    expect(entity.id).toBe('doc-1');
    expect(entity.documentType).toBe(FiscalDocumentType.NFE);
    expect(entity.accessKey).toBe('35260812345678000199550010000012341234567890');
    expect(entity.status).toBe(FiscalDocumentStatus.VALID);
    expect(entity.source).toBe(FiscalDocumentSource.XML_IMPORT);
    expect(entity.metadata).toEqual({ amount: 1500 });
    expect(entity.creatorName).toBe('Fulano');
  });

  it('resolve tripLabel a partir de origin/destination quando ha vinculo com viagem', () => {
    const entity = toFiscalDocumentEntity(
      buildDocument({
        tripId: 'trip-1',
        trip: {
          origin: { name: 'São Paulo/SP' },
          destination: { name: 'Curitiba/PR' },
        } as never,
      }),
    );
    expect(entity.tripId).toBe('trip-1');
    expect(entity.tripLabel).toBe('São Paulo/SP → Curitiba/PR');
  });

  it('nunca inventa nomes/rotulos quando nao ha vinculo -- tudo null', () => {
    const entity = toFiscalDocumentEntity(buildDocument());
    expect(entity.tripLabel).toBeNull();
    expect(entity.vehiclePlate).toBeNull();
    expect(entity.driverName).toBeNull();
    expect(entity.customerName).toBeNull();
    expect(entity.updaterName).toBeNull();
  });

  it('resolve vehiclePlate/driverName/customerName quando os vinculos existem', () => {
    const entity = toFiscalDocumentEntity(
      buildDocument({
        vehicleId: 'vehicle-1',
        vehicle: { plate: 'ABC1234' } as never,
        driverId: 'driver-1',
        driver: { name: 'Motorista Teste' } as never,
        customerId: 'customer-1',
        customer: { name: 'Cliente Teste' } as never,
        updatedBy: 'user-2',
        updater: { name: 'Beltrano' } as never,
      }),
    );
    expect(entity.vehiclePlate).toBe('ABC1234');
    expect(entity.driverName).toBe('Motorista Teste');
    expect(entity.customerName).toBe('Cliente Teste');
    expect(entity.updaterName).toBe('Beltrano');
  });
});
