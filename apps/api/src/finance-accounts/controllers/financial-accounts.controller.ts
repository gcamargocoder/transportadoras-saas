import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { TenantModule } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import { FINANCIAL_ACCOUNT_READ_ROLES, FINANCIAL_ACCOUNT_WRITE_ROLES } from '../constants/financial-account-roles.constants';
import { CreateFinancialAccountDto } from '../dto/create-financial-account.dto';
import { CreateFinancialTransactionDto } from '../dto/create-financial-transaction.dto';
import { FindFinancialAccountsQueryDto } from '../dto/find-financial-accounts-query.dto';
import { FindFinancialTransactionsQueryDto } from '../dto/find-financial-transactions-query.dto';
import { UpdateFinancialAccountDto } from '../dto/update-financial-account.dto';
import { FinancialAccountEntity } from '../entities/financial-account.entity';
import { FinancialAccountsDashboardEntity } from '../entities/financial-accounts-dashboard.entity';
import { FinancialTransactionEntity } from '../entities/financial-transaction.entity';
import { PaginatedFinancialAccountsEntity } from '../entities/paginated-financial-accounts.entity';
import { PaginatedFinancialTransactionsEntity } from '../entities/paginated-financial-transactions.entity';
import { FinancialAccountsDashboardService } from '../services/financial-accounts-dashboard.service';
import { FinancialAccountsService } from '../services/financial-accounts.service';
import { FinancialTransactionsService } from '../services/financial-transactions.service';

// Fase 78 -- contas financeiras (bancarias/caixa). Montado no MESMO
// prefixo /finance dos demais modulos financeiros (Fases 74-77) -- rotas
// finais GET/POST/PATCH /finance/accounts/... Mesmo gate de modulo
// (FREIGHT) ja usado por /receivables, /payables, /finance/periods e
// /finance/audit.
@ApiTags('finance')
@ApiBearerAuth()
@RequireModule(TenantModule.FREIGHT)
@Controller('finance/accounts')
export class FinancialAccountsController {
  constructor(
    private readonly accountsService: FinancialAccountsService,
    private readonly transactionsService: FinancialTransactionsService,
    private readonly dashboardService: FinancialAccountsDashboardService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post()
  @Roles(...FINANCIAL_ACCOUNT_WRITE_ROLES)
  @ApiOperation({ summary: 'Cadastra uma conta financeira (BANK/CASH). initialBalance e fixado aqui, nunca alterado depois.' })
  @ApiCreatedResponse({ type: FinancialAccountEntity })
  create(@Body() dto: CreateFinancialAccountDto): Promise<FinancialAccountEntity> {
    return this.accountsService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  // Registrada ANTES de GET /finance/accounts/:id -- nunca colide com o
  // ParseUUIDPipe (mesmo padrao ja usado em PayablesController/ReceivablesController).
  @Get('dashboard')
  @Roles(...FINANCIAL_ACCOUNT_READ_ROLES)
  @ApiOperation({ summary: 'KPIs das contas financeiras: saldo total, saldo bancario, saldo em caixa, contas ativas/inativas.' })
  @ApiOkResponse({ type: FinancialAccountsDashboardEntity })
  getDashboard(): Promise<FinancialAccountsDashboardEntity> {
    return this.dashboardService.getDashboard(this.tenantContext.requireTenantId());
  }

  @Get()
  @Roles(...FINANCIAL_ACCOUNT_READ_ROLES)
  @ApiOperation({ summary: 'Lista contas financeiras, paginado e filtravel por tipo/status. Saldo atual calculado sem N+1.' })
  @ApiOkResponse({ type: PaginatedFinancialAccountsEntity })
  findAll(@Query() query: FindFinancialAccountsQueryDto): Promise<PaginatedFinancialAccountsEntity> {
    return this.accountsService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...FINANCIAL_ACCOUNT_READ_ROLES)
  @ApiOperation({ summary: 'Detalhe de uma conta financeira, incluindo o saldo atual calculado.' })
  @ApiOkResponse({ type: FinancialAccountEntity })
  @ApiNotFoundResponse({ description: 'Conta financeira nao encontrada nesta empresa.' })
  findById(@Param('id', ParseUUIDPipe) id: string): Promise<FinancialAccountEntity> {
    return this.accountsService.findById(this.tenantContext.requireTenantId(), id);
  }

  @Patch(':id')
  @Roles(...FINANCIAL_ACCOUNT_WRITE_ROLES)
  @ApiOperation({ summary: 'Atualiza dados de identificacao da conta (nome/banco). Nunca altera type/initialBalance/isActive.' })
  @ApiOkResponse({ type: FinancialAccountEntity })
  @ApiNotFoundResponse({ description: 'Conta financeira nao encontrada nesta empresa.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFinancialAccountDto): Promise<FinancialAccountEntity> {
    return this.accountsService.update(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post(':id/activate')
  @Roles(...FINANCIAL_ACCOUNT_WRITE_ROLES)
  @ApiOperation({ summary: 'Reativa a conta.' })
  @ApiOkResponse({ type: FinancialAccountEntity })
  @ApiNotFoundResponse({ description: 'Conta financeira nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'A conta ja esta ativa.' })
  activate(@Param('id', ParseUUIDPipe) id: string): Promise<FinancialAccountEntity> {
    return this.accountsService.activate(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post(':id/deactivate')
  @Roles(...FINANCIAL_ACCOUNT_WRITE_ROLES)
  @ApiOperation({ summary: 'Desativa a conta (nao exclui, preserva historico).' })
  @ApiOkResponse({ type: FinancialAccountEntity })
  @ApiNotFoundResponse({ description: 'Conta financeira nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'A conta ja esta inativa.' })
  deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<FinancialAccountEntity> {
    return this.accountsService.deactivate(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Get(':id/transactions')
  @Roles(...FINANCIAL_ACCOUNT_READ_ROLES)
  @ApiOperation({ summary: 'Historico de movimentacoes da conta, paginado e filtravel por periodo/tipo.' })
  @ApiOkResponse({ type: PaginatedFinancialTransactionsEntity })
  @ApiNotFoundResponse({ description: 'Conta financeira nao encontrada nesta empresa.' })
  findTransactions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: FindFinancialTransactionsQueryDto,
  ): Promise<PaginatedFinancialTransactionsEntity> {
    return this.transactionsService.findAll(this.tenantContext.requireTenantId(), id, query);
  }

  @Post(':id/transactions')
  @Roles(...FINANCIAL_ACCOUNT_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Registra uma movimentacao manual (CREDIT/DEBIT). amount sempre positivo. Bloqueado se o periodo financeiro ' +
      'da transactionDate estiver fechado, ou se a conta estiver inativa.',
  })
  @ApiCreatedResponse({ type: FinancialTransactionEntity })
  @ApiNotFoundResponse({ description: 'Conta financeira nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'Conta inativa, ou periodo financeiro fechado.' })
  createTransaction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateFinancialTransactionDto,
  ): Promise<FinancialTransactionEntity> {
    return this.transactionsService.create(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
