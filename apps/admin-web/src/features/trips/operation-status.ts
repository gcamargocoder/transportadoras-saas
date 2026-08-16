import type { SyncStatus, TripStopStatus, TripStopType } from '../../types/enums';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

export const SYNC_STATUS_TONE: Record<SyncStatus, Tone> = {
  PENDING: 'warning',
  SYNCED: 'success',
  FAILED: 'danger',
};

// Fase 43 -- catalogo ampliado (mesmo agrupamento de
// trip-stop-type-groups.constants.ts no backend): OPERACIONAL/brand,
// VEICULO/warning, TRANSITO/danger, MOTORISTA/info, ADMINISTRATIVO/neutral.
export const TRIP_STOP_TYPE_TONE: Record<TripStopType, Tone> = {
  UNKNOWN: 'neutral',
  FUEL: 'info',
  REST: 'brand',
  MEAL: 'brand',
  MAINTENANCE: 'warning',
  OTHER: 'neutral',
  LOADING: 'brand',
  UNLOADING: 'brand',
  WAITING_LOADING: 'brand',
  WAITING_UNLOADING: 'brand',
  YARD: 'brand',
  CUSTOMER: 'brand',
  GARAGE: 'brand',
  BREAKDOWN: 'danger',
  TIRE: 'warning',
  CONGESTION: 'danger',
  ACCIDENT: 'danger',
  ROAD_CLOSURE: 'danger',
  INSPECTION: 'danger',
  PERSONAL_NEED: 'info',
  DOCUMENTATION: 'neutral',
  WAITING_AUTHORIZATION: 'neutral',
};

export const TRIP_STOP_STATUS_TONE: Record<TripStopStatus, Tone> = {
  OPEN: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};
