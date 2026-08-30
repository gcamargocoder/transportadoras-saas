import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
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
import { PAYABLE_READ_ROLES, PAYABLE_WRITE_ROLES } from '../constants/payable-roles.constants';
import { CreatePayableDto } from '../dto/create-payable.dto';
import { FindPayablesDashboardQueryDto } from '../dto/find-payables-dashboard-query.dto';
import { FindPayablesQueryDto } from '../dto/find-payables-query.dto';
import { GeneratePayableDto } from '../dto/generate-payable.dto';
import { RegisterPayablePaymentDto } from '../dto/register-payable-payment.dto';
import { PaginatedPayablesEntity } from '../entities/paginated-payables.entity';
import { PayableEntity } from '../entities/payable.entity';
import { PayablesDashboardEntity } from '../entities/payables-dashboard.entity';
import { PayablesDashboardService } from '../services/payables-dashboard.service';
import { PayablesService } from '../services/payables.service';

// Fase 73 -- contas a pagar, espelho de Contas a Receber (Fase 72) para o
// lado da despesa. Mesmo gate de modulo ja usado por /operational-billing
// e /receivables (FREIGHT).
@ApiTags('payables')
@ApiBearerAuth()
@RequireModule(TenantModule.FREIGHT)
@Controller('payables')
export class PayablesController {
  constructor(
    private readonly payablesService: PayablesService,
    private readonly dashboardService: PayablesDashboardService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post('from-expense/:expenseId')
  @Roles(...PAYABLE_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Gera uma conta a pagar a partir de uma despesa (TripExpense) aprovada. Idempotente: bloqueado ' +
      'se ja existir um titulo para este expenseId.',
  })
  @ApiCreatedResponse({ type: PayableEntity })
  @ApiNotFoundResponse({ description: 'Despesa (expenseId) nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'Despesa nao aprovada, ou titulo ja gerado.' })
  generateFromExpense(
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @Body() dto: GeneratePayableDto,
  ): Promise<PayableEntity> {
    return this.payablesService.generateFromExpense(
      this.tenantContext.requireTenantId(),
      expenseId,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post()
  @Roles(...PAYABLE_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Cria um titulo MANUAL (sem viagem/despesa de origem) -- ex: aluguel, seguro, fornecedor administrativo. ' +
      'Quando installments > 1, gera todas as parcelas de uma vez (mesmo installmentGroupId).',
  })
  @ApiCreatedResponse({ type: PayableEntity, isArray: true })
  create(@Body() dto: CreatePayableDto): Promise<PayableEntity[]> {
    return this.payablesService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  // Registrada ANTES de GET /payables/:id -- nunca colide com o
  // ParseUUIDPipe (mesmo padrao ja usado em ReceivablesController).
  @Get('dashboard')
  @Roles(...PAYABLE_READ_ROLES)
  @ApiOperation({
    summary:
      'Dashboard de contas a pagar: total/pago/em aberto/vencido/a vencer, aging (a vencer, 1-30/31-60/' +
      '61-90/91+ dias) e consolidado por categoria de despesa.',
  })
  @ApiOkResponse({ type: PayablesDashboardEntity })
  getDashboard(@Query() query: FindPayablesDashboardQueryDto): Promise<PayablesDashboardEntity> {
    return this.dashboardService.getDashboard(this.tenantContext.requireTenantId(), query);
  }

  @Get()
  @Roles(...PAYABLE_READ_ROLES)
  @ApiOperation({ summary: 'Lista contas a pagar, paginado e filtravel por viagem/categoria/status/periodo/vencimento.' })
  @ApiOkResponse({ type: PaginatedPayablesEntity })
  findAll(@Query() query: FindPayablesQueryDto): Promise<PaginatedPayablesEntity> {
    return this.payablesService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...PAYABLE_READ_ROLES)
  @ApiOperation({ summary: 'Detalhe de uma conta a pagar, incluindo o historico de pagamentos.' })
  @ApiOkResponse({ type: PayableEntity })
  @ApiNotFoundResponse({ description: 'Conta a pagar nao encontrada nesta empresa.' })
  findById(@Param('id', ParseUUIDPipe) id: string): Promise<PayableEntity> {
    return this.payablesService.findById(this.tenantContext.requireTenantId(), id);
  }

  @Post(':id/payments')
  @Roles(...PAYABLE_WRITE_ROLES)
  @ApiOperation({
    summary: 'Registra um pagamento (parcial ou total) para o titulo. Nunca permite ultrapassar o saldo em aberto.',
  })
  @ApiCreatedResponse({ type: PayableEntity })
  @ApiNotFoundResponse({ description: 'Conta a pagar nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'Titulo cancelado, ou ja totalmente pago.' })
  registerPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegisterPayablePaymentDto,
  ): Promise<PayableEntity> {
    return this.payablesService.registerPayment(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post(':id/cancel')
  @Roles(...PAYABLE_WRITE_ROLES)
  @ApiOperation({
    summary: 'Cancela o titulo -- bloqueia novos pagamentos, preserva o historico de pagamentos ja registrados.',
  })
  @ApiOkResponse({ type: PayableEntity })
  @ApiNotFoundResponse({ description: 'Conta a pagar nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'Titulo ja cancelado.' })
  cancel(@Param('id', ParseUUIDPipe) id: string): Promise<PayableEntity> {
    return this.payablesService.cancel(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
