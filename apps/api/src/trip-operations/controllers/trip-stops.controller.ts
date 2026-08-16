import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantModule } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import { TRIP_STOP_READ_ROLES, TRIP_STOP_WRITE_ROLES } from '../constants/trip-stop-roles.constants';
import { CloseTripStopDto } from '../dto/close-trip-stop.dto';
import { CreateAdminTripStopDto } from '../dto/create-admin-trip-stop.dto';
import { FindTripStopsQueryDto } from '../dto/find-trip-stops-query.dto';
import { PaginatedTripStopsEntity } from '../entities/paginated-trip-stops.entity';
import { TripStopEntity } from '../entities/trip-stop.entity';
import { TripStopsService } from '../services/trip-stops.service';

// Fase 43 -- gestao administrativa (admin-web) de paradas operacionais,
// cross-frota: complementa POST/PATCH driver/trips/:id/stops/* (Fase 25,
// exclusivo do app do motorista, sempre vinculado a uma viagem) e GET
// trips/:id/stops (leitura por viagem). Aqui: listagem paginada com
// filtros, criacao SEM exigir viagem ativa (patio/garagem/quebra), leitura
// individual e cancelamento -- toda a logica de negocio (idempotencia,
// calculo de duracao, isolamento por tenant) ja vive em TripStopsService,
// este controller so expoe as rotas HTTP e aplica RBAC.
@ApiTags('trip-stops')
@ApiBearerAuth()
@Controller('trip-stops')
@RequireModule(TenantModule.STOPS)
export class TripStopsController {
  constructor(
    private readonly tripStopsService: TripStopsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...TRIP_STOP_READ_ROLES)
  @ApiOperation({
    summary: 'Lista paginada de paradas operacionais cross-frota, com filtros por periodo/veiculo/motorista/viagem/tipo/status.',
  })
  @ApiOkResponse({ type: PaginatedTripStopsEntity })
  findAll(@Query() query: FindTripStopsQueryDto): Promise<PaginatedTripStopsEntity> {
    return this.tripStopsService.findAllPaginated(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...TRIP_STOP_READ_ROLES)
  @ApiOperation({ summary: 'Detalhe de uma parada operacional.' })
  @ApiOkResponse({ type: TripStopEntity })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<TripStopEntity> {
    return this.tripStopsService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Post()
  @Roles(...TRIP_STOP_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Cria uma parada operacional administrativa (patio/garagem/quebra), sem exigir viagem ativa. Fonte sempre ADMIN.',
  })
  @ApiOkResponse({ type: TripStopEntity })
  create(@Body() dto: CreateAdminTripStopDto): Promise<TripStopEntity> {
    const tenantId = this.tenantContext.requireTenantId();
    return this.tripStopsService.createAdministrative(
      tenantId,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id/close')
  @Roles(...TRIP_STOP_WRITE_ROLES)
  @ApiOperation({ summary: 'Fecha uma parada (administrativa ou aberta pelo driver-app). Duracao sempre calculada pelo backend.' })
  @ApiOkResponse({ type: TripStopEntity })
  close(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CloseTripStopDto): Promise<TripStopEntity> {
    const tenantId = this.tenantContext.requireTenantId();
    return this.tripStopsService.closeById(
      tenantId,
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(...TRIP_STOP_WRITE_ROLES)
  @ApiOperation({ summary: 'Cancela um registro indevido. Idempotente; uma parada cancelada nunca entra em indicadores/rankings/alertas.' })
  @ApiOkResponse({ type: TripStopEntity })
  cancel(@Param('id', ParseUUIDPipe) id: string): Promise<TripStopEntity> {
    const tenantId = this.tenantContext.requireTenantId();
    return this.tripStopsService.cancel(
      tenantId,
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
