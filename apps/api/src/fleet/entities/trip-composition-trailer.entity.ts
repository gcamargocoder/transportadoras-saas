import { ApiProperty } from '@nestjs/swagger';

export class TripCompositionTrailerEntity {
  @ApiProperty({ format: 'uuid' })
  trailerId!: string;

  @ApiProperty()
  positionOrder!: number;

  @ApiProperty()
  trailerPlate!: string;
}
