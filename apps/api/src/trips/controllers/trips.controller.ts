import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { TRIP_READ_ROLES, TRIP_WRITE_ROLES } from '../constants/trip-roles.constants';
import { CreateRouteEventDto } from '../dto/create-route-event.dto';
import { CreateTripDto } from '../dto/create-trip.dto';
import { FindTripsQueryDto } from '../dto/find-trips-query.dto';
import { PlannedTripMetricsDto } from '../dto/planned-trip-metrics.dto';
import { UpdateRouteEventDto } from '../dto/update-route-event.dto';
import { UpdateTripStatusDto } from '../dto/update-trip-status.dto';
import { UpdateTripDto } from '../dto/update-trip.dto';
import { PaginatedTripsEntity } from '../entities/paginated-trips.entity';
import { RouteEventEntity } from '../entities/route-event.entity';
import { RouteVersionEntity } from '../entities/route-version.entity';
import { TripMetricsEntity } from '../entities/trip-metrics.entity';
import { TripEntity } from '../entities/trip.entity';
import { RouteEventsService } from '../services/route-events.service';
import { RouteVersionsService } from '../services/route-versions.service';
import { TripMetricsService } from '../services/trip-metrics.service';
import { TripsService } from '../services/trips.service';

@ApiTags('trips')
@ApiBearerAuth()
@Controller('trips')
export class TripsController {
  constructor(
    private readonly tripsService: TripsService,
    private readonly routeVersionsService: RouteVersionsService,
    private readonly routeEventsService: RouteEventsService,
    private readonly tripMetricsService: TripMetricsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({ summary: 'Lista viagens da empresa (busca, filtros, paginacao, ordenacao).' })
  @ApiOkResponse({ type: PaginatedTripsEntity })
  findAll(@Query() query: FindTripsQueryDto): Promise<PaginatedTripsEntity> {
    return this.tripsService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({ summary: 'Consulta uma viagem da empresa.' })
  @ApiOkResponse({ type: TripEntity })
  @ApiNotFoundResponse({ description: 'Viagem nao encontrada nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<TripEntity> {
    return this.tripsService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Post()
  @Roles(...TRIP_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Planeja uma nova viagem. Cria automaticamente a RouteVersion inicial e o TripMetrics (previstos).',
  })
  @ApiCreatedResponse({ type: TripEntity })
  @ApiNotFoundResponse({
    description: 'Cliente, motorista, local ou composicao nao encontrados nesta empresa.',
  })
  @ApiConflictResponse({
    description: 'Motorista ou composicao indisponiveis no periodo informado.',
  })
  create(@Body() dto: CreateTripDto): Promise<TripEntity> {
    return this.tripsService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id')
  @Roles(...TRIP_WRITE_ROLES)
  @ApiOperation({
    summary: 'Atualiza o planejamento de uma viagem (somente enquanto status = PLANNED).',
  })
  @ApiOkResponse({ type: TripEntity })
  @ApiNotFoundResponse({
    description: 'Viagem, cliente, motorista, local ou composicao nao encontrados.',
  })
  @ApiConflictResponse({
    description: 'Viagem nao esta mais em PLANNED, ou motorista/composicao indisponiveis.',
  })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTripDto): Promise<TripEntity> {
    return this.tripsService.update(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id/status')
  @Roles(...TRIP_WRITE_ROLES)
  @ApiOperation({
    summary: 'Transiciona o status da viagem (PLANNED -> IN_PROGRESS -> COMPLETED).',
  })
  @ApiOkResponse({ type: TripEntity })
  @ApiNotFoundResponse({ description: 'Viagem nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'Transicao de status nao permitida.' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTripStatusDto,
  ): Promise<TripEntity> {
    return this.tripsService.updateStatus(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id/cancel')
  @Roles(...TRIP_WRITE_ROLES)
  @ApiOperation({ summary: 'Cancela a viagem (permitido a partir de PLANNED ou IN_PROGRESS).' })
  @ApiOkResponse({ type: TripEntity })
  @ApiNotFoundResponse({ description: 'Viagem nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'Viagem ja concluida ou ja cancelada.' })
  cancel(@Param('id', ParseUUIDPipe) id: string): Promise<TripEntity> {
    return this.tripsService.cancel(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Delete(':id')
  @Roles(...TRIP_WRITE_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui logicamente uma viagem (somente PLANNED ou CANCELLED).' })
  @ApiNoContentResponse({ description: 'Viagem excluida.' })
  @ApiNotFoundResponse({ description: 'Viagem nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'Viagem em andamento ou concluida nao pode ser excluida.' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.tripsService.softDelete(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  // ==========================================================================
  // ROUTE VERSIONS (somente leitura -- imutavel)
  // ==========================================================================
  @Get(':id/route-versions')
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({
    summary: 'Lista as versoes de rota da viagem (nesta fase, sempre 1: a versao inicial).',
  })
  @ApiOkResponse({ type: RouteVersionEntity, isArray: true })
  @ApiNotFoundResponse({ description: 'Viagem nao encontrada nesta empresa.' })
  findRouteVersions(@Param('id', ParseUUIDPipe) tripId: string): Promise<RouteVersionEntity[]> {
    return this.routeVersionsService.findAll(this.tenantContext.requireTenantId(), tripId);
  }

  // ==========================================================================
  // ROUTE EVENTS (CRUD administrativo)
  // ==========================================================================
  @Get(':id/route-events')
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({ summary: 'Lista os eventos de rota registrados na viagem.' })
  @ApiOkResponse({ type: RouteEventEntity, isArray: true })
  @ApiNotFoundResponse({ description: 'Viagem nao encontrada nesta empresa.' })
  findRouteEvents(@Param('id', ParseUUIDPipe) tripId: string): Promise<RouteEventEntity[]> {
    return this.routeEventsService.findAll(this.tenantContext.requireTenantId(), tripId);
  }

  @Post(':id/route-events')
  @Roles(...TRIP_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Registra um evento de rota (acidente, desvio, obra, bloqueio, alteracao de destino). Cadastro manual.',
  })
  @ApiCreatedResponse({ type: RouteEventEntity })
  @ApiNotFoundResponse({ description: 'Viagem nao encontrada nesta empresa.' })
  createRouteEvent(
    @Param('id', ParseUUIDPipe) tripId: string,
    @Body() dto: CreateRouteEventDto,
  ): Promise<RouteEventEntity> {
    return this.routeEventsService.create(
      this.tenantContext.requireTenantId(),
      tripId,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id/route-events/:eventId')
  @Roles(...TRIP_WRITE_ROLES)
  @ApiOperation({ summary: 'Marca um evento de rota como resolvido.' })
  @ApiOkResponse({ type: RouteEventEntity })
  @ApiNotFoundResponse({ description: 'Evento nao encontrado para esta viagem.' })
  updateRouteEvent(
    @Param('id', ParseUUIDPipe) tripId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: UpdateRouteEventDto,
  ): Promise<RouteEventEntity> {
    return this.routeEventsService.update(
      this.tenantContext.requireTenantId(),
      tripId,
      eventId,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Delete(':id/route-events/:eventId')
  @Roles(...TRIP_WRITE_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove um evento de rota.' })
  @ApiNoContentResponse({ description: 'Evento removido.' })
  @ApiNotFoundResponse({ description: 'Evento nao encontrado para esta viagem.' })
  async removeRouteEvent(
    @Param('id', ParseUUIDPipe) tripId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<void> {
    await this.routeEventsService.remove(
      this.tenantContext.requireTenantId(),
      tripId,
      eventId,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  // ==========================================================================
  // TRIP METRICS (previstos)
  // ==========================================================================
  @Get(':id/metrics')
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({
    summary: 'Consulta as metricas da viagem (previstas nesta fase; executadas ficam vazias).',
  })
  @ApiOkResponse({ type: TripMetricsEntity })
  @ApiNotFoundResponse({ description: 'Viagem ou metricas nao encontradas.' })
  findMetrics(@Param('id', ParseUUIDPipe) tripId: string): Promise<TripMetricsEntity> {
    return this.tripMetricsService.findOne(this.tenantContext.requireTenantId(), tripId);
  }

  @Patch(':id/metrics')
  @Roles(...TRIP_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Atualiza as metricas PREVISTAS da viagem (distancia, duracao, combustivel, pedagio, custo).',
  })
  @ApiOkResponse({ type: TripMetricsEntity })
  @ApiNotFoundResponse({ description: 'Viagem ou metricas nao encontradas.' })
  updateMetrics(
    @Param('id', ParseUUIDPipe) tripId: string,
    @Body() dto: PlannedTripMetricsDto,
  ): Promise<TripMetricsEntity> {
    return this.tripMetricsService.updatePlanned(
      this.tenantContext.requireTenantId(),
      tripId,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
