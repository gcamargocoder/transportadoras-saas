import { apiRequest } from './http';
import { DriverNotification, PaginatedDriverNotifications, UnreadNotificationCount } from './driverNotifications.types';

// Fase 70 -- reaproveita EXATAMENTE os endpoints ja expostos por
// DriverTripsController (GET/PATCH driver/notifications*, ver Fase 69),
// que por sua vez reaproveitam o MESMO NotificationsService do admin-web.
// Nenhum endpoint novo/duplicado criado so para o Driver App.
export function getNotifications(
  query: { page?: number; pageSize?: number; unread?: 'true' | 'false' } = {},
): Promise<PaginatedDriverNotifications> {
  return apiRequest<PaginatedDriverNotifications>('/driver/notifications', { query });
}

export function getUnreadNotificationCount(): Promise<UnreadNotificationCount> {
  return apiRequest<UnreadNotificationCount>('/driver/notifications/unread-count');
}

export function markNotificationRead(id: string): Promise<DriverNotification> {
  return apiRequest<DriverNotification>(`/driver/notifications/${id}/read`, { method: 'PATCH' });
}
