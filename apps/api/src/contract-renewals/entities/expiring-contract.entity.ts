import { ApiProperty } from '@nestjs/swagger';

export type ContractExpiryStatus = 'EXPIRING_SOON' | 'EXPIRED';

export class ExpiringContractEntity {
  @ApiProperty({ format: 'uuid' })
  contractId!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty({ format: 'uuid' })
  customerId!: string;

  @ApiProperty()
  customerName!: string;

  @ApiProperty()
  endDate!: Date;

  @ApiProperty({ description: 'Negativo quando ja vencido.' })
  daysUntilExpiry!: number;

  @ApiProperty({ enum: ['EXPIRING_SOON', 'EXPIRED'] })
  expiryStatus!: ContractExpiryStatus;

  @ApiProperty({ description: 'Existe renovacao PENDING em andamento para este contrato.' })
  hasActiveRenewal!: boolean;

  @ApiProperty({ format: 'uuid', nullable: true })
  activeRenewalId!: string | null;
}
