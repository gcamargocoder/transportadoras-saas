import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { DASHBOARD_ROLES } from '../constants/dashboard-roles.constants';
import { DashboardQueryDto } from '../dto/dashboard-query.dto';
import { DashboardEntity } from '../entities/dashboard.entity';
import { DashboardService } from '../services/dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...DASHBOARD_ROLES)
  @ApiOperation({
    summary:
      'Dashboard executivo consolidado: visao geral, financeiro, operacional, frota e ' +
      'graficos dos ultimos 12 meses. Somente leitura (sem auditoria). Restrito a SUPER_ADMIN/' +
      'ADMIN/MANAGER.',
  })
  @ApiOkResponse({ type: DashboardEntity })
  getDashboard(@Query() query: DashboardQueryDto): Promise<DashboardEntity> {
    return this.dashboardService.getDashboard(this.tenantContext.requireTenantId(), query);
  }
}
