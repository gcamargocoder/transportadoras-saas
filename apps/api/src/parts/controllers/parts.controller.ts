import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { TenantModule } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import { FLEET_READ_ROLES, FLEET_WRITE_ROLES } from '../../fleet/constants/fleet-roles.constants';
import { CreatePartDto } from '../dto/create-part.dto';
import { FindPartMovementsQueryDto } from '../dto/find-part-movements-query.dto';
import { FindPartsQueryDto } from '../dto/find-parts-query.dto';
import { PartsDashboardQueryDto } from '../dto/parts-dashboard-query.dto';
import { RegisterStockAdjustmentDto } from '../dto/register-stock-adjustment.dto';
import { RegisterStockInDto } from '../dto/register-stock-in.dto';
import { RegisterStockOutDto } from '../dto/register-stock-out.dto';
import { UpdatePartStatusDto } from '../dto/update-part-status.dto';
import { UpdatePartDto } from '../dto/update-part.dto';
import { PaginatedPartsEntity } from '../entities/paginated-parts.entity';
import { PaginatedPartStockMovementsEntity } from '../entities/paginated-part-stock-movements.entity';
import { PartEntity } from '../entities/part.entity';
import { PartsDashboardEntity } from '../entities/parts-dashboard.entity';
import { PartsService } from '../services/parts.service';

// Fase 83 -- reaproveita o mesmo gate/RBAC ja usado por /maintenances
// (TenantModule.MAINTENANCE, FLEET_READ_ROLES/FLEET_WRITE_ROLES) -- pecas
// sao parte do dominio de manutencao, nenhuma constante nova criada.
@ApiTags('parts')
@ApiBearerAuth()
@Controller('parts')
@RequireModule(TenantModule.MAINTENANCE)
export class PartsController {
  constructor(
    private readonly partsService: PartsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({ summary: 'Lista pecas do catalogo (busca, categoria, ativo/inativo, estoque baixo/zerado, paginacao).' })
  @ApiOkResponse({ type: PaginatedPartsEntity })
  findAll(@Query() query: FindPartsQueryDto): Promise<PaginatedPartsEntity> {
    return this.partsService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get('dashboard')
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({ summary: 'Indicadores operacionais do estoque de pecas.' })
  @ApiOkResponse({ type: PartsDashboardEntity })
  getDashboard(@Query() query: PartsDashboardQueryDto): Promise<PartsDashboardEntity> {
    return this.partsService.getDashboard(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({ summary: 'Consulta uma peca do catalogo.' })
  @ApiOkResponse({ type: PartEntity })
  @ApiNotFoundResponse({ description: 'Peca nao encontrada nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<PartEntity> {
    return this.partsService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Get(':id/movements')
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({ summary: 'Historico de movimentacoes de estoque da peca (ledger append-only, paginado).' })
  @ApiOkResponse({ type: PaginatedPartStockMovementsEntity })
  @ApiNotFoundResponse({ description: 'Peca nao encontrada nesta empresa.' })
  getMovements(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: FindPartMovementsQueryDto,
  ): Promise<PaginatedPartStockMovementsEntity> {
    return this.partsService.getMovements(this.tenantContext.requireTenantId(), id, query);
  }

  @Post()
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({ summary: 'Cadastra uma peca no catalogo (currentStock sempre nasce em 0).' })
  @ApiCreatedResponse({ type: PartEntity })
  @ApiConflictResponse({ description: 'Ja existe uma peca com este SKU nesta empresa.' })
  create(@Body() dto: CreatePartDto): Promise<PartEntity> {
    return this.partsService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({ summary: 'Atualiza dados cadastrais da peca (nao altera estoque).' })
  @ApiOkResponse({ type: PartEntity })
  @ApiNotFoundResponse({ description: 'Peca nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'Ja existe uma peca com este SKU nesta empresa.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePartDto): Promise<PartEntity> {
    return this.partsService.update(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id/status')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({ summary: 'Ativa ou desativa a peca.' })
  @ApiOkResponse({ type: PartEntity })
  @ApiNotFoundResponse({ description: 'Peca nao encontrada nesta empresa.' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePartStatusDto,
  ): Promise<PartEntity> {
    return this.partsService.updateStatus(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post(':id/stock/in')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({ summary: 'Registra entrada manual de estoque (compra/devolucao/recebimento).' })
  @ApiOkResponse({ type: PartEntity })
  @ApiNotFoundResponse({ description: 'Peca nao encontrada nesta empresa.' })
  registerIn(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RegisterStockInDto): Promise<PartEntity> {
    return this.partsService.registerIn(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post(':id/stock/out')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({ summary: 'Registra saida manual de estoque. A saida por Ordem de Servico e automatica ao concluir a OS.' })
  @ApiOkResponse({ type: PartEntity })
  @ApiNotFoundResponse({ description: 'Peca (ou OS referenciada) nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'Estoque insuficiente para a saida solicitada.' })
  registerOut(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RegisterStockOutDto): Promise<PartEntity> {
    return this.partsService.registerOut(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post(':id/stock/adjustment')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({ summary: 'Registra ajuste de estoque (delta com sinal, motivo obrigatorio).' })
  @ApiOkResponse({ type: PartEntity })
  @ApiNotFoundResponse({ description: 'Peca nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'O ajuste deixaria o saldo negativo.' })
  registerAdjustment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegisterStockAdjustmentDto,
  ): Promise<PartEntity> {
    return this.partsService.registerAdjustment(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
