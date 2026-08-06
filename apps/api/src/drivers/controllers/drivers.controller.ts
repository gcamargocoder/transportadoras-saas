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
import { DRIVER_READ_ROLES, DRIVER_WRITE_ROLES } from '../constants/driver-roles.constants';
import { CreateDriverDocumentDto } from '../dto/create-driver-document.dto';
import { CreateDriverDto } from '../dto/create-driver.dto';
import { FindDriversQueryDto } from '../dto/find-drivers-query.dto';
import { UpdateDriverStatusDto } from '../dto/update-driver-status.dto';
import { UpdateDriverDto } from '../dto/update-driver.dto';
import { DriverDocumentEntity } from '../entities/driver-document.entity';
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
  @ApiOperation({ summary: 'Ativa ou desativa um motorista.' })
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
