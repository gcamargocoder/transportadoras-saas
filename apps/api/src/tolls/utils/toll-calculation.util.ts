import { Prisma, TollTransactionStatus } from '@prisma/client';

// Tolerancia para classificar como NORMAL em vez de DIVERGENT -- diferencas
// de centavos por arredondamento nao devem virar divergencia "de verdade".
export const DIVERGENCE_TOLERANCE = 0.01;

// Regras de calculo/classificacao da Fase 14 (Pedagios), extraidas para ca
// para serem reutilizadas sem duplicacao tanto por TollTransactionsService
// (criacao/atualizacao manual via API) quanto por TollImportService
// (criacao em lote via importacao de extrato, Fase 15).
export function computeExpectedAmount(
  pricePerAxle: Prisma.Decimal | null,
  axleCount: number,
): number {
  return pricePerAxle ? Number(pricePerAxle) * axleCount : 0;
}

export function computeDiscrepancy(chargedAmount: number, expectedAmount: number): number {
  return chargedAmount - expectedAmount;
}

export function classifyTollTransaction(
  chargedAmount: number,
  discrepancyAmount: number,
): TollTransactionStatus {
  if (chargedAmount === 0) return TollTransactionStatus.EXEMPT;
  if (Math.abs(discrepancyAmount) > DIVERGENCE_TOLERANCE) return TollTransactionStatus.DIVERGENT;
  return TollTransactionStatus.NORMAL;
}

// ============================================================================
// Motor de conferencia (Fase 22) -- classificacao de auditoria PARA LEITURA,
// calculada sempre a partir do estado ATUAL de TollPlaza.pricePerAxle (nunca
// do expectedAmount/status ja gravados). Isso resolve o problema de falso
// positivo do calculo original: quando a praca nao tinha pricePerAxle
// cadastrado, computeExpectedAmount() retornava 0 e a transacao era gravada
// como DIVERGENT (parecia cobranca indevida, mas na verdade a tarifa
// simplesmente nao era conhecida). Nunca altera TollTransactionStatus (enum
// do banco) nem os valores ja persistidos -- e um campo adicional, aditivo.
export const TOLL_AUDIT_VERDICTS = [
  'CORRECT',
  'OVERCHARGE',
  'UNDERCHARGE',
  'UNVERIFIABLE',
] as const;
export type TollAuditVerdict = (typeof TOLL_AUDIT_VERDICTS)[number];

export const UNVERIFIABLE_MESSAGE =
  'Nao foi possivel calcular o valor esperado com os dados disponiveis (praca sem tarifa por eixo cadastrada).';

export interface TollAuditVerdictResult {
  verdict: TollAuditVerdict;
  message: string | null;
}

// pricePerAxleKnown deve vir do estado ATUAL da praca (tollPlaza.pricePerAxle
// !== null), nunca inferido do expectedAmount gravado (que pode ser 0 tanto
// por isencao real quanto por tarifa desconhecida na epoca do registro).
export function computeAuditVerdict(
  pricePerAxleKnown: boolean,
  chargedAmount: number,
  discrepancyAmount: number,
): TollAuditVerdictResult {
  if (!pricePerAxleKnown) {
    return { verdict: 'UNVERIFIABLE', message: UNVERIFIABLE_MESSAGE };
  }
  if (chargedAmount === 0) {
    return { verdict: 'CORRECT', message: null };
  }
  if (discrepancyAmount > DIVERGENCE_TOLERANCE) {
    return { verdict: 'OVERCHARGE', message: null };
  }
  if (discrepancyAmount < -DIVERGENCE_TOLERANCE) {
    return { verdict: 'UNDERCHARGE', message: null };
  }
  return { verdict: 'CORRECT', message: null };
}
