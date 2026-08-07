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
