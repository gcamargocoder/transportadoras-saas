import { TripStatus } from '@prisma/client';
import { computeDurationMinutesOrThrow } from '../../trip-operations/utils/trip-stop-duration.util';

// ============================================================================
// FASE A -- TEMPO OCIOSO ENTRE OPERACOES (auditoria de downtime).
//
// Calculo PURO (sem Prisma/IO) do periodo em que um veiculo ficou SEM VIAGEM
// entre uma viagem concluida e a proxima viagem iniciada. NAO cria model
// novo, NAO altera schema -- deriva tudo de dados que ja existem
// (Trip.actualArrival/actualDeparture/status + VehicleMaintenance).
//
// NAO confundir com parada DENTRO da viagem (TripStop -- congestionamento,
// descanso, abastecimento, carga/descarga): aquilo e o dashboard
// `fleet-operations/downtime-cost`, que le TripStop. Aqui e o intervalo
// entre `actualArrival` de uma viagem e `actualDeparture` da seguinte.
//
// Reaproveita `computeDurationMinutesOrThrow` (trip-operations/utils) para o
// calculo de duracao em minutos -- mesma convencao (Math.round(ms/60000),
// nunca negativa). Guardamos a ordem antes de chamar (a funcao existente
// lanca em intervalo invertido); aqui um intervalo invertido/invalido nunca
// e erro -- so e ignorado (regra 2 do pedido).
// ============================================================================

// Viagens IN_PROGRESS/PAUSED tem `actualDeparture` mas ainda nao tem
// `actualArrival` -- fecham a ociosidade anterior e indicam que o veiculo
// NAO esta ocioso agora. Mesma lista de VehicleAvailabilityService
// (ACTIVE_TRIP_STATUSES), redefinida aqui para manter a util sem
// dependencia de service (array pequeno, mesmo criterio da NotificationsService).
const ACTIVE_TRIP_STATUSES: readonly TripStatus[] = [TripStatus.IN_PROGRESS, TripStatus.PAUSED];

export interface IdleTripBoundary {
  tripId: string;
  status: TripStatus;
  actualDeparture: Date | null;
  actualArrival: Date | null;
  /// Rotulo do destino da viagem -- usado apenas para "ultimo destino
  /// conhecido" da ociosidade (regra 8). Nunca inventado.
  destinationLabel: string | null;
}

// Intervalo de manutencao (VehicleMaintenance). `end` nulo = OS ainda sem
// data de conclusao -- tratada como "ate agora" no calculo de sobreposicao,
// nunca alem do fim da propria ociosidade.
export interface MaintenanceInterval {
  start: Date;
  end: Date | null;
}

export interface IdleSegment {
  /// Viagem cuja chegada abriu este periodo ocioso.
  previousTripId: string;
  previousArrival: Date;
  previousDestinationLabel: string | null;
  /// Viagem cuja partida encerrou o periodo -- nulo quando o veiculo
  /// segue ocioso ate agora (regra 3).
  nextTripId: string | null;
  nextDeparture: Date | null;
  idleStart: Date;
  /// Nulo quando ainda ocioso (regra 3 -- "parado desde", estimativa ate NOW).
  idleEnd: Date | null;
  isCurrent: boolean;
  totalMinutes: number;
}

function isValidDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

// Duracao em minutos de um intervalo [start, end] JA validado como nao
// invertido -- delega para o utilitario de duracao existente
// (computeDurationMinutesOrThrow). Nunca chamada com end < start.
function minutesBetween(start: Date, end: Date): number {
  return computeDurationMinutesOrThrow(start, end);
}

// Une intervalos [start,end] que se sobrepoem OU se tocam, em uma unica
// passada apos ordenar por inicio. Base para "nao duplicar minutos" quando
// ha varias manutencoes no mesmo periodo ocioso (regra 5).
export function mergeIntervals(intervals: { start: Date; end: Date }[]): { start: Date; end: Date }[] {
  const valid = intervals
    .filter((i) => isValidDate(i.start) && isValidDate(i.end) && i.end.getTime() > i.start.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const merged: { start: Date; end: Date }[] = [];
  for (const current of valid) {
    const last = merged[merged.length - 1];
    if (last && current.start.getTime() <= last.end.getTime()) {
      if (current.end.getTime() > last.end.getTime()) last.end = current.end;
    } else {
      merged.push({ start: new Date(current.start), end: new Date(current.end) });
    }
  }
  return merged;
}

// Minutos de [rangeStart, rangeEnd] cobertos por manutencao. Cada intervalo
// de manutencao e recortado para dentro do periodo ocioso (OS em aberto ->
// termina no fim do proprio periodo ocioso, NUNCA alem); os recortes sao
// unidos (mergeIntervals) antes de somar, entao 2 manutencoes que se
// sobrepoem contam uma vez so. O resultado nunca passa da duracao total do
// periodo. NAO altera VehicleMaintenance.downtimeMinutes -- so lê datas.
export function computeMaintenanceOverlapMinutes(
  rangeStart: Date,
  rangeEnd: Date,
  maintenances: MaintenanceInterval[],
): number {
  if (!isValidDate(rangeStart) || !isValidDate(rangeEnd) || rangeEnd.getTime() <= rangeStart.getTime()) {
    return 0;
  }
  const clipped: { start: Date; end: Date }[] = [];
  for (const m of maintenances) {
    if (!isValidDate(m.start)) continue;
    const mEnd = isValidDate(m.end) ? m.end : rangeEnd;
    const start = new Date(Math.max(m.start.getTime(), rangeStart.getTime()));
    const end = new Date(Math.min(mEnd.getTime(), rangeEnd.getTime()));
    if (end.getTime() > start.getTime()) clipped.push({ start, end });
  }
  const merged = mergeIntervals(clipped);
  const total = merged.reduce((sum, i) => sum + minutesBetween(i.start, i.end), 0);
  const cap = minutesBetween(rangeStart, rangeEnd);
  return Math.min(total, cap);
}

// Ordena as viagens de UM veiculo cronologicamente e calcula cada periodo
// ocioso entre elas (regra 2). Uma viagem so entra no calculo se tiver ao
// menos um dos timestamps (actualDeparture/actualArrival) valido -- as
// demais sao ignoradas, nunca inventadas.
//
// Regras aplicadas:
//  - gap = actualArrival da viagem anterior -> actualDeparture da proxima;
//  - gap invertido/negativo (proxima partiu antes da anterior chegar) e
//    ignorado, nunca vira duracao negativa;
//  - gap de duracao zero e mantido explicitamente (totalMinutes = 0);
//  - se a ultima viagem concluida nao tem nenhuma viagem posterior E o
//    veiculo NAO esta em viagem ativa (IN_PROGRESS/PAUSED), o periodo
//    corrente vai de actualArrival ate `now` (isCurrent = true, idleEnd
//    nulo -- "parado desde", estimativa, regra 3);
//  - veiculo em viagem ativa agora nunca produz periodo corrente.
export function computeIdleSegments(trips: IdleTripBoundary[], now: Date): IdleSegment[] {
  const usable = trips.filter((t) => isValidDate(t.actualDeparture) || isValidDate(t.actualArrival));

  // Chave de ordenacao: a partida quando existir (inicio real da viagem na
  // linha do tempo), senao a chegada. Viagens sem nenhuma das duas ja foram
  // removidas acima.
  const sortKey = (t: IdleTripBoundary): number =>
    (isValidDate(t.actualDeparture) ? t.actualDeparture : (t.actualArrival as Date)).getTime();
  const sorted = [...usable].sort((a, b) => sortKey(a) - sortKey(b));

  const hasActiveTrip = sorted.some((t) => ACTIVE_TRIP_STATUSES.includes(t.status));

  const segments: IdleSegment[] = [];
  let prevArrival: Date | null = null;
  let prevTripId: string | null = null;
  let prevDestination: string | null = null;

  for (const trip of sorted) {
    const departure = isValidDate(trip.actualDeparture) ? trip.actualDeparture : null;
    const arrival = isValidDate(trip.actualArrival) ? trip.actualArrival : null;

    if (departure && prevArrival && prevTripId) {
      // gap invertido -> ignorado (nunca negativo); gap >= 0 -> segmento.
      if (departure.getTime() >= prevArrival.getTime()) {
        segments.push({
          previousTripId: prevTripId,
          previousArrival: prevArrival,
          previousDestinationLabel: prevDestination,
          nextTripId: trip.tripId,
          nextDeparture: departure,
          idleStart: prevArrival,
          idleEnd: departure,
          isCurrent: false,
          totalMinutes: minutesBetween(prevArrival, departure),
        });
      }
    }

    // Atualiza o "lado esquerdo" do proximo gap. Uma viagem ativa (partiu,
    // ainda nao chegou) zera prevArrival: nao ha ociosidade apos ela.
    if (trip.status === TripStatus.COMPLETED && arrival) {
      prevArrival = arrival;
      prevTripId = trip.tripId;
      prevDestination = trip.destinationLabel;
    } else if (departure && !arrival) {
      prevArrival = null;
      prevTripId = null;
      prevDestination = null;
    }
  }

  // Periodo corrente: ultima viagem concluida sem sucessora, veiculo livre.
  if (prevArrival && prevTripId && !hasActiveTrip && now.getTime() >= prevArrival.getTime()) {
    segments.push({
      previousTripId: prevTripId,
      previousArrival: prevArrival,
      previousDestinationLabel: prevDestination,
      nextTripId: null,
      nextDeparture: null,
      idleStart: prevArrival,
      idleEnd: null,
      isCurrent: true,
      totalMinutes: minutesBetween(prevArrival, now),
    });
  }

  return segments;
}

// ============================================================================
// Limiar de alerta de ociosidade -- reaproveita TenantSettings.preferences
// (JSON livre ja existente), MESMO padrao de
// resolveStopDurationThresholds (fleet-operations/utils, Fase 44) e
// resolveRequirePreTripChecklist (trips/utils, Fase 111): nunca confia
// cegamente no JSON, ausencia/valor invalido = SEM alerta (null), nunca um
// numero magico. Sem migration -- so leitura da coluna preferences.
// ============================================================================
const IDLE_ALERT_THRESHOLD_KEY = 'idleAlertThresholdMinutes';

export function resolveIdleAlertThresholdMinutes(preferences: unknown): number | null {
  if (typeof preferences !== 'object' || preferences === null || Array.isArray(preferences)) {
    return null;
  }
  const raw = (preferences as Record<string, unknown>)[IDLE_ALERT_THRESHOLD_KEY];
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return null;
  return raw;
}
