import { TripStopType } from '@prisma/client';
import { DEFAULT_STOP_DURATION_THRESHOLDS_MINUTES } from '../constants/fleet-operations-alerts.constants';

export type StopDurationThresholds = Partial<Record<TripStopType, number>>;

const PREFERENCES_KEY = 'stopDurationThresholdsMinutes';

// Fase 44 -- le TenantSettings.preferences (JSON livre, ja existente) e
// mescla com os limites padrao (DEFAULT_STOP_DURATION_THRESHOLDS_MINUTES).
// Nunca confia cegamente no JSON: chaves que nao sao um TripStopType valido
// ou valores que nao sao numero positivo finito sao ignorados (um blob
// malformado nunca pode quebrar o dashboard inteiro). Tenant override
// sempre vence sobre o padrao.
export function resolveStopDurationThresholds(preferences: unknown): StopDurationThresholds {
  const thresholds: StopDurationThresholds = { ...DEFAULT_STOP_DURATION_THRESHOLDS_MINUTES };

  const raw = isPlainObject(preferences) ? preferences[PREFERENCES_KEY] : undefined;
  if (!isPlainObject(raw)) return thresholds;

  for (const [key, value] of Object.entries(raw)) {
    if (!isTripStopType(key)) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue;
    thresholds[key] = value;
  }
  return thresholds;
}

// null = nenhum limite configurado (padrao ou tenant) para este tipo --
// nunca gera alerta, nunca um limite inventado.
export function getStopDurationThreshold(
  thresholds: StopDurationThresholds,
  type: TripStopType,
): number | null {
  return thresholds[type] ?? null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTripStopType(key: string): key is TripStopType {
  return key in TripStopType;
}
