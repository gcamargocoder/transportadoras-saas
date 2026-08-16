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
import { TenantContext } from '../../tenants/context/tenant-context';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import {
  FUEL_SUPPLY_READ_ROLES,
  FUEL_SUPPLY_WRITE_ROLES,
} from '../constants/fuel-supply-roles.constants';
import { CreateFuelSupplyDto } from '../dto/create-fuel-supply.dto';
import { FindFuelSuppliesQueryDto } from '../dto/find-fuel-supplies-query.dto';
import { UpdateFuelSupplyDto } from '../dto/update-fuel-supply.dto';
import { FuelDashboardEntity } from '../entities/fuel-dashboard.entity';
import { FuelSupplyEntity } from '../entities/fuel-supply.entity';
import { PaginatedFuelSuppliesEntity } from '../entities/paginated-fuel-supplies.entity';
import { FuelSuppliesService } from '../services/fuel-supplies.service';

@ApiTags('fuel-supplies')
@ApiBearerAuth()
@Controller('fuel-supplies')
@RequireModule(TenantModule.FUEL)
export class FuelSuppliesController {
  constructor(
    private readonly fuelSuppliesService: FuelSuppliesService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...FUEL_SUPPLY_READ_ROLES)
  @ApiOperation({
    summary:
      'Lista abastecimentos da empresa (filtro por veiculo/motorista/viagem/tipo de ' +
      'combustivel/posto/periodo, paginacao, ordenacao).',
  })
  @ApiOkResponse({ type: PaginatedFuelSuppliesEntity })
  findAll(@Query() query: FindFuelSuppliesQueryDto): Promise<PaginatedFuelSuppliesEntity> {
    return this.fuelSuppliesService.findAll(this.tenantContext.requireTenantId(), query);
  }

  // Declarado ANTES de ":id" de proposito -- "dashboard" nao pode ser
  // interceptado como se fosse um :id (mesmo padrao ja usado em
  // toll-transactions).
  @Get('dashboard')
  @Roles(...FUEL_SUPPLY_READ_ROLES)
  @ApiOperation({
    summary:
      'Dashboard de abastecimentos: total, litros, valor, consumo medio (km/l), custo por km, ' +
      'posto/veiculo/motorista com mais abastecimentos. Aceita os mesmos filtros da listagem.',
  })
  @ApiOkResponse({ type: FuelDashboardEntity })
  getDashboard(@Query() query: FindFuelSuppliesQueryDto): Promise<FuelDashboardEntity> {
    return this.fuelSuppliesService.getDashboard(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...FUEL_SUPPLY_READ_ROLES)
  @ApiOperation({ summary: 'Consulta um abastecimento.' })
  @ApiOkResponse({ type: FuelSupplyEntity })
  @ApiNotFoundResponse({ description: 'Abastecimento nao encontrado nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<FuelSupplyEntity> {
    return this.fuelSuppliesService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Post()
  @Roles(...FUEL_SUPPLY_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Registra um abastecimento. Quando ha viagem, veiculo e motorista sao sempre derivados ' +
      'dela; caso contrario, sao informados diretamente. totalAmount e sempre calculado ' +
      '(liters * pricePerLiter). Atualiza Vehicle.odometerKm automaticamente quando maior.',
  })
  @ApiCreatedResponse({ type: FuelSupplyEntity })
  @ApiNotFoundResponse({
    description: 'Viagem, veiculo, motorista, posto ou attachment nao encontrados nesta empresa.',
  })
  @ApiConflictResponse({
    description:
      'Viagem sem veiculo/motorista vinculado, ou odometerKm menor que a quilometragem atual do veiculo.',
  })
  create(@Body() dto: CreateFuelSupplyDto): Promise<FuelSupplyEntity> {
    return this.fuelSuppliesService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id')
  @Roles(...FUEL_SUPPLY_WRITE_ROLES)
  @ApiOperation({ summary: 'Atualiza um abastecimento (totalAmount e sempre recalculado).' })
  @ApiOkResponse({ type: FuelSupplyEntity })
  @ApiNotFoundResponse({
    description: 'Abastecimento, veiculo, motorista, posto ou attachment nao encontrados.',
  })
  @ApiConflictResponse({ description: 'odometerKm menor que a quilometragem atual do veiculo.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFuelSupplyDto,
  ): Promise<FuelSupplyEntity> {
    return this.fuelSuppliesService.update(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Delete(':id')
  @Roles(...FUEL_SUPPLY_WRITE_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui um abastecimento.' })
  @ApiNoContentResponse({ description: 'Abastecimento excluido.' })
  @ApiNotFoundResponse({ description: 'Abastecimento nao encontrado nesta empresa.' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.fuelSuppliesService.remove(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
