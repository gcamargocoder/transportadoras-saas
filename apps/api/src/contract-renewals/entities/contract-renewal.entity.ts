import { ApiProperty } from '@nestjs/swagger';
import { ContractRenewalStatus } from '@prisma/client';

export class ContractRenewalEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  previousContractId!: string;

  @ApiProperty({ nullable: true })
  previousContractCode!: string | null;

  @ApiProperty({ format: 'uuid' })
  customerId!: string;

  @ApiProperty({ nullable: true })
  customerName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  newContractId!: string | null;

  @ApiProperty({ nullable: true })
  newContractCode!: string | null;

  @ApiProperty({ enum: ContractRenewalStatus })
  status!: ContractRenewalStatus;

  @ApiProperty({ nullable: true, description: 'Vigencia anterior (snapshot no momento em que a renovacao foi iniciada).' })
  previousEndDate!: Date | null;

  @ApiProperty({ nullable: true })
  newStartDate!: Date | null;

  @ApiProperty({ nullable: true })
  newEndDate!: Date | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty({ format: 'uuid' })
  initiatedBy!: string;

  @ApiProperty({ nullable: true })
  initiatorName!: string | null;

  @ApiProperty()
  initiatedAt!: Date;

  @ApiProperty({ format: 'uuid', nullable: true })
  completedBy!: string | null;

  @ApiProperty({ nullable: true })
  completerName!: string | null;

  @ApiProperty({ nullable: true })
  completedAt!: Date | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  cancelledBy!: string | null;

  @ApiProperty({ nullable: true })
  cancellerName!: string | null;

  @ApiProperty({ nullable: true })
  cancelledAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
