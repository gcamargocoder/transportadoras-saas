import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { TRIP_READ_ROLES, TRIP_WRITE_ROLES } from '../../trips/constants/trip-roles.constants';
import { SelectRoutePlanDto } from '../dto/select-route-plan.dto';
import { RoutePlanComparisonEntity } from '../entities/route-plan-comparison.entity';
import { RoutePlanTollEntity } from '../entities/route-plan-toll.entity';
import { RoutePlanEntity } from '../entities/route-plan.entity';
import { RoutingService } from '../services/routing.service';

// Sub-recurso de Trip (rota geografica planejada, Fase 26) -- controller
// proprio (nao dentro de TripsController, ja bastante extenso) montado
// diretamente no path aninhado, mesmo espirito de isolamento ja usado pelo
// modulo driver-trips na Fase 25. Todos os endpoints aqui sao
// administrativos (TRIP_READ_ROLES/TRIP_WRITE_ROLES) -- o app do motorista
// tem seus proprios endpoints equivalentes em DriverTripsController,
// delegando para o MESMO RoutingService.
@ApiTags('route-plan')
@ApiBearerAuth()
@Controller('trips/:tripId/route-plan')
export class RoutePlanController {
  constructor(
    private readonly routingService: RoutingService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post()
  @Roles(...TRIP_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Calcula a rota geografica principal da viagem (origem/destino/veiculo ja cadastrados) e a ' +
      'torna a rota atual. Descobre pedagios cruzando a geometria com o catalogo de TollPlaza.',
  })
  @ApiOkResponse({ type: RoutePlanEntity })
  @ApiNotFoundResponse({ description: 'Viagem nao encontrada, ou nenhuma rota encontrada pelo provider.' })
  computePrimary(@Param('tripId', ParseUUIDPipe) tripId: string): Promise<RoutePlanEntity> {
    return this.routingService.computePrimary(
      this.tenantContext.requireTenantId(),
      tripId,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post('alternatives')
  @Roles(...TRIP_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Calcula rotas alternativas (quando o provider oferecer mais de uma). Nenhuma passa a ser ' +
      'a atual automaticamente, exceto se a viagem ainda nao tinha nenhuma rota selecionada.',
  })
  @ApiOkResponse({ type: RoutePlanEntity, isArray: true })
  computeAlternatives(@Param('tripId', ParseUUIDPipe) tripId: string): Promise<RoutePlanEntity[]> {
    return this.routingService.computeAlternatives(
      this.tenantContext.requireTenantId(),
      tripId,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post('select')
  @Roles(...TRIP_WRITE_ROLES)
  @ApiOperation({ summary: 'Seleciona uma das rotas ja calculadas para esta viagem como a rota atual.' })
  @ApiOkResponse({ type: RoutePlanEntity })
  @ApiNotFoundResponse({ description: 'Rota planejada nao encontrada para esta viagem.' })
  select(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Body() dto: SelectRoutePlanDto,
  ): Promise<RoutePlanEntity> {
    return this.routingService.select(
      this.tenantContext.requireTenantId(),
      tripId,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post('recalculate')
  @HttpCode(HttpStatus.OK)
  @Roles(...TRIP_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Recalcula a rota a partir da ultima posicao conhecida (ou da origem original, se a ' +
      'viagem ainda nao comecou), mantendo o destino. Resolve automaticamente um desvio em ' +
      'aberto e devolve a comparacao (rota anterior x nova rota).',
  })
  @ApiOkResponse({ type: RoutePlanComparisonEntity })
  recalculate(@Param('tripId', ParseUUIDPipe) tripId: string): Promise<RoutePlanComparisonEntity> {
    return this.routingService.recalculate(
      this.tenantContext.requireTenantId(),
      tripId,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Get()
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({ summary: 'Consulta a rota geografica atualmente selecionada da viagem (null se nenhuma).' })
  @ApiOkResponse({ type: RoutePlanEntity })
  getCurrent(@Param('tripId', ParseUUIDPipe) tripId: string): Promise<RoutePlanEntity | null> {
    return this.routingService.getCurrent(this.tenantContext.requireTenantId(), tripId);
  }

  @Get('tolls')
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({ summary: 'Lista os pedagios previstos (ordenados) da rota atual da viagem.' })
  @ApiOkResponse({ type: RoutePlanTollEntity, isArray: true })
  getTolls(@Param('tripId', ParseUUIDPipe) tripId: string): Promise<RoutePlanTollEntity[]> {
    return this.routingService.getTolls(this.tenantContext.requireTenantId(), tripId);
  }
}
