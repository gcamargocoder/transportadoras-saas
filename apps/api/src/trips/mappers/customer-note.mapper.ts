import { CustomerNote } from '@prisma/client';
import { CustomerNoteEntity } from '../entities/customer-note.entity';

export function toCustomerNoteEntity(note: CustomerNote): CustomerNoteEntity {
  const entity = new CustomerNoteEntity();
  entity.id = note.id;
  entity.tenantId = note.tenantId;
  entity.customerId = note.customerId;
  entity.content = note.content;
  entity.createdBy = note.createdBy;
  entity.createdAt = note.createdAt;
  return entity;
}
