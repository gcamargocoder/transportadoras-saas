import { MaintenancePart, VehicleMaintenance } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { MaintenanceEntity } from '../entities/maintenance.entity';
import { MaintenancePartEntity } from '../entities/maintenance-part.entity';

function toMaintenancePartEntity(part: MaintenancePart): MaintenancePartEntity {
  const entity = new MaintenancePartEntity();
  entity.id = part.id;
  entity.name = part.name;
  entity.quantity = toNumberOrNull(part.quantity) ?? 0;
  entity.unitPrice = toNumberOrNull(part.unitPrice) ?? 0;
  entity.totalPrice = toNumberOrNull(part.totalPrice) ?? 0;
  return entity;
}

export function toMaintenanceEntity(maintenance: VehicleMaintenance & { parts?: MaintenancePart[] }): MaintenanceEntity {
  const entity = new MaintenanceEntity();
  entity.id = maintenance.id;
  entity.tenantId = maintenance.tenantId;
  entity.vehicleId = maintenance.vehicleId;
  entity.type = maintenance.type;
  entity.status = maintenance.status;
  entity.priority = maintenance.priority;
  entity.openedAt = maintenance.openedAt;
  entity.scheduledAt = maintenance.scheduledAt;
  entity.completedAt = maintenance.completedAt;
  entity.odometerKm = toNumberOrNull(maintenance.odometerKm);
  entity.workshop = maintenance.workshop;
  entity.supplier = maintenance.supplier;
  entity.mechanic = maintenance.mechanic;
  entity.responsibleUserId = maintenance.responsibleUserId;
  entity.description = maintenance.description;
  entity.notes = maintenance.notes;
  entity.laborCost = toNumberOrNull(maintenance.laborCost);
  entity.partsCost = toNumberOrNull(maintenance.partsCost);
  entity.totalCost = toNumberOrNull(maintenance.totalCost);
  entity.serviceOrderNumber = maintenance.serviceOrderNumber;
  entity.warrantyUntil = maintenance.warrantyUntil;
  entity.nextReviewAt = maintenance.nextReviewAt;
  entity.component = maintenance.component;
  entity.nextOdometerKm = toNumberOrNull(maintenance.nextOdometerKm);
  entity.downtimeMinutes = maintenance.downtimeMinutes;
  entity.invoiceNumber = maintenance.invoiceNumber;
  entity.maintenancePlanId = maintenance.maintenancePlanId;
  entity.parts = (maintenance.parts ?? []).map(toMaintenancePartEntity);
  entity.createdAt = maintenance.createdAt;
  entity.updatedAt = maintenance.updatedAt;
  return entity;
}
