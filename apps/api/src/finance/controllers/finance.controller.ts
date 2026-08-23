import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantModule } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import { FINANCE_READ_ROLES } from '../constants/finance-roles.constants';
import { FindCashFlowQueryDto } from '../dto/find-cash-flow-query.dto';
import { CashFlowEntity } from '../entities/cash-flow.entity';
import { CashFlowService } from '../services/cash-flow.service';

// Fase 74 -- visao financeira consolidada (fluxo de caixa/liquidez).
// Modulo SOMENTE LEITURA: nenhuma mutacao propria, apenas projecao sobre
// Receivable/Payable (Fase 72/73). Mesmo gate de modulo ja usado por
// /receivables e /payables (FREIGHT).
@ApiTags('finance')
@ApiBearerAuth()
@RequireModule(TenantModule.FREIGHT)
@Controller('finance')
export class FinanceController {
  constructor(
    private readonly cashFlowService: CashFlowService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get('cash-flow')
  @Roles(...FINANCE_READ_ROLES)
  @ApiOperation({
    summary:
      'Fluxo de caixa e liquidez consolidados: recebido/pago reais (ReceivablePayment/PayablePayment), ' +
      'em aberto/vencido a receber e a pagar, saldo projetado, serie mensal e rankings por cliente/categoria. ' +
      'Projecao sobre os titulos existentes -- nunca um saldo bancario real.',
  })
  @ApiOkResponse({ type: CashFlowEntity })
  getCashFlow(@Query() query: FindCashFlowQueryDto): Promise<CashFlowEntity> {
    return this.cashFlowService.getCashFlow(this.tenantContext.requireTenantId(), query);
  }
}
