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
import { Throttle } from '@nestjs/throttler';
import { PaginatedAuditLogEntity } from '../../audit/entities/paginated-audit-log.entity';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CRITICAL_THROTTLE } from '../../common/constants/throttle.constants';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { FuelHistoryQueryDto } from '../../fuel-supplies/dto/fuel-history-query.dto';
import { VehicleFuelHistoryEntity } from '../../fuel-supplies/entities/vehicle-fuel-history.entity';
import { FuelSuppliesService } from '../../fuel-supplies/services/fuel-supplies.service';
import { TenantContext } from '../../tenants/context/tenant-context';
import { FLEET_READ_ROLES, FLEET_WRITE_ROLES } from '../constants/fleet-roles.constants';
import { CreateVehicleDocumentDto } from '../dto/create-vehicle-document.dto';
import { CreateVehicleTagDto } from '../dto/create-vehicle-tag.dto';
import { CreateVehicleDto } from '../dto/create-vehicle.dto';
import { FindVehiclesQueryDto } from '../dto/find-vehicles-query.dto';
import { UpdateVehicleStatusDto } from '../dto/update-vehicle-status.dto';
import { UpdateVehicleTagStatusDto } from '../dto/update-vehicle-tag-status.dto';
import { UpdateVehicleTagDto } from '../dto/update-vehicle-tag.dto';
import { UpdateVehicleDto } from '../dto/update-vehicle.dto';
import { PaginatedMaintenancesEntity } from '../entities/paginated-maintenances.entity';
import { PaginatedVehiclesEntity } from '../entities/paginated-vehicles.entity';
import { VehicleDocumentEntity } from '../entities/vehicle-document.entity';
import { VehicleDriverAssignmentEntity } from '../entities/vehicle-driver-assignment.entity';
import { VehicleOverviewEntity } from '../entities/vehicle-overview.entity';
import { VehicleSummaryEntity } from '../entities/vehicle-summary.entity';
import { VehicleTagEntity } from '../entities/vehicle-tag.entity';
import { VehicleEntity } from '../entities/vehicle.entity';
import { MaintenancesService } from '../services/maintenances.service';
import { VehicleDocumentsService } from '../services/vehicle-documents.service';
import { VehicleOverviewService } from '../services/vehicle-overview.service';
import { VehicleTagsService } from '../services/vehicle-tags.service';
import { VehiclesService } from '../services/vehicles.service';

@ApiTags('vehicles')
@ApiBearerAuth()
@Controller('vehicles')
export class VehiclesController {
  constructor(
    private readonly vehiclesService: VehiclesService,
    private readonly vehicleTagsService: VehicleTagsService,
    private readonly maintenancesService: MaintenancesService,
    private readonly fuelSuppliesService: FuelSuppliesService,
    private readonly vehicleDocumentsService: VehicleDocumentsService,
    private readonly vehicleOverviewService: VehicleOverviewService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({
    summary:
      'Lista veiculos da empresa (busca, filtro por placa/marca/modelo/tipo/categoria/status/propriedade/motorista/disponibilidade/ano/frota, paginacao, ordenacao).',
  })
  @ApiOkResponse({ type: PaginatedVehiclesEntity })
  findAll(@Query() query: FindVehiclesQueryDto): Promise<PaginatedVehiclesEntity> {
    return this.vehiclesService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get('summary')
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({
    summary: 'Indicadores do cadastro de veiculos (por status, disponibilidade e propriedade OWN/AGGREGATED/THIRD_PARTY).',
  })
  @ApiOkResponse({ type: VehicleSummaryEntity })
  getSummary(): Promise<VehicleSummaryEntity> {
    return this.vehiclesService.getSummary(this.tenantContext.requireTenantId());
  }

  @Get(':id')
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({ summary: 'Consulta um veiculo da empresa.' })
  @ApiOkResponse({ type: VehicleEntity })
  @ApiNotFoundResponse({ description: 'Veiculo nao encontrado nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<VehicleEntity> {
    return this.vehiclesService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Get(':id/overview')
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({
    summary:
      'Visao operacional consolidada do veiculo: status, disponibilidade, motorista atual, viagem atual, ' +
      'indicadores, documentos, alertas, historico de motoristas, viagens recentes e auditoria.',
  })
  @ApiOkResponse({ type: VehicleOverviewEntity })
  @ApiNotFoundResponse({ description: 'Veiculo nao encontrado nesta empresa.' })
  getOverview(@Param('id', ParseUUIDPipe) id: string): Promise<VehicleOverviewEntity> {
    return this.vehicleOverviewService.getOverview(this.tenantContext.requireTenantId(), id);
  }

  @Post()
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({ summary: 'Cadastra um veiculo (cavalo mecanico, caminhao, van...) na empresa.' })
  @ApiCreatedResponse({ type: VehicleEntity })
  @ApiConflictResponse({
    description: 'Ja existe um veiculo com esta placa/renavam/chassi nesta empresa.',
  })
  create(@Body() dto: CreateVehicleDto): Promise<VehicleEntity> {
    return this.vehiclesService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({ summary: 'Atualiza dados de um veiculo.' })
  @ApiOkResponse({ type: VehicleEntity })
  @ApiNotFoundResponse({ description: 'Veiculo nao encontrado nesta empresa.' })
  @ApiConflictResponse({
    description: 'Ja existe um veiculo com esta placa/renavam/chassi nesta empresa.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleDto,
  ): Promise<VehicleEntity> {
    return this.vehiclesService.update(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id/status')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({
    summary: 'Altera a situacao do veiculo (ACTIVE, INACTIVE, MAINTENANCE ou SOLD).',
  })
  @ApiOkResponse({ type: VehicleEntity })
  @ApiNotFoundResponse({ description: 'Veiculo nao encontrado nesta empresa.' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleStatusDto,
  ): Promise<VehicleEntity> {
    return this.vehiclesService.updateStatus(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Get(':id/history')
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({
    summary: 'Historico de auditoria do veiculo (quem, quando, IP, User-Agent, antes/depois).',
  })
  @ApiOkResponse({ type: PaginatedAuditLogEntity })
  @ApiNotFoundResponse({ description: 'Veiculo nao encontrado nesta empresa.' })
  findHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedAuditLogEntity> {
    return this.vehiclesService.getHistory(this.tenantContext.requireTenantId(), id, query);
  }

  @Delete(':id')
  @Roles(...FLEET_WRITE_ROLES)
  @Throttle(CRITICAL_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Exclui logicamente um veiculo -- somente se nao houver viagem ativa nem manutencao aberta.',
  })
  @ApiNoContentResponse({ description: 'Veiculo excluido.' })
  @ApiNotFoundResponse({ description: 'Veiculo nao encontrado nesta empresa.' })
  @ApiConflictResponse({
    description: 'Existem viagens ativas ou manutencao aberta vinculadas a este veiculo.',
  })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.vehiclesService.softDelete(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Get(':id/maintenances')
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({ summary: 'Lista as manutencoes de um veiculo (paginado).' })
  @ApiOkResponse({ type: PaginatedMaintenancesEntity })
  @ApiNotFoundResponse({ description: 'Veiculo nao encontrado nesta empresa.' })
  findMaintenances(
    @Param('id', ParseUUIDPipe) vehicleId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedMaintenancesEntity> {
    return this.maintenancesService.findAllForVehicle(
      this.tenantContext.requireTenantId(),
      vehicleId,
      query,
    );
  }

  @Get(':id/fuel-history')
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({
    summary:
      'Historico de abastecimentos do veiculo: ultimos abastecimentos, consumo medio (km/l), ' +
      'gasto total e litros totais.',
  })
  @ApiOkResponse({ type: VehicleFuelHistoryEntity })
  @ApiNotFoundResponse({ description: 'Veiculo nao encontrado nesta empresa.' })
  findFuelHistory(
    @Param('id', ParseUUIDPipe) vehicleId: string,
    @Query() query: FuelHistoryQueryDto,
  ): Promise<VehicleFuelHistoryEntity> {
    return this.fuelSuppliesService.getVehicleFuelHistory(
      this.tenantContext.requireTenantId(),
      vehicleId,
      query,
    );
  }

  @Get(':id/tags')
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({ summary: 'Lista as tags de pedagio vinculadas a um veiculo.' })
  @ApiOkResponse({ type: VehicleTagEntity, isArray: true })
  @ApiNotFoundResponse({ description: 'Veiculo nao encontrado nesta empresa.' })
  findTags(@Param('id', ParseUUIDPipe) vehicleId: string): Promise<VehicleTagEntity[]> {
    return this.vehicleTagsService.findAll(this.tenantContext.requireTenantId(), vehicleId);
  }

  @Post(':id/tags')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({ summary: 'Vincula uma tag de pedagio (operadora + numero) a um veiculo.' })
  @ApiCreatedResponse({ type: VehicleTagEntity })
  @ApiNotFoundResponse({ description: 'Veiculo ou operadora nao encontrados.' })
  @ApiConflictResponse({ description: 'Numero de tag ja cadastrado para esta operadora.' })
  createTag(
    @Param('id', ParseUUIDPipe) vehicleId: string,
    @Body() dto: CreateVehicleTagDto,
  ): Promise<VehicleTagEntity> {
    return this.vehicleTagsService.create(
      this.tenantContext.requireTenantId(),
      vehicleId,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id/tags/:tagId')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({ summary: 'Atualiza dados de uma tag do veiculo (numero, ativacao, vencimento).' })
  @ApiOkResponse({ type: VehicleTagEntity })
  @ApiNotFoundResponse({ description: 'Tag nao encontrada para este veiculo.' })
  @ApiConflictResponse({ description: 'Numero de tag ja cadastrado para esta operadora.' })
  updateTag(
    @Param('id', ParseUUIDPipe) vehicleId: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
    @Body() dto: UpdateVehicleTagDto,
  ): Promise<VehicleTagEntity> {
    return this.vehicleTagsService.update(
      this.tenantContext.requireTenantId(),
      vehicleId,
      tagId,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id/tags/:tagId/status')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({ summary: 'Ativa ou desativa uma tag do veiculo.' })
  @ApiOkResponse({ type: VehicleTagEntity })
  @ApiNotFoundResponse({ description: 'Tag nao encontrada para este veiculo.' })
  updateTagStatus(
    @Param('id', ParseUUIDPipe) vehicleId: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
    @Body() dto: UpdateVehicleTagStatusDto,
  ): Promise<VehicleTagEntity> {
    return this.vehicleTagsService.updateStatus(
      this.tenantContext.requireTenantId(),
      vehicleId,
      tagId,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Delete(':id/tags/:tagId')
  @Roles(...FLEET_WRITE_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove o vinculo de uma tag com o veiculo.' })
  @ApiNoContentResponse({ description: 'Tag removida.' })
  @ApiNotFoundResponse({ description: 'Tag nao encontrada para este veiculo.' })
  async removeTag(
    @Param('id', ParseUUIDPipe) vehicleId: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
  ): Promise<void> {
    await this.vehicleTagsService.remove(
      this.tenantContext.requireTenantId(),
      vehicleId,
      tagId,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Get(':id/driver-assignments')
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({ summary: 'Historico de motoristas vinculados ao veiculo (atual + anteriores, mais recente primeiro).' })
  @ApiOkResponse({ type: VehicleDriverAssignmentEntity, isArray: true })
  @ApiNotFoundResponse({ description: 'Veiculo nao encontrado nesta empresa.' })
  getDriverAssignments(@Param('id', ParseUUIDPipe) id: string): Promise<VehicleDriverAssignmentEntity[]> {
    return this.vehiclesService.getDriverAssignments(this.tenantContext.requireTenantId(), id);
  }

  @Post(':id/documents')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({ summary: 'Cadastra um documento do veiculo (CRLV, ANTT, seguro, licenciamento, outros).' })
  @ApiCreatedResponse({ type: VehicleDocumentEntity })
  @ApiNotFoundResponse({ description: 'Veiculo nao encontrado nesta empresa.' })
  createDocument(
    @Param('id', ParseUUIDPipe) vehicleId: string,
    @Body() dto: CreateVehicleDocumentDto,
  ): Promise<VehicleDocumentEntity> {
    return this.vehicleDocumentsService.create(
      this.tenantContext.requireTenantId(),
      vehicleId,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Get(':id/documents')
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({ summary: 'Lista os documentos cadastrados de um veiculo.' })
  @ApiOkResponse({ type: VehicleDocumentEntity, isArray: true })
  @ApiNotFoundResponse({ description: 'Veiculo nao encontrado nesta empresa.' })
  findDocuments(@Param('id', ParseUUIDPipe) vehicleId: string): Promise<VehicleDocumentEntity[]> {
    return this.vehicleDocumentsService.findAll(this.tenantContext.requireTenantId(), vehicleId);
  }
}
