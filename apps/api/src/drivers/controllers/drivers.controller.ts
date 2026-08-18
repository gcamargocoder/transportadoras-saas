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
import { Roles } from '../../auth/decorators/roles.decorator';
import { CRITICAL_THROTTLE } from '../../common/constants/throttle.constants';
import { TenantContext } from '../../tenants/context/tenant-context';
import { DRIVER_READ_ROLES, DRIVER_WRITE_ROLES } from '../constants/driver-roles.constants';
import { AssignDriverVehicleDto } from '../dto/assign-driver-vehicle.dto';
import { CreateDriverDocumentDto } from '../dto/create-driver-document.dto';
import { CreateDriverDto } from '../dto/create-driver.dto';
import { FindDriversQueryDto } from '../dto/find-drivers-query.dto';
import { LinkDriverUserDto } from '../dto/link-driver-user.dto';
import { UpdateDriverStatusDto } from '../dto/update-driver-status.dto';
import { UpdateDriverDto } from '../dto/update-driver.dto';
import { DriverDocumentEntity } from '../entities/driver-document.entity';
import { DriverSummaryEntity } from '../entities/driver-summary.entity';
import { DriverVehicleAssignmentEntity } from '../entities/driver-vehicle-assignment.entity';
import { DriverEntity } from '../entities/driver.entity';
import { PaginatedDriversEntity } from '../entities/paginated-drivers.entity';
import { DriverDocumentsService } from '../services/driver-documents.service';
import { DriversService } from '../services/drivers.service';

// Motoristas (Driver, papel operacional cadastrado aqui) sao distintos de
// UserAccount.role = DRIVER (login futuro no app) -- este controller e
// "administrativo" e DRIVER nunca aparece em DRIVER_READ_ROLES/WRITE_ROLES.
@ApiTags('drivers')
@ApiBearerAuth()
@Controller('drivers')
export class DriversController {
  constructor(
    private readonly driversService: DriversService,
    private readonly driverDocumentsService: DriverDocumentsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...DRIVER_READ_ROLES)
  @ApiOperation({
    summary: 'Lista motoristas da empresa (busca, filtro por status, paginacao, ordenacao).',
  })
  @ApiOkResponse({ type: PaginatedDriversEntity })
  findAll(@Query() query: FindDriversQueryDto): Promise<PaginatedDriversEntity> {
    return this.driversService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get('summary')
  @Roles(...DRIVER_READ_ROLES)
  @ApiOperation({
    summary: 'Indicadores do cadastro de motoristas (por classificacao OWN/AGGREGATED/THIRD_PARTY e por status).',
  })
  @ApiOkResponse({ type: DriverSummaryEntity })
  getSummary(): Promise<DriverSummaryEntity> {
    return this.driversService.getSummary(this.tenantContext.requireTenantId());
  }

  @Get(':id')
  @Roles(...DRIVER_READ_ROLES)
  @ApiOperation({ summary: 'Consulta um motorista da empresa.' })
  @ApiOkResponse({ type: DriverEntity })
  @ApiNotFoundResponse({ description: 'Motorista nao encontrado nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<DriverEntity> {
    return this.driversService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Post()
  @Roles(...DRIVER_WRITE_ROLES)
  @ApiOperation({ summary: 'Cadastra um motorista na empresa.' })
  @ApiCreatedResponse({ type: DriverEntity })
  @ApiConflictResponse({
    description: 'Ja existe um motorista com este CPF ou numero de CNH nesta empresa.',
  })
  create(@Body() dto: CreateDriverDto): Promise<DriverEntity> {
    return this.driversService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id')
  @Roles(...DRIVER_WRITE_ROLES)
  @ApiOperation({ summary: 'Atualiza dados de um motorista.' })
  @ApiOkResponse({ type: DriverEntity })
  @ApiNotFoundResponse({ description: 'Motorista nao encontrado nesta empresa.' })
  @ApiConflictResponse({
    description: 'Ja existe um motorista com este CPF ou numero de CNH nesta empresa.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDriverDto,
  ): Promise<DriverEntity> {
    return this.driversService.update(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id/status')
  @Roles(...DRIVER_WRITE_ROLES)
  @ApiOperation({ summary: 'Ativa, suspende ou desativa um motorista (ACTIVE/SUSPENDED/INACTIVE).' })
  @ApiOkResponse({ type: DriverEntity })
  @ApiNotFoundResponse({ description: 'Motorista nao encontrado nesta empresa.' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDriverStatusDto,
  ): Promise<DriverEntity> {
    return this.driversService.updateStatus(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Delete(':id')
  @Roles(...DRIVER_WRITE_ROLES)
  @Throttle(CRITICAL_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui logicamente um motorista.' })
  @ApiNoContentResponse({ description: 'Motorista excluido.' })
  @ApiNotFoundResponse({ description: 'Motorista nao encontrado nesta empresa.' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.driversService.softDelete(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id/user-link')
  @Roles(...DRIVER_WRITE_ROLES)
  @ApiOperation({
    summary: 'Vincula um usuario (UserAccount) ja existente ao motorista (login opcional).',
    description:
      'Nunca cria um usuario novo -- apenas referencia um UserAccount ja existente nesta empresa. ' +
      'Um usuario so pode estar vinculado a um motorista por vez.',
  })
  @ApiOkResponse({ type: DriverEntity })
  @ApiNotFoundResponse({ description: 'Motorista ou usuario nao encontrado nesta empresa.' })
  @ApiConflictResponse({ description: 'O usuario ja esta vinculado a outro motorista.' })
  linkUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkDriverUserDto,
  ): Promise<DriverEntity> {
    return this.driversService.linkUser(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Delete(':id/user-link')
  @Roles(...DRIVER_WRITE_ROLES)
  @ApiOperation({ summary: 'Desvincula o usuario (UserAccount) associado ao motorista.' })
  @ApiOkResponse({ type: DriverEntity })
  @ApiNotFoundResponse({ description: 'Motorista nao encontrado nesta empresa.' })
  @ApiConflictResponse({ description: 'Este motorista nao possui usuario vinculado.' })
  unlinkUser(@Param('id', ParseUUIDPipe) id: string): Promise<DriverEntity> {
    return this.driversService.unlinkUser(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Get(':id/vehicle-assignments')
  @Roles(...DRIVER_READ_ROLES)
  @ApiOperation({ summary: 'Historico de veiculos vinculados ao motorista (atual + anteriores, mais recente primeiro).' })
  @ApiOkResponse({ type: DriverVehicleAssignmentEntity, isArray: true })
  @ApiNotFoundResponse({ description: 'Motorista nao encontrado nesta empresa.' })
  getVehicleAssignments(@Param('id', ParseUUIDPipe) id: string): Promise<DriverVehicleAssignmentEntity[]> {
    return this.driversService.getVehicleAssignments(this.tenantContext.requireTenantId(), id);
  }

  @Post(':id/vehicle-assignments')
  @Roles(...DRIVER_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Vincula um veiculo ao motorista. Fecha o vinculo atual (se existir) e abre um novo, preservando o ' +
      'historico -- nunca apaga a atribuicao anterior.',
  })
  @ApiCreatedResponse({ type: DriverVehicleAssignmentEntity, isArray: true })
  @ApiNotFoundResponse({ description: 'Motorista ou veiculo nao encontrados nesta empresa.' })
  assignVehicle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignDriverVehicleDto,
  ): Promise<DriverVehicleAssignmentEntity[]> {
    return this.driversService.assignVehicle(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post(':id/vehicle-assignments/end')
  @Roles(...DRIVER_WRITE_ROLES)
  @ApiOperation({ summary: 'Encerra o vinculo atual do motorista com o veiculo, sem abrir um novo.' })
  @ApiOkResponse({ type: DriverVehicleAssignmentEntity, isArray: true })
  @ApiNotFoundResponse({ description: 'Motorista nao encontrado nesta empresa.' })
  @ApiConflictResponse({ description: 'Este motorista nao possui veiculo vinculado atualmente.' })
  endVehicleAssignment(@Param('id', ParseUUIDPipe) id: string): Promise<DriverVehicleAssignmentEntity[]> {
    return this.driversService.endVehicleAssignment(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post(':id/documents')
  @Roles(...DRIVER_WRITE_ROLES)
  @ApiOperation({
    summary: 'Cadastra um documento do motorista (CNH, exame medico, MOPP, ANTT, outros).',
  })
  @ApiCreatedResponse({ type: DriverDocumentEntity })
  @ApiNotFoundResponse({ description: 'Motorista nao encontrado nesta empresa.' })
  createDocument(
    @Param('id', ParseUUIDPipe) driverId: string,
    @Body() dto: CreateDriverDocumentDto,
  ): Promise<DriverDocumentEntity> {
    return this.driverDocumentsService.create(
      this.tenantContext.requireTenantId(),
      driverId,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Get(':id/documents')
  @Roles(...DRIVER_READ_ROLES)
  @ApiOperation({ summary: 'Lista os documentos cadastrados de um motorista.' })
  @ApiOkResponse({ type: DriverDocumentEntity, isArray: true })
  @ApiNotFoundResponse({ description: 'Motorista nao encontrado nesta empresa.' })
  findDocuments(@Param('id', ParseUUIDPipe) driverId: string): Promise<DriverDocumentEntity[]> {
    return this.driverDocumentsService.findAll(this.tenantContext.requireTenantId(), driverId);
  }
}
