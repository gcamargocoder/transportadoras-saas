import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantModule } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import { FLEET_OPERATIONS_READ_ROLES } from '../constants/fleet-operations-roles.constants';
import { FleetOperationsQueryDto } from '../dto/fleet-operations-query.dto';
import { FleetCostsEntity } from '../entities/fleet-costs.entity';
import { FleetFuelAnalyticsEntity } from '../entities/fleet-fuel-analytics.entity';
import { FleetMaintenanceDashboardEntity } from '../entities/fleet-maintenance-dashboard.entity';
import { FleetOperationalIndicatorsEntity } from '../entities/fleet-operational-indicators.entity';
import { FleetOperationsDashboardEntity } from '../entities/fleet-operations-dashboard.entity';
import { FleetStopsDashboardEntity } from '../entities/fleet-stops-dashboard.entity';
import { FleetDowntimeCostEntity } from '../entities/fleet-downtime-cost.entity';
import { FleetCompositionsOverviewEntity } from '../entities/fleet-compositions-overview.entity';
import { FleetTiresOverviewEntity } from '../entities/fleet-tires-overview.entity';
import { FleetVehiclesOverviewEntity } from '../entities/fleet-vehicles-overview.entity';
import { FleetOperationsMetricsService } from '../services/fleet-operations-metrics.service';

// Fase 40 -- gestao operacional da frota. Todas as rotas sao leitura
// agregada (sem side-effect), mesmo RBAC amplo ja usado por GET /tires/
// dashboard e GET /fuel-supplies/dashboard (FLEET_OPERATIONS_READ_ROLES).
@ApiTags('fleet-operations')
@ApiBearerAuth()
@Controller('fleet-operations')
@RequireModule(TenantModule.DASHBOARDS)
export class FleetOperationsController {
  constructor(
    private readonly metricsService: FleetOperationsMetricsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get('dashboard')
  @Roles(...FLEET_OPERATIONS_READ_ROLES)
  @ApiOperation({
    summary:
      'Dashboard consolidado de gestao operacional da frota (Camada A): visao geral, custos, ' +
      'abastecimento, pneus, manutencao, paradas e checklist. Filtros opcionais por periodo/' +
      'veiculo/frota.',
  })
  @ApiOkResponse({ type: FleetOperationsDashboardEntity })
  getDashboard(@Query() query: FleetOperationsQueryDto): Promise<FleetOperationsDashboardEntity> {
    return this.metricsService.getConsolidatedDashboard(this.tenantContext.requireTenantId(), query);
  }

  @Get('costs')
  @Roles(...FLEET_OPERATIONS_READ_ROLES)
  @ApiOperation({
    summary:
      'Custos consolidados REALIZADOS da frota (combustivel + manutencao + pneus + pedagio + ' +
      'outras despesas), com breakdown por categoria e ranking de veiculos.',
  })
  @ApiOkResponse({ type: FleetCostsEntity })
  getCosts(@Query() query: FleetOperationsQueryDto): Promise<FleetCostsEntity> {
    return this.metricsService.getCosts(this.tenantContext.requireTenantId(), query);
  }

  @Get('maintenance')
  @Roles(...FLEET_OPERATIONS_READ_ROLES)
  @ApiOperation({
    summary: 'Dashboard de manutencao com breakdown por tipo/prioridade/oficina/veiculo e tempo medio de execucao.',
  })
  @ApiOkResponse({ type: FleetMaintenanceDashboardEntity })
  getMaintenanceDashboard(@Query() query: FleetOperationsQueryDto): Promise<FleetMaintenanceDashboardEntity> {
    return this.metricsService.getMaintenanceDashboard(this.tenantContext.requireTenantId(), query);
  }

  @Get('stops')
  @Roles(...FLEET_OPERATIONS_READ_ROLES)
  @ApiOperation({
    summary: 'Dashboard de paradas/ociosidade da frota: total de paradas, duracao por tipo e ranking de veiculos.',
  })
  @ApiOkResponse({ type: FleetStopsDashboardEntity })
  getStopsDashboard(@Query() query: FleetOperationsQueryDto): Promise<FleetStopsDashboardEntity> {
    return this.metricsService.getStopsDashboard(this.tenantContext.requireTenantId(), query);
  }

  @Get('operations')
  @Roles(...FLEET_OPERATIONS_READ_ROLES)
  @ApiOperation({
    summary:
      'Fase 41 -- indicadores operacionais: viagens concluidas/andamento/canceladas, tempo medio de viagem, ' +
      'custo medio por viagem, utilizacao da frota (quando periodo informado) e ranking de viagens por veiculo.',
  })
  @ApiOkResponse({ type: FleetOperationalIndicatorsEntity })
  getOperationalIndicators(@Query() query: FleetOperationsQueryDto): Promise<FleetOperationalIndicatorsEntity> {
    return this.metricsService.getOperationalIndicators(this.tenantContext.requireTenantId(), query);
  }

  @Get('fuel')
  @Roles(...FLEET_OPERATIONS_READ_ROLES)
  @ApiOperation({
    summary:
      'Fase 42 -- gestao avancada de abastecimento: resumo, consumo/custo-por-km (quando houver ' +
      'dado de hodometro suficiente), breakdown por veiculo/frota, rankings, evolucao mensal, ' +
      'comparacao com periodo anterior e alertas (preco/consumo fora do padrao, hodometro regressivo).',
  })
  @ApiOkResponse({ type: FleetFuelAnalyticsEntity })
  getFuelAnalytics(@Query() query: FleetOperationsQueryDto): Promise<FleetFuelAnalyticsEntity> {
    return this.metricsService.getFuelAnalytics(this.tenantContext.requireTenantId(), query);
  }

  @Get('vehicles')
  @Roles(...FLEET_OPERATIONS_READ_ROLES)
  @ApiOperation({
    summary:
      'Composicao da frota: contagem por status/tipo/combustivel/frota, disponibilidade (em viagem/' +
      'disponivel), idade e odometro medios (quando houver dado), rankings de veiculos mais antigos/' +
      'novos e maior odometro. Foto do estado ATUAL da frota (ignora startDate/endDate).',
  })
  @ApiOkResponse({ type: FleetVehiclesOverviewEntity })
  getVehiclesOverview(@Query() query: FleetOperationsQueryDto): Promise<FleetVehiclesOverviewEntity> {
    return this.metricsService.getVehiclesOverview(this.tenantContext.requireTenantId(), query);
  }

  @Get('tires')
  @Roles(...FLEET_OPERATIONS_READ_ROLES)
  @ApiOperation({
    summary:
      'Pneus: composicao por status/frota, custo investido/recapagem (com filtro de periodo), evolucao mensal, ' +
      'gauge de desgaste por pneu (leitura direta de inspecao), ranking de veiculos por custo de pneu e alertas ' +
      'de proximidade de troca.',
  })
  @ApiOkResponse({ type: FleetTiresOverviewEntity })
  getTiresOverview(@Query() query: FleetOperationsQueryDto): Promise<FleetTiresOverviewEntity> {
    return this.metricsService.getTiresOverview(this.tenantContext.requireTenantId(), query);
  }

  @Get('downtime-cost')
  @Roles(...FLEET_OPERATIONS_READ_ROLES)
  @ApiOperation({
    summary:
      'Tempo parado por veiculo (manutencao/quebra/abastecimento/outras, via TripStop) e receita perdida ' +
      'ESTIMADA (tempo parado x taxa de receita/hora do proprio veiculo, calculada do historico completo de ' +
      'viagens concluidas). "Indisponivel" quando o veiculo nao tem viagens concluidas suficientes.',
  })
  @ApiOkResponse({ type: FleetDowntimeCostEntity })
  getDowntimeCost(@Query() query: FleetOperationsQueryDto): Promise<FleetDowntimeCostEntity> {
    return this.metricsService.getDowntimeCost(this.tenantContext.requireTenantId(), query);
  }

  @Get('compositions')
  @Roles(...FLEET_OPERATIONS_READ_ROLES)
  @ApiOperation({
    summary:
      'Uso de veiculo+carreta por viagem: composicao atual da frota de carretas (tipo/disponibilidade), ' +
      'configuracao de eixos das composicoes no periodo, ranking de carretas (nº de viagens/tempo em uso) ' +
      'e tempo parado vs. em uso por carreta (via TripStop.tripId -> composicao, nao cobre paradas sem tripId).',
  })
  @ApiOkResponse({ type: FleetCompositionsOverviewEntity })
  getCompositionsOverview(@Query() query: FleetOperationsQueryDto): Promise<FleetCompositionsOverviewEntity> {
    return this.metricsService.getCompositionsOverview(this.tenantContext.requireTenantId(), query);
  }
}
