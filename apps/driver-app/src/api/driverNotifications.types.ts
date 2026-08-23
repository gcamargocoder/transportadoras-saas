// Fase 70 -- espelha o subconjunto de NotificationEntity/UnreadNotificationCountEntity
// que o motorista realmente pode receber. Os 10 tipos administrativos da
// Fase 69 (CRITICAL_OCCURRENCE, VEHICLE_UNAVAILABLE etc.) nunca sao
// destinados a DRIVER (ver NOTIFICATION_RECIPIENT_ROLES no backend) --
// listados aqui so para o app nao quebrar exibindo um tipo desconhecido, se
// um dia isso mudar.
export type NotificationType =
  | 'CRITICAL_OCCURRENCE'
  | 'VEHICLE_UNAVAILABLE'
  | 'VEHICLE_MAINTENANCE'
  | 'TIRE_NEAR_REPLACEMENT'
  | 'FUEL_ODOMETER_REGRESSION'
  | 'FISCAL_DOCUMENT_PROBLEM'
  | 'TRIP_DELAYED'
  | 'DRIVER_SUSPENDED'
  | 'DRIVER_INACTIVE'
  | 'BILLING_PENDING'
  // Unicos 2 tipos com o motorista como destinatario direto ate agora.
  | 'DELIVERY_PROOF_PENDING'
  | 'DELIVERY_PROOF_PROBLEM';

export type NotificationSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface DriverNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface PaginatedDriverNotifications {
  items: DriverNotification[];
  meta: { total: number; page: number; pageSize: number };
}

export interface UnreadNotificationCount {
  total: number;
  critical: number;
}
