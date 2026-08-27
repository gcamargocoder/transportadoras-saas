// Fase 92 -- classificacao de "viagem vazia", reaproveitada tanto pela
// listagem (TripsController/EmptyTripsService) quanto pelo resumo do
// dashboard (FleetOperationsMetricsService.getEmptyTripsSummary) -- MESMA
// regra em um unico lugar, nunca duplicada (rule "evitar duplicar regras").
//
// "Vazia" (is-empty) NUNCA e inferido daqui -- e sempre
// `Trip.loadStatus === 'EMPTY'`, informado pelo proprio motorista na
// largada (Fase 27, StartTripDto). Nenhuma heuristica baseada em ausencia
// de cliente/TripDeliveryStop decide isso (regra 2 do pedido: ausencia de
// dado nunca vira prova de "vazia"). O que ESTA funcao faz e apenas
// REFINAR o MOTIVO textual de uma viagem ja confirmada como vazia, a
// partir da unica fonte real disponivel para isso: o status das
// TripDeliveryStop (Fase 88) associadas -- nunca inventa uma coordenada,
// peso ou distancia.
export type EmptyTripReason =
  | 'NO_DELIVERIES_PLANNED'
  | 'ALL_DELIVERIES_CANCELLED'
  | 'DELIVERIES_INCOMPLETE'
  | 'COMPLETED_DELIVERIES_INCONSISTENT';

export interface DeliveryStopStatusCounts {
  completed: number;
  cancelled: number;
  pending: number;
  inProgress: number;
}

export const EMPTY_DELIVERY_STOP_STATUS_COUNTS: DeliveryStopStatusCounts = {
  completed: 0,
  cancelled: 0,
  pending: 0,
  inProgress: 0,
};

// Determinístico -- mesma entrada sempre produz a mesma saida, sem
// aleatoriedade nem dependencia de ordem.
//
// NO_DELIVERIES_PLANNED: nenhuma TripDeliveryStop foi cadastrada para a
//   viagem -- consistente com uma viagem de reposicionamento/retorno, nunca
//   teve entrega planejada.
// ALL_DELIVERIES_CANCELLED: havia paradas planejadas, mas todas foram
//   canceladas -- a viagem saiu vazia porque a carga/entrega caiu.
// DELIVERIES_INCOMPLETE: havia paradas planejadas, nenhuma concluida, mas
//   nem todas canceladas (ex: ainda PENDING/IN_PROGRESS) -- situacao real
//   mas sem motivo definitivo (a viagem terminou antes de resolver as
//   paradas restantes).
// COMPLETED_DELIVERIES_INCONSISTENT: existe pelo menos 1 parada CONCLUIDA
//   apesar de loadStatus=EMPTY -- contradicao nos dados (o motorista
//   informou vazio na largada, mas o sistema registra entrega concluida
//   depois). Nunca resolvida automaticamente aqui -- so sinalizada, para
//   revisao humana (regra 1/3: nao inventar qual dado esta certo).
export function classifyEmptyTripReason(counts: DeliveryStopStatusCounts): EmptyTripReason {
  const total = counts.completed + counts.cancelled + counts.pending + counts.inProgress;
  if (total === 0) return 'NO_DELIVERIES_PLANNED';
  if (counts.completed > 0) return 'COMPLETED_DELIVERIES_INCONSISTENT';
  if (counts.cancelled === total) return 'ALL_DELIVERIES_CANCELLED';
  return 'DELIVERIES_INCOMPLETE';
}

// Agrega o resultado de um groupBy(by: ['tripId', 'status']) do Prisma
// (TripDeliveryStop) num Map<tripId, DeliveryStopStatusCounts> -- uma unica
// passada em memoria, nunca uma query por viagem.
export function buildDeliveryStopCountsByTrip(
  rows: { tripId: string; status: string; _count: number }[],
): Map<string, DeliveryStopStatusCounts> {
  const map = new Map<string, DeliveryStopStatusCounts>();
  for (const row of rows) {
    const counts = map.get(row.tripId) ?? { ...EMPTY_DELIVERY_STOP_STATUS_COUNTS };
    switch (row.status) {
      case 'COMPLETED':
        counts.completed += row._count;
        break;
      case 'CANCELLED':
        counts.cancelled += row._count;
        break;
      case 'PENDING':
        counts.pending += row._count;
        break;
      case 'IN_PROGRESS':
        counts.inProgress += row._count;
        break;
      default:
        break;
    }
    map.set(row.tripId, counts);
  }
  return map;
}
