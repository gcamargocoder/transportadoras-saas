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
import { RECEIVABLE_READ_ROLES, RECEIVABLE_WRITE_ROLES } from '../constants/receivable-roles.constants';
import { FindReceivablesDashboardQueryDto } from '../dto/find-receivables-dashboard-query.dto';
import { FindReceivablesQueryDto } from '../dto/find-receivables-query.dto';
import { GenerateReceivableDto } from '../dto/generate-receivable.dto';
import { RegisterReceivablePaymentDto } from '../dto/register-receivable-payment.dto';
import { PaginatedReceivablesEntity } from '../entities/paginated-receivables.entity';
import { ReceivableEntity } from '../entities/receivable.entity';
import { ReceivablesDashboardEntity } from '../entities/receivables-dashboard.entity';
import { ReceivablesDashboardService } from '../services/receivables-dashboard.service';
import { ReceivablesService } from '../services/receivables.service';

// Fase 72 -- contas a receber, visao de cobranca/acompanhamento sobre o
// faturamento operacional (Fase 60). Mesmo gate de modulo ja usado por
// /operational-billing (FREIGHT) -- nao existe um TenantModule dedicado a
// financeiro e nao ha necessidade de criar um novo (secao "RBAC").
@ApiTags('receivables')
@ApiBearerAuth()
@RequireModule(TenantModule.FREIGHT)
@Controller('receivables')
export class ReceivablesController {
  constructor(
    private readonly receivablesService: ReceivablesService,
    private readonly dashboardService: ReceivablesDashboardService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post('from-billing/:billingId')
  @Roles(...RECEIVABLE_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Gera uma conta a receber a partir de um faturamento (TripBilling) existente. Idempotente: ' +
      'bloqueado se ja existir um titulo para este billingId.',
  })
  @ApiCreatedResponse({ type: ReceivableEntity })
  @ApiNotFoundResponse({ description: 'Faturamento (billingId) nao encontrado nesta empresa.' })
  @ApiConflictResponse({ description: 'Faturamento cancelado, sem valor faturado, ou titulo ja gerado.' })
  generateFromBilling(
    @Param('billingId', ParseUUIDPipe) billingId: string,
    @Body() dto: GenerateReceivableDto,
  ): Promise<ReceivableEntity> {
    return this.receivablesService.generateFromBilling(
      this.tenantContext.requireTenantId(),
      billingId,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  // Registrada ANTES de GET /receivables/:id -- nunca colide com o
  // ParseUUIDPipe (mesmo padrao ja usado em TripsController para
  // /trips/operations/active).
  @Get('dashboard')
  @Roles(...RECEIVABLE_READ_ROLES)
  @ApiOperation({
    summary:
      'Dashboard de contas a receber: faturado/recebido/em aberto/vencido/a vencer, aging (a vencer, ' +
      '1-30/31-60/61-90/91+ dias) e consolidado por cliente.',
  })
  @ApiOkResponse({ type: ReceivablesDashboardEntity })
  getDashboard(@Query() query: FindReceivablesDashboardQueryDto): Promise<ReceivablesDashboardEntity> {
    return this.dashboardService.getDashboard(this.tenantContext.requireTenantId(), query);
  }

  @Get()
  @Roles(...RECEIVABLE_READ_ROLES)
  @ApiOperation({ summary: 'Lista contas a receber, paginado e filtravel por cliente/viagem/status/periodo/vencimento.' })
  @ApiOkResponse({ type: PaginatedReceivablesEntity })
  findAll(@Query() query: FindReceivablesQueryDto): Promise<PaginatedReceivablesEntity> {
    return this.receivablesService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...RECEIVABLE_READ_ROLES)
  @ApiOperation({ summary: 'Detalhe de uma conta a receber, incluindo o historico de recebimentos.' })
  @ApiOkResponse({ type: ReceivableEntity })
  @ApiNotFoundResponse({ description: 'Conta a receber nao encontrada nesta empresa.' })
  findById(@Param('id', ParseUUIDPipe) id: string): Promise<ReceivableEntity> {
    return this.receivablesService.findById(this.tenantContext.requireTenantId(), id);
  }

  @Post(':id/payments')
  @Roles(...RECEIVABLE_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Registra um recebimento (parcial ou total) para o titulo. Nunca permite ultrapassar o saldo em aberto.',
  })
  @ApiCreatedResponse({ type: ReceivableEntity })
  @ApiNotFoundResponse({ description: 'Conta a receber nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'Titulo cancelado, ou ja totalmente recebido.' })
  registerPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegisterReceivablePaymentDto,
  ): Promise<ReceivableEntity> {
    return this.receivablesService.registerPayment(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post(':id/cancel')
  @Roles(...RECEIVABLE_WRITE_ROLES)
  @ApiOperation({
    summary: 'Cancela o titulo -- bloqueia novos recebimentos, preserva o historico de pagamentos ja registrados.',
  })
  @ApiOkResponse({ type: ReceivableEntity })
  @ApiNotFoundResponse({ description: 'Conta a receber nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'Titulo ja cancelado.' })
  cancel(@Param('id', ParseUUIDPipe) id: string): Promise<ReceivableEntity> {
    return this.receivablesService.cancel(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
