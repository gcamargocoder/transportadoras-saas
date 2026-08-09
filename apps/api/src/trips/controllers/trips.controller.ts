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
import { PaginatedAuditLogEntity } from '../../audit/entities/paginated-audit-log.entity';
import { Roles } from '../../auth/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { TenantContext } from '../../tenants/context/tenant-context';
import { FindTripExpensesQueryDto } from '../../trip-expenses/dto/find-trip-expenses-query.dto';
import { PaginatedTripExpensesEntity } from '../../trip-expenses/entities/paginated-trip-expenses.entity';
import { TripFinancialSummaryEntity } from '../../trip-expenses/entities/trip-financial-summary.entity';
import { TripExpensesService } from '../../trip-expenses/services/trip-expenses.service';
import {
  TRIP_SETTLEMENT_CLOSE_ROLES,
  TRIP_SETTLEMENT_READ_ROLES,
} from '../../trip-settlements/constants/trip-settlement-roles.constants';
import { CloseTripSettlementDto } from '../../trip-settlements/dto/close-trip-settlement.dto';
import { TripFinancialDashboardEntity } from '../../trip-settlements/entities/trip-financial-dashboard.entity';
import { TripSettlementEntity } from '../../trip-settlements/entities/trip-settlement.entity';
import { TripSettlementsService } from '../../trip-settlements/services/trip-settlements.service';
import { TollReconciliationService } from '../../toll-routes/services/toll-reconciliation.service';
import { TollReconciliationEntity } from '../../toll-routes/entities/toll-reconciliation.entity';
import { AxleEventEntity } from '../../trip-operations/entities/axle-event.entity';
import { TrackingPointEntity } from '../../trip-operations/entities/tracking-point.entity';
import { TripStopEntity } from '../../trip-operations/entities/trip-stop.entity';
import { AxleEventsService } from '../../trip-operations/services/axle-events.service';
import { TrackingPointsService } from '../../trip-operations/services/tracking-points.service';
import { TripStopsService } from '../../trip-operations/services/trip-stops.service';
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
import { TripSummaryEntity } from '../entities/trip-summary.entity';
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
    private readonly tripExpensesService: TripExpensesService,
    private readonly tripSettlementsService: TripSettlementsService,
    private readonly tollReconciliationService: TollReconciliationService,
    private readonly tripStopsService: TripStopsService,
    private readonly axleEventsService: AxleEventsService,
    private readonly trackingPointsService: TrackingPointsService,
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
      'Planeja uma nova viagem (motorista e composicao/veiculo obrigatorios). Cria ' +
      'automaticamente a RouteVersion inicial e o TripMetrics (previstos).',
  })
  @ApiCreatedResponse({ type: TripEntity })
  @ApiNotFoundResponse({
    description: 'Cliente, motorista, local ou composicao nao encontrados nesta empresa.',
  })
  @ApiConflictResponse({
    description: 'Motorista ou veiculo/composicao indisponiveis no periodo informado.',
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
    summary:
      'Transiciona o status da viagem (PLANNED -> WAITING_DRIVER -> WAITING_DEPARTURE -> ' +
      'IN_PROGRESS -> PAUSED -> COMPLETED). Ao concluir, registra automaticamente data final, ' +
      'duracao e (se finalOdometerKm informado) atualiza a quilometragem do veiculo.',
  })
  @ApiOkResponse({ type: TripEntity })
  @ApiNotFoundResponse({ description: 'Viagem nao encontrada nesta empresa.' })
  @ApiConflictResponse({
    description:
      'Transicao de status nao permitida, ou nao e possivel iniciar (motorista/veiculo ' +
      'inativo, veiculo em manutencao, motorista/veiculo ja em outra viagem ativa).',
  })
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

  @Get(':id/timeline')
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({
    summary:
      'Timeline de eventos da viagem (criada, motorista/veiculo vinculado, inicio, pausa, ' +
      'retorno, chegada, conclusao, cancelamento) -- cada evento traz quem, quando, IP e User-Agent.',
  })
  @ApiOkResponse({ type: PaginatedAuditLogEntity })
  @ApiNotFoundResponse({ description: 'Viagem nao encontrada nesta empresa.' })
  findTimeline(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedAuditLogEntity> {
    return this.tripsService.getTimeline(this.tenantContext.requireTenantId(), id, query);
  }

  @Get(':id/summary')
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({
    summary:
      'Resumo consolidado da viagem: motorista, veiculo, origem, destino, tempo, status, ' +
      'distancia, pedagios e custos.',
  })
  @ApiOkResponse({ type: TripSummaryEntity })
  @ApiNotFoundResponse({ description: 'Viagem nao encontrada nesta empresa.' })
  findSummary(@Param('id', ParseUUIDPipe) id: string): Promise<TripSummaryEntity> {
    return this.tripsService.getSummary(this.tenantContext.requireTenantId(), id);
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

  // ==========================================================================
  // DESPESAS (Fase 16) -- sub-recurso de Trip; CRUD completo fica em
  // /trip-expenses (ver TripExpensesController).
  // ==========================================================================
  @Get(':id/expenses')
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({
    summary:
      'Lista as despesas registradas na viagem (paginado, mesmos filtros de /trip-expenses).',
  })
  @ApiOkResponse({ type: PaginatedTripExpensesEntity })
  @ApiNotFoundResponse({ description: 'Viagem nao encontrada nesta empresa.' })
  findExpenses(
    @Param('id', ParseUUIDPipe) tripId: string,
    @Query() query: FindTripExpensesQueryDto,
  ): Promise<PaginatedTripExpensesEntity> {
    return this.tripExpensesService.findAllForTrip(
      this.tenantContext.requireTenantId(),
      tripId,
      query,
    );
  }

  @Get(':id/financial-summary')
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({
    summary:
      'Resumo financeiro da viagem: total, por categoria (combustivel/alimentacao/hospedagem/' +
      'manutencao/pedagio extra/outros), quantidade, media e maior despesa. Considera apenas ' +
      'despesas PENDING ou APPROVED.',
  })
  @ApiOkResponse({ type: TripFinancialSummaryEntity })
  @ApiNotFoundResponse({ description: 'Viagem nao encontrada nesta empresa.' })
  findFinancialSummary(
    @Param('id', ParseUUIDPipe) tripId: string,
  ): Promise<TripFinancialSummaryEntity> {
    return this.tripExpensesService.getFinancialSummary(
      this.tenantContext.requireTenantId(),
      tripId,
    );
  }

  // ==========================================================================
  // FECHAMENTO FINANCEIRO (Fase 17) -- receitas/adiantamentos ficam em
  // /trip-revenues e /trip-advances; aqui apenas o fechamento em si e o
  // dashboard consolidado, sub-recursos de Trip.
  // ==========================================================================
  @Get(':id/settlement')
  @Roles(...TRIP_SETTLEMENT_READ_ROLES)
  @ApiOperation({
    summary:
      'Consulta o fechamento financeiro da viagem. Se nunca foi fechada, retorna um preview ' +
      'calculado ao vivo (status OPEN); se ja foi fechada, retorna o snapshot congelado no ' +
      'ultimo fechamento.',
  })
  @ApiOkResponse({ type: TripSettlementEntity })
  @ApiNotFoundResponse({ description: 'Viagem nao encontrada nesta empresa.' })
  findSettlement(@Param('id', ParseUUIDPipe) tripId: string): Promise<TripSettlementEntity> {
    return this.tripSettlementsService.getSettlement(this.tenantContext.requireTenantId(), tripId);
  }

  @Post(':id/settlement/close')
  @Roles(...TRIP_SETTLEMENT_CLOSE_ROLES)
  @ApiOperation({
    summary:
      'Fecha a viagem financeiramente (perfil de gestao): calcula e congela Total Receitas, ' +
      'Total Despesas (APPROVED), Total Adiantamentos e Resultado liquido. Resultado negativo ' +
      'nunca bloqueia o fechamento. Bloqueado se ja estiver CLOSED (reabra antes).',
  })
  @ApiOkResponse({ type: TripSettlementEntity })
  @ApiNotFoundResponse({ description: 'Viagem nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'Fechamento ja esta CLOSED.' })
  closeSettlement(
    @Param('id', ParseUUIDPipe) tripId: string,
    @Body() dto: CloseTripSettlementDto,
  ): Promise<TripSettlementEntity> {
    return this.tripSettlementsService.close(
      this.tenantContext.requireTenantId(),
      tripId,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post(':id/settlement/reopen')
  @Roles(...TRIP_SETTLEMENT_CLOSE_ROLES)
  @ApiOperation({
    summary:
      'Reabre um fechamento CLOSED (perfil de gestao). Altera apenas o status para REOPENED -- ' +
      'nunca apaga o snapshot/historico do fechamento anterior.',
  })
  @ApiOkResponse({ type: TripSettlementEntity })
  @ApiNotFoundResponse({ description: 'Viagem nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'So e possivel reabrir um fechamento CLOSED.' })
  reopenSettlement(@Param('id', ParseUUIDPipe) tripId: string): Promise<TripSettlementEntity> {
    return this.tripSettlementsService.reopen(
      this.tenantContext.requireTenantId(),
      tripId,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Get(':id/financial-dashboard')
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({
    summary:
      'Dashboard financeiro consolidado da viagem: receitas, despesas (APPROVED), ' +
      'adiantamentos, lucro, margem, quantidade de lancamentos, maior despesa/receita e ' +
      'resultado liquido.',
  })
  @ApiOkResponse({ type: TripFinancialDashboardEntity })
  @ApiNotFoundResponse({ description: 'Viagem nao encontrada nesta empresa.' })
  findFinancialDashboard(
    @Param('id', ParseUUIDPipe) tripId: string,
  ): Promise<TripFinancialDashboardEntity> {
    return this.tripSettlementsService.getFinancialDashboard(
      this.tenantContext.requireTenantId(),
      tripId,
    );
  }

  // ==========================================================================
  // CONCILIACAO DE PEDAGIO (Fase 23) -- compara as pracas ESPERADAS pela rota
  // de pedagio vinculada com os pedagios efetivamente REGISTRADOS na viagem.
  // ==========================================================================
  @Get(':id/toll-reconciliation')
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({
    summary:
      'Concilia a rota de pedagio da viagem com os pedagios registrados: pracas esperadas x ' +
      'registradas, divergencias de valor, pracas nao registradas e pedagios nao previstos. ' +
      'Quando a viagem nao tem rota vinculada, retorna hasRoute=false.',
  })
  @ApiOkResponse({ type: TollReconciliationEntity })
  @ApiNotFoundResponse({ description: 'Viagem nao encontrada nesta empresa.' })
  findTollReconciliation(
    @Param('id', ParseUUIDPipe) tripId: string,
  ): Promise<TollReconciliationEntity> {
    return this.tollReconciliationService.getReconciliation(
      this.tenantContext.requireTenantId(),
      tripId,
    );
  }

  // Acao explicita de conciliacao automatica (Fase 24) -- "Conciliar agora".
  // Delega 100% para o mesmo TollReconciliationService.getReconciliation()
  // do GET acima (nenhuma logica nova/duplicada): a conciliacao ja e
  // calculada em tempo real a cada leitura, entao "rodar agora" e apenas
  // formalizar essa acao como um POST idempotente e sem efeito colateral no
  // banco (nao altera transacoes historicas). Gated por TRIP_WRITE_ROLES
  // (nao TRIP_READ_ROLES) para que o botao "Conciliar agora" so fique
  // disponivel para quem pode agir sobre a viagem -- leitura passiva
  // continua livre via GET acima.
  @Post(':id/toll-reconciliation/run')
  @Roles(...TRIP_WRITE_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Executa a conciliacao automatica de pedagio da viagem agora ("Conciliar agora"). ' +
      'Mesmo resultado do GET /trips/:id/toll-reconciliation -- formaliza a acao explicita, ' +
      'sem alterar nenhuma transacao historica.',
  })
  @ApiOkResponse({ type: TollReconciliationEntity })
  @ApiNotFoundResponse({ description: 'Viagem nao encontrada nesta empresa.' })
  runTollReconciliation(
    @Param('id', ParseUUIDPipe) tripId: string,
  ): Promise<TollReconciliationEntity> {
    return this.tollReconciliationService.getReconciliation(
      this.tenantContext.requireTenantId(),
      tripId,
    );
  }

  // ==========================================================================
  // OPERACAO DA VIAGEM (Fase 25) -- visibilidade administrativa somente
  // leitura sobre o que o app do motorista registrou (localizacao, paradas,
  // excecoes de eixo). Escrita fica exclusivamente em DriverTripsController.
  // ==========================================================================
  @Get(':id/locations')
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({
    summary:
      'Historico recente de posicoes GPS da viagem (mais recente primeiro -- o primeiro item ' +
      'e a ultima posicao conhecida). Sem mapa nesta fase.',
  })
  @ApiOkResponse({ type: TrackingPointEntity, isArray: true })
  @ApiNotFoundResponse({ description: 'Viagem nao encontrada nesta empresa.' })
  findLocations(@Param('id', ParseUUIDPipe) tripId: string): Promise<TrackingPointEntity[]> {
    return this.trackingPointsService.findRecent(this.tenantContext.requireTenantId(), tripId);
  }

  @Get(':id/stops')
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({ summary: 'Lista as paradas operacionais registradas pelo app do motorista nesta viagem.' })
  @ApiOkResponse({ type: TripStopEntity, isArray: true })
  @ApiNotFoundResponse({ description: 'Viagem nao encontrada nesta empresa.' })
  findStops(@Param('id', ParseUUIDPipe) tripId: string): Promise<TripStopEntity[]> {
    return this.tripStopsService.findAll(this.tenantContext.requireTenantId(), tripId);
  }

  @Get(':id/axle-events')
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({
    summary:
      'Lista as excecoes de eixo (praca, padrao x declarado, suspensos) registradas nesta viagem.',
  })
  @ApiOkResponse({ type: AxleEventEntity, isArray: true })
  @ApiNotFoundResponse({ description: 'Viagem nao encontrada nesta empresa.' })
  findAxleEvents(@Param('id', ParseUUIDPipe) tripId: string): Promise<AxleEventEntity[]> {
    return this.axleEventsService.findAll(this.tenantContext.requireTenantId(), tripId);
  }
}
