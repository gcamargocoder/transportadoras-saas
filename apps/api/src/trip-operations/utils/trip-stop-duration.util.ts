import { BadRequestException } from '@nestjs/common';

// Fase 43 -- extraido de TripStopsService para ser testavel como funcao pura
// (secao 30 do pedido: "calculo de duracao"/"validacao de intervalo" sem
// precisar instanciar o service com PrismaService/AuditService). Mesma regra
// desde a Fase 25: duracao SEMPRE calculada no backend (endedAt - startedAt),
// nunca aceita do cliente; nunca negativa.
export function computeDurationMinutesOrThrow(startedAt: Date, endedAt: Date): number {
  const diffMs = endedAt.getTime() - startedAt.getTime();
  if (diffMs < 0) {
    throw new BadRequestException('endedAt nao pode ser anterior a startedAt.');
  }
  return Math.round(diffMs / 60_000);
}
