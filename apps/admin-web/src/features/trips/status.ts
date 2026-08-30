import type { EmptyTripReason } from '../../types/entities';
import type {
  DriverShiftStatus,
  TripDeliveryStopStatus,
  TripOccurrenceSeverity,
  TripOccurrenceStatus,
  TripPriority,
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

// Fase 67 (IN_PROGRESS adicionado na Fase 101)
export const TRIP_OCCURRENCE_STATUS_TONE: Record<TripOccurrenceStatus, Tone> = {
  OPEN: 'warning',
  IN_PROGRESS: 'info',
  RESOLVED: 'success',
  CANCELLED: 'neutral',
};

// LOW/MEDIUM/HIGH adicionados na Fase 101 (escala usada pelas ocorrencias de entrega).
export const TRIP_OCCURRENCE_SEVERITY_TONE: Record<TripOccurrenceSeverity, Tone> = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'danger',
  LOW: 'info',
  MEDIUM: 'warning',
  HIGH: 'danger',
};

export const DRIVER_SHIFT_STATUS_TONE: Record<DriverShiftStatus, Tone> = {
  OPEN: 'info',
  CLOSED: 'success',
  CANCELLED: 'neutral',
};

// Fase 88 (FAILED adicionado na Fase 99)
export const TRIP_DELIVERY_STOP_STATUS_TONE: Record<TripDeliveryStopStatus, Tone> = {
  PENDING: 'neutral',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  FAILED: 'danger',
};

// Fase 92
export const EMPTY_TRIP_REASON_TONE: Record<EmptyTripReason, Tone> = {
  NO_DELIVERIES_PLANNED: 'neutral',
  ALL_DELIVERIES_CANCELLED: 'warning',
  DELIVERIES_INCOMPLETE: 'warning',
  COMPLETED_DELIVERIES_INCONSISTENT: 'danger',
};

// Fase 114 -- Torre de Controle: Trip.priority (ja existente desde a criacao
// da viagem, ver TRIP_PRIORITY_LABELS em lib/labels.ts) exibida como badge.
export const TRIP_PRIORITY_TONE: Record<TripPriority, Tone> = {
  LOW: 'neutral',
  NORMAL: 'info',
  HIGH: 'warning',
  URGENT: 'danger',
};

// Fase 114 -- pior status de manutencao (evaluateMaintenancePlan, backend)
// entre os planos ativos do veiculo desta viagem.
export const MAINTENANCE_STATUS_LABELS: Record<'OK' | 'DUE_SOON' | 'OVERDUE' | 'UNKNOWN', string> = {
  OK: 'Em dia',
  DUE_SOON: 'Próxima',
  OVERDUE: 'Vencida',
  UNKNOWN: '—',
};

export const MAINTENANCE_STATUS_TONE: Record<'OK' | 'DUE_SOON' | 'OVERDUE' | 'UNKNOWN', Tone> = {
  OK: 'success',
  DUE_SOON: 'warning',
  OVERDUE: 'danger',
  UNKNOWN: 'neutral',
};
