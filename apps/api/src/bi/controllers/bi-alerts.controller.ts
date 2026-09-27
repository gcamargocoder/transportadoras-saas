import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantModule } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { DASHBOARD_ROLES } from '../../dashboard/constants/dashboard-roles.constants';
import { TenantContext } from '../../tenants/context/tenant-context';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import { BiAlertsQueryDto } from '../dto/bi-alerts-query.dto';
import { AlertsResponseEntity } from '../entities/bi-alert.entity';
import { BiAlertsService } from '../services/bi-alerts.service';

// BI 10 -- alertas/anomalias deterministicos sobre os KPIs oficiais. Mesmo
// modulo/RBAC/tenant isolation da camada de KPIs (BI 1): nenhuma segunda
// porta de entrada para os mesmos dados.
@ApiTags('bi')
@ApiBearerAuth()
@Controller('bi/alerts')
@RequireModule(TenantModule.DASHBOARDS)
export class BiAlertsController {
  constructor(
    private readonly alertsService: BiAlertsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...DASHBOARD_ROLES)
  @ApiOperation({
    summary:
      'Alertas deterministicos avaliados sobre os KPIs oficiais do periodo (limite absoluto, variacao vs. comparacao, ' +
      'desvio dentro do proprio periodo). Mesmo escopo/periodo/comparacao de /bi/kpis/summary; cada alerta traz o ' +
      'KpiResultEntity oficial (mesmo contrato do summary) para reuso de "Como e calculado"/evidencias.',
  })
  @ApiOkResponse({ type: AlertsResponseEntity })
  getAlerts(@Query() query: BiAlertsQueryDto): Promise<AlertsResponseEntity> {
    return this.alertsService.getAlerts(this.tenantContext.requireTenantId(), query);
  }
}
