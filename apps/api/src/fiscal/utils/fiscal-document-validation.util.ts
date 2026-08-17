import { FiscalDocumentSource, FiscalDocumentType } from '@prisma/client';
import { getAccessKeyModelCode, getExpectedAccessKeyModelCode, isAccessKeyCheckDigitValid } from './access-key.util';

// Fase 54, secao 1 -- camada PURA e reutilizavel de validacao ESTRUTURAL
// (nunca fiscal/SEFAZ): consistencia interna dos dados ja extraidos/
// informados de um FiscalDocument. Reaproveitada tanto na listagem/detalhe
// quanto no dashboard e no status documental da viagem -- nunca duplicada
// em cada chamador. NUNCA consulta rede/SEFAZ, NUNCA afirma autorizacao
// fiscal -- so aponta inconsistencias objetivas e verificaveis nos dados
// que o sistema ja possui.
export enum FiscalIssueCode {
  INVALID_ACCESS_KEY = 'INVALID_ACCESS_KEY',
  TYPE_MISMATCH = 'TYPE_MISMATCH',
  ESSENTIAL_FIELDS_MISSING = 'ESSENTIAL_FIELDS_MISSING',
  INCONSISTENT_DATE = 'INCONSISTENT_DATE',
  DUPLICATE_CANDIDATE = 'DUPLICATE_CANDIDATE',
  INCONSISTENT_LINK = 'INCONSISTENT_LINK',
  NO_TRIP_CONTEXT = 'NO_TRIP_CONTEXT',
}

const RECOGNIZED_XML_TYPES = new Set<FiscalDocumentType>([FiscalDocumentType.NFE, FiscalDocumentType.CTE, FiscalDocumentType.MDFE]);
const TYPES_REQUIRING_RECIPIENT = new Set<FiscalDocumentType>([FiscalDocumentType.NFE, FiscalDocumentType.CTE]);

export interface FiscalDocumentIssueInput {
  documentType: FiscalDocumentType;
  source: FiscalDocumentSource;
  accessKey: string | null;
  documentNumber: string | null;
  series: string | null;
  issueDate: Date | null;
  senderName: string | null;
  senderDocument: string | null;
  recipientName: string | null;
  recipientDocument: string | null;
  tripId: string | null;
  vehicleId: string | null;
  driverId: string | null;
  customerId: string | null;
  // Contexto RELACIONAL pre-calculado em lote pelo chamador (groupBy/join ja
  // feitos fora desta funcao) -- esta funcao permanece pura, nunca faz query.
  /** true quando existe >=1 outro documento do mesmo tenant com o mesmo (documentType, documentNumber, series). */
  hasDuplicateCandidate?: boolean;
  /** vehicleId real da composicao da viagem vinculada (via Trip.composition.vehicleId), quando tripId setado. */
  tripVehicleId?: string | null;
  /** driverId real da viagem vinculada (Trip.driverId), quando tripId setado. */
  tripDriverId?: string | null;
  /** customerId real da viagem vinculada (Trip.customerId), quando tripId setado -- Fase 55. */
  tripCustomerId?: string | null;
}

/// Checagem TOLERANTE (mesmo espirito do parser de XML): so aponta um
/// arquivo obviamente corrompido/truncado (tags desbalanceadas) -- nunca
/// rejeita XML valido com CDATA/comentarios/namespaces por excesso de rigor.
export function isWellFormedXml(xml: string): boolean {
  const trimmed = xml.trim();
  if (!trimmed.startsWith('<')) return false;
  const opens = (trimmed.match(/</g) ?? []).length;
  const closes = (trimmed.match(/>/g) ?? []).length;
  return opens > 0 && opens === closes;
}

export function classifyFiscalDocumentIssues(doc: FiscalDocumentIssueInput): FiscalIssueCode[] {
  const issues: FiscalIssueCode[] = [];

  // Fase 57 -- a chave de acesso (44 digitos, DV mod-11) so existe como
  // conceito para NF-e/CT-e/MDF-e (RECOGNIZED_XML_TYPES). CIOT/DACTE/DAMDFE/
  // DELIVERY_PROOF/OTHER nao tem esse formato -- avaliar um valor digitado
  // ali com o algoritmo de NF-e geraria falso positivo (INVALID_ACCESS_KEY
  // sobre um dado que nunca foi uma chave de acesso). Nunca aplicado fora
  // dos 3 tipos reconhecidos.
  if (doc.accessKey && RECOGNIZED_XML_TYPES.has(doc.documentType)) {
    const validKey = isAccessKeyCheckDigitValid(doc.accessKey);
    if (!validKey) {
      issues.push(FiscalIssueCode.INVALID_ACCESS_KEY);
    } else {
      const modelCode = getAccessKeyModelCode(doc.accessKey);
      const expected = getExpectedAccessKeyModelCode(doc.documentType as 'NFE' | 'CTE' | 'MDFE');
      if (modelCode !== expected) issues.push(FiscalIssueCode.TYPE_MISMATCH);
    }
  }

  // Campos essenciais so sao EXIGIDOS para documentos extraidos de XML (o
  // parser sempre tenta preenche-los para NF-e/CT-e/MDF-e) -- upload manual
  // (CIOT/DELIVERY_PROOF/OTHER/etc.) nunca tem esses campos como obrigatorios,
  // nao existe regra de negocio definida para isso (secao 2 do pedido).
  if (doc.source === FiscalDocumentSource.XML_IMPORT) {
    const missingCore = !doc.documentNumber || !doc.series || !doc.issueDate;
    const missingSender = !doc.senderName || !doc.senderDocument;
    const requiresRecipient = TYPES_REQUIRING_RECIPIENT.has(doc.documentType);
    const missingRecipient = requiresRecipient && (!doc.recipientName || !doc.recipientDocument);
    if (missingCore || missingSender || missingRecipient) {
      issues.push(FiscalIssueCode.ESSENTIAL_FIELDS_MISSING);
    }
  }

  if (doc.issueDate && doc.issueDate.getTime() > Date.now()) {
    issues.push(FiscalIssueCode.INCONSISTENT_DATE);
  }

  if (doc.hasDuplicateCandidate) {
    issues.push(FiscalIssueCode.DUPLICATE_CANDIDATE);
  }

  if (doc.tripId) {
    const vehicleMismatch = doc.vehicleId && doc.tripVehicleId !== undefined && doc.tripVehicleId !== null && doc.tripVehicleId !== doc.vehicleId;
    const driverMismatch = doc.driverId && doc.tripDriverId !== undefined && doc.tripDriverId !== null && doc.tripDriverId !== doc.driverId;
    // Fase 55 -- mesmo principio do veiculo/motorista: so compara quando o
    // documento tem customerId E sabemos o customerId real da viagem
    // (tripCustomerId !== undefined) -- nunca acusa divergencia por falta de
    // dado (viagem sem cliente informado nunca vira "inconsistente").
    const customerMismatch = doc.customerId && doc.tripCustomerId !== undefined && doc.tripCustomerId !== null && doc.tripCustomerId !== doc.customerId;
    if (vehicleMismatch || driverMismatch || customerMismatch) {
      issues.push(FiscalIssueCode.INCONSISTENT_LINK);
    }
  } else if (doc.vehicleId || doc.driverId || doc.customerId) {
    // Ha contexto operacional (veiculo/motorista/cliente) mas nenhuma
    // viagem vinculada -- distinto de um documento totalmente sem vinculo
    // (esse caso ja e coberto por unlinkedCount/unlinkedOnly, Fase 53).
    issues.push(FiscalIssueCode.NO_TRIP_CONTEXT);
  }

  return issues;
}
