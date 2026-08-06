import { ApiProperty } from '@nestjs/swagger';
import { FleetType } from '@prisma/client';

export class FleetEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: FleetType })
  type!: FleetType;

  @ApiProperty({ format: 'uuid', nullable: true })
  locationId!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
