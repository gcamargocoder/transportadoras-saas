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
});
