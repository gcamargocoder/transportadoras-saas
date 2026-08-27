import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

// Fase 98 -- "contratos vencendo/vencidos". withinDays reaproveita o MESMO
// limiar de resolveDocumentExpiryStatus (fleet/utils/document-expiry.util.ts,
// default 30 dias) -- nunca um segundo conceito de "vencendo em breve".
export class FindExpiringContractsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 365 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  withinDays = 30;
}
