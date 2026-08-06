import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { AuditLogEntity } from './audit-log.entity';

export class PaginatedAuditLogEntity {
  @ApiProperty({ type: [AuditLogEntity] })
  items!: AuditLogEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
