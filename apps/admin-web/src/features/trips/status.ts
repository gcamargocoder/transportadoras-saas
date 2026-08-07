import type { TripStatus } from '../../types/enums';

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
