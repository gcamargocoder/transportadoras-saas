import { ApiPropertyOptional } from '@nestjs/swagger';
import { TollRateStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

// GET /toll-data/rates -- historico/listagem geral. GET
// /toll-data/plazas/:id/tariffs (secao 18) reaproveita o mesmo service com
// tollPlazaId fixo pela rota, sem precisar deste DTO.
export class FindTollRatesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  tollPlazaId?: string;

  @ApiPropertyOptional({ enum: TollRateStatus })
  @IsOptional()
  @IsEnum(TollRateStatus)
  status?: TollRateStatus;
}
