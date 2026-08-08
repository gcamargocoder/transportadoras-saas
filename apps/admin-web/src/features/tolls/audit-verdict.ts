import type { TollAuditVerdict } from '../../types/entities';

// Espelha EXATAMENTE apps/api/src/tolls/utils/toll-calculation.util.ts
// (computeExpectedAmount/computeDiscrepancy/computeAuditVerdict) -- usado
// apenas para a PREVIA client-side no registro de pedagio, antes do submit.
// O backend continua a unica fonte de verdade: o valor final gravado vem
// sempre da resposta real da API, nunca deste calculo.
export const DIVERGENCE_TOLERANCE = 0.01;

export type { TollAuditVerdict };

export const UNVERIFIABLE_MESSAGE =
  'Não foi possível calcular o valor esperado com os dados disponíveis (praça sem tarifa por eixo cadastrada).';

export interface TollAuditPreview {
  expectedAmount: number | null;
  discrepancyAmount: number | null;
  verdict: TollAuditVerdict;
  message: string | null;
}

export function computeTollAuditPreview(
  pricePerAxle: number | null,
  axleCount: number | null,
  chargedAmount: number | null,
): TollAuditPreview {
  if (pricePerAxle === null) {
    return {
      expectedAmount: null,
      discrepancyAmount: null,
      verdict: 'UNVERIFIABLE',
      message: UNVERIFIABLE_MESSAGE,
    };
  }
  if (axleCount === null || chargedAmount === null) {
    return {
      expectedAmount: null,
      discrepancyAmount: null,
      verdict: 'UNVERIFIABLE',
      message: null,
    };
  }

  const expectedAmount = pricePerAxle * axleCount;
  const discrepancyAmount = chargedAmount - expectedAmount;

  if (chargedAmount === 0) {
    return { expectedAmount, discrepancyAmount, verdict: 'CORRECT', message: null };
  }
  if (discrepancyAmount > DIVERGENCE_TOLERANCE) {
    return { expectedAmount, discrepancyAmount, verdict: 'OVERCHARGE', message: null };
  }
  if (discrepancyAmount < -DIVERGENCE_TOLERANCE) {
    return { expectedAmount, discrepancyAmount, verdict: 'UNDERCHARGE', message: null };
  }
  return { expectedAmount, discrepancyAmount, verdict: 'CORRECT', message: null };
}

export const AUDIT_VERDICT_LABELS: Record<TollAuditVerdict, string> = {
  CORRECT: 'Cobrança correta',
  OVERCHARGE: 'Cobrança acima do esperado',
  UNDERCHARGE: 'Cobrança abaixo do esperado',
  UNVERIFIABLE: 'Não foi possível conferir',
};

export const AUDIT_VERDICT_TONE: Record<
  TollAuditVerdict,
  'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand'
> = {
  CORRECT: 'success',
  OVERCHARGE: 'danger',
  UNDERCHARGE: 'warning',
  UNVERIFIABLE: 'neutral',
};
