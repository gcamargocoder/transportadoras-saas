import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { hashPassword } from '../../auth/utils/password.util';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTenantDto } from '../dto/create-tenant.dto';
import { UpdateTenantDto } from '../dto/update-tenant.dto';
import { UpdateTenantStatusDto } from '../dto/update-tenant-status.dto';
import { TenantEntity } from '../entities/tenant.entity';
import { toTenantEntity } from '../mappers/tenant.mapper';
import { slugify } from '../utils/slugify.util';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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
          ...compact({ tradeName: dto.tradeName }),
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
      data: compact({ name: dto.name, tradeName: dto.tradeName }),
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
}
