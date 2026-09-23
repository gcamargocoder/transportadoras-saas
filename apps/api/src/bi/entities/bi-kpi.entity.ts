import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { KPI_COMPARISON_MODES, KpiComparisonMode } from '../utils/kpi-period.util';
import {
  KPI_CATEGORIES,
  KPI_DIRECTIONS,
  KPI_EVIDENCE_SOURCES,
  KPI_UNITS,
  KpiCategory,
  KpiDirection,
  KpiEvidenceSource,
  KpiUnit,
} from '../kpis/kpi.types';

// BI 1 -- contrato estruturado de um KPI: suficiente para um grafico/card
// (valor + comparacao) E para uma futura camada de IA interpretar sem
// recalcular nada (formula, fontes, entradas, evidencias, escopo). A IA
// deve sempre LER estes valores, nunca substitui-los.

export class KpiPeriodEntity {
  @ApiProperty()
  start!: Date;

  @ApiProperty()
  end!: Date;
}

export class KpiSourceEntity {
  @ApiProperty({ example: 'FuelSupply' })
  entity!: string;

  @ApiProperty({ example: 'totalAmount' })
  field!: string;

  @ApiProperty({ example: 'supplyDate', description: 'Campo de data que recorta o periodo.' })
  dateField!: string;

  @ApiProperty({ description: 'Regras de inclusao/exclusao aplicadas a esta fonte.' })
  rule!: string;
}

export class KpiInputEntity {
  @ApiProperty({ example: 'totalCost' })
  key!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty({ nullable: true, type: Number })
  value!: number | null;

  @ApiProperty({ enum: KPI_UNITS })
  unit!: KpiUnit;
}

export class KpiEvidenceEntity {
  @ApiProperty({ enum: KPI_EVIDENCE_SOURCES })
  source!: KpiEvidenceSource;

  @ApiProperty()
  label!: string;

  @ApiProperty({ description: 'Registros de origem considerados no periodo apurado.' })
  recordCount!: number;

  @ApiProperty({
    description: 'true quando GET /bi/kpis/:kpiId/evidence?source=... lista os registros individuais.',
  })
  listable!: boolean;
}

export class KpiComparisonEntity {
  @ApiProperty({ type: KpiPeriodEntity })
  period!: KpiPeriodEntity;

  @ApiProperty({ nullable: true, type: Number })
  value!: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'value atual - value de comparacao. Para KPIs em PERCENT, em pontos percentuais.',
  })
  absoluteChange!: number | null;

  @ApiProperty({ nullable: true, type: Number, description: 'null quando o valor de comparacao e 0 ou indisponivel.' })
  percentChange!: number | null;

  @ApiProperty({ nullable: true, type: String })
  unavailableReason!: string | null;
}

export class KpiDefinitionEntity {
  @ApiProperty({ example: 'cost_per_km' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ enum: KPI_CATEGORIES })
  category!: KpiCategory;

  @ApiProperty({ enum: KPI_UNITS })
  unit!: KpiUnit;

  @ApiProperty({ enum: KPI_DIRECTIONS })
  direction!: KpiDirection;

  @ApiProperty()
  formula!: string;

  @ApiProperty({ type: [KpiSourceEntity] })
  sources!: KpiSourceEntity[];

  @ApiProperty({ type: [String], description: 'Dimensoes que recortam este KPI hoje (filtros aceitos).' })
  dimensions!: string[];

  @ApiProperty({ type: [String], description: 'Limitacoes conhecidas / dependencias de dados.' })
  limitations!: string[];

  @ApiProperty({ description: 'true quando a soma dos pontos da serie temporal = valor do periodo inteiro.' })
  additive!: boolean;
}

export class KpiResultEntity extends KpiDefinitionEntity {
  @ApiProperty({ enum: ['AVAILABLE', 'UNAVAILABLE'] })
  status!: 'AVAILABLE' | 'UNAVAILABLE';

  @ApiProperty({ nullable: true, type: String })
  unavailableReason!: string | null;

  @ApiProperty({ nullable: true, type: Number, description: 'null quando UNAVAILABLE -- nunca 0 inventado.' })
  value!: number | null;

  @ApiProperty({ type: KpiPeriodEntity })
  period!: KpiPeriodEntity;

  @ApiProperty({ type: KpiComparisonEntity, nullable: true })
  comparison!: KpiComparisonEntity | null;

  @ApiProperty({ type: [KpiInputEntity], description: 'Componentes usados no calculo (rastreabilidade).' })
  inputs!: KpiInputEntity[];

  @ApiProperty({ type: [KpiEvidenceEntity] })
  evidence!: KpiEvidenceEntity[];
}

export class KpiScopeEntity {
  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  vehicleId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  fleetId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  customerId!: string | null;
}

export class KpiSummaryEntity {
  @ApiProperty({ description: 'Versao do catalogo de KPIs (muda quando uma formula mudar).' })
  catalogVersion!: string;

  @ApiProperty()
  calculatedAt!: Date;

  @ApiProperty({ type: KpiScopeEntity })
  scope!: KpiScopeEntity;

  @ApiProperty({ type: KpiPeriodEntity })
  period!: KpiPeriodEntity;

  @ApiProperty({ enum: KPI_COMPARISON_MODES })
  comparisonMode!: KpiComparisonMode;

  @ApiProperty({ type: KpiPeriodEntity, nullable: true })
  comparisonPeriod!: KpiPeriodEntity | null;

  @ApiProperty({ type: [KpiResultEntity] })
  kpis!: KpiResultEntity[];
}

export class KpiEvidenceRecordEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ nullable: true, type: Date })
  date!: Date | null;

  @ApiProperty({ nullable: true, type: Number })
  amount!: number | null;

  @ApiProperty({ nullable: true, type: String })
  vehicleId!: string | null;

  @ApiProperty({ nullable: true, type: String })
  tripId!: string | null;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;
}

export class KpiEvidencePageEntity {
  @ApiProperty()
  kpiId!: string;

  @ApiProperty({ enum: KPI_EVIDENCE_SOURCES })
  source!: KpiEvidenceSource;

  @ApiProperty({ type: KpiScopeEntity })
  scope!: KpiScopeEntity;

  @ApiProperty({ type: KpiPeriodEntity })
  period!: KpiPeriodEntity;

  @ApiProperty({ type: [KpiEvidenceRecordEntity] })
  items!: KpiEvidenceRecordEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}

export class KpiPendingDependencyEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'Dado/fase de que o KPI depende para ser calculado com confiabilidade.' })
  dependency!: string;
}

export class KpiCatalogEntity {
  @ApiProperty()
  catalogVersion!: string;

  @ApiProperty({ type: [KpiDefinitionEntity] })
  kpis!: KpiDefinitionEntity[];

  @ApiProperty({ type: [KpiPendingDependencyEntity], description: 'KPIs ainda nao calculados e o motivo.' })
  pending!: KpiPendingDependencyEntity[];
}

// ============================================================================
// BI 3 -- serie temporal. Cada ponto e o MESMO calculo do catalogo aplicado
// ao balde (nunca uma formula de grafico) e carrega entradas/evidencias
// proprias: da para explicar a origem de cada ponto.
// ============================================================================
export class KpiSeriesPointEntity {
  @ApiProperty({ example: '2026-09', description: 'Inicio do balde no fuso do tenant (dia/semana: AAAA-MM-DD; mes: AAAA-MM).' })
  label!: string;

  @ApiProperty()
  start!: Date;

  @ApiProperty()
  end!: Date;

  @ApiProperty({ description: 'Balde recortado pelo periodo ou ainda em andamento -- nao e um intervalo completo.' })
  partial!: boolean;

  @ApiProperty({ enum: ['AVAILABLE', 'UNAVAILABLE'] })
  status!: 'AVAILABLE' | 'UNAVAILABLE';

  @ApiProperty({ nullable: true, type: Number, description: 'null quando indisponivel no balde -- nunca 0 inventado.' })
  value!: number | null;

  @ApiProperty({ nullable: true, type: String })
  unavailableReason!: string | null;

  @ApiProperty({ type: [KpiInputEntity] })
  inputs!: KpiInputEntity[];

  @ApiProperty({ type: [KpiEvidenceEntity] })
  evidence!: KpiEvidenceEntity[];
}

export class KpiSeriesEntity extends KpiDefinitionEntity {
  @ApiProperty({ type: [KpiSeriesPointEntity] })
  points!: KpiSeriesPointEntity[];

  @ApiProperty({
    type: [KpiSeriesPointEntity],
    nullable: true,
    description: 'Pontos do periodo de comparacao, com a mesma granularidade, pareados por posicao.',
  })
  comparisonPoints!: KpiSeriesPointEntity[] | null;
}

export class KpiSeriesResponseEntity {
  @ApiProperty()
  catalogVersion!: string;

  @ApiProperty()
  calculatedAt!: Date;

  @ApiProperty({ type: KpiScopeEntity })
  scope!: KpiScopeEntity;

  @ApiProperty({ type: KpiPeriodEntity })
  period!: KpiPeriodEntity;

  @ApiProperty({ enum: ['day', 'week', 'month'] })
  granularity!: 'day' | 'week' | 'month';

  @ApiProperty({ example: 'America/Sao_Paulo', description: 'Fuso do tenant usado para montar os baldes.' })
  timezone!: string;

  @ApiProperty({ enum: KPI_COMPARISON_MODES })
  comparisonMode!: KpiComparisonMode;

  @ApiProperty({ type: KpiPeriodEntity, nullable: true })
  comparisonPeriod!: KpiPeriodEntity | null;

  @ApiProperty({ type: [KpiSeriesEntity] })
  series!: KpiSeriesEntity[];
}

// ============================================================================
// BI 3 -- recorte de um KPI por dimensao (hoje: receita x cliente). Mesmo
// where do KPI, particionado: a soma dos itens + "outros" = valor do KPI.
// ============================================================================
export class KpiBreakdownItemEntity {
  @ApiProperty({ nullable: true, type: String, description: 'Id do cliente; null = receita sem cliente vinculado.' })
  key!: string | null;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  value!: number;

  @ApiProperty({ nullable: true, type: Number, description: 'Participacao no total (%); null quando o total e 0.' })
  share!: number | null;

  @ApiProperty()
  recordCount!: number;
}

export class KpiBreakdownEntity {
  @ApiProperty()
  kpiId!: string;

  @ApiProperty({ enum: ['customer'] })
  dimension!: 'customer';

  @ApiProperty({ type: KpiScopeEntity })
  scope!: KpiScopeEntity;

  @ApiProperty({ type: KpiPeriodEntity })
  period!: KpiPeriodEntity;

  @ApiProperty({ description: 'Valor do KPI no periodo (= soma de items + others).' })
  total!: number;

  @ApiProperty({ type: [KpiBreakdownItemEntity] })
  items!: KpiBreakdownItemEntity[];

  @ApiProperty({ type: KpiBreakdownItemEntity, nullable: true, description: 'Demais valores fora do limite pedido.' })
  others!: KpiBreakdownItemEntity | null;
}
