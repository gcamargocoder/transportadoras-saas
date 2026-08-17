// Mesma prioridade ja usada por FreightPricingService.applyRevenue (Fase
// 59): contratado -> final -> estimado, o primeiro disponivel. Extraida
// aqui como funcao pura reutilizavel pelo modulo de faturamento
// operacional (Fase 60) sem duplicar a logica -- FreightPricingService
// continua com sua propria copia inline (nao alterada, para nao arriscar
// regressao em codigo ja testado da Fase 59).
export interface TripFreightAmounts {
  contractedAmount: number | null;
  finalAmount: number | null;
  estimatedAmount: number | null;
}

export function resolveTripFreightBestAmount(freight: TripFreightAmounts | null): number | null {
  if (!freight) return null;
  if (freight.contractedAmount !== null) return freight.contractedAmount;
  if (freight.finalAmount !== null) return freight.finalAmount;
  if (freight.estimatedAmount !== null) return freight.estimatedAmount;
  return null;
}
