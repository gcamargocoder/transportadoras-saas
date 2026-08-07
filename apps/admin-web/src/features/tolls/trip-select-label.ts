import type { TripEntity } from '../../types/entities';
import { formatDate } from '../../utils/format';

export function tripSelectLabel(trip: TripEntity): string {
  const plate = trip.vehiclePlate ? ` · ${trip.vehiclePlate}` : '';
  return `${trip.originName} → ${trip.destinationName}${plate} (${formatDate(trip.plannedDeparture)})`;
}
