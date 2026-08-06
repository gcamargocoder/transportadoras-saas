import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TenantContext } from '../context/tenant-context';
import { UpdateTenantSettingsDto } from '../dto/update-tenant-settings.dto';
import { TenantSettingsEntity } from '../entities/tenant-settings.entity';
import { TenantSettingsService } from '../services/tenant-settings.service';

// Recurso REST dedicado as configuracoes (distinto de /tenants/me, que
// retorna o tenant inteiro com settings aninhado). Sempre escopado a
// empresa do usuario autenticado via TenantContext.
@ApiTags('tenant-settings')
@ApiBearerAuth()
@Controller('tenant-settings')
export class TenantSettingsController {
  constructor(
    private readonly tenantSettingsService: TenantSettingsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Retorna as configuracoes da empresa do usuario autenticado.' })
  @ApiOkResponse({ type: TenantSettingsEntity })
  @ApiNotFoundResponse({ description: 'Configuracoes nao encontradas para esta empresa.' })
  findOwn(): Promise<TenantSettingsEntity> {
    return this.tenantSettingsService.findOwn(this.tenantContext.requireTenantId());
  }

  @Patch()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Atualiza as configuracoes da empresa do usuario autenticado.' })
  @ApiOkResponse({ type: TenantSettingsEntity })
  @ApiNotFoundResponse({ description: 'Configuracoes nao encontradas para esta empresa.' })
  updateOwn(
    @Body() dto: UpdateTenantSettingsDto,
    @CurrentUser('sub') userId: string,
  ): Promise<TenantSettingsEntity> {
    return this.tenantSettingsService.updateOwn(
      this.tenantContext.requireTenantId(),
      dto,
      { userId },
      this.tenantContext.requestMetadata,
    );
  }
}
