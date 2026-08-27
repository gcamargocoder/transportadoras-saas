import { ApiProperty } from '@nestjs/swagger';
import { CustomerProfitabilityEntity } from './customer-profitability.entity';

export class CustomerProfitabilitySummaryEntity {
  @ApiProperty()
  totalRevenue!: number;

  @ApiProperty()
  totalCost!: number;

  @ApiProperty()
  totalResult!: number;

  @ApiProperty({ nullable: true })
  marginPercent!: number | null;

  @ApiProperty()
  tripsCount!: number;

  @ApiProperty({ description: 'Quantidade de clientes com pelo menos uma viagem no periodo filtrado.' })
  customersCount!: number;
}

// GET /customer-profitability/dashboard -- indicadores gerais + ranking por
// resultado e por margem, tudo agregado em memoria sobre um lote unico de
// queries (nunca uma consulta por cliente -- ver
// CustomerProfitabilityService.computeAccumulators).
export class CustomerProfitabilityDashboardEntity {
  @ApiProperty({ type: CustomerProfitabilitySummaryEntity })
  summary!: CustomerProfitabilitySummaryEntity;

  @ApiProperty({ type: [CustomerProfitabilityEntity] })
  topByResult!: CustomerProfitabilityEntity[];

  @ApiProperty({ type: [CustomerProfitabilityEntity] })
  topByMargin!: CustomerProfitabilityEntity[];
}
