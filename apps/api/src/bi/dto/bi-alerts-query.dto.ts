import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsOptional } from 'class-validator';
import { ALERT_SEVERITIES, AlertSeverity } from '../alerts/alert-rule.types';
import { KPI_COMPARISON_MODES, KpiComparisonMode } from '../utils/kpi-period.util';
import { BiKpiScopeQueryDto } from './bi-kpi-query.dto';

const csvToArray = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').map((v) => v.trim()).filter(Boolean) : value;

// BI 10 -- mesmo escopo/periodo/comparacao de /bi/kpis/summary (nenhum
// algoritmo de comparacao novo); "severity" e o unico filtro proprio desta
// camada.
export class BiAlertsQueryDto extends BiKpiScopeQueryDto {
  @ApiPropertyOptional({ enum: KPI_COMPARISON_MODES, default: 'PREVIOUS_PERIOD' })
  @IsOptional()
  @IsIn(KPI_COMPARISON_MODES, { message: 'comparison invalido.' })
  comparison?: KpiComparisonMode;

  @ApiPropertyOptional({ example: '2025-12-01', description: 'Obrigatorio com comparison=CUSTOM.' })
  @IsOptional()
  @IsDateString()
  compareStartDate?: string;

  @ApiPropertyOptional({ example: '2025-12-31', description: 'Obrigatorio com comparison=CUSTOM.' })
  @IsOptional()
  @IsDateString()
  compareEndDate?: string;

  @ApiPropertyOptional({ type: [String], enum: ALERT_SEVERITIES, description: 'Severidades separadas por virgula. Omitido = todas.' })
  @IsOptional()
  @Transform(csvToArray)
  @IsArray()
  @ArrayMaxSize(ALERT_SEVERITIES.length)
  @IsIn(ALERT_SEVERITIES, { each: true, message: 'severity invalida.' })
  severity?: AlertSeverity[];
}
