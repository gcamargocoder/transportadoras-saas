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
import {
  TRIP_REVENUE_READ_ROLES,
  TRIP_REVENUE_WRITE_ROLES,
} from '../constants/trip-revenue-roles.constants';
import { CreateTripRevenueDto } from '../dto/create-trip-revenue.dto';
import { FindTripRevenuesQueryDto } from '../dto/find-trip-revenues-query.dto';
import { UpdateTripRevenueDto } from '../dto/update-trip-revenue.dto';
import { PaginatedTripRevenuesEntity } from '../entities/paginated-trip-revenues.entity';
import { TripRevenueEntity } from '../entities/trip-revenue.entity';
import { TripRevenuesService } from '../services/trip-revenues.service';

@ApiTags('trip-revenues')
@ApiBearerAuth()
@Controller('trip-revenues')
export class TripRevenuesController {
  constructor(
    private readonly tripRevenuesService: TripRevenuesService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...TRIP_REVENUE_READ_ROLES)
  @ApiOperation({
    summary:
      'Lista receitas de viagem da empresa (filtro por viagem/categoria/cliente/periodo/faixa ' +
      'de valor, paginacao, ordenacao).',
  })
  @ApiOkResponse({ type: PaginatedTripRevenuesEntity })
  findAll(@Query() query: FindTripRevenuesQueryDto): Promise<PaginatedTripRevenuesEntity> {
    return this.tripRevenuesService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...TRIP_REVENUE_READ_ROLES)
  @ApiOperation({ summary: 'Consulta uma receita de viagem.' })
  @ApiOkResponse({ type: TripRevenueEntity })
  @ApiNotFoundResponse({ description: 'Receita nao encontrada nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<TripRevenueEntity> {
    return this.tripRevenuesService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Post()
  @Roles(...TRIP_REVENUE_WRITE_ROLES)
  @ApiOperation({
    summary: 'Registra uma receita de viagem (frete, bonificacao, servico extra, seguro).',
  })
  @ApiCreatedResponse({ type: TripRevenueEntity })
  @ApiNotFoundResponse({
    description: 'Viagem, cliente ou attachment nao encontrados nesta empresa.',
  })
  create(@Body() dto: CreateTripRevenueDto): Promise<TripRevenueEntity> {
    return this.tripRevenuesService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id')
  @Roles(...TRIP_REVENUE_WRITE_ROLES)
  @ApiOperation({ summary: 'Atualiza uma receita de viagem.' })
  @ApiOkResponse({ type: TripRevenueEntity })
  @ApiNotFoundResponse({
    description: 'Receita, cliente ou attachment nao encontrados nesta empresa.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTripRevenueDto,
  ): Promise<TripRevenueEntity> {
    return this.tripRevenuesService.update(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Delete(':id')
  @Roles(...TRIP_REVENUE_WRITE_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui uma receita de viagem.' })
  @ApiNoContentResponse({ description: 'Receita excluida.' })
  @ApiNotFoundResponse({ description: 'Receita nao encontrada nesta empresa.' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.tripRevenuesService.remove(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
