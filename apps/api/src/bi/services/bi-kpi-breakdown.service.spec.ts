import { Prisma } from '@prisma/client';
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

  describe('custo por veiculo (BI 5)', () => {
    const costVehicles = [
      { id: 'v1', plate: 'AAA1111' },
      { id: 'v2', plate: 'BBB2222' },
    ];

    async function buildCostService(overrides: { prisma?: Record<string, unknown>; fleetMetrics?: Record<string, unknown> } = {}) {
      const fleetMetrics = {
        buildCostSourceWheres: jest.fn().mockReturnValue({ fuel: {}, maintenance: {}, tire: {}, retread: {}, toll: {}, otherExpense: {} }),
        computeCostTotals: jest.fn().mockResolvedValue({
          totalCost: 1420,
          fuelCost: 600,
          maintenanceCost: 300,
          tireCost: 430,
          tollCost: 50,
          otherCost: 40,
          otherCostByCategory: [],
          fuelLiters: 0,
          recordCounts: { fuelSupplies: 2, maintenances: 1, tires: 1, tireRetreads: 1, tollTransactions: 1, otherExpenses: 1 },
          distance: { vehicleDistances: new Map([['v1', 100]]), readingCounts: new Map(), totalDistanceKm: 100, odometerReadings: 2 },
        }),
        ...overrides.fleetMetrics,
      };
      const d = (n: number) => new Prisma.Decimal(n);
      const prisma = {
        vehicle: { findMany: jest.fn().mockResolvedValue(costVehicles) },
        fuelSupply: { groupBy: jest.fn().mockResolvedValue([{ vehicleId: 'v1', _sum: { totalAmount: d(600) }, _count: 2 }]) },
        vehicleMaintenance: { groupBy: jest.fn().mockResolvedValue([{ vehicleId: 'v2', _sum: { totalCost: d(300) }, _count: 1 }]) },
        tollTransaction: { groupBy: jest.fn().mockResolvedValue([{ vehicleId: 'v1', _sum: { chargedAmount: d(50) }, _count: 1 }]) },
        tire: {
          groupBy: jest.fn().mockResolvedValue([
            { vehicleId: 'v1', _sum: { purchasePrice: d(200) }, _count: 1 },
            { vehicleId: null, _sum: { purchasePrice: d(150) }, _count: 1 }, // pneu comprado para o estoque
          ]),
        },
        tireRetread: { findMany: jest.fn().mockResolvedValue([{ cost: d(80), tire: { vehicleId: 'v2' } }]) },
        tripExpense: { groupBy: jest.fn().mockResolvedValue([{ vehicleId: null, _sum: { amount: d(40) }, _count: 1 }]) }, // despesa geral
        ...overrides.prisma,
      };
      const moduleRef = await Test.createTestingModule({
        providers: [
          BiKpiBreakdownService,
          { provide: PrismaService, useValue: prisma },
          { provide: FleetOperationsMetricsService, useValue: fleetMetrics },
          { provide: FleetIdleTimeService, useValue: { loadVehicleIdleData: jest.fn() } },
        ],
      }).compile();
      return moduleRef.get(BiKpiBreakdownService);
    }

    it('fuel_cost: soma por veiculo bate com o total; veiculo sem abastecimento = 0 real', async () => {
      const service = await buildCostService();
      const result = await service.fuelCostByVehicle('t1', {}, period, 10);
      expect(result.items.find((i) => i.key === 'v1')?.value).toBe(600);
      expect(result.items.find((i) => i.key === 'v2')?.value).toBe(0);
      expect(result.items.find((i) => i.key === 'v2')?.unavailableReason).toBeNull();
      expect(result.total).toBe(600);
    });

    it('tire_cost: funde compra (vehicleId direto) + recapagem (veiculo atual do pneu); pneu sem veiculo vira "Sem veiculo"', async () => {
      const service = await buildCostService();
      const result = await service.tireCostByVehicle('t1', {}, period, 10);
      expect(result.items.find((i) => i.key === 'v1')?.value).toBe(200);
      expect(result.items.find((i) => i.key === 'v2')?.value).toBe(80);
      expect(result.items.find((i) => i.key === null && i.label === 'Sem veiculo')).toMatchObject({ value: 150 });
      expect(result.total).toBe(430);
    });

    it('other_cost: despesa aprovada sem veiculo nunca some do total', async () => {
      const service = await buildCostService();
      const result = await service.otherCostByVehicle('t1', {}, period, 10);
      expect(result.items.find((i) => i.key === null && i.label === 'Sem veiculo')).toMatchObject({ value: 40 });
      expect(result.total).toBe(40);
    });

    it('operating_cost: soma as 5 categorias por veiculo; total = soma de tudo (inclusive "Sem veiculo")', async () => {
      const service = await buildCostService();
      const result = await service.operatingCostByVehicle('t1', {}, period, 10);
      expect(result.items.find((i) => i.key === 'v1')?.value).toBe(850); // 600 fuel + 50 toll + 200 tire
      expect(result.items.find((i) => i.key === 'v2')?.value).toBe(380); // 300 maintenance + 80 tire (retread)
      const semVeiculo = result.items.find((i) => i.key === null) ?? result.others;
      expect(semVeiculo?.value).toBe(190); // 150 tire + 40 other
      expect(result.total).toBe(1420);
    });

    it('cost_per_km por veiculo: razao nunca somada -- total e o valor oficial do catalogo, share/others sempre null', async () => {
      const service = await buildCostService();
      const result = await service.costPerKmByVehicle('t1', {}, period, 10);
      const v1 = result.items.find((i) => i.key === 'v1')!;
      const v2 = result.items.find((i) => i.key === 'v2')!;
      expect(v1.value).toBeCloseTo(8.5, 5); // 850 / 100km
      expect(v1.share).toBeNull();
      expect(v2.value).toBeNull(); // sem distancia qualificada
      expect(v2.unavailableReason).toMatch(/leituras de odometro/i);
      expect(result.others).toBeNull();
      expect(result.total).toBeCloseTo(14.2, 5); // 1420 / 100km (valor oficial do catalogo)
    });

    it('isolamento: recorte de custo por veiculo so consulta o escopo do tenant informado', async () => {
      const vehicleFindMany = jest.fn().mockResolvedValue(costVehicles);
      const service = await buildCostService({ prisma: { vehicle: { findMany: vehicleFindMany } } });
      await service.fuelCostByVehicle('tenant-a', {}, period, 10);
      expect(vehicleFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-a' }) }));
    });
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
