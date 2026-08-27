import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { FINANCE_READ_ROLES } from '../../finance/constants/finance-roles.constants';
import { TenantContext } from '../../tenants/context/tenant-context';
import { FindCustomerProfitabilityDashboardQueryDto } from '../dto/find-customer-profitability-dashboard-query.dto';
import { FindCustomerProfitabilityQueryDto } from '../dto/find-customer-profitability-query.dto';
import { CustomerProfitabilityDashboardEntity } from '../entities/customer-profitability-dashboard.entity';
import { CustomerProfitabilityEntity } from '../entities/customer-profitability.entity';
import { PaginatedCustomerProfitabilityEntity } from '../entities/paginated-customer-profitability.entity';
import { CustomerProfitabilityService } from '../services/customer-profitability.service';

// Fase 97 -- SOMENTE LEITURA (mesmo espirito de FinanceController/
// CashFlowService, Fase 74): nenhuma mutacao propria, so consolida dados ja
// existentes. Mesmo grupo de roles (FINANCE_READ_ROLES).
@ApiTags('customer-profitability')
@ApiBearerAuth()
@Controller('customer-profitability')
export class CustomerProfitabilityController {
  constructor(
    private readonly profitabilityService: CustomerProfitabilityService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get('dashboard')
  @Roles(...FINANCE_READ_ROLES)
  @ApiOperation({
    summary:
      'Indicadores gerais (receita/custo/resultado/margem/viagens/clientes) e ranking de clientes por ' +
      'resultado e por margem, no periodo filtrado.',
  })
  @ApiOkResponse({ type: CustomerProfitabilityDashboardEntity })
  getDashboard(@Query() query: FindCustomerProfitabilityDashboardQueryDto): Promise<CustomerProfitabilityDashboardEntity> {
    return this.profitabilityService.getDashboard(this.tenantContext.requireTenantId(), query);
  }

  @Get('customers')
  @Roles(...FINANCE_READ_ROLES)
  @ApiOperation({ summary: 'Lista a rentabilidade por cliente (filtro por cliente/periodo, ordenacao, paginacao).' })
  @ApiOkResponse({ type: PaginatedCustomerProfitabilityEntity })
  findAll(@Query() query: FindCustomerProfitabilityQueryDto): Promise<PaginatedCustomerProfitabilityEntity> {
    return this.profitabilityService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get('customers/:customerId')
  @Roles(...FINANCE_READ_ROLES)
  @ApiOperation({
    summary:
      'Rentabilidade de um cliente especifico. Nunca 404 por ausencia de viagens -- retorna um registro ' +
      'zerado; so 404 quando o cliente em si nao existe.',
  })
  @ApiOkResponse({ type: CustomerProfitabilityEntity })
  @ApiNotFoundResponse({ description: 'Cliente nao encontrado nesta empresa.' })
  getForCustomer(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query() query: FindCustomerProfitabilityDashboardQueryDto,
  ): Promise<CustomerProfitabilityEntity> {
    return this.profitabilityService.getForCustomer(this.tenantContext.requireTenantId(), customerId, query);
  }
}
