import { TripStatus } from '@prisma/client';
import {
  MOVING_SPEED_THRESHOLD_KMH,
  OFFLINE_THRESHOLD_MULTIPLIER,
} from '../constants/monitoring.constants';

// Fase 29 -- funcoes puras (sem Prisma/IO) para o monitoramento operacional.
// TripStatus continua representando o ciclo de vida da viagem (Fase 14/25);
// estes tipos representam a SITUACAO ATUAL, derivada a cada consulta, nunca
// persistida.
export type MovementStatus = 'MOVING' | 'STOPPED' | 'UNKNOWN';
export type LocationFreshness = 'ONLINE' | 'STALE' | 'OFFLINE';
export type OperationalStatus =
  | 'MOVING'
  | 'STOPPED'
  | 'STALE'
  | 'OFF_ROUTE'
  | 'PAUSED'
  | 'COMPLETED'
  | 'UNKNOWN';

// MOVING/STOPPED a partir da velocidade do TrackingPoint, quando existir.
// Sem leitura de velocidade, nunca "adivinha" a partir de distancia/tempo
// entre pontos -- retorna UNKNOWN (secao 6: "nao criar falsa precisao").
export function computeMovementStatus(
  speedKmh: number | null,
  thresholdKmh: number = MOVING_SPEED_THRESHOLD_KMH,
): MovementStatus {
  if (speedKmh === null) return 'UNKNOWN';
  return speedKmh > thresholdKmh ? 'MOVING' : 'STOPPED';
}

// ONLINE/STALE/OFFLINE a partir de ha quanto tempo veio a ultima posicao.
// staleThresholdMinutes vem de TenantSettings.alertDelayThresholdMin (ja
// existente, configuravel por tenant) -- nunca um numero magico aqui.
export function computeLocationFreshness(
  lastTrackingAt: Date | null,
  now: Date,
  staleThresholdMinutes: number,
): LocationFreshness {
  if (!lastTrackingAt) return 'OFFLINE';
  const minutesSinceUpdate = (now.getTime() - lastTrackingAt.getTime()) / 60_000;
  if (minutesSinceUpdate > staleThresholdMinutes * OFFLINE_THRESHOLD_MULTIPLIER) return 'OFFLINE';
  if (minutesSinceUpdate > staleThresholdMinutes) return 'STALE';
  return 'ONLINE';
}

export interface OperationalStatusInput {
  tripStatus: TripStatus;
  lastTrackingAt: Date | null;
  speedKmh: number | null;
  hasUnresolvedDeviation: boolean;
  now: Date;
  staleThresholdMinutes: number;
}

// Estado operacional exibido no painel -- distinto de TripStatus (ciclo de
// vida). So calcula MOVING/STOPPED/OFF_ROUTE/STALE quando a viagem esta de
// fato em andamento (IN_PROGRESS); para os demais estados do ciclo de vida,
// o status operacional espelha diretamente o TripStatus (PAUSED/COMPLETED)
// ou UNKNOWN (ainda nao iniciada).
export function computeOperationalStatus(input: OperationalStatusInput): OperationalStatus {
  if (input.tripStatus === TripStatus.PAUSED) return 'PAUSED';
  if (input.tripStatus === TripStatus.COMPLETED || input.tripStatus === TripStatus.CANCELLED) {
    return 'COMPLETED';
  }
  if (input.tripStatus !== TripStatus.IN_PROGRESS) return 'UNKNOWN';

  const freshness = computeLocationFreshness(
    input.lastTrackingAt,
    input.now,
    input.staleThresholdMinutes,
  );
  if (freshness !== 'ONLINE') return 'STALE';
  if (input.hasUnresolvedDeviation) return 'OFF_ROUTE';

  const movement = computeMovementStatus(input.speedKmh);
  return movement === 'UNKNOWN' ? 'UNKNOWN' : movement;
}
