import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { DriverEntity } from './driver.entity';

export class PaginatedDriversEntity {
  @ApiProperty({ type: [DriverEntity] })
  items!: DriverEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
