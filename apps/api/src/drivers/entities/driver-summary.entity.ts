import { ApiProperty } from '@nestjs/swagger';

// Indicadores do cadastro de motoristas (Fase 61) -- contagens globais do
// tenant, calculadas via 2 groupBy em paralelo (por type/por status),
// nunca 1 query por motorista.
export class DriverSummaryEntity {
  @ApiProperty()
  totalOwn!: number;

  @ApiProperty()
  totalAggregated!: number;

  @ApiProperty()
  totalThirdParty!: number;

  @ApiProperty()
  totalActive!: number;

  @ApiProperty()
  totalInactive!: number;

  @ApiProperty()
  totalSuspended!: number;
}
