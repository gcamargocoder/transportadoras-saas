import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { TRIP_READ_ROLES, TRIP_WRITE_ROLES } from '../constants/trip-roles.constants';
import { CreateLocationDto } from '../dto/create-location.dto';
import { FindLocationsQueryDto } from '../dto/find-locations-query.dto';
import { LocationEntity } from '../entities/location.entity';
import { PaginatedLocationsEntity } from '../entities/paginated-locations.entity';
import { LocationsService } from '../services/locations.service';

// Cadastro minimo de locais (pre-requisito de Trip.origin/destination).
// Gestao completa (editar/geolocalizacao) fica para uma fase dedicada.
@ApiTags('locations')
@ApiBearerAuth()
@Controller('locations')
export class LocationsController {
  constructor(
    private readonly locationsService: LocationsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({ summary: 'Lista locais da empresa (busca, filtro por tipo, paginacao).' })
  @ApiOkResponse({ type: PaginatedLocationsEntity })
  findAll(@Query() query: FindLocationsQueryDto): Promise<PaginatedLocationsEntity> {
    return this.locationsService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({ summary: 'Consulta um local da empresa.' })
  @ApiOkResponse({ type: LocationEntity })
  @ApiNotFoundResponse({ description: 'Local nao encontrado nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<LocationEntity> {
    return this.locationsService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Post()
  @Roles(...TRIP_WRITE_ROLES)
  @ApiOperation({
    summary: 'Cadastra um local (fabrica, CD, porto, terminal, cliente, filial...).',
  })
  @ApiCreatedResponse({ type: LocationEntity })
  create(@Body() dto: CreateLocationDto): Promise<LocationEntity> {
    return this.locationsService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
