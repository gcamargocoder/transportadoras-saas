import { ApiProperty } from '@nestjs/swagger';

// Fase 97 -- consolidacao de receita/custo/resultado por Customer, SEMPRE
// calculada ao vivo (nunca persistida). Mesma metodologia de custo ja usada
// por TripSettlementsService.getFinancialDashboard/getFinancialResult
// (Fases 51/71): custo = TripExpense (status APPROVED) + FuelSupply +
// TollTransaction -- nunca inclui manutencao (sem vinculo confiavel no
// schema, mesma limitacao ja documentada em TripFinancialDashboardEntity.
// maintenanceCost). Receita = TripRevenue.amount. Nenhum dado de
// Receivable/Payable/FinancialAccount e lido aqui -- esses acompanham
// faturamento/cobranca, um conceito distinto de "receita/custo realizados"
// (mesmo raciocinio ja documentado em docs/trip-financial-result.md).
export class CustomerProfitabilityEntity {
  @ApiProperty({ format: 'uuid' })
  customerId!: string;

  @ApiProperty()
  customerName!: string;

  @ApiProperty({ description: 'Quantidade de viagens do cliente no periodo filtrado (Trip.deletedAt=null).' })
  tripsCount!: number;

  @ApiProperty({ description: 'Soma de TripRevenue.amount das viagens do cliente.' })
  revenue!: number;

  @ApiProperty({ description: 'TripExpense (APPROVED) + FuelSupply.totalAmount + TollTransaction.chargedAmount.' })
  cost!: number;

  @ApiProperty({ description: 'revenue - cost.' })
  result!: number;

  @ApiProperty({ nullable: true, description: '(result / revenue) * 100 -- null quando revenue <= 0 (nunca 0% mascarando ausencia de receita).' })
  marginPercent!: number | null;
}
