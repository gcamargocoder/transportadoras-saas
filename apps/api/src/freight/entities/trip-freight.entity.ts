import { ApiProperty } from '@nestjs/swagger';

export class TripFreightEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  contractId!: string | null;

  @ApiProperty({ nullable: true })
  contractCode!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  freightTableId!: string | null;

  @ApiProperty({ nullable: true })
  freightTableName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  freightRuleId!: string | null;

  @ApiProperty({ nullable: true })
  freightRuleVersion!: number | null;

  @ApiProperty({ description: 'Parametros usados no ultimo calculo (auditoria/reproducibilidade).' })
  calculationInput!: Record<string, unknown>;

  @ApiProperty({ nullable: true })
  baseAmount!: number | null;

  @ApiProperty({ nullable: true })
  additionsAmount!: number | null;

  @ApiProperty({ nullable: true })
  tollAmount!: number | null;

  @ApiProperty({ nullable: true })
  feesAmount!: number | null;

  @ApiProperty({ nullable: true, description: 'Valor calculado pelo motor -- nunca editado manualmente.' })
  estimatedAmount!: number | null;

  @ApiProperty({ nullable: true, description: 'Valor efetivamente negociado/contratado.' })
  contractedAmount!: number | null;

  @ApiProperty({ nullable: true })
  finalAmount!: number | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  revenueId!: string | null;

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
