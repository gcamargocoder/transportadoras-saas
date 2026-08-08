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
  Put,
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
import { TOLL_READ_ROLES, TOLL_WRITE_ROLES } from '../../tolls/constants/toll-roles.constants';
import { CreateTollRouteDto } from '../dto/create-toll-route.dto';
import { FindTollRoutesQueryDto } from '../dto/find-toll-routes-query.dto';
import { ReplaceTollRouteStopsDto } from '../dto/replace-toll-route-stops.dto';
import { UpdateTollRouteStatusDto } from '../dto/update-toll-route-status.dto';
import { UpdateTollRouteDto } from '../dto/update-toll-route.dto';
import { PaginatedTollRoutesEntity } from '../entities/paginated-toll-routes.entity';
import { TollReconciliationDashboardEntity } from '../entities/toll-reconciliation-dashboard.entity';
import { TollRouteEntity } from '../entities/toll-route.entity';
import { TollReconciliationService } from '../services/toll-reconciliation.service';
import { TollRoutesService } from '../services/toll-routes.service';

// Rota de pedagio (Fase 23) -- corredor operacional do TENANT (distinto de
// TollPlaza, que e dado global). Mesma politica de RBAC ja usada para
// transacoes de pedagio (TOLL_READ_ROLES/TOLL_WRITE_ROLES), reaproveitada
// sem criar roles novas.
@ApiTags('toll-routes')
@ApiBearerAuth()
@Controller('toll-routes')
export class TollRoutesController {
  constructor(
    private readonly tollRoutesService: TollRoutesService,
    private readonly tollReconciliationService: TollReconciliationService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...TOLL_READ_ROLES)
  @ApiOperation({
    summary: 'Lista rotas de pedagio da empresa (busca, filtro por status, paginacao).',
  })
  @ApiOkResponse({ type: PaginatedTollRoutesEntity })
  findAll(@Query() query: FindTollRoutesQueryDto): Promise<PaginatedTollRoutesEntity> {
    return this.tollRoutesService.findAll(this.tenantContext.requireTenantId(), query);
  }

  // Registrado ANTES de ':id' -- senao 'dashboard' seria interpretado como
  // o parametro de rota :id.
  @Get('dashboard')
  @Roles(...TOLL_READ_ROLES)
  @ApiOperation({
    summary:
      'Conciliacao agregada de TODAS as viagens da empresa com rota de pedagio vinculada ' +
      '(viagens sem rota, sem conciliacao aplicavel, ficam de fora).',
  })
  @ApiOkResponse({ type: TollReconciliationDashboardEntity })
  getReconciliationDashboard(): Promise<TollReconciliationDashboardEntity> {
    return this.tollReconciliationService.getDashboard(this.tenantContext.requireTenantId());
  }

  @Get(':id')
  @Roles(...TOLL_READ_ROLES)
  @ApiOperation({
    summary: 'Consulta uma rota de pedagio (com as paradas/pracas esperadas, em ordem).',
  })
  @ApiOkResponse({ type: TollRouteEntity })
  @ApiNotFoundResponse({ description: 'Rota nao encontrada nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<TollRouteEntity> {
    return this.tollRoutesService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Post()
  @Roles(...TOLL_WRITE_ROLES)
  @ApiOperation({
    summary: 'Cria uma rota de pedagio (nasce sem paradas -- adicione via PUT /:id/stops).',
  })
  @ApiCreatedResponse({ type: TollRouteEntity })
  create(@Body() dto: CreateTollRouteDto): Promise<TollRouteEntity> {
    return this.tollRoutesService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id')
  @Roles(...TOLL_WRITE_ROLES)
  @ApiOperation({ summary: 'Atualiza nome/origem/destino de uma rota de pedagio.' })
  @ApiOkResponse({ type: TollRouteEntity })
  @ApiNotFoundResponse({ description: 'Rota nao encontrada nesta empresa.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTollRouteDto,
  ): Promise<TollRouteEntity> {
    return this.tollRoutesService.update(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id/status')
  @Roles(...TOLL_WRITE_ROLES)
  @ApiOperation({ summary: 'Ativa ou desativa a rota (nao exclui).' })
  @ApiOkResponse({ type: TollRouteEntity })
  @ApiNotFoundResponse({ description: 'Rota nao encontrada nesta empresa.' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTollRouteStatusDto,
  ): Promise<TollRouteEntity> {
    return this.tollRoutesService.updateStatus(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Put(':id/stops')
  @Roles(...TOLL_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Substitui a lista inteira de paradas (pracas esperadas) da rota, na ordem do array ' +
      'enviado -- usado tanto para adicionar/remover quanto para reordenar pracas.',
  })
  @ApiOkResponse({ type: TollRouteEntity })
  @ApiNotFoundResponse({ description: 'Rota ou alguma praca nao encontrada.' })
  @ApiConflictResponse({ description: 'Praca repetida na mesma rota.' })
  replaceStops(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceTollRouteStopsDto,
  ): Promise<TollRouteEntity> {
    return this.tollRoutesService.replaceStops(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Delete(':id')
  @Roles(...TOLL_WRITE_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui uma rota de pedagio (bloqueado se houver viagens vinculadas).' })
  @ApiNoContentResponse({ description: 'Rota removida.' })
  @ApiNotFoundResponse({ description: 'Rota nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'Existem viagens vinculadas a esta rota.' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.tollRoutesService.remove(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
