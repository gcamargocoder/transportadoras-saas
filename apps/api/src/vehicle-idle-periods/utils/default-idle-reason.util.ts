import { VehicleIdleReason } from '@prisma/client';

// Fase B -- motivo INICIAL de um VehicleIdlePeriod criado automaticamente
// (source=AUTO). Configuravel por tenant via
// TenantSettings.preferences.defaultIdleReason (JSON livre ja existente --
// SEM migration, mesmo padrao de resolveStopDurationThresholds /
// resolveIdleAlertThresholdMinutes). Nunca confia cegamente no JSON: valor
// ausente/invalido cai no default seguro.
//
// Default AGUARDANDO_ORDEM (nao OUTRO): um periodo auto-criado representa
// "veiculo concluiu a viagem e esta entre operacoes, aguardando a proxima
// ordem" -- a informacao que o sistema DE FATO conhece nesse instante. O
// admin corrige depois (secao 6) se o motivo real for outro.
const PREFERENCES_KEY = 'defaultIdleReason';
export const FALLBACK_DEFAULT_IDLE_REASON: VehicleIdleReason = VehicleIdleReason.AGUARDANDO_ORDEM;

export function resolveDefaultIdleReason(preferences: unknown): VehicleIdleReason {
  if (typeof preferences !== 'object' || preferences === null || Array.isArray(preferences)) {
    return FALLBACK_DEFAULT_IDLE_REASON;
  }
  const raw = (preferences as Record<string, unknown>)[PREFERENCES_KEY];
  if (typeof raw === 'string' && raw in VehicleIdleReason) {
    return raw as VehicleIdleReason;
  }
  return FALLBACK_DEFAULT_IDLE_REASON;
}
