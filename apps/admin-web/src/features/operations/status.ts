import type { LocationFreshness, MovementStatus, OperationalStatus } from '../../types/entities';

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

// Fase 29 -- rotulos/tons do status OPERACIONAL (situacao atual, derivada a
// cada consulta), distinto do TRIP_STATUS_LABELS/TONE (ciclo de vida,
// features/trips/status.ts) ja existente -- nunca reutiliza o mesmo mapa
// para os dois conceitos.
export const OPERATIONAL_STATUS_LABELS: Record<OperationalStatus, string> = {
  MOVING: 'Em movimento',
  STOPPED: 'Parado',
  STALE: 'Sem atualização',
  OFF_ROUTE: 'Fora da rota',
  PAUSED: 'Pausada',
  COMPLETED: 'Concluída',
  UNKNOWN: 'Indefinido',
};

export const OPERATIONAL_STATUS_TONE: Record<OperationalStatus, BadgeTone> = {
  MOVING: 'success',
  STOPPED: 'info',
  STALE: 'warning',
  OFF_ROUTE: 'danger',
  PAUSED: 'neutral',
  COMPLETED: 'neutral',
  UNKNOWN: 'neutral',
};

export const LOCATION_FRESHNESS_LABELS: Record<LocationFreshness, string> = {
  ONLINE: 'Online',
  STALE: 'Desatualizada',
  OFFLINE: 'Sem atualização de localização',
};

export const LOCATION_FRESHNESS_TONE: Record<LocationFreshness, BadgeTone> = {
  ONLINE: 'success',
  STALE: 'warning',
  OFFLINE: 'danger',
};

export const MOVEMENT_STATUS_LABELS: Record<MovementStatus, string> = {
  MOVING: 'Em movimento',
  STOPPED: 'Parado',
  UNKNOWN: 'Indefinido',
};
