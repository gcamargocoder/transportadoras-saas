import type { SyncStatus, TripStopType } from '../../types/enums';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

export const SYNC_STATUS_TONE: Record<SyncStatus, Tone> = {
  PENDING: 'warning',
  SYNCED: 'success',
  FAILED: 'danger',
};

export const TRIP_STOP_TYPE_TONE: Record<TripStopType, Tone> = {
  UNKNOWN: 'neutral',
  FUEL: 'info',
  REST: 'brand',
  MEAL: 'brand',
  MAINTENANCE: 'warning',
  OTHER: 'neutral',
};
