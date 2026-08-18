import { ApiProperty } from '@nestjs/swagger';
import { DriverStatus, DriverType } from '@prisma/client';

export class DriverEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'UserAccount vinculado (login opcional).',
  })
  userAccountId!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  cpf!: string;

  @ApiProperty({ nullable: true })
  rg!: string | null;

  @ApiProperty()
  cnhNumber!: string;

  @ApiProperty()
  cnhCategory!: string;

  @ApiProperty()
  cnhExpiresAt!: Date;

  @ApiProperty({ nullable: true })
  birthDate!: Date | null;

  @ApiProperty({ nullable: true })
  phone!: string | null;

  @ApiProperty({ nullable: true })
  email!: string | null;

  @ApiProperty({ nullable: true })
  address!: string | null;

  @ApiProperty({ nullable: true })
  city!: string | null;

  @ApiProperty({ nullable: true })
  state!: string | null;

  @ApiProperty({ nullable: true })
  zipCode!: string | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty({ nullable: true })
  admissionDate!: Date | null;

  @ApiProperty({ nullable: true })
  terminationDate!: Date | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ enum: DriverType })
  type!: DriverType;

  @ApiProperty({ enum: DriverStatus })
  status!: DriverStatus;

  @ApiProperty()
  isAvailable!: boolean;

  @ApiProperty({ format: 'uuid', nullable: true, description: 'Veiculo atualmente vinculado (assignment sem endedAt).' })
  currentVehicleId!: string | null;

  @ApiProperty({ nullable: true })
  currentVehiclePlate!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
