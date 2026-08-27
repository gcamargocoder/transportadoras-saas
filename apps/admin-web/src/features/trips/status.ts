import type { EmptyTripReason } from '../../types/entities';
import type {
  DriverShiftStatus,
  TripDeliveryStopStatus,
  TripOccurrenceSeverity,
  TripOccurrenceStatus,
  TripStatus,
} from '../../types/enums';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

export const TRIP_STATUS_TONE: Record<TripStatus, Tone> = {
  PLANNED: 'neutral',
  WAITING_DRIVER: 'warning',
  WAITING_DEPARTURE: 'warning',
  IN_PROGRESS: 'info',
  PAUSED: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

export const TRIP_STATUS_OPTIONS: TripStatus[] = [
  'PLANNED',
  'WAITING_DRIVER',
  'WAITING_DEPARTURE',
  'IN_PROGRESS',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
];

// Fase 67
export const TRIP_OCCURRENCE_STATUS_TONE: Record<TripOccurrenceStatus, Tone> = {
  OPEN: 'warning',
  RESOLVED: 'success',
  CANCELLED: 'neutral',
};

export const TRIP_OCCURRENCE_SEVERITY_TONE: Record<TripOccurrenceSeverity, Tone> = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'danger',
};

export const DRIVER_SHIFT_STATUS_TONE: Record<DriverShiftStatus, Tone> = {
  OPEN: 'info',
  CLOSED: 'success',
  CANCELLED: 'neutral',
};

// Fase 88
export const TRIP_DELIVERY_STOP_STATUS_TONE: Record<TripDeliveryStopStatus, Tone> = {
  PENDING: 'neutral',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

// Fase 92
export const EMPTY_TRIP_REASON_TONE: Record<EmptyTripReason, Tone> = {
  NO_DELIVERIES_PLANNED: 'neutral',
  ALL_DELIVERIES_CANCELLED: 'warning',
  DELIVERIES_INCOMPLETE: 'warning',
  COMPLETED_DELIVERIES_INCONSISTENT: 'danger',
};
