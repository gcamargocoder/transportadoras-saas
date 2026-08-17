import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantModule } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { FREIGHT_READ_ROLES } from '../constants/freight-roles.constants';
import { FindFreightDashboardQueryDto } from '../dto/find-freight-dashboard-query.dto';
import { FreightDashboardEntity } from '../entities/freight-dashboard.entity';
import { FreightDashboardService } from '../services/freight-dashboard.service';

@ApiTags('freight-dashboard')
@ApiBearerAuth()
@RequireModule(TenantModule.FREIGHT)
@Controller('freight/dashboard')
export class FreightDashboardController {
  constructor(
    private readonly freightDashboardService: FreightDashboardService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...FREIGHT_READ_ROLES)
  @ApiOperation({ summary: 'Dashboard comercial de fretes (contratado, ticket medio, margem, top clientes/rotas/tabelas, contratos vencendo, viagens sem regra).' })
  @ApiOkResponse({ type: FreightDashboardEntity })
  getDashboard(@Query() query: FindFreightDashboardQueryDto): Promise<FreightDashboardEntity> {
    return this.freightDashboardService.getDashboard(this.tenantContext.requireTenantId(), query);
  }
}
