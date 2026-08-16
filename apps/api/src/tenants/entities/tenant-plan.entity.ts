import { ApiProperty } from '@nestjs/swagger';
import { TenantModule, TenantPlanTier } from '@prisma/client';

export class TenantPlanEntity {
  @ApiProperty({ enum: TenantPlanTier })
  tier!: TenantPlanTier;

  @ApiProperty({ nullable: true, description: 'Fase 49 -- preenchida na 1a entrada em TRIAL, nunca sobrescrita depois.' })
  trialStartedAt!: Date | null;

  @ApiProperty({ nullable: true })
  trialEndsAt!: Date | null;

  @ApiProperty({ nullable: true, description: 'Fase 49 -- calculado no backend (nunca no cliente). null = sem trial configurado.' })
  trialDaysRemaining!: number | null;

  @ApiProperty({ description: 'Fase 49 -- true quando faltam poucos dias para o trial vencer.' })
  trialExpiringSoon!: boolean;

  @ApiProperty({ nullable: true, description: 'null = sem limite.' })
  maxUsers!: number | null;

  @ApiProperty({ nullable: true, description: 'null = sem limite.' })
  maxVehicles!: number | null;

  @ApiProperty({ nullable: true, description: 'null = sem limite.' })
  maxDrivers!: number | null;

  @ApiProperty({ nullable: true, description: 'null = sem limite.' })
  maxStorageMb!: number | null;

  @ApiProperty({ enum: TenantModule, isArray: true })
  enabledModules!: TenantModule[];
}
