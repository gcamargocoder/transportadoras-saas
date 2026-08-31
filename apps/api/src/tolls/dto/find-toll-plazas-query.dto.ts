import { ApiPropertyOptional } from '@nestjs/swagger';
import { TollPlazaType } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum TollPlazaSortField {
  NAME = 'name',
  CREATED_AT = 'createdAt',
}

export class FindTollPlazasQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busca livre: nome, operadora, rodovia ou cidade.' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;

  @ApiPropertyOptional({ example: 'SP' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  state?: string;

  @ApiPropertyOptional({ description: 'Filtra por concessionaria (parcial).' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  operator?: string;

  @ApiPropertyOptional({
    enum: TollPlazaType,
    description: 'Filtra por tipo: PHYSICAL_PLAZA ou FREE_FLOW_GANTRY.',
  })
  @IsOptional()
  @IsEnum(TollPlazaType)
  type?: TollPlazaType;

  @ApiPropertyOptional({ enum: TollPlazaSortField, default: TollPlazaSortField.NAME })
  @IsOptional()
  @IsIn(Object.values(TollPlazaSortField))
  sortBy: TollPlazaSortField = TollPlazaSortField.NAME;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
