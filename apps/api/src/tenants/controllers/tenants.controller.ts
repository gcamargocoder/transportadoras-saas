import { Body, Controller, Get, Patch, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Tenant, UserRole } from '@prisma/client';
import { Request } from 'express';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { extractRequestMetadata } from '../../auth/utils/request-metadata.util';
import { CurrentTenant } from '../decorators/current-tenant.decorator';
import { CreateTenantDto } from '../dto/create-tenant.dto';
import { UpdateTenantDto } from '../dto/update-tenant.dto';
import { UpdateTenantStatusDto } from '../dto/update-tenant-status.dto';
import { TenantEntity } from '../entities/tenant.entity';
import { TenantsService } from '../services/tenants.service';

@ApiTags('tenants')
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

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
}
