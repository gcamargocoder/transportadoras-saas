import { Notification } from '@prisma/client';
import { NotificationEntity } from '../entities/notification.entity';

export function toNotificationEntity(notification: Notification): NotificationEntity {
  const entity = new NotificationEntity();
  entity.id = notification.id;
  entity.type = notification.type;
  entity.title = notification.title;
  entity.message = notification.message;
  entity.severity = notification.severity;
  entity.entityType = notification.entityType;
  entity.entityId = notification.entityId;
  entity.metadata = (notification.metadata as Record<string, unknown> | null) ?? null;
  entity.readAt = notification.readAt;
  entity.createdAt = notification.createdAt;
  return entity;
}
