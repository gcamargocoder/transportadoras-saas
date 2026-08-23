import { buildMonthlyRange } from '../../common/utils/monthly-series.util';

const MAX_MONTHS_BACK = 36;
const DEFAULT_MONTHS_BACK = 12;

// Fase 74 -- resolve from/to (secao 3 do pedido) em (monthsBack, reference)
// para reaproveitar buildMonthlyRange (Fase 19) sem duplicar a logica de
// "como definir os limites de um mes". Sem from/to: ultimos 12 meses
// terminando hoje (mesma janela padrao ja usada por aggregateMonthlySeries
// em toda a Fase 51/60). Nunca inventa uma janela maior que 36 meses
// (protege contra from absurdamente antigo gerando um findMany gigante).
export function resolveMonthlyWindow(from?: string, to?: string): { monthsBack: number; reference: Date } {
  const reference = to ? new Date(to) : new Date();
  if (!from) {
    return { monthsBack: DEFAULT_MONTHS_BACK, reference };
  }
  const fromDate = new Date(from);
  const monthsSpan =
    (reference.getUTCFullYear() - fromDate.getUTCFullYear()) * 12 +
    (reference.getUTCMonth() - fromDate.getUTCMonth()) +
    1;
  const monthsBack = Math.min(Math.max(monthsSpan, 1), MAX_MONTHS_BACK);
  return { monthsBack, reference };
}

export { buildMonthlyRange };
