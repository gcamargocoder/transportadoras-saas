import { ApiProperty } from '@nestjs/swagger';

export class PipelineDashboardStageBreakdownEntity {
  @ApiProperty({ format: 'uuid' })
  stageId!: string;

  @ApiProperty()
  stageName!: string;

  @ApiProperty()
  isWon!: boolean;

  @ApiProperty()
  isLost!: boolean;

  @ApiProperty()
  count!: number;

  @ApiProperty()
  estimatedValue!: number;
}

// GET /pipeline/dashboard -- "simples" (regra da fase): somente contagens/
// somas agregadas, nunca nenhum dado financeiro real (Receivable/Payable/
// FinancialTransaction nunca sao lidos aqui).
export class PipelineDashboardEntity {
  @ApiProperty()
  openCount!: number;

  @ApiProperty()
  openEstimatedValue!: number;

  @ApiProperty()
  wonCount!: number;

  @ApiProperty()
  wonEstimatedValue!: number;

  @ApiProperty()
  lostCount!: number;

  @ApiProperty()
  lostEstimatedValue!: number;

  @ApiProperty({ description: 'ganhos / (ganhos + perdidos), 0 quando nao ha nenhum fechamento ainda.' })
  conversionRate!: number;

  @ApiProperty({ type: [PipelineDashboardStageBreakdownEntity] })
  byStage!: PipelineDashboardStageBreakdownEntity[];
}
