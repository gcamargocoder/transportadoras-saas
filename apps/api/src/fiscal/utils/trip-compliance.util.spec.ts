import { FiscalDocumentStatus, FiscalDocumentType } from '@prisma/client';
import { FiscalIssueCode } from './fiscal-document-validation.util';
import {
  buildTripDocumentMatrix,
  computeDeliveryProofStatus,
  computeTripDocumentComplianceStatus,
  DeliveryProofStatus,
  isSafeUnlinkedCandidate,
  TripDocumentComplianceStatus,
} from './trip-compliance.util';

describe('computeTripDocumentComplianceStatus', () => {
  it('UNAVAILABLE quando a viagem nao tem nenhum documento (sem dado suficiente)', () => {
    expect(
      computeTripDocumentComplianceStatus({ totalDocuments: 0, invalidCount: 0, cancelledCount: 0, pendingCount: 0, hasOperationalDivergence: false }),
    ).toBe(TripDocumentComplianceStatus.UNAVAILABLE);
  });

  it('OK quando todos os documentos estao presentes e sem nenhum problema', () => {
    expect(
      computeTripDocumentComplianceStatus({ totalDocuments: 2, invalidCount: 0, cancelledCount: 0, pendingCount: 0, hasOperationalDivergence: false }),
    ).toBe(TripDocumentComplianceStatus.OK);
  });

  it('ATTENTION quando ha pendencia mas nenhuma inconsistencia critica', () => {
    expect(
      computeTripDocumentComplianceStatus({ totalDocuments: 2, invalidCount: 0, cancelledCount: 0, pendingCount: 1, hasOperationalDivergence: false }),
    ).toBe(TripDocumentComplianceStatus.ATTENTION);
  });

  it('PROBLEMATIC quando ha documento invalido', () => {
    expect(
      computeTripDocumentComplianceStatus({ totalDocuments: 2, invalidCount: 1, cancelledCount: 0, pendingCount: 0, hasOperationalDivergence: false }),
    ).toBe(TripDocumentComplianceStatus.PROBLEMATIC);
  });

  it('PROBLEMATIC quando ha documento cancelado com contexto na viagem', () => {
    expect(
      computeTripDocumentComplianceStatus({ totalDocuments: 1, invalidCount: 0, cancelledCount: 1, pendingCount: 0, hasOperationalDivergence: false }),
    ).toBe(TripDocumentComplianceStatus.PROBLEMATIC);
  });

  it('PROBLEMATIC quando ha divergencia operacional (veiculo/motorista/cliente)', () => {
    expect(
      computeTripDocumentComplianceStatus({ totalDocuments: 1, invalidCount: 0, cancelledCount: 0, pendingCount: 0, hasOperationalDivergence: true }),
    ).toBe(TripDocumentComplianceStatus.PROBLEMATIC);
  });

  it('PROBLEMATIC tem prioridade sobre ATTENTION quando ambos ocorrem', () => {
    expect(
      computeTripDocumentComplianceStatus({ totalDocuments: 2, invalidCount: 1, cancelledCount: 0, pendingCount: 1, hasOperationalDivergence: false }),
    ).toBe(TripDocumentComplianceStatus.PROBLEMATIC);
  });
});

describe('buildTripDocumentMatrix', () => {
  it('retorna 1 linha por tipo do catalogo inteiro, mesmo sem nenhum documento (ausente = zerado, nunca erro)', () => {
    const matrix = buildTripDocumentMatrix([]);
    expect(matrix).toHaveLength(Object.values(FiscalDocumentType).length);
    expect(matrix.every((row) => row.totalCount === 0 && row.present === false)).toBe(true);
  });

  it('agrega contagens por tipo corretamente', () => {
    const matrix = buildTripDocumentMatrix([
      { documentType: FiscalDocumentType.CTE, status: FiscalDocumentStatus.VALID, validationIssues: [] },
      { documentType: FiscalDocumentType.CTE, status: FiscalDocumentStatus.PENDING, validationIssues: [] },
      { documentType: FiscalDocumentType.CTE, status: FiscalDocumentStatus.INVALID, validationIssues: [FiscalIssueCode.INVALID_ACCESS_KEY] },
      { documentType: FiscalDocumentType.NFE, status: FiscalDocumentStatus.VALID, validationIssues: [FiscalIssueCode.DUPLICATE_CANDIDATE] },
    ]);
    const cte = matrix.find((row) => row.documentType === FiscalDocumentType.CTE)!;
    expect(cte.totalCount).toBe(3);
    expect(cte.present).toBe(true);
    expect(cte.structurallyValidCount).toBe(1);
    expect(cte.pendingCount).toBe(1);
    expect(cte.invalidCount).toBe(1);
    expect(cte.problematicCount).toBe(2); // PENDING + INVALID
    expect(cte.withIssuesCount).toBe(1); // so o INVALID tem validationIssues -- PENDING sem issues nao conta

    const nfe = matrix.find((row) => row.documentType === FiscalDocumentType.NFE)!;
    expect(nfe.structurallyValidCount).toBe(0); // VALID mas com issue -- nao conta como estruturalmente valido
    expect(nfe.duplicateCandidateCount).toBe(1);
    expect(nfe.problematicCount).toBe(1); // VALID com issue conta como problematico
    expect(nfe.withIssuesCount).toBe(1);

    const mdfe = matrix.find((row) => row.documentType === FiscalDocumentType.MDFE)!;
    expect(mdfe.totalCount).toBe(0);
    expect(mdfe.present).toBe(false);
  });
});

describe('computeDeliveryProofStatus', () => {
  const base = { totalCount: 0, structurallyValidCount: 0, pendingCount: 0, invalidCount: 0, cancelledCount: 0, withIssuesCount: 0 };

  it('MISSING quando nao ha linha ou totalCount=0 (nunca trata "sem comprovante" como problema)', () => {
    expect(computeDeliveryProofStatus(undefined)).toBe(DeliveryProofStatus.MISSING);
    expect(computeDeliveryProofStatus({ ...base })).toBe(DeliveryProofStatus.MISSING);
  });

  it('AVAILABLE somente quando ha comprovante estruturalmente valido (nunca so "arquivo existe")', () => {
    expect(computeDeliveryProofStatus({ ...base, totalCount: 1, structurallyValidCount: 1 })).toBe(DeliveryProofStatus.AVAILABLE);
  });

  it('PENDING quando ha comprovante aguardando revisao, sem problema (recem-enviado, ainda nao revisado -- nunca PROBLEMATIC so por estar PENDING)', () => {
    expect(computeDeliveryProofStatus({ ...base, totalCount: 1, pendingCount: 1 })).toBe(DeliveryProofStatus.PENDING);
  });

  it('PROBLEMATIC quando ha inconsistencia estrutural, invalido ou cancelamento', () => {
    expect(computeDeliveryProofStatus({ ...base, totalCount: 1, pendingCount: 1, withIssuesCount: 1 })).toBe(DeliveryProofStatus.PROBLEMATIC);
    expect(computeDeliveryProofStatus({ ...base, totalCount: 1, invalidCount: 1 })).toBe(DeliveryProofStatus.PROBLEMATIC);
    expect(computeDeliveryProofStatus({ ...base, totalCount: 1, cancelledCount: 1 })).toBe(DeliveryProofStatus.PROBLEMATIC);
  });

  it('PROBLEMATIC tem prioridade sobre AVAILABLE/PENDING quando misturado', () => {
    expect(computeDeliveryProofStatus({ ...base, totalCount: 2, structurallyValidCount: 1, invalidCount: 1 })).toBe(
      DeliveryProofStatus.PROBLEMATIC,
    );
  });
});

describe('isSafeUnlinkedCandidate', () => {
  const trip = { vehicleId: 'vehicle-1', driverId: 'driver-1', customerId: 'customer-1' };

  it('true quando o veiculo/motorista/cliente do documento bate com o da viagem', () => {
    expect(isSafeUnlinkedCandidate({ vehicleId: 'vehicle-1', driverId: null, customerId: null }, trip)).toBe(true);
    expect(isSafeUnlinkedCandidate({ vehicleId: null, driverId: 'driver-1', customerId: null }, trip)).toBe(true);
    expect(isSafeUnlinkedCandidate({ vehicleId: null, driverId: null, customerId: 'customer-1' }, trip)).toBe(true);
  });

  it('false quando nao ha nenhuma evidencia objetiva em comum (nunca matching agressivo)', () => {
    expect(isSafeUnlinkedCandidate({ vehicleId: 'vehicle-2', driverId: 'driver-2', customerId: 'customer-2' }, trip)).toBe(false);
    expect(isSafeUnlinkedCandidate({ vehicleId: null, driverId: null, customerId: null }, trip)).toBe(false);
  });

  it('false quando a viagem nao tem o campo correspondente preenchido (nunca compara null com null)', () => {
    expect(isSafeUnlinkedCandidate({ vehicleId: null, driverId: null, customerId: null }, { vehicleId: null, driverId: null, customerId: null })).toBe(
      false,
    );
  });
});
