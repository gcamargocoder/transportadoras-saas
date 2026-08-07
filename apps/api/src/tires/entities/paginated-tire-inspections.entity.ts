import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { TireInspectionEntity } from './tire-inspection.entity';

export class PaginatedTireInspectionsEntity {
  @ApiProperty({ type: [TireInspectionEntity] })
  items!: TireInspectionEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
