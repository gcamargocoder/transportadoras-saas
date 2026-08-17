import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantModule } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { FREIGHT_READ_ROLES, FREIGHT_WRITE_ROLES } from '../constants/freight-roles.constants';
import { ApplyFreightToTripDto } from '../dto/apply-freight-to-trip.dto';
import { SimulateFreightDto } from '../dto/simulate-freight.dto';
import { UpdateTripFreightDto } from '../dto/update-trip-freight.dto';
import { FreightQuoteEntity } from '../entities/freight-quote.entity';
import { TripFreightEntity } from '../entities/trip-freight.entity';
import { TripProfitabilityEntity } from '../entities/trip-profitability.entity';
import { FreightPricingService } from '../services/freight-pricing.service';

@ApiTags('freight-pricing')
@ApiBearerAuth()
@RequireModule(TenantModule.FREIGHT)
@Controller('freight')
export class FreightPricingController {
  constructor(
    private readonly freightPricingService: FreightPricingService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post('simulate')
  @Roles(...FREIGHT_READ_ROLES)
  @ApiOperation({
    summary:
      'Simula o calculo de frete para os parametros informados, sem persistir nada. Retorna ' +
      'available=false quando nao existe tabela/regra compativel (nunca inventa preco).',
  })
  @ApiOkResponse({ type: FreightQuoteEntity })
  @ApiNotFoundResponse({ description: 'Cliente (customerId) nao encontrado nesta empresa.' })
  simulate(@Body() dto: SimulateFreightDto): Promise<FreightQuoteEntity> {
    return this.freightPricingService.simulate(this.tenantContext.requireTenantId(), dto);
  }

  @Get('trips/:tripId')
  @Roles(...FREIGHT_READ_ROLES)
  @ApiOperation({ summary: 'Consulta o valor comercial aplicado a uma viagem (null quando nunca calculado).' })
  @ApiOkResponse({ type: TripFreightEntity })
  @ApiNotFoundResponse({ description: 'Viagem nao encontrada nesta empresa.' })
  getTripFreight(@Param('tripId', ParseUUIDPipe) tripId: string): Promise<TripFreightEntity | null> {
    return this.freightPricingService.getTripFreight(this.tenantContext.requireTenantId(), tripId);
  }

  @Post('trips/:tripId/apply')
  @Roles(...FREIGHT_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Calcula e grava um snapshot comercial na viagem (contrato/tabela/regra/composicao/valor estimado). ' +
      'Reaplicar recalcula os campos estimados sem alterar contractedAmount/finalAmount/revenueId ja definidos.',
  })
  @ApiCreatedResponse({ type: TripFreightEntity })
  @ApiNotFoundResponse({ description: 'Viagem ou cliente nao encontrados nesta empresa.' })
  @ApiConflictResponse({ description: 'Contrato informado nao esta ACTIVE ou esta vencido.' })
  applyToTrip(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Body() dto: ApplyFreightToTripDto,
  ): Promise<TripFreightEntity> {
    return this.freightPricingService.applyToTrip(
      this.tenantContext.requireTenantId(),
      tripId,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch('trips/:tripId')
  @Roles(...FREIGHT_WRITE_ROLES)
  @ApiOperation({ summary: 'Edita o valor contratado/final (negociacao humana) -- nunca recalcula.' })
  @ApiOkResponse({ type: TripFreightEntity })
  @ApiNotFoundResponse({ description: 'Viagem sem cotacao comercial aplicada ainda.' })
  updateTripFreight(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Body() dto: UpdateTripFreightDto,
  ): Promise<TripFreightEntity> {
    return this.freightPricingService.updateTripFreight(
      this.tenantContext.requireTenantId(),
      tripId,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post('trips/:tripId/apply-revenue')
  @Roles(...FREIGHT_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Gera a receita (TripRevenue, categoria FREIGHT) a partir do valor comercial contratado -- nunca ' +
      'duplica se ja existir uma receita gerada anteriormente.',
  })
  @ApiOkResponse({ type: TripFreightEntity })
  @ApiNotFoundResponse({ description: 'Viagem sem cotacao comercial aplicada ainda.' })
  @ApiConflictResponse({ description: 'Ja existe receita vinculada, ou nenhum valor comercial disponivel.' })
  applyRevenue(@Param('tripId', ParseUUIDPipe) tripId: string): Promise<TripFreightEntity> {
    return this.freightPricingService.applyRevenue(
      this.tenantContext.requireTenantId(),
      tripId,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Get('trips/:tripId/profitability')
  @Roles(...FREIGHT_READ_ROLES)
  @ApiOperation({
    summary: 'Rentabilidade da viagem: contratado x custo/receita realizados (reaproveita o financeiro da Fase 51).',
  })
  @ApiOkResponse({ type: TripProfitabilityEntity })
  @ApiNotFoundResponse({ description: 'Viagem nao encontrada nesta empresa.' })
  getProfitability(@Param('tripId', ParseUUIDPipe) tripId: string): Promise<TripProfitabilityEntity> {
    return this.freightPricingService.getProfitability(this.tenantContext.requireTenantId(), tripId);
  }
}
