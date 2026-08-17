import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantModule } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { BILLING_READ_ROLES } from '../constants/billing-roles.constants';
import { FindBillingDashboardQueryDto } from '../dto/find-billing-dashboard-query.dto';
import { FindTripBillingsQueryDto } from '../dto/find-trip-billings-query.dto';
import { BillingDashboardEntity } from '../entities/billing-dashboard.entity';
import { PaginatedTripBillingsEntity } from '../entities/paginated-trip-billings.entity';
import { BillingDashboardService } from '../services/billing-dashboard.service';
import { BillingListService } from '../services/billing-list.service';

@ApiTags('billing-operational')
@ApiBearerAuth()
@RequireModule(TenantModule.FREIGHT)
@Controller('operational-billing')
export class BillingController {
  constructor(
    private readonly billingListService: BillingListService,
    private readonly billingDashboardService: BillingDashboardService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...BILLING_READ_ROLES)
  @ApiOperation({
    summary: 'Lista faturamentos operacionais da empresa (filtro por periodo/cliente/frota/veiculo/motorista/status).',
  })
  @ApiOkResponse({ type: PaginatedTripBillingsEntity })
  findAll(@Query() query: FindTripBillingsQueryDto): Promise<PaginatedTripBillingsEntity> {
    return this.billingListService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get('dashboard')
  @Roles(...BILLING_READ_ROLES)
  @ApiOperation({
    summary:
      'Dashboard de faturamento (faturavel/faturado/recebido/saldo, prontas/parciais/pendentes, evolucao ' +
      'mensal, ranking por cliente/frota/veiculo, margem comercial).',
  })
  @ApiOkResponse({ type: BillingDashboardEntity })
  getDashboard(@Query() query: FindBillingDashboardQueryDto): Promise<BillingDashboardEntity> {
    return this.billingDashboardService.getDashboard(this.tenantContext.requireTenantId(), query);
  }
}
