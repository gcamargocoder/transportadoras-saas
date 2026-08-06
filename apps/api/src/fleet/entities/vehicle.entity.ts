import { ApiProperty } from '@nestjs/swagger';
import { VehicleType } from '@prisma/client';

export class VehicleEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  fleetId!: string | null;

  @ApiProperty()
  plate!: string;

  @ApiProperty({ nullable: true })
  renavam!: string | null;

  @ApiProperty({ nullable: true })
  chassisNumber!: string | null;

  @ApiProperty()
  brand!: string;

  @ApiProperty()
  model!: string;

  @ApiProperty({ nullable: true })
  manufactureYear!: number | null;

  @ApiProperty({ nullable: true })
  modelYear!: number | null;

  @ApiProperty({ nullable: true })
  color!: string | null;

  @ApiProperty({ enum: VehicleType })
  type!: VehicleType;

  @ApiProperty({ nullable: true })
  category!: string | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
