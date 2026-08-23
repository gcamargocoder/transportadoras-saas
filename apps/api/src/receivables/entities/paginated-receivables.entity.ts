import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { ReceivableEntity } from './receivable.entity';

export class PaginatedReceivablesEntity {
  @ApiProperty({ type: [ReceivableEntity] })
  items!: ReceivableEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
