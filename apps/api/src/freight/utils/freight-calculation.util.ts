import { VehicleType } from '@prisma/client';

/// Representa uma FreightRule ja carregada do banco (numeros puros, nunca
/// Prisma.Decimal) -- funcoes puras deste arquivo nunca acessam o Prisma.
export interface FreightRuleCandidate {
  id: string;
  freightTableId: string;
  version: number;
  priority: number;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  originLocationId: string | null;
  destinationLocationId: string | null;
  originRegion: string | null;
  destinationRegion: string | null;
  cargoType: string | null;
  vehicleType: VehicleType | null;
  minWeightKg: number | null;
  maxWeightKg: number | null;
  minCubageM3: number | null;
  maxCubageM3: number | null;
  baseAmount: number | null;
  perKmAmount: number | null;
  perTonAmount: number | null;
  minimumAmount: number | null;
  tollAmount: number | null;
  riskAdditionalAmount: number | null;
  nightAdditionalAmount: number | null;
  dailyRateAmount: number | null;
  demurrageAmount: number | null;
  otherFees: FreightRuleFee[] | null;
}

export interface FreightRuleFee {
  label: string;
  amount: number;
}

export interface FreightMatchCriteria {
  originLocationId?: string | null;
  destinationLocationId?: string | null;
  originRegion?: string | null;
  destinationRegion?: string | null;
  cargoType?: string | null;
  vehicleType?: VehicleType | null;
  weightKg?: number | null;
  cubageM3?: number | null;
  /// Data de referencia para checar vigencia -- default "agora" quando
  /// omitido (nunca inferido de outra forma).
  asOf?: Date;
}

export interface FreightCalculationInput {
  distanceKm?: number | null;
  weightKg?: number | null;
  cubageM3?: number | null;
  nightService?: boolean;
  riskCargo?: boolean;
  dailyCount?: number;
  demurrageCount?: number;
}

export interface FreightQuoteBreakdown {
  ruleId: string;
  ruleVersion: number;
  freightTableId: string;
  baseAmount: number;
  additionsAmount: number;
  tollAmount: number;
  feesAmount: number;
  totalAmount: number;
}

// Um criterio da regra so restringe quando preenchido (nulo = "nao
// restringe por este criterio", secao 3 da Fase 59). Faixa de peso/cubagem:
// a regra so pode ser usada quando o dado correspondente foi informado --
// nunca assume peso/cubagem "zero" para uma regra que declara faixa.
function ruleMatches(rule: FreightRuleCandidate, criteria: FreightMatchCriteria, asOf: Date): boolean {
  if (rule.effectiveFrom > asOf) return false;
  if (rule.effectiveUntil && rule.effectiveUntil <= asOf) return false;
  if (rule.originLocationId && rule.originLocationId !== criteria.originLocationId) return false;
  if (rule.destinationLocationId && rule.destinationLocationId !== criteria.destinationLocationId) {
    return false;
  }
  if (rule.originRegion && rule.originRegion !== criteria.originRegion) return false;
  if (rule.destinationRegion && rule.destinationRegion !== criteria.destinationRegion) return false;
  if (rule.cargoType && rule.cargoType !== criteria.cargoType) return false;
  if (rule.vehicleType && rule.vehicleType !== criteria.vehicleType) return false;

  if (rule.minWeightKg !== null || rule.maxWeightKg !== null) {
    if (criteria.weightKg === null || criteria.weightKg === undefined) return false;
    if (rule.minWeightKg !== null && criteria.weightKg < rule.minWeightKg) return false;
    if (rule.maxWeightKg !== null && criteria.weightKg > rule.maxWeightKg) return false;
  }

  if (rule.minCubageM3 !== null || rule.maxCubageM3 !== null) {
    if (criteria.cubageM3 === null || criteria.cubageM3 === undefined) return false;
    if (rule.minCubageM3 !== null && criteria.cubageM3 < rule.minCubageM3) return false;
    if (rule.maxCubageM3 !== null && criteria.cubageM3 > rule.maxCubageM3) return false;
  }

  return true;
}

// Quantos criterios a regra efetivamente restringe -- usado para decidir
// determinism qual regra e "mais especifica" quando 2+ regras batem com os
// mesmos parametros (secao 21: nunca aproximacao heuristica).
function specificity(rule: FreightRuleCandidate): number {
  let score = 0;
  if (rule.originLocationId) score += 1;
  if (rule.destinationLocationId) score += 1;
  if (rule.originRegion) score += 1;
  if (rule.destinationRegion) score += 1;
  if (rule.cargoType) score += 1;
  if (rule.vehicleType) score += 1;
  if (rule.minWeightKg !== null || rule.maxWeightKg !== null) score += 1;
  if (rule.minCubageM3 !== null || rule.maxCubageM3 !== null) score += 1;
  return score;
}

/**
 * Selecao deterministica da regra aplicavel entre candidatas ja filtradas
 * por FreightTable/cliente (o service resolve isso antes de chamar aqui).
 * Prioridade, em ordem: (1) mais especifica (mais criterios restringindo
 * corretamente o pedido) vence; (2) em empate, maior `priority` explicito
 * vence; (3) em empate, `effectiveFrom` mais recente vence; (4) em empate
 * total, `id` em ordem lexicografica crescente vence -- garante um
 * resultado unico e reproduzivel mesmo quando 2 regras sao identicas em
 * tudo que importa comercialmente (nunca "a primeira que apareceu no
 * array", que dependeria da ordem de retorno do banco).
 */
export function selectApplicableFreightRule(
  rules: FreightRuleCandidate[],
  criteria: FreightMatchCriteria,
): FreightRuleCandidate | null {
  const asOf = criteria.asOf ?? new Date();
  const applicable = rules.filter((rule) => ruleMatches(rule, criteria, asOf));
  if (applicable.length === 0) return null;

  const sorted = [...applicable].sort((a, b) => {
    const specificityDiff = specificity(b) - specificity(a);
    if (specificityDiff !== 0) return specificityDiff;

    const priorityDiff = b.priority - a.priority;
    if (priorityDiff !== 0) return priorityDiff;

    const dateDiff = b.effectiveFrom.getTime() - a.effectiveFrom.getTime();
    if (dateDiff !== 0) return dateDiff;

    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });

  return sorted[0] ?? null;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Motor de calculo puro (secao 5 da Fase 59): base + adicionais + pedagio +
 * taxas = total. Nunca le/escreve banco, nunca formata para exibicao --
 * apenas numeros. O valor minimo (`minimumAmount`) e aplicado SOMENTE sobre
 * a composicao base+km+tonelada, nunca sobre pedagio/adicionais/taxas.
 */
export function computeFreightQuote(
  rule: FreightRuleCandidate,
  input: FreightCalculationInput,
): FreightQuoteBreakdown {
  const distanceKm = input.distanceKm ?? 0;
  const weightTon = (input.weightKg ?? 0) / 1000;

  let baseAmount =
    (rule.baseAmount ?? 0) + (rule.perKmAmount ?? 0) * distanceKm + (rule.perTonAmount ?? 0) * weightTon;
  if (rule.minimumAmount !== null && baseAmount < rule.minimumAmount) {
    baseAmount = rule.minimumAmount;
  }

  const additionsAmount =
    (input.riskCargo ? (rule.riskAdditionalAmount ?? 0) : 0) +
    (input.nightService ? (rule.nightAdditionalAmount ?? 0) : 0);

  const dailyCount = input.dailyCount ?? 0;
  const demurrageCount = input.demurrageCount ?? 0;
  const otherFeesTotal = (rule.otherFees ?? []).reduce((sum, fee) => sum + fee.amount, 0);
  const feesAmount =
    (rule.dailyRateAmount ?? 0) * dailyCount + (rule.demurrageAmount ?? 0) * demurrageCount + otherFeesTotal;

  const tollAmount = rule.tollAmount ?? 0;

  const totalAmount = baseAmount + additionsAmount + tollAmount + feesAmount;

  return {
    ruleId: rule.id,
    ruleVersion: rule.version,
    freightTableId: rule.freightTableId,
    baseAmount: round2(baseAmount),
    additionsAmount: round2(additionsAmount),
    tollAmount: round2(tollAmount),
    feesAmount: round2(feesAmount),
    totalAmount: round2(totalAmount),
  };
}
