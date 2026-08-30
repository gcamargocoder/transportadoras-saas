import { Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantModule } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TRIP_READ_ROLES, TRIP_WRITE_ROLES } from '../../trips/constants/trip-roles.constants';
import { TenantContext } from '../../tenants/context/tenant-context';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import { FindDeliveryOccurrencesQueryDto } from '../dto/find-delivery-occurrences-query.dto';
import { DeliveryOccurrencesDashboardEntity } from '../entities/delivery-occurrences-dashboard.entity';
import { PaginatedDeliveryOccurrencesEntity } from '../entities/paginated-delivery-occurrences.entity';
import { TripOccurrenceEntity } from '../entities/trip-occurrence.entity';
import { TripOccurrencesService } from '../services/trip-occurrences.service';

// Fase 101 -- visao operacional CROSS-TRIP das ocorrencias de ENTREGA,
// distinta de GET /trips/:id/occurrences (Fase 67, escopada a UMA viagem, e
// que continua cobrindo ocorrencias gerais nao vinculadas a uma parada).
// Reaproveita integralmente TripOccurrencesService -- nenhuma segunda
// fonte/logica. Mesmo padrao de TripStopsController (Fase 43) e
// DeliveryStopsController (Fase 99).
@ApiTags('delivery-occurrences')
@ApiBearerAuth()
@RequireModule(TenantModule.TRIPS)
@Controller('delivery-occurrences')
export class DeliveryOccurrencesController {
  constructor(
    private readonly tripOccurrencesService: TripOccurrencesService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({
    summary:
      'Lista ocorrencias de entrega (vinculadas a uma TripDeliveryStop) de TODAS as viagens do tenant, ' +
      'com busca/filtros/paginacao server-side.',
  })
  @ApiOkResponse({ type: PaginatedDeliveryOccurrencesEntity })
  findAll(@Query() query: FindDeliveryOccurrencesQueryDto): Promise<PaginatedDeliveryOccurrencesEntity> {
    return this.tripOccurrencesService.findAllDeliveryOccurrences(this.tenantContext.requireTenantId(), query);
  }

  @Get('dashboard')
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({ summary: 'Indicadores das ocorrencias de entrega: contagem por status, severidade e tipo.' })
  @ApiOkResponse({ type: DeliveryOccurrencesDashboardEntity })
  getDashboard(@Query() query: FindDeliveryOccurrencesQueryDto): Promise<DeliveryOccurrencesDashboardEntity> {
    return this.tripOccurrencesService.getDeliveryOccurrencesDashboard(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({ summary: 'Consulta uma ocorrencia de entrega.' })
  @ApiOkResponse({ type: TripOccurrenceEntity })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<TripOccurrenceEntity> {
    return this.tripOccurrencesService.findOneOccurrence(this.tenantContext.requireTenantId(), id);
  }

  @Patch(':id/start')
  @Roles(...TRIP_WRITE_ROLES)
  @ApiOperation({ summary: 'Marca a ocorrencia como em andamento. Idempotente.' })
  @ApiOkResponse({ type: TripOccurrenceEntity })
  markInProgress(@Param('id', ParseUUIDPipe) id: string): Promise<TripOccurrenceEntity> {
    return this.tripOccurrencesService.markInProgressByOccurrenceId(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id/resolve')
  @Roles(...TRIP_WRITE_ROLES)
  @ApiOperation({ summary: 'Resolve a ocorrencia. Idempotente.' })
  @ApiOkResponse({ type: TripOccurrenceEntity })
  resolve(@Param('id', ParseUUIDPipe) id: string): Promise<TripOccurrenceEntity> {
    return this.tripOccurrencesService.resolveByOccurrenceId(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id/cancel')
  @Roles(...TRIP_WRITE_ROLES)
  @ApiOperation({ summary: 'Cancela um registro de ocorrencia indevido. Idempotente.' })
  @ApiOkResponse({ type: TripOccurrenceEntity })
  cancel(@Param('id', ParseUUIDPipe) id: string): Promise<TripOccurrenceEntity> {
    return this.tripOccurrencesService.cancelByOccurrenceId(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
