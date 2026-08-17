import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantModule } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { BILLING_READ_ROLES, BILLING_WRITE_ROLES } from '../constants/billing-roles.constants';
import { InvoiceTripBillingDto } from '../dto/invoice-trip-billing.dto';
import { UpdateTripBillingDto } from '../dto/update-trip-billing.dto';
import { TripBillingEntity } from '../entities/trip-billing.entity';
import { TripBillingService } from '../services/trip-billing.service';

@ApiTags('billing-operational')
@ApiBearerAuth()
@RequireModule(TenantModule.FREIGHT)
@Controller('operational-billing/trips')
export class TripBillingController {
  constructor(
    private readonly tripBillingService: TripBillingService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get(':tripId')
  @Roles(...BILLING_READ_ROLES)
  @ApiOperation({
    summary:
      'Situacao de faturamento/conciliacao da viagem (contratado -> calculado -> faturavel -> faturado -> ' +
      'recebido -> saldo). Nunca 404 quando a viagem existe mas nao tem faturamento ainda -- retorna um preview.',
  })
  @ApiOkResponse({ type: TripBillingEntity })
  @ApiNotFoundResponse({ description: 'Viagem nao encontrada nesta empresa.' })
  getTripBilling(@Param('tripId', ParseUUIDPipe) tripId: string): Promise<TripBillingEntity> {
    return this.tripBillingService.getTripBilling(this.tenantContext.requireTenantId(), tripId);
  }

  @Post(':tripId/invoice')
  @Roles(...BILLING_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Fatura a viagem (total quando amount omitido, parcial quando informado). Idempotente: bloqueado quando ' +
      'o saldo ja e zero. Reaproveita TripRevenuesService.create -- gera exatamente 1 receita por lancamento.',
  })
  @ApiCreatedResponse({ type: TripBillingEntity })
  @ApiNotFoundResponse({ description: 'Viagem nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'Sem valor comercial calculado, sem saldo, ou faturamento cancelado/pago.' })
  invoice(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Body() dto: InvoiceTripBillingDto,
  ): Promise<TripBillingEntity> {
    return this.tripBillingService.invoice(
      this.tenantContext.requireTenantId(),
      tripId,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':tripId')
  @Roles(...BILLING_WRITE_ROLES)
  @ApiOperation({ summary: 'Confirma recebimento manual (status=PAID) e/ou atualiza observacoes.' })
  @ApiOkResponse({ type: TripBillingEntity })
  @ApiNotFoundResponse({ description: 'Faturamento ainda nao iniciado para esta viagem.' })
  @ApiConflictResponse({ description: 'Faturamento cancelado, ou tentativa de marcar PAID sem nada faturado.' })
  updateStatus(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Body() dto: UpdateTripBillingDto,
  ): Promise<TripBillingEntity> {
    return this.tripBillingService.updateStatus(
      this.tenantContext.requireTenantId(),
      tripId,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post(':tripId/cancel')
  @Roles(...BILLING_WRITE_ROLES)
  @ApiOperation({ summary: 'Cancela o faturamento -- bloqueia novos lancamentos, preserva entradas/receitas ja geradas.' })
  @ApiOkResponse({ type: TripBillingEntity })
  @ApiNotFoundResponse({ description: 'Faturamento ainda nao iniciado para esta viagem.' })
  @ApiConflictResponse({ description: 'Faturamento ja cancelado.' })
  cancel(@Param('tripId', ParseUUIDPipe) tripId: string): Promise<TripBillingEntity> {
    return this.tripBillingService.cancel(
      this.tenantContext.requireTenantId(),
      tripId,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
