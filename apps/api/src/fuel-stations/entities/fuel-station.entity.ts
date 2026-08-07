import { ApiProperty } from '@nestjs/swagger';

export class FuelStationEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  cnpj!: string | null;

  @ApiProperty({ nullable: true })
  city!: string | null;

  @ApiProperty({ nullable: true })
  state!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
