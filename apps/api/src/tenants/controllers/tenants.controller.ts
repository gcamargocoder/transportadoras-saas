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
  Req,
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
import { Throttle } from '@nestjs/throttler';
import { Tenant, UserRole } from '@prisma/client';
import { Request } from 'express';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { extractRequestMetadata } from '../../auth/utils/request-metadata.util';
import { PaginatedAuditLogEntity } from '../../audit/entities/paginated-audit-log.entity';
import { ADMIN_THROTTLE, CRITICAL_THROTTLE } from '../../common/constants/throttle.constants';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { TenantContext } from '../context/tenant-context';
import { CurrentTenant } from '../decorators/current-tenant.decorator';
import { ChangeTenantStatusDto } from '../dto/change-tenant-status.dto';
import { CreateTenantDto } from '../dto/create-tenant.dto';
import { FindTenantsQueryDto } from '../dto/find-tenants-query.dto';
import { UpdateTenantFullDto } from '../dto/update-tenant-full.dto';
import { UpdateTenantPlanDto } from '../dto/update-tenant-plan.dto';
import { UpdateTenantStatusDto } from '../dto/update-tenant-status.dto';
import { UpdateTenantDto } from '../dto/update-tenant.dto';
import { PaginatedTenantsEntity } from '../entities/paginated-tenants.entity';
import { PlatformDashboardEntity } from '../entities/platform-dashboard.entity';
import { TenantEntity } from '../entities/tenant.entity';
import { TenantUsageEntity } from '../entities/tenant-usage.entity';
import { TenantsService } from '../services/tenants.service';

@ApiTags('tenants')
@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Public()
  @Post()
  @ApiOperation({
    summary: 'Cadastra uma nova transportadora (tenant) e seu administrador inicial.',
    description:
      'Rota publica (self-service signup). Cria Tenant + TenantSettings padrao + o primeiro UserAccount ' +
      '(role ADMIN) numa unica transacao. O admin criado faz login normalmente depois via POST /auth/login ' +
      '(tenantId + email + password).',
  })
  @ApiCreatedResponse({ type: TenantEntity })
  @ApiConflictResponse({ description: 'CNPJ ou slug ja cadastrados.' })
  create(@Body() dto: CreateTenantDto, @Req() request: Request): Promise<TenantEntity> {
    return this.tenantsService.create(dto, extractRequestMetadata(request));
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retorna os dados/configuracoes da empresa do usuario autenticado.' })
  @ApiOkResponse({ type: TenantEntity })
  findOwn(@CurrentTenant() tenant: Tenant): Promise<TenantEntity> {
    return this.tenantsService.findOwn(tenant.id);
  }

  @Patch('me')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Atualiza os dados/configuracoes da empresa do usuario autenticado.' })
  @ApiOkResponse({ type: TenantEntity })
  updateOwn(
    @CurrentTenant() tenant: Tenant,
    @Body() dto: UpdateTenantDto,
    @CurrentUser('sub') userId: string,
    @Req() request: Request,
  ): Promise<TenantEntity> {
    return this.tenantsService.updateOwn(tenant.id, dto, userId, extractRequestMetadata(request));
  }

  @Patch('me/status')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ativa ou desativa a empresa do usuario autenticado.' })
  @ApiOkResponse({ type: TenantEntity })
  updateOwnStatus(
    @CurrentTenant() tenant: Tenant,
    @Body() dto: UpdateTenantStatusDto,
    @CurrentUser('sub') userId: string,
    @Req() request: Request,
  ): Promise<TenantEntity> {
    return this.tenantsService.updateOwnStatus(
      tenant.id,
      dto,
      userId,
      extractRequestMetadata(request),
    );
  }

  // ==========================================================================
  // Administrativo (SUPER_ADMIN) -- cross-tenant. Declarados DEPOIS das
  // rotas "me" de proposito: ":id" e um segmento generico e precisa vir
  // depois de rotas literais ("me", "me/status") para nao interceptar
  // "/tenants/me" como se "me" fosse um :id.
  // ==========================================================================

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  @Throttle(ADMIN_THROTTLE)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Super Admin] Lista todas as transportadoras da plataforma.' })
  @ApiOkResponse({ type: PaginatedTenantsEntity })
  findAll(@Query() query: FindTenantsQueryDto): Promise<PaginatedTenantsEntity> {
    return this.tenantsService.findAll(query);
  }

  // Fase 47 -- "dashboard" precisa vir ANTES de ":id" pelo mesmo motivo
  // documentado acima para "me"/"me/status": ":id" e generico e
  // capturaria "dashboard" como se fosse um uuid.
  @Get('dashboard')
  @Roles(UserRole.SUPER_ADMIN)
  @Throttle(ADMIN_THROTTLE)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '[Super Admin] Dashboard global da plataforma: total de transportadoras por status, ' +
      'total de usuarios/veiculos/motoristas, distribuicao por plano e atividade recente (30 dias).',
  })
  @ApiOkResponse({ type: PlatformDashboardEntity })
  getPlatformDashboard(): Promise<PlatformDashboardEntity> {
    return this.tenantsService.getPlatformDashboard();
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @Throttle(ADMIN_THROTTLE)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Super Admin] Consulta qualquer transportadora por id.' })
  @ApiOkResponse({ type: TenantEntity })
  @ApiNotFoundResponse({ description: 'Tenant nao encontrado.' })
  findById(@Param('id', ParseUUIDPipe) id: string): Promise<TenantEntity> {
    return this.tenantsService.findById(id);
  }

  @Get(':id/usage')
  @Roles(UserRole.SUPER_ADMIN)
  @Throttle(ADMIN_THROTTLE)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '[Super Admin] Utilizacao real da transportadora: usuarios, motoristas, veiculos, viagens, ' +
      'checklists, abastecimentos, manutencoes e anexos (proxy de armazenamento).',
  })
  @ApiOkResponse({ type: TenantUsageEntity })
  @ApiNotFoundResponse({ description: 'Tenant nao encontrado.' })
  getUsage(@Param('id', ParseUUIDPipe) id: string): Promise<TenantUsageEntity> {
    return this.tenantsService.getUsage(id);
  }

  @Get(':id/history')
  @Roles(UserRole.SUPER_ADMIN)
  @Throttle(ADMIN_THROTTLE)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Super Admin] Historico de auditoria da transportadora (quem, quando, IP, antes/depois).' })
  @ApiOkResponse({ type: PaginatedAuditLogEntity })
  @ApiNotFoundResponse({ description: 'Tenant nao encontrado.' })
  getHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedAuditLogEntity> {
    return this.tenantsService.getHistory(id, query);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @Throttle(ADMIN_THROTTLE)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '[Super Admin] Edita qualquer transportadora (inclusive CNPJ/slug/status).',
  })
  @ApiOkResponse({ type: TenantEntity })
  @ApiNotFoundResponse({ description: 'Tenant nao encontrado.' })
  @ApiConflictResponse({ description: 'CNPJ ou slug ja cadastrados em outra empresa.' })
  updateById(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantFullDto,
    @CurrentUser('sub') userId: string,
    @Req() request: Request,
  ): Promise<TenantEntity> {
    return this.tenantsService.updateById(id, dto, { userId }, extractRequestMetadata(request));
  }

  @Patch(':id/status')
  @Roles(UserRole.SUPER_ADMIN)
  @Throttle(ADMIN_THROTTLE)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '[Super Admin] Altera o status de ciclo de vida da transportadora (ACTIVE/TRIAL/SUSPENDED/EXPIRED). ' +
      'SUSPENDED/EXPIRED bloqueiam o acesso (isActive=false); ACTIVE/TRIAL liberam.',
  })
  @ApiOkResponse({ type: TenantEntity })
  @ApiNotFoundResponse({ description: 'Tenant nao encontrado.' })
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeTenantStatusDto,
    @CurrentUser('sub') userId: string,
    @Req() request: Request,
  ): Promise<TenantEntity> {
    return this.tenantsService.changeStatus(id, dto, { userId }, extractRequestMetadata(request));
  }

  @Patch(':id/plan')
  @Roles(UserRole.SUPER_ADMIN)
  @Throttle(ADMIN_THROTTLE)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '[Super Admin] Atualiza plano/limites/modulos habilitados da transportadora (atualizacao parcial).',
  })
  @ApiOkResponse({ type: TenantEntity })
  @ApiNotFoundResponse({ description: 'Tenant nao encontrado.' })
  updatePlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantPlanDto,
    @CurrentUser('sub') userId: string,
    @Req() request: Request,
  ): Promise<TenantEntity> {
    return this.tenantsService.updatePlan(id, dto, { userId }, extractRequestMetadata(request));
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @Throttle(CRITICAL_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '[Super Admin] Exclui uma transportadora -- somente se nao houver usuarios, motoristas, veiculos ou viagens.',
  })
  @ApiNoContentResponse({ description: 'Tenant excluido.' })
  @ApiNotFoundResponse({ description: 'Tenant nao encontrado.' })
  @ApiConflictResponse({ description: 'Existem registros vinculados a esta empresa.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') userId: string,
    @Req() request: Request,
  ): Promise<void> {
    await this.tenantsService.deleteById(
      id,
      this.tenantContext.requireTenantId(),
      { userId },
      extractRequestMetadata(request),
    );
  }
}
