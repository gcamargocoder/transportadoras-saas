import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { ImportJobEntity } from './import-job.entity';

export class PaginatedImportJobsEntity {
  @ApiProperty({ type: [ImportJobEntity] })
  items!: ImportJobEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
