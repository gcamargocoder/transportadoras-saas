import { safeRatio } from '../utils/kpi-period.util';
import { BiPeriodSnapshot, KpiDefinition, KpiDimension, KpiEvidenceCount, KpiInput, KpiSource } from './kpi.types';

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
// v2 (BI 3): + tire_cost/other_cost, metadados additive/requires e dimensao
// customer (receita). Nenhuma formula existente mudou.
// v3 (Fase 6, Gestao de Combustivel): + 8 KPIs do ledger de tanque
// (fuel_tank_stock, fuel_received_liters, fuel_internal_liters,
// fuel_adjustment_liters, fuel_received_cost, fuel_average_purchase_price,
// fuel_movements_count, fuel_reconciliation_divergence_liters). Fonte
// SEPARADA de fuel_cost/fuel_liters (FuelSupply, consumo do veiculo);
// nenhuma formula existente mudou.
export const KPI_CATALOG_VERSION = '3';

const PERIOD_VEHICLE_FLEET: KpiDimension[] = ['period', 'vehicle', 'fleet'];
// Fase 6 -- KPIs do tanque proprio: "vehicle"/"fleet" nao se aplicam a
// RECEIPT/ADJUSTMENT/INITIAL_BALANCE (nunca tem veiculo) nem a
// fuel_tank_stock (saldo do tanque, nao do veiculo). So fuel_internal_liters
// aceita "vehicle" (abastecimento interno sempre vinculado a um veiculo).
const TANK_DIM: KpiDimension[] = ['period', 'tank'];
const TANK_VEHICLE_DIM: KpiDimension[] = ['period', 'tank', 'vehicle'];

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
  // Fase 6 -- ledger do tanque proprio. Distinto de `fuel`/`fuelLiters`
  // acima (FuelSupply = consumo do veiculo, abastecido interno OU externo).
  fuelTankReceipt: {
    entity: 'FuelTankMovement',
    field: 'quantityLiters, totalAmount',
    dateField: 'effectiveDate',
    rule: 'type=RECEIPT -- compra de diesel para o tanque proprio (Fase 2 da Gestao de Combustivel).',
  },
  fuelTankInternal: {
    entity: 'FuelTankMovement',
    field: 'quantityLiters',
    dateField: 'effectiveDate',
    rule: 'type=INTERNAL_FUELING -- baixa do tanque por abastecimento interno de veiculo (Fase 3); sempre vinculado a uma FuelSupply, nunca tem preco/custo proprio.',
  },
  fuelTankAdjustment: {
    entity: 'FuelTankMovement',
    field: 'quantityLiters (com sinal)',
    dateField: 'effectiveDate',
    rule: 'type=ADJUSTMENT -- gerado por conferencia de estoque (Fase 4) ou por cancelamento de abastecimento interno.',
  },
  fuelTankInventory: {
    entity: 'FuelTankInventoryCheck',
    field: 'divergenceLiters',
    dateField: 'checkedAt',
    rule: 'Divergencia (medido - teorico) congelada no momento da conferencia fisica.',
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
    dimensions: [...PERIOD_VEHICLE_FLEET, 'customer'],
    limitations: ['Receita sem viagem com veiculo vinculado nao entra quando filtrado por veiculo/frota.'],
    additive: true,
    requires: ['revenue'],
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
    additive: true,
    requires: ['costs'],
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
    additive: true,
    requires: ['revenue', 'costs'],
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
    additive: false,
    requires: ['revenue', 'costs'],
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
    additive: true,
    requires: ['costs'],
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
    additive: true,
    requires: ['costs'],
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
    additive: true,
    requires: ['costs'],
    compute: (s) => ({
      value: s.costs.maintenanceCost,
      inputs: [{ key: 'maintenanceCost', label: 'Manutencao', value: s.costs.maintenanceCost, unit: 'BRL' }],
      evidence: [{ source: 'VEHICLE_MAINTENANCE', recordCount: s.costs.recordCounts.maintenances }],
    }),
  },

  {
    id: 'tire_cost',
    name: 'Custo de pneus',
    description: 'Compras de pneus e recapagens no periodo.',
    category: 'FINANCIAL',
    unit: 'BRL',
    direction: 'LOWER_IS_BETTER',
    formula: 'SUM(Tire.purchasePrice) + SUM(TireRetread.cost)',
    sources: [SRC.tires],
    dimensions: PERIOD_VEHICLE_FLEET,
    limitations: [
      'Custo de aquisicao/recapagem no mes da compra, nao depreciacao ao longo do uso.',
      'Recapagem nao possui vehicleId direto: filtrada pelo veiculo/frota ATUAL do pneu.',
    ],
    additive: true,
    requires: ['costs'],
    compute: (s) => ({
      value: s.costs.tireCost,
      inputs: [{ key: 'tireCost', label: 'Pneus', value: s.costs.tireCost, unit: 'BRL' }],
      evidence: [
        { source: 'TIRE_PURCHASE', recordCount: s.costs.recordCounts.tires },
        { source: 'TIRE_RETREAD', recordCount: s.costs.recordCounts.tireRetreads },
      ],
    }),
  },
  {
    id: 'other_cost',
    name: 'Outras despesas',
    description: 'Despesas de viagem aprovadas fora de combustivel, manutencao e pneus (alimentacao, hospedagem, estacionamento etc.).',
    category: 'FINANCIAL',
    unit: 'BRL',
    direction: 'LOWER_IS_BETTER',
    formula: 'SUM(TripExpense.amount) APPROVED, exceto FUEL/MAINTENANCE/TIRES',
    sources: [SRC.otherExpense],
    dimensions: PERIOD_VEHICLE_FLEET,
    limitations: ['Adiantamentos (TripAdvance) nao sao custo e nao entram.'],
    additive: true,
    requires: ['costs'],
    compute: (s) => ({
      value: s.costs.otherCost,
      inputs: [
        { key: 'otherCost', label: 'Outras despesas', value: s.costs.otherCost, unit: 'BRL' },
        ...s.costs.otherCostByCategory.map((row) => ({
          key: `otherCost.${row.category}`,
          label: `Categoria ${row.category}`,
          value: row.amount,
          unit: 'BRL' as const,
        })),
      ],
      evidence: [{ source: 'TRIP_EXPENSE_OTHER', recordCount: s.costs.recordCounts.otherExpenses }],
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
    additive: true,
    requires: ['trips'],
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
    additive: true,
    requires: ['deliveries'],
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
    additive: false,
    requires: ['costs', 'distance'],
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
    additive: false,
    requires: ['costs', 'distance'],
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
    additive: false,
    requires: ['revenue', 'costs', 'distance'],
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
    additive: true,
    requires: ['costs'],
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
    dimensions: [...PERIOD_VEHICLE_FLEET, 'type', 'severity'],
    limitations: ['Com filtro de veiculo/frota, ocorrencias sem vehicleId ficam de fora.'],
    additive: true,
    requires: ['occurrences'],
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
    dimensions: [...PERIOD_VEHICLE_FLEET, 'type'],
    limitations: ['Com filtro de veiculo/frota, ocorrencias sem vehicleId ficam de fora.'],
    additive: true,
    requires: ['occurrences'],
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
    additive: false,
    requires: ['deliveries'],
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
    additive: false,
    requires: ['fleetTime'],
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
    additive: false,
    requires: ['fleetTime'],
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
    additive: true,
    requires: ['fleetTime'],
    compute: (s) => ({
      value: s.fleetTime.vehiclesConsidered > 0 ? s.fleetTime.idleNetMinutes / 60 : null,
      ...(s.fleetTime.vehiclesConsidered > 0 ? {} : { unavailableReason: NO_FLEET_CAPACITY }),
      inputs: fleetTimeInputs(s),
      evidence: fleetTimeEvidence(s),
    }),
  },

  // ------------------- GESTAO DE COMBUSTIVEL (Fase 6, BI) -----------------
  // Ledger do tanque proprio (FuelTankMovement/FuelTankInventoryCheck).
  // Distinto de fuel_cost/fuel_liters acima (FuelSupply = consumo do
  // veiculo): aqui e o estoque que a empresa possui, nunca reconciliado com
  // o consumo nesta fase (sem valorizacao de estoque -- ver limitations).
  {
    id: 'fuel_tank_stock',
    name: 'Estoque de diesel no tanque',
    description: 'Saldo do(s) tanque(s) proprios no fim do periodo, reconstruido a partir do ledger de movimentacoes.',
    category: 'OPERATIONAL',
    unit: 'LITERS',
    direction: 'NEUTRAL',
    formula: 'SOMA, por tanque do escopo, da ultima FuelTankMovement.newBalanceLiters com effectiveDate <= fim do periodo',
    sources: [SRC.fuelTankReceipt],
    dimensions: TANK_DIM,
    limitations: [
      'Ponto no tempo (saldo no fim do periodo) -- NUNCA somado entre periodos. Comparacao usa saldo x saldo, nunca soma de fluxo.',
      'Tanques sem nenhuma movimentacao ate o fim do periodo (criados depois) ficam de fora da soma.',
    ],
    additive: false,
    requires: ['fuelTank'],
    compute: (s) => {
      const t = s.fuelTank;
      return {
        value: t.stockAtEnd,
        ...(t.stockAtEnd === null
          ? { unavailableReason: 'Nenhum tanque do escopo possui movimentacao registrada ate o fim do periodo.' }
          : {}),
        inputs: [
          { key: 'stockAtEnd', label: 'Estoque no fim do periodo', value: t.stockAtEnd, unit: 'LITERS' },
          { key: 'tanksConsidered', label: 'Tanques no escopo', value: t.tanksConsidered, unit: 'COUNT' },
        ],
        evidence: [{ source: 'FUEL_TANK_STOCK_SNAPSHOT', recordCount: t.tanksConsidered }],
      };
    },
  },
  {
    id: 'fuel_received_liters',
    name: 'Diesel recebido no tanque',
    description: 'Litros recebidos por compra (RECEIPT) no tanque proprio, no periodo.',
    category: 'OPERATIONAL',
    unit: 'LITERS',
    direction: 'NEUTRAL',
    formula: 'SUM(FuelTankMovement.quantityLiters) com type=RECEIPT e effectiveDate no periodo',
    sources: [SRC.fuelTankReceipt],
    dimensions: TANK_DIM,
    limitations: [],
    additive: true,
    requires: ['fuelTank'],
    compute: (s) => ({
      value: s.fuelTank.receivedLiters,
      inputs: [{ key: 'receivedLiters', label: 'Litros recebidos', value: s.fuelTank.receivedLiters, unit: 'LITERS' }],
      evidence: [{ source: 'FUEL_TANK_RECEIPT', recordCount: s.fuelTank.receiptCount }],
    }),
  },
  {
    id: 'fuel_internal_liters',
    name: 'Diesel abastecido internamente',
    description: 'Litros dispensados do tanque proprio para abastecimento interno de veiculos, no periodo.',
    category: 'OPERATIONAL',
    unit: 'LITERS',
    direction: 'NEUTRAL',
    formula: 'SUM(FuelTankMovement.quantityLiters) com type=INTERNAL_FUELING e effectiveDate no periodo',
    sources: [SRC.fuelTankInternal],
    dimensions: TANK_VEHICLE_DIM,
    limitations: [
      'Abastecimento interno nunca tem preco/custo proprio -- diferente de fuel_cost (FuelSupply), que cobre tambem o abastecimento externo.',
    ],
    additive: true,
    requires: ['fuelTank'],
    compute: (s) => ({
      value: s.fuelTank.internalLiters,
      inputs: [{ key: 'internalLiters', label: 'Litros abastecidos internamente', value: s.fuelTank.internalLiters, unit: 'LITERS' }],
      evidence: [{ source: 'FUEL_TANK_INTERNAL_FUELING', recordCount: s.fuelTank.internalFuelingCount }],
    }),
  },
  {
    id: 'fuel_adjustment_liters',
    name: 'Ajustes de estoque do tanque',
    description: 'Soma liquida (com sinal) dos ajustes de conferencia de estoque no periodo.',
    category: 'OPERATIONAL',
    unit: 'LITERS',
    direction: 'NEUTRAL',
    formula: 'SUM(FuelTankMovement.quantityLiters) com type=ADJUSTMENT e effectiveDate no periodo',
    sources: [SRC.fuelTankAdjustment],
    dimensions: TANK_DIM,
    limitations: ['Positivo = sobra (estoque medido > teorico); negativo = falta.'],
    additive: true,
    requires: ['fuelTank'],
    compute: (s) => ({
      value: s.fuelTank.adjustmentLitersNet,
      inputs: [{ key: 'adjustmentLitersNet', label: 'Ajuste liquido', value: s.fuelTank.adjustmentLitersNet, unit: 'LITERS' }],
      evidence: [{ source: 'FUEL_TANK_ADJUSTMENT', recordCount: s.fuelTank.adjustmentCount }],
    }),
  },
  {
    id: 'fuel_received_cost',
    name: 'Custo de diesel recebido',
    description: 'Valor total pago nas compras de diesel (RECEIPT) para o tanque proprio, no periodo.',
    category: 'FINANCIAL',
    unit: 'BRL',
    direction: 'LOWER_IS_BETTER',
    formula: 'SUM(FuelTankMovement.totalAmount) com type=RECEIPT e effectiveDate no periodo',
    sources: [SRC.fuelTankReceipt],
    dimensions: TANK_DIM,
    limitations: ['Custo da COMPRA no periodo -- nao e o valor do estoque em maos (sem valorizacao/custo medio ponderado nesta fase).'],
    additive: true,
    requires: ['fuelTank'],
    compute: (s) => ({
      value: s.fuelTank.receivedCost,
      inputs: [{ key: 'receivedCost', label: 'Custo de diesel recebido', value: s.fuelTank.receivedCost, unit: 'BRL' }],
      evidence: [{ source: 'FUEL_TANK_RECEIPT', recordCount: s.fuelTank.receiptCount }],
    }),
  },
  {
    id: 'fuel_average_purchase_price',
    name: 'Preco medio de compra do diesel',
    description:
      'Preco medio, ponderado pelo volume, pago por litro nas compras (RECEIPT) do periodo. ' +
      'NAO e o custo medio ponderado do estoque em maos.',
    category: 'FINANCIAL',
    unit: 'BRL_PER_LITER',
    direction: 'LOWER_IS_BETTER',
    formula: 'SUM(RECEIPT.totalAmount) / SUM(RECEIPT.quantityLiters), apenas recebimentos com pricePerLiter informado',
    sources: [SRC.fuelTankReceipt],
    dimensions: TANK_DIM,
    limitations: [
      'Preco medio de COMPRA no periodo -- nunca o custo medio ponderado do estoque em maos (valorizacao de estoque prevista para uma fase futura, nao implementada aqui).',
      'Recebimentos sem preco por litro informado nao entram no calculo.',
    ],
    additive: false,
    requires: ['fuelTank'],
    compute: (s) => {
      const t = s.fuelTank;
      return {
        value: t.averagePurchasePrice,
        ...(t.averagePurchasePrice === null
          ? { unavailableReason: 'Nenhum recebimento com preco por litro informado no periodo.' }
          : {}),
        inputs: [
          { key: 'averagePurchasePrice', label: 'Preco medio de compra', value: t.averagePurchasePrice, unit: 'BRL_PER_LITER' },
          { key: 'pricedReceiptLiters', label: 'Litros com preco informado', value: t.pricedReceiptLiters, unit: 'LITERS' },
        ],
        evidence: [{ source: 'FUEL_TANK_RECEIPT', recordCount: t.receiptCount }],
      };
    },
  },
  {
    id: 'fuel_movements_count',
    name: 'Movimentacoes de tanque',
    description: 'Quantidade de recebimentos, abastecimentos internos e ajustes registrados no periodo.',
    category: 'OPERATIONAL',
    unit: 'COUNT',
    direction: 'NEUTRAL',
    formula: 'COUNT(FuelTankMovement) com type IN (RECEIPT, INTERNAL_FUELING, ADJUSTMENT) e effectiveDate no periodo',
    sources: [SRC.fuelTankReceipt, SRC.fuelTankInternal, SRC.fuelTankAdjustment],
    dimensions: TANK_DIM,
    limitations: ['Exclui INITIAL_BALANCE (evento unico de criacao do tanque, nao uma movimentacao operacional recorrente).'],
    additive: true,
    requires: ['fuelTank'],
    compute: (s) => ({
      value: s.fuelTank.movementsCount,
      inputs: [
        { key: 'receiptCount', label: 'Recebimentos', value: s.fuelTank.receiptCount, unit: 'COUNT' },
        { key: 'internalFuelingCount', label: 'Abastecimentos internos', value: s.fuelTank.internalFuelingCount, unit: 'COUNT' },
        { key: 'adjustmentCount', label: 'Ajustes', value: s.fuelTank.adjustmentCount, unit: 'COUNT' },
      ],
      evidence: [
        { source: 'FUEL_TANK_RECEIPT', recordCount: s.fuelTank.receiptCount },
        { source: 'FUEL_TANK_INTERNAL_FUELING', recordCount: s.fuelTank.internalFuelingCount },
        { source: 'FUEL_TANK_ADJUSTMENT', recordCount: s.fuelTank.adjustmentCount },
      ],
    }),
  },
  {
    id: 'fuel_reconciliation_divergence_liters',
    name: 'Divergencia de conferencia de estoque',
    description: 'Soma, com sinal, das divergencias registradas nas conferencias fisicas do tanque no periodo.',
    category: 'OPERATIONAL',
    unit: 'LITERS',
    direction: 'NEUTRAL',
    formula: 'SUM(FuelTankInventoryCheck.divergenceLiters) com checkedAt no periodo',
    sources: [SRC.fuelTankInventory],
    dimensions: TANK_DIM,
    limitations: [
      'Divergencia congelada no momento da conferencia -- reflete a conferencia, nao o ajuste efetivamente aplicado (nem toda conferencia gera ADJUSTMENT).',
    ],
    additive: true,
    requires: ['fuelTank'],
    compute: (s) => ({
      value: s.fuelTank.reconciliationDivergenceLiters,
      inputs: [
        { key: 'reconciliationDivergenceLiters', label: 'Divergencia', value: s.fuelTank.reconciliationDivergenceLiters, unit: 'LITERS' },
      ],
      evidence: [{ source: 'FUEL_TANK_INVENTORY_CHECK', recordCount: s.fuelTank.reconciliationChecksCount }],
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
