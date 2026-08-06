import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaEntity {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;

  @ApiProperty()
  totalPages!: number;
}

export function buildPaginationMeta(
  total: number,
  page: number,
  pageSize: number,
): PaginationMetaEntity {
  const meta = new PaginationMetaEntity();
  meta.total = total;
  meta.page = page;
  meta.pageSize = pageSize;
  meta.totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  return meta;
}
