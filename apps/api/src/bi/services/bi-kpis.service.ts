import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { compact } from '../../common/utils/compact.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { PrismaService } from '../../prisma/prisma.service';
import { BiKpiEvidenceQueryDto, BiKpiScopeQueryDto, BiKpiSummaryQueryDto } from '../dto/bi-kpi-query.dto';
import {
  KpiCatalogEntity,
  KpiEvidencePageEntity,
  KpiPeriodEntity,
  KpiScopeEntity,
  KpiSummaryEntity,
} from '../entities/bi-kpi.entity';
import { findKpiDefinition, KPI_CATALOG, KPI_CATALOG_VERSION, KPI_PENDING_DEPENDENCIES } from '../kpis/kpi-catalog';
import { KpiDefinition, KpiEvidenceSource, LISTABLE_EVIDENCE_SOURCES } from '../kpis/kpi.types';
import { BiScope } from '../utils/bi-where.util';
import { buildKpiResults, toKpiDefinitionEntity } from '../utils/build-kpi-results.util';
import { evidenceSourcesOf } from '../utils/kpi-evidence-sources.util';
import { KpiPeriod, parsePeriodEnd, parsePeriodStart, resolveComparisonPeriod } from '../utils/kpi-period.util';
import { BiKpiEvidenceService } from './bi-kpi-evidence.service';
import { BiKpiSnapshotService } from './bi-kpi-snapshot.service';

// Janela maxima de apuracao -- protege o banco (a carga de tempo de frota
// e proporcional ao historico de viagens do escopo).
const MAX_PERIOD_DAYS = 731;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// BI 1 -- fonte OFICIAL dos indicadores do BI. Somente leitura (nunca grava
// AuditLog, mesmo principio do dashboard executivo).
@Injectable()
export class BiKpisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshots: BiKpiSnapshotService,
    private readonly evidence: BiKpiEvidenceService,
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
    entity.kpis = buildKpiResults(definitions, current, comparison ?? null);
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

  // --------------------------------------------------------------------------

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
    const [vehicle, fleet] = await Promise.all([
      query.vehicleId
        ? this.prisma.vehicle.findFirst({ where: { id: query.vehicleId, tenantId, deletedAt: null }, select: { id: true } })
        : Promise.resolve(undefined),
      query.fleetId
        ? this.prisma.fleet.findFirst({ where: { id: query.fleetId, tenantId }, select: { id: true } })
        : Promise.resolve(undefined),
    ]);
    if (vehicle === null) throw new NotFoundException('Veiculo nao encontrado.');
    if (fleet === null) throw new NotFoundException('Frota nao encontrada.');
    return compact({ vehicleId: query.vehicleId, fleetId: query.fleetId });
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
    return entity;
  }

  private toPeriodEntity(period: KpiPeriod): KpiPeriodEntity {
    const entity = new KpiPeriodEntity();
    entity.start = period.start;
    entity.end = period.end;
    return entity;
  }
}
