import { ApiProperty } from '@nestjs/swagger';
import { TrailerType } from '@prisma/client';

export class TrailerEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty()
  plate!: string;

  @ApiProperty({ enum: TrailerType })
  type!: TrailerType;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
