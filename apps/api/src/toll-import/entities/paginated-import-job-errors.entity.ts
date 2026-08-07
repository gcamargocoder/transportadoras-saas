import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { ImportJobErrorEntity } from './import-job-error.entity';

export class PaginatedImportJobErrorsEntity {
  @ApiProperty({ type: [ImportJobErrorEntity] })
  items!: ImportJobErrorEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
