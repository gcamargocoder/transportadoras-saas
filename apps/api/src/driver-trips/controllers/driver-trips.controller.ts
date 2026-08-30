import {
  BadRequestException,
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
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UPLOAD_THROTTLE } from '../../common/constants/throttle.constants';
import { TenantContext } from '../../tenants/context/tenant-context';
import { CreateChecklistExecutionDto } from '../../checklists/dto/create-checklist-execution.dto';
import { FindAvailableChecklistsQueryDto } from '../../checklists/dto/find-available-checklists-query.dto';
import { SubmitChecklistAnswersDto } from '../../checklists/dto/submit-checklist-answers.dto';
import { UploadChecklistEvidenceDto } from '../../checklists/dto/upload-checklist-evidence.dto';
import { ChecklistAnswersSubmitResultEntity } from '../../checklists/entities/checklist-answers-submit-result.entity';
import { ChecklistEvidenceEntity } from '../../checklists/entities/checklist-evidence.entity';
import { ChecklistExecutionEntity } from '../../checklists/entities/checklist-execution.entity';
import { ChecklistTemplateEntity } from '../../checklists/entities/checklist-template.entity';
import { ChecklistExecutionsService } from '../../checklists/services/checklist-executions.service';
import { ChecklistTemplatesService } from '../../checklists/services/checklist-templates.service';
import { MulterExceptionFilter } from '../../toll-import/filters/multer-exception.filter';
import { AxleEventEntity } from '../../trip-operations/entities/axle-event.entity';
import { TrackingPointsSyncResultEntity } from '../../trip-operations/entities/tracking-point.entity';
import { TripStopEntity } from '../../trip-operations/entities/trip-stop.entity';
import { UpdateTripDeliveryStopStatusDto } from '../../trips/dto/update-trip-delivery-stop-status.dto';
import { TripDeliveryStopEntity } from '../../trips/entities/trip-delivery-stop.entity';
import { TripEtaResultEntity } from '../../trips/entities/trip-eta.entity';
import { TripDeliveryStopsService } from '../../trips/services/trip-delivery-stops.service';
import { TripEtaService } from '../../trips/services/trip-eta.service';
import { DriverShiftEntity } from '../../trip-operations/entities/driver-shift.entity';
import { TripOccurrenceEntity } from '../../trip-operations/entities/trip-occurrence.entity';
import { CloseAxleEventDto } from '../../trip-operations/dto/close-axle-event.dto';
import { CloseTripStopByDeviceEventDto } from '../../trip-operations/dto/close-trip-stop-by-device-event.dto';
import { CloseTripStopDto } from '../../trip-operations/dto/close-trip-stop.dto';
import { CreateAxleEventDto } from '../../trip-operations/dto/create-axle-event.dto';
import { CreateDriverTripOccurrenceDto } from '../../trip-operations/dto/create-driver-trip-occurrence.dto';
import { CreateTrackingPointsDto } from '../../trip-operations/dto/create-tracking-points.dto';
import { CreateTripStopDto } from '../../trip-operations/dto/create-trip-stop.dto';
import { StartDriverShiftDto } from '../../trip-operations/dto/start-driver-shift.dto';
import { StartShiftBreakDto } from '../../trip-operations/dto/start-shift-break.dto';
import { AxleEventsService } from '../../trip-operations/services/axle-events.service';
import { DriverShiftsService } from '../../trip-operations/services/driver-shifts.service';
import { TrackingPointsService } from '../../trip-operations/services/tracking-points.service';
import { TripOccurrencesService } from '../../trip-operations/services/trip-occurrences.service';
import { TripStopsService } from '../../trip-operations/services/trip-stops.service';
import { CreateDriverFuelSupplyDto } from '../../fuel-supplies/dto/create-driver-fuel-supply.dto';
import { FuelSupplyEntity } from '../../fuel-supplies/entities/fuel-supply.entity';
import { FuelSuppliesService } from '../../fuel-supplies/services/fuel-supplies.service';
import { SubmitDeliveryProofDto } from '../../fiscal/dto/submit-delivery-proof.dto';
import { SubmitOccurrenceEvidenceDto } from '../../fiscal/dto/submit-occurrence-evidence.dto';
import { FiscalDocumentEntity } from '../../fiscal/entities/fiscal-document.entity';
import { FiscalDocumentsService } from '../../fiscal/services/fiscal-documents.service';
import { FindNotificationsQueryDto } from '../../notifications/dto/find-notifications-query.dto';
import { NotificationEntity, PaginatedNotificationsEntity, UnreadNotificationCountEntity } from '../../notifications/entities/notification.entity';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { TripEntity } from '../../trips/entities/trip.entity';
import { DRIVER_TRIP_ROLES } from '../constants/driver-trip-roles.constants';
import { buildDriverDeliveryProofMulterOptions } from '../config/driver-delivery-proof-storage.config';
import { DriverContext } from '../context/driver-context';
import { NearbyTollPlazasQueryDto } from '../dto/nearby-toll-plazas-query.dto';
import { StartTripDto } from '../dto/start-trip.dto';
import { PauseTripDto } from '../dto/pause-trip.dto';
import { ResumeTripDto } from '../dto/resume-trip.dto';
import { CompleteTripDto } from '../dto/complete-trip.dto';
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
    private readonly tripOccurrencesService: TripOccurrencesService,
    private readonly tripDeliveryStopsService: TripDeliveryStopsService,
    private readonly tripEtaService: TripEtaService,
    private readonly driverShiftsService: DriverShiftsService,
    private readonly fuelSuppliesService: FuelSuppliesService,
    private readonly routingService: RoutingService,
    private readonly checklistTemplatesService: ChecklistTemplatesService,
    private readonly checklistExecutionsService: ChecklistExecutionsService,
    private readonly fiscalDocumentsService: FiscalDocumentsService,
    private readonly notificationsService: NotificationsService,
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
  @ApiOperation({
    summary:
      'Pausa a viagem (idempotente se ja estiver pausada). Aceita opcionalmente a posicao GPS ' +
      'atual (Fase 28) -- RoutePlan/TrackingPoints/historico nunca sao perdidos numa pausa.',
  })
  @ApiOkResponse({ type: TripEntity })
  pause(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PauseTripDto,
  ): Promise<TripEntity> {
    return this.driverTripsService.pause(
      this.tenantContext.requireTenantId(),
      this.driverContext.requireDriverId(),
      id,
      dto ?? {},
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post('trips/:id/resume')
  @ApiOperation({
    summary:
      'Retoma a viagem (reabrir o app com viagem ja ACTIVE tambem cai aqui, sem efeito). Aceita ' +
      'opcionalmente a posicao GPS atual (Fase 28) -- reavalia desvio de rota automaticamente.',
  })
  @ApiOkResponse({ type: TripEntity })
  resume(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResumeTripDto,
  ): Promise<TripEntity> {
    return this.driverTripsService.resume(
      this.tenantContext.requireTenantId(),
      this.driverContext.requireDriverId(),
      id,
      dto ?? {},
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post('trips/:id/complete')
  @ApiOperation({
    summary:
      'Conclui a viagem (idempotente se ja estiver concluida). Aceita opcionalmente o KM final ' +
      '(Fase 28, tela "FINALIZAR VIAGEM") -- validado contra o odometro atual do veiculo.',
  })
  @ApiOkResponse({ type: TripEntity })
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteTripDto,
  ): Promise<TripEntity> {
    return this.driverTripsService.complete(
      this.tenantContext.requireTenantId(),
      this.driverContext.requireDriverId(),
      id,
      dto ?? {},
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

  // Fase 43 -- fecha uma parada pelo deviceEventId usado na ABERTURA, nao
  // pelo id do servidor (ver comentario em CloseTripStopByDeviceEventDto).
  // Habilita a fila offline (syncQueue.ts) a enfileirar o fechamento sem
  // depender de ter recebido resposta da abertura antes.
  @Post('trips/:id/stops/close-by-device-event')
  @ApiOperation({ summary: 'Fecha uma parada pelo deviceEventId usado na abertura (suporte a fechamento enfileirado offline).' })
  @ApiOkResponse({ type: TripStopEntity })
  async closeStopByDeviceEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseTripStopByDeviceEventDto,
  ): Promise<TripStopEntity> {
    const tenantId = this.tenantContext.requireTenantId();
    await this.driverTripsService.getOne(tenantId, this.driverContext.requireDriverId(), id);
    return this.tripStopsService.closeByDeviceEvent(
      tenantId,
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  // ==========================================================================
  // OCORRENCIAS (Fase 67) -- TripOccurrencesService vive em modulo proprio
  // (TripOperationsModule), importado aqui exatamente como TripStopsService/
  // AxleEventsService acima: nenhum service/controller paralelo. driverId
  // SEMPRE o motorista autenticado, vehicleId SEMPRE derivado da Trip --
  // nunca aceitos do corpo. Motorista NUNCA resolve/cancela (so cria a
  // propria ocorrencia): essas acoes ficam exclusivas do admin em
  // TripsController.
  // ==========================================================================

  @Post('trips/:id/occurrences')
  @ApiOperation({ summary: 'Registra uma ocorrencia nesta viagem (idempotente por deviceEventId).' })
  @ApiOkResponse({ type: TripOccurrenceEntity })
  async createOccurrence(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDriverTripOccurrenceDto,
  ): Promise<TripOccurrenceEntity> {
    const tenantId = this.tenantContext.requireTenantId();
    const driverId = this.driverContext.requireDriverId();
    await this.driverTripsService.getOne(tenantId, driverId, id);
    return this.tripOccurrencesService.createFromDriverApp(
      tenantId,
      id,
      driverId,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Get('trips/:id/occurrences')
  @ApiOperation({ summary: 'Lista as ocorrencias registradas nesta viagem.' })
  @ApiOkResponse({ type: TripOccurrenceEntity, isArray: true })
  async findOccurrences(@Param('id', ParseUUIDPipe) id: string): Promise<TripOccurrenceEntity[]> {
    const tenantId = this.tenantContext.requireTenantId();
    await this.driverTripsService.getOne(tenantId, this.driverContext.requireDriverId(), id);
    return this.tripOccurrencesService.findAllForTrip(tenantId, id, {});
  }

  // ==========================================================================
  // PARADAS/ENTREGAS PLANEJADAS (Fase 88; escrita de status Fase 106) --
  // reaproveita o MESMO TripDeliveryStopsService do admin (nenhuma
  // consulta/regra paralela). Adicionar/editar/remover/reordenar continua
  // exclusivo do TripsController administrativo (define O QUE sera
  // entregue); so a TRANSICAO DE STATUS (PENDING/IN_PROGRESS/COMPLETED/
  // CANCELLED/FAILED) passou a ser possivel tambem pelo motorista em campo,
  // via updateStatus() -- MESMO metodo, MESMAS transicoes/validacoes
  // (ALLOWED_STATUS_TRANSITIONS, reason obrigatorio em FAILED) ja aplicadas
  // ao admin, nunca uma segunda regra de negocio.
  // ==========================================================================
  @Get('trips/:id/delivery-stops')
  @ApiOperation({ summary: 'Lista as paradas/entregas planejadas desta viagem, em ordem de sequencia.' })
  @ApiOkResponse({ type: TripDeliveryStopEntity, isArray: true })
  async findDeliveryStops(@Param('id', ParseUUIDPipe) id: string): Promise<TripDeliveryStopEntity[]> {
    const tenantId = this.tenantContext.requireTenantId();
    await this.driverTripsService.getOne(tenantId, this.driverContext.requireDriverId(), id);
    return this.tripDeliveryStopsService.findAllForTrip(tenantId, id);
  }

  // Fase 106 -- idempotente por ESTADO (mesmo principio de start/pause/
  // resume/complete): reenviar a mesma transicao apos reconexao (fila
  // offline do app) e um no-op no service (before.status === dto.status),
  // nunca duplica nem lanca erro. Ownership validada da MESMA forma que
  // todo endpoint deste controller (getOne confere tenant + motorista dono
  // da viagem antes de qualquer escrita).
  @Patch('trips/:id/delivery-stops/:stopId/status')
  @ApiOperation({
    summary:
      'Atualiza o status de uma parada/entrega planejada desta viagem (PENDING -> IN_PROGRESS -> ' +
      'COMPLETED/FAILED/CANCELLED). Mesma regra de transicao do painel administrativo.',
  })
  @ApiOkResponse({ type: TripDeliveryStopEntity })
  async updateDeliveryStopStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stopId', ParseUUIDPipe) stopId: string,
    @Body() dto: UpdateTripDeliveryStopStatusDto,
  ): Promise<TripDeliveryStopEntity> {
    const tenantId = this.tenantContext.requireTenantId();
    await this.driverTripsService.getOne(tenantId, this.driverContext.requireDriverId(), id);
    return this.tripDeliveryStopsService.updateStatus(
      tenantId,
      id,
      stopId,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  // Fase 91 -- previsao de chegada (ETA), somente leitura, MESMO
  // TripEtaService do admin (nenhum motor de calculo paralelo). Sem tela
  // nova nesta fase -- so a leitura fica pronta para o app consumir.
  @Get('trips/:id/delivery-stops/eta')
  @ApiOperation({
    summary:
      'Previsao de chegada (ETA) do destino final e de cada parada/entrega planejada desta viagem.',
  })
  @ApiOkResponse({ type: TripEtaResultEntity })
  async getEta(@Param('id', ParseUUIDPipe) id: string): Promise<TripEtaResultEntity> {
    const tenantId = this.tenantContext.requireTenantId();
    await this.driverTripsService.getOne(tenantId, this.driverContext.requireDriverId(), id);
    return this.tripEtaService.compute(tenantId, id);
  }

  // ==========================================================================
  // JORNADA (Fase 67) -- ativa DriverShift/ShiftBreak (orfaos ate esta
  // fase). Idempotencia por ESTADO (nunca deviceEventId, ver comentario em
  // DriverShiftsService) -- reenviar start/end/pausa/retorno apos
  // reconexao nunca duplica.
  // ==========================================================================

  @Get('shifts/active')
  @ApiOperation({ summary: 'Jornada em aberto deste motorista, se houver.' })
  @ApiOkResponse({ type: DriverShiftEntity })
  getActiveShift(): Promise<DriverShiftEntity | null> {
    return this.driverShiftsService.getActive(this.tenantContext.requireTenantId(), this.driverContext.requireDriverId());
  }

  @Post('shifts/start')
  @ApiOperation({ summary: 'Inicia a jornada (idempotente se ja houver uma em aberto).' })
  @ApiOkResponse({ type: DriverShiftEntity })
  startShift(@Body() dto: StartDriverShiftDto): Promise<DriverShiftEntity> {
    return this.driverShiftsService.start(
      this.tenantContext.requireTenantId(),
      this.driverContext.requireDriverId(),
      dto ?? {},
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post('shifts/:id/end')
  @ApiOperation({ summary: 'Encerra a jornada (idempotente). Fecha automaticamente uma pausa em aberto, se houver.' })
  @ApiOkResponse({ type: DriverShiftEntity })
  endShift(@Param('id', ParseUUIDPipe) id: string): Promise<DriverShiftEntity> {
    return this.driverShiftsService.end(
      this.tenantContext.requireTenantId(),
      this.driverContext.requireDriverId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post('shifts/:id/cancel')
  @ApiOperation({ summary: 'Cancela uma jornada aberta por engano. Idempotente.' })
  @ApiOkResponse({ type: DriverShiftEntity })
  cancelShift(@Param('id', ParseUUIDPipe) id: string): Promise<DriverShiftEntity> {
    return this.driverShiftsService.cancel(
      this.tenantContext.requireTenantId(),
      this.driverContext.requireDriverId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post('shifts/:id/breaks')
  @ApiOperation({ summary: 'Inicia uma pausa na jornada (idempotente se ja houver uma em aberto).' })
  @ApiOkResponse({ type: DriverShiftEntity })
  startBreak(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StartShiftBreakDto,
  ): Promise<DriverShiftEntity> {
    return this.driverShiftsService.startBreak(
      this.tenantContext.requireTenantId(),
      this.driverContext.requireDriverId(),
      id,
      dto ?? {},
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post('shifts/:id/breaks/end')
  @ApiOperation({ summary: 'Encerra a pausa em aberto da jornada (idempotente).' })
  @ApiOkResponse({ type: DriverShiftEntity })
  endBreak(@Param('id', ParseUUIDPipe) id: string): Promise<DriverShiftEntity> {
    return this.driverShiftsService.endBreak(
      this.tenantContext.requireTenantId(),
      this.driverContext.requireDriverId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
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

  // ==========================================================================
  // CHECKLIST (Fase 38) -- ChecklistsService vive em modulo proprio
  // (ChecklistsModule), importado aqui exatamente como FuelSuppliesModule:
  // nenhum controller/guard duplicado, so mais metodos nesta classe (mesmo
  // padrao ja usado para fuel-supplies/axle-events acima).
  // ==========================================================================

  @Get('checklists/available')
  @ApiOperation({
    summary:
      'Templates de checklist PUBLISHED disponiveis para este motorista iniciar. ' +
      'Com tripId, filtra pelo tipo de veiculo/carreta da composicao daquela viagem.',
  })
  @ApiOkResponse({ type: ChecklistTemplateEntity, isArray: true })
  findAvailableChecklists(@Query() query: FindAvailableChecklistsQueryDto): Promise<ChecklistTemplateEntity[]> {
    return this.checklistTemplatesService.findPublishedForDriver(this.tenantContext.requireTenantId(), query.tripId);
  }

  @Post('checklists')
  @ApiOperation({ summary: 'Inicia uma execucao de checklist a partir de um template PUBLISHED. Idempotente por deviceEventId.' })
  @ApiOkResponse({ type: ChecklistExecutionEntity })
  createChecklist(@Body() dto: CreateChecklistExecutionDto): Promise<ChecklistExecutionEntity> {
    return this.checklistExecutionsService.create(
      this.tenantContext.requireTenantId(),
      this.driverContext.requireDriverId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Get('checklists/:id')
  @ApiOperation({ summary: 'Detalhe de uma execucao de checklist deste motorista (com respostas e evidencias).' })
  @ApiOkResponse({ type: ChecklistExecutionEntity })
  findOneChecklist(@Param('id', ParseUUIDPipe) id: string): Promise<ChecklistExecutionEntity> {
    return this.checklistExecutionsService.findOneForDriver(
      this.tenantContext.requireTenantId(),
      this.driverContext.requireDriverId(),
      id,
    );
  }

  @Post('checklists/:id/answers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Envia um lote de respostas (upsert por item -- reenvio apos reconexao e idempotente).' })
  @ApiOkResponse({ type: ChecklistAnswersSubmitResultEntity })
  submitChecklistAnswers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitChecklistAnswersDto,
  ): Promise<ChecklistAnswersSubmitResultEntity> {
    return this.checklistExecutionsService.submitAnswers(
      this.tenantContext.requireTenantId(),
      this.driverContext.requireDriverId(),
      id,
      dto,
    );
  }

  @Post('checklists/:id/evidence')
  @Throttle(UPLOAD_THROTTLE)
  @UseInterceptors(FileInterceptor('file'))
  @UseFilters(MulterExceptionFilter)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'deviceEventId', 'type'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Foto (camera) ou assinatura exportada como PNG.' },
        deviceEventId: { type: 'string' },
        type: { type: 'string' },
        answerId: { type: 'string', format: 'uuid' },
        description: { type: 'string' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
      },
    },
  })
  @ApiOperation({ summary: 'Envia uma evidencia (foto/assinatura) para a execucao. Idempotente por deviceEventId.' })
  @ApiOkResponse({ type: ChecklistEvidenceEntity })
  addChecklistEvidence(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UploadChecklistEvidenceDto,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ChecklistEvidenceEntity> {
    return this.checklistExecutionsService.addEvidence(
      this.tenantContext.requireTenantId(),
      this.driverContext.requireDriverId(),
      id,
      dto,
      file,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post('checklists/:id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Conclui o checklist (idempotente -- reenviar numa execucao ja concluida devolve o mesmo estado).' })
  @ApiOkResponse({ type: ChecklistExecutionEntity })
  completeChecklist(@Param('id', ParseUUIDPipe) id: string): Promise<ChecklistExecutionEntity> {
    return this.checklistExecutionsService.complete(
      this.tenantContext.requireTenantId(),
      this.driverContext.requireDriverId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  // ==========================================================================
  // COMPROVANTE DE ENTREGA (Fase 56) -- FiscalDocumentsService vive em modulo
  // proprio (FiscalModule), importado aqui exatamente como
  // ChecklistsModule/FuelSuppliesModule acima: nenhum service/controller
  // paralelo. vehicleId/driverId/customerId nunca vem do corpo da requisicao
  // -- sempre derivados da viagem (ja validada contra ESTE motorista logo
  // abaixo) e do motorista autenticado.
  // ==========================================================================

  @Post('trips/:id/delivery-proof')
  @Throttle(UPLOAD_THROTTLE)
  @UseInterceptors(FileInterceptor('file', buildDriverDeliveryProofMulterOptions()))
  @UseFilters(MulterExceptionFilter)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'deviceEventId'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Foto (camera/galeria) ou PDF do comprovante de entrega.' },
        deviceEventId: { type: 'string' },
        observation: { type: 'string' },
        capturedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiOperation({
    summary:
      'Registra o comprovante de entrega (DELIVERY_PROOF) desta viagem. Idempotente por deviceEventId (fila offline) -- ' +
      'reenviar apos reconexao nunca cria um segundo comprovante.',
  })
  @ApiOkResponse({ type: FiscalDocumentEntity })
  async submitDeliveryProof(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitDeliveryProofDto,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<FiscalDocumentEntity> {
    if (!file) {
      throw new BadRequestException('Arquivo obrigatorio. Extensoes aceitas: .pdf, .jpg, .jpeg, .png.');
    }
    const tenantId = this.tenantContext.requireTenantId();
    const driverId = this.driverContext.requireDriverId();
    await this.driverTripsService.getOne(tenantId, driverId, id);
    return this.fiscalDocumentsService.submitDeliveryProofFromDriverApp(
      tenantId,
      driverId,
      id,
      dto,
      file,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  // ==========================================================================
  // DOCUMENTOS/EVIDENCIAS DE OCORRENCIA (Fase 102) -- mesmo mecanismo
  // generico de FiscalDocument ja usado acima para comprovante de entrega,
  // nenhum storage/servico paralelo. occurrenceId precisa pertencer a ESTA
  // viagem (validado pelo service); vehicleId sempre derivado da viagem,
  // driverId e o motorista autenticado.
  // ==========================================================================

  @Post('trips/:id/occurrences/:occurrenceId/evidence')
  @Throttle(UPLOAD_THROTTLE)
  @UseInterceptors(FileInterceptor('file', buildDriverDeliveryProofMulterOptions()))
  @UseFilters(MulterExceptionFilter)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'deviceEventId'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Foto (camera/galeria) ou PDF da evidencia.' },
        deviceEventId: { type: 'string' },
        observation: { type: 'string' },
        capturedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiOperation({
    summary:
      'Registra um documento/evidencia (OCCURRENCE_EVIDENCE) para uma ocorrencia desta viagem. Idempotente por ' +
      'deviceEventId (fila offline) -- reenviar apos reconexao nunca cria uma segunda evidencia.',
  })
  @ApiOkResponse({ type: FiscalDocumentEntity })
  async submitOccurrenceEvidence(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('occurrenceId', ParseUUIDPipe) occurrenceId: string,
    @Body() dto: SubmitOccurrenceEvidenceDto,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<FiscalDocumentEntity> {
    if (!file) {
      throw new BadRequestException('Arquivo obrigatorio. Extensoes aceitas: .pdf, .jpg, .jpeg, .png.');
    }
    const tenantId = this.tenantContext.requireTenantId();
    const driverId = this.driverContext.requireDriverId();
    await this.driverTripsService.getOne(tenantId, driverId, id);
    return this.fiscalDocumentsService.submitOccurrenceEvidenceFromDriverApp(
      tenantId,
      driverId,
      id,
      occurrenceId,
      dto,
      file,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  // ==========================================================================
  // NOTIFICACOES (Fase 69, estendida na Fase 70) -- reaproveita o MESMO
  // NotificationsService do admin-web (nenhum service/mecanismo paralelo).
  // Nenhum dos 10 tipos administrativos da Fase 69 e destinado a DRIVER
  // (ver docs/notifications.md); a partir da Fase 70, DELIVERY_PROOF_PENDING
  // e DELIVERY_PROOF_PROBLEM SAO enviados ao motorista responsavel pela
  // viagem (destinatario direto, nunca "todo usuario com role DRIVER") --
  // o filtro por recipientId=userId no proprio service garante que o
  // motorista so ve as suas.
  // ==========================================================================

  @Get('notifications')
  @ApiOperation({ summary: 'Lista as notificações do motorista autenticado.' })
  @ApiOkResponse({ type: PaginatedNotificationsEntity })
  findNotifications(@Query() query: FindNotificationsQueryDto): Promise<PaginatedNotificationsEntity> {
    return this.notificationsService.findAllForUser(
      this.tenantContext.requireTenantId(),
      this.tenantContext.requireUserId(),
      query,
    );
  }

  @Get('notifications/unread-count')
  @ApiOperation({ summary: 'Contagem de notificações não lidas do motorista autenticado.' })
  @ApiOkResponse({ type: UnreadNotificationCountEntity })
  getUnreadNotificationCount(): Promise<UnreadNotificationCountEntity> {
    return this.notificationsService.getUnreadCount(this.tenantContext.requireTenantId(), this.tenantContext.requireUserId());
  }

  @Patch('notifications/:id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marca uma notificação do motorista como lida. Idempotente.' })
  @ApiOkResponse({ type: NotificationEntity })
  markNotificationRead(@Param('id', ParseUUIDPipe) id: string): Promise<NotificationEntity> {
    const tenantId = this.tenantContext.requireTenantId();
    const userId = this.tenantContext.requireUserId();
    return this.notificationsService.markRead(tenantId, userId, id, { userId }, this.tenantContext.requestMetadata);
  }
}
