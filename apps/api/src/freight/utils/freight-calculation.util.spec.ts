import { VehicleType } from '@prisma/client';
import {
  computeFreightQuote,
  FreightRuleCandidate,
  selectApplicableFreightRule,
} from './freight-calculation.util';

function buildRule(overrides: Partial<FreightRuleCandidate> = {}): FreightRuleCandidate {
  return {
    id: 'rule-1',
    freightTableId: 'table-1',
    version: 1,
    priority: 0,
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveUntil: null,
    originLocationId: null,
    destinationLocationId: null,
    originRegion: null,
    destinationRegion: null,
    cargoType: null,
    vehicleType: null,
    minWeightKg: null,
    maxWeightKg: null,
    minCubageM3: null,
    maxCubageM3: null,
    baseAmount: null,
    perKmAmount: null,
    perTonAmount: null,
    minimumAmount: null,
    tollAmount: null,
    riskAdditionalAmount: null,
    nightAdditionalAmount: null,
    dailyRateAmount: null,
    demurrageAmount: null,
    otherFees: null,
    ...overrides,
  };
}

describe('selectApplicableFreightRule', () => {
  it('retorna null quando nenhuma regra e aplicavel (ausencia nunca inventa preco)', () => {
    const result = selectApplicableFreightRule([], { weightKg: 1000 });
    expect(result).toBeNull();
  });

  it('regra generica (sem criterios) e selecionada quando e a unica candidata', () => {
    const rule = buildRule();
    expect(selectApplicableFreightRule([rule], {})).toBe(rule);
  });

  it('regra mais especifica vence mesmo com priority menor', () => {
    const generic = buildRule({ id: 'generic', priority: 100 });
    const specific = buildRule({ id: 'specific', priority: 0, cargoType: 'GRANEL' });
    const result = selectApplicableFreightRule([generic, specific], { cargoType: 'GRANEL' });
    expect(result?.id).toBe('specific');
  });

  it('em empate de especificidade, maior priority vence', () => {
    const low = buildRule({ id: 'low', priority: 1, cargoType: 'GRANEL' });
    const high = buildRule({ id: 'high', priority: 5, cargoType: 'GRANEL' });
    const result = selectApplicableFreightRule([low, high], { cargoType: 'GRANEL' });
    expect(result?.id).toBe('high');
  });

  it('em empate de especificidade e priority, effectiveFrom mais recente vence', () => {
    const older = buildRule({
      id: 'older',
      priority: 1,
      cargoType: 'GRANEL',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    });
    const newer = buildRule({
      id: 'newer',
      priority: 1,
      cargoType: 'GRANEL',
      effectiveFrom: new Date('2026-06-01T00:00:00.000Z'),
    });
    const result = selectApplicableFreightRule([older, newer], { cargoType: 'GRANEL' });
    expect(result?.id).toBe('newer');
  });

  it('em empate total, desempata deterministicamente por id (nunca pela ordem do array)', () => {
    const a = buildRule({ id: 'aaa', priority: 1, cargoType: 'GRANEL' });
    const b = buildRule({ id: 'bbb', priority: 1, cargoType: 'GRANEL' });
    const resultAB = selectApplicableFreightRule([a, b], { cargoType: 'GRANEL' });
    const resultBA = selectApplicableFreightRule([b, a], { cargoType: 'GRANEL' });
    expect(resultAB?.id).toBe('aaa');
    expect(resultBA?.id).toBe('aaa');
  });

  it('regra com effectiveFrom no futuro nunca e selecionada', () => {
    const future = buildRule({ effectiveFrom: new Date('2099-01-01T00:00:00.000Z') });
    const result = selectApplicableFreightRule([future], {}, );
    expect(result).toBeNull();
  });

  it('regra com effectiveUntil no passado nunca e selecionada', () => {
    const expired = buildRule({
      effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
      effectiveUntil: new Date('2021-01-01T00:00:00.000Z'),
    });
    const result = selectApplicableFreightRule([expired], { asOf: new Date('2026-01-01T00:00:00.000Z') });
    expect(result).toBeNull();
  });

  it('regra sem effectiveUntil (null) e considerada vigente indefinidamente', () => {
    const rule = buildRule({
      effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
      effectiveUntil: null,
    });
    const result = selectApplicableFreightRule([rule], { asOf: new Date('2030-01-01T00:00:00.000Z') });
    expect(result).toBe(rule);
  });

  it('faixa de peso: abaixo do minimo nunca corresponde', () => {
    const rule = buildRule({ minWeightKg: 1000, maxWeightKg: 5000 });
    expect(selectApplicableFreightRule([rule], { weightKg: 500 })).toBeNull();
  });

  it('faixa de peso: acima do maximo nunca corresponde', () => {
    const rule = buildRule({ minWeightKg: 1000, maxWeightKg: 5000 });
    expect(selectApplicableFreightRule([rule], { weightKg: 6000 })).toBeNull();
  });

  it('faixa de peso: dentro da faixa corresponde', () => {
    const rule = buildRule({ minWeightKg: 1000, maxWeightKg: 5000 });
    expect(selectApplicableFreightRule([rule], { weightKg: 3000 })).toBe(rule);
  });

  it('regra com faixa de peso mas sem peso informado no pedido nunca corresponde', () => {
    const rule = buildRule({ minWeightKg: 1000, maxWeightKg: 5000 });
    expect(selectApplicableFreightRule([rule], {})).toBeNull();
  });

  it('regra sem faixa de peso corresponde independente do peso informado', () => {
    const rule = buildRule();
    expect(selectApplicableFreightRule([rule], { weightKg: 999999 })).toBe(rule);
  });

  it('faixa de cubagem: fora da faixa nunca corresponde; dentro corresponde', () => {
    const rule = buildRule({ minCubageM3: 10, maxCubageM3: 20 });
    expect(selectApplicableFreightRule([rule], { cubageM3: 5 })).toBeNull();
    expect(selectApplicableFreightRule([rule], { cubageM3: 25 })).toBeNull();
    expect(selectApplicableFreightRule([rule], { cubageM3: 15 })).toBe(rule);
  });

  it('vehicleType/origem/destino/regiao restringem quando preenchidos na regra', () => {
    const rule = buildRule({
      vehicleType: VehicleType.TRUCK,
      originLocationId: 'loc-sp',
      destinationLocationId: 'loc-rj',
      originRegion: 'SP',
      destinationRegion: 'RJ',
    });
    expect(
      selectApplicableFreightRule([rule], {
        vehicleType: VehicleType.TRUCK,
        originLocationId: 'loc-sp',
        destinationLocationId: 'loc-rj',
        originRegion: 'SP',
        destinationRegion: 'RJ',
      }),
    ).toBe(rule);
    expect(
      selectApplicableFreightRule([rule], {
        vehicleType: VehicleType.VAN,
        originLocationId: 'loc-sp',
        destinationLocationId: 'loc-rj',
        originRegion: 'SP',
        destinationRegion: 'RJ',
      }),
    ).toBeNull();
  });
});

describe('computeFreightQuote', () => {
  it('calcula base + km + tonelada, sem adicionais/pedagio/taxas quando ausentes', () => {
    const rule = buildRule({ baseAmount: 500, perKmAmount: 2, perTonAmount: 50 });
    const result = computeFreightQuote(rule, { distanceKm: 100, weightKg: 2000 });
    // base = 500 + 2*100 + 50*2 = 500 + 200 + 100 = 800
    expect(result.baseAmount).toBe(800);
    expect(result.additionsAmount).toBe(0);
    expect(result.tollAmount).toBe(0);
    expect(result.feesAmount).toBe(0);
    expect(result.totalAmount).toBe(800);
  });

  it('aplica o valor minimo quando o calculo fica abaixo dele', () => {
    const rule = buildRule({ baseAmount: 100, perKmAmount: 1, minimumAmount: 1000 });
    const result = computeFreightQuote(rule, { distanceKm: 50 });
    // base bruta = 100 + 50 = 150, abaixo do minimo -> usa 1000
    expect(result.baseAmount).toBe(1000);
    expect(result.totalAmount).toBe(1000);
  });

  it('nunca aplica o minimo quando o calculo ja o supera', () => {
    const rule = buildRule({ baseAmount: 2000, minimumAmount: 1000 });
    const result = computeFreightQuote(rule, {});
    expect(result.baseAmount).toBe(2000);
  });

  it('adicional de risco so entra quando riskCargo=true', () => {
    const rule = buildRule({ riskAdditionalAmount: 300 });
    expect(computeFreightQuote(rule, { riskCargo: true }).additionsAmount).toBe(300);
    expect(computeFreightQuote(rule, { riskCargo: false }).additionsAmount).toBe(0);
    expect(computeFreightQuote(rule, {}).additionsAmount).toBe(0);
  });

  it('adicional noturno so entra quando nightService=true', () => {
    const rule = buildRule({ nightAdditionalAmount: 150 });
    expect(computeFreightQuote(rule, { nightService: true }).additionsAmount).toBe(150);
    expect(computeFreightQuote(rule, {}).additionsAmount).toBe(0);
  });

  it('risco + noturno somam quando ambos aplicaveis', () => {
    const rule = buildRule({ riskAdditionalAmount: 300, nightAdditionalAmount: 150 });
    const result = computeFreightQuote(rule, { riskCargo: true, nightService: true });
    expect(result.additionsAmount).toBe(450);
  });

  it('taxas: diaria * quantidade + estadia * quantidade + outras taxas somadas', () => {
    const rule = buildRule({
      dailyRateAmount: 100,
      demurrageAmount: 80,
      otherFees: [
        { label: 'Descarga', amount: 40 },
        { label: 'Seguro extra', amount: 60 },
      ],
    });
    const result = computeFreightQuote(rule, { dailyCount: 2, demurrageCount: 3 });
    // 100*2 + 80*3 + 40 + 60 = 200 + 240 + 100 = 540
    expect(result.feesAmount).toBe(540);
  });

  it('pedagio e somado diretamente ao total, nunca sujeito ao valor minimo', () => {
    const rule = buildRule({ baseAmount: 50, minimumAmount: 1000, tollAmount: 120 });
    const result = computeFreightQuote(rule, {});
    expect(result.baseAmount).toBe(1000);
    expect(result.tollAmount).toBe(120);
    expect(result.totalAmount).toBe(1120);
  });

  it('valor total e a soma exata de base + adicionais + pedagio + taxas', () => {
    const rule = buildRule({
      baseAmount: 500,
      perKmAmount: 3,
      perTonAmount: 20,
      tollAmount: 45,
      riskAdditionalAmount: 100,
      nightAdditionalAmount: 50,
      dailyRateAmount: 90,
      otherFees: [{ label: 'Taxa X', amount: 10 }],
    });
    const result = computeFreightQuote(rule, {
      distanceKm: 200,
      weightKg: 3000,
      riskCargo: true,
      nightService: true,
      dailyCount: 1,
    });
    // base = 500 + 3*200 + 20*3 = 500 + 600 + 60 = 1160
    // adicionais = 100 + 50 = 150
    // taxas = 90*1 + 10 = 100
    // pedagio = 45
    // total = 1160 + 150 + 45 + 100 = 1455
    expect(result.baseAmount).toBe(1160);
    expect(result.additionsAmount).toBe(150);
    expect(result.tollAmount).toBe(45);
    expect(result.feesAmount).toBe(100);
    expect(result.totalAmount).toBe(1455);
  });

  it('regra sem nenhum valor configurado resulta em total zero (nunca inventa preco)', () => {
    const rule = buildRule();
    const result = computeFreightQuote(rule, { distanceKm: 500, weightKg: 10000 });
    expect(result.totalAmount).toBe(0);
  });

  it('retorna a identificacao da regra/tabela/versao usadas', () => {
    const rule = buildRule({ id: 'rule-42', freightTableId: 'table-7', version: 3 });
    const result = computeFreightQuote(rule, {});
    expect(result.ruleId).toBe('rule-42');
    expect(result.freightTableId).toBe('table-7');
    expect(result.ruleVersion).toBe(3);
  });
});
