import { ApiProperty } from '@nestjs/swagger';
import { DashboardChartPointEntity } from '../../dashboard/entities/dashboard-charts.entity';
import { FleetCostCategoryEntity, FleetCostFleetEntity } from './fleet-costs.entity';
import { FleetVehicleRankingEntryEntity } from './fleet-vehicle-ranking-entry.entity';

// Fase 51 -- RESUMO do dashboard financeiro. totalCost reaproveita
// EXATAMENTE FleetCostsEntity.totalCost (mesma agregacao ja existente,
// nunca recalculada em paralelo); totalExpenses aqui e TripExpense
// aprovado em QUALQUER categoria (mais amplo que FleetCostsEntity.otherCost,
// que exclui FUEL/MAINTENANCE/TIRES por ja terem fonte primaria propria).
export class FleetFinancialSummaryEntity {
  @ApiProperty({ description: 'Soma de TripRevenue.amount no escopo/periodo filtrado.' })
  totalRevenue!: number;

  @ApiProperty({ description: 'Soma de TripExpense.amount (status APPROVED, todas as categorias) no escopo filtrado.' })
  totalExpenses!: number;

  @ApiProperty({ description: 'Custo REALIZADO total: combustivel + manutencao + pneus + pedagio + outras despesas aprovadas (= FleetCostsEntity.totalCost).' })
  totalCost!: number;

  @ApiProperty({ description: 'Soma de TripAdvance.amount no escopo filtrado.' })
  totalAdvances!: number;

  @ApiProperty({ description: 'Soma de TripExpense.amount com status PENDING (aguardando aprovacao) -- nunca contado no custo/resultado.' })
  pendingExpenses!: number;

  @ApiProperty({ description: 'totalRevenue - totalCost.' })
  result!: number;

  @ApiProperty({ nullable: true, description: '(result / totalRevenue) * 100. Null quando totalRevenue = 0 (nunca 0 falso).' })
  marginPercent!: number | null;
}

// "value" = tripId ranqueado por custo/resultado; label resolvido em lote
// (nunca 1 query por viagem) a partir de origem/destino.
export class FleetFinancialTripRankingEntryEntity {
  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty({ example: 'São Paulo/SP → Curitiba/PR' })
  label!: string;

  @ApiProperty()
  value!: number;
}

// customerId=null representa receitas sem cliente vinculado (estado real,
// nunca omitido) -- mesmo principio de FleetCostFleetEntity.fleetId=null.
export class FleetFinancialCustomerEntity {
  @ApiProperty({ nullable: true, format: 'uuid' })
  customerId!: string | null;

  @ApiProperty()
  customerName!: string;

  @ApiProperty()
  amount!: number;
}

// driverId=null representa despesas sem motorista vinculado (TripExpense.driverId
// e opcional). Adiantamentos sempre tem driverId (campo obrigatorio no schema).
export class FleetFinancialDriverEntity {
  @ApiProperty({ nullable: true, format: 'uuid' })
  driverId!: string | null;

  @ApiProperty()
  driverName!: string;

  @ApiProperty()
  expenses!: number;

  @ApiProperty()
  advances!: number;
}

// GET /fleet-operations/financial -- consolida receitas/despesas/custos/
// adiantamentos com o MESMO escopo de filtro (FleetOperationsQueryDto) em
// todos os indicadores/rankings/detalhamentos (secao 6 do pedido). Nunca
// inventa dado: campos sem base de calculo confiavel (ex: manutencao por
// viagem) ficam de fora ou null, documentado em docs/fleet-operations-financial.md.
export class FleetFinancialDashboardEntity {
  @ApiProperty({ type: FleetFinancialSummaryEntity })
  summary!: FleetFinancialSummaryEntity;

  @ApiProperty({ type: [DashboardChartPointEntity], description: 'Ultimos 12 meses, ignora startDate/endDate (mesmo padrao de FleetCostsEntity.monthlyTrend).' })
  monthlyRevenue!: DashboardChartPointEntity[];

  @ApiProperty({ type: [DashboardChartPointEntity] })
  monthlyExpenses!: DashboardChartPointEntity[];

  @ApiProperty({ type: [DashboardChartPointEntity], description: 'monthlyRevenue - monthlyExpenses ponto a ponto (despesas = TripExpense amplo, nao totalCost).' })
  monthlyResult!: DashboardChartPointEntity[];

  @ApiProperty({ type: [FleetVehicleRankingEntryEntity], description: '"value" = receita total (R$) do veiculo, via Trip->TripComposition->Vehicle.' })
  topVehiclesByRevenue!: FleetVehicleRankingEntryEntity[];

  @ApiProperty({ type: [FleetVehicleRankingEntryEntity], description: '"value" = custo total (R$) do veiculo -- reaproveita o mesmo mapa de FleetCostsEntity.topVehiclesByCost.' })
  topVehiclesByExpense!: FleetVehicleRankingEntryEntity[];

  @ApiProperty({ type: [FleetCostCategoryEntity], description: 'Reaproveita FleetCostsEntity.costByCategory (mesma agregacao, sem recalcular).' })
  topExpenseCategories!: FleetCostCategoryEntity[];

  @ApiProperty({ type: [FleetFinancialTripRankingEntryEntity] })
  topTripsByCost!: FleetFinancialTripRankingEntryEntity[];

  @ApiProperty({ type: [FleetFinancialTripRankingEntryEntity], description: 'Maiores resultados (receita - despesa) por viagem.' })
  bestTripsByResult!: FleetFinancialTripRankingEntryEntity[];

  @ApiProperty({ type: [FleetFinancialTripRankingEntryEntity], description: 'Menores/piores resultados por viagem.' })
  worstTripsByResult!: FleetFinancialTripRankingEntryEntity[];

  @ApiProperty({ type: [FleetCostFleetEntity], description: 'Receita por frota (fleetId=null = "Sem frota").' })
  revenueByFleet!: FleetCostFleetEntity[];

  @ApiProperty({ type: [FleetCostFleetEntity], description: 'Reaproveita FleetCostsEntity.costByFleet.' })
  costByFleet!: FleetCostFleetEntity[];

  @ApiProperty({ type: [FleetFinancialCustomerEntity] })
  revenueByCustomer!: FleetFinancialCustomerEntity[];

  @ApiProperty({ type: [FleetFinancialDriverEntity] })
  byDriver!: FleetFinancialDriverEntity[];
}
