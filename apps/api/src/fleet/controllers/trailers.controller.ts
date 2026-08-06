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
import { FLEET_READ_ROLES, FLEET_WRITE_ROLES } from '../constants/fleet-roles.constants';
import { CreateTrailerDto } from '../dto/create-trailer.dto';
import { FindTrailersQueryDto } from '../dto/find-trailers-query.dto';
import { UpdateTrailerStatusDto } from '../dto/update-trailer-status.dto';
import { UpdateTrailerDto } from '../dto/update-trailer.dto';
import { PaginatedTrailersEntity } from '../entities/paginated-trailers.entity';
import { TrailerEntity } from '../entities/trailer.entity';
import { TrailersService } from '../services/trailers.service';

@ApiTags('trailers')
@ApiBearerAuth()
@Controller('trailers')
export class TrailersController {
  constructor(
    private readonly trailersService: TrailersService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({
    summary: 'Lista implementos da empresa (busca, filtro por tipo/status, paginacao, ordenacao).',
  })
  @ApiOkResponse({ type: PaginatedTrailersEntity })
  findAll(@Query() query: FindTrailersQueryDto): Promise<PaginatedTrailersEntity> {
    return this.trailersService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({ summary: 'Consulta um implemento da empresa.' })
  @ApiOkResponse({ type: TrailerEntity })
  @ApiNotFoundResponse({ description: 'Implemento nao encontrado nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<TrailerEntity> {
    return this.trailersService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Post()
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Cadastra um implemento (carreta, bitrem, rodotrem, vanderleia, reboque, semirreboque, dolly).',
  })
  @ApiCreatedResponse({ type: TrailerEntity })
  @ApiConflictResponse({ description: 'Ja existe um implemento com esta placa nesta empresa.' })
  create(@Body() dto: CreateTrailerDto): Promise<TrailerEntity> {
    return this.trailersService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({ summary: 'Atualiza dados de um implemento.' })
  @ApiOkResponse({ type: TrailerEntity })
  @ApiNotFoundResponse({ description: 'Implemento nao encontrado nesta empresa.' })
  @ApiConflictResponse({ description: 'Ja existe um implemento com esta placa nesta empresa.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTrailerDto,
  ): Promise<TrailerEntity> {
    return this.trailersService.update(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id/status')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({ summary: 'Ativa ou desativa um implemento.' })
  @ApiOkResponse({ type: TrailerEntity })
  @ApiNotFoundResponse({ description: 'Implemento nao encontrado nesta empresa.' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTrailerStatusDto,
  ): Promise<TrailerEntity> {
    return this.trailersService.updateStatus(
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
  @ApiOperation({ summary: 'Exclui logicamente um implemento.' })
  @ApiNoContentResponse({ description: 'Implemento excluido.' })
  @ApiNotFoundResponse({ description: 'Implemento nao encontrado nesta empresa.' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.trailersService.softDelete(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
