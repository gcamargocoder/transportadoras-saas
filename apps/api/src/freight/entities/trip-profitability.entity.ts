import { ApiProperty } from '@nestjs/swagger';

// Reaproveita TripSettlementsService.getFinancialDashboard (Fase 51) para
// realizedRevenue/realizedCost/realResult -- nenhum custo e recalculado
// aqui (secao 9). "Custo previsto" nao existe como conceito em nenhum
// lugar do projeto; por isso projectedMargin/projectedResult comparam o
// valor CONTRATADO contra o custo JA REALIZADO conhecido ate o momento
// (nunca uma estimativa de custo inventada) -- ver docs/freight-management.md.
export class TripProfitabilityEntity {
  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty({ nullable: true })
  contractedAmount!: number | null;

  @ApiProperty({ description: 'false quando a viagem nao tem nenhum valor comercial calculado/contratado.' })
  contractedAmountAvailable!: boolean;

  @ApiProperty()
  realizedRevenue!: number;

  @ApiProperty()
  realizedCost!: number;

  @ApiProperty({ nullable: true })
  projectedMargin!: number | null;

  @ApiProperty({ nullable: true })
  projectedResult!: number | null;

  @ApiProperty()
  realResult!: number;

  @ApiProperty({ nullable: true })
  resultDifference!: number | null;
}
