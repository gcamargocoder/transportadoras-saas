import { ApiPropertyOptional } from '@nestjs/swagger';
import { TireLocationType, TireStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum TireSortField {
  FIRE_NUMBER = 'fireNumber',
  CREATED_AT = 'createdAt',
  PURCHASE_DATE = 'purchaseDate',
}

export class FindTiresQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busca livre: numero de fogo, fabricante, modelo ou serie.' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;

  @ApiPropertyOptional({ enum: TireStatus })
  @IsOptional()
  @IsEnum(TireStatus, { message: 'status invalido.' })
  status?: TireStatus;

  @ApiPropertyOptional({ enum: TireLocationType })
  @IsOptional()
  @IsEnum(TireLocationType, { message: 'locationType invalido.' })
  locationType?: TireLocationType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  vehicleId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  trailerId?: string;

  @ApiPropertyOptional({ enum: TireSortField, default: TireSortField.CREATED_AT })
  @IsOptional()
  @IsIn(Object.values(TireSortField))
  sortBy: TireSortField = TireSortField.CREATED_AT;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
