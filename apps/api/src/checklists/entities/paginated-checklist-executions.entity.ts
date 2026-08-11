import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { ChecklistExecutionEntity } from './checklist-execution.entity';

export class PaginatedChecklistExecutionsEntity {
  @ApiProperty({ type: [ChecklistExecutionEntity] })
  items!: ChecklistExecutionEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
