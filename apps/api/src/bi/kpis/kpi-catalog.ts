import { safeRatio } from '../utils/kpi-period.util';
import { BiPeriodSnapshot, KpiDefinition, KpiEvidenceCount, KpiInput, KpiSource } from './kpi.types';

// ============================================================================
// BI 1 -- CATALOGO OFICIAL DE KPIs.
//
// Cada KPI declara metadados (formula/fonte/dimensoes/limitacoes) e o
// calculo PURO sobre BiPeriodSnapshot, lado a lado -- o texto da formula e o
// codigo que a executa nunca se separam. Os totais brutos NAO sao
// calculados aqui: vem de FleetOperationsMetricsService.computeCostTotals/
// computeRevenueTotals (mesma fonte de GET /fleet-operations/costs e
// /financial) e de FleetIdleTimeService.loadVehicleIdleData.
//
// Mudou uma formula? Incremente KPI_CATALOG_VERSION.
// ============================================================================
export const KPI_CATALOG_VERSION = '1';

const PERIOD_VEHICLE_FLEET = ['period', 'vehicle', 'fleet'];

// ---------------------------------------------------------------------------
// Fontes (reaproveitadas por varios KPIs -- uma unica descricao por fonte).
// ---------------------------------------------------------------------------
const SRC = {
  revenue: {
    entity: 'TripRevenue',
    field: 'amount',
    dateField: 'receivedAt',
    rule: 'Todas as categorias. vehicle/fleet via Trip -> TripComposition -> Vehicle.',
  },
  fuel: {
    entity: 'FuelSupply',
    field: 'totalAmount',
    dateField: 'supplyDate',
    rule: 'Custo real do abastecimento.',
  },
  fuelLiters: { entity: 'FuelSupply', field: 'liters', dateField: 'supplyDate', rule: 'Litros abastecidos.' },
  maintenance: {
    entity: 'VehicleMaintenance',
    field: 'totalCost',
    dateField: 'openedAt',
    rule: 'Exclui OS CANCELLED. Inclui pecas consumidas e mao de obra.',
  },
  tires: {
    entity: 'Tire + TireRetread',
    field: 'purchasePrice + cost',
    dateField: 'purchaseDate / retreadDate',
    rule: 'Custo de aquisicao e recapagem (nao depreciacao).',
  },
  toll: {
    entity: 'TollTransaction',
    field: 'chargedAmount',
    dateField: 'chargedAt',
    rule: 'Cobranca REAL -- nunca a estimativa de rota (RoutePlanToll).',
  },
  otherExpense: {
    entity: 'TripExpense',
    field: 'amount',
    dateField: 'expenseDate',
    rule: 'Somente APPROVED; exclui categorias FUEL/MAINTENANCE/TIRES (ja contadas na fonte primaria).',
  },
  odometer: {
    entity: 'FuelSupply.odometerKm + VehicleMaintenance.odometerKm/completionOdometerKm',
    field: 'odometerKm',
    dateField: 'supplyDate / openedAt',
    rule: 'Por veiculo: maior - menor leitura no periodo (>= 2 leituras). Soma entre veiculos.',
  },
  tripsCompleted: {
    entity: 'Trip',
    field: 'id',
    dateField: 'actualArrival',
    rule: 'status COMPLETED, nao excluida (deletedAt null).',
  },
  deliveries: {
    entity: 'TripDeliveryStop',
    field: 'id',
    dateField: 'deliveredAt',
    rule: 'status COMPLETED, viagem nao excluida.',
  },
  onTime: {
    entity: 'TripDeliveryStop',
    field: 'plannedArrival x (actualArrival ?? deliveredAt)',
    dateField: 'deliveredAt',
    rule: 'Elegivel: COMPLETED com plannedArrival informado. No prazo: chegada real <= plannedArrival.',
  },
  occurrences: {
    entity: 'TripOccurrence',
    field: 'id',
    dateField: 'occurredAt',
    rule: 'Exclui canceladas (cancelledAt). vehicle/fleet via TripOccurrence.vehicleId.',
  },
  tripTime: {
    entity: 'Trip',
    field: 'actualDeparture -> actualArrival',
    dateField: 'intervalo recortado ao periodo',
    rule: 'COMPLETED/IN_PROGRESS/PAUSED; viagem ativa conta ate agora. Intervalos unidos por veiculo.',
  },
  maintenanceTime: {
    entity: 'VehicleMaintenance',
    field: '(startedAt ?? openedAt) -> completedAt',
    dateField: 'intervalo recortado ao periodo',
    rule: 'Exclui CANCELLED; OS aberta conta ate o fim efetivo do periodo. Sem minutos duplicados.',
  },
  vehicles: {
    entity: 'Vehicle',
    field: 'status, createdAt',
    dateField: '-',
    rule: 'Capacidade = veiculos nao excluidos e com status atual != SOLD/INACTIVE, desde o cadastro.',
  },
} satisfies Record<string, KpiSource>;

const COST_SOURCES: KpiSource[] = [SRC.fuel, SRC.maintenance, SRC.tires, SRC.toll, SRC.otherExpense];

// ---------------------------------------------------------------------------
// Helpers de entradas/evidencias (mesmo formato em todos os KPIs).
// ---------------------------------------------------------------------------
function costInputs(s: BiPeriodSnapshot): KpiInput[] {
  return [
    { key: 'fuelCost', label: 'Combustivel', value: s.costs.fuelCost, unit: 'BRL' },
    { key: 'maintenanceCost', label: 'Manutencao', value: s.costs.maintenanceCost, unit: 'BRL' },
    { key: 'tireCost', label: 'Pneus', value: s.costs.tireCost, unit: 'BRL' },
    { key: 'tollCost', label: 'Pedagio', value: s.costs.tollCost, unit: 'BRL' },
    { key: 'otherCost', label: 'Outras despesas', value: s.costs.otherCost, unit: 'BRL' },
    { key: 'totalCost', label: 'Custo operacional total', value: s.costs.totalCost, unit: 'BRL' },
  ];
}

function costEvidence(s: BiPeriodSnapshot): KpiEvidenceCount[] {
  const c = s.costs.recordCounts;
  return [
    { source: 'FUEL_SUPPLY', recordCount: c.fuelSupplies },
    { source: 'VEHICLE_MAINTENANCE', recordCount: c.maintenances },
    { source: 'TIRE_PURCHASE', recordCount: c.tires },
    { source: 'TIRE_RETREAD', recordCount: c.tireRetreads },
    { source: 'TOLL_TRANSACTION', recordCount: c.tollTransactions },
    { source: 'TRIP_EXPENSE_OTHER', recordCount: c.otherExpenses },
  ];
}

function distanceInputs(s: BiPeriodSnapshot): KpiInput[] {
  return [
    { key: 'distanceKm', label: 'Distancia (odometro)', value: s.costs.distance?.totalDistanceKm ?? null, unit: 'KM' },
    {
      key: 'vehiclesWithDistance',
      label: 'Veiculos com distancia qualificada',
      value: s.costs.distance?.vehicleDistances.size ?? 0,
      unit: 'COUNT',
    },
    { key: 'odometerReadings', label: 'Leituras de odometro', value: s.costs.distance?.odometerReadings ?? 0, unit: 'COUNT' },
  ];
}

// Leituras de odometro vem de FuelSupply e VehicleMaintenance -- as
// mesmas fontes listaveis como evidencia.
function distanceEvidence(s: BiPeriodSnapshot): KpiEvidenceCount[] {
  return [
    { source: 'FUEL_SUPPLY', recordCount: s.costs.recordCounts.fuelSupplies },
    { source: 'VEHICLE_MAINTENANCE', recordCount: s.costs.recordCounts.maintenances },
  ];
}

const NO_DISTANCE =
  'Nenhum veiculo do escopo possui pelo menos 2 leituras de odometro (abastecimento ou manutencao) no periodo.';
const NO_FLEET_CAPACITY = 'Nenhum veiculo em operacao no escopo durante o periodo (ou periodo inteiramente no futuro).';

function fleetTimeInputs(s: BiPeriodSnapshot): KpiInput[] {
  const t = s.fleetTime;
  return [
    { key: 'vehiclesConsidered', label: 'Veiculos considerados', value: t.vehiclesConsidered, unit: 'COUNT' },
    { key: 'capacityHours', label: 'Capacidade (veiculo x horas)', value: t.capacityMinutes / 60, unit: 'HOURS' },
    { key: 'tripHours', label: 'Horas em viagem', value: t.tripMinutes / 60, unit: 'HOURS' },
    { key: 'maintenanceHours', label: 'Horas em manutencao', value: t.maintenanceMinutes / 60, unit: 'HOURS' },
    { key: 'idleHours', label: 'Horas ociosas (liquidas de manutencao)', value: t.idleNetMinutes / 60, unit: 'HOURS' },
  ];
}

function fleetTimeEvidence(s: BiPeriodSnapshot): KpiEvidenceCount[] {
  return [{ source: 'FLEET_TIME', recordCount: s.fleetTime.tripsConsidered + s.fleetTime.idleSegmentsConsidered }];
}

function perKm(
  numerator: number,
  numeratorInput: KpiInput[],
  numeratorEvidence: KpiEvidenceCount[],
  s: BiPeriodSnapshot,
) {
  const distanceKm = s.costs.distance?.totalDistanceKm ?? null;
  const value = safeRatio(numerator, distanceKm);
  return {
    value,
    ...(value === null ? { unavailableReason: NO_DISTANCE } : {}),
    inputs: [...numeratorInput, ...distanceInputs(s)],
    evidence: [...numeratorEvidence, ...distanceEvidence(s)],
  };
}

// ---------------------------------------------------------------------------
// Catalogo
// ---------------------------------------------------------------------------
export const KPI_CATALOG: readonly KpiDefinition[] = [
  // ----------------------------- FINANCEIRO -------------------------------
  {
    id: 'revenue',
    name: 'Receita',
    description: 'Receita de viagens recebida no periodo.',
    category: 'FINANCIAL',
    unit: 'BRL',
    direction: 'HIGHER_IS_BETTER',
    formula: 'SUM(TripRevenue.amount) com receivedAt no periodo',
    sources: [SRC.revenue],
    dimensions: PERIOD_VEHICLE_FLEET,
    limitations: ['Receita sem viagem com veiculo vinculado nao entra quando filtrado por veiculo/frota.'],
    compute: (s) => ({
      value: s.revenue.totalRevenue,
      inputs: [{ key: 'totalRevenue', label: 'Receita', value: s.revenue.totalRevenue, unit: 'BRL' }],
      evidence: [{ source: 'TRIP_REVENUE', recordCount: s.revenue.recordCount }],
    }),
  },
  {
    id: 'operating_cost',
    name: 'Despesas operacionais',
    description: 'Custo REALIZADO total da operacao: combustivel, manutencao, pneus, pedagio e outras despesas aprovadas.',
    category: 'FINANCIAL',
    unit: 'BRL',
    direction: 'LOWER_IS_BETTER',
    formula: 'combustivel + manutencao + pneus (compra + recapagem) + pedagio + outras despesas',
    sources: COST_SOURCES,
    dimensions: PERIOD_VEHICLE_FLEET,
    limitations: [
      'Mesma regra de GET /fleet-operations/costs (totalCost). Difere de GET /dashboard financial.approvedExpenses, que soma apenas TripExpense aprovada.',
      'Recapagem nao possui vehicleId direto: filtrada pelo veiculo/frota ATUAL do pneu.',
    ],
    compute: (s) => ({ value: s.costs.totalCost, inputs: costInputs(s), evidence: costEvidence(s) }),
  },
  {
    id: 'operating_result',
    name: 'Resultado operacional',
    description: 'Receita menos despesas operacionais realizadas.',
    category: 'FINANCIAL',
    unit: 'BRL',
    direction: 'HIGHER_IS_BETTER',
    formula: 'revenue - operating_cost',
    sources: [SRC.revenue, ...COST_SOURCES],
    dimensions: PERIOD_VEHICLE_FLEET,
    limitations: [
      'Mesma regra de GET /fleet-operations/financial (summary.result). Nao desconta adiantamentos (TripAdvance nao e custo).',
      'Difere de GET /dashboard financial.profit (receita - TripExpense aprovada).',
    ],
    compute: (s) => ({
      value: s.revenue.totalRevenue - s.costs.totalCost,
      inputs: [
        { key: 'totalRevenue', label: 'Receita', value: s.revenue.totalRevenue, unit: 'BRL' },
        { key: 'totalCost', label: 'Despesas operacionais', value: s.costs.totalCost, unit: 'BRL' },
      ],
      evidence: [{ source: 'TRIP_REVENUE', recordCount: s.revenue.recordCount }, ...costEvidence(s)],
    }),
  },
  {
    id: 'operating_margin',
    name: 'Margem operacional',
    description: 'Resultado operacional sobre a receita.',
    category: 'FINANCIAL',
    unit: 'PERCENT',
    direction: 'HIGHER_IS_BETTER',
    formula: '(revenue - operating_cost) / revenue x 100',
    sources: [SRC.revenue, ...COST_SOURCES],
    dimensions: PERIOD_VEHICLE_FLEET,
    limitations: ['Indisponivel quando nao ha receita no periodo.'],
    compute: (s) => {
      const ratio = safeRatio(s.revenue.totalRevenue - s.costs.totalCost, s.revenue.totalRevenue);
      return {
        value: ratio === null ? null : ratio * 100,
        ...(ratio === null ? { unavailableReason: 'Sem receita no periodo (divisao por zero).' } : {}),
        inputs: [
          { key: 'totalRevenue', label: 'Receita', value: s.revenue.totalRevenue, unit: 'BRL' },
          { key: 'totalCost', label: 'Despesas operacionais', value: s.costs.totalCost, unit: 'BRL' },
        ],
        evidence: [{ source: 'TRIP_REVENUE', recordCount: s.revenue.recordCount }, ...costEvidence(s)],
      };
    },
  },
  {
    id: 'fuel_cost',
    name: 'Custo de combustivel',
    description: 'Valor total abastecido no periodo.',
    category: 'FINANCIAL',
    unit: 'BRL',
    direction: 'LOWER_IS_BETTER',
    formula: 'SUM(FuelSupply.totalAmount)',
    sources: [SRC.fuel],
    dimensions: PERIOD_VEHICLE_FLEET,
    limitations: [],
    compute: (s) => ({
      value: s.costs.fuelCost,
      inputs: [{ key: 'fuelCost', label: 'Combustivel', value: s.costs.fuelCost, unit: 'BRL' }],
      evidence: [{ source: 'FUEL_SUPPLY', recordCount: s.costs.recordCounts.fuelSupplies }],
    }),
  },
  {
    id: 'toll_cost',
    name: 'Custo de pedagio',
    description: 'Pedagio efetivamente cobrado no periodo.',
    category: 'FINANCIAL',
    unit: 'BRL',
    direction: 'LOWER_IS_BETTER',
    formula: 'SUM(TollTransaction.chargedAmount)',
    sources: [SRC.toll],
    dimensions: PERIOD_VEHICLE_FLEET,
    limitations: ['Depende do lancamento/importacao das transacoes reais de pedagio.'],
    compute: (s) => ({
      value: s.costs.tollCost,
      inputs: [{ key: 'tollCost', label: 'Pedagio', value: s.costs.tollCost, unit: 'BRL' }],
      evidence: [{ source: 'TOLL_TRANSACTION', recordCount: s.costs.recordCounts.tollTransactions }],
    }),
  },
  {
    id: 'maintenance_cost',
    name: 'Custo de manutencao',
    description: 'Custo das ordens de servico abertas no periodo (exceto canceladas).',
    category: 'FINANCIAL',
    unit: 'BRL',
    direction: 'LOWER_IS_BETTER',
    formula: 'SUM(VehicleMaintenance.totalCost) com status != CANCELLED',
    sources: [SRC.maintenance],
    dimensions: PERIOD_VEHICLE_FLEET,
    limitations: ['Recortado pela data de ABERTURA da OS (openedAt), mesma regra do dashboard de custos.'],
    compute: (s) => ({
      value: s.costs.maintenanceCost,
      inputs: [{ key: 'maintenanceCost', label: 'Manutencao', value: s.costs.maintenanceCost, unit: 'BRL' }],
      evidence: [{ source: 'VEHICLE_MAINTENANCE', recordCount: s.costs.recordCounts.maintenances }],
    }),
  },

  // ----------------------------- OPERACIONAL ------------------------------
  {
    id: 'trips_completed',
    name: 'Viagens concluidas',
    description: 'Viagens concluidas (chegada real) dentro do periodo.',
    category: 'OPERATIONAL',
    unit: 'COUNT',
    direction: 'HIGHER_IS_BETTER',
    formula: 'COUNT(Trip) com status COMPLETED e actualArrival no periodo',
    sources: [SRC.tripsCompleted],
    dimensions: PERIOD_VEHICLE_FLEET,
    limitations: [
      'Recorta por actualArrival (conclusao real). Os contadores de GET /dashboard usam createdAt e medem outra coisa (viagens criadas).',
    ],
    compute: (s) => ({
      value: s.trips.completed,
      inputs: [{ key: 'completedTrips', label: 'Viagens concluidas', value: s.trips.completed, unit: 'COUNT' }],
      evidence: [{ source: 'TRIP_COMPLETED', recordCount: s.trips.completed }],
    }),
  },
  {
    id: 'deliveries_completed',
    name: 'Entregas realizadas',
    description: 'Paradas de entrega concluidas no periodo.',
    category: 'OPERATIONAL',
    unit: 'COUNT',
    direction: 'HIGHER_IS_BETTER',
    formula: 'COUNT(TripDeliveryStop) com status COMPLETED e deliveredAt no periodo',
    sources: [SRC.deliveries],
    dimensions: PERIOD_VEHICLE_FLEET,
    limitations: ['Viagens sem paradas de entrega cadastradas nao geram entregas.'],
    compute: (s) => ({
      value: s.deliveries.completed,
      inputs: [{ key: 'completedDeliveries', label: 'Entregas concluidas', value: s.deliveries.completed, unit: 'COUNT' }],
      evidence: [{ source: 'DELIVERY_COMPLETED', recordCount: s.deliveries.completed }],
    }),
  },
  {
    id: 'distance_km',
    name: 'Distancia percorrida',
    description: 'Quilometragem real da frota no periodo, pelo odometro.',
    category: 'OPERATIONAL',
    unit: 'KM',
    direction: 'NEUTRAL',
    formula: 'SUM por veiculo de (MAX(odometro) - MIN(odometro)) no periodo, veiculos com >= 2 leituras',
    sources: [SRC.odometer],
    dimensions: PERIOD_VEHICLE_FLEET,
    limitations: [
      'Mesma distancia de GET /fleet-operations/costs (costPerKm.distanceKm). Depende de abastecimentos/OS com odometro; veiculo com < 2 leituras fica de fora.',
      'TripMetrics.actualDistanceKm (so preenchido quando a viagem e concluida com odometro final) nao e usado: cobertura parcial.',
    ],
    compute: (s) => {
      const value = s.costs.distance?.totalDistanceKm ?? null;
      return {
        value,
        ...(value === null ? { unavailableReason: NO_DISTANCE } : {}),
        inputs: distanceInputs(s),
        evidence: distanceEvidence(s),
      };
    },
  },
  {
    id: 'cost_per_km',
    name: 'Custo por km',
    description: 'Despesas operacionais divididas pela distancia percorrida.',
    category: 'OPERATIONAL',
    unit: 'BRL_PER_KM',
    direction: 'LOWER_IS_BETTER',
    formula: 'operating_cost / distance_km',
    sources: [...COST_SOURCES, SRC.odometer],
    dimensions: PERIOD_VEHICLE_FLEET,
    limitations: [
      'Mesmo valor de GET /fleet-operations/costs (costPerKm.value): custo TOTAL do escopo sobre a distancia dos veiculos qualificados.',
    ],
    compute: (s) => perKm(s.costs.totalCost, costInputs(s), costEvidence(s), s),
  },
  {
    id: 'revenue_per_km',
    name: 'Receita por km',
    description: 'Receita dividida pela distancia percorrida.',
    category: 'OPERATIONAL',
    unit: 'BRL_PER_KM',
    direction: 'HIGHER_IS_BETTER',
    formula: 'revenue / distance_km',
    sources: [SRC.revenue, SRC.odometer],
    dimensions: PERIOD_VEHICLE_FLEET,
    limitations: ['Distancia inclui deslocamentos vazios -- mede receita por km RODADO, nao por km carregado.'],
    compute: (s) =>
      perKm(
        s.revenue.totalRevenue,
        [{ key: 'totalRevenue', label: 'Receita', value: s.revenue.totalRevenue, unit: 'BRL' }],
        [{ source: 'TRIP_REVENUE', recordCount: s.revenue.recordCount }],
        s,
      ),
  },
  {
    id: 'fuel_liters',
    name: 'Combustivel consumido',
    description: 'Litros abastecidos no periodo.',
    category: 'OPERATIONAL',
    unit: 'LITERS',
    direction: 'LOWER_IS_BETTER',
    formula: 'SUM(FuelSupply.liters)',
    sources: [SRC.fuelLiters],
    dimensions: PERIOD_VEHICLE_FLEET,
    limitations: ['Litros abastecidos, nao consumo medido. Consumo km/L segue em GET /fleet-operations/fuel.'],
    compute: (s) => ({
      value: s.costs.fuelLiters,
      inputs: [{ key: 'fuelLiters', label: 'Litros', value: s.costs.fuelLiters, unit: 'LITERS' }],
      evidence: [{ source: 'FUEL_SUPPLY', recordCount: s.costs.recordCounts.fuelSupplies }],
    }),
  },
  {
    id: 'occurrences_total',
    name: 'Ocorrencias',
    description: 'Ocorrencias de viagem registradas no periodo (exceto canceladas).',
    category: 'OPERATIONAL',
    unit: 'COUNT',
    direction: 'LOWER_IS_BETTER',
    formula: 'COUNT(TripOccurrence) com occurredAt no periodo e cancelledAt nulo',
    sources: [SRC.occurrences],
    dimensions: PERIOD_VEHICLE_FLEET,
    limitations: ['Com filtro de veiculo/frota, ocorrencias sem vehicleId ficam de fora.'],
    compute: (s) => ({
      value: s.occurrences.total,
      inputs: [
        { key: 'occurrences', label: 'Ocorrencias', value: s.occurrences.total, unit: 'COUNT' },
        { key: 'criticalOccurrences', label: 'Criticas', value: s.occurrences.critical, unit: 'COUNT' },
      ],
      evidence: [{ source: 'TRIP_OCCURRENCE', recordCount: s.occurrences.total }],
    }),
  },
  {
    id: 'occurrences_critical',
    name: 'Ocorrencias criticas',
    description: 'Ocorrencias de severidade CRITICAL no periodo (exceto canceladas).',
    category: 'OPERATIONAL',
    unit: 'COUNT',
    direction: 'LOWER_IS_BETTER',
    formula: 'COUNT(TripOccurrence) com severity CRITICAL, occurredAt no periodo e cancelledAt nulo',
    sources: [SRC.occurrences],
    dimensions: PERIOD_VEHICLE_FLEET,
    limitations: ['Com filtro de veiculo/frota, ocorrencias sem vehicleId ficam de fora.'],
    compute: (s) => ({
      value: s.occurrences.critical,
      inputs: [{ key: 'criticalOccurrences', label: 'Criticas', value: s.occurrences.critical, unit: 'COUNT' }],
      evidence: [{ source: 'TRIP_OCCURRENCE', recordCount: s.occurrences.critical }],
    }),
  },

  // --------------------------- NIVEL DE SERVICO ---------------------------
  {
    id: 'on_time_delivery_rate',
    name: 'Entregas no prazo',
    description: 'Percentual das entregas concluidas com previsao informada que chegaram ate a previsao.',
    category: 'SERVICE_LEVEL',
    unit: 'PERCENT',
    direction: 'HIGHER_IS_BETTER',
    formula: 'COUNT(chegada real <= plannedArrival) / COUNT(entregas COMPLETED com plannedArrival) x 100',
    sources: [SRC.onTime],
    dimensions: PERIOD_VEHICLE_FLEET,
    limitations: [
      'plannedArrival e informado manualmente (opcional): entregas sem previsao nao entram no denominador -- veja o input coverage.',
      'Sem tolerancia: 1 minuto apos a previsao ja conta como atraso.',
    ],
    compute: (s) => {
      const ratio = safeRatio(s.deliveries.onTime, s.deliveries.withDeadline);
      const coverage = safeRatio(s.deliveries.withDeadline, s.deliveries.completed);
      return {
        value: ratio === null ? null : ratio * 100,
        ...(ratio === null
          ? { unavailableReason: 'Nenhuma entrega concluida no periodo com previsao de chegada (plannedArrival).' }
          : {}),
        inputs: [
          { key: 'onTimeDeliveries', label: 'Entregas no prazo', value: s.deliveries.onTime, unit: 'COUNT' },
          { key: 'deliveriesWithDeadline', label: 'Entregas com previsao', value: s.deliveries.withDeadline, unit: 'COUNT' },
          { key: 'completedDeliveries', label: 'Entregas concluidas', value: s.deliveries.completed, unit: 'COUNT' },
          { key: 'coverage', label: 'Cobertura (com previsao / concluidas)', value: coverage === null ? null : coverage * 100, unit: 'PERCENT' },
        ],
        evidence: [{ source: 'DELIVERY_COMPLETED', recordCount: s.deliveries.completed }],
      };
    },
  },

  // -------------------------------- FROTA ---------------------------------
  {
    id: 'fleet_utilization',
    name: 'Utilizacao da frota',
    description: 'Parcela do tempo disponivel da frota em que os veiculos estavam em viagem.',
    category: 'FLEET',
    unit: 'PERCENT',
    direction: 'HIGHER_IS_BETTER',
    formula: 'horas em viagem (recortadas ao periodo) / (veiculos x horas do periodo) x 100',
    sources: [SRC.tripTime, SRC.vehicles],
    dimensions: PERIOD_VEHICLE_FLEET,
    limitations: [
      'Usa o status ATUAL do veiculo (nao ha historico de status).',
      'Periodo em andamento conta so ate agora.',
      'GET /fleet-operations/operations (utilizationPercent) usa uma aproximacao anterior (duracao total de viagens CRIADAS no periodo / veiculos ACTIVE); este KPI e a regra oficial do BI.',
    ],
    compute: (s) => {
      const ratio = safeRatio(s.fleetTime.tripMinutes, s.fleetTime.capacityMinutes);
      return {
        value: ratio === null ? null : ratio * 100,
        ...(ratio === null ? { unavailableReason: NO_FLEET_CAPACITY } : {}),
        inputs: fleetTimeInputs(s),
        evidence: fleetTimeEvidence(s),
      };
    },
  },
  {
    id: 'fleet_availability',
    name: 'Disponibilidade da frota',
    description: 'Parcela do tempo da frota fora de manutencao.',
    category: 'FLEET',
    unit: 'PERCENT',
    direction: 'HIGHER_IS_BETTER',
    formula: '(capacidade - horas em manutencao) / capacidade x 100',
    sources: [SRC.maintenanceTime, SRC.vehicles],
    dimensions: PERIOD_VEHICLE_FLEET,
    limitations: [
      'Indisponibilidade considera apenas OS de manutencao (datas de execucao). Suspensao/inatividade administrativa nao tem historico.',
    ],
    compute: (s) => {
      const t = s.fleetTime;
      const ratio = safeRatio(t.capacityMinutes - t.maintenanceMinutes, t.capacityMinutes);
      return {
        value: ratio === null ? null : ratio * 100,
        ...(ratio === null ? { unavailableReason: NO_FLEET_CAPACITY } : {}),
        inputs: fleetTimeInputs(s),
        evidence: fleetTimeEvidence(s),
      };
    },
  },
  {
    id: 'idle_hours',
    name: 'Tempo ocioso',
    description: 'Horas em que veiculos ficaram parados entre viagens (descontada a manutencao).',
    category: 'FLEET',
    unit: 'HOURS',
    direction: 'LOWER_IS_BETTER',
    formula: 'SUM(periodos ociosos entre actualArrival e a proxima actualDeparture, recortados ao periodo) - manutencao',
    sources: [SRC.tripTime, SRC.maintenanceTime],
    dimensions: PERIOD_VEHICLE_FLEET,
    limitations: [
      'Mesma regra de GET /fleet-operations/idle-time, recortada ao periodo. Veiculo sem nenhuma viagem concluida nao gera ociosidade (nao ha ancora).',
      'Periodo ocioso corrente (veiculo parado ate agora) e estimativa.',
    ],
    compute: (s) => ({
      value: s.fleetTime.vehiclesConsidered > 0 ? s.fleetTime.idleNetMinutes / 60 : null,
      ...(s.fleetTime.vehiclesConsidered > 0 ? {} : { unavailableReason: NO_FLEET_CAPACITY }),
      inputs: fleetTimeInputs(s),
      evidence: fleetTimeEvidence(s),
    }),
  },
];

export function findKpiDefinition(id: string): KpiDefinition | undefined {
  return KPI_CATALOG.find((k) => k.id === id);
}

// KPIs pedidos pelo roadmap que NAO tem base confiavel hoje -- expostos no
// catalogo como dependencias documentadas, nunca calculados.
export const KPI_PENDING_DEPENDENCIES: readonly { id: string; name: string; dependency: string }[] = [
  {
    id: 'fuel_consumption_km_l',
    name: 'Consumo medio (km/L)',
    dependency: 'Ja calculado por GET /fleet-operations/fuel (metodologia entre abastecimentos); integracao ao catalogo prevista para o BI 4.',
  },
  {
    id: 'vehicle_status_availability',
    name: 'Disponibilidade por status administrativo',
    dependency: 'Exige historico de Vehicle.status (hoje so o status atual e persistido).',
  },
  {
    id: 'loaded_km_ratio',
    name: 'Km carregado x km vazio',
    dependency: 'Exige TripMetrics.actualDistanceKm preenchido de forma consistente (hoje so quando a viagem e concluida com odometro final).',
  },
];
