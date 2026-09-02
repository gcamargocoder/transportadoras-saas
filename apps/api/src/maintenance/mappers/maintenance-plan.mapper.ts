import { MaintenancePlan } from '@prisma/client';
import {
  MaintenancePlanEntity,
  MaintenancePlanLastExecutionEntity,
} from '../entities/maintenance-plan.entity';
import { MaintenancePlanEvaluation } from '../../fleet-operations/utils/maintenance-plan-status.util';

const UNKNOWN_EVALUATION: MaintenancePlanEvaluation = {
  status: 'UNKNOWN',
  overdueReason: null,
  dueOdometerKm: null,
  dueDate: null,
  overdueByKm: null,
  overdueByDays: null,
};

export interface MaintenancePlanLastExecution {
  executedAt: Date | null;
  odometerKm: number | null;
}

export function toMaintenancePlanEntity(
  plan: MaintenancePlan,
  evaluation: MaintenancePlanEvaluation = UNKNOWN_EVALUATION,
  lastExecution: MaintenancePlanLastExecution | null = null,
): MaintenancePlanEntity {
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
  entity.notes = plan.notes;
  entity.createdAt = plan.createdAt;
  entity.updatedAt = plan.updatedAt;
  entity.status = evaluation.status;
  entity.overdueReason = evaluation.overdueReason;
  entity.dueOdometerKm = evaluation.dueOdometerKm;
  entity.dueDate = evaluation.dueDate;
  entity.overdueByKm = evaluation.overdueByKm;
  entity.overdueByDays = evaluation.overdueByDays;
  if (lastExecution && (lastExecution.executedAt !== null || lastExecution.odometerKm !== null)) {
    const le = new MaintenancePlanLastExecutionEntity();
    le.executedAt = lastExecution.executedAt;
    le.odometerKm = lastExecution.odometerKm;
    entity.lastExecution = le;
  } else {
    entity.lastExecution = null;
  }
  return entity;
}
