import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTagProviderDto } from '../dto/create-tag-provider.dto';
import { UpdateTagProviderStatusDto } from '../dto/update-tag-provider-status.dto';
import { UpdateTagProviderDto } from '../dto/update-tag-provider.dto';
import { TagProviderEntity } from '../entities/tag-provider.entity';
import { toTagProviderEntity } from '../mappers/vehicle-tag.mapper';

// TagProvider e dado de referencia GLOBAL (sem tenantId) -- nao ha
// isolamento multi-tenant a aplicar aqui, so autenticacao. Escrita
// restrita a SUPER_ADMIN (ver constants/fleet-roles.constants.ts),
// leitura aberta a qualquer usuario autenticado.
//
// actorTenantId: AuditLog.tenantId e obrigatorio no schema (toda tabela
// operacional carrega tenant_id) -- como TagProvider nao pertence a
// nenhum tenant, gravamos o log com a empresa do PROPRIO ATOR (SUPER_ADMIN),
// mesmo padrao ja usado em TenantsService.deleteById (Fase 8).
@Injectable()
export class TagProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(): Promise<TagProviderEntity[]> {
    const providers = await this.prisma.tagProvider.findMany({ orderBy: { name: 'asc' } });
    return providers.map(toTagProviderEntity);
  }

  async findOne(id: string): Promise<TagProviderEntity> {
    return toTagProviderEntity(await this.findOrThrow(id));
  }

  async create(
    dto: CreateTagProviderDto,
    actorTenantId: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TagProviderEntity> {
    const existing = await this.prisma.tagProvider.findUnique({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException('Ja existe uma operadora com este nome.');
    }

    const provider = await this.prisma.tagProvider.create({
      data: {
        name: dto.name,
        ...compact({ website: dto.website, phone: dto.phone, notes: dto.notes }),
      },
    });

    await this.audit.log({
      tenantId: actorTenantId,
      userId: actor.userId,
      action: 'tag_provider.created',
      entityName: 'TagProvider',
      entityId: provider.id,
      newValue: toJsonSafe({ name: provider.name }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTagProviderEntity(provider);
  }

  async update(
    id: string,
    dto: UpdateTagProviderDto,
    actorTenantId: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TagProviderEntity> {
    const before = await this.findOrThrow(id);

    if (dto.name && dto.name !== before.name) {
      const existing = await this.prisma.tagProvider.findUnique({ where: { name: dto.name } });
      if (existing) {
        throw new ConflictException('Ja existe uma operadora com este nome.');
      }
    }

    const provider = await this.prisma.tagProvider.update({
      where: { id },
      data: compact({ name: dto.name, website: dto.website, phone: dto.phone, notes: dto.notes }),
    });

    await this.audit.log({
      tenantId: actorTenantId,
      userId: actor.userId,
      action: 'tag_provider.updated',
      entityName: 'TagProvider',
      entityId: id,
      previousValue: toJsonSafe(before),
      newValue: toJsonSafe(provider),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTagProviderEntity(provider);
  }

  async updateStatus(
    id: string,
    dto: UpdateTagProviderStatusDto,
    actorTenantId: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TagProviderEntity> {
    const before = await this.findOrThrow(id);

    const provider = await this.prisma.tagProvider.update({
      where: { id },
      data: { isActive: dto.isActive },
    });

    await this.audit.log({
      tenantId: actorTenantId,
      userId: actor.userId,
      action: 'tag_provider.status_changed',
      entityName: 'TagProvider',
      entityId: id,
      previousValue: { isActive: before.isActive },
      newValue: { isActive: provider.isActive },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTagProviderEntity(provider);
  }

  async remove(
    id: string,
    actorTenantId: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<void> {
    const before = await this.findOrThrow(id);

    const [tagUsageCount, importJobUsageCount] = await Promise.all([
      this.prisma.vehicleTag.count({ where: { tagProviderId: id } }),
      this.prisma.importJob.count({ where: { providerId: id } }),
    ]);
    if (tagUsageCount > 0) {
      throw new ConflictException(
        `Nao e possivel excluir esta operadora: existem ${tagUsageCount} tag(s) vinculada(s) a ela ` +
          '(em qualquer empresa). Remova ou reatribua essas tags antes de excluir.',
      );
    }
    if (importJobUsageCount > 0) {
      throw new ConflictException(
        `Nao e possivel excluir esta operadora: existem ${importJobUsageCount} importacao(oes) de ` +
          'extrato vinculada(s) a ela (em qualquer empresa).',
      );
    }

    await this.prisma.tagProvider.delete({ where: { id } });

    await this.audit.log({
      tenantId: actorTenantId,
      userId: actor.userId,
      action: 'tag_provider.deleted',
      entityName: 'TagProvider',
      entityId: id,
      previousValue: toJsonSafe({ name: before.name }),
      newValue: null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  private async findOrThrow(id: string) {
    const provider = await this.prisma.tagProvider.findUnique({ where: { id } });
    if (!provider) {
      throw new NotFoundException('Operadora de tag nao encontrada.');
    }
    return provider;
  }
}
