// Fase 62 -- status de vencimento de documento, usado por
// VehicleDocumentsService/VehicleOverviewService para indicadores e
// alertas. Mesmo limiar (30 dias) ja usado por cnhExpiringThreshold
// (drivers/utils/cnh-expiry.util.ts) para "vencendo em breve".
export type DocumentExpiryStatus = 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'NO_EXPIRY';

const EXPIRING_SOON_THRESHOLD_DAYS = 30;

export function resolveDocumentExpiryStatus(
  expiresAt: Date | null,
  now: Date = new Date(),
  thresholdDays: number = EXPIRING_SOON_THRESHOLD_DAYS,
): DocumentExpiryStatus {
  if (!expiresAt) return 'NO_EXPIRY';

  const diffMs = expiresAt.getTime() - now.getTime();
  if (diffMs < 0) return 'EXPIRED';

  const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
  if (diffMs <= thresholdMs) return 'EXPIRING_SOON';

  return 'VALID';
}
