// Converte year/month (1-12) na janela [from, to] (ISO date, inicio/fim do
// mes em UTC) usada para filtrar os dashboards/conciliacao existentes por
// issueDate -- mesmo formato ja aceito por FindReceivablesDashboardQueryDto/
// FindPayablesDashboardQueryDto/FindFinanceReconciliationQueryDto (from/to
// IsDateString).
export function monthDateRange(year: number, month: number): { from: string; to: string } {
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { from: from.toISOString(), to: to.toISOString() };
}
