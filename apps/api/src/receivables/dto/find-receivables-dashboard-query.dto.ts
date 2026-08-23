import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

// GET /receivables/dashboard -- escopo simples (secao 11/13 do pedido):
// periodo (issueDate) + cliente. Sem paginacao (agregado).
export class FindReceivablesDashboardQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional({ example: '2026-08-01', description: 'Filtra por issueDate >= from.' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-31', description: 'Filtra por issueDate <= to.' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
