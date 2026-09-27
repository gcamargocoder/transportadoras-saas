import { ApiPropertyOptional } from '@nestjs/swagger';
import { FuelTankMovementType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class FindFuelTankMovementsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: FuelTankMovementType })
  @IsOptional()
  @IsEnum(FuelTankMovementType)
  type?: FuelTankMovementType;

  @ApiPropertyOptional({ description: 'Periodo: data efetiva a partir de (inclusive).' })
  @IsOptional()
  @IsDateString({}, { message: 'from deve ser uma data valida (ISO 8601).' })
  from?: string;

  @ApiPropertyOptional({ description: 'Periodo: data efetiva ate (inclusive).' })
  @IsOptional()
  @IsDateString({}, { message: 'to deve ser uma data valida (ISO 8601).' })
  to?: string;
}
