import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { ChecklistTemplateEntity } from './checklist-template.entity';

export class PaginatedChecklistTemplatesEntity {
  @ApiProperty({ type: [ChecklistTemplateEntity] })
  items!: ChecklistTemplateEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
