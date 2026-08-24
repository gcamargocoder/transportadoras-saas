import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { TenantModule } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import { BANK_RECONCILIATION_READ_ROLES, BANK_RECONCILIATION_WRITE_ROLES } from '../constants/bank-reconciliation-roles.constants';
import { FindBankReconciliationDashboardQueryDto } from '../dto/find-bank-reconciliation-dashboard-query.dto';
import { FindBankTransactionsQueryDto } from '../dto/find-bank-transactions-query.dto';
import { ReconcileBankTransactionDto } from '../dto/reconcile-bank-transaction.dto';
import { BankReconciliationDashboardEntity } from '../entities/bank-reconciliation-dashboard.entity';
import { BankTransactionCandidateEntity } from '../entities/bank-transaction-candidate.entity';
import { BankTransactionEntity } from '../entities/bank-transaction.entity';
import { PaginatedBankTransactionsEntity } from '../entities/paginated-bank-transactions.entity';
import { BankReconciliationDashboardService } from '../services/bank-reconciliation-dashboard.service';
import { BankTransactionsService } from '../services/bank-transactions.service';

// Fase 80 -- conciliacao bancaria. Montado no MESMO prefixo /finance dos
// demais modulos financeiros (Fases 74-79).
@ApiTags('finance')
@ApiBearerAuth()
@RequireModule(TenantModule.FREIGHT)
@Controller('finance/bank-transactions')
export class BankTransactionsController {
  constructor(
    private readonly bankTransactionsService: BankTransactionsService,
    private readonly dashboardService: BankReconciliationDashboardService,
    private readonly tenantContext: TenantContext,
  ) {}

  // Registrada ANTES de GET /finance/bank-transactions/:id -- nunca colide
  // com o ParseUUIDPipe (mesmo padrao ja usado em outros modulos financeiros).
  @Get('dashboard')
  @Roles(...BANK_RECONCILIATION_READ_ROLES)
  @ApiOperation({
    summary:
      'KPIs de conciliacao: total/conciliado/pendente/divergente (contagem e valor). Nunca calcula saldo -- ' +
      'saldo oficial continua sendo FinancialAccount + FinancialTransaction.',
  })
  @ApiOkResponse({ type: BankReconciliationDashboardEntity })
  getDashboard(@Query() query: FindBankReconciliationDashboardQueryDto): Promise<BankReconciliationDashboardEntity> {
    return this.dashboardService.getDashboard(this.tenantContext.requireTenantId(), query);
  }

  @Get()
  @Roles(...BANK_RECONCILIATION_READ_ROLES)
  @ApiOperation({ summary: 'Lista movimentacoes bancarias importadas, paginado e filtravel por conta/status/tipo/periodo.' })
  @ApiOkResponse({ type: PaginatedBankTransactionsEntity })
  findAll(@Query() query: FindBankTransactionsQueryDto): Promise<PaginatedBankTransactionsEntity> {
    return this.bankTransactionsService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...BANK_RECONCILIATION_READ_ROLES)
  @ApiOperation({ summary: 'Detalhe de uma movimentacao bancaria, incluindo a FinancialTransaction vinculada quando conciliada.' })
  @ApiOkResponse({ type: BankTransactionEntity })
  @ApiNotFoundResponse({ description: 'Movimentacao bancaria nao encontrada nesta empresa.' })
  findById(@Param('id', ParseUUIDPipe) id: string): Promise<BankTransactionEntity> {
    return this.bankTransactionsService.findById(this.tenantContext.requireTenantId(), id);
  }

  @Get(':id/candidates')
  @Roles(...BANK_RECONCILIATION_READ_ROLES)
  @ApiOperation({
    summary:
      'Candidatos de FinancialTransaction para conciliar com esta movimentacao (mesma conta/tipo/valor, data em ' +
      'janela de +/-5 dias). Somente leitura -- nunca vincula.',
  })
  @ApiOkResponse({ type: [BankTransactionCandidateEntity] })
  @ApiNotFoundResponse({ description: 'Movimentacao bancaria nao encontrada nesta empresa.' })
  findCandidates(@Param('id', ParseUUIDPipe) id: string): Promise<BankTransactionCandidateEntity[]> {
    return this.bankTransactionsService.findCandidates(this.tenantContext.requireTenantId(), id);
  }

  @Post(':id/reconcile')
  @Roles(...BANK_RECONCILIATION_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Concilia manualmente a movimentacao bancaria com uma FinancialTransaction existente. Rejeita conta/tipo/valor ' +
      'incompativel; data diferente e permitida e marcada DIVERGENT (nunca ajuste automatico).',
  })
  @ApiOkResponse({ type: BankTransactionEntity })
  @ApiNotFoundResponse({ description: 'Movimentacao bancaria ou FinancialTransaction nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'Ja conciliada, incompativel, ou periodo financeiro fechado.' })
  reconcile(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReconcileBankTransactionDto): Promise<BankTransactionEntity> {
    return this.bankTransactionsService.reconcile(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post(':id/unreconcile')
  @Roles(...BANK_RECONCILIATION_WRITE_ROLES)
  @ApiOperation({
    summary: 'Remove o vinculo de conciliacao -- preserva a movimentacao bancaria e a FinancialTransaction, nunca apaga nada.',
  })
  @ApiOkResponse({ type: BankTransactionEntity })
  @ApiNotFoundResponse({ description: 'Movimentacao bancaria nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'Movimentacao nao esta conciliada, ou periodo financeiro fechado.' })
  unreconcile(@Param('id', ParseUUIDPipe) id: string): Promise<BankTransactionEntity> {
    return this.bankTransactionsService.unreconcile(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
