import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

// GET /fleet-operations/idle-time (Fase A -- tempo ocioso entre operacoes).
// DTO proprio: `from`/`to` filtram por SOBREPOSICAO do periodo ocioso com a
// janela (nao "startDate/endDate por data de evento" do
// FleetOperationsQueryDto compartilhado -- semantica diferente). `vehicleId`
// opcional; paginacao herdada de PaginationQueryDto (page/pageSize).
export class FindIdleTimeQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: '2026-01-01', description: 'Inicio da janela (sobreposicao com o periodo ocioso).' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Fim da janela (sobreposicao com o periodo ocioso).' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  vehicleId?: string;
}
