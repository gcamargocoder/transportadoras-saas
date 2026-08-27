import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { ParseBooleanQuery } from '../../common/decorators/parse-boolean-query.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class FindCustomersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busca livre por nome ou documento.' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;

  // Fase 93 -- filtro server-side (padrao ja usado por Driver/Vehicle).
  @ApiPropertyOptional()
  @IsOptional()
  @ParseBooleanQuery()
  @IsBoolean()
  isActive?: boolean;
}
