import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantModule } from '@prisma/client';
import { PaginatedAuditLogEntity } from '../../audit/entities/paginated-audit-log.entity';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import { FINANCE_AUDIT_READ_ROLES } from '../constants/finance-audit-roles.constants';
import { FindFinanceAuditQueryDto } from '../dto/find-finance-audit-query.dto';
import { FinanceAuditService } from '../services/finance-audit.service';

// Fase 77 -- montado no MESMO prefixo /finance dos demais modulos
// financeiros (Fases 74-76) -- rota final GET /finance/audit. Modulo
// SOMENTE LEITURA: nenhuma mutacao propria, apenas uma projecao filtrada
// sobre o AuditLog ja existente (nunca um sistema de auditoria paralelo).
@ApiTags('finance')
@ApiBearerAuth()
@RequireModule(TenantModule.FREIGHT)
@Controller('finance')
export class FinanceAuditController {
  constructor(
    private readonly financeAuditService: FinanceAuditService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get('audit')
  @Roles(...FINANCE_AUDIT_READ_ROLES)
  @ApiOperation({
    summary:
      'Auditoria financeira: eventos de Receivable/ReceivablePayment/Payable/PayablePayment/FinancialPeriod, ' +
      'paginado e filtravel (from/to/entityName/entityId/action/userId), ordenado por createdAt DESC. ' +
      'Leitura sobre o AuditLog ja existente -- nunca um sistema de auditoria paralelo.',
  })
  @ApiOkResponse({ type: PaginatedAuditLogEntity })
  findAll(@Query() query: FindFinanceAuditQueryDto): Promise<PaginatedAuditLogEntity> {
    return this.financeAuditService.findAll(this.tenantContext.requireTenantId(), query);
  }
}
