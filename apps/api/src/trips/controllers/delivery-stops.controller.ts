import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantModule } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import { TRIP_READ_ROLES } from '../constants/trip-roles.constants';
import { FindDeliveryStopsQueryDto } from '../dto/find-delivery-stops-query.dto';
import { DeliveryStopsDashboardEntity } from '../entities/delivery-stops-dashboard.entity';
import { PaginatedDeliveryStopsEntity } from '../entities/paginated-delivery-stops.entity';
import { TripDeliveryStopsService } from '../services/trip-delivery-stops.service';

// Fase 99 -- visao operacional CROSS-TRIP das entregas (Gestao de
// Entregas), distinta de GET /trips/:id/delivery-stops (Fase 88, escopada a
// UMA viagem). Reaproveita integralmente TripDeliveryStopsService -- nenhuma
// segunda fonte/logica de leitura.
@ApiTags('delivery-stops')
@ApiBearerAuth()
@RequireModule(TenantModule.TRIPS)
@Controller('delivery-stops')
export class DeliveryStopsController {
  constructor(
    private readonly tripDeliveryStopsService: TripDeliveryStopsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({
    summary:
      'Lista entregas (paradas planejadas) de TODAS as viagens do tenant, com busca/filtros/paginacao ' +
      'server-side. Distinta da listagem por viagem (GET /trips/:id/delivery-stops).',
  })
  @ApiOkResponse({ type: PaginatedDeliveryStopsEntity })
  findAll(@Query() query: FindDeliveryStopsQueryDto): Promise<PaginatedDeliveryStopsEntity> {
    return this.tripDeliveryStopsService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get('dashboard')
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({ summary: 'Resumo operacional das entregas: contagem por status e quantidade atrasada.' })
  @ApiOkResponse({ type: DeliveryStopsDashboardEntity })
  getDashboard(@Query() query: FindDeliveryStopsQueryDto): Promise<DeliveryStopsDashboardEntity> {
    return this.tripDeliveryStopsService.getDashboard(this.tenantContext.requireTenantId(), query);
  }
}
