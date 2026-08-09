import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { AxleEventEntity } from '../../trip-operations/entities/axle-event.entity';
import { TrackingPointsSyncResultEntity } from '../../trip-operations/entities/tracking-point.entity';
import { TripStopEntity } from '../../trip-operations/entities/trip-stop.entity';
import { CloseAxleEventDto } from '../../trip-operations/dto/close-axle-event.dto';
import { CloseTripStopDto } from '../../trip-operations/dto/close-trip-stop.dto';
import { CreateAxleEventDto } from '../../trip-operations/dto/create-axle-event.dto';
import { CreateTrackingPointsDto } from '../../trip-operations/dto/create-tracking-points.dto';
import { CreateTripStopDto } from '../../trip-operations/dto/create-trip-stop.dto';
import { AxleEventsService } from '../../trip-operations/services/axle-events.service';
import { TrackingPointsService } from '../../trip-operations/services/tracking-points.service';
import { TripStopsService } from '../../trip-operations/services/trip-stops.service';
import { CreateDriverFuelSupplyDto } from '../../fuel-supplies/dto/create-driver-fuel-supply.dto';
import { FuelSupplyEntity } from '../../fuel-supplies/entities/fuel-supply.entity';
import { FuelSuppliesService } from '../../fuel-supplies/services/fuel-supplies.service';
import { TripEntity } from '../../trips/entities/trip.entity';
import { DRIVER_TRIP_ROLES } from '../constants/driver-trip-roles.constants';
import { DriverContext } from '../context/driver-context';
import { NearbyTollPlazasQueryDto } from '../dto/nearby-toll-plazas-query.dto';
import { StartTripDto } from '../dto/start-trip.dto';
import { DriverActiveTripEntity } from '../entities/driver-active-trip.entity';
import { DriverConfigEntity } from '../entities/driver-config.entity';
import { NearbyTollPlazaEntity } from '../entities/nearby-toll-plaza.entity';
import { DriverGuard } from '../guards/driver.guard';
import { DriverTripsService } from '../services/driver-trips.service';
import { DriverRouteEntity } from '../../routing/entities/driver-route.entity';
import { RoutePlanComparisonEntity } from '../../routing/entities/route-plan-comparison.entity';
import { RoutingService } from '../../routing/services/routing.service';

// API propria do app do motorista (Fase 25) -- nunca reaproveita
// TripsController (administrativo, exclui DRIVER de proposito). Todo
// endpoint aqui: (1) exige role DRIVER, (2) exige um Driver vinculado
// (DriverGuard), (3) valida que a viagem pertence a ESTE motorista antes de
// qualquer leitura/escrita (nunca confia no :id sozinho).
@ApiTags('driver')
@ApiBearerAuth()
@Controller('driver')
@Roles(...DRIVER_TRIP_ROLES)
@UseGuards(DriverGuard)
export class DriverTripsController {
  constructor(
    private readonly driverTripsService: DriverTripsService,
    private readonly tripStopsService: TripStopsService,
    private readonly axleEventsService: AxleEventsService,
    private readonly trackingPointsService: TrackingPointsService,
    private readonly fuelSuppliesService: FuelSuppliesService,
    private readonly routingService: RoutingService,
    private readonly tenantContext: TenantContext,
    private readonly driverContext: DriverContext,
  ) {}

  @Get('config')
  @ApiOperation({ summary: 'Limites configuraveis pelo tenant (intervalo de GPS, deteccao de parada, raio de pedagio).' })
  @ApiOkResponse({ type: DriverConfigEntity })
  getConfig(): Promise<DriverConfigEntity> {
    return this.driverTripsService.getConfig(this.tenantContext.requireTenantId());
  }

  @Get('trips/active')
  @ApiOperation({ summary: 'Viagem em andamento (ACTIVE/PAUSED) deste motorista, se houver -- para a tela de retomada.' })
  @ApiOkResponse({ type: DriverActiveTripEntity })
  getActiveTrip(): Promise<DriverActiveTripEntity | null> {
    return this.driverTripsService.getActiveTrip(
      this.tenantContext.requireTenantId(),
      this.driverContext.requireDriverId(),
    );
  }

  @Get('trips/:id')
  @ApiOperation({ summary: 'Detalhe de uma viagem deste motorista.' })
  @ApiOkResponse({ type: TripEntity })
  getOne(@Param('id', ParseUUIDPipe) id: string): Promise<TripEntity> {
    return this.driverTripsService.getOne(
      this.tenantContext.requireTenantId(),
      this.driverContext.requireDriverId(),
      id,
    );
  }

  @Post('trips/:id/start')
  @ApiOperation({
    summary:
      'Inicia a viagem (idempotente se ja estiver em andamento). Aceita opcionalmente KM ' +
      'inicial e carregado/vazio (Fase 27, tela "INICIAR VIAGEM").',
  })
  @ApiOkResponse({ type: TripEntity })
  start(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StartTripDto,
  ): Promise<TripEntity> {
    return this.driverTripsService.start(
      this.tenantContext.requireTenantId(),
      this.driverContext.requireDriverId(),
      id,
      dto ?? {},
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post('trips/:id/pause')
  @ApiOperation({ summary: 'Pausa a viagem (idempotente se ja estiver pausada).' })
  @ApiOkResponse({ type: TripEntity })
  pause(@Param('id', ParseUUIDPipe) id: string): Promise<TripEntity> {
    return this.driverTripsService.pause(
      this.tenantContext.requireTenantId(),
      this.driverContext.requireDriverId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post('trips/:id/resume')
  @ApiOperation({ summary: 'Retoma a viagem (reabrir o app com viagem ja ACTIVE tambem cai aqui, sem efeito).' })
  @ApiOkResponse({ type: TripEntity })
  resume(@Param('id', ParseUUIDPipe) id: string): Promise<TripEntity> {
    return this.driverTripsService.resume(
      this.tenantContext.requireTenantId(),
      this.driverContext.requireDriverId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post('trips/:id/complete')
  @ApiOperation({ summary: 'Conclui a viagem (idempotente se ja estiver concluida).' })
  @ApiOkResponse({ type: TripEntity })
  complete(@Param('id', ParseUUIDPipe) id: string): Promise<TripEntity> {
    return this.driverTripsService.complete(
      this.tenantContext.requireTenantId(),
      this.driverContext.requireDriverId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Get('trips/:id/nearby-toll-plazas')
  @ApiOperation({ summary: 'Pracas de pedagio da rota da viagem proximas da posicao atual (Haversine, sem mapas externos).' })
  @ApiOkResponse({ type: NearbyTollPlazaEntity, isArray: true })
  getNearbyTollPlazas(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: NearbyTollPlazasQueryDto,
  ): Promise<NearbyTollPlazaEntity[]> {
    return this.driverTripsService.getNearbyTollPlazas(
      this.tenantContext.requireTenantId(),
      this.driverContext.requireDriverId(),
      id,
      query.lat,
      query.lng,
    );
  }

  @Get('trips/:id/route')
  @ApiOperation({
    summary:
      'Visao minima da rota planejada (Fase 26): destino, distancia restante, proximo pedagio. ' +
      'Null se a viagem nao tem rota planejada ainda.',
  })
  @ApiOkResponse({ type: DriverRouteEntity })
  async getRoute(@Param('id', ParseUUIDPipe) id: string): Promise<DriverRouteEntity | null> {
    const tenantId = this.tenantContext.requireTenantId();
    await this.driverTripsService.getOne(tenantId, this.driverContext.requireDriverId(), id);
    return this.routingService.getDriverView(tenantId, id);
  }

  @Post('trips/:id/route/recalculate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Recalcula a rota a partir da posicao atual do motorista, mantendo o destino original.',
  })
  @ApiOkResponse({ type: RoutePlanComparisonEntity })
  async recalculateRoute(@Param('id', ParseUUIDPipe) id: string): Promise<RoutePlanComparisonEntity> {
    const tenantId = this.tenantContext.requireTenantId();
    await this.driverTripsService.getOne(tenantId, this.driverContext.requireDriverId(), id);
    return this.routingService.recalculate(
      tenantId,
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post('trips/:id/locations')
  @ApiOperation({ summary: 'Envia um lote de posicoes GPS (offline-first, idempotente por deviceEventId).' })
  @ApiOkResponse({ type: TrackingPointsSyncResultEntity })
  async createLocations(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTrackingPointsDto,
  ): Promise<TrackingPointsSyncResultEntity> {
    const tenantId = this.tenantContext.requireTenantId();
    await this.driverTripsService.getOne(tenantId, this.driverContext.requireDriverId(), id);
    return this.trackingPointsService.createBatch(tenantId, id, dto);
  }

  @Post('trips/:id/stops')
  @ApiOperation({ summary: 'Abre uma parada operacional (idempotente por deviceEventId).' })
  @ApiOkResponse({ type: TripStopEntity })
  async openStop(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTripStopDto,
  ): Promise<TripStopEntity> {
    const tenantId = this.tenantContext.requireTenantId();
    await this.driverTripsService.getOne(tenantId, this.driverContext.requireDriverId(), id);
    return this.tripStopsService.open(
      tenantId,
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch('trips/:id/stops/:stopId/close')
  @ApiOperation({ summary: 'Fecha uma parada (duracao sempre calculada, nunca aceita do cliente).' })
  @ApiOkResponse({ type: TripStopEntity })
  async closeStop(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stopId', ParseUUIDPipe) stopId: string,
    @Body() dto: CloseTripStopDto,
  ): Promise<TripStopEntity> {
    const tenantId = this.tenantContext.requireTenantId();
    await this.driverTripsService.getOne(tenantId, this.driverContext.requireDriverId(), id);
    return this.tripStopsService.close(
      tenantId,
      id,
      stopId,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Get('trips/:id/stops')
  @ApiOperation({ summary: 'Lista as paradas desta viagem.' })
  @ApiOkResponse({ type: TripStopEntity, isArray: true })
  async findStops(@Param('id', ParseUUIDPipe) id: string): Promise<TripStopEntity[]> {
    const tenantId = this.tenantContext.requireTenantId();
    await this.driverTripsService.getOne(tenantId, this.driverContext.requireDriverId(), id);
    return this.tripStopsService.findAll(tenantId, id);
  }

  @Post('trips/:id/fuel-supplies')
  @ApiOperation({
    summary:
      'Registra um abastecimento (so KM + litros na tela do app). vehicleId/driverId/data/' +
      'localizacao/posto sempre derivados automaticamente -- idempotente por deviceEventId.',
  })
  @ApiOkResponse({ type: FuelSupplyEntity })
  async createFuelSupply(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDriverFuelSupplyDto,
  ): Promise<FuelSupplyEntity> {
    const tenantId = this.tenantContext.requireTenantId();
    await this.driverTripsService.getOne(tenantId, this.driverContext.requireDriverId(), id);
    return this.fuelSuppliesService.createFromDriverApp(
      tenantId,
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post('trips/:id/axle-events')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Registra uma excecao de eixos numa praca (declaredAxles omitido = timeout, assume o ' +
      'padrao da composicao automaticamente). Idempotente por deviceEventId.',
  })
  @ApiOkResponse({ type: AxleEventEntity })
  async createAxleEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAxleEventDto,
  ): Promise<AxleEventEntity> {
    const tenantId = this.tenantContext.requireTenantId();
    await this.driverTripsService.getOne(tenantId, this.driverContext.requireDriverId(), id);
    return this.axleEventsService.open(
      tenantId,
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch('trips/:id/axle-events/:eventId/close')
  @ApiOperation({ summary: 'Fecha uma excecao de eixo (praca ultrapassada, volta implicita ao padrao).' })
  @ApiOkResponse({ type: AxleEventEntity })
  async closeAxleEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CloseAxleEventDto,
  ): Promise<AxleEventEntity> {
    const tenantId = this.tenantContext.requireTenantId();
    await this.driverTripsService.getOne(tenantId, this.driverContext.requireDriverId(), id);
    return this.axleEventsService.close(
      tenantId,
      id,
      eventId,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
