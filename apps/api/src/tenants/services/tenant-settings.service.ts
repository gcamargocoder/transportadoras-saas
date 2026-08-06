import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateTenantSettingsDto } from '../dto/update-tenant-settings.dto';
import { TenantSettingsEntity } from '../entities/tenant-settings.entity';
import { toTenantSettingsEntity } from '../mappers/tenant.mapper';

// Endpoints dedicados GET/PATCH /tenant-settings -- sempre a empresa do
// usuario autenticado (mesmo escopo de PATCH /tenants/me, so que expondo
// APENAS as configuracoes, num recurso REST proprio).
@Injectable()
export class TenantSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findOwn(tenantId: string): Promise<TenantSettingsEntity> {
    const settings = await this.prisma.tenantSettings.findUnique({ where: { tenantId } });
    if (!settings) {
      throw new NotFoundException('Configuracoes nao encontradas para esta empresa.');
    }
    return toTenantSettingsEntity(settings);
  }

  async updateOwn(
    tenantId: string,
    dto: UpdateTenantSettingsDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TenantSettingsEntity> {
    const before = await this.prisma.tenantSettings.findUnique({ where: { tenantId } });
    if (!before) {
      throw new NotFoundException('Configuracoes nao encontradas para esta empresa.');
    }

    const { preferences, ...rest } = dto;
    const settings = await this.prisma.tenantSettings.update({
      where: { tenantId },
      data: {
        ...rest,
        ...(preferences !== undefined ? { preferences: preferences as Prisma.InputJsonValue } : {}),
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'tenant_settings.updated',
      entityName: 'TenantSettings',
      entityId: settings.id,
      previousValue: toJsonSafe(before),
      newValue: toJsonSafe(settings),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTenantSettingsEntity(settings);
  }
}
