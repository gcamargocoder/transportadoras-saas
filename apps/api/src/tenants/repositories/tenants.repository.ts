import { Injectable } from '@nestjs/common';
import { Prisma, Tenant } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantRelationshipCounts } from '../interfaces/tenant-relationship-counts.interface';
import { TenantWithSettings } from '../mappers/tenant.mapper';

const WITH_SETTINGS = { settings: true } satisfies Prisma.TenantInclude;

// Camada de acesso a dados dedicada as operacoes administrativas (Super
// Admin) introduzidas nesta fase -- lista/busca por id/edicao/exclusao
// cross-tenant. Os fluxos self-service ja existentes (create/findOwn/
// updateOwn/updateOwnStatus, Fase 5) continuam chamando PrismaService
// diretamente em TenantsService, sem alteracao, para nao arriscar
// regressao em codigo ja validado.
@Injectable()
export class TenantsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(params: {
    where: Prisma.TenantWhereInput;
    orderBy: Prisma.TenantOrderByWithRelationInput;
    skip: number;
    take: number;
  }): Promise<TenantWithSettings[]> {
    return this.prisma.tenant.findMany({ ...params, include: WITH_SETTINGS });
  }

  count(where: Prisma.TenantWhereInput): Promise<number> {
    return this.prisma.tenant.count({ where });
  }

  findById(id: string): Promise<TenantWithSettings | null> {
    return this.prisma.tenant.findUnique({ where: { id }, include: WITH_SETTINGS });
  }

  findByDocumentExcluding(document: string, excludeId?: string): Promise<Tenant | null> {
    return this.prisma.tenant.findFirst({
      where: { document, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
  }

  findBySlugExcluding(slug: string, excludeId?: string): Promise<Tenant | null> {
    return this.prisma.tenant.findFirst({
      where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
  }

  updateById(id: string, data: Prisma.TenantUpdateInput): Promise<Tenant> {
    return this.prisma.tenant.update({ where: { id }, data });
  }

  deleteById(id: string): Promise<Tenant> {
    return this.prisma.tenant.delete({ where: { id } });
  }

  async countRelationships(tenantId: string): Promise<TenantRelationshipCounts> {
    const [users, drivers, vehicles, trips] = await Promise.all([
      this.prisma.userAccount.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.driver.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.vehicle.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.trip.count({ where: { tenantId, deletedAt: null } }),
    ]);
    return { users, drivers, vehicles, trips };
  }
}
