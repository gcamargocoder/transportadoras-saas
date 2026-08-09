import { ApiProperty } from '@nestjs/swagger';
import { SyncStatus, TripStopType } from '@prisma/client';

export class TripStopEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty({ format: 'uuid' })
  vehicleId!: string;

  @ApiProperty({ format: 'uuid' })
  driverId!: string;

  @ApiProperty({ enum: TripStopType })
  type!: TripStopType;

  @ApiProperty()
  latitude!: number;

  @ApiProperty()
  longitude!: number;

  @ApiProperty()
  startedAt!: Date;

  @ApiProperty({ nullable: true })
  endedAt!: Date | null;

  @ApiProperty({ nullable: true })
  durationMinutes!: number | null;

  @ApiProperty({ nullable: true })
  locationLabel!: string | null;

  @ApiProperty({ enum: SyncStatus })
  syncStatus!: SyncStatus;

  @ApiProperty()
  createdAt!: Date;
}
