import { ApiProperty } from '@nestjs/swagger';

export class DriverEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

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

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
