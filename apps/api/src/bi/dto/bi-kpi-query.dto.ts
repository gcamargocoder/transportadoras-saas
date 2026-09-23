import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { KPI_EVIDENCE_SOURCES, KpiEvidenceSource } from '../kpis/kpi.types';
import { KPI_COMPARISON_MODES, KpiComparisonMode } from '../utils/kpi-period.util';

// BI 1 -- periodo SEMPRE explicito (startDate/endDate obrigatorios): um KPI
// sem periodo de apuracao nao e comparavel nem rastreavel. Data sem hora
// ("2026-01-31") no fim = dia inteiro (ver parsePeriodEnd).
export class BiKpiScopeQueryDto {
  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2026-01-31' })
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  vehicleId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  fleetId?: string;
}

export class BiKpiSummaryQueryDto extends BiKpiScopeQueryDto {
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

  @ApiPropertyOptional({
    type: [String],
    description: 'Ids de KPI separados por virgula (ex: revenue,cost_per_km). Omitido = todos.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',').map((v) => v.trim()).filter(Boolean) : value,
  )
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  kpis?: string[];
}

export class BiKpiEvidenceQueryDto extends PaginationQueryDto {
  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2026-01-31' })
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  vehicleId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  fleetId?: string;

  @ApiProperty({ enum: KPI_EVIDENCE_SOURCES })
  @IsIn(KPI_EVIDENCE_SOURCES, { message: 'source invalido.' })
  source!: KpiEvidenceSource;
}
