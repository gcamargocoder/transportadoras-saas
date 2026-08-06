import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ParseBooleanQuery } from '../../common/decorators/parse-boolean-query.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum TenantSortField {
  NAME = 'name',
  CREATED_AT = 'createdAt',
}

// Uso exclusivo do SUPER_ADMIN (GET /tenants) -- lista TODAS as empresas,
// cross-tenant por natureza.
export class FindTenantsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Busca livre por razao social, nome fantasia, CNPJ ou slug.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;

  @ApiPropertyOptional({ description: 'Filtra por status (ativo/inativo).' })
  @IsOptional()
  @ParseBooleanQuery()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: TenantSortField, default: TenantSortField.NAME })
  @IsOptional()
  @IsEnum(TenantSortField)
  sortBy: TenantSortField = TenantSortField.NAME;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
