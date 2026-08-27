import { ApiProperty } from '@nestjs/swagger';
import { PipelineOpportunityEntity } from './pipeline-opportunity.entity';
import { PipelineStageEntity } from './pipeline-stage.entity';

// GET /pipeline/board -- visao Kanban. Cada coluna traz o total REAL de
// oportunidades no estagio (count agregado no banco) e uma amostra limitada
// de cartoes (ver PIPELINE_BOARD_CARDS_PER_STAGE) -- a listagem paginada
// (GET /pipeline/opportunities) continua sendo a fonte completa.
export class PipelineBoardColumnEntity {
  @ApiProperty({ type: PipelineStageEntity })
  stage!: PipelineStageEntity;

  @ApiProperty()
  totalCount!: number;

  @ApiProperty()
  totalEstimatedValue!: number;

  @ApiProperty({ type: [PipelineOpportunityEntity] })
  opportunities!: PipelineOpportunityEntity[];
}

export class PipelineBoardEntity {
  @ApiProperty({ type: [PipelineBoardColumnEntity] })
  columns!: PipelineBoardColumnEntity[];
}
