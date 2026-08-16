import { TenantPlanTier, TenantStatus } from '@prisma/client';

// Fase 47 -- GET /tenants/dashboard. Primeira agregacao cross-tenant real
// do projeto (sem where:{tenantId}).
export interface PlatformStats {
  totalTenants: number;
  byStatus: { status: TenantStatus; count: number }[];
  totalUsers: number;
  totalVehicles: number;
  totalDrivers: number;
  byPlanTier: { tier: TenantPlanTier; count: number }[];
  tripsCompletedLast30Days: number;
  checklistsCompletedLast30Days: number;
}
