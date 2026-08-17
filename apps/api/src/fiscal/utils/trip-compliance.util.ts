import { FiscalDocumentStatus, FiscalDocumentType } from '@prisma/client';
import { FiscalIssueCode } from './fiscal-document-validation.util';

// Fase 55, secao 4 -- indicador de SITUACAO DOCUMENTAL da viagem, derivado
// EXCLUSIVAMENTE dos documentos ja vinculados a ela (nunca uma lista de
// documentos obrigatorios -- essa regra nao existe no projeto, ver secoes 3/
// 12 de docs/fiscal-documents.md). Isto NUNCA e "conformidade SEFAZ": e uma
// classificacao interna sobre a coerencia/estrutura dos dados que o sistema
// ja possui, nunca autorizacao/autenticidade fiscal.
export enum TripDocumentComplianceStatus {
  OK = 'OK',
  ATTENTION = 'ATTENTION',
  PROBLEMATIC = 'PROBLEMATIC',
  UNAVAILABLE = 'UNAVAILABLE',
}

export interface TripComplianceInput {
  totalDocuments: number;
  invalidCount: number;
  cancelledCount: number;
  pendingCount: number;
  /** true quando 1+ documento da viagem tem FiscalIssueCode.INCONSISTENT_LINK (veiculo/motorista/cliente divergente). */
  hasOperationalDivergence: boolean;
}

// Pura, sem I/O -- todas as contagens ja vem prontas do chamador (Fase 54/
// getTripDocumentStatus), nunca uma query nova.
export function computeTripDocumentComplianceStatus(input: TripComplianceInput): TripDocumentComplianceStatus {
  if (input.totalDocuments === 0) return TripDocumentComplianceStatus.UNAVAILABLE;
  if (input.invalidCount > 0 || input.cancelledCount > 0 || input.hasOperationalDivergence) {
    return TripDocumentComplianceStatus.PROBLEMATIC;
  }
  if (input.pendingCount > 0) return TripDocumentComplianceStatus.ATTENTION;
  return TripDocumentComplianceStatus.OK;
}

export interface TripMatrixDocumentInput {
  documentType: FiscalDocumentType;
  status: FiscalDocumentStatus;
  validationIssues: FiscalIssueCode[];
}

export interface TripDocumentMatrixRow {
  documentType: FiscalDocumentType;
  totalCount: number;
  present: boolean;
  structurallyValidCount: number;
  pendingCount: number;
  invalidCount: number;
  cancelledCount: number;
  problematicCount: number;
  duplicateCandidateCount: number;
  /** Documentos com 1+ inconsistencia estrutural, INDEPENDENTE do status (distinto de problematicCount, que tambem conta PENDING sem nenhum problema). */
  withIssuesCount: number;
  /** Sempre 0 aqui (funcao pura, sem acesso a outros documentos) -- o chamador (service) sobrescreve com o valor real. */
  unlinkedRelatedCount: number;
  /** Fase 58 -- documentos deste tipo com 1+ relacionamento manifesto (MDF-e <-> CT-e/NF-e, via chNFe/chCTe). Sempre 0 aqui -- o chamador sobrescreve com buildRelatedDocumentIdSet. */
  relatedCount: number;
}

// Fase 55, secao 1 -- 1 linha por tipo do catalogo inteiro (FiscalDocumentType),
// mesmo quando totalCount=0 -- "ausente" nunca vira erro aqui, so um valor
// zerado (ver comentario em TripDocumentStatusEntity sobre absentTypes).
export function buildTripDocumentMatrix(documents: TripMatrixDocumentInput[]): TripDocumentMatrixRow[] {
  return Object.values(FiscalDocumentType).map((documentType) => {
    const rows = documents.filter((d) => d.documentType === documentType);
    return {
      documentType,
      totalCount: rows.length,
      present: rows.length > 0,
      structurallyValidCount: rows.filter((d) => d.status === FiscalDocumentStatus.VALID && d.validationIssues.length === 0).length,
      pendingCount: rows.filter((d) => d.status === FiscalDocumentStatus.PENDING).length,
      invalidCount: rows.filter((d) => d.status === FiscalDocumentStatus.INVALID).length,
      cancelledCount: rows.filter((d) => d.status === FiscalDocumentStatus.CANCELLED).length,
      problematicCount: rows.filter(
        (d) => d.status === FiscalDocumentStatus.PENDING || d.status === FiscalDocumentStatus.INVALID || d.validationIssues.length > 0,
      ).length,
      duplicateCandidateCount: rows.filter((d) => d.validationIssues.includes(FiscalIssueCode.DUPLICATE_CANDIDATE)).length,
      withIssuesCount: rows.filter((d) => d.validationIssues.length > 0).length,
      unlinkedRelatedCount: 0,
      relatedCount: 0,
    };
  });
}

// Fase 56, secao 3 -- status do comprovante de entrega, SEMPRE derivado da
// mesma linha da matriz documental (TripDocumentMatrixRow, ja calculada,
// zero I/O extra) -- nunca uma maquina de estados nova. "Arquivo existente"
// nunca e tratado como prova de entrega valida por si so: um comprovante
// PENDING (upload sem revisao) fica em PENDING, nunca AVAILABLE.
export enum DeliveryProofStatus {
  /** Nenhum FiscalDocument DELIVERY_PROOF vinculado a esta viagem. */
  MISSING = 'MISSING',
  /** 1+ comprovante presente, ainda PENDING (nao revisado) e sem nenhum problema estrutural. */
  PENDING = 'PENDING',
  /** 1+ comprovante com status VALID e sem nenhuma inconsistencia estrutural. */
  AVAILABLE = 'AVAILABLE',
  /** 1+ comprovante INVALID/CANCELLED ou com inconsistencia estrutural (chave/campos/duplicidade/vinculo). */
  PROBLEMATIC = 'PROBLEMATIC',
}

export function computeDeliveryProofStatus(
  deliveryProofRow:
    | Pick<TripDocumentMatrixRow, 'totalCount' | 'structurallyValidCount' | 'pendingCount' | 'invalidCount' | 'cancelledCount' | 'withIssuesCount'>
    | undefined,
): DeliveryProofStatus {
  if (!deliveryProofRow || deliveryProofRow.totalCount === 0) return DeliveryProofStatus.MISSING;
  // Nunca usa problematicCount aqui: aquele campo (Fase 54) tambem conta
  // PENDING sem nenhum problema, o que tornaria PENDING inatingivel (todo
  // comprovante recem-enviado comeca PENDING). withIssuesCount e
  // invalidCount/cancelledCount sao independentes do status "so aguardando
  // revisao".
  if (deliveryProofRow.invalidCount > 0 || deliveryProofRow.cancelledCount > 0 || deliveryProofRow.withIssuesCount > 0) {
    return DeliveryProofStatus.PROBLEMATIC;
  }
  if (deliveryProofRow.structurallyValidCount > 0) return DeliveryProofStatus.AVAILABLE;
  if (deliveryProofRow.pendingCount > 0) return DeliveryProofStatus.PENDING;
  // Nunca deveria chegar aqui com totalCount > 0 (todo documento cai em uma
  // das categorias acima) -- PROBLEMATIC e o fallback mais seguro (nunca
  // afirmar "disponivel" sobre um estado nao reconhecido).
  return DeliveryProofStatus.PROBLEMATIC;
}

export interface TripContextForMatching {
  vehicleId: string | null;
  driverId: string | null;
  customerId: string | null;
}

export interface UnlinkedDocumentForMatching {
  vehicleId: string | null;
  driverId: string | null;
  customerId: string | null;
}

// Fase 55, secao 7 -- so considera candidato a vinculo quando ha evidencia
// OBJETIVA ja gravada no documento (mesmo veiculo/motorista/cliente da
// viagem) -- nunca matching por proximidade de data/nome/heuristica. Espelha
// exatamente o filtro Prisma usado por FiscalDocumentsService (OR dos 3
// campos), mantido aqui como funcao pura para ser testada isoladamente.
export function isSafeUnlinkedCandidate(document: UnlinkedDocumentForMatching, trip: TripContextForMatching): boolean {
  if (document.vehicleId && trip.vehicleId && document.vehicleId === trip.vehicleId) return true;
  if (document.driverId && trip.driverId && document.driverId === trip.driverId) return true;
  if (document.customerId && trip.customerId && document.customerId === trip.customerId) return true;
  return false;
}
