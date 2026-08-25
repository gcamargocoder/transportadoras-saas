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
import { TenantModule } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CRITICAL_THROTTLE } from '../../common/constants/throttle.constants';
import { TenantContext } from '../../tenants/context/tenant-context';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import { FLEET_READ_ROLES, FLEET_WRITE_ROLES } from '../../fleet/constants/fleet-roles.constants';
import { CreateMaintenanceProviderDto } from '../dto/create-maintenance-provider.dto';
import { FindMaintenanceProvidersQueryDto } from '../dto/find-maintenance-providers-query.dto';
import { UpdateMaintenanceProviderStatusDto } from '../dto/update-maintenance-provider-status.dto';
import { UpdateMaintenanceProviderDto } from '../dto/update-maintenance-provider.dto';
import { MaintenanceProviderSummaryEntity } from '../entities/maintenance-provider-summary.entity';
import { MaintenanceProviderEntity } from '../entities/maintenance-provider.entity';
import { PaginatedMaintenanceProvidersEntity } from '../entities/paginated-maintenance-providers.entity';
import { MaintenanceProvidersService } from '../services/maintenance-providers.service';

// Fase 84 -- reaproveita o mesmo gate/RBAC ja usado por /maintenances e
// /parts (TenantModule.MAINTENANCE, FLEET_READ_ROLES/FLEET_WRITE_ROLES).
// Oficina e fornecedor sao a MESMA entidade (MaintenanceProvider,
// discriminada por `type`) -- um unico controller/recurso para os dois
// conceitos, nunca 2 controllers quase identicos.
@ApiTags('maintenance-providers')
@ApiBearerAuth()
@Controller('maintenance-providers')
@RequireModule(TenantModule.MAINTENANCE)
export class MaintenanceProvidersController {
  constructor(
    private readonly service: MaintenanceProvidersService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({ summary: 'Lista oficinas/fornecedores (filtro por type, busca, ativo/inativo, paginacao).' })
  @ApiOkResponse({ type: PaginatedMaintenanceProvidersEntity })
  findAll(@Query() query: FindMaintenanceProvidersQueryDto): Promise<PaginatedMaintenanceProvidersEntity> {
    return this.service.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({ summary: 'Consulta uma oficina/fornecedor.' })
  @ApiOkResponse({ type: MaintenanceProviderEntity })
  @ApiNotFoundResponse({ description: 'Nao encontrado nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<MaintenanceProviderEntity> {
    return this.service.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Get(':id/summary')
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({ summary: 'Historico: OS vinculadas, veiculos atendidos, custo acumulado, ultima utilizacao.' })
  @ApiOkResponse({ type: MaintenanceProviderSummaryEntity })
  @ApiNotFoundResponse({ description: 'Nao encontrado nesta empresa.' })
  getSummary(@Param('id', ParseUUIDPipe) id: string): Promise<MaintenanceProviderSummaryEntity> {
    return this.service.getSummary(this.tenantContext.requireTenantId(), id);
  }

  @Post()
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({ summary: 'Cadastra uma oficina ou fornecedor.' })
  @ApiCreatedResponse({ type: MaintenanceProviderEntity })
  @ApiConflictResponse({ description: 'Ja existe um cadastro do mesmo tipo com este documento nesta empresa.' })
  create(@Body() dto: CreateMaintenanceProviderDto): Promise<MaintenanceProviderEntity> {
    return this.service.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({ summary: 'Atualiza dados cadastrais (type nunca e editavel).' })
  @ApiOkResponse({ type: MaintenanceProviderEntity })
  @ApiNotFoundResponse({ description: 'Nao encontrado nesta empresa.' })
  @ApiConflictResponse({ description: 'Ja existe um cadastro do mesmo tipo com este documento nesta empresa.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaintenanceProviderDto,
  ): Promise<MaintenanceProviderEntity> {
    return this.service.update(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id/status')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({ summary: 'Ativa ou desativa a oficina/fornecedor.' })
  @ApiOkResponse({ type: MaintenanceProviderEntity })
  @ApiNotFoundResponse({ description: 'Nao encontrado nesta empresa.' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaintenanceProviderStatusDto,
  ): Promise<MaintenanceProviderEntity> {
    return this.service.updateStatus(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Delete(':id')
  @Roles(...FLEET_WRITE_ROLES)
  @Throttle(CRITICAL_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui uma oficina/fornecedor -- somente se nao houver OS vinculada.' })
  @ApiNoContentResponse({ description: 'Excluido.' })
  @ApiNotFoundResponse({ description: 'Nao encontrado nesta empresa.' })
  @ApiConflictResponse({ description: 'Existem OS vinculadas -- desative em vez de excluir.' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.service.remove(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
