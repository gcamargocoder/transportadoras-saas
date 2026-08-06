// Calcula a data-limite usada pelo filtro "CNH vencendo em N dias" -- uma
// CNH "vence" no filtro quando cnhExpiresAt <= hoje + N dias (inclui CNHs ja
// vencidas, util para o gestor identificar pendencias urgentes).
export function cnhExpiringThreshold(days: number, now: Date = new Date()): Date {
  const threshold = new Date(now);
  threshold.setDate(threshold.getDate() + days);
  return threshold;
}
