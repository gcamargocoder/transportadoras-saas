import { ApiProperty } from '@nestjs/swagger';

export class FuelDashboardTopEntryEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  count!: number;
}

// GET /fuel-supplies/dashboard -- "veiculo/motorista que mais abasteceu" e
// "posto mais utilizado" sao pela QUANTIDADE de abastecimentos (contagem de
// lancamentos), nao pelo volume/valor.
export class FuelDashboardEntity {
  @ApiProperty({ description: 'Quantidade de abastecimentos no periodo/filtro.' })
  suppliesCount!: number;

  @ApiProperty()
  totalLiters!: number;

  @ApiProperty()
  totalAmount!: number;

  @ApiProperty({
    nullable: true,
    description: 'Media do consumo (km/l) agregada entre todos os veiculos do filtro.',
  })
  averageConsumptionKmL!: number | null;

  @ApiProperty({
    nullable: true,
    description: 'totalAmount / distancia total percorrida no filtro.',
  })
  costPerKm!: number | null;

  @ApiProperty({ type: FuelDashboardTopEntryEntity, nullable: true })
  mostUsedStation!: FuelDashboardTopEntryEntity | null;

  @ApiProperty({ type: FuelDashboardTopEntryEntity, nullable: true })
  topVehicle!: FuelDashboardTopEntryEntity | null;

  @ApiProperty({ type: FuelDashboardTopEntryEntity, nullable: true })
  topDriver!: FuelDashboardTopEntryEntity | null;
}
