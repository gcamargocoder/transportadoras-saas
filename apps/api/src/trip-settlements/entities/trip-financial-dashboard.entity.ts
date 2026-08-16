import { ApiProperty } from '@nestjs/swagger';

// GET /trips/:id/financial-dashboard -- despesas consideram somente
// TripExpense.status = APPROVED (mesma regra explicita do fechamento).
// profit ("Lucro") = receitas - despesas; netResult ("Resultado liquido")
// = profit - adiantamentos (adiantamento e recuperavel/descontado do
// motorista depois, entao nao e tratado como custo definitivo no Lucro).
export class TripFinancialDashboardEntity {
  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty({ description: 'Soma de TripRevenue.amount.' })
  totalRevenue!: number;

  @ApiProperty({ description: 'Soma de TripExpense.amount (status APPROVED).' })
  totalExpenses!: number;

  @ApiProperty({ description: 'Soma de TripAdvance.amount.' })
  totalAdvances!: number;

  @ApiProperty({ description: 'totalRevenue - totalExpenses.' })
  profit!: number;

  @ApiProperty({ description: 'profit - totalAdvances.' })
  netResult!: number;

  @ApiProperty({ description: '(profit / totalRevenue) * 100. 0 quando totalRevenue = 0.' })
  marginPercentage!: number;

  @ApiProperty({
    description: 'Quantidade total de lancamentos (receitas + despesas aprovadas + adiantamentos).',
  })
  entryCount!: number;

  @ApiProperty()
  revenueCount!: number;

  @ApiProperty()
  expenseCount!: number;

  @ApiProperty()
  advanceCount!: number;

  @ApiProperty()
  largestExpense!: number;

  @ApiProperty()
  largestRevenue!: number;

  // Fase 51 -- visao de custo OPERACIONAL completo (distinta de profit/
  // netResult acima, que servem o fechamento financeiro do motorista e
  // NUNCA foram alterados). fuelCost/tollCost usam o vinculo real e
  // confiavel com a viagem (FuelSupply.tripId, TollTransaction.tripId).
  @ApiProperty({ description: 'Soma de FuelSupply.totalAmount com tripId = esta viagem.' })
  fuelCost!: number;

  @ApiProperty({ description: 'Soma de TollTransaction.chargedAmount desta viagem (tripId sempre presente no schema).' })
  tollCost!: number;

  @ApiProperty({
    nullable: true,
    description:
      'Sempre null -- VehicleMaintenance nao tem vinculo com viagem (sem campo tripId no schema). ' +
      'Nunca estimado; indisponibilidade real e explicita.',
  })
  maintenanceCost!: number | null;

  @ApiProperty({ description: 'totalExpenses + fuelCost + tollCost (maintenanceCost excluido -- indisponivel).' })
  totalCost!: number;

  @ApiProperty({ description: 'totalRevenue - totalCost.' })
  grossResult!: number;

  @ApiProperty({ description: 'grossResult - totalAdvances.' })
  finalResult!: number;
}
