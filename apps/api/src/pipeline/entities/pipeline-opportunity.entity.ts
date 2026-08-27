import { ApiProperty } from '@nestjs/swagger';

export class PipelineOpportunityEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  customerId!: string;

  @ApiProperty({ nullable: true })
  customerName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  quotationId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  proposalId!: string | null;

  @ApiProperty({ nullable: true, description: 'Numero da proposta relacionada, quando aplicavel.' })
  proposalNumber!: number | null;

  @ApiProperty({ format: 'uuid' })
  stageId!: string;

  @ApiProperty({ nullable: true })
  stageName!: string | null;

  @ApiProperty({ nullable: true })
  stageIsWon!: boolean | null;

  @ApiProperty({ nullable: true })
  stageIsLost!: boolean | null;

  @ApiProperty({ nullable: true })
  title!: string | null;

  @ApiProperty({ nullable: true })
  estimatedValue!: number | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty({ nullable: true })
  lostReason!: string | null;

  @ApiProperty({ nullable: true })
  wonAt!: Date | null;

  @ApiProperty({ nullable: true })
  lostAt!: Date | null;

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
