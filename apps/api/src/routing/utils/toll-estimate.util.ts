// Estimativa de pedagio por praca (Fase 26) = TollPlaza.pricePerAxle * eixos.
// Formula igual a computeExpectedAmount (Fase 22), mas com semantica de nulo
// DIFERENTE de proposito: computeExpectedAmount devolve 0 quando o preco e
// desconhecido (porque o chamador la rastreia "preco conhecido" a parte, via
// computeAuditVerdict(pricePerAxleKnown, ...)). Aqui, para RoutePlanToll,
// "preco desconhecido" precisa continuar sendo null (nunca zero) porque nao
// existe outro lugar guardando essa distincao -- e o requisito explicito da
// Fase 26: "nunca assumir tarifa zero como tarifa valida". Por isso NAO
// reaproveita computeExpectedAmount diretamente aqui.
export function estimateTollAmount(pricePerAxle: number | null, axleCount: number | null): number | null {
  if (pricePerAxle === null || axleCount === null) return null;
  return Math.round(pricePerAxle * axleCount * 100) / 100;
}
