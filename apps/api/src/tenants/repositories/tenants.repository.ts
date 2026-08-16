import { Injectable } from '@nestjs/common';
import { ChecklistExecutionStatus, Prisma, Tenant, TripStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantRelationshipCounts } from '../interfaces/tenant-relationship-counts.interface';
import { TenantWithSettings } from '../mappers/tenant.mapper';
import { PlatformStats } from '../interfaces/platform-stats.interface';
import { TenantUsageCounts } from '../interfaces/tenant-usage-counts.interface';
import { getStorageUsedBytes } from '../utils/plan-limit.util';

const LAST_30_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const WITH_SETTINGS = { settings: true, plan: true } satisfies Prisma.TenantInclude;

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

  // Fase 47 -- visao completa de utilizacao de UM tenant (GET /tenants/:id/usage).
  // 8 counts em paralelo, nunca 1 query por recurso relacionado.
  async getUsage(tenantId: string): Promise<TenantUsageCounts> {
    const [
      users,
      drivers,
      vehicles,
      trips,
      checklistExecutions,
      fuelSupplies,
      maintenances,
      attachments,
      storageUsedBytes,
    ] = await Promise.all([
      this.prisma.userAccount.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.driver.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.vehicle.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.trip.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.checklistExecution.count({ where: { tenantId } }),
      this.prisma.fuelSupply.count({ where: { tenantId } }),
      this.prisma.vehicleMaintenance.count({ where: { tenantId } }),
      this.prisma.attachment.count({ where: { tenantId } }),
      // Fase 48 -- mesmo helper usado no enforcement de upload, reaproveitado
      // aqui so para exibicao (nunca cria uma segunda logica de soma).
      getStorageUsedBytes(this.prisma, tenantId),
    ]);
    const storageUsedMb = Math.round((storageUsedBytes / (1024 * 1024)) * 100) / 100;
    return {
      users,
      drivers,
      vehicles,
      trips,
      checklistExecutions,
      fuelSupplies,
      maintenances,
      attachments,
      storageUsedMb,
    };
  }

  // Fase 47 -- GET /tenants/dashboard. SEM where:{tenantId} de proposito
  // (agregacao da plataforma inteira) -- sempre Promise.all de count/
  // groupBy, nunca 1 query por tenant.
  async getPlatformStats(): Promise<PlatformStats> {
    const thirtyDaysAgo = new Date(Date.now() - LAST_30_DAYS_MS);

    const [
      totalTenants,
      statusGroups,
      totalUsers,
      totalVehicles,
      totalDrivers,
      planTierGroups,
      tripsCompletedLast30Days,
      checklistsCompletedLast30Days,
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.userAccount.count({ where: { deletedAt: null } }),
      this.prisma.vehicle.count({ where: { deletedAt: null } }),
      this.prisma.driver.count({ where: { deletedAt: null } }),
      this.prisma.tenantPlan.groupBy({ by: ['tier'], _count: { _all: true } }),
      this.prisma.trip.count({ where: { status: TripStatus.COMPLETED, actualArrival: { gte: thirtyDaysAgo } } }),
      this.prisma.checklistExecution.count({
        where: { status: ChecklistExecutionStatus.COMPLETED, completedAt: { gte: thirtyDaysAgo } },
      }),
    ]);

    return {
      totalTenants,
      byStatus: statusGroups.map((g) => ({ status: g.status, count: g._count._all })),
      totalUsers,
      totalVehicles,
      totalDrivers,
      byPlanTier: planTierGroups.map((g) => ({ tier: g.tier, count: g._count._all })),
      tripsCompletedLast30Days,
      checklistsCompletedLast30Days,
    };
  }

  // Fase 47 -- contagem de usuarios/veiculos por tenant EM LOTE para a
  // pagina inteira da listagem (nunca 1 query por linha). Chaves ausentes
  // no Map (tenant sem nenhum registro) resolvem para 0 no service.
  async getUserAndVehicleCountsByTenant(
    tenantIds: string[],
  ): Promise<{ userCountByTenant: Map<string, number>; vehicleCountByTenant: Map<string, number> }> {
    if (tenantIds.length === 0) {
      return { userCountByTenant: new Map(), vehicleCountByTenant: new Map() };
    }
    const [userGroups, vehicleGroups] = await Promise.all([
      this.prisma.userAccount.groupBy({
        by: ['tenantId'],
        where: { tenantId: { in: tenantIds }, deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.vehicle.groupBy({
        by: ['tenantId'],
        where: { tenantId: { in: tenantIds }, deletedAt: null },
        _count: { _all: true },
      }),
    ]);
    return {
      userCountByTenant: new Map(userGroups.map((g) => [g.tenantId, g._count._all])),
      vehicleCountByTenant: new Map(vehicleGroups.map((g) => [g.tenantId, g._count._all])),
    };
  }
}
