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
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { FLEET_READ_ROLES, FLEET_WRITE_ROLES } from '../constants/fleet-roles.constants';
import { CreateFleetDto } from '../dto/create-fleet.dto';
import { FindFleetsQueryDto } from '../dto/find-fleets-query.dto';
import { UpdateFleetStatusDto } from '../dto/update-fleet-status.dto';
import { UpdateFleetDto } from '../dto/update-fleet.dto';
import { FleetEntity } from '../entities/fleet.entity';
import { PaginatedFleetsEntity } from '../entities/paginated-fleets.entity';
import { FleetsService } from '../services/fleets.service';

@ApiTags('fleets')
@ApiBearerAuth()
@Controller('fleets')
export class FleetsController {
  constructor(
    private readonly fleetsService: FleetsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({
    summary: 'Lista frotas da empresa (busca, filtro por tipo/status, paginacao, ordenacao).',
  })
  @ApiOkResponse({ type: PaginatedFleetsEntity })
  findAll(@Query() query: FindFleetsQueryDto): Promise<PaginatedFleetsEntity> {
    return this.fleetsService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({ summary: 'Consulta uma frota da empresa.' })
  @ApiOkResponse({ type: FleetEntity })
  @ApiNotFoundResponse({ description: 'Frota nao encontrada nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<FleetEntity> {
    return this.fleetsService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Post()
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({
    summary: 'Cria uma frota (ex: Matriz, Filial SP, Frota propria, Frota agregada).',
  })
  @ApiCreatedResponse({ type: FleetEntity })
  create(@Body() dto: CreateFleetDto): Promise<FleetEntity> {
    return this.fleetsService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({ summary: 'Atualiza uma frota.' })
  @ApiOkResponse({ type: FleetEntity })
  @ApiNotFoundResponse({ description: 'Frota nao encontrada nesta empresa.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFleetDto,
  ): Promise<FleetEntity> {
    return this.fleetsService.update(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id/status')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({ summary: 'Ativa ou desativa uma frota.' })
  @ApiOkResponse({ type: FleetEntity })
  @ApiNotFoundResponse({ description: 'Frota nao encontrada nesta empresa.' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFleetStatusDto,
  ): Promise<FleetEntity> {
    return this.fleetsService.updateStatus(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Delete(':id')
  @Roles(...FLEET_WRITE_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui logicamente uma frota.' })
  @ApiNoContentResponse({ description: 'Frota excluida.' })
  @ApiNotFoundResponse({ description: 'Frota nao encontrada nesta empresa.' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.fleetsService.softDelete(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
