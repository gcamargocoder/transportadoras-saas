import { ChecklistAnswer, ChecklistEvidence, ChecklistExecution, ChecklistItem, ChecklistType, VehicleMaintenance } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { ChecklistAnswerEntity } from '../entities/checklist-answer.entity';
import { ChecklistEvidenceEntity } from '../entities/checklist-evidence.entity';
import { ChecklistExecutionEntity } from '../entities/checklist-execution.entity';
import { ChecklistExecutionMaintenanceEntity } from '../entities/checklist-execution-maintenance.entity';
import { hasCriticalNonConformity } from '../utils/checklist-non-conformity.util';

type AnswerWithRelations = ChecklistAnswer & { item: ChecklistItem; evidence: ChecklistEvidence[] };

export type ChecklistExecutionWithRelations = ChecklistExecution & {
  answers: AnswerWithRelations[];
  evidence: ChecklistEvidence[];
  template: { name: string; type: ChecklistType };
  vehicle: { plate: string } | null;
  driver: { name: string } | null;
  trip: { destination: { name: string } } | null;
};

type MaintenanceSummary = Pick<VehicleMaintenance, 'id' | 'serviceOrderNumber' | 'status'>;

export function toChecklistEvidenceEntity(evidence: ChecklistEvidence): ChecklistEvidenceEntity {
  const entity = new ChecklistEvidenceEntity();
  entity.id = evidence.id;
  entity.executionId = evidence.executionId;
  entity.itemId = evidence.itemId;
  entity.answerId = evidence.answerId;
  entity.type = evidence.type;
  entity.attachmentId = evidence.attachmentId;
  entity.description = evidence.description;
  entity.latitude = toNumberOrNull(evidence.latitude);
  entity.longitude = toNumberOrNull(evidence.longitude);
  entity.capturedAt = evidence.capturedAt;
  entity.createdAt = evidence.createdAt;
  return entity;
}

function toChecklistAnswerEntity(answer: AnswerWithRelations): ChecklistAnswerEntity {
  const entity = new ChecklistAnswerEntity();
  entity.id = answer.id;
  entity.executionId = answer.executionId;
  entity.itemId = answer.itemId;
  entity.itemCode = answer.item.code;
  entity.itemLabel = answer.item.label;
  entity.itemType = answer.item.type;
  entity.itemRequired = answer.item.required;
  entity.itemCritical = answer.item.critical;
  entity.booleanValue = answer.booleanValue;
  entity.textValue = answer.textValue;
  entity.numberValue = toNumberOrNull(answer.numberValue);
  entity.selectedValue = answer.selectedValue;
  entity.evidence = answer.evidence.map(toChecklistEvidenceEntity);
  entity.createdAt = answer.createdAt;
  entity.updatedAt = answer.updatedAt;
  return entity;
}

// hasCriticalNonConformity e sempre CALCULADO aqui a partir de
// answers[].item, nunca lido de uma coluna persistida (Fase 38, secao 16 --
// evita dessincronia entre o valor armazenado e as respostas reais).
export function toChecklistExecutionEntity(
  execution: ChecklistExecutionWithRelations,
  maintenances: MaintenanceSummary[] = [],
): ChecklistExecutionEntity {
  const entity = new ChecklistExecutionEntity();
  entity.id = execution.id;
  entity.tenantId = execution.tenantId;
  entity.templateId = execution.templateId;
  entity.templateVersion = execution.templateVersion;
  entity.templateName = execution.template.name;
  entity.templateType = execution.template.type;
  entity.tripId = execution.tripId;
  entity.tripDestinationName = execution.trip?.destination.name ?? null;
  entity.driverId = execution.driverId;
  entity.driverName = execution.driver?.name ?? null;
  entity.vehicleId = execution.vehicleId;
  entity.vehiclePlate = execution.vehicle?.plate ?? null;
  entity.trailerId = execution.trailerId;
  entity.status = execution.status;
  entity.startedAt = execution.startedAt;
  entity.completedAt = execution.completedAt;
  entity.latitude = toNumberOrNull(execution.latitude);
  entity.longitude = toNumberOrNull(execution.longitude);
  entity.address = execution.address;
  entity.odometerKm = toNumberOrNull(execution.odometerKm);
  entity.inspectionLocation = execution.inspectionLocation;
  entity.responsibleName = execution.responsibleName;
  entity.hasCriticalNonConformity = hasCriticalNonConformity(execution.answers);
  entity.answers = execution.answers.map(toChecklistAnswerEntity);
  entity.evidence = execution.evidence.map(toChecklistEvidenceEntity);
  entity.maintenances = maintenances.map((maintenance) =>
    Object.assign(new ChecklistExecutionMaintenanceEntity(), {
      id: maintenance.id,
      serviceOrderNumber: maintenance.serviceOrderNumber,
      status: maintenance.status,
    }),
  );
  entity.createdAt = execution.createdAt;
  entity.updatedAt = execution.updatedAt;
  return entity;
}
