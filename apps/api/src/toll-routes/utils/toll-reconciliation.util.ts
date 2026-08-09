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

// Status geral da conciliacao (Fase 24) -- classificacao unica por viagem,
// derivada exclusivamente dos contadores ja calculados por
// computeTollReconciliation() (nunca um limiar financeiro arbitrario).
export const RECONCILIATION_STATUSES = [
  'PENDING',
  'CONFORM',
  'ATTENTION',
  'CRITICAL',
  'UNVERIFIABLE',
] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

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
  /** Quantidade de eixos efetivamente registrada nesta passagem (Fase 25) --
   *  usada no calculo do expectedAmount desta parada em vez do padrao da
   *  composicao, quando a transacao existe. */
  axleCount: number;
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
  /** Quantidade de paradas com veredito CORRECT. */
  correctCount: number;
  /** Quantidade de paradas com veredito OVERCHARGE. */
  overchargeCount: number;
  /** Quantidade de paradas com veredito UNDERCHARGE. */
  underchargeCount: number;
  /** Quantidade de paradas com veredito NOT_REGISTERED. */
  notRegisteredCount: number;
  /** Quantidade de paradas com veredito UNVERIFIABLE. */
  unverifiableCount: number;
  /** Quantidade de pedagios registrados fora da rota (= unplannedTransactions.length). */
  unplannedCount: number;
  expectedTotalAmount: number;
  chargedTotalAmount: number;
  divergenceAmount: number;
  unplannedTotalAmount: number;
  conformityPercentage: number;
  isFullyReconciled: boolean;
  /** Classificacao geral da conciliacao (Fase 24) -- ver computeReconciliationStatus(). */
  status: ReconciliationStatus;
}

// Funcao pura: recebe as paradas ESPERADAS (rota, ja ordenadas ou nao -- a
// ordem de saida sempre segue "sequence") e os pedagios REGISTRADOS na
// viagem, e devolve o resultado completo da conciliacao. Nao acessa banco
// nem depende de NestJS -- testavel isoladamente (mesmo padrao de
// toll-calculation.util.ts).
export function computeTollReconciliation(
  routeStops: ReconciliationRouteStopInput[],
  transactions: ReconciliationTransactionInput[],
  defaultAxleCount: number | null,
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

    // Quando ja existe uma transacao casada, o eixo REALMENTE tarifado
    // naquela passagem (TollTransaction.axleCount) e o que vale para o
    // calculo do expectedAmount -- pode divergir do padrao da composicao por
    // causa de uma excecao de eixo (AxleEvent, Fase 25). So cai no padrao da
    // composicao quando nao ha transacao (NOT_REGISTERED), unico caso em que
    // so resta estimar.
    const stopAxleCount = transaction ? transaction.axleCount : defaultAxleCount;
    const canCompute = stop.pricePerAxle !== null && stopAxleCount !== null;
    const expectedAmount = canCompute
      ? (stop.pricePerAxle as number) * (stopAxleCount as number)
      : null;

    if (!transaction) {
      // Sem transacao, o fato mais importante e "nao registrado" -- mas
      // quando alem disso nao ha como nem estimar o valor esperado (eixo
      // padrao da composicao desconhecido), reaproveita a mesma mensagem de
      // configuracao ausente usada no caso de transacao sem tarifa conhecida.
      const message =
        !canCompute && stop.pricePerAxle !== null ? MISSING_AXLE_CONFIG_MESSAGE : NOT_REGISTERED_MESSAGE;
      return {
        sequence: stop.sequence,
        tollPlazaId: stop.tollPlazaId,
        tollPlazaName: stop.tollPlazaName,
        highway: stop.highway,
        transactionId: null,
        axleCount: stopAxleCount,
        expectedAmount,
        chargedAmount: null,
        discrepancyAmount: null,
        verdict: 'NOT_REGISTERED',
        message,
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
      axleCount: stopAxleCount,
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
  const overchargeCount = stops.filter((s) => s.verdict === 'OVERCHARGE').length;
  const underchargeCount = stops.filter((s) => s.verdict === 'UNDERCHARGE').length;
  const notRegisteredCount = stops.filter((s) => s.verdict === 'NOT_REGISTERED').length;
  const unverifiableCount = stops.filter((s) => s.verdict === 'UNVERIFIABLE').length;
  const isFullyReconciled =
    unplannedTransactions.length === 0 && stops.every((s) => s.verdict === 'CORRECT');

  const result: TollReconciliationResult = {
    stops,
    unplannedTransactions,
    expectedStopsCount: stops.length,
    registeredStopsCount,
    reconciledStopsCount: conclusiveStops.length,
    correctCount,
    overchargeCount,
    underchargeCount,
    notRegisteredCount,
    unverifiableCount,
    unplannedCount: unplannedTransactions.length,
    expectedTotalAmount,
    chargedTotalAmount,
    divergenceAmount: round2(chargedTotalAmount - expectedTotalAmount),
    unplannedTotalAmount,
    conformityPercentage:
      conclusiveStops.length > 0 ? round2((correctCount / conclusiveStops.length) * 100) : 0,
    isFullyReconciled,
    status: 'PENDING', // sobrescrito abaixo -- precisa do restante do resultado ja calculado.
  };
  result.status = computeReconciliationStatus(result);
  return result;
}

// Status geral da conciliacao (Fase 24) -- funcao pura, determinada
// exclusivamente pelos contadores ja calculados por computeTollReconciliation
// (nunca por um limiar financeiro inventado). Regras, nesta ordem:
//
// 1. PENDING: ainda nao ha nada para conferir -- ou a rota nao tem paradas
//    cadastradas, ou nenhum pedagio (esperado ou nao previsto) foi
//    registrado ainda nesta viagem.
// 2. CONFORM: isFullyReconciled -- todas as paradas CORRECT e nenhum
//    pedagio nao previsto (mesma regra ja usada pelo campo isFullyReconciled
//    desde a Fase 23, aqui apenas rotulada).
// 3. UNVERIFIABLE: ha pedagios registrados, mas nenhuma parada pode ser
//    confirmada com os dados disponiveis (tarifa ou eixos desconhecidos em
//    todas elas) e nao ha nenhuma divergencia financeira ja confirmada.
// 4. CRITICAL: existe pelo menos uma divergencia financeira real
//    (OVERCHARGE/UNDERCHARGE) OU dois ou mais problemas de presenca (praca
//    nao registrada + pedagio nao previsto, somados).
// 5. ATTENTION: sobra -- existe exatamente um problema de presenca (uma
//    praca nao registrada OU um pedagio nao previsto), sem divergencia
//    financeira confirmada.
export function computeReconciliationStatus(
  result: Pick<
    TollReconciliationResult,
    | 'expectedStopsCount'
    | 'registeredStopsCount'
    | 'reconciledStopsCount'
    | 'overchargeCount'
    | 'underchargeCount'
    | 'notRegisteredCount'
    | 'unverifiableCount'
    | 'unplannedCount'
    | 'isFullyReconciled'
  >,
): ReconciliationStatus {
  if (result.expectedStopsCount === 0 && result.unplannedCount === 0) {
    return 'PENDING';
  }
  if (result.registeredStopsCount === 0 && result.unplannedCount === 0) {
    return 'PENDING';
  }
  if (result.isFullyReconciled) {
    return 'CONFORM';
  }

  const financialDivergenceCount = result.overchargeCount + result.underchargeCount;
  const presenceGapCount = result.notRegisteredCount + result.unplannedCount;

  // reconciledStopsCount = 0 com unverifiableCount > 0 significa: existem
  // paradas registradas, mas NENHUMA delas pode ser confirmada (tarifa ou
  // eixos desconhecidos) -- distinto do caso "nada foi registrado ainda"
  // (ja tratado como PENDING acima) e do caso "so ha pedagio nao previsto,
  // nenhuma parada esperada bateu" (cai em CRITICAL abaixo, via presenceGapCount).
  if (result.reconciledStopsCount === 0 && result.unverifiableCount > 0) {
    return 'UNVERIFIABLE';
  }
  if (financialDivergenceCount > 0 || presenceGapCount >= 2) {
    return 'CRITICAL';
  }
  return 'ATTENTION';
}

function sumOrZero(values: (number | null)[]): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
