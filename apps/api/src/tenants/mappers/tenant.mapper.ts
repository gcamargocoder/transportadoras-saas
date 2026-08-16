import { Tenant, TenantPlan, TenantSettings } from '@prisma/client';
import { TRIAL_EXPIRING_SOON_THRESHOLD_DAYS } from '../constants/tenant.constants';
import { TenantEntity } from '../entities/tenant.entity';
import { TenantPlanEntity } from '../entities/tenant-plan.entity';
import { TenantSettingsEntity } from '../entities/tenant-settings.entity';

export type TenantWithSettings = Tenant & { settings: TenantSettings | null; plan: TenantPlan | null };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Fase 49 -- `now` sempre injetavel (default new Date()) para os testes
// controlarem a data "atual" sem sleep real e sem depender do relogio da
// maquina que roda o teste. Autoridade de data e sempre o backend -- o
// frontend nunca calcula isso por conta propria a partir de trialEndsAt.
export function toTenantPlanEntity(plan: TenantPlan, now: Date = new Date()): TenantPlanEntity {
  const entity = new TenantPlanEntity();
  entity.tier = plan.tier;
  entity.trialStartedAt = plan.trialStartedAt;
  entity.trialEndsAt = plan.trialEndsAt;
  entity.maxUsers = plan.maxUsers;
  entity.maxVehicles = plan.maxVehicles;
  entity.maxDrivers = plan.maxDrivers;
  entity.maxStorageMb = plan.maxStorageMb;
  entity.enabledModules = plan.enabledModules;

  entity.trialDaysRemaining = plan.trialEndsAt
    ? Math.ceil((plan.trialEndsAt.getTime() - now.getTime()) / MS_PER_DAY)
    : null;
  entity.trialExpiringSoon =
    entity.trialDaysRemaining !== null &&
    entity.trialDaysRemaining >= 0 &&
    entity.trialDaysRemaining <= TRIAL_EXPIRING_SOON_THRESHOLD_DAYS;

  return entity;
}

export function toTenantSettingsEntity(settings: TenantSettings): TenantSettingsEntity {
  const entity = new TenantSettingsEntity();
  entity.timezone = settings.timezone;
  entity.currency = settings.currency;
  entity.language = settings.language;
  entity.gpsPingIntervalSeconds = settings.gpsPingIntervalSeconds;
  entity.maxDeviationMeters = settings.maxDeviationMeters;
  entity.alertDelayThresholdMin = settings.alertDelayThresholdMin;
  entity.routeDeviationMinutes = settings.routeDeviationMinutes;
  entity.preferences = (settings.preferences as Record<string, unknown> | null) ?? null;
  return entity;
}

export function toTenantEntity(tenant: TenantWithSettings, now: Date = new Date()): TenantEntity {
  const entity = new TenantEntity();
  entity.id = tenant.id;
  entity.name = tenant.name;
  entity.tradeName = tenant.tradeName;
  entity.document = tenant.document;
  entity.slug = tenant.slug;
  entity.logoUrl = tenant.logoUrl;
  entity.isActive = tenant.isActive;
  entity.status = tenant.status;
  entity.settings = tenant.settings ? toTenantSettingsEntity(tenant.settings) : null;
  entity.plan = tenant.plan ? toTenantPlanEntity(tenant.plan, now) : null;
  entity.createdAt = tenant.createdAt;
  entity.updatedAt = tenant.updatedAt;
  return entity;
}
