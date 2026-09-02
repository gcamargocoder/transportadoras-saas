import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantModule } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import {
  VEHICLE_IDLE_PERIOD_READ_ROLES,
  VEHICLE_IDLE_PERIOD_WRITE_ROLES,
} from '../constants/vehicle-idle-period-roles.constants';
import { CreateVehicleIdlePeriodDto } from '../dto/create-vehicle-idle-period.dto';
import { FindVehicleIdlePeriodsQueryDto } from '../dto/find-vehicle-idle-periods-query.dto';
import { UpdateVehicleIdlePeriodDto } from '../dto/update-vehicle-idle-period.dto';
import { PaginatedVehicleIdlePeriodsEntity, VehicleIdlePeriodEntity } from '../entities/vehicle-idle-period.entity';
import { VehicleIdlePeriodsService } from '../services/vehicle-idle-periods.service';

// Fase B -- CRUD administrativo dos periodos ociosos PERSISTIDOS (veiculo
// parado entre operacoes). Rota sob /fleet-operations (alimenta a mesma
// Torre de Controle / auditoria de downtime da Fase A). A abertura/
// fechamento AUTOMATICO (source=AUTO) acontece na maquina de estados da
// viagem (TripsService.updateStatus), nunca aqui -- este controller so
// expoe leitura, criacao manual (retroativa/sem viagem) e correcao
// (motivo/notes/fechamento manual). Toda a regra de negocio vive em
// VehicleIdlePeriodsService.
@ApiTags('fleet-operations')
@ApiBearerAuth()
@Controller('fleet-operations/idle-periods')
@RequireModule(TenantModule.DASHBOARDS)
export class VehicleIdlePeriodsController {
  constructor(
    private readonly service: VehicleIdlePeriodsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...VEHICLE_IDLE_PERIOD_READ_ROLES)
  @ApiOperation({
    summary:
      'Fase B -- lista paginada de periodos ociosos PERSISTIDOS (veiculo SEM VIAGEM entre a chegada de ' +
      'uma viagem e a partida da seguinte). Filtros: vehicleId, from/to (sobreposicao), reason, open (so ' +
      'periodos ABERTOS = "frota parada agora"), page/pageSize. Consulta por veiculo = filtro vehicleId ' +
      '(mesmo padrao de GET /fleet-operations/idle-time e GET /trip-stops).',
  })
  @ApiOkResponse({ type: PaginatedVehicleIdlePeriodsEntity })
  findAll(@Query() query: FindVehicleIdlePeriodsQueryDto): Promise<PaginatedVehicleIdlePeriodsEntity> {
    return this.service.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...VEHICLE_IDLE_PERIOD_READ_ROLES)
  @ApiOperation({ summary: 'Fase B -- detalhe de um periodo ocioso persistido.' })
  @ApiOkResponse({ type: VehicleIdlePeriodEntity })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<VehicleIdlePeriodEntity> {
    return this.service.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Post()
  @Roles(...VEHICLE_IDLE_PERIOD_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Fase B -- cria um periodo ocioso ADMINISTRATIVO (retroativo / sem viagem de referencia). ' +
      'source sempre MANUAL_ADMIN. Duracao calculada pelo backend quando endedAt e informado. ' +
      'Recusa criar um 2o periodo ABERTO para o mesmo veiculo (409).',
  })
  @ApiOkResponse({ type: VehicleIdlePeriodEntity })
  create(@Body() dto: CreateVehicleIdlePeriodDto): Promise<VehicleIdlePeriodEntity> {
    return this.service.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id')
  @Roles(...VEHICLE_IDLE_PERIOD_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Fase B -- corrige o motivo (secao 6), adiciona notes ou fecha/ajusta o periodo informando endedAt ' +
      '(duracao SEMPRE recalculada pelo backend, nunca negativa).',
  })
  @ApiOkResponse({ type: VehicleIdlePeriodEntity })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVehicleIdlePeriodDto): Promise<VehicleIdlePeriodEntity> {
    return this.service.update(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
