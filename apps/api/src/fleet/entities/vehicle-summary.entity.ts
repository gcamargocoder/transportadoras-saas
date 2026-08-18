import { ApiProperty } from '@nestjs/swagger';

// Indicadores do cadastro de veiculos (Fase 62) -- contagens globais do
// tenant, calculadas via groupBy/count em paralelo (independente da
// quantidade de veiculos, mesmo padrao de DriverSummaryEntity/Fase 61).
export class VehicleSummaryEntity {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  totalActive!: number;

  @ApiProperty()
  totalInactive!: number;

  @ApiProperty()
  totalSuspended!: number;

  @ApiProperty()
  totalMaintenance!: number;

  @ApiProperty({ description: 'ACTIVE e sem viagem em andamento agora.' })
  totalAvailable!: number;

  @ApiProperty({ description: 'Nao-ACTIVE (INACTIVE/SUSPENDED/MAINTENANCE/SOLD) ou ACTIVE em viagem.' })
  totalUnavailable!: number;

  @ApiProperty({ description: 'ACTIVE com pelo menos 1 composicao vinculada a uma viagem em andamento agora.' })
  totalOnTrip!: number;

  @ApiProperty()
  totalOwn!: number;

  @ApiProperty()
  totalAggregated!: number;

  @ApiProperty()
  totalThirdParty!: number;
}
