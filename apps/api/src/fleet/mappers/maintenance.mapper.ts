import { MaintenancePart, TireMovement, VehicleMaintenance } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { MaintenanceEntity } from '../entities/maintenance.entity';
import { MaintenancePartEntity } from '../entities/maintenance-part.entity';
import { MaintenanceTireMovementEntity } from '../entities/maintenance-tire-movement.entity';

function toMaintenancePartEntity(part: MaintenancePart): MaintenancePartEntity {
  const entity = new MaintenancePartEntity();
  entity.id = part.id;
  entity.partId = part.partId;
  entity.name = part.name;
  entity.quantity = toNumberOrNull(part.quantity) ?? 0;
  entity.unitPrice = toNumberOrNull(part.unitPrice) ?? 0;
  entity.totalPrice = toNumberOrNull(part.totalPrice) ?? 0;
  return entity;
}

// Fase 109 -- ver MaintenanceTireMovementEntity.
function toMaintenanceTireMovementEntity(
  movement: TireMovement & { tire: { fireNumber: string } },
): MaintenanceTireMovementEntity {
  const entity = new MaintenanceTireMovementEntity();
  entity.id = movement.id;
  entity.tireId = movement.tireId;
  entity.tireFireNumber = movement.tire.fireNumber;
  entity.movementDate = movement.movementDate;
  entity.newLocationType = movement.newLocationType;
  entity.previousPosition = movement.previousPosition;
  entity.newPosition = movement.newPosition;
  entity.reason = movement.reason;
  return entity;
}

export function toMaintenanceEntity(
  maintenance: VehicleMaintenance & {
    parts?: MaintenancePart[];
    vehicle?: { plate: string };
    workshopProvider?: { name: string } | null;
    supplierProvider?: { name: string } | null;
  },
  tireMovements: (TireMovement & { tire: { fireNumber: string } })[] = [],
): MaintenanceEntity {
  const entity = new MaintenanceEntity();
  entity.id = maintenance.id;
  entity.tenantId = maintenance.tenantId;
  entity.vehicleId = maintenance.vehicleId;
  entity.vehiclePlate = maintenance.vehicle?.plate ?? null;
  entity.type = maintenance.type;
  entity.status = maintenance.status;
  entity.priority = maintenance.priority;
  entity.openedAt = maintenance.openedAt;
  entity.scheduledAt = maintenance.scheduledAt;
  entity.startedAt = maintenance.startedAt;
  entity.completedAt = maintenance.completedAt;
  entity.diagnosis = maintenance.diagnosis;
  entity.odometerKm = toNumberOrNull(maintenance.odometerKm);
  entity.completionOdometerKm = toNumberOrNull(maintenance.completionOdometerKm);
  entity.workshop = maintenance.workshop;
  entity.supplier = maintenance.supplier;
  entity.mechanic = maintenance.mechanic;
  entity.workshopId = maintenance.workshopId;
  entity.workshopName = maintenance.workshopProvider?.name ?? null;
  entity.supplierId = maintenance.supplierId;
  entity.supplierName = maintenance.supplierProvider?.name ?? null;
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
  entity.checklistExecutionId = maintenance.checklistExecutionId;
  entity.parts = (maintenance.parts ?? []).map(toMaintenancePartEntity);
  entity.tireMovements = tireMovements.map(toMaintenanceTireMovementEntity);
  entity.createdAt = maintenance.createdAt;
  entity.updatedAt = maintenance.updatedAt;
  return entity;
}
