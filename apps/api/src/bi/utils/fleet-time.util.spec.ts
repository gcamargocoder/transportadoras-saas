import { TripStatus, VehicleStatus } from '@prisma/client';
import { computeFleetTimeByVehicle, computeFleetTimeTotals, computeVehicleFleetTime, FleetTimeVehicleInput } from './fleet-time.util';

const d = (iso: string) => new Date(iso);
const HOUR = 60;

// Periodo de 10 dias: 240 horas por veiculo.
const period = { start: d('2026-03-01T00:00:00Z'), end: d('2026-03-10T23:59:59.999Z') };
const now = d('2026-04-01T00:00:00Z');

function vehicle(overrides: Partial<FleetTimeVehicleInput> = {}): FleetTimeVehicleInput {
  return {
    vehicleId: 'v1',
    status: VehicleStatus.ACTIVE,
    createdAt: d('2025-01-01T00:00:00Z'),
    trips: [],
    maintenanceIntervals: [],
    ...overrides,
  };
}

function trip(id: string, departure: string | null, arrival: string | null, status: TripStatus = TripStatus.COMPLETED) {
  return {
    tripId: id,
    status,
    actualDeparture: departure ? d(departure) : null,
    actualArrival: arrival ? d(arrival) : null,
    destinationLabel: null,
  };
}

describe('computeFleetTimeTotals', () => {
  it('sem veiculos: capacidade zero (KPIs de frota ficam indisponiveis)', () => {
    const totals = computeFleetTimeTotals([], period, now);
    expect(totals.vehiclesConsidered).toBe(0);
    expect(totals.capacityMinutes).toBe(0);
  });

  it('capacidade = horas do periodo por veiculo em operacao; SOLD/INACTIVE ficam fora', () => {
    const totals = computeFleetTimeTotals(
      [
        vehicle({ vehicleId: 'a' }),
        vehicle({ vehicleId: 'b', status: VehicleStatus.MAINTENANCE }),
        vehicle({ vehicleId: 'c', status: VehicleStatus.SOLD }),
        vehicle({ vehicleId: 'd', status: VehicleStatus.INACTIVE }),
      ],
      period,
      now,
    );
    expect(totals.vehiclesConsidered).toBe(2);
    expect(totals.capacityMinutes).toBeCloseTo(2 * 240 * HOUR, 0);
  });

  it('veiculo cadastrado no meio do periodo so conta a partir do cadastro', () => {
    const totals = computeFleetTimeTotals([vehicle({ createdAt: d('2026-03-06T00:00:00Z') })], period, now);
    expect(totals.capacityMinutes).toBeCloseTo(120 * HOUR, 0);
  });

  it('periodo em andamento: capacidade so ate agora (futuro nunca conta)', () => {
    const totals = computeFleetTimeTotals([vehicle()], period, d('2026-03-02T00:00:00Z'));
    expect(totals.capacityMinutes).toBe(24 * HOUR);
    expect(totals.effectiveEnd.toISOString()).toBe('2026-03-02T00:00:00.000Z');
  });

  it('viagem e recortada ao periodo (so a parte interna conta)', () => {
    const totals = computeFleetTimeTotals(
      [vehicle({ trips: [trip('t1', '2026-02-28T12:00:00Z', '2026-03-01T12:00:00Z')] })],
      period,
      now,
    );
    expect(totals.tripMinutes).toBe(12 * HOUR);
    expect(totals.tripsConsidered).toBe(1);
  });

  it('viagens sobrepostas do mesmo veiculo nao contam minutos em dobro', () => {
    const totals = computeFleetTimeTotals(
      [
        vehicle({
          trips: [
            trip('t1', '2026-03-02T00:00:00Z', '2026-03-02T10:00:00Z'),
            trip('t2', '2026-03-02T05:00:00Z', '2026-03-02T12:00:00Z'),
          ],
        }),
      ],
      period,
      now,
    );
    expect(totals.tripMinutes).toBe(12 * HOUR);
  });

  it('viagem ativa conta ate agora; viagem sem partida real e ignorada', () => {
    const totals = computeFleetTimeTotals(
      [
        vehicle({
          trips: [
            trip('t1', '2026-03-10T00:00:00Z', null, TripStatus.IN_PROGRESS),
            trip('t2', null, '2026-03-05T00:00:00Z'),
          ],
        }),
      ],
      period,
      d('2026-03-10T06:00:00Z'),
    );
    expect(totals.tripMinutes).toBe(6 * HOUR);
  });

  it('manutencao em aberto conta ate o fim efetivo do periodo', () => {
    const totals = computeFleetTimeTotals(
      [vehicle({ maintenanceIntervals: [{ start: d('2026-03-09T00:00:00Z'), end: null }] })],
      period,
      now,
    );
    expect(totals.maintenanceMinutes).toBe(48 * HOUR);
  });

  it('ociosidade entre viagens e recortada ao periodo e liquida de manutencao', () => {
    const totals = computeFleetTimeTotals(
      [
        vehicle({
          trips: [
            trip('t1', '2026-03-01T00:00:00Z', '2026-03-02T00:00:00Z'),
            trip('t2', '2026-03-04T00:00:00Z', '2026-03-05T00:00:00Z'),
          ],
          // 12h de manutencao dentro do gap ocioso de 48h
          maintenanceIntervals: [{ start: d('2026-03-03T00:00:00Z'), end: d('2026-03-03T12:00:00Z') }],
        }),
      ],
      period,
      // agora = logo apos t2 terminar -> periodo ocioso corrente de 1h
      d('2026-03-05T01:00:00Z'),
    );
    expect(totals.idleNetMinutes).toBe(48 * HOUR - 12 * HOUR + 1 * HOUR);
    expect(totals.idleSegmentsConsidered).toBe(2);
  });
});

describe('computeFleetTimeByVehicle', () => {
  it('a soma dos campos por veiculo bate exatamente com o agregado', () => {
    const vehicles: FleetTimeVehicleInput[] = [
      vehicle({ vehicleId: 'a', trips: [trip('t1', '2026-03-01T00:00:00Z', '2026-03-02T00:00:00Z')] }),
      vehicle({ vehicleId: 'b', status: VehicleStatus.SOLD }),
      vehicle({
        vehicleId: 'c',
        trips: [trip('t2', '2026-03-04T00:00:00Z', '2026-03-05T00:00:00Z')],
        maintenanceIntervals: [{ start: d('2026-03-03T00:00:00Z'), end: d('2026-03-03T12:00:00Z') }],
      }),
    ];
    const perVehicle = computeFleetTimeByVehicle(vehicles, period, now);
    const totals = computeFleetTimeTotals(vehicles, period, now);

    expect(perVehicle.size).toBe(3);
    expect(perVehicle.get('b')?.considered).toBe(false);

    const consideredRows = [...perVehicle.values()].filter((r) => r.considered);
    expect(consideredRows.length).toBe(totals.vehiclesConsidered);
    const sum = (key: keyof typeof totals extends string ? 'capacityMinutes' | 'tripMinutes' | 'maintenanceMinutes' | 'idleNetMinutes' | 'tripsConsidered' | 'idleSegmentsConsidered' : never) =>
      consideredRows.reduce((acc, r) => acc + r[key], 0);
    expect(sum('capacityMinutes')).toBeCloseTo(totals.capacityMinutes, 5);
    expect(sum('tripMinutes')).toBeCloseTo(totals.tripMinutes, 5);
    expect(sum('maintenanceMinutes')).toBeCloseTo(totals.maintenanceMinutes, 5);
    expect(sum('idleNetMinutes')).toBeCloseTo(totals.idleNetMinutes, 5);
    expect(sum('tripsConsidered')).toBe(totals.tripsConsidered);
    expect(sum('idleSegmentsConsidered')).toBe(totals.idleSegmentsConsidered);
  });

  it('veiculo fora de operacao ou fora da janela do periodo: considered=false, todos os campos zerados', () => {
    const perVehicle = computeFleetTimeByVehicle(
      [vehicle({ vehicleId: 'sold', status: VehicleStatus.SOLD }), vehicle({ vehicleId: 'future', createdAt: d('2026-04-01T00:00:00Z') })],
      period,
      now,
    );
    expect(perVehicle.get('sold')).toMatchObject({ considered: false, capacityMinutes: 0, tripMinutes: 0 });
    expect(perVehicle.get('future')).toMatchObject({ considered: false, capacityMinutes: 0 });
  });
});

describe('computeVehicleFleetTime', () => {
  it('e a mesma funcao usada por computeFleetTimeByVehicle (chamada direta produz a mesma linha)', () => {
    const v = vehicle({ vehicleId: 'x', trips: [trip('t1', '2026-03-01T00:00:00Z', '2026-03-02T00:00:00Z')] });
    expect(computeVehicleFleetTime(v, period, now)).toEqual(computeFleetTimeByVehicle([v], period, now).get('x'));
  });
});
