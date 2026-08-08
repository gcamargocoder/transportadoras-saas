import {
  computeAuditVerdict,
  computeDiscrepancy,
  TOLL_AUDIT_VERDICTS,
  TollAuditVerdict,
  UNVERIFIABLE_MESSAGE,
} from '../../tolls/utils/toll-calculation.util';

// Camada de conciliacao (Fase 23) construida SOBRE o motor de conferencia da
// Fase 22 (computeAuditVerdict) -- os 4 vereditos originais continuam
// significando exatamente o mesmo. NOT_REGISTERED e o unico veredito novo:
// praca esperada pela rota, mas sem nenhum pedagio registrado nesta viagem.
export const TOLL_RECONCILIATION_STOP_VERDICTS = [
  ...TOLL_AUDIT_VERDICTS,
  'NOT_REGISTERED',
] as const;
export type TollReconciliationStopVerdict = TollAuditVerdict | 'NOT_REGISTERED';

export const NOT_REGISTERED_MESSAGE =
  'Praca esperada nesta rota, mas nenhum pedagio foi registrado para esta viagem.';

export const MISSING_AXLE_CONFIG_MESSAGE =
  'Nao foi possivel calcular o valor esperado: a composicao desta viagem nao tem configuracao de eixos cadastrada.';

export interface ReconciliationRouteStopInput {
  sequence: number;
  tollPlazaId: string;
  tollPlazaName: string;
  highway: string | null;
  /** Tarifa ATUAL da praca (TollPlaza.pricePerAxle) -- null quando desconhecida. */
  pricePerAxle: number | null;
}

export interface ReconciliationTransactionInput {
  id: string;
  tollPlazaId: string;
  tollPlazaName: string;
  chargedAmount: number;
  chargedAt: Date;
}

export interface ReconciliationStopResult {
  sequence: number;
  tollPlazaId: string;
  tollPlazaName: string;
  highway: string | null;
  transactionId: string | null;
  axleCount: number | null;
  expectedAmount: number | null;
  chargedAmount: number | null;
  discrepancyAmount: number | null;
  verdict: TollReconciliationStopVerdict;
  message: string | null;
}

export interface ReconciliationUnplannedResult {
  transactionId: string;
  tollPlazaId: string;
  tollPlazaName: string;
  chargedAmount: number;
  chargedAt: Date;
}

export interface TollReconciliationResult {
  stops: ReconciliationStopResult[];
  unplannedTransactions: ReconciliationUnplannedResult[];
  expectedStopsCount: number;
  registeredStopsCount: number;
  reconciledStopsCount: number;
  expectedTotalAmount: number;
  chargedTotalAmount: number;
  divergenceAmount: number;
  unplannedTotalAmount: number;
  conformityPercentage: number;
  isFullyReconciled: boolean;
}

// Funcao pura: recebe as paradas ESPERADAS (rota, ja ordenadas ou nao -- a
// ordem de saida sempre segue "sequence") e os pedagios REGISTRADOS na
// viagem, e devolve o resultado completo da conciliacao. Nao acessa banco
// nem depende de NestJS -- testavel isoladamente (mesmo padrao de
// toll-calculation.util.ts).
export function computeTollReconciliation(
  routeStops: ReconciliationRouteStopInput[],
  transactions: ReconciliationTransactionInput[],
  axleCount: number | null,
): TollReconciliationResult {
  const orderedStops = routeStops.slice().sort((a, b) => a.sequence - b.sequence);

  // Casa cada transacao com a PRIMEIRA parada esperada da mesma praca ainda
  // sem transacao -- se houver mais de uma transacao para a mesma praca
  // (ex: pedagio cobrado duas vezes por engano), a(s) extra(s) vira(m)
  // pedagio nao previsto, nunca sobrescreve a parada ja casada.
  const remainingByPlaza = new Map<string, ReconciliationTransactionInput[]>();
  for (const tx of transactions) {
    const list = remainingByPlaza.get(tx.tollPlazaId) ?? [];
    list.push(tx);
    remainingByPlaza.set(tx.tollPlazaId, list);
  }

  const matchedTransactionIds = new Set<string>();
  const stops: ReconciliationStopResult[] = orderedStops.map((stop) => {
    const candidates = remainingByPlaza.get(stop.tollPlazaId) ?? [];
    const transaction = candidates.shift();

    const canCompute = stop.pricePerAxle !== null && axleCount !== null;
    const expectedAmount = canCompute
      ? (stop.pricePerAxle as number) * (axleCount as number)
      : null;

    if (!transaction) {
      return {
        sequence: stop.sequence,
        tollPlazaId: stop.tollPlazaId,
        tollPlazaName: stop.tollPlazaName,
        highway: stop.highway,
        transactionId: null,
        axleCount,
        expectedAmount,
        chargedAmount: null,
        discrepancyAmount: null,
        verdict: 'NOT_REGISTERED',
        message: NOT_REGISTERED_MESSAGE,
      };
    }

    matchedTransactionIds.add(transaction.id);
    const discrepancyAmount = canCompute
      ? computeDiscrepancy(transaction.chargedAmount, expectedAmount as number)
      : null;

    let verdict: TollReconciliationStopVerdict;
    let message: string | null;
    if (canCompute) {
      const result = computeAuditVerdict(
        true,
        transaction.chargedAmount,
        discrepancyAmount as number,
      );
      verdict = result.verdict;
      message = result.message;
    } else {
      verdict = 'UNVERIFIABLE';
      message = stop.pricePerAxle === null ? UNVERIFIABLE_MESSAGE : MISSING_AXLE_CONFIG_MESSAGE;
    }

    return {
      sequence: stop.sequence,
      tollPlazaId: stop.tollPlazaId,
      tollPlazaName: stop.tollPlazaName,
      highway: stop.highway,
      transactionId: transaction.id,
      axleCount,
      expectedAmount,
      chargedAmount: transaction.chargedAmount,
      discrepancyAmount,
      verdict,
      message,
    };
  });

  const unplannedTransactions: ReconciliationUnplannedResult[] = transactions
    .filter((tx) => !matchedTransactionIds.has(tx.id))
    .map((tx) => ({
      transactionId: tx.id,
      tollPlazaId: tx.tollPlazaId,
      tollPlazaName: tx.tollPlazaName,
      chargedAmount: tx.chargedAmount,
      chargedAt: tx.chargedAt,
    }));

  const expectedTotalAmount = round2(sumOrZero(stops.map((s) => s.expectedAmount)));
  const chargedTotalAmount = round2(sumOrZero(stops.map((s) => s.chargedAmount)));
  const unplannedTotalAmount = round2(sumOrZero(unplannedTransactions.map((u) => u.chargedAmount)));
  const registeredStopsCount = stops.filter((s) => s.transactionId !== null).length;
  const conclusiveStops = stops.filter(
    (s) => s.verdict === 'CORRECT' || s.verdict === 'OVERCHARGE' || s.verdict === 'UNDERCHARGE',
  );
  const correctCount = stops.filter((s) => s.verdict === 'CORRECT').length;

  return {
    stops,
    unplannedTransactions,
    expectedStopsCount: stops.length,
    registeredStopsCount,
    reconciledStopsCount: conclusiveStops.length,
    expectedTotalAmount,
    chargedTotalAmount,
    divergenceAmount: round2(chargedTotalAmount - expectedTotalAmount),
    unplannedTotalAmount,
    conformityPercentage:
      conclusiveStops.length > 0 ? round2((correctCount / conclusiveStops.length) * 100) : 0,
    isFullyReconciled:
      unplannedTransactions.length === 0 && stops.every((s) => s.verdict === 'CORRECT'),
  };
}

function sumOrZero(values: (number | null)[]): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
