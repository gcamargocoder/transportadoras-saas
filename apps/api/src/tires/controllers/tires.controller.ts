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
import { TenantModule } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { FLEET_READ_ROLES, FLEET_WRITE_ROLES } from '../../fleet/constants/fleet-roles.constants';
import { TenantContext } from '../../tenants/context/tenant-context';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import { CreateTireDisposalDto } from '../dto/create-tire-disposal.dto';
import { CreateTireInspectionDto } from '../dto/create-tire-inspection.dto';
import { CreateTireMovementDto } from '../dto/create-tire-movement.dto';
import { CreateTireRetreadDto } from '../dto/create-tire-retread.dto';
import { CreateTireDto } from '../dto/create-tire.dto';
import { FindTiresQueryDto } from '../dto/find-tires-query.dto';
import { UpdateTireDto } from '../dto/update-tire.dto';
import { PaginatedTireInspectionsEntity } from '../entities/paginated-tire-inspections.entity';
import { PaginatedTireMovementsEntity } from '../entities/paginated-tire-movements.entity';
import { PaginatedTireRetreadsEntity } from '../entities/paginated-tire-retreads.entity';
import { PaginatedTiresEntity } from '../entities/paginated-tires.entity';
import { TireDashboardEntity } from '../entities/tire-dashboard.entity';
import { TireDisposalEntity } from '../entities/tire-disposal.entity';
import { TireEntity } from '../entities/tire.entity';
import { TireHistoryEntity } from '../entities/tire-history.entity';
import { TireInspectionEntity } from '../entities/tire-inspection.entity';
import { TireMovementEntity } from '../entities/tire-movement.entity';
import { TireRetreadEntity } from '../entities/tire-retread.entity';
import { TiresService } from '../services/tires.service';

@ApiTags('tires')
@ApiBearerAuth()
@Controller('tires')
@RequireModule(TenantModule.TIRES)
export class TiresController {
  constructor(
    private readonly tiresService: TiresService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({
    summary:
      'Lista pneus da empresa (busca, filtro por status/localizacao/veiculo/carreta, paginacao, ordenacao).',
  })
  @ApiOkResponse({ type: PaginatedTiresEntity })
  findAll(@Query() query: FindTiresQueryDto): Promise<PaginatedTiresEntity> {
    return this.tiresService.findAll(this.tenantContext.requireTenantId(), query);
  }

  // Declarado ANTES de ":id" de proposito -- "dashboard" nao pode ser
  // interceptado como se fosse um :id (mesmo padrao ja usado em
  // toll-transactions/fuel-supplies).
  @Get('dashboard')
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({
    summary:
      'Dashboard de pneus: quantidade por status, estoque/uso/descarte/recapados, valor ' +
      'investido, valor em recapagens, vida util media, quilometragem media e pneus proximos da troca.',
  })
  @ApiOkResponse({ type: TireDashboardEntity })
  getDashboard(): Promise<TireDashboardEntity> {
    return this.tiresService.getDashboard(this.tenantContext.requireTenantId());
  }

  @Get(':id')
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({ summary: 'Consulta um pneu da empresa.' })
  @ApiOkResponse({ type: TireEntity })
  @ApiNotFoundResponse({ description: 'Pneu nao encontrado nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<TireEntity> {
    return this.tiresService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Post()
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({ summary: 'Cadastra um pneu (sempre nasce em estoque).' })
  @ApiCreatedResponse({ type: TireEntity })
  @ApiConflictResponse({ description: 'Ja existe um pneu com este numero de fogo nesta empresa.' })
  create(@Body() dto: CreateTireDto): Promise<TireEntity> {
    return this.tiresService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Atualiza dados de cadastro de um pneu. Localizacao/status mudam apenas pelos endpoints ' +
      'dedicados (movimentacao/recapagem/descarte).',
  })
  @ApiOkResponse({ type: TireEntity })
  @ApiNotFoundResponse({ description: 'Pneu nao encontrado nesta empresa.' })
  @ApiConflictResponse({ description: 'Ja existe um pneu com este numero de fogo nesta empresa.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTireDto): Promise<TireEntity> {
    return this.tiresService.update(
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
  @ApiOperation({ summary: 'Exclui um pneu -- somente se nao possuir nenhum historico.' })
  @ApiNoContentResponse({ description: 'Pneu excluido.' })
  @ApiNotFoundResponse({ description: 'Pneu nao encontrado nesta empresa.' })
  @ApiConflictResponse({
    description: 'Pneu possui historico (movimentacoes, recapagens, inspecoes ou descarte).',
  })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.tiresService.remove(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  // ==========================================================================
  // MOVIMENTACOES
  // ==========================================================================
  @Get(':id/movements')
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({ summary: 'Lista o historico de movimentacoes de um pneu (paginado).' })
  @ApiOkResponse({ type: PaginatedTireMovementsEntity })
  @ApiNotFoundResponse({ description: 'Pneu nao encontrado nesta empresa.' })
  findMovements(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedTireMovementsEntity> {
    return this.tiresService.findMovements(this.tenantContext.requireTenantId(), id, query);
  }

  @Post(':id/movements')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Registra uma movimentacao (troca de veiculo/carreta/posicao ou retorno ao estoque). ' +
      'Gera historico automatico e atualiza a localizacao/status atual do pneu.',
  })
  @ApiCreatedResponse({ type: TireMovementEntity })
  @ApiNotFoundResponse({ description: 'Pneu, veiculo ou carreta nao encontrados nesta empresa.' })
  @ApiConflictResponse({
    description: 'Pneu descartado, ou posicao ja ocupada por outro pneu neste veiculo/carreta.',
  })
  createMovement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTireMovementDto,
  ): Promise<TireMovementEntity> {
    return this.tiresService.createMovement(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  // ==========================================================================
  // RECAPAGENS
  // ==========================================================================
  @Get(':id/retreads')
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({ summary: 'Lista as recapagens de um pneu (paginado).' })
  @ApiOkResponse({ type: PaginatedTireRetreadsEntity })
  @ApiNotFoundResponse({ description: 'Pneu nao encontrado nesta empresa.' })
  findRetreads(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedTireRetreadsEntity> {
    return this.tiresService.findRetreads(this.tenantContext.requireTenantId(), id, query);
  }

  @Post(':id/retreads')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Registra uma recapagem do pneu (um pneu pode ter varias). Atualiza status para RETREADED.',
  })
  @ApiCreatedResponse({ type: TireRetreadEntity })
  @ApiNotFoundResponse({ description: 'Pneu nao encontrado nesta empresa.' })
  @ApiConflictResponse({ description: 'Pneu descartado nao pode ser recapado.' })
  createRetread(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTireRetreadDto,
  ): Promise<TireRetreadEntity> {
    return this.tiresService.createRetread(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  // ==========================================================================
  // INSPECOES
  // ==========================================================================
  @Get(':id/inspections')
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({ summary: 'Lista as inspecoes de um pneu (paginado).' })
  @ApiOkResponse({ type: PaginatedTireInspectionsEntity })
  @ApiNotFoundResponse({ description: 'Pneu nao encontrado nesta empresa.' })
  findInspections(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedTireInspectionsEntity> {
    return this.tiresService.findInspections(this.tenantContext.requireTenantId(), id, query);
  }

  @Post(':id/inspections')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Registra uma inspecao (sulco/pressao). Atualiza Tire.currentTreadDepthMm automaticamente.',
  })
  @ApiCreatedResponse({ type: TireInspectionEntity })
  @ApiNotFoundResponse({ description: 'Pneu nao encontrado nesta empresa.' })
  @ApiConflictResponse({ description: 'Pneu descartado nao pode ser inspecionado.' })
  createInspection(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTireInspectionDto,
  ): Promise<TireInspectionEntity> {
    return this.tiresService.createInspection(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  // ==========================================================================
  // DESCARTE
  // ==========================================================================
  @Get(':id/disposal')
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({ summary: 'Consulta o descarte de um pneu.' })
  @ApiOkResponse({ type: TireDisposalEntity })
  @ApiNotFoundResponse({ description: 'Pneu nao encontrado, ou ainda nao foi descartado.' })
  findDisposal(@Param('id', ParseUUIDPipe) id: string): Promise<TireDisposalEntity> {
    return this.tiresService.findDisposal(this.tenantContext.requireTenantId(), id);
  }

  @Post(':id/disposal')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Registra o descarte de um pneu (unico por pneu). Atualiza status para SCRAPPED e remove a localizacao.',
  })
  @ApiCreatedResponse({ type: TireDisposalEntity })
  @ApiNotFoundResponse({ description: 'Pneu nao encontrado nesta empresa.' })
  @ApiConflictResponse({ description: 'Este pneu ja foi descartado.' })
  createDisposal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTireDisposalDto,
  ): Promise<TireDisposalEntity> {
    return this.tiresService.createDisposal(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  // ==========================================================================
  // HISTORICO COMPLETO
  // ==========================================================================
  @Get(':id/history')
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({
    summary:
      'Historico completo do pneu: movimentacoes, recapagens, inspecoes e descarte, ' +
      'consolidados em uma unica linha do tempo (mais recente primeiro).',
  })
  @ApiOkResponse({ type: TireHistoryEntity })
  @ApiNotFoundResponse({ description: 'Pneu nao encontrado nesta empresa.' })
  getHistory(@Param('id', ParseUUIDPipe) id: string): Promise<TireHistoryEntity> {
    return this.tiresService.getHistory(this.tenantContext.requireTenantId(), id);
  }
}
