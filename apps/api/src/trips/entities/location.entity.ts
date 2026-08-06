import { ApiProperty } from '@nestjs/swagger';
import { LocationType } from '@prisma/client';

export class LocationEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: LocationType })
  type!: LocationType;

  @ApiProperty({ nullable: true })
  address!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
