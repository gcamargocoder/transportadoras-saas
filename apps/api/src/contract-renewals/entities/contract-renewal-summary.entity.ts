import { ApiProperty } from '@nestjs/swagger';

export class ContractRenewalSummaryEntity {
  @ApiProperty({ description: 'Contratos ACTIVE com vencimento dentro do limiar padrao (30 dias), ainda nao vencidos.' })
  expiringCount!: number;

  @ApiProperty({ description: 'Contratos ACTIVE ou EXPIRED cujo endDate ja passou.' })
  expiredCount!: number;

  @ApiProperty({ description: 'Renovacoes com status PENDING (iniciadas e ainda nao concluidas/canceladas).' })
  pendingRenewalsCount!: number;
}
