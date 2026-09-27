import type { FuelTankEntity } from '../../types/entities';

// Fase 5 -- classificacao visual do estado do tanque (normal/atencao/
// critico). Nunca inventa dado novo: deriva so de currentStockLiters/
// minStockLiters/occupancyPercent, todos ja calculados pelo backend.
// isLowStock (o unico limite que o backend ja possui) mapeia para
// "warning"; "critical" e um refinamento nao-oficial, so de apresentacao,
// usado apenas para destacar visualmente o hero -- nunca persistido nem
// enviado ao backend.
export type FuelTankSeverity = 'normal' | 'warning' | 'critical';

export function computeFuelTankSeverity(tank: FuelTankEntity): FuelTankSeverity {
  if (!tank.isLowStock) return 'normal';
  // Dentro de "estoque baixo": critico quando ja caiu a metade do minimo
  // configurado (mais grave que so "abaixo do minimo"), ou quando nao ha
  // minimo configurado e a ocupacao esta muito perto de vazio -- limite
  // universal de seguranca, nunca um minimo inventado em nome do tenant.
  if (tank.minStockLiters !== null) {
    return tank.currentStockLiters <= tank.minStockLiters / 2 ? 'critical' : 'warning';
  }
  return tank.occupancyPercent <= 10 ? 'critical' : 'warning';
}

export const FUEL_TANK_SEVERITY_LABEL: Record<FuelTankSeverity, string> = {
  normal: 'Normal',
  warning: 'Atenção',
  critical: 'Crítico',
};

// Paleta do liquido/hero por severidade -- diesel e ambar/marrom no estado
// normal; desloca para amarelo/vermelho conforme a severidade aumenta
// (mesmo principio de tone-by-severity ja usado em alert-severity.ts/BI 10).
export const FUEL_TANK_SEVERITY_LIQUID: Record<FuelTankSeverity, { from: string; to: string }> = {
  normal: { from: '#b45309', to: '#78350f' }, // ambar/marrom (diesel)
  warning: { from: '#d97706', to: '#92400e' },
  critical: { from: '#dc2626', to: '#991b1b' },
};

export const FUEL_TANK_SEVERITY_BADGE_TONE: Record<FuelTankSeverity, 'success' | 'warning' | 'danger'> = {
  normal: 'success',
  warning: 'warning',
  critical: 'danger',
};
