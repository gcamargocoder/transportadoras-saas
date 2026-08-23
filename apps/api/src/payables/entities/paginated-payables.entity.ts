import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { PayableEntity } from './payable.entity';

export class PaginatedPayablesEntity {
  @ApiProperty({ type: [PayableEntity] })
  items!: PayableEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
