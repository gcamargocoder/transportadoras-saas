import { Prisma } from '@prisma/client';

// Prisma.Decimal nao serializa para JSON como numero (viraria uma string/
// objeto) -- toda entity que expoe um campo Decimal do banco converte aqui
// antes de montar a resposta. Compartilhado entre modulos (fleet, trips...)
// para nao duplicar essa mesma conversao em cada mapper.
export function toNumberOrNull(value: Prisma.Decimal | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return value.toNumber();
}
