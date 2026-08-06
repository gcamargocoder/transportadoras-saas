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
import { CreateTripCompositionDto } from '../dto/create-trip-composition.dto';
import { FindTripCompositionsQueryDto } from '../dto/find-trip-compositions-query.dto';
import { UpdateTripCompositionDto } from '../dto/update-trip-composition.dto';
import { UpsertAxleConfigurationDto } from '../dto/upsert-axle-configuration.dto';
import { PaginatedTripCompositionsEntity } from '../entities/paginated-trip-compositions.entity';
import { TripCompositionEntity } from '../entities/trip-composition.entity';
import { TripCompositionsService } from '../services/trip-compositions.service';

// Composicao de frota (cavalo + implementos + eixos), independente de
// viagem (ver comentario em schema.prisma/TripComposition). Nenhuma
// interface operacional de viagem e exposta aqui, conforme escopo desta fase.
@ApiTags('trip-compositions')
@ApiBearerAuth()
@Controller('trip-compositions')
export class TripCompositionsController {
  constructor(
    private readonly tripCompositionsService: TripCompositionsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({
    summary: 'Lista composicoes de frota da empresa (paginado, filtro por veiculo).',
  })
  @ApiOkResponse({ type: PaginatedTripCompositionsEntity })
  findAll(@Query() query: FindTripCompositionsQueryDto): Promise<PaginatedTripCompositionsEntity> {
    return this.tripCompositionsService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({
    summary: 'Consulta uma composicao (veiculo + implementos ordenados + config de eixos).',
  })
  @ApiOkResponse({ type: TripCompositionEntity })
  @ApiNotFoundResponse({ description: 'Composicao nao encontrada nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<TripCompositionEntity> {
    return this.tripCompositionsService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Post()
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Monta uma composicao: cavalo mecanico + implementos (em ordem) + config de eixos (opcionais).',
  })
  @ApiCreatedResponse({ type: TripCompositionEntity })
  @ApiNotFoundResponse({
    description: 'Veiculo ou algum implemento nao encontrados nesta empresa.',
  })
  create(@Body() dto: CreateTripCompositionDto): Promise<TripCompositionEntity> {
    return this.tripCompositionsService.create(
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
      'Atualiza o veiculo e/ou substitui integralmente a lista de implementos da composicao.',
  })
  @ApiOkResponse({ type: TripCompositionEntity })
  @ApiNotFoundResponse({ description: 'Composicao, veiculo ou algum implemento nao encontrados.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTripCompositionDto,
  ): Promise<TripCompositionEntity> {
    return this.tripCompositionsService.update(
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
  @ApiOperation({
    summary: 'Remove uma composicao (e seus implementos/config de eixos, em cascata).',
  })
  @ApiNoContentResponse({ description: 'Composicao removida.' })
  @ApiNotFoundResponse({ description: 'Composicao nao encontrada nesta empresa.' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.tripCompositionsService.remove(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id/axle-configuration')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Cria ou substitui a configuracao de eixos da composicao (pertence a composicao, nunca ao veiculo).',
  })
  @ApiOkResponse({ type: TripCompositionEntity })
  @ApiNotFoundResponse({ description: 'Composicao nao encontrada nesta empresa.' })
  upsertAxleConfiguration(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertAxleConfigurationDto,
  ): Promise<TripCompositionEntity> {
    return this.tripCompositionsService.upsertAxleConfiguration(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
