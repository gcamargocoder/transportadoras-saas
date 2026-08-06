import { AuditLog } from '@prisma/client';
import { AuditLogEntity } from '../entities/audit-log.entity';

export function toAuditLogEntity(log: AuditLog): AuditLogEntity {
  const entity = new AuditLogEntity();
  entity.id = log.id;
  entity.tenantId = log.tenantId;
  entity.userId = log.userId;
  entity.action = log.action;
  entity.entityName = log.entityName;
  entity.entityId = log.entityId;
  entity.previousValue = log.previousValue;
  entity.newValue = log.newValue;
  entity.ipAddress = log.ipAddress;
  entity.userAgent = log.deviceInfo;
  entity.createdAt = log.createdAt;
  return entity;
}
