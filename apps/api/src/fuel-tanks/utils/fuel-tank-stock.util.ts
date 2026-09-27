import { ConflictException } from '@nestjs/common';
import { FuelTankMovementType, FuelTankStatus } from '@prisma/client';

// Mesmo espirito de part-stock.util.ts (Fase 83): FuelTank.isLowStock e um
// cache persistido, sempre recalculado por esta funcao dentro da mesma
// transacao de qualquer movimentacao. false quando minStockLiters nao
// informado -- nunca uma comparacao inventada sem referencia real.
export function computeIsLowStock(currentStockLiters: number, minStockLiters: number | null): boolean {
  if (minStockLiters === null) return false;
  return currentStockLiters <= minStockLiters;
}

// Percentual ocupado para exibicao (Frontend, secao 11 da Fase 1) --
// arredondado a 1 casa decimal. capacityLiters sempre > 0 (validado na
// criacao do tanque), mas a guarda evita divisao por zero em dados legados.
export function computeOccupancyPercent(currentStockLiters: number, capacityLiters: number): number {
  if (capacityLiters <= 0) return 0;
  return Math.round((currentStockLiters / capacityLiters) * 1000) / 10;
}

// Efeito de uma movimentacao no saldo, isolado como funcao pura testavel
// (mesmo padrao de applyMovementDelta em part-stock.util.ts). INITIAL_
// BALANCE/RECEIPT/INTERNAL_FUELING: quantityLiters sempre positivo, o sinal
// vem do type. ADJUSTMENT: quantityLiters e o delta com sinal, aplicado
// diretamente.
export function applyTankMovementDelta(
  currentStockLiters: number,
  type: FuelTankMovementType,
  quantityLiters: number,
): number {
  if (type === FuelTankMovementType.INTERNAL_FUELING) return currentStockLiters - quantityLiters;
  if (type === FuelTankMovementType.ADJUSTMENT) return currentStockLiters + quantityLiters;
  return currentStockLiters + quantityLiters;
}

// Nenhuma movimentacao pode levar o saldo abaixo de zero -- o tanque nunca
// suporta estoque negativo (secao 1 da Fase 1).
export function assertTankBalanceNotNegative(nextBalanceLiters: number, tankName: string): void {
  if (nextBalanceLiters < 0) {
    throw new ConflictException(
      `Estoque insuficiente no tanque "${tankName}": a movimentacao deixaria o saldo negativo.`,
    );
  }
}

// Nem acima da capacidade fisica do tanque (secao 1 da Fase 1) -- limite
// simetrico ao de saldo negativo, mesma razao de existir.
export function assertTankBalanceWithinCapacity(
  nextBalanceLiters: number,
  capacityLiters: number,
  tankName: string,
): void {
  if (nextBalanceLiters > capacityLiters) {
    throw new ConflictException(
      `A movimentacao excede a capacidade do tanque "${tankName}" (${capacityLiters} L).`,
    );
  }
}

// Tanque INACTIVE rejeita qualquer nova movimentacao (secao 1 da Fase 1) --
// reativar e o unico caminho para voltar a aceitar movimentacoes.
export function assertTankActiveForMovement(status: FuelTankStatus, tankName: string): void {
  if (status !== FuelTankStatus.ACTIVE) {
    throw new ConflictException(`O tanque "${tankName}" esta inativo e nao aceita novas movimentacoes.`);
  }
}

// Fase 4 -- divergencia percentual da conferencia fisica, calculada na
// leitura (nunca persistida) a partir de dois valores ja congelados
// (theoreticalStockLiters/divergenceLiters), sem segunda fonte de verdade.
// Nulo quando o teorico e 0 (divisao indefinida, nunca inventada).
export function computeDivergencePercent(theoreticalStockLiters: number, divergenceLiters: number): number | null {
  if (theoreticalStockLiters === 0) return null;
  return Math.round((divergenceLiters / theoreticalStockLiters) * 1000) / 10;
}
