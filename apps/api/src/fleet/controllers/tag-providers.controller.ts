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
import { TenantModule, UserRole } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import { FLEET_READ_ROLES } from '../constants/fleet-roles.constants';
import { CreateTagProviderDto } from '../dto/create-tag-provider.dto';
import { UpdateTagProviderStatusDto } from '../dto/update-tag-provider-status.dto';
import { UpdateTagProviderDto } from '../dto/update-tag-provider.dto';
import { TagProviderEntity } from '../entities/tag-provider.entity';
import { TagProvidersService } from '../services/tag-providers.service';

// Dado de referencia GLOBAL (sem isolamento por tenant) -- leitura aberta a
// qualquer usuario autenticado (necessaria para escolher operadora em
// POST /vehicles/:id/tags); escrita restrita a SUPER_ADMIN, mesmo padrao de
// governanca ja usado para dados cross-tenant (ver TenantsController).
@ApiTags('tag-providers')
@ApiBearerAuth()
@Controller('tag-providers')
@RequireModule(TenantModule.TOLLS)
export class TagProvidersController {
  constructor(
    private readonly tagProvidersService: TagProvidersService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({
    summary:
      'Lista as operadoras de tag de pedagio disponiveis (Sem Parar, ConectCar, Veloe, Move Mais...).',
  })
  @ApiOkResponse({ type: TagProviderEntity, isArray: true })
  findAll(): Promise<TagProviderEntity[]> {
    return this.tagProvidersService.findAll();
  }

  @Get(':id')
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({ summary: 'Consulta uma operadora de tag de pedagio.' })
  @ApiOkResponse({ type: TagProviderEntity })
  @ApiNotFoundResponse({ description: 'Operadora nao encontrada.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<TagProviderEntity> {
    return this.tagProvidersService.findOne(id);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: '[Super Admin] Cadastra uma nova operadora de tag de pedagio.' })
  @ApiCreatedResponse({ type: TagProviderEntity })
  @ApiConflictResponse({ description: 'Ja existe uma operadora com este nome.' })
  create(@Body() dto: CreateTagProviderDto): Promise<TagProviderEntity> {
    return this.tagProvidersService.create(
      dto,
      this.tenantContext.requireTenantId(),
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: '[Super Admin] Atualiza dados de uma operadora de tag de pedagio.' })
  @ApiOkResponse({ type: TagProviderEntity })
  @ApiNotFoundResponse({ description: 'Operadora nao encontrada.' })
  @ApiConflictResponse({ description: 'Ja existe uma operadora com este nome.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTagProviderDto,
  ): Promise<TagProviderEntity> {
    return this.tagProvidersService.update(
      id,
      dto,
      this.tenantContext.requireTenantId(),
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id/status')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: '[Super Admin] Ativa ou desativa uma operadora de tag de pedagio.' })
  @ApiOkResponse({ type: TagProviderEntity })
  @ApiNotFoundResponse({ description: 'Operadora nao encontrada.' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTagProviderStatusDto,
  ): Promise<TagProviderEntity> {
    return this.tagProvidersService.updateStatus(
      id,
      dto,
      this.tenantContext.requireTenantId(),
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '[Super Admin] Exclui uma operadora -- somente se nao houver tags vinculadas.',
  })
  @ApiNoContentResponse({ description: 'Operadora excluida.' })
  @ApiNotFoundResponse({ description: 'Operadora nao encontrada.' })
  @ApiConflictResponse({ description: 'Existem tags vinculadas a esta operadora.' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.tagProvidersService.remove(
      id,
      this.tenantContext.requireTenantId(),
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
