import { FiscalDocumentSource, FiscalDocumentType } from '@prisma/client';
import { computeAccessKeyCheckDigit } from './access-key.util';
import { classifyFiscalDocumentIssues, FiscalDocumentIssueInput, FiscalIssueCode, isWellFormedXml } from './fiscal-document-validation.util';

function buildAccessKey(modelCode: string): string {
  const first43 = `35` + `2601` + `12345678000199` + modelCode + `001` + `000000001` + `1` + `12345678`;
  return first43 + String(computeAccessKeyCheckDigit(first43));
}

function baseDoc(overrides: Partial<FiscalDocumentIssueInput> = {}): FiscalDocumentIssueInput {
  return {
    documentType: FiscalDocumentType.NFE,
    source: FiscalDocumentSource.XML_IMPORT,
    accessKey: buildAccessKey('55'),
    documentNumber: '1234',
    series: '1',
    issueDate: new Date('2026-08-01T10:00:00.000Z'),
    senderName: 'Emitente LTDA',
    senderDocument: '12345678000199',
    recipientName: 'Destinatario LTDA',
    recipientDocument: '98765432000188',
    tripId: null,
    vehicleId: null,
    driverId: null,
    customerId: null,
    ...overrides,
  };
}

describe('isWellFormedXml', () => {
  it('aceita XML com tags balanceadas', () => {
    expect(isWellFormedXml('<?xml version="1.0"?><infNFe><ide><nNF>1</nNF></ide></infNFe>')).toBe(true);
  });

  it('rejeita conteudo truncado no meio de uma tag (download/gravacao incompleta)', () => {
    expect(isWellFormedXml('<infNFe><ide><nNF>1</nNF></ide')).toBe(false);
  });

  it('rejeita conteudo que nao comeca com "<"', () => {
    expect(isWellFormedXml('isto nao e xml')).toBe(false);
  });

  it('aceita XML com CDATA/comentarios sem falso negativo', () => {
    expect(isWellFormedXml('<infNFe><!-- comentario --><obs><![CDATA[texto < > livre]]></obs></infNFe>')).toBe(true);
  });
});

describe('classifyFiscalDocumentIssues -- documento consistente', () => {
  it('nao aponta nenhum problema para um documento NF-e completo e coerente', () => {
    expect(classifyFiscalDocumentIssues(baseDoc())).toEqual([]);
  });
});

describe('classifyFiscalDocumentIssues -- chave de acesso', () => {
  it('aponta INVALID_ACCESS_KEY quando o DV nao bate', () => {
    const key = buildAccessKey('55');
    const corrupted = key.slice(0, 43) + (key[43] === '0' ? '1' : '0');
    const issues = classifyFiscalDocumentIssues(baseDoc({ accessKey: corrupted }));
    expect(issues).toContain(FiscalIssueCode.INVALID_ACCESS_KEY);
  });

  it('nunca aponta problema quando accessKey e null (nao informada)', () => {
    const issues = classifyFiscalDocumentIssues(baseDoc({ accessKey: null, source: FiscalDocumentSource.UPLOAD }));
    expect(issues).not.toContain(FiscalIssueCode.INVALID_ACCESS_KEY);
  });

  it('Fase 57 -- nunca aponta INVALID_ACCESS_KEY para CIOT (nao tem esse formato, mesmo com um valor digitado no campo e DV incorreto)', () => {
    const garbageKey = `${'0'.repeat(43)}9`; // DV real para 43 zeros seria 0, nunca 9 -- proposital, invalido se avaliado
    const issues = classifyFiscalDocumentIssues(
      baseDoc({ documentType: FiscalDocumentType.CIOT, accessKey: garbageKey, source: FiscalDocumentSource.UPLOAD }),
    );
    expect(issues).not.toContain(FiscalIssueCode.INVALID_ACCESS_KEY);
  });
});

describe('classifyFiscalDocumentIssues -- tipo incompativel', () => {
  it('aponta TYPE_MISMATCH quando o codigo de modelo da chave nao bate com o documentType', () => {
    const cteKey = buildAccessKey('57'); // modelo CT-e
    const issues = classifyFiscalDocumentIssues(baseDoc({ documentType: FiscalDocumentType.NFE, accessKey: cteKey }));
    expect(issues).toContain(FiscalIssueCode.TYPE_MISMATCH);
  });

  it('nunca aponta TYPE_MISMATCH para tipos fora do parser XML (CIOT/OTHER/etc.)', () => {
    const cteKey = buildAccessKey('57');
    const issues = classifyFiscalDocumentIssues(
      baseDoc({ documentType: FiscalDocumentType.OTHER, accessKey: cteKey, source: FiscalDocumentSource.UPLOAD }),
    );
    expect(issues).not.toContain(FiscalIssueCode.TYPE_MISMATCH);
  });
});

describe('classifyFiscalDocumentIssues -- campos essenciais ausentes', () => {
  it('aponta ESSENTIAL_FIELDS_MISSING quando falta numero/serie/data/emitente em documento importado de XML', () => {
    expect(classifyFiscalDocumentIssues(baseDoc({ documentNumber: null }))).toContain(FiscalIssueCode.ESSENTIAL_FIELDS_MISSING);
    expect(classifyFiscalDocumentIssues(baseDoc({ senderName: null }))).toContain(FiscalIssueCode.ESSENTIAL_FIELDS_MISSING);
    expect(classifyFiscalDocumentIssues(baseDoc({ recipientName: null }))).toContain(FiscalIssueCode.ESSENTIAL_FIELDS_MISSING);
  });

  it('MDF-e nunca exige destinatario (nao tem esse campo por natureza)', () => {
    const issues = classifyFiscalDocumentIssues(
      baseDoc({ documentType: FiscalDocumentType.MDFE, accessKey: buildAccessKey('58'), recipientName: null, recipientDocument: null }),
    );
    expect(issues).not.toContain(FiscalIssueCode.ESSENTIAL_FIELDS_MISSING);
  });

  it('upload manual NUNCA exige campos essenciais (sem regra de negocio definida para isso)', () => {
    const issues = classifyFiscalDocumentIssues(
      baseDoc({
        source: FiscalDocumentSource.UPLOAD,
        documentType: FiscalDocumentType.OTHER,
        accessKey: null,
        documentNumber: null,
        series: null,
        issueDate: null,
        senderName: null,
        senderDocument: null,
        recipientName: null,
        recipientDocument: null,
      }),
    );
    expect(issues).not.toContain(FiscalIssueCode.ESSENTIAL_FIELDS_MISSING);
  });
});

describe('classifyFiscalDocumentIssues -- data inconsistente', () => {
  it('aponta INCONSISTENT_DATE quando issueDate esta no futuro', () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    expect(classifyFiscalDocumentIssues(baseDoc({ issueDate: future }))).toContain(FiscalIssueCode.INCONSISTENT_DATE);
  });

  it('nunca aponta problema quando issueDate e null', () => {
    expect(classifyFiscalDocumentIssues(baseDoc({ issueDate: null, source: FiscalDocumentSource.UPLOAD }))).not.toContain(
      FiscalIssueCode.INCONSISTENT_DATE,
    );
  });
});

describe('classifyFiscalDocumentIssues -- duplicidade (contexto pre-calculado)', () => {
  it('aponta DUPLICATE_CANDIDATE quando o chamador ja identificou outro documento equivalente', () => {
    expect(classifyFiscalDocumentIssues(baseDoc({ hasDuplicateCandidate: true }))).toContain(FiscalIssueCode.DUPLICATE_CANDIDATE);
  });

  it('nunca aponta duplicidade por conta propria (funcao pura, nunca faz query)', () => {
    expect(classifyFiscalDocumentIssues(baseDoc())).not.toContain(FiscalIssueCode.DUPLICATE_CANDIDATE);
  });
});

describe('classifyFiscalDocumentIssues -- vinculo', () => {
  it('aponta INCONSISTENT_LINK quando o veiculo/motorista do documento diverge do real da viagem', () => {
    const byVehicle = classifyFiscalDocumentIssues(
      baseDoc({ tripId: 'trip-1', vehicleId: 'vehicle-A', tripVehicleId: 'vehicle-B' }),
    );
    expect(byVehicle).toContain(FiscalIssueCode.INCONSISTENT_LINK);

    const byDriver = classifyFiscalDocumentIssues(
      baseDoc({ tripId: 'trip-1', driverId: 'driver-A', tripDriverId: 'driver-B' }),
    );
    expect(byDriver).toContain(FiscalIssueCode.INCONSISTENT_LINK);
  });

  it('nunca aponta INCONSISTENT_LINK quando os vinculos batem ou nao ha o que comparar', () => {
    const matching = classifyFiscalDocumentIssues(
      baseDoc({ tripId: 'trip-1', vehicleId: 'vehicle-A', tripVehicleId: 'vehicle-A' }),
    );
    expect(matching).not.toContain(FiscalIssueCode.INCONSISTENT_LINK);

    const noVehicleLinked = classifyFiscalDocumentIssues(baseDoc({ tripId: 'trip-1' }));
    expect(noVehicleLinked).not.toContain(FiscalIssueCode.INCONSISTENT_LINK);
  });

  it('Fase 55 -- aponta INCONSISTENT_LINK quando o cliente do documento diverge do cliente real da viagem', () => {
    const byCustomer = classifyFiscalDocumentIssues(
      baseDoc({ tripId: 'trip-1', customerId: 'customer-A', tripCustomerId: 'customer-B' }),
    );
    expect(byCustomer).toContain(FiscalIssueCode.INCONSISTENT_LINK);
  });

  it('Fase 55 -- nunca aponta divergencia de cliente quando a viagem nao tem cliente informado', () => {
    const noCustomerOnTrip = classifyFiscalDocumentIssues(
      baseDoc({ tripId: 'trip-1', customerId: 'customer-A', tripCustomerId: null }),
    );
    expect(noCustomerOnTrip).not.toContain(FiscalIssueCode.INCONSISTENT_LINK);
  });

  it('aponta NO_TRIP_CONTEXT quando ha veiculo/motorista/cliente mas nenhuma viagem', () => {
    expect(classifyFiscalDocumentIssues(baseDoc({ vehicleId: 'vehicle-A' }))).toContain(FiscalIssueCode.NO_TRIP_CONTEXT);
    expect(classifyFiscalDocumentIssues(baseDoc({ driverId: 'driver-A' }))).toContain(FiscalIssueCode.NO_TRIP_CONTEXT);
    expect(classifyFiscalDocumentIssues(baseDoc({ customerId: 'customer-A' }))).toContain(FiscalIssueCode.NO_TRIP_CONTEXT);
  });

  it('documento totalmente sem vinculo (nenhum contexto) nunca aponta NO_TRIP_CONTEXT', () => {
    expect(classifyFiscalDocumentIssues(baseDoc())).not.toContain(FiscalIssueCode.NO_TRIP_CONTEXT);
  });
});
