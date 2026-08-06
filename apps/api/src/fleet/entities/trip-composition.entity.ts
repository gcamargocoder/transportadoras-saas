import { ApiProperty } from '@nestjs/swagger';
import { AxleConfigurationEntity } from './axle-configuration.entity';
import { TripCompositionTrailerEntity } from './trip-composition-trailer.entity';

export class TripCompositionEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'Preenchido quando a viagem for criada (fase futura).',
  })
  tripId!: string | null;

  @ApiProperty({ format: 'uuid' })
  vehicleId!: string;

  @ApiProperty()
  vehiclePlate!: string;

  @ApiProperty({ type: [TripCompositionTrailerEntity] })
  trailers!: TripCompositionTrailerEntity[];

  @ApiProperty({ type: AxleConfigurationEntity, nullable: true })
  axleConfiguration!: AxleConfigurationEntity | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
