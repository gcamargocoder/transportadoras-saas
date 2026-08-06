import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { hashPassword } from '../../auth/utils/password.util';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTenantDto } from '../dto/create-tenant.dto';
import { FindTenantsQueryDto } from '../dto/find-tenants-query.dto';
import { UpdateTenantFullDto } from '../dto/update-tenant-full.dto';
import { UpdateTenantStatusDto } from '../dto/update-tenant-status.dto';
import { UpdateTenantDto } from '../dto/update-tenant.dto';
import { PaginatedTenantsEntity } from '../entities/paginated-tenants.entity';
import { TenantEntity } from '../entities/tenant.entity';
import { hasAnyRelationship } from '../interfaces/tenant-relationship-counts.interface';
import { toTenantEntity } from '../mappers/tenant.mapper';
import { TenantsRepository } from '../repositories/tenants.repository';
import { slugify } from '../utils/slugify.util';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenantsRepository: TenantsRepository,
  ) {}

  // Cria Tenant + TenantSettings (padrao) + primeiro usuario ADMIN numa
  // unica transacao -- ou tudo e criado, ou nada e (evita empresa "orfa"
  // sem administrador, ou administrador sem empresa).
  async create(dto: CreateTenantDto, metadata: RequestMetadata): Promise<TenantEntity> {
    const slug = dto.slug ?? slugify(dto.name);
    if (!slug) {
      throw new ConflictException(
        'Nao foi possivel gerar um slug valido a partir do nome informado.',
      );
    }

    const [existingDocument, existingSlug] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { document: dto.document } }),
      this.prisma.tenant.findUnique({ where: { slug } }),
    ]);

    if (existingDocument) {
      throw new ConflictException('Ja existe uma empresa cadastrada com este CNPJ.');
    }
    if (existingSlug) {
      throw new ConflictException(
        dto.slug
          ? 'Ja existe uma empresa com este identificador (slug).'
          : 'Nao foi possivel gerar um slug unico a partir do nome informado -- informe um "slug" explicito.',
      );
    }

    const passwordHash = await hashPassword(dto.admin.password);

    const created = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.name,
          document: dto.document,
          slug,
          ...compact({ tradeName: dto.tradeName, logoUrl: dto.logoUrl }),
        },
      });

      await tx.tenantSettings.create({ data: { tenantId: tenant.id } });

      const adminUser = await tx.userAccount.create({
        data: {
          tenantId: tenant.id,
          name: dto.admin.name,
          email: dto.admin.email,
          passwordHash,
          role: UserRole.ADMIN,
          isActive: true,
        },
      });

      return { tenant, adminUser };
    });

    await this.audit.log({
      tenantId: created.tenant.id,
      userId: created.adminUser.id,
      action: 'tenant.created',
      entityName: 'Tenant',
      entityId: created.tenant.id,
      newValue: toJsonSafe({
        name: created.tenant.name,
        document: created.tenant.document,
        slug: created.tenant.slug,
        adminEmail: created.adminUser.email,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return this.findOwn(created.tenant.id);
  }

  async findOwn(tenantId: string): Promise<TenantEntity> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { settings: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant nao encontrado.');
    }
    return toTenantEntity(tenant);
  }

  async updateOwn(
    tenantId: string,
    dto: UpdateTenantDto,
    actorUserId: string,
    metadata: RequestMetadata,
  ): Promise<TenantEntity> {
    const before = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { settings: true },
    });
    if (!before) {
      throw new NotFoundException('Tenant nao encontrado.');
    }

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: compact({ name: dto.name, tradeName: dto.tradeName, logoUrl: dto.logoUrl }),
    });

    if (dto.settings) {
      const { preferences, ...rest } = dto.settings;
      await this.prisma.tenantSettings.update({
        where: { tenantId },
        data: {
          ...rest,
          ...(preferences !== undefined
            ? { preferences: preferences as Prisma.InputJsonValue }
            : {}),
        },
      });
    }

    const after = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      include: { settings: true },
    });

    await this.audit.log({
      tenantId,
      userId: actorUserId,
      action: 'tenant.updated',
      entityName: 'Tenant',
      entityId: tenantId,
      previousValue: toJsonSafe(before),
      newValue: toJsonSafe(after),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTenantEntity(after);
  }

  async updateOwnStatus(
    tenantId: string,
    dto: UpdateTenantStatusDto,
    actorUserId: string,
    metadata: RequestMetadata,
  ): Promise<TenantEntity> {
    const before = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!before) {
      throw new NotFoundException('Tenant nao encontrado.');
    }

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { isActive: dto.isActive },
    });

    await this.audit.log({
      tenantId,
      userId: actorUserId,
      action: 'tenant.status_changed',
      entityName: 'Tenant',
      entityId: tenantId,
      previousValue: { isActive: before.isActive },
      newValue: { isActive: dto.isActive },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return this.findOwn(tenantId);
  }

  // ==========================================================================
  // Operacoes administrativas (SUPER_ADMIN) -- cross-tenant, introduzidas
  // nesta fase. Usam TenantsRepository (camada de acesso a dados dedicada),
  // diferente dos metodos self-service acima (Fase 5), que continuam
  // chamando PrismaService diretamente e nao foram tocados.
  // ==========================================================================

  async findAll(query: FindTenantsQueryDto): Promise<PaginatedTenantsEntity> {
    const where: Prisma.TenantWhereInput = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { tradeName: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { document: { contains: query.search } },
              { slug: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.tenantsRepository.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.tenantsRepository.count(where),
    ]);

    const result = new PaginatedTenantsEntity();
    result.items = items.map(toTenantEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findById(id: string): Promise<TenantEntity> {
    const tenant = await this.tenantsRepository.findById(id);
    if (!tenant) {
      throw new NotFoundException('Tenant nao encontrado.');
    }
    return toTenantEntity(tenant);
  }

  async updateById(
    id: string,
    dto: UpdateTenantFullDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TenantEntity> {
    const before = await this.tenantsRepository.findById(id);
    if (!before) {
      throw new NotFoundException('Tenant nao encontrado.');
    }

    if (dto.document && dto.document !== before.document) {
      const existing = await this.tenantsRepository.findByDocumentExcluding(dto.document, id);
      if (existing) {
        throw new ConflictException('Ja existe uma empresa cadastrada com este CNPJ.');
      }
    }
    if (dto.slug && dto.slug !== before.slug) {
      const existing = await this.tenantsRepository.findBySlugExcluding(dto.slug, id);
      if (existing) {
        throw new ConflictException('Ja existe uma empresa com este identificador (slug).');
      }
    }

    await this.tenantsRepository.updateById(
      id,
      compact({
        name: dto.name,
        tradeName: dto.tradeName,
        document: dto.document,
        slug: dto.slug,
        logoUrl: dto.logoUrl,
        isActive: dto.isActive,
      }),
    );

    if (dto.settings) {
      const { preferences, ...rest } = dto.settings;
      await this.prisma.tenantSettings.update({
        where: { tenantId: id },
        data: {
          ...rest,
          ...(preferences !== undefined
            ? { preferences: preferences as Prisma.InputJsonValue }
            : {}),
        },
      });
    }

    const after = await this.tenantsRepository.findById(id);
    if (!after) {
      throw new NotFoundException('Tenant nao encontrado.');
    }

    await this.audit.log({
      tenantId: id,
      userId: actor.userId,
      action: 'tenant.updated_by_admin',
      entityName: 'Tenant',
      entityId: id,
      previousValue: toJsonSafe(before),
      newValue: toJsonSafe(after),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTenantEntity(after);
  }

  // actorTenantId: a EMPRESA DO ATOR (super admin), nao a empresa sendo
  // excluida -- AuditLog.tenantId tem onDelete: Cascade a partir de Tenant,
  // entao gravar o log com tenantId = id (o tenant que esta sendo excluido)
  // faria o proprio registro de auditoria ser destruido pela cascata da
  // exclusao que ele documenta. Atribuir ao tenant do ator preserva o
  // registro; o que foi excluido continua identificado via entityId/
  // previousValue.
  async deleteById(
    id: string,
    actorTenantId: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<void> {
    const before = await this.tenantsRepository.findById(id);
    if (!before) {
      throw new NotFoundException('Tenant nao encontrado.');
    }

    const counts = await this.tenantsRepository.countRelationships(id);
    if (hasAnyRelationship(counts)) {
      throw new ConflictException(
        'Nao e possivel excluir esta empresa: existem registros vinculados ' +
          `(usuarios: ${counts.users}, motoristas: ${counts.drivers}, veiculos: ${counts.vehicles}, ` +
          `viagens: ${counts.trips}). Remova-os antes de excluir a empresa.`,
      );
    }

    await this.tenantsRepository.deleteById(id);

    await this.audit.log({
      tenantId: actorTenantId,
      userId: actor.userId,
      action: 'tenant.deleted',
      entityName: 'Tenant',
      entityId: id,
      previousValue: toJsonSafe({
        name: before.name,
        document: before.document,
        slug: before.slug,
      }),
      newValue: null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }
}
