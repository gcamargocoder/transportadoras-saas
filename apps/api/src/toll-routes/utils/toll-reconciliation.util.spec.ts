import {
  computeReconciliationStatus,
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
    // Por padrao replica o mesmo axleCount usado nos cenarios existentes
    // (composicao com 4 eixos, sem excecao) -- testes que exercitam excecao
    // de eixo (Fase 25) sobrescrevem explicitamente.
    axleCount: 4,
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
      expect(result.correctCount).toBe(4);
      expect(result.status).toBe('CONFORM');
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
      expect(result.overchargeCount).toBe(1);
      expect(result.status).toBe('CRITICAL');
    });

    it('cenario: uma praca cobrada abaixo do esperado (UNDERCHARGE)', () => {
      const stops = [PLAZA_A];
      const transactions = [tx({ tollPlazaId: 'plaza-a', chargedAmount: 45 })];

      const result = computeTollReconciliation(stops, transactions, 4);

      expect(result.stops[0]!.verdict).toBe('UNDERCHARGE');
      expect(result.stops[0]!.discrepancyAmount).toBe(-15);
      expect(result.divergenceAmount).toBe(-15);
      expect(result.underchargeCount).toBe(1);
      expect(result.status).toBe('CRITICAL');
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
      expect(result.unverifiableCount).toBe(1);
      expect(result.status).toBe('UNVERIFIABLE');
    });

    // Fase 25: uma TollTransaction ja casada sempre carrega seu proprio
    // axleCount (campo obrigatorio) -- o padrao da composicao (defaultAxleCount)
    // so e necessario para ESTIMAR paradas sem transacao (NOT_REGISTERED).
    it('cenario: viagem sem configuracao de eixos (defaultAxleCount null) e praca sem pedagio registrado -> NOT_REGISTERED, sem conseguir estimar', () => {
      const stops = [PLAZA_A];

      const result = computeTollReconciliation(stops, [], null);

      expect(result.stops[0]!.verdict).toBe('NOT_REGISTERED');
      expect(result.stops[0]!.expectedAmount).toBeNull();
      expect(result.stops[0]!.message).toBe(MISSING_AXLE_CONFIG_MESSAGE);
    });

    it('cenario: defaultAxleCount null nao afeta parada com transacao ja registrada (axleCount vem da propria transacao)', () => {
      const stops = [PLAZA_A];
      const transactions = [tx({ tollPlazaId: 'plaza-a', chargedAmount: 60, axleCount: 4 })];

      const result = computeTollReconciliation(stops, transactions, null);

      expect(result.stops[0]!.verdict).toBe('CORRECT');
      expect(result.stops[0]!.axleCount).toBe(4);
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
      expect(result.notRegisteredCount).toBe(1);
      expect(result.status).toBe('ATTENTION');
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
      expect(result.unplannedCount).toBe(1);
      expect(result.status).toBe('ATTENTION');
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
      // ha divergencia financeira (over + under) -- CRITICAL prevalece sobre
      // o NOT_REGISTERED isolado, mesmo com apenas 1 problema de presenca.
      expect(result.status).toBe('CRITICAL');
    });

    it('cenario: rota sem pracas cadastradas', () => {
      const result = computeTollReconciliation([], [], 4);

      expect(result.stops).toHaveLength(0);
      expect(result.expectedStopsCount).toBe(0);
      expect(result.registeredStopsCount).toBe(0);
      expect(result.conformityPercentage).toBe(0);
      expect(result.divergenceAmount).toBe(0);
      expect(result.status).toBe('PENDING');
    });

    it('cenario: rota com pracas cadastradas mas nenhum pedagio registrado ainda (PENDING)', () => {
      const stops = [PLAZA_A, PLAZA_B];
      const result = computeTollReconciliation(stops, [], 4);

      expect(result.registeredStopsCount).toBe(0);
      expect(result.stops.every((s) => s.verdict === 'NOT_REGISTERED')).toBe(true);
      expect(result.status).toBe('PENDING');
    });

    it('cenario: multiplos problemas de presenca sem divergencia financeira (CRITICAL)', () => {
      const stops = [PLAZA_A, PLAZA_B];
      const transactions = [
        tx({ tollPlazaId: 'plaza-a', chargedAmount: 60 }), // CORRECT
        // plaza-b: NOT_REGISTERED
        tx({ tollPlazaId: 'plaza-x', chargedAmount: 20 }), // nao previsto
      ];

      const result = computeTollReconciliation(stops, transactions, 4);

      expect(result.notRegisteredCount).toBe(1);
      expect(result.unplannedCount).toBe(1);
      expect(result.overchargeCount + result.underchargeCount).toBe(0);
      expect(result.status).toBe('CRITICAL');
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

    // Fase 25 -- excecao de eixo: a passagem com axleCount proprio (registrado
    // na TollTransaction) deve prevalecer sobre o padrao da composicao no
    // calculo do expectedAmount daquela parada especifica.
    it('cenario 20: usa o axleCount da transacao (7) quando houve excecao registrada naquela praca', () => {
      const stops = [PLAZA_A];
      // Composicao padrao tem 9 eixos, mas esta transacao foi registrada com
      // 7 (motorista levantou 2 eixos na praca) -- pricePerAxle 15 * 7 = 105.
      const transactions = [tx({ tollPlazaId: 'plaza-a', chargedAmount: 105, axleCount: 7 })];

      const result = computeTollReconciliation(stops, transactions, 9);

      expect(result.stops[0]!.axleCount).toBe(7);
      expect(result.stops[0]!.expectedAmount).toBe(105);
      expect(result.stops[0]!.verdict).toBe('CORRECT');
    });

    it('cenario 21: usa o padrao da composicao (9) quando nao houve excecao (transacao sem eixo alterado)', () => {
      const stops = [PLAZA_A];
      const transactions = [tx({ tollPlazaId: 'plaza-a', chargedAmount: 135, axleCount: 9 })];

      const result = computeTollReconciliation(stops, transactions, 9);

      expect(result.stops[0]!.axleCount).toBe(9);
      expect(result.stops[0]!.expectedAmount).toBe(135);
      expect(result.stops[0]!.verdict).toBe('CORRECT');
    });

    it('praca NOT_REGISTERED continua estimando pelo padrao da composicao (nenhuma transacao para saber o eixo real)', () => {
      const stops = [PLAZA_A];
      const result = computeTollReconciliation(stops, [], 9);

      expect(result.stops[0]!.verdict).toBe('NOT_REGISTERED');
      expect(result.stops[0]!.axleCount).toBe(9);
      expect(result.stops[0]!.expectedAmount).toBe(135);
    });

    it('conformityPercentage nunca e NaN quando nao ha paradas conferiveis', () => {
      const stops = [{ ...PLAZA_A, pricePerAxle: null }];
      const transactions = [tx({ tollPlazaId: 'plaza-a', chargedAmount: 60 })];

      const result = computeTollReconciliation(stops, transactions, 4);

      expect(result.conformityPercentage).toBe(0);
      expect(Number.isNaN(result.conformityPercentage)).toBe(false);
    });
  });

  // Fase 36 -- prioridade da tarifa oficial (TollRate, via
  // officialTariffsByAxleCategory) sobre o fallback pricePerAxle x eixos.
  // Alteracao aditiva ao MESMO computeTollReconciliation() -- nenhum motor
  // paralelo.
  describe('computeTollReconciliation -- prioridade de tarifa oficial (Fase 36)', () => {
    it('teste fundamental: tarifa oficial (R$130) prevalece sobre o fallback pricePerAxle x eixos (R$45)', () => {
      const stop: ReconciliationRouteStopInput = {
        ...PLAZA_A,
        pricePerAxle: 5, // fallback daria 5 * 9 = 45.
        officialTariffsByAxleCategory: { '9 eixos': 130 },
      };
      const transactions = [tx({ tollPlazaId: 'plaza-a', chargedAmount: 130, axleCount: 9 })];

      const result = computeTollReconciliation([stop], transactions, 9);

      expect(result.stops[0]!.expectedAmount).toBe(130);
      expect(result.stops[0]!.expectedAmount).not.toBe(45);
      expect(result.stops[0]!.verdict).toBe('CORRECT');
    });

    it('fallback pricePerAxle x eixos continua funcionando quando NAO existe tarifa oficial aplicavel', () => {
      const stop: ReconciliationRouteStopInput = { ...PLAZA_A, pricePerAxle: 15, officialTariffsByAxleCategory: {} };
      const transactions = [tx({ tollPlazaId: 'plaza-a', chargedAmount: 60, axleCount: 4 })];

      const result = computeTollReconciliation([stop], transactions, 4);

      expect(result.stops[0]!.expectedAmount).toBe(60); // 15 * 4, formula preservada.
      expect(result.stops[0]!.verdict).toBe('CORRECT');
    });

    it('valor previsto nunca vira zero quando ha tarifa oficial de R$0,00 informada explicitamente', () => {
      // Cenario de guarda: mesmo um valor oficial de fronteira (0) e usado
      // como veio da fonte -- nunca convertido para "sem tarifa" (isso e
      // representado por AUSENCIA da chave, nao pelo valor 0).
      const stop: ReconciliationRouteStopInput = {
        ...PLAZA_A,
        pricePerAxle: 15,
        officialTariffsByAxleCategory: { '4 eixos': 0 },
      };
      const transactions = [tx({ tollPlazaId: 'plaza-a', chargedAmount: 0, axleCount: 4 })];

      const result = computeTollReconciliation([stop], transactions, 4);

      expect(result.stops[0]!.expectedAmount).toBe(0);
    });

    it('valor realizado continua vindo exclusivamente de TollTransaction.chargedAmount, nunca da tarifa oficial', () => {
      const stop: ReconciliationRouteStopInput = { ...PLAZA_A, pricePerAxle: 5, officialTariffsByAxleCategory: { '9 eixos': 130 } };
      const transactions = [tx({ tollPlazaId: 'plaza-a', chargedAmount: 150, axleCount: 9 })]; // motorista pagou diferente do previsto.

      const result = computeTollReconciliation([stop], transactions, 9);

      expect(result.stops[0]!.expectedAmount).toBe(130); // previsto = tarifa oficial.
      expect(result.stops[0]!.chargedAmount).toBe(150); // realizado = o que a transacao registrou.
      expect(result.stops[0]!.verdict).toBe('OVERCHARGE');
    });

    it('9 eixos (planejamento) usa a tarifa oficial de 9 eixos quando ainda nao ha transacao (NOT_REGISTERED)', () => {
      const stop: ReconciliationRouteStopInput = {
        ...PLAZA_A,
        pricePerAxle: 5,
        officialTariffsByAxleCategory: { '9 eixos': 130, '7 eixos': 105 },
      };
      const result = computeTollReconciliation([stop], [], 9);
      expect(result.stops[0]!.expectedAmount).toBe(130);
      expect(result.stops[0]!.verdict).toBe('NOT_REGISTERED');
    });

    it('7 eixos (excecao real na transacao) usa a tarifa oficial de 7 eixos, mesmo com planejamento de 9', () => {
      const stop: ReconciliationRouteStopInput = {
        ...PLAZA_A,
        pricePerAxle: 5,
        officialTariffsByAxleCategory: { '9 eixos': 130, '7 eixos': 105 },
      };
      const transactions = [tx({ tollPlazaId: 'plaza-a', chargedAmount: 105, axleCount: 7 })];

      const result = computeTollReconciliation([stop], transactions, 9);

      expect(result.stops[0]!.axleCount).toBe(7);
      expect(result.stops[0]!.expectedAmount).toBe(105);
      expect(result.stops[0]!.verdict).toBe('CORRECT');
    });

    it('diferenca entre tarifa prevista (oficial) e realizada e refletida em discrepancyAmount', () => {
      const stop: ReconciliationRouteStopInput = { ...PLAZA_A, pricePerAxle: 5, officialTariffsByAxleCategory: { '9 eixos': 130 } };
      const transactions = [tx({ tollPlazaId: 'plaza-a', chargedAmount: 140, axleCount: 9 })];

      const result = computeTollReconciliation([stop], transactions, 9);

      expect(result.stops[0]!.discrepancyAmount).toBe(10);
      expect(result.stops[0]!.verdict).toBe('OVERCHARGE');
    });

    it('RoutePlanToll/tarifa oficial ausente (officialTariffsByAxleCategory undefined) preserva o comportamento anterior a Fase 36', () => {
      const stop: ReconciliationRouteStopInput = { ...PLAZA_A, pricePerAxle: 15 }; // sem o campo novo.
      const transactions = [tx({ tollPlazaId: 'plaza-a', chargedAmount: 60, axleCount: 4 })];

      const result = computeTollReconciliation([stop], transactions, 4);

      expect(result.stops[0]!.expectedAmount).toBe(60); // formula, exatamente como antes da Fase 36.
    });

    it('tarifa oficial para uma categoria de eixos DIFERENTE da parada nao e usada por engano (sem entrada = cai no fallback)', () => {
      const stop: ReconciliationRouteStopInput = {
        ...PLAZA_A,
        pricePerAxle: 15,
        officialTariffsByAxleCategory: { '9 eixos': 130 }, // so tem 9 eixos cadastrada.
      };
      const transactions = [tx({ tollPlazaId: 'plaza-a', chargedAmount: 60, axleCount: 4 })]; // parada real e 4 eixos.

      const result = computeTollReconciliation([stop], transactions, 9);

      expect(result.stops[0]!.expectedAmount).toBe(60); // 15 * 4 (fallback) -- nunca usa o valor de "9 eixos".
    });

    it('sem tarifa oficial e sem pricePerAxle: continua UNVERIFIABLE, nunca inventa um valor', () => {
      const stop: ReconciliationRouteStopInput = { ...PLAZA_A, pricePerAxle: null, officialTariffsByAxleCategory: {} };
      const transactions = [tx({ tollPlazaId: 'plaza-a', chargedAmount: 60, axleCount: 4 })];

      const result = computeTollReconciliation([stop], transactions, 4);

      expect(result.stops[0]!.expectedAmount).toBeNull();
      expect(result.stops[0]!.verdict).toBe('UNVERIFIABLE');
    });

    it('tarifa oficial disponivel mas pricePerAxle nulo: ainda assim usa a tarifa oficial (nao depende do fallback existir)', () => {
      const stop: ReconciliationRouteStopInput = {
        ...PLAZA_A,
        pricePerAxle: null,
        officialTariffsByAxleCategory: { '9 eixos': 130 },
      };
      const transactions = [tx({ tollPlazaId: 'plaza-a', chargedAmount: 130, axleCount: 9 })];

      const result = computeTollReconciliation([stop], transactions, 9);

      expect(result.stops[0]!.expectedAmount).toBe(130);
      expect(result.stops[0]!.verdict).toBe('CORRECT');
    });
  });

  // computeReconciliationStatus isolado -- cobre as bordas de decisao entre
  // os 5 status sem precisar montar um cenario completo de paradas/transacoes.
  describe('computeReconciliationStatus', () => {
    const base = {
      expectedStopsCount: 1,
      registeredStopsCount: 1,
      reconciledStopsCount: 1,
      overchargeCount: 0,
      underchargeCount: 0,
      notRegisteredCount: 0,
      unverifiableCount: 0,
      unplannedCount: 0,
      isFullyReconciled: true,
    };

    it('PENDING quando nao ha paradas esperadas nem pedagio nao previsto', () => {
      expect(
        computeReconciliationStatus({
          ...base,
          expectedStopsCount: 0,
          registeredStopsCount: 0,
          reconciledStopsCount: 0,
          isFullyReconciled: true,
        }),
      ).toBe('PENDING');
    });

    it('PENDING quando nada foi registrado ainda (mas ha paradas esperadas)', () => {
      expect(
        computeReconciliationStatus({
          ...base,
          registeredStopsCount: 0,
          reconciledStopsCount: 0,
          isFullyReconciled: false,
        }),
      ).toBe('PENDING');
    });

    it('CONFORM quando isFullyReconciled', () => {
      expect(computeReconciliationStatus({ ...base, isFullyReconciled: true })).toBe('CONFORM');
    });

    it('UNVERIFIABLE quando ha registro mas nenhuma parada conclusiva', () => {
      expect(
        computeReconciliationStatus({
          ...base,
          reconciledStopsCount: 0,
          unverifiableCount: 1,
          isFullyReconciled: false,
        }),
      ).toBe('UNVERIFIABLE');
    });

    it('CRITICAL quando ha divergencia financeira (mesmo com um unico problema)', () => {
      expect(
        computeReconciliationStatus({ ...base, overchargeCount: 1, isFullyReconciled: false }),
      ).toBe('CRITICAL');
    });

    it('CRITICAL quando ha 2+ problemas de presenca, sem divergencia financeira', () => {
      expect(
        computeReconciliationStatus({
          ...base,
          notRegisteredCount: 1,
          unplannedCount: 1,
          isFullyReconciled: false,
        }),
      ).toBe('CRITICAL');
    });

    it('ATTENTION quando ha exatamente 1 problema de presenca, sem divergencia financeira', () => {
      expect(
        computeReconciliationStatus({ ...base, notRegisteredCount: 1, isFullyReconciled: false }),
      ).toBe('ATTENTION');
    });
  });
});
