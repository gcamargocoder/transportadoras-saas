import {
  buildDriverStopRanking,
  computeAverageDurationHours,
  computeDeltaPercent,
  computePreviousPeriodRange,
  DriverStopRankingRow,
  FuelVehicleAggregate,
  isLowOutlier,
  isOutlier,
  mergeByFleet,
  mergeFuelByFleet,
  mergeVehicleAmounts,
  rankTopVehicles,
  safeAverage,
  VehicleRankingAccumulator,
} from './fleet-operations-metrics.util';

describe('safeAverage', () => {
  it('divide normalmente quando ha contagem', () => {
    expect(safeAverage(300, 3)).toBe(100);
  });

  it('retorna null (nunca 0) quando a contagem e zero', () => {
    expect(safeAverage(0, 0)).toBeNull();
  });

  it('retorna 0 quando o total e zero mas a contagem e positiva', () => {
    expect(safeAverage(0, 5)).toBe(0);
  });
});

describe('mergeVehicleAmounts', () => {
  it('acumula valor e contagem por veiculo', () => {
    const target = new Map<string, VehicleRankingAccumulator>();
    mergeVehicleAmounts(target, [{ vehicleId: 'v1', _count: 2, total: 100 }], (row) => row.total);
    expect(target.get('v1')).toEqual({ value: 100, count: 2 });
  });

  it('ignora linhas sem vehicleId (relacao opcional nao preenchida)', () => {
    const target = new Map<string, VehicleRankingAccumulator>();
    mergeVehicleAmounts(target, [{ vehicleId: null, _count: 1, total: 999 }], (row) => row.total);
    expect(target.size).toBe(0);
  });

  it('mescla multiplas fontes no mesmo veiculo (chamadas sucessivas)', () => {
    const target = new Map<string, VehicleRankingAccumulator>();
    mergeVehicleAmounts(target, [{ vehicleId: 'v1', _count: 1, total: 100 }], (row) => row.total);
    mergeVehicleAmounts(target, [{ vehicleId: 'v1', _count: 2, total: 50 }], (row) => row.total);
    expect(target.get('v1')).toEqual({ value: 150, count: 3 });
  });

  it('mantem veiculos diferentes em entradas separadas', () => {
    const target = new Map<string, VehicleRankingAccumulator>();
    mergeVehicleAmounts(
      target,
      [
        { vehicleId: 'v1', _count: 1, total: 100 },
        { vehicleId: 'v2', _count: 1, total: 200 },
      ],
      (row) => row.total,
    );
    expect(target.get('v1')).toEqual({ value: 100, count: 1 });
    expect(target.get('v2')).toEqual({ value: 200, count: 1 });
  });
});

describe('rankTopVehicles', () => {
  it('ordena por valor decrescente', () => {
    const merged = new Map<string, VehicleRankingAccumulator>([
      ['v1', { value: 100, count: 1 }],
      ['v2', { value: 300, count: 1 }],
      ['v3', { value: 200, count: 1 }],
    ]);
    expect(rankTopVehicles(merged, 10).map((entry) => entry.vehicleId)).toEqual(['v2', 'v3', 'v1']);
  });

  it('corta no limite informado', () => {
    const merged = new Map<string, VehicleRankingAccumulator>([
      ['v1', { value: 100, count: 1 }],
      ['v2', { value: 300, count: 1 }],
      ['v3', { value: 200, count: 1 }],
    ]);
    expect(rankTopVehicles(merged, 2)).toHaveLength(2);
  });

  it('retorna lista vazia quando nao ha dados', () => {
    expect(rankTopVehicles(new Map(), 5)).toEqual([]);
  });
});

describe('computeAverageDurationHours', () => {
  it('calcula a media em horas de pares validos', () => {
    const rows = [
      { openedAt: new Date('2026-01-01T00:00:00Z'), completedAt: new Date('2026-01-01T02:00:00Z') },
      { openedAt: new Date('2026-01-02T00:00:00Z'), completedAt: new Date('2026-01-02T04:00:00Z') },
    ];
    expect(computeAverageDurationHours(rows)).toBe(3);
  });

  it('ignora linhas sem completedAt', () => {
    const rows = [
      { openedAt: new Date('2026-01-01T00:00:00Z'), completedAt: new Date('2026-01-01T02:00:00Z') },
      { openedAt: new Date('2026-01-02T00:00:00Z'), completedAt: null },
    ];
    expect(computeAverageDurationHours(rows)).toBe(2);
  });

  it('ignora duracoes negativas (dado inconsistente)', () => {
    const rows = [{ openedAt: new Date('2026-01-01T10:00:00Z'), completedAt: new Date('2026-01-01T08:00:00Z') }];
    expect(computeAverageDurationHours(rows)).toBeNull();
  });

  it('retorna null para lista vazia', () => {
    expect(computeAverageDurationHours([])).toBeNull();
  });
});

describe('rankTopVehicles (sortBy count)', () => {
  it('ordena por contagem quando sortBy="count", nao por valor', () => {
    const merged = new Map<string, VehicleRankingAccumulator>([
      ['v1', { value: 1000, count: 1 }],
      ['v2', { value: 10, count: 5 }],
    ]);
    expect(rankTopVehicles(merged, 10, 'count').map((entry) => entry.vehicleId)).toEqual(['v2', 'v1']);
  });
});

describe('rankTopVehicles (direction asc)', () => {
  it('inverte para ordem crescente quando direction="asc" (rankings "menor"/"pior")', () => {
    const merged = new Map<string, VehicleRankingAccumulator>([
      ['v1', { value: 100, count: 1 }],
      ['v2', { value: 300, count: 1 }],
      ['v3', { value: 200, count: 1 }],
    ]);
    expect(rankTopVehicles(merged, 10, 'value', 'asc').map((entry) => entry.vehicleId)).toEqual(['v1', 'v3', 'v2']);
  });
});

describe('mergeByFleet', () => {
  it('soma acumuladores de veiculos da mesma frota', () => {
    const merged = new Map<string, VehicleRankingAccumulator>([
      ['v1', { value: 100, count: 1 }],
      ['v2', { value: 200, count: 2 }],
    ]);
    const vehicleFleetMap = new Map([
      ['v1', 'fleet-a'],
      ['v2', 'fleet-a'],
    ]);
    const byFleet = mergeByFleet(merged, vehicleFleetMap);
    expect(byFleet.get('fleet-a')).toEqual({ value: 300, count: 3 });
  });

  it('agrupa veiculos sem fleetId no balde null ("sem frota")', () => {
    const merged = new Map<string, VehicleRankingAccumulator>([['v1', { value: 100, count: 1 }]]);
    const byFleet = mergeByFleet(merged, new Map());
    expect(byFleet.get(null)).toEqual({ value: 100, count: 1 });
  });

  it('mantem frotas diferentes separadas', () => {
    const merged = new Map<string, VehicleRankingAccumulator>([
      ['v1', { value: 100, count: 1 }],
      ['v2', { value: 200, count: 1 }],
    ]);
    const vehicleFleetMap = new Map([
      ['v1', 'fleet-a'],
      ['v2', 'fleet-b'],
    ]);
    const byFleet = mergeByFleet(merged, vehicleFleetMap);
    expect(byFleet.get('fleet-a')).toEqual({ value: 100, count: 1 });
    expect(byFleet.get('fleet-b')).toEqual({ value: 200, count: 1 });
  });
});

describe('computePreviousPeriodRange', () => {
  it('retorna um intervalo de mesma duracao imediatamente anterior', () => {
    const start = new Date('2026-02-01T00:00:00.000Z');
    const end = new Date('2026-02-28T00:00:00.000Z');
    const previous = computePreviousPeriodRange(start, end);

    expect(previous.end.getTime()).toBe(start.getTime() - 1);
    expect(previous.end.getTime() - previous.start.getTime()).toBe(end.getTime() - start.getTime());
  });
});

describe('computeDeltaPercent', () => {
  it('calcula a variacao percentual entre dois valores', () => {
    expect(computeDeltaPercent(150, 100)).toBe(50);
    expect(computeDeltaPercent(50, 100)).toBe(-50);
  });

  it('retorna null (nunca Infinity) quando o valor anterior e zero', () => {
    expect(computeDeltaPercent(100, 0)).toBeNull();
  });

  it('retorna 0 quando os valores sao iguais', () => {
    expect(computeDeltaPercent(100, 100)).toBe(0);
  });
});

describe('mergeFuelByFleet', () => {
  function aggregate(overrides: Partial<FuelVehicleAggregate> = {}): FuelVehicleAggregate {
    return { cost: 0, liters: 0, count: 0, consumptionDistanceKm: 0, consumptionLiters: 0, ...overrides };
  }

  it('soma custo/litros/contagem/distancia de veiculos da mesma frota', () => {
    const merged = new Map<string, FuelVehicleAggregate>([
      ['v1', aggregate({ cost: 500, liters: 100, count: 2, consumptionDistanceKm: 400, consumptionLiters: 80 })],
      ['v2', aggregate({ cost: 300, liters: 60, count: 1, consumptionDistanceKm: 200, consumptionLiters: 40 })],
    ]);
    const vehicleFleetMap = new Map([
      ['v1', 'fleet-a'],
      ['v2', 'fleet-a'],
    ]);

    const byFleet = mergeFuelByFleet(merged, vehicleFleetMap);
    expect(byFleet.get('fleet-a')).toEqual(
      aggregate({ cost: 800, liters: 160, count: 3, consumptionDistanceKm: 600, consumptionLiters: 120 }),
    );
  });

  it('agrupa veiculos sem fleetId no balde null ("sem frota")', () => {
    const merged = new Map<string, FuelVehicleAggregate>([['v1', aggregate({ cost: 500, liters: 100, count: 1 })]]);
    const byFleet = mergeFuelByFleet(merged, new Map());
    expect(byFleet.get(null)).toEqual(aggregate({ cost: 500, liters: 100, count: 1 }));
  });

  it('mantem frotas diferentes separadas', () => {
    const merged = new Map<string, FuelVehicleAggregate>([
      ['v1', aggregate({ cost: 500, liters: 100, count: 1 })],
      ['v2', aggregate({ cost: 300, liters: 60, count: 1 })],
    ]);
    const vehicleFleetMap = new Map([
      ['v1', 'fleet-a'],
      ['v2', 'fleet-b'],
    ]);

    const byFleet = mergeFuelByFleet(merged, vehicleFleetMap);
    expect(byFleet.get('fleet-a')).toEqual(aggregate({ cost: 500, liters: 100, count: 1 }));
    expect(byFleet.get('fleet-b')).toEqual(aggregate({ cost: 300, liters: 60, count: 1 }));
  });

  it('retorna mapa vazio quando nao ha veiculos', () => {
    expect(mergeFuelByFleet(new Map(), new Map()).size).toBe(0);
  });
});

describe('isOutlier', () => {
  it('retorna true quando o valor excede a media vezes o multiplicador', () => {
    expect(isOutlier(300, 100, 2)).toBe(true);
  });

  it('retorna false quando o valor esta dentro do limite', () => {
    expect(isOutlier(150, 100, 2)).toBe(false);
  });

  it('retorna false quando a media e zero ou negativa (evita falso alarme)', () => {
    expect(isOutlier(100, 0, 2)).toBe(false);
  });
});

describe('isLowOutlier', () => {
  it('retorna true quando o valor esta muito abaixo da media (media/multiplicador)', () => {
    expect(isLowOutlier(10, 100, 2)).toBe(true); // 10 < 100/2=50
  });

  it('retorna false quando o valor esta dentro do limite', () => {
    expect(isLowOutlier(60, 100, 2)).toBe(false); // 60 >= 50
  });

  it('retorna false quando a media e zero (evita falso alarme)', () => {
    expect(isLowOutlier(0, 0, 2)).toBe(false);
  });
});

describe('buildDriverStopRanking', () => {
  function row(overrides: Partial<DriverStopRankingRow>): DriverStopRankingRow {
    return {
      driverId: 'd1',
      _count: 1,
      _sum: { durationMinutes: 0 },
      _max: { durationMinutes: null },
      _min: { durationMinutes: null },
      ...overrides,
    };
  }

  it('ordena por tempo total parado, decrescente', () => {
    const rows = [
      row({ driverId: 'd1', _count: 2, _sum: { durationMinutes: 100 } }),
      row({ driverId: 'd2', _count: 2, _sum: { durationMinutes: 300 } }),
    ];
    const names = new Map([
      ['d1', 'Motorista A'],
      ['d2', 'Motorista B'],
    ]);
    const ranking = buildDriverStopRanking(rows, names);
    expect(ranking.map((r) => r.driverId)).toEqual(['d2', 'd1']);
    expect(ranking[0]).toMatchObject({ rankPosition: 1, totalDurationMinutes: 300 });
    expect(ranking[1]).toMatchObject({ rankPosition: 2, totalDurationMinutes: 100 });
  });

  it('empate no tempo total -> desempata por quantidade de paradas (desc)', () => {
    const rows = [
      row({ driverId: 'd1', _count: 2, _sum: { durationMinutes: 200 } }),
      row({ driverId: 'd2', _count: 5, _sum: { durationMinutes: 200 } }),
    ];
    const names = new Map([
      ['d1', 'A'],
      ['d2', 'B'],
    ]);
    const ranking = buildDriverStopRanking(rows, names);
    expect(ranking.map((r) => r.driverId)).toEqual(['d2', 'd1']);
  });

  it('empate em tempo total e quantidade -> desempata por tempo medio (desc)', () => {
    // Mesmo total/contagem por construcao (media = total/contagem sempre
    // igual quando total e contagem sao iguais) -- este caso so e alcancavel
    // se as contagens forem diferentes mas a media coincidir; testado aqui
    // via nome como desempate final quando tudo mais e igual.
    const rows = [
      row({ driverId: 'd1', _count: 2, _sum: { durationMinutes: 200 } }),
      row({ driverId: 'd2', _count: 2, _sum: { durationMinutes: 200 } }),
    ];
    const names = new Map([
      ['d1', 'Zeca'],
      ['d2', 'Ana'],
    ]);
    const ranking = buildDriverStopRanking(rows, names);
    // Tudo igual (total/contagem/media) -> desempata por nome (asc).
    expect(ranking.map((r) => r.driverName)).toEqual(['Ana', 'Zeca']);
  });

  it('motorista sem nenhuma parada no periodo simplesmente nao aparece (nunca um 0 inventado)', () => {
    const rows = [row({ driverId: 'd1', _count: 3, _sum: { durationMinutes: 90 } })];
    const names = new Map([
      ['d1', 'A'],
      ['d2', 'Sem paradas'],
    ]);
    const ranking = buildDriverStopRanking(rows, names);
    expect(ranking).toHaveLength(1);
    expect(ranking.find((r) => r.driverName === 'Sem paradas')).toBeUndefined();
  });

  it('ignora linhas sem driverId (paradas administrativas sem motorista)', () => {
    const rows = [row({ driverId: null }), row({ driverId: 'd1', _sum: { durationMinutes: 50 } })];
    const ranking = buildDriverStopRanking(rows, new Map([['d1', 'A']]));
    expect(ranking).toHaveLength(1);
  });

  it('averageDurationMinutes nunca e 0 falso -- reflete total/contagem real', () => {
    const rows = [row({ driverId: 'd1', _count: 4, _sum: { durationMinutes: 100 } })];
    const ranking = buildDriverStopRanking(rows, new Map([['d1', 'A']]));
    expect(ranking[0]?.averageDurationMinutes).toBe(25);
  });

  it('propaga max/min por motorista', () => {
    const rows = [row({ driverId: 'd1', _max: { durationMinutes: 80 }, _min: { durationMinutes: 5 } })];
    const ranking = buildDriverStopRanking(rows, new Map([['d1', 'A']]));
    expect(ranking[0]).toMatchObject({ maxDurationMinutes: 80, minDurationMinutes: 5 });
  });
});
