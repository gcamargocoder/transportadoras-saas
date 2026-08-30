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

// Fase 115 -- Gestao de Excecoes Operacionais. Auditoria previa confirmou
// que TripOccurrence (Fase 67) JA E a entidade de excecao operacional do
// sistema (tipo/gravidade/status/resolucao), e que GET /delivery-occurrences
// (Fase 101) ja provava exatamente este padrao de visao CROSS-TRIP -- so
// restrita as ocorrencias vinculadas a uma parada de entrega. A lacuna real
// (unica encontrada nesta fase): ocorrencias GERAIS da viagem (quebra,
// acidente, transito etc., sem tripDeliveryStopId) nunca tiveram uma visao
// cross-trip -- so apareciam viagem por viagem (GET /trips/:id/occurrences).
// Esta rota fecha essa lacuna reaproveitando INTEGRALMENTE
// TripOccurrencesService/entidades/mapper/RBAC ja existentes -- nenhuma
// tabela, service ou regra de negocio nova; nenhuma segunda Torre de
// Controle (o escopo aqui e um unico tipo de entidade, nao um agregado
// multi-fonte por viagem, que continua sendo o papel de
// GET /trips/operations/active). "Tratar"/"reconhecer" uma excecao reusa os
// MESMOS 3 endpoints de transicao de status ja usados por
// DeliveryOccurrencesController -- nenhum "acknowledge" novo foi inventado.
@ApiTags('trip-occurrences')
@ApiBearerAuth()
@RequireModule(TenantModule.TRIPS)
@Controller('trip-occurrences')
export class TripOccurrencesController {
  constructor(
    private readonly tripOccurrencesService: TripOccurrencesService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({
    summary:
      'Lista TODAS as ocorrencias operacionais (gerais e de entrega) de TODAS as viagens do tenant, ' +
      'com busca/filtros/paginacao server-side. Reaproveita a MESMA TripOccurrence de sempre -- nenhuma ' +
      'segunda fonte. Ver GET /delivery-occurrences para o subconjunto vinculado a paradas de entrega.',
  })
  @ApiOkResponse({ type: PaginatedDeliveryOccurrencesEntity })
  findAll(@Query() query: FindDeliveryOccurrencesQueryDto): Promise<PaginatedDeliveryOccurrencesEntity> {
    return this.tripOccurrencesService.findAllOccurrences(this.tenantContext.requireTenantId(), query);
  }

  @Get('dashboard')
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({ summary: 'Indicadores de TODAS as ocorrencias operacionais: contagem por status, severidade e tipo.' })
  @ApiOkResponse({ type: DeliveryOccurrencesDashboardEntity })
  getDashboard(@Query() query: FindDeliveryOccurrencesQueryDto): Promise<DeliveryOccurrencesDashboardEntity> {
    return this.tripOccurrencesService.getOccurrencesDashboard(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({ summary: 'Consulta uma ocorrencia operacional.' })
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
