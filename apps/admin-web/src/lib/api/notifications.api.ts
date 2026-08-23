import type { Paginated, QueryableParams } from '../../types/api';
import type { NotificationEntity, UnreadNotificationCountEntity } from '../../types/entities';
import type { AlertSeverity, NotificationType } from '../../types/enums';
import { api } from './http';

// Fase 69 -- Centro de Alertas e Notificacoes.
export interface FindNotificationsQuery extends QueryableParams {
  page?: number | undefined;
  pageSize?: number | undefined;
  unread?: 'true' | 'false' | undefined;
  type?: NotificationType | undefined;
  severity?: AlertSeverity | undefined;
  entityType?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export function listNotifications(query: FindNotificationsQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<NotificationEntity>>('/notifications', query, signal);
}

export function getUnreadNotificationCount(signal?: AbortSignal) {
  return api.get<UnreadNotificationCountEntity>('/notifications/unread-count', undefined, signal);
}

export function getNotification(id: string) {
  return api.get<NotificationEntity>(`/notifications/${id}`);
}

export function markNotificationRead(id: string) {
  return api.patch<NotificationEntity>(`/notifications/${id}/read`);
}

export function markAllNotificationsRead() {
  return api.patch<{ count: number }>('/notifications/read-all');
}
