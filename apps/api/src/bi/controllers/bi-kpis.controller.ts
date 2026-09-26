import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantModule } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { DASHBOARD_ROLES } from '../../dashboard/constants/dashboard-roles.constants';
import { TenantContext } from '../../tenants/context/tenant-context';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import {
  BiKpiBreakdownQueryDto,
  BiKpiEvidenceQueryDto,
  BiKpiSeriesQueryDto,
  BiKpiSummaryQueryDto,
} from '../dto/bi-kpi-query.dto';
import {
  KpiBreakdownEntity,
  KpiCatalogEntity,
  KpiEvidencePageEntity,
  KpiSeriesResponseEntity,
  KpiSummaryEntity,
} from '../entities/bi-kpi.entity';
import { BiKpisService } from '../services/bi-kpis.service';

// BI 1 -- camada oficial de indicadores. Mesmo modulo de plano
// (DASHBOARDS) e mesmo RBAC do dashboard executivo (DASHBOARD_ROLES):
// receita/resultado/margem sao dado financeiro sensivel -- OPERATOR/
// DISPATCHER/AUDITOR/DRIVER recebem 403. tenantId sempre do token.
@ApiTags('bi')
@ApiBearerAuth()
@Controller('bi/kpis')
@RequireModule(TenantModule.DASHBOARDS)
export class BiKpisController {
  constructor(
    private readonly kpisService: BiKpisService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...DASHBOARD_ROLES)
  @ApiOperation({
    summary: 'Catalogo de KPIs do BI: formula, fontes, unidade, dimensoes, limitacoes e KPIs pendentes de dados.',
  })
  @ApiOkResponse({ type: KpiCatalogEntity })
  getCatalog(): KpiCatalogEntity {
    this.tenantContext.requireTenantId();
    return this.kpisService.getCatalog();
  }

  @Get('summary')
  @Roles(...DASHBOARD_ROLES)
  @ApiOperation({
    summary:
      'Valores dos KPIs no periodo (startDate/endDate obrigatorios), com comparacao (PREVIOUS_PERIOD padrao, ' +
      'PREVIOUS_YEAR, CUSTOM, NONE), variacao absoluta/percentual, entradas do calculo e contagem de evidencias. ' +
      'Filtros opcionais: vehicleId, fleetId, kpis (lista separada por virgula).',
  })
  @ApiOkResponse({ type: KpiSummaryEntity })
  getSummary(@Query() query: BiKpiSummaryQueryDto): Promise<KpiSummaryEntity> {
    return this.kpisService.getSummary(this.tenantContext.requireTenantId(), query);
  }

  @Get('series')
  @Roles(...DASHBOARD_ROLES)
  @ApiOperation({
    summary:
      'Serie temporal de 1..12 KPIs (kpis=revenue,operating_cost...) em baldes dia/semana/mes no fuso do tenant. ' +
      'Cada ponto usa o MESMO calculo do summary, com entradas/evidencias proprias. comparison=PREVIOUS_PERIOD|' +
      'PREVIOUS_YEAR adiciona os pontos do periodo de comparacao, pareados por posicao.',
  })
  @ApiOkResponse({ type: KpiSeriesResponseEntity })
  getSeries(@Query() query: BiKpiSeriesQueryDto): Promise<KpiSeriesResponseEntity> {
    return this.kpisService.getSeries(this.tenantContext.requireTenantId(), query);
  }

  @Get('breakdown')
  @Roles(...DASHBOARD_ROLES)
  @ApiOperation({
    summary:
      'Recorte de um KPI por dimensao: revenue x customer (BI 3); fleet_utilization/' +
      'fleet_availability/idle_hours/trips_completed/distance_km x vehicle (BI 4); ' +
      'operating_cost/fuel_cost/maintenance_cost/toll_cost/tire_cost/other_cost/cost_per_km x ' +
      'vehicle (BI 5); ou deliveries_completed/on_time_delivery_rate/occurrences_total/' +
      'occurrences_critical x vehicle (BI 6). Mesmo where do KPI; para KPIs somaveis, soma dos ' +
      'itens + others = valor do KPI -- para razoes (PERCENT/BRL_PER_KM), "total" e o valor ' +
      'oficial do KPI, nao a soma dos itens.',
  })
  @ApiOkResponse({ type: KpiBreakdownEntity })
  getBreakdown(@Query() query: BiKpiBreakdownQueryDto): Promise<KpiBreakdownEntity> {
    return this.kpisService.getBreakdown(this.tenantContext.requireTenantId(), query);
  }

  @Get(':kpiId/evidence')
  @Roles(...DASHBOARD_ROLES)
  @ApiOperation({
    summary:
      'Registros de origem de um KPI para uma fonte (source), com o MESMO recorte usado no valor do KPI. Paginado.',
  })
  @ApiOkResponse({ type: KpiEvidencePageEntity })
  getEvidence(@Param('kpiId') kpiId: string, @Query() query: BiKpiEvidenceQueryDto): Promise<KpiEvidencePageEntity> {
    return this.kpisService.getEvidence(this.tenantContext.requireTenantId(), kpiId, query);
  }
}
