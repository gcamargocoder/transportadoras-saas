import { ChecklistItem, ChecklistSection, ChecklistTemplate } from '@prisma/client';
import { ChecklistItemEntity } from '../entities/checklist-item.entity';
import { ChecklistSectionEntity } from '../entities/checklist-section.entity';
import { ChecklistTemplateEntity } from '../entities/checklist-template.entity';

export type ChecklistTemplateWithRelations = ChecklistTemplate & {
  sections: (ChecklistSection & { items: ChecklistItem[] })[];
};

function toChecklistItemEntity(item: ChecklistItem): ChecklistItemEntity {
  const entity = new ChecklistItemEntity();
  entity.id = item.id;
  entity.sectionId = item.sectionId;
  entity.code = item.code;
  entity.label = item.label;
  entity.description = item.description;
  entity.type = item.type;
  entity.required = item.required;
  entity.order = item.order;
  entity.requiresObservation = item.requiresObservation;
  entity.requiresPhoto = item.requiresPhoto;
  entity.critical = item.critical;
  entity.options = (item.options as Record<string, unknown> | null) ?? null;
  entity.createdAt = item.createdAt;
  entity.updatedAt = item.updatedAt;
  return entity;
}

function toChecklistSectionEntity(section: ChecklistSection & { items: ChecklistItem[] }): ChecklistSectionEntity {
  const entity = new ChecklistSectionEntity();
  entity.id = section.id;
  entity.templateId = section.templateId;
  entity.title = section.title;
  entity.description = section.description;
  entity.order = section.order;
  entity.items = [...section.items].sort((a, b) => a.order - b.order).map(toChecklistItemEntity);
  entity.createdAt = section.createdAt;
  entity.updatedAt = section.updatedAt;
  return entity;
}

export function toChecklistTemplateEntity(template: ChecklistTemplateWithRelations): ChecklistTemplateEntity {
  const entity = new ChecklistTemplateEntity();
  entity.id = template.id;
  entity.tenantId = template.tenantId;
  entity.name = template.name;
  entity.description = template.description;
  entity.type = template.type;
  entity.vehicleType = template.vehicleType;
  entity.trailerType = template.trailerType;
  entity.version = template.version;
  entity.status = template.status;
  entity.previousVersionId = template.previousVersionId;
  entity.publishedAt = template.publishedAt;
  entity.archivedAt = template.archivedAt;
  entity.sections = [...template.sections].sort((a, b) => a.order - b.order).map(toChecklistSectionEntity);
  entity.createdAt = template.createdAt;
  entity.updatedAt = template.updatedAt;
  return entity;
}
