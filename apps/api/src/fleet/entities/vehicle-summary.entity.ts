import { ApiProperty } from '@nestjs/swagger';
import { FLEET_AVAILABILITY_STATUS_VALUES, FleetAvailabilityStatus } from './vehicle.entity';

// Fase 86 -- quantidade e percentual por status operacional (5 categorias:
// disponivel/em viagem/em manutencao/indisponivel/inativo), reaproveitando as
// MESMAS contagens ja calculadas por VehiclesService.getSummary (nenhuma
// query adicional). percent nunca divide por zero (0 quando total=0).
export class VehicleAvailabilityBreakdownEntity {
  @ApiProperty({ enum: FLEET_AVAILABILITY_STATUS_VALUES })
  status!: FleetAvailabilityStatus;

  @ApiProperty()
  count!: number;

  @ApiProperty({ description: 'count / total * 100, arredondado a 1 casa decimal. 0 quando total=0.' })
  percent!: number;
}

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

  @ApiProperty({
    type: [VehicleAvailabilityBreakdownEntity],
    description:
      'Fase 86 -- sempre 5 entradas (AVAILABLE/ON_TRIP/MAINTENANCE/INACTIVE/UNAVAILABLE), nessa ordem. ' +
      'UNAVAILABLE agrupa SUSPENDED+SOLD (mesma taxonomia de FleetAvailabilityStatus).',
  })
  availabilityBreakdown!: VehicleAvailabilityBreakdownEntity[];
}
