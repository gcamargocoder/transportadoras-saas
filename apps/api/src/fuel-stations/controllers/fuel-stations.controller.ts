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
import {
  FUEL_STATION_READ_ROLES,
  FUEL_STATION_WRITE_ROLES,
} from '../constants/fuel-station-roles.constants';
import { CreateFuelStationDto } from '../dto/create-fuel-station.dto';
import { FindFuelStationsQueryDto } from '../dto/find-fuel-stations-query.dto';
import { UpdateFuelStationDto } from '../dto/update-fuel-station.dto';
import { FuelStationEntity } from '../entities/fuel-station.entity';
import { PaginatedFuelStationsEntity } from '../entities/paginated-fuel-stations.entity';
import { FuelStationsService } from '../services/fuel-stations.service';

@ApiTags('fuel-stations')
@ApiBearerAuth()
@Controller('fuel-stations')
export class FuelStationsController {
  constructor(
    private readonly fuelStationsService: FuelStationsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...FUEL_STATION_READ_ROLES)
  @ApiOperation({
    summary: 'Lista postos de abastecimento da empresa (busca, filtros, paginacao, ordenacao).',
  })
  @ApiOkResponse({ type: PaginatedFuelStationsEntity })
  findAll(@Query() query: FindFuelStationsQueryDto): Promise<PaginatedFuelStationsEntity> {
    return this.fuelStationsService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...FUEL_STATION_READ_ROLES)
  @ApiOperation({ summary: 'Consulta um posto de abastecimento.' })
  @ApiOkResponse({ type: FuelStationEntity })
  @ApiNotFoundResponse({ description: 'Posto nao encontrado nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<FuelStationEntity> {
    return this.fuelStationsService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Post()
  @Roles(...FUEL_STATION_WRITE_ROLES)
  @ApiOperation({ summary: 'Cadastra um posto de abastecimento na empresa.' })
  @ApiCreatedResponse({ type: FuelStationEntity })
  create(@Body() dto: CreateFuelStationDto): Promise<FuelStationEntity> {
    return this.fuelStationsService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id')
  @Roles(...FUEL_STATION_WRITE_ROLES)
  @ApiOperation({ summary: 'Atualiza dados de um posto de abastecimento.' })
  @ApiOkResponse({ type: FuelStationEntity })
  @ApiNotFoundResponse({ description: 'Posto nao encontrado nesta empresa.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFuelStationDto,
  ): Promise<FuelStationEntity> {
    return this.fuelStationsService.update(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Delete(':id')
  @Roles(...FUEL_STATION_WRITE_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui um posto de abastecimento.' })
  @ApiNoContentResponse({ description: 'Posto excluido.' })
  @ApiNotFoundResponse({ description: 'Posto nao encontrado nesta empresa.' })
  @ApiConflictResponse({ description: 'Existem abastecimentos vinculados a este posto.' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.fuelStationsService.remove(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
