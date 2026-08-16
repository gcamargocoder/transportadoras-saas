import { MaintenancePlan } from '@prisma/client';
import { MaintenancePlanEntity } from '../entities/maintenance-plan.entity';

export function toMaintenancePlanEntity(plan: MaintenancePlan): MaintenancePlanEntity {
  const entity = new MaintenancePlanEntity();
  entity.id = plan.id;
  entity.vehicleId = plan.vehicleId;
  entity.name = plan.name;
  entity.component = plan.component;
  entity.maintenanceType = plan.maintenanceType;
  entity.intervalKm = plan.intervalKm;
  entity.intervalDays = plan.intervalDays;
  entity.intervalHours = plan.intervalHours;
  entity.alertBeforeKm = plan.alertBeforeKm;
  entity.alertBeforeDays = plan.alertBeforeDays;
  entity.active = plan.active;
  entity.createdAt = plan.createdAt;
  entity.updatedAt = plan.updatedAt;
  return entity;
}
