import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

// GET /payables/dashboard -- escopo simples (periodo, sem paginacao --
// agregado). Sem customerId (nao existe cliente no lado da despesa) --
// tripId cobre a consolidacao por viagem (secao 14).
export class FindPayablesDashboardQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  tripId?: string;

  @ApiPropertyOptional({ example: '2026-08-01', description: 'Filtra por issueDate >= from.' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-31', description: 'Filtra por issueDate <= to.' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
