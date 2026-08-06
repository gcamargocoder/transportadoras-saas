import { ApiProperty } from '@nestjs/swagger';
import { RouteVersionReason } from '@prisma/client';

// geometry (PostGIS) nao e exposto -- fora do escopo desta fase.
export class RouteVersionEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty()
  versionNumber!: number;

  @ApiProperty({ enum: RouteVersionReason })
  reason!: RouteVersionReason;

  @ApiProperty()
  createdAt!: Date;
}
