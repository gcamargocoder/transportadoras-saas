import { ApiPropertyOptional } from '@nestjs/swagger';
import { PartStockMovementType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class FindPartMovementsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PartStockMovementType })
  @IsOptional()
  @IsEnum(PartStockMovementType)
  type?: PartStockMovementType;

  @ApiPropertyOptional({ description: 'Periodo: data do movimento a partir de (inclusive).' })
  @IsOptional()
  @IsDateString({}, { message: 'from deve ser uma data valida (ISO 8601).' })
  from?: string;

  @ApiPropertyOptional({ description: 'Periodo: data do movimento ate (inclusive).' })
  @IsOptional()
  @IsDateString({}, { message: 'to deve ser uma data valida (ISO 8601).' })
  to?: string;
}
