import { ConflictException } from '@nestjs/common';
import { PartStockMovementType } from '@prisma/client';

// Funcao pura (mesmo espirito de maintenance-status-transition.util.ts) --
// Part.isLowStock e um cache persistido (ver comentario do model Part no
// schema), sempre recalculado por esta funcao dentro da mesma transacao de
// qualquer movimentacao. false quando minStock nao informado -- nunca uma
// comparacao inventada sem referencia real.
export function computeIsLowStock(currentStock: number, minStock: number | null): boolean {
  if (minStock === null) return false;
  return currentStock <= minStock;
}

// Efeito de uma movimentacao no saldo, isolado como funcao pura testavel.
// IN/OUT: quantity sempre positivo (validado no DTO), o sinal vem do type.
// ADJUSTMENT: quantity e o delta com sinal, aplicado diretamente.
export function applyMovementDelta(
  currentStock: number,
  type: PartStockMovementType,
  quantity: number,
): number {
  if (type === PartStockMovementType.IN) return currentStock + quantity;
  if (type === PartStockMovementType.OUT) return currentStock - quantity;
  return currentStock + quantity;
}

// Nenhuma movimentacao (OUT ou ADJUSTMENT negativo) pode levar o saldo
// abaixo de zero -- o modelo atual nao suporta estoque negativo
// explicitamente (secao 6 da Fase 83: "nao permitir saida sem estoque
// suficiente, salvo se o modelo atual explicitamente permitir estoque
// negativo" -- nao permite).
export function assertStockNotNegative(nextStock: number, partName: string): void {
  if (nextStock < 0) {
    throw new ConflictException(
      `Estoque insuficiente para "${partName}": a movimentacao deixaria o saldo negativo.`,
    );
  }
}
