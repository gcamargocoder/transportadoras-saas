import {
  computeTollReconciliation,
  MISSING_AXLE_CONFIG_MESSAGE,
  NOT_REGISTERED_MESSAGE,
  ReconciliationRouteStopInput,
  ReconciliationTransactionInput,
} from './toll-reconciliation.util';

const PLAZA_A: ReconciliationRouteStopInput = {
  sequence: 1,
  tollPlazaId: 'plaza-a',
  tollPlazaName: 'Praca A',
  highway: 'SP-310',
  pricePerAxle: 15,
};
const PLAZA_B: ReconciliationRouteStopInput = {
  sequence: 2,
  tollPlazaId: 'plaza-b',
  tollPlazaName: 'Praca B',
  highway: 'SP-310',
  pricePerAxle: 15,
};
const PLAZA_C: ReconciliationRouteStopInput = {
  sequence: 3,
  tollPlazaId: 'plaza-c',
  tollPlazaName: 'Praca C',
  highway: 'SP-310',
  pricePerAxle: 15,
};
const PLAZA_D: ReconciliationRouteStopInput = {
  sequence: 4,
  tollPlazaId: 'plaza-d',
  tollPlazaName: 'Praca D',
  highway: 'SP-310',
  pricePerAxle: 15,
};

function tx(
  overrides: Partial<ReconciliationTransactionInput> & { tollPlazaId: string },
): ReconciliationTransactionInput {
  return {
    id: `tx-${overrides.tollPlazaId}`,
    tollPlazaName: 'Praca',
    chargedAmount: 0,
    chargedAt: new Date('2026-01-01T10:00:00.000Z'),
    ...overrides,
  };
}

describe('toll-reconciliation.util', () => {
  describe('computeTollReconciliation', () => {
    it('cenario: todas as pracas corretas (4 eixos x R$15 = R$60 cada)', () => {
      const stops = [PLAZA_A, PLAZA_B, PLAZA_C, PLAZA_D];
      const transactions = stops.map((s) => tx({ tollPlazaId: s.tollPlazaId, chargedAmount: 60 }));

      const result = computeTollReconciliation(stops, transactions, 4);

      expect(result.stops.every((s) => s.verdict === 'CORRECT')).toBe(true);
      expect(result.expectedStopsCount).toBe(4);
      expect(result.registeredStopsCount).toBe(4);
      expect(result.reconciledStopsCount).toBe(4);
      expect(result.expectedTotalAmount).toBe(240);
      expect(result.chargedTotalAmount).toBe(240);
      expect(result.divergenceAmount).toBe(0);
      expect(result.conformityPercentage).toBe(100);
      expect(result.isFullyReconciled).toBe(true);
    });

    it('cenario: uma praca cobrada acima do esperado (OVERCHARGE)', () => {
      const stops = [PLAZA_A, PLAZA_B];
      const transactions = [
        tx({ tollPlazaId: 'plaza-a', chargedAmount: 60 }),
        tx({ tollPlazaId: 'plaza-b', chargedAmount: 75 }),
      ];

      const result = computeTollReconciliation(stops, transactions, 4);

      expect(result.stops[1]!.verdict).toBe('OVERCHARGE');
      expect(result.stops[1]!.discrepancyAmount).toBe(15);
      expect(result.divergenceAmount).toBe(15);
      expect(result.isFullyReconciled).toBe(false);
    });

    it('cenario: uma praca cobrada abaixo do esperado (UNDERCHARGE)', () => {
      const stops = [PLAZA_A];
      const transactions = [tx({ tollPlazaId: 'plaza-a', chargedAmount: 45 })];

      const result = computeTollReconciliation(stops, transactions, 4);

      expect(result.stops[0]!.verdict).toBe('UNDERCHARGE');
      expect(result.stops[0]!.discrepancyAmount).toBe(-15);
      expect(result.divergenceAmount).toBe(-15);
    });

    it('cenario: praca sem tarifa por eixo cadastrada (UNVERIFIABLE)', () => {
      const stops = [{ ...PLAZA_A, pricePerAxle: null }];
      const transactions = [tx({ tollPlazaId: 'plaza-a', chargedAmount: 60 })];

      const result = computeTollReconciliation(stops, transactions, 4);

      expect(result.stops[0]!.verdict).toBe('UNVERIFIABLE');
      expect(result.stops[0]!.expectedAmount).toBeNull();
      expect(result.stops[0]!.message).toMatch(/nao foi possivel calcular/i);
      expect(result.reconciledStopsCount).toBe(0);
      expect(result.registeredStopsCount).toBe(1);
    });

    it('cenario: viagem sem configuracao de eixos (axleCount null) mesmo com tarifa conhecida -> UNVERIFIABLE', () => {
      const stops = [PLAZA_A];
      const transactions = [tx({ tollPlazaId: 'plaza-a', chargedAmount: 60 })];

      const result = computeTollReconciliation(stops, transactions, null);

      expect(result.stops[0]!.verdict).toBe('UNVERIFIABLE');
      expect(result.stops[0]!.message).toBe(MISSING_AXLE_CONFIG_MESSAGE);
    });

    it('cenario: praca esperada mas sem pedagio registrado (NOT_REGISTERED)', () => {
      const stops = [PLAZA_A, PLAZA_B, PLAZA_C, PLAZA_D];
      const transactions = [
        tx({ tollPlazaId: 'plaza-a', chargedAmount: 60 }),
        tx({ tollPlazaId: 'plaza-b', chargedAmount: 60 }),
        tx({ tollPlazaId: 'plaza-d', chargedAmount: 60 }),
      ];

      const result = computeTollReconciliation(stops, transactions, 4);

      const missing = result.stops.find((s) => s.tollPlazaId === 'plaza-c');
      expect(missing?.verdict).toBe('NOT_REGISTERED');
      expect(missing?.transactionId).toBeNull();
      expect(missing?.chargedAmount).toBeNull();
      expect(missing?.expectedAmount).toBe(60);
      expect(missing?.message).toBe(NOT_REGISTERED_MESSAGE);
      expect(result.registeredStopsCount).toBe(3);
      expect(result.expectedStopsCount).toBe(4);
    });

    it('cenario: pedagio registrado em praca fora da rota (PEDAGIO NAO PREVISTO)', () => {
      const stops = [PLAZA_A, PLAZA_B, PLAZA_C];
      const transactions = [
        tx({ tollPlazaId: 'plaza-a', chargedAmount: 60 }),
        tx({ tollPlazaId: 'plaza-b', chargedAmount: 60 }),
        tx({ tollPlazaId: 'plaza-c', chargedAmount: 60 }),
        tx({ tollPlazaId: 'plaza-x', tollPlazaName: 'Praca X (fora da rota)', chargedAmount: 45 }),
      ];

      const result = computeTollReconciliation(stops, transactions, 4);

      expect(result.unplannedTransactions).toHaveLength(1);
      expect(result.unplannedTransactions[0]!.tollPlazaId).toBe('plaza-x');
      expect(result.unplannedTransactions[0]!.chargedAmount).toBe(45);
      expect(result.unplannedTotalAmount).toBe(45);
      // pedagio nao previsto nao entra na lista de paradas nem na divergencia tradicional
      expect(result.stops.every((s) => s.tollPlazaId !== 'plaza-x')).toBe(true);
      expect(result.chargedTotalAmount).toBe(180);
      expect(result.isFullyReconciled).toBe(false);
    });

    it('cenario: multiplas divergencias combinadas (acima + abaixo + nao registrada + nao prevista)', () => {
      const stops = [PLAZA_A, PLAZA_B, PLAZA_C, PLAZA_D];
      const transactions = [
        tx({ tollPlazaId: 'plaza-a', chargedAmount: 60 }), // CORRECT
        tx({ tollPlazaId: 'plaza-b', chargedAmount: 75 }), // OVERCHARGE +15
        tx({ tollPlazaId: 'plaza-c', chargedAmount: 45 }), // UNDERCHARGE -15
        // plaza-d: NOT_REGISTERED
        tx({ tollPlazaId: 'plaza-x', chargedAmount: 20 }), // nao previsto
      ];

      const result = computeTollReconciliation(stops, transactions, 4);

      expect(result.stops.map((s) => s.verdict)).toEqual([
        'CORRECT',
        'OVERCHARGE',
        'UNDERCHARGE',
        'NOT_REGISTERED',
      ]);
      expect(result.unplannedTransactions).toHaveLength(1);
      // expectedTotalAmount soma as 4 pracas (mesmo a NOT_REGISTERED, que
      // tem "valor esperado potencial" calculavel): 4 x R$60 = R$240.
      expect(result.expectedTotalAmount).toBe(240);
      // chargedTotalAmount soma so as pracas com pedagio registrado (a nao
      // registrada conta como 0 aqui, nao entra o pedagio nao previsto):
      // 60 + 75 + 45 = 180.
      expect(result.chargedTotalAmount).toBe(180);
      expect(result.registeredStopsCount).toBe(3);
      expect(result.reconciledStopsCount).toBe(3);
      expect(result.divergenceAmount).toBe(-60);
    });

    it('cenario: rota sem pracas cadastradas', () => {
      const result = computeTollReconciliation([], [], 4);

      expect(result.stops).toHaveLength(0);
      expect(result.expectedStopsCount).toBe(0);
      expect(result.registeredStopsCount).toBe(0);
      expect(result.conformityPercentage).toBe(0);
      expect(result.divergenceAmount).toBe(0);
    });

    it('ordena as paradas de saida por sequence, independente da ordem de entrada', () => {
      const stops = [PLAZA_C, PLAZA_A, PLAZA_D, PLAZA_B];
      const result = computeTollReconciliation(stops, [], 4);

      expect(result.stops.map((s) => s.tollPlazaId)).toEqual([
        'plaza-a',
        'plaza-b',
        'plaza-c',
        'plaza-d',
      ]);
    });

    it('uma segunda transacao para a mesma praca ja casada vira pedagio nao previsto (nunca sobrescreve a parada)', () => {
      const stops = [PLAZA_A];
      const transactions = [
        tx({
          id: 'tx-1',
          tollPlazaId: 'plaza-a',
          chargedAmount: 60,
          chargedAt: new Date('2026-01-01T08:00:00.000Z'),
        }),
        tx({
          id: 'tx-2',
          tollPlazaId: 'plaza-a',
          chargedAmount: 60,
          chargedAt: new Date('2026-01-01T20:00:00.000Z'),
        }),
      ];

      const result = computeTollReconciliation(stops, transactions, 4);

      expect(result.stops[0]!.transactionId).toBe('tx-1');
      expect(result.unplannedTransactions).toHaveLength(1);
      expect(result.unplannedTransactions[0]!.transactionId).toBe('tx-2');
    });

    it('conformityPercentage nunca e NaN quando nao ha paradas conferiveis', () => {
      const stops = [{ ...PLAZA_A, pricePerAxle: null }];
      const transactions = [tx({ tollPlazaId: 'plaza-a', chargedAmount: 60 })];

      const result = computeTollReconciliation(stops, transactions, 4);

      expect(result.conformityPercentage).toBe(0);
      expect(Number.isNaN(result.conformityPercentage)).toBe(false);
    });
  });
});
