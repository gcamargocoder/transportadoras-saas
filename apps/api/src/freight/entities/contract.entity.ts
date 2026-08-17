import { ApiProperty } from '@nestjs/swagger';
import { ContractStatus } from '@prisma/client';

export class ContractEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  customerId!: string;

  @ApiProperty({ nullable: true })
  customerName!: string | null;

  @ApiProperty()
  code!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({ enum: ContractStatus })
  status!: ContractStatus;

  @ApiProperty()
  startDate!: Date;

  @ApiProperty({ nullable: true })
  endDate!: Date | null;

  @ApiProperty({ description: 'Derivado: endDate no passado, independente do status gravado.' })
  isExpired!: boolean;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty({ nullable: true })
  commercialTerms!: string | null;

  @ApiProperty({ description: 'Quantidade de tabelas de frete vinculadas a este contrato.' })
  freightTablesCount!: number;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiProperty({ nullable: true })
  creatorName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  updatedBy!: string | null;

  @ApiProperty({ nullable: true })
  updaterName!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
