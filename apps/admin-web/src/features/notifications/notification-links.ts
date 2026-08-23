import type { NotificationEntity } from '../../types/entities';

// Fase 69 -- resolve a rota de origem de uma notificacao. Usa SOMENTE
// rotas que realmente existem no projeto (nunca uma URL inventada); null
// quando a origem nao tem uma tela dedicada navegavel hoje (o usuario ainda
// ve titulo/mensagem/detalhe, so nao ha "abrir origem").
export function resolveNotificationLink(notification: NotificationEntity): string | null {
  const metadata = notification.metadata ?? {};
  const tripId = typeof metadata.tripId === 'string' ? metadata.tripId : undefined;
  const vehicleId = typeof metadata.vehicleId === 'string' ? metadata.vehicleId : undefined;

  switch (notification.entityType) {
    case 'TripOccurrence':
      return tripId ? `/trips/${tripId}` : null;
    case 'Vehicle':
      return `/vehicles/${notification.entityId}`;
    case 'VehicleMaintenance':
      return vehicleId ? `/vehicles/${vehicleId}` : null;
    case 'Tire':
      return `/tires/${notification.entityId}`;
    case 'FuelSupply':
      return vehicleId ? `/vehicles/${vehicleId}` : null;
    case 'FiscalDocument':
      return tripId ? `/trips/${tripId}` : '/operations/fleet/fiscal';
    case 'Trip':
      return `/trips/${notification.entityId}`;
    case 'Driver':
      return `/drivers/${notification.entityId}`;
    case 'TripBilling':
      return tripId ? `/trips/${tripId}` : '/operations/fleet/billing';
    default:
      return null;
  }
}
