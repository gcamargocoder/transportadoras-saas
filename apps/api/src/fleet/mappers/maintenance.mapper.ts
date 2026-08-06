import { VehicleMaintenance } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { MaintenanceEntity } from '../entities/maintenance.entity';

export function toMaintenanceEntity(maintenance: VehicleMaintenance): MaintenanceEntity {
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
  entity.createdAt = maintenance.createdAt;
  entity.updatedAt = maintenance.updatedAt;
  return entity;
}
