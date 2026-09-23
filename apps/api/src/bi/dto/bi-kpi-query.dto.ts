import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { KPI_EVIDENCE_SOURCES, KpiEvidenceSource } from '../kpis/kpi.types';
import { KPI_GRANULARITIES, KpiGranularity } from '../utils/kpi-buckets.util';
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

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Recorte por cliente -- so KPIs com a dimensao "customer" (receita); os demais voltam UNAVAILABLE.',
  })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;
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

  @ApiPropertyOptional({ format: 'uuid', description: 'Recorte por cliente (fonte TRIP_REVENUE).' })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @ApiProperty({ enum: KPI_EVIDENCE_SOURCES })
  @IsIn(KPI_EVIDENCE_SOURCES, { message: 'source invalido.' })
  source!: KpiEvidenceSource;
}

const csvToArray = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').map((v) => v.trim()).filter(Boolean) : value;

export const SERIES_COMPARISON_MODES = ['PREVIOUS_PERIOD', 'PREVIOUS_YEAR', 'NONE'] as const;
export type SeriesComparisonMode = (typeof SERIES_COMPARISON_MODES)[number];

// BI 3 -- serie temporal de 1..12 KPIs no MESMO request: os KPIs pedidos
// compartilham os snapshots de cada balde (nunca 1 request por grafico).
export class BiKpiSeriesQueryDto extends BiKpiScopeQueryDto {
  @ApiProperty({ type: [String], description: 'Ids de KPI separados por virgula (ex: revenue,operating_cost).' })
  @Transform(csvToArray)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @IsString({ each: true })
  kpis!: string[];

  @ApiPropertyOptional({ enum: KPI_GRANULARITIES, description: 'Omitido = automatico pelo tamanho do periodo.' })
  @IsOptional()
  @IsIn(KPI_GRANULARITIES, { message: 'granularity invalida.' })
  granularity?: KpiGranularity;

  @ApiPropertyOptional({ enum: SERIES_COMPARISON_MODES, default: 'NONE' })
  @IsOptional()
  @IsIn(SERIES_COMPARISON_MODES, { message: 'comparison invalido.' })
  comparison?: SeriesComparisonMode;
}

export const BREAKDOWN_DIMENSIONS = ['customer'] as const;

export class BiKpiBreakdownQueryDto extends BiKpiScopeQueryDto {
  @ApiProperty({ example: 'revenue' })
  @IsString()
  kpiId!: string;

  @ApiProperty({ enum: BREAKDOWN_DIMENSIONS })
  @IsIn(BREAKDOWN_DIMENSIONS, { message: 'dimension invalida.' })
  dimension!: (typeof BREAKDOWN_DIMENSIONS)[number];

  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 5;
}
