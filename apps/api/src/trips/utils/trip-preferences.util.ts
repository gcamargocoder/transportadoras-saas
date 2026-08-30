const PREFERENCES_KEY = 'requirePreTripChecklist';

// Fase 111 -- le TenantSettings.preferences (JSON livre, ja existente),
// mesmo padrao ja estabelecido por resolveStopDurationThresholds
// (fleet-operations/utils/stop-duration-thresholds.util.ts, Fase 44): nunca
// confia cegamente no JSON, default seguro (false = comportamento identico
// ao de antes desta fase, nenhum tenant existente e afetado a menos que
// ative explicitamente). Quando true, TripsService.assertCanStart passa a
// exigir um ChecklistExecution PRE_TRIP concluido (e sem nao-conformidade
// critica) para a viagem antes de permitir o inicio.
export function resolveRequirePreTripChecklist(preferences: unknown): boolean {
  if (typeof preferences !== 'object' || preferences === null || Array.isArray(preferences)) {
    return false;
  }
  const raw = (preferences as Record<string, unknown>)[PREFERENCES_KEY];
  return raw === true;
}
