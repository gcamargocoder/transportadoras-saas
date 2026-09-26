import { Test } from '@nestjs/testing';
import { FleetIdleTimeService } from '../../fleet-operations/services/fleet-idle-time.service';
import { FleetOperationsMetricsService } from '../../fleet-operations/services/fleet-operations-metrics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BiKpiBreakdownService } from './bi-kpi-breakdown.service';

describe('BiKpiBreakdownService -- recorte por veiculo (BI 4)', () => {
  const period = { start: new Date('2026-03-01T00:00:00Z'), end: new Date('2026-03-10T23:59:59.999Z') };

  const idleTimeData = [
    {
      vehicleId: 'v1',
      plate: 'AAA1111',
      status: 'ACTIVE',
      createdAt: new Date('2025-01-01T00:00:00Z'),
      trips: [{ tripId: 't1', status: 'COMPLETED', actualDeparture: new Date('2026-03-01T00:00:00Z'), actualArrival: new Date('2026-03-02T00:00:00Z'), destinationLabel: null }],
      maintenanceIntervals: [],
    },
    {
      vehicleId: 'v2',
      plate: 'BBB2222',
      status: 'SOLD', // fora de operacao -- deve virar UNAVAILABLE, nunca 0%
      createdAt: new Date('2025-01-01T00:00:00Z'),
      trips: [],
      maintenanceIntervals: [],
    },
  ];

  async function buildService(prismaOverrides: Record<string, unknown> = {}) {
    const idleTime = { loadVehicleIdleData: jest.fn().mockResolvedValue(idleTimeData) };
    const fleetMetrics = {
      computeCostTotals: jest.fn().mockResolvedValue({
        distance: {
          vehicleDistances: new Map([['v1', 500]]),
          readingCounts: new Map([['v1', 3]]),
          totalDistanceKm: 500,
          odometerReadings: 3,
        },
      }),
    };
    const prisma = { trip: { findMany: jest.fn().mockResolvedValue([{ composition: { vehicleId: 'v1' } }, { composition: { vehicleId: 'v1' } }]) }, ...prismaOverrides };
    const moduleRef = await Test.createTestingModule({
      providers: [
        BiKpiBreakdownService,
        { provide: PrismaService, useValue: prisma },
        { provide: FleetOperationsMetricsService, useValue: fleetMetrics },
        { provide: FleetIdleTimeService, useValue: idleTime },
      ],
    }).compile();
    return moduleRef.get(BiKpiBreakdownService);
  }

  it('fleet_utilization: veiculo SOLD fica UNAVAILABLE, nunca 0%; total = valor oficial do KPI, share sempre null', async () => {
    const service = await buildService();
    const result = await service.fleetUtilizationByVehicle('t1', {}, period, 10);
    const v1 = result.items.find((i) => i.key === 'v1')!;
    const v2 = result.items.find((i) => i.key === 'v2')!;
    expect(v1.value).toBeCloseTo(10, 1); // 24h em viagem / 240h de capacidade
    expect(v1.share).toBeNull();
    expect(v2.value).toBeNull();
    expect(v2.unavailableReason).toMatch(/fora de operacao/i);
    expect(result.others).toBeNull();
    // Agregado = mesma regra de fleet_utilization desde o BI 1: veiculo SOLD
    // nao entra na capacidade da frota (nem no numerador nem no denominador).
    // So v1 tem capacidade (240h) -- 24h em viagem / 240h = 10%, nao 24h/480h.
    expect(result.total).toBeCloseTo(10, 1);
  });

  it('idle_hours: e somavel -- share preenchido e total = soma dos itens', async () => {
    const service = await buildService();
    const result = await service.idleHoursByVehicle('t1', {}, period, 10);
    const total = result.items.reduce((sum, i) => sum + (i.value ?? 0), 0);
    expect(result.total).toBeCloseTo(total, 5);
    const v1 = result.items.find((i) => i.key === 'v1')!;
    if (v1.value && result.total) expect(v1.share).toBeCloseTo((v1.value / result.total) * 100, 5);
  });

  it('trips_completed: soma dos itens = numero de viagens retornadas pelo where', async () => {
    const service = await buildService();
    const result = await service.tripsCompletedByVehicle('t1', {}, period, 10);
    expect(result.total).toBe(2);
    expect(result.items.find((i) => i.key === 'v1')?.value).toBe(2);
    expect(result.items.find((i) => i.key === 'v2')?.value).toBe(0); // veiculo sem viagem = 0 real, nao UNAVAILABLE
  });

  it('trips_completed: viagem de veiculo fora do escopo atual (removido) nunca some do total', async () => {
    const service = await buildService({
      trip: { findMany: jest.fn().mockResolvedValue([{ composition: { vehicleId: 'v1' } }, { composition: { vehicleId: 'removido' } }]) },
    });
    const result = await service.tripsCompletedByVehicle('t1', {}, period, 10);
    expect(result.total).toBe(2);
    expect(result.items.find((i) => i.key === null)).toMatchObject({ label: 'Veiculo removido', value: 1 });
  });

  it('distance_km: veiculo sem 2 leituras fica UNAVAILABLE; total bate com a soma do mapa de distancias', async () => {
    const service = await buildService();
    const result = await service.distanceByVehicle('t1', {}, period, 10);
    expect(result.items.find((i) => i.key === 'v1')).toMatchObject({ value: 500, recordCount: 3 });
    expect(result.items.find((i) => i.key === 'v2')).toMatchObject({ value: null });
    expect(result.items.find((i) => i.key === 'v2')?.unavailableReason).toMatch(/leituras de odometro/i);
    expect(result.total).toBe(500);
  });

  // Achados da revisao final: viagem concluida sem composicao (Trip.composition
  // e opcional no schema) nunca pode sumir do total -- mesmo padrao de
  // "Veiculo removido", com rotulo proprio.
  it('trips_completed: viagem concluida SEM composicao nunca some do total (Trip.composition e opcional)', async () => {
    const service = await buildService({
      trip: { findMany: jest.fn().mockResolvedValue([{ composition: { vehicleId: 'v1' } }, { composition: null }]) },
    });
    const result = await service.tripsCompletedByVehicle('t1', {}, period, 10);
    expect(result.total).toBe(2);
    expect(result.items.find((i) => i.key === null && i.label === 'Sem veiculo')).toMatchObject({ value: 1 });
  });

  // KPIs somaveis (idle_hours/trips_completed/distance_km) nunca truncam
  // silenciosamente: limit < numero de veiculos agrupa o resto em "others",
  // como revenueByCustomer -- soma(items)+others sempre = total.
  it('trips_completed: limit menor que o numero de veiculos agrupa o resto em "others"', async () => {
    const service = await buildService();
    const result = await service.tripsCompletedByVehicle('t1', {}, period, 1);
    expect(result.items).toHaveLength(1);
    expect(result.others).not.toBeNull();
    const itemsSum = result.items.reduce((sum, i) => sum + (i.value ?? 0), 0);
    expect(itemsSum + (result.others?.value ?? 0)).toBe(result.total);
  });

  it('idle_hours: limit menor que o numero de veiculos agrupa o resto em "others"', async () => {
    const service = await buildService();
    const result = await service.idleHoursByVehicle('t1', {}, period, 1);
    expect(result.others).not.toBeNull();
    const itemsSum = result.items.reduce((sum, i) => sum + (i.value ?? 0), 0);
    expect(itemsSum + (result.others?.value ?? 0)).toBeCloseTo(result.total ?? NaN, 5);
  });

  it('distance_km: limit menor que o numero de veiculos agrupa o resto em "others"', async () => {
    const service = await buildService();
    const result = await service.distanceByVehicle('t1', {}, period, 1);
    expect(result.others).not.toBeNull();
    const itemsSum = result.items.reduce((sum, i) => sum + (i.value ?? 0), 0);
    expect(itemsSum + (result.others?.value ?? 0)).toBe(result.total);
  });

  // Quando NENHUM veiculo tem dado (o KPI agregado ficaria UNAVAILABLE), o
  // total do breakdown tem que ser null -- nunca 0 (que pareceria um valor
  // real de "zero horas ociosas"/"zero km").
  it('idle_hours: nenhum veiculo com capacidade => total null, nunca 0', async () => {
    const service = await buildService();
    const idleTimeAllSold = [{ ...idleTimeData[0], status: 'SOLD' }, idleTimeData[1]];
    (service as unknown as { idleTime: { loadVehicleIdleData: jest.Mock } }).idleTime.loadVehicleIdleData.mockResolvedValue(idleTimeAllSold);
    const result = await service.idleHoursByVehicle('t1', {}, period, 10);
    expect(result.total).toBeNull();
    expect(result.others).toBeNull();
  });

  it('distance_km: nenhum veiculo com 2+ leituras => total null, nunca 0', async () => {
    const service = await buildService();
    (service as unknown as { fleetMetrics: { computeCostTotals: jest.Mock } }).fleetMetrics.computeCostTotals.mockResolvedValue({
      distance: { vehicleDistances: new Map(), readingCounts: new Map(), totalDistanceKm: null, odometerReadings: 0 },
    });
    const result = await service.distanceByVehicle('t1', {}, period, 10);
    expect(result.total).toBeNull();
    expect(result.others).toBeNull();
  });
});
