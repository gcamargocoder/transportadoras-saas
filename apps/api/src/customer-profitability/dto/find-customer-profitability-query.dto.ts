import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum CustomerProfitabilitySortField {
  RESULT = 'result',
  MARGIN = 'margin',
  REVENUE = 'revenue',
  COST = 'cost',
  TRIPS = 'trips',
}

// customerId opcional: quando informado, filtra para um unico cliente
// (equivalente a GET /customer-profitability/customers/:customerId, mas em
// forma de listagem paginada -- reaproveitado pelo mesmo service).
export class FindCustomerProfitabilityQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional({ enum: CustomerProfitabilitySortField, default: CustomerProfitabilitySortField.RESULT })
  @IsOptional()
  @IsEnum(CustomerProfitabilitySortField)
  sortBy: CustomerProfitabilitySortField = CustomerProfitabilitySortField.RESULT;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
