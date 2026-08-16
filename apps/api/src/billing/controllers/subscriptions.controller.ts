import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { extractRequestMetadata } from '../../auth/utils/request-metadata.util';
import { ADMIN_THROTTLE } from '../../common/constants/throttle.constants';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { BillingDashboardQueryDto } from '../dto/billing-dashboard-query.dto';
import { CreateSubscriptionDto } from '../dto/create-subscription.dto';
import { FindSubscriptionsQueryDto } from '../dto/find-subscriptions-query.dto';
import { RegisterPaymentDto } from '../dto/register-payment.dto';
import { UpdateSubscriptionDto } from '../dto/update-subscription.dto';
import { BillingDashboardEntity } from '../entities/billing-dashboard.entity';
import { PaginatedSubscriptionPaymentsEntity } from '../entities/paginated-subscription-payments.entity';
import { PaginatedSubscriptionsEntity } from '../entities/paginated-subscriptions.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { SubscriptionPaymentEntity } from '../entities/subscription-payment.entity';
import { BillingDashboardService } from '../services/billing-dashboard.service';
import { SubscriptionsService } from '../services/subscriptions.service';

// Fase 50 -- Gestao Manual de Assinaturas e Cobranca. Dominio inteiro
// SUPER_ADMIN-only (@Roles a nivel de classe) -- ADMIN comum de qualquer
// tenant recebe 403 em toda rota, o que ja cobre "nao pode acessar
// cobranca de outro tenant" (nao acessa a de nenhum tenant por aqui).
@ApiTags('billing')
@ApiBearerAuth()
@Roles(UserRole.SUPER_ADMIN)
@Throttle(ADMIN_THROTTLE)
@Controller('billing')
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly dashboardService: BillingDashboardService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: '[Super Admin] Dashboard de cobranca: receita prevista, recebido, pendente, atrasado, proximos vencimentos.' })
  @ApiOkResponse({ type: BillingDashboardEntity })
  getDashboard(@Query() query: BillingDashboardQueryDto): Promise<BillingDashboardEntity> {
    return this.dashboardService.getDashboard(query);
  }

  @Get('subscriptions')
  @ApiOperation({ summary: '[Super Admin] Lista assinaturas, com filtros de status/metodo/plano/periodo/busca.' })
  @ApiOkResponse({ type: PaginatedSubscriptionsEntity })
  findAll(@Query() query: FindSubscriptionsQueryDto): Promise<PaginatedSubscriptionsEntity> {
    return this.subscriptionsService.findAll(query);
  }

  @Post('subscriptions')
  @ApiOperation({ summary: '[Super Admin] Cria a assinatura de um tenant (um tenant so pode ter 1 assinatura ativa por vez).' })
  @ApiCreatedResponse({ type: SubscriptionEntity })
  create(
    @Body() dto: CreateSubscriptionDto,
    @CurrentUser('sub') userId: string,
    @Req() request: Request,
  ): Promise<SubscriptionEntity> {
    return this.subscriptionsService.create(dto, { userId }, extractRequestMetadata(request));
  }

  @Get('subscriptions/:id')
  @ApiOperation({ summary: '[Super Admin] Consulta uma assinatura, incluindo o ultimo pagamento registrado.' })
  @ApiOkResponse({ type: SubscriptionEntity })
  @ApiNotFoundResponse({ description: 'Assinatura nao encontrada.' })
  findById(@Param('id', ParseUUIDPipe) id: string): Promise<SubscriptionEntity> {
    return this.subscriptionsService.findById(id);
  }

  @Patch('subscriptions/:id')
  @ApiOperation({
    summary:
      '[Super Admin] Edita uma assinatura (atualizacao parcial) -- inclusive vencimento e status. ' +
      'Cancelamento e feito enviando status=CANCELLED (nao ha rota separada).',
  })
  @ApiOkResponse({ type: SubscriptionEntity })
  @ApiNotFoundResponse({ description: 'Assinatura nao encontrada.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubscriptionDto,
    @CurrentUser('sub') userId: string,
    @Req() request: Request,
  ): Promise<SubscriptionEntity> {
    return this.subscriptionsService.update(id, dto, { userId }, extractRequestMetadata(request));
  }

  @Post('subscriptions/:id/payments')
  @ApiOperation({
    summary:
      '[Super Admin] Registra um pagamento (novo registro no historico -- nunca altera um pagamento anterior). ' +
      'Quando status=PAID, avanca o proximo vencimento conforme a periodicidade automaticamente.',
  })
  @ApiCreatedResponse({ type: SubscriptionPaymentEntity })
  @ApiNotFoundResponse({ description: 'Assinatura nao encontrada.' })
  registerPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegisterPaymentDto,
    @CurrentUser('sub') userId: string,
    @Req() request: Request,
  ): Promise<SubscriptionPaymentEntity> {
    return this.subscriptionsService.registerPayment(id, dto, { userId }, extractRequestMetadata(request));
  }

  @Get('subscriptions/:id/payments')
  @ApiOperation({ summary: '[Super Admin] Historico paginado de pagamentos de uma assinatura.' })
  @ApiOkResponse({ type: PaginatedSubscriptionPaymentsEntity })
  @ApiNotFoundResponse({ description: 'Assinatura nao encontrada.' })
  listPayments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedSubscriptionPaymentsEntity> {
    return this.subscriptionsService.listPayments(id, query.page, query.pageSize);
  }
}
