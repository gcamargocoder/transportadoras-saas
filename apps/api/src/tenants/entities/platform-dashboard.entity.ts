import { ApiProperty } from '@nestjs/swagger';
import { TenantPlanTier, TenantStatus } from '@prisma/client';

export class PlatformTenantStatusBreakdownEntity {
  @ApiProperty({ enum: TenantStatus })
  status!: TenantStatus;

  @ApiProperty()
  count!: number;
}

export class PlatformPlanTierBreakdownEntity {
  @ApiProperty({ enum: TenantPlanTier })
  tier!: TenantPlanTier;

  @ApiProperty()
  count!: number;
}

// Fase 47 -- GET /tenants/dashboard (SUPER_ADMIN). Primeira agregacao
// verdadeiramente cross-tenant do projeto (sem where:{tenantId} nenhum) --
// sempre count/groupBy em paralelo, nunca 1 query por tenant.
export class PlatformDashboardEntity {
  @ApiProperty()
  totalTenants!: number;

  @ApiProperty({ type: [PlatformTenantStatusBreakdownEntity] })
  byStatus!: PlatformTenantStatusBreakdownEntity[];

  @ApiProperty({ description: 'Soma de UserAccount.count em TODOS os tenants (deletedAt=null).' })
  totalUsers!: number;

  @ApiProperty({ description: 'Soma de Vehicle.count em TODOS os tenants (deletedAt=null).' })
  totalVehicles!: number;

  @ApiProperty({ description: 'Soma de Driver.count em TODOS os tenants (deletedAt=null).' })
  totalDrivers!: number;

  @ApiProperty({ type: [PlatformPlanTierBreakdownEntity] })
  byPlanTier!: PlatformPlanTierBreakdownEntity[];

  @ApiProperty({ description: 'Viagens concluidas nos ultimos 30 dias, em toda a plataforma (sinal real de atividade).' })
  tripsCompletedLast30Days!: number;

  @ApiProperty({ description: 'Checklists concluidos nos ultimos 30 dias, em toda a plataforma.' })
  checklistsCompletedLast30Days!: number;
}
