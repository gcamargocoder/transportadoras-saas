import { computeDurationMinutesOrThrow } from '../../trip-operations/utils/trip-stop-duration.util';

// Fase B -- duracao de um VehicleIdlePeriod no fechamento AUTOMATICO.
// REUTILIZA computeDurationMinutesOrThrow (Fase 25/43) -- NUNCA um segundo
// mecanismo de calculo. Diferenca: aqui um `endedAt` anterior ao `startedAt`
// (skew de relogio / dado inconsistente entre actualArrival e a proxima
// actualDeparture) e recortado para o proprio inicio -> duracao 0. NUNCA
// negativa e NUNCA lanca (o fechamento roda DENTRO da transacao de inicio
// da viagem; uma excecao aqui abortaria a partida da viagem).
//
// O CRUD administrativo (create/update explicitos) NAO usa esta funcao: la
// um endedAt < startedAt e um erro do operador e vira 400 (BadRequest), com
// a duracao calculada direto por computeDurationMinutesOrThrow.
export function computeIdlePeriodDurationMinutes(startedAt: Date, endedAt: Date): number {
  const safeEnd = endedAt.getTime() < startedAt.getTime() ? startedAt : endedAt;
  return computeDurationMinutesOrThrow(startedAt, safeEnd);
}
