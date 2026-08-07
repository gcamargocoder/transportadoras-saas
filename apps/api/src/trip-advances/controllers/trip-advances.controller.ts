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
  TRIP_ADVANCE_READ_ROLES,
  TRIP_ADVANCE_WRITE_ROLES,
} from '../constants/trip-advance-roles.constants';
import { CreateTripAdvanceDto } from '../dto/create-trip-advance.dto';
import { FindTripAdvancesQueryDto } from '../dto/find-trip-advances-query.dto';
import { UpdateTripAdvanceDto } from '../dto/update-trip-advance.dto';
import { PaginatedTripAdvancesEntity } from '../entities/paginated-trip-advances.entity';
import { TripAdvanceEntity } from '../entities/trip-advance.entity';
import { TripAdvancesService } from '../services/trip-advances.service';

@ApiTags('trip-advances')
@ApiBearerAuth()
@Controller('trip-advances')
export class TripAdvancesController {
  constructor(
    private readonly tripAdvancesService: TripAdvancesService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...TRIP_ADVANCE_READ_ROLES)
  @ApiOperation({
    summary:
      'Lista adiantamentos de viagem da empresa (filtro por viagem/motorista/forma de ' +
      'pagamento/periodo/faixa de valor, paginacao, ordenacao).',
  })
  @ApiOkResponse({ type: PaginatedTripAdvancesEntity })
  findAll(@Query() query: FindTripAdvancesQueryDto): Promise<PaginatedTripAdvancesEntity> {
    return this.tripAdvancesService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...TRIP_ADVANCE_READ_ROLES)
  @ApiOperation({ summary: 'Consulta um adiantamento de viagem.' })
  @ApiOkResponse({ type: TripAdvanceEntity })
  @ApiNotFoundResponse({ description: 'Adiantamento nao encontrado nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<TripAdvanceEntity> {
    return this.tripAdvancesService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Post()
  @Roles(...TRIP_ADVANCE_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Registra um adiantamento pago ao motorista da viagem. O motorista e sempre derivado ' +
      'da viagem, nunca aceito do cliente.',
  })
  @ApiCreatedResponse({ type: TripAdvanceEntity })
  @ApiNotFoundResponse({ description: 'Viagem ou attachment nao encontrados nesta empresa.' })
  @ApiConflictResponse({ description: 'Viagem sem motorista vinculado.' })
  create(@Body() dto: CreateTripAdvanceDto): Promise<TripAdvanceEntity> {
    return this.tripAdvancesService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id')
  @Roles(...TRIP_ADVANCE_WRITE_ROLES)
  @ApiOperation({ summary: 'Atualiza um adiantamento de viagem.' })
  @ApiOkResponse({ type: TripAdvanceEntity })
  @ApiNotFoundResponse({ description: 'Adiantamento ou attachment nao encontrados nesta empresa.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTripAdvanceDto,
  ): Promise<TripAdvanceEntity> {
    return this.tripAdvancesService.update(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Delete(':id')
  @Roles(...TRIP_ADVANCE_WRITE_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui um adiantamento de viagem.' })
  @ApiNoContentResponse({ description: 'Adiantamento excluido.' })
  @ApiNotFoundResponse({ description: 'Adiantamento nao encontrado nesta empresa.' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.tripAdvancesService.remove(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
