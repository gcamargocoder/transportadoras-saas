import { ApiProperty } from '@nestjs/swagger';
import { RouteEventType } from '@prisma/client';

export class RouteEventEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty({ enum: RouteEventType })
  type!: RouteEventType;

  @ApiProperty()
  detectedAt!: Date;

  @ApiProperty({ nullable: true })
  resolvedAt!: Date | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  resultingRouteVersionId!: string | null;
}
