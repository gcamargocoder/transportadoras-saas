// Fase 45 -- avalia se um MaintenancePlan esta vencido/proximo do
// vencimento, a partir de dados REAIS (nunca inventados): a ultima
// VehicleMaintenance COMPLETED vinculada ao plano (referencia de "ultimo
// servico") e a quilometragem ATUAL do veiculo (Vehicle.odometerKm, ja
// existente). Pura -- nenhuma consulta ao banco aqui, testavel isolada.
//
// Plano sem NENHUM servico concluido ainda: status UNKNOWN -- sem uma
// ultima manutencao, nao ha ponto de partida real para calcular "proxima"
// (nunca inventamos uma data/km de referencia). intervalHours NUNCA e
// avaliado -- o sistema nao rastreia horas de motor atuais em nenhum lugar
// (documentado em docs/fleet-maintenance-dashboard.md).
export type MaintenancePlanEvaluationStatus = 'OK' | 'DUE_SOON' | 'OVERDUE' | 'UNKNOWN';

export interface MaintenancePlanForEvaluation {
  intervalKm: number | null;
  intervalDays: number | null;
  alertBeforeKm: number | null;
  alertBeforeDays: number | null;
}

export interface MaintenancePlanLastService {
  completedAt: Date | null;
  odometerKm: number | null;
}

export interface MaintenancePlanEvaluation {
  status: MaintenancePlanEvaluationStatus;
  dueOdometerKm: number | null;
  dueDate: Date | null;
  overdueByKm: number | null;
  overdueByDays: number | null;
}

const UNKNOWN_EVALUATION: MaintenancePlanEvaluation = {
  status: 'UNKNOWN',
  dueOdometerKm: null,
  dueDate: null,
  overdueByKm: null,
  overdueByDays: null,
};

export function evaluateMaintenancePlan(
  plan: MaintenancePlanForEvaluation,
  lastService: MaintenancePlanLastService | null,
  currentOdometerKm: number | null,
  now: Date,
): MaintenancePlanEvaluation {
  if (!lastService) return UNKNOWN_EVALUATION;

  let dueOdometerKm: number | null = null;
  let overdueByKm: number | null = null;
  let kmStatus: MaintenancePlanEvaluationStatus = 'UNKNOWN';
  if (plan.intervalKm !== null && lastService.odometerKm !== null && currentOdometerKm !== null) {
    dueOdometerKm = lastService.odometerKm + plan.intervalKm;
    const remainingKm = dueOdometerKm - currentOdometerKm;
    if (remainingKm <= 0) {
      kmStatus = 'OVERDUE';
      overdueByKm = -remainingKm;
    } else if (plan.alertBeforeKm !== null && remainingKm <= plan.alertBeforeKm) {
      kmStatus = 'DUE_SOON';
    } else {
      kmStatus = 'OK';
    }
  }

  let dueDate: Date | null = null;
  let overdueByDays: number | null = null;
  let dateStatus: MaintenancePlanEvaluationStatus = 'UNKNOWN';
  if (plan.intervalDays !== null && lastService.completedAt !== null) {
    dueDate = new Date(lastService.completedAt.getTime() + plan.intervalDays * 24 * 60 * 60 * 1000);
    const remainingMs = dueDate.getTime() - now.getTime();
    const remainingDays = remainingMs / (24 * 60 * 60 * 1000);
    if (remainingDays <= 0) {
      dateStatus = 'OVERDUE';
      overdueByDays = Math.ceil(-remainingDays);
    } else if (plan.alertBeforeDays !== null && remainingDays <= plan.alertBeforeDays) {
      dateStatus = 'DUE_SOON';
    } else {
      dateStatus = 'OK';
    }
  }

  if (kmStatus === 'UNKNOWN' && dateStatus === 'UNKNOWN') return UNKNOWN_EVALUATION;

  // OVERDUE por qualquer criterio vence DUE_SOON, que vence OK -- o plano
  // esta vencido se JA vencer por km OU por data (o que ocorrer primeiro).
  const statuses = [kmStatus, dateStatus].filter((s) => s !== 'UNKNOWN');
  const status: MaintenancePlanEvaluationStatus = statuses.includes('OVERDUE')
    ? 'OVERDUE'
    : statuses.includes('DUE_SOON')
      ? 'DUE_SOON'
      : 'OK';

  return { status, dueOdometerKm, dueDate, overdueByKm, overdueByDays };
}
