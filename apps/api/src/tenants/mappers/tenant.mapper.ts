import { Tenant, TenantSettings } from '@prisma/client';
import { TenantEntity } from '../entities/tenant.entity';
import { TenantSettingsEntity } from '../entities/tenant-settings.entity';

export type TenantWithSettings = Tenant & { settings: TenantSettings | null };

export function toTenantSettingsEntity(settings: TenantSettings): TenantSettingsEntity {
  const entity = new TenantSettingsEntity();
  entity.timezone = settings.timezone;
  entity.currency = settings.currency;
  entity.language = settings.language;
  entity.gpsPingIntervalSeconds = settings.gpsPingIntervalSeconds;
  entity.maxDeviationMeters = settings.maxDeviationMeters;
  entity.alertDelayThresholdMin = settings.alertDelayThresholdMin;
  entity.preferences = (settings.preferences as Record<string, unknown> | null) ?? null;
  return entity;
}

export function toTenantEntity(tenant: TenantWithSettings): TenantEntity {
  const entity = new TenantEntity();
  entity.id = tenant.id;
  entity.name = tenant.name;
  entity.tradeName = tenant.tradeName;
  entity.document = tenant.document;
  entity.slug = tenant.slug;
  entity.logoUrl = tenant.logoUrl;
  entity.isActive = tenant.isActive;
  entity.settings = tenant.settings ? toTenantSettingsEntity(tenant.settings) : null;
  entity.createdAt = tenant.createdAt;
  entity.updatedAt = tenant.updatedAt;
  return entity;
}
