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
import { FUEL_SUPPLY_READ_ROLES, FUEL_SUPPLY_WRITE_ROLES } from '../../fuel-supplies/constants/fuel-supply-roles.constants';
import { CreateFuelTankDto } from '../dto/create-fuel-tank.dto';
import { FindFuelTankMovementsQueryDto } from '../dto/find-fuel-tank-movements-query.dto';
import { FindFuelTanksQueryDto } from '../dto/find-fuel-tanks-query.dto';
import { UpdateFuelTankDto } from '../dto/update-fuel-tank.dto';
import { UpdateFuelTankStatusDto } from '../dto/update-fuel-tank-status.dto';
import { FuelTankBalanceEntity } from '../entities/fuel-tank-balance.entity';
import { PaginatedFuelTankMovementsEntity } from '../entities/paginated-fuel-tank-movements.entity';
import { PaginatedFuelTanksEntity } from '../entities/paginated-fuel-tanks.entity';
import { FuelTankEntity } from '../entities/fuel-tank.entity';
import { FuelTanksService } from '../services/fuel-tanks.service';

// Reaproveita o mesmo gate/RBAC ja usado por /fuel-supplies (TenantModule.
// FUEL, FUEL_SUPPLY_READ_ROLES/WRITE_ROLES) -- tanques sao parte do mesmo
// dominio de combustivel, nenhuma constante de roles nova criada (mesmo
// espirito de PartsController reaproveitando FLEET_READ_ROLES/WRITE_ROLES).
@ApiTags('fuel-tanks')
@ApiBearerAuth()
@Controller('fuel-tanks')
@RequireModule(TenantModule.FUEL)
export class FuelTanksController {
  constructor(
    private readonly fuelTanksService: FuelTanksService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...FUEL_SUPPLY_READ_ROLES)
  @ApiOperation({ summary: 'Lista tanques proprios (busca, ativo/inativo, estoque baixo, tipo de combustivel, paginacao).' })
  @ApiOkResponse({ type: PaginatedFuelTanksEntity })
  findAll(@Query() query: FindFuelTanksQueryDto): Promise<PaginatedFuelTanksEntity> {
    return this.fuelTanksService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...FUEL_SUPPLY_READ_ROLES)
  @ApiOperation({ summary: 'Consulta um tanque.' })
  @ApiOkResponse({ type: FuelTankEntity })
  @ApiNotFoundResponse({ description: 'Tanque nao encontrado nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<FuelTankEntity> {
    return this.fuelTanksService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Get(':id/balance')
  @Roles(...FUEL_SUPPLY_READ_ROLES)
  @ApiOperation({ summary: 'Consulta rapida do saldo atual do tanque.' })
  @ApiOkResponse({ type: FuelTankBalanceEntity })
  @ApiNotFoundResponse({ description: 'Tanque nao encontrado nesta empresa.' })
  getBalance(@Param('id', ParseUUIDPipe) id: string): Promise<FuelTankBalanceEntity> {
    return this.fuelTanksService.getBalance(this.tenantContext.requireTenantId(), id);
  }

  @Get(':id/movements')
  @Roles(...FUEL_SUPPLY_READ_ROLES)
  @ApiOperation({ summary: 'Historico de movimentacoes do tanque (ledger append-only, paginado).' })
  @ApiOkResponse({ type: PaginatedFuelTankMovementsEntity })
  @ApiNotFoundResponse({ description: 'Tanque nao encontrado nesta empresa.' })
  getMovements(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: FindFuelTankMovementsQueryDto,
  ): Promise<PaginatedFuelTankMovementsEntity> {
    return this.fuelTanksService.getMovements(this.tenantContext.requireTenantId(), id, query);
  }

  @Post()
  @Roles(...FUEL_SUPPLY_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Cadastra um tanque. initialStockLiters gera a primeira movimentacao (INITIAL_BALANCE) ' +
      'na mesma transacao -- currentStockLiters nunca e aceito diretamente do cliente.',
  })
  @ApiCreatedResponse({ type: FuelTankEntity })
  @ApiConflictResponse({ description: 'initialStockLiters/minStockLiters incompativel com capacityLiters.' })
  create(@Body() dto: CreateFuelTankDto): Promise<FuelTankEntity> {
    return this.fuelTanksService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id')
  @Roles(...FUEL_SUPPLY_WRITE_ROLES)
  @ApiOperation({ summary: 'Atualiza dados cadastrais do tanque (nao altera estoque, capacidade ou tipo de combustivel).' })
  @ApiOkResponse({ type: FuelTankEntity })
  @ApiNotFoundResponse({ description: 'Tanque nao encontrado nesta empresa.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFuelTankDto): Promise<FuelTankEntity> {
    return this.fuelTanksService.update(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id/status')
  @Roles(...FUEL_SUPPLY_WRITE_ROLES)
  @ApiOperation({ summary: 'Ativa ou desativa o tanque. Tanque inativo rejeita novas movimentacoes.' })
  @ApiOkResponse({ type: FuelTankEntity })
  @ApiNotFoundResponse({ description: 'Tanque nao encontrado nesta empresa.' })
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFuelTankStatusDto): Promise<FuelTankEntity> {
    return this.fuelTanksService.updateStatus(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
