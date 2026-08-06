import { ApiProperty } from '@nestjs/swagger';

// Valores executados (actual*) ficam sempre null nesta fase -- serao
// preenchidos por fases futuras (rastreamento/telemetria/pedagio).
export class TripMetricsEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty({ nullable: true })
  plannedDistanceKm!: number | null;

  @ApiProperty({ nullable: true })
  plannedDurationMin!: number | null;

  @ApiProperty({ nullable: true })
  plannedFuelLiters!: number | null;

  @ApiProperty({ nullable: true })
  plannedTollAmount!: number | null;

  @ApiProperty({ nullable: true })
  plannedTotalCost!: number | null;

  @ApiProperty({ nullable: true })
  actualDistanceKm!: number | null;

  @ApiProperty({ nullable: true })
  actualDurationMin!: number | null;

  @ApiProperty({ nullable: true })
  actualFuelLiters!: number | null;

  @ApiProperty({ nullable: true })
  actualTollAmount!: number | null;

  @ApiProperty({ nullable: true })
  actualTotalCost!: number | null;

  @ApiProperty()
  updatedAt!: Date;
}
