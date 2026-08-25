import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

// Sem startDate/endDate: entriesInPeriod/exitsInPeriod cobrem TODO o
// historico (nenhum default arbitrario tipo "ultimos 30 dias" foi
// inventado) -- ver docs/parts-inventory.md.
export class PartsDashboardQueryDto {
  @ApiPropertyOptional({ description: 'Periodo: a partir de (inclusive).' })
  @IsOptional()
  @IsDateString({}, { message: 'startDate deve ser uma data valida (ISO 8601).' })
  startDate?: string;

  @ApiPropertyOptional({ description: 'Periodo: ate (inclusive).' })
  @IsOptional()
  @IsDateString({}, { message: 'endDate deve ser uma data valida (ISO 8601).' })
  endDate?: string;
}
