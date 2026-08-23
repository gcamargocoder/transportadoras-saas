import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantModule } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import { RECONCILIATION_READ_ROLES } from '../constants/reconciliation-roles.constants';
import { FindFinanceReconciliationQueryDto } from '../dto/find-finance-reconciliation-query.dto';
import { FinanceReconciliationEntity } from '../entities/finance-reconciliation.entity';
import { FinanceReconciliationService } from '../services/finance-reconciliation.service';

// Fase 75 -- conciliacao/integridade financeira. Montado no MESMO prefixo
// /finance do FinanceController (Fase 74, cash-flow) -- rota final
// GET /finance/reconciliation, exatamente como pedido. Modulo SOMENTE
// LEITURA: apenas detecta, nunca corrige/gera nada automaticamente.
@ApiTags('finance')
@ApiBearerAuth()
@RequireModule(TenantModule.FREIGHT)
@Controller('finance')
export class FinanceReconciliationController {
  constructor(
    private readonly reconciliationService: FinanceReconciliationService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get('reconciliation')
  @Roles(...RECONCILIATION_READ_ROLES)
  @ApiOperation({
    summary:
      'Conciliacao financeira: inconsistencias entre TripBilling/Receivable/ReceivablePayment e ' +
      'TripExpense/Payable/PayablePayment. Projecao calculada ao vivo -- nunca persistida, nunca corrige nada automaticamente.',
  })
  @ApiOkResponse({ type: FinanceReconciliationEntity })
  getReconciliation(@Query() query: FindFinanceReconciliationQueryDto): Promise<FinanceReconciliationEntity> {
    return this.reconciliationService.getReconciliation(this.tenantContext.requireTenantId(), query);
  }
}
