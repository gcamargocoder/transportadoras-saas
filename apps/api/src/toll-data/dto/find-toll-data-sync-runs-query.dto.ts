import { ApiPropertyOptional } from '@nestjs/swagger';
import { TollDataProvider, TollDataSyncStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class FindTollDataSyncRunsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TollDataProvider })
  @IsOptional()
  @IsEnum(TollDataProvider)
  provider?: TollDataProvider;

  @ApiPropertyOptional({ enum: TollDataSyncStatus })
  @IsOptional()
  @IsEnum(TollDataSyncStatus)
  status?: TollDataSyncStatus;
}
