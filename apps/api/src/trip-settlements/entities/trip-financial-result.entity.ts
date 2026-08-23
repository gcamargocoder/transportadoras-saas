import { ApiProperty } from '@nestjs/swagger';

// GET /trips/:id/financial-result -- Fase 71: consolida em UM lugar o
// "resultado financeiro real" da viagem, reaproveitando integralmente o que
// ja existe (nenhum motor financeiro novo/paralelo):
//   - fuelCost/tollCost/expenseCost/totalCost = EXATAMENTE
//     TripSettlementsService.getFinancialDashboard (Fase 51/66, mesma
//     agregacao ja usada por TripMetrics.actual* e por
//     FreightPricingService.getProfitability -- nunca um segundo calculo).
//   - contractedRevenue = TripFreight, mesma prioridade contratado -> final
//     -> estimado ja usada pelo faturamento operacional (Fase 59/60, ver
//     resolveTripFreightBestAmount).
//   - invoicedRevenue = TripBilling.invoicedAmount (Fase 60).
//   - receivedRevenue = invoicedAmount SOMENTE quando TripBilling.status =
//     PAID (confirmacao manual de recebimento, Fase 60); caso contrario 0.
//     Distinto do TripBillingEntity.receivedAmount (que por simplificacao
//     historica sempre repete invoicedAmount, ja que o projeto nao tem
//     gateway de pagamento) -- aqui o objetivo e refletir de fato "quanto
//     foi recebido", entao o status PAID e usado como unico sinal real
//     disponivel. Ver docs/trip-financial-result.md, secao "limitacoes".
export class TripFinancialResultEntity {
  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty({ nullable: true, description: 'TripFreight: contractedAmount -> finalAmount -> estimatedAmount, o primeiro disponivel. Null quando a viagem nao tem valor comercial calculado.' })
  contractedRevenue!: number | null;

  @ApiProperty({ description: 'TripBilling.invoicedAmount (Fase 60). 0 quando nenhum faturamento foi iniciado.' })
  invoicedRevenue!: number;

  @ApiProperty({ description: 'invoicedAmount quando TripBilling.status = PAID; caso contrario 0 (ainda nao confirmado como recebido).' })
  receivedRevenue!: number;

  @ApiProperty({ description: 'Soma de FuelSupply.totalAmount vinculado a viagem (= TripFinancialDashboardEntity.fuelCost).' })
  fuelCost!: number;

  @ApiProperty({ description: 'Soma de TollTransaction.chargedAmount vinculado a viagem (= TripFinancialDashboardEntity.tollCost).' })
  tollCost!: number;

  @ApiProperty({ description: 'Soma de TripExpense.amount status APPROVED, todas as categorias (= TripFinancialDashboardEntity.totalExpenses).' })
  expenseCost!: number;

  @ApiProperty({ description: 'fuelCost + tollCost + expenseCost (= TripFinancialDashboardEntity.totalCost).' })
  totalCost!: number;

  @ApiProperty({ nullable: true, description: 'contractedRevenue - totalCost. Null quando contractedRevenue indisponivel.' })
  operatingResult!: number | null;

  @ApiProperty({ description: 'invoicedRevenue - totalCost.' })
  invoicedResult!: number;

  @ApiProperty({ description: 'receivedRevenue - totalCost.' })
  receivedResult!: number;

  @ApiProperty({ nullable: true, description: '(operatingResult / contractedRevenue) * 100. Null quando contractedRevenue indisponivel ou <= 0.' })
  profitMarginPercent!: number | null;

  @ApiProperty({ nullable: true, description: '(invoicedResult / invoicedRevenue) * 100. Null quando invoicedRevenue <= 0.' })
  invoicedMarginPercent!: number | null;

  @ApiProperty({ nullable: true, description: '(receivedResult / receivedRevenue) * 100. Null quando receivedRevenue <= 0.' })
  receivedMarginPercent!: number | null;

  @ApiProperty({ nullable: true, description: 'TripMetrics.actualDistanceKm. Null quando a viagem ainda nao tem distancia real apurada.' })
  distanceKm!: number | null;

  @ApiProperty({ nullable: true, description: 'contractedRevenue / distanceKm. Null quando distanceKm ou contractedRevenue indisponivel.' })
  revenuePerKm!: number | null;

  @ApiProperty({ nullable: true, description: 'totalCost / distanceKm. Null quando distanceKm indisponivel.' })
  costPerKm!: number | null;

  @ApiProperty({ nullable: true, description: 'operatingResult / distanceKm. Null quando distanceKm ou operatingResult indisponivel.' })
  profitPerKm!: number | null;
}
