import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { compact } from '../../common/utils/compact.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BiKpiBreakdownQueryDto,
  BiKpiEvidenceQueryDto,
  BiKpiScopeQueryDto,
  BiKpiSeriesQueryDto,
  BiKpiSummaryQueryDto,
  BreakdownDimension,
} from '../dto/bi-kpi-query.dto';
import {
  KpiBreakdownEntity,
  KpiCatalogEntity,
  KpiEvidencePageEntity,
  KpiPeriodEntity,
  KpiScopeEntity,
  KpiSeriesResponseEntity,
  KpiSummaryEntity,
} from '../entities/bi-kpi.entity';
import { findKpiDefinition, KPI_CATALOG, KPI_CATALOG_VERSION, KPI_PENDING_DEPENDENCIES } from '../kpis/kpi-catalog';
import { KpiDefinition, KpiEvidenceSource, LISTABLE_EVIDENCE_SOURCES } from '../kpis/kpi.types';
import { BiScope } from '../utils/bi-where.util';
import { buildKpiResults, toKpiDefinitionEntity } from '../utils/build-kpi-results.util';
import { buildKpiBuckets, isValidTimeZone, MAX_BUCKETS, resolveGranularity } from '../utils/kpi-buckets.util';
import { evidenceSourcesOf } from '../utils/kpi-evidence-sources.util';
import { KpiPeriod, parsePeriodEnd, parsePeriodStart, resolveComparisonPeriod } from '../utils/kpi-period.util';
import { BiKpiBreakdownService } from './bi-kpi-breakdown.service';
import { BiKpiEvidenceService } from './bi-kpi-evidence.service';
import { BiKpiSeriesService } from './bi-kpi-series.service';
import { BiKpiSnapshotService } from './bi-kpi-snapshot.service';

// Janela maxima de apuracao -- protege o banco (a carga de tempo de frota
// e proporcional ao historico de viagens do escopo).
const MAX_PERIOD_DAYS = 731;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Mesmo default de TenantSettings.timezone no schema.
const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

// BI 1 -- fonte OFICIAL dos indicadores do BI. Somente leitura (nunca grava
// AuditLog, mesmo principio do dashboard executivo).
@Injectable()
export class BiKpisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshots: BiKpiSnapshotService,
    private readonly evidence: BiKpiEvidenceService,
    private readonly series: BiKpiSeriesService,
    private readonly breakdown: BiKpiBreakdownService,
  ) {}

  getCatalog(): KpiCatalogEntity {
    const entity = new KpiCatalogEntity();
    entity.catalogVersion = KPI_CATALOG_VERSION;
    entity.kpis = KPI_CATALOG.map(toKpiDefinitionEntity);
    entity.pending = KPI_PENDING_DEPENDENCIES.map((p) => ({ ...p }));
    return entity;
  }

  async getSummary(tenantId: string, query: BiKpiSummaryQueryDto): Promise<KpiSummaryEntity> {
    const period = this.parsePeriod(query.startDate, query.endDate);
    const scope = await this.resolveScope(tenantId, query);
    const definitions = this.selectDefinitions(query.kpis);

    const comparisonMode = query.comparison ?? 'PREVIOUS_PERIOD';
    if (comparisonMode === 'CUSTOM' && (!query.compareStartDate || !query.compareEndDate)) {
      throw new BadRequestException('comparison=CUSTOM exige compareStartDate e compareEndDate.');
    }
    const comparisonPeriod = resolveComparisonPeriod(
      comparisonMode,
      period,
      comparisonMode === 'CUSTOM' ? this.parsePeriod(query.compareStartDate as string, query.compareEndDate as string) : undefined,
    );

    const now = new Date();
    const [current, comparison] = await this.snapshots.collect(
      tenantId,
      scope,
      comparisonPeriod ? [period, comparisonPeriod] : [period],
      now,
    );
    if (!current) throw new Error('Snapshot do periodo atual ausente.');

    const entity = new KpiSummaryEntity();
    entity.catalogVersion = KPI_CATALOG_VERSION;
    entity.calculatedAt = now;
    entity.scope = this.toScopeEntity(tenantId, scope);
    entity.period = this.toPeriodEntity(period);
    entity.comparisonMode = comparisonMode;
    entity.comparisonPeriod = comparisonPeriod ? this.toPeriodEntity(comparisonPeriod) : null;
    entity.kpis = buildKpiResults(definitions, current, comparison ?? null, { customer: scope.customerId !== undefined });
    return entity;
  }

  async getEvidence(tenantId: string, kpiId: string, query: BiKpiEvidenceQueryDto): Promise<KpiEvidencePageEntity> {
    const definition = this.requireDefinition(kpiId);
    const source = query.source;
    if (!LISTABLE_EVIDENCE_SOURCES.includes(source)) {
      throw new BadRequestException(`A fonte ${source} e derivada e nao possui listagem de registros.`);
    }
    if (!evidenceSourcesOf(definition).includes(source)) {
      throw new BadRequestException(`A fonte ${source} nao compoe o KPI ${kpiId}.`);
    }

    if (query.customerId && !definition.dimensions.includes('customer')) {
      throw new BadRequestException(`O KPI ${kpiId} nao suporta recorte por cliente.`);
    }

    const period = this.parsePeriod(query.startDate, query.endDate);
    const scope = await this.resolveScope(tenantId, query);
    const page = await this.evidence.list(
      tenantId,
      scope,
      period,
      source as Exclude<KpiEvidenceSource, 'FLEET_TIME'>,
      query.page,
      query.pageSize,
    );

    const entity = new KpiEvidencePageEntity();
    entity.kpiId = definition.id;
    entity.source = source;
    entity.scope = this.toScopeEntity(tenantId, scope);
    entity.period = this.toPeriodEntity(period);
    entity.items = page.items;
    entity.meta = buildPaginationMeta(page.total, query.page, query.pageSize);
    return entity;
  }

  // BI 3 -- serie temporal. Baldes no fuso do tenant (lido do banco, nunca
  // do cliente); mesma validacao de periodo/escopo do summary.
  async getSeries(tenantId: string, query: BiKpiSeriesQueryDto): Promise<KpiSeriesResponseEntity> {
    const period = this.parsePeriod(query.startDate, query.endDate);
    const scope = await this.resolveScope(tenantId, query);
    const definitions = this.selectDefinitions(query.kpis);
    const granularity = query.granularity ?? resolveGranularity(period);
    const timezone = await this.resolveTimeZone(tenantId);
    const now = new Date();

    const buckets = buildKpiBuckets(period, granularity, timezone, now);
    if (buckets.length > MAX_BUCKETS[granularity]) {
      throw new BadRequestException(
        `Periodo longo demais para granularidade "${granularity}" (maximo ${MAX_BUCKETS[granularity]} pontos). Use uma granularidade maior.`,
      );
    }

    const comparisonMode = query.comparison ?? 'NONE';
    const comparisonPeriod = resolveComparisonPeriod(comparisonMode, period);
    const comparisonBuckets = comparisonPeriod
      ? buildKpiBuckets(comparisonPeriod, granularity, timezone, now).slice(0, MAX_BUCKETS[granularity])
      : null;

    const entity = new KpiSeriesResponseEntity();
    entity.catalogVersion = KPI_CATALOG_VERSION;
    entity.calculatedAt = now;
    entity.scope = this.toScopeEntity(tenantId, scope);
    entity.period = this.toPeriodEntity(period);
    entity.granularity = granularity;
    entity.timezone = timezone;
    entity.comparisonMode = comparisonMode;
    entity.comparisonPeriod = comparisonPeriod ? this.toPeriodEntity(comparisonPeriod) : null;
    entity.series = await this.series.build(
      tenantId,
      scope,
      definitions,
      buckets,
      comparisonBuckets,
      { customer: scope.customerId !== undefined },
      now,
    );
    return entity;
  }

  // BI 3/4 -- recorte de KPI por dimensao: receita x cliente (BI 3) e os 5
  // KPIs de frota x veiculo (BI 4). Cada combinacao (kpiId, dimension) mapeia
  // para um unico metodo do BiKpiBreakdownService -- nunca uma segunda forma
  // de calculo.
  async getBreakdown(tenantId: string, query: BiKpiBreakdownQueryDto): Promise<KpiBreakdownEntity> {
    const definition = this.requireDefinition(query.kpiId);
    const period = this.parsePeriod(query.startDate, query.endDate);
    const scope = await this.resolveScope(tenantId, query);
    const result = await this.computeBreakdown(tenantId, definition.id, query.dimension, scope, period, query.limit);

    const entity = new KpiBreakdownEntity();
    entity.kpiId = definition.id;
    entity.dimension = query.dimension;
    entity.scope = this.toScopeEntity(tenantId, scope);
    entity.period = this.toPeriodEntity(period);
    entity.total = result.total;
    entity.items = result.items;
    entity.others = result.others;
    return entity;
  }

  private async computeBreakdown(
    tenantId: string,
    kpiId: string,
    dimension: BreakdownDimension,
    scope: BiScope,
    period: KpiPeriod,
    limit: number,
  ) {
    if (kpiId === 'revenue' && dimension === 'customer') {
      return this.breakdown.revenueByCustomer(tenantId, scope, period, limit);
    }
    if (dimension === 'vehicle') {
      switch (kpiId) {
        case 'fleet_utilization':
          return this.breakdown.fleetUtilizationByVehicle(tenantId, scope, period, limit);
        case 'fleet_availability':
          return this.breakdown.fleetAvailabilityByVehicle(tenantId, scope, period, limit);
        case 'idle_hours':
          return this.breakdown.idleHoursByVehicle(tenantId, scope, period, limit);
        case 'trips_completed':
          return this.breakdown.tripsCompletedByVehicle(tenantId, scope, period, limit);
        case 'distance_km':
          return this.breakdown.distanceByVehicle(tenantId, scope, period, limit);
        // BI 5 -- custo por veiculo.
        case 'operating_cost':
          return this.breakdown.operatingCostByVehicle(tenantId, scope, period, limit);
        case 'fuel_cost':
          return this.breakdown.fuelCostByVehicle(tenantId, scope, period, limit);
        case 'maintenance_cost':
          return this.breakdown.maintenanceCostByVehicle(tenantId, scope, period, limit);
        case 'toll_cost':
          return this.breakdown.tollCostByVehicle(tenantId, scope, period, limit);
        case 'tire_cost':
          return this.breakdown.tireCostByVehicle(tenantId, scope, period, limit);
        case 'other_cost':
          return this.breakdown.otherCostByVehicle(tenantId, scope, period, limit);
        case 'cost_per_km':
          return this.breakdown.costPerKmByVehicle(tenantId, scope, period, limit);
        // BI 6 -- prazos/nivel de servico por veiculo.
        case 'deliveries_completed':
          return this.breakdown.deliveriesCompletedByVehicle(tenantId, scope, period, limit);
        case 'on_time_delivery_rate':
          return this.breakdown.onTimeDeliveryRateByVehicle(tenantId, scope, period, limit);
        case 'occurrences_total':
          return this.breakdown.occurrencesTotalByVehicle(tenantId, scope, period, limit);
        case 'occurrences_critical':
          return this.breakdown.occurrencesCriticalByVehicle(tenantId, scope, period, limit);
      }
    }
    throw new BadRequestException(`Recorte por ${dimension} nao disponivel para o KPI ${kpiId}.`);
  }

  // --------------------------------------------------------------------------

  private async resolveTimeZone(tenantId: string): Promise<string> {
    const settings = await this.prisma.tenantSettings.findUnique({ where: { tenantId }, select: { timezone: true } });
    const timezone = settings?.timezone;
    return timezone && isValidTimeZone(timezone) ? timezone : DEFAULT_TIMEZONE;
  }

  private parsePeriod(startDate: string, endDate: string): KpiPeriod {
    const start = parsePeriodStart(startDate);
    const end = parsePeriodEnd(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Periodo invalido.');
    }
    if (end.getTime() < start.getTime()) {
      throw new BadRequestException('endDate deve ser igual ou posterior a startDate.');
    }
    if (end.getTime() - start.getTime() > MAX_PERIOD_DAYS * MS_PER_DAY) {
      throw new BadRequestException(`Periodo maximo de apuracao: ${MAX_PERIOD_DAYS} dias.`);
    }
    return { start, end };
  }

  // vehicleId/fleetId vem do cliente: so sao aceitos se pertencerem ao
  // tenant do token (404 caso contrario -- nunca revela se o id existe em
  // outro tenant). Todas as consultas seguintes tambem filtram por tenantId.
  private async resolveScope(tenantId: string, query: BiKpiScopeQueryDto): Promise<BiScope> {
    const [vehicle, fleet, customer] = await Promise.all([
      query.vehicleId
        ? this.prisma.vehicle.findFirst({ where: { id: query.vehicleId, tenantId, deletedAt: null }, select: { id: true } })
        : Promise.resolve(undefined),
      query.fleetId
        ? this.prisma.fleet.findFirst({ where: { id: query.fleetId, tenantId }, select: { id: true } })
        : Promise.resolve(undefined),
      query.customerId
        ? this.prisma.customer.findFirst({ where: { id: query.customerId, tenantId }, select: { id: true } })
        : Promise.resolve(undefined),
    ]);
    if (vehicle === null) throw new NotFoundException('Veiculo nao encontrado.');
    if (fleet === null) throw new NotFoundException('Frota nao encontrada.');
    if (customer === null) throw new NotFoundException('Cliente nao encontrado.');
    return compact({ vehicleId: query.vehicleId, fleetId: query.fleetId, customerId: query.customerId });
  }

  private selectDefinitions(ids: string[] | undefined): readonly KpiDefinition[] {
    if (!ids || ids.length === 0) return KPI_CATALOG;
    return [...new Set(ids)].map((id) => {
      const definition = findKpiDefinition(id);
      if (!definition) throw new BadRequestException(`KPI desconhecido: ${id}.`);
      return definition;
    });
  }

  private requireDefinition(id: string): KpiDefinition {
    const definition = findKpiDefinition(id);
    if (!definition) throw new NotFoundException(`KPI desconhecido: ${id}.`);
    return definition;
  }

  private toScopeEntity(tenantId: string, scope: BiScope): KpiScopeEntity {
    const entity = new KpiScopeEntity();
    entity.tenantId = tenantId;
    entity.vehicleId = scope.vehicleId ?? null;
    entity.fleetId = scope.fleetId ?? null;
    entity.customerId = scope.customerId ?? null;
    return entity;
  }

  private toPeriodEntity(period: KpiPeriod): KpiPeriodEntity {
    const entity = new KpiPeriodEntity();
    entity.start = period.start;
    entity.end = period.end;
    return entity;
  }
}
