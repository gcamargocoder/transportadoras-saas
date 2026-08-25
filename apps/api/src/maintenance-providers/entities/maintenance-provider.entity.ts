import { ApiProperty } from '@nestjs/swagger';
import { MaintenanceProviderType } from '@prisma/client';

export class MaintenanceProviderEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ enum: MaintenanceProviderType })
  type!: MaintenanceProviderType;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  tradeName!: string | null;

  @ApiProperty({ nullable: true })
  document!: string | null;

  @ApiProperty({ nullable: true })
  phone!: string | null;

  @ApiProperty({ nullable: true })
  email!: string | null;

  @ApiProperty({ nullable: true })
  address!: string | null;

  @ApiProperty({ nullable: true })
  contactName!: string | null;

  @ApiProperty({ nullable: true })
  specialties!: string | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
