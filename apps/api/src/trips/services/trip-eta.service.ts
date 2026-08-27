import { Injectable } from '@nestjs/common';
import { Prisma, TripDeliveryStopStatus, TripStatus } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { GeoPoint } from '../../common/utils/geo.util';
import { PrismaService } from '../../prisma/prisma.service';
import { decodePolyline } from '../../routing/utils/polyline.util';
import { cumulativeDistancesMeters, distanceFromOriginMeters } from '../../routing/utils/route-geometry.util';
import { TripDeliveryStopEtaEntity, TripEtaResultEntity, TripEtaSource } from '../entities/trip-eta.entity';
import { TripDeliveryStopEntity } from '../entities/trip-delivery-stop.entity';
import { TripWithRelations } from '../mappers/trip.mapper';
import { TripDeliveryStopsService } from './trip-delivery-stops.service';
import { TripsService } from './trips.service';

// Janela de pontos de GPS recentes usada so para calcular uma velocidade
// media REAL (nunca inventada) quando o motorista esta enviando telemetria
// -- nao e uma regra de negocio configuravel pelo tenant (diferente de
// TenantSettings.routeDeviationMinutes), so o tamanho da amostra para a
// media.
const RECENT_TELEMETRY_WINDOW_MINUTES = 15;

const FINISHED_TRIP_LIMITATION = 'Viagem já concluída ou cancelada — não há previsão de chegada a calcular.';

interface GeographicEta {
  arrivalDate: Date;
  basis: string;
}

// Fase 91 -- previsao operacional de chegada (ETA), SEMPRE calculada sob
// demanda (nunca persistida -- regra 13; auditoria: RouteVersion/RoutePlan/
// TripMetrics nao sao lugares adequados para uma previsao efemera que muda
// a cada consulta, nenhum deles foi reaproveitado para armazenar isso).
// Dois motores, do mais para o menos preciso, cada um so usado quando os
// dados reais que ele exige realmente existem (regra 1/4):
//
// GEOGRAPHIC -- exige RoutePlan (Fase 26/89, distancia/duracao reais do
// provider) + pelo menos um TrackingPoint real (Fase 25/28). So se aplica a
// UMA parada possivel: aquela cujo locationId e o MESMO destino final da
// viagem (unico ponto da rota com coordenada conhecida -- nenhuma outra
// TripDeliveryStop tem coordenada cadastrada, ver docs/trip-optimization.md
// e docs/trip-routing.md). Velocidade media usada: telemetria real recente
// (media de TrackingPoint.speedKmh dos ultimos 15 min) quando disponivel,
// senao a velocidade media da propria rota (distanceMeters/durationSeconds,
// tambem real, vinda do provider).
//
// DELAY_SHIFT -- fallback sem geografia: desloca TripDeliveryStop.
// plannedArrival (ou Trip.plannedArrival) pelo atraso REAL de partida
// (Trip.actualDeparture - Trip.plannedDeparture) -- nenhuma coordenada,
// nenhuma velocidade, so aritmetica sobre datas reais.
@Injectable()
export class TripEtaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tripsService: TripsService,
    private readonly tripDeliveryStopsService: TripDeliveryStopsService,
  ) {}

  async compute(tenantId: string, tripId: string): Promise<TripEtaResultEntity> {
    const trip = await this.tripsService.findOwnedOrThrow(tenantId, tripId);
    const result = new TripEtaResultEntity();
    result.tripId = tripId;
    result.generatedAt = new Date();
    result.tripPlannedArrival = trip.plannedArrival;

    if (trip.status === TripStatus.COMPLETED || trip.status === TripStatus.CANCELLED) {
      result.nextStopId = null;
      result.tripEstimatedArrival = null;
      result.tripEstimatedArrivalSource = 'NONE';
      result.tripEstimatedArrivalBasis = null;
      result.tripVarianceSeconds = null;
      result.tripDelayed = null;
      result.stops = [];
      result.limitations = [FINISHED_TRIP_LIMITATION];
      return result;
    }

    // Lote fixo (independente do numero de paradas): paradas (2 queries,
    // Fase 88) + RoutePlan atual (0 ou 1) + ultima posicao de GPS (0 ou 1) +
    // telemetria recente para velocidade media (0 ou 1).
    const stops = await this.tripDeliveryStopsService.findAllForTrip(tenantId, tripId);

    const routePlan = trip.routePlanId
      ? await this.prisma.routePlan.findFirst({
          where: { id: trip.routePlanId, tenantId },
          select: { distanceMeters: true, durationSeconds: true, encodedPolyline: true },
        })
      : null;

    const lastTrackingPoint = await this.prisma.trackingPoint.findFirst({
      where: { tenantId, tripId },
      orderBy: { recordedAt: 'desc' },
    });

    const recentPoints = lastTrackingPoint
      ? await this.prisma.trackingPoint.findMany({
          where: {
            tenantId,
            tripId,
            recordedAt: { gte: new Date(lastTrackingPoint.recordedAt.getTime() - RECENT_TELEMETRY_WINDOW_MINUTES * 60_000) },
          },
          select: { speedKmh: true },
        })
      : [];

    const geographic = this.computeGeographicEta(trip, routePlan, lastTrackingPoint, recentPoints);
    const departureDelaySeconds =
      trip.actualDeparture && trip.plannedDeparture
        ? (trip.actualDeparture.getTime() - trip.plannedDeparture.getTime()) / 1000
        : null;

    const limitations: string[] = [];
    if (!trip.actualDeparture) {
      limitations.push(
        'Viagem ainda não partiu — sem dado operacional real (partida efetiva) para calcular qualquer previsão ainda; apenas o planejado está disponível.',
      );
    }
    if (!routePlan) {
      limitations.push(
        'Sem rota geográfica calculada para esta viagem (RoutePlan) — previsão geográfica indisponível para o destino final.',
      );
    } else if (!lastTrackingPoint) {
      limitations.push(
        'Sem posição de GPS registrada ainda para esta viagem — previsão geográfica indisponível para o destino final.',
      );
    }

    const nextStop =
      stops.find((s) => s.status === TripDeliveryStopStatus.PENDING || s.status === TripDeliveryStopStatus.IN_PROGRESS) ??
      null;
    const finalStop = stops.length > 0 ? stops[stops.length - 1]! : null;

    result.nextStopId = nextStop?.id ?? null;
    result.stops = stops.map((stop) =>
      this.buildStopEta(stop, trip, departureDelaySeconds, geographic, finalStop, nextStop),
    );

    // ETA do destino final da viagem (nao depende de existir TripDeliveryStop
    // nenhuma -- viagens simples origem/destino tambem tem essa previsao).
    if (geographic) {
      result.tripEstimatedArrival = geographic.arrivalDate;
      result.tripEstimatedArrivalSource = 'GEOGRAPHIC';
      result.tripEstimatedArrivalBasis = geographic.basis;
    } else if (trip.plannedArrival && departureDelaySeconds !== null) {
      result.tripEstimatedArrival = new Date(trip.plannedArrival.getTime() + departureDelaySeconds * 1000);
      result.tripEstimatedArrivalSource = 'DELAY_SHIFT';
      result.tripEstimatedArrivalBasis = this.delayShiftBasis(departureDelaySeconds);
    } else {
      result.tripEstimatedArrival = null;
      result.tripEstimatedArrivalSource = 'NONE';
      result.tripEstimatedArrivalBasis = null;
    }
    result.tripVarianceSeconds =
      result.tripEstimatedArrival && trip.plannedArrival
        ? (result.tripEstimatedArrival.getTime() - trip.plannedArrival.getTime()) / 1000
        : null;
    result.tripDelayed = result.tripVarianceSeconds !== null ? result.tripVarianceSeconds > 0 : null;

    result.limitations = limitations;
    return result;
  }

  private buildStopEta(
    stop: TripDeliveryStopEntity,
    trip: TripWithRelations,
    departureDelaySeconds: number | null,
    geographic: GeographicEta | null,
    finalStop: TripDeliveryStopEntity | null,
    nextStop: TripDeliveryStopEntity | null,
  ): TripDeliveryStopEtaEntity {
    const entity = new TripDeliveryStopEtaEntity();
    entity.stopId = stop.id;
    entity.sequence = stop.sequence;
    entity.status = stop.status;
    entity.isNextStop = nextStop?.id === stop.id;
    entity.plannedArrival = stop.plannedArrival;

    const finished =
      stop.status === TripDeliveryStopStatus.COMPLETED || stop.status === TripDeliveryStopStatus.CANCELLED;
    // Unica parada com coordenada conhecida: a ULTIMA da sequencia, quando o
    // local dela e literalmente o mesmo destino final cadastrado na viagem
    // (comparacao por id, nunca por coordenada inventada).
    const isFinalDestinationStop =
      !finished && finalStop?.id === stop.id && stop.locationId === trip.destinationLocationId;

    let source: TripEtaSource = 'NONE';
    let estimatedArrival: Date | null = null;
    let basis: string | null = null;
    let limitation: string | null = null;

    if (finished) {
      limitation = 'Parada já concluída ou cancelada.';
    } else if (isFinalDestinationStop && geographic) {
      source = 'GEOGRAPHIC';
      estimatedArrival = geographic.arrivalDate;
      basis = geographic.basis;
    } else if (stop.plannedArrival === null) {
      limitation = 'Parada sem previsão de chegada planejada cadastrada (plannedArrival).';
    } else if (departureDelaySeconds === null) {
      limitation = 'Viagem ainda não partiu — sem atraso real de partida para ajustar a previsão desta parada.';
    } else {
      source = 'DELAY_SHIFT';
      estimatedArrival = new Date(stop.plannedArrival.getTime() + departureDelaySeconds * 1000);
      basis = this.delayShiftBasis(departureDelaySeconds);
    }

    entity.estimatedArrival = estimatedArrival;
    entity.source = source;
    entity.basis = basis;
    entity.varianceSeconds =
      estimatedArrival && stop.plannedArrival
        ? (estimatedArrival.getTime() - stop.plannedArrival.getTime()) / 1000
        : null;
    entity.delayed = entity.varianceSeconds !== null ? entity.varianceSeconds > 0 : null;
    entity.limitation = limitation;
    return entity;
  }

  private computeGeographicEta(
    trip: TripWithRelations,
    routePlan: { distanceMeters: number; durationSeconds: number; encodedPolyline: string } | null,
    lastTrackingPoint: { latitude: Prisma.Decimal; longitude: Prisma.Decimal; recordedAt: Date } | null,
    recentPoints: { speedKmh: Prisma.Decimal | null }[],
  ): GeographicEta | null {
    if (!routePlan || !lastTrackingPoint) return null;

    const point: GeoPoint = {
      latitude: toNumberOrNull(lastTrackingPoint.latitude) ?? 0,
      longitude: toNumberOrNull(lastTrackingPoint.longitude) ?? 0,
    };
    const polyline = decodePolyline(routePlan.encodedPolyline);
    if (polyline.length === 0) return null;
    const cumulative = cumulativeDistancesMeters(polyline);
    const currentDistanceMeters = distanceFromOriginMeters(point, polyline, cumulative);
    const distanceRemainingMeters = Math.max(0, routePlan.distanceMeters - currentDistanceMeters);

    const telemetrySpeedsKmh = recentPoints
      .map((p) => toNumberOrNull(p.speedKmh))
      .filter((v): v is number => v !== null && v > 0);
    const usingTelemetrySpeed = telemetrySpeedsKmh.length > 0;
    const avgSpeedKmh = usingTelemetrySpeed
      ? telemetrySpeedsKmh.reduce((sum, v) => sum + v, 0) / telemetrySpeedsKmh.length
      : (routePlan.distanceMeters / routePlan.durationSeconds) * 3.6;

    if (avgSpeedKmh <= 0) return null;
    const avgSpeedMps = avgSpeedKmh / 3.6;
    const remainingSeconds = distanceRemainingMeters / avgSpeedMps;
    const arrivalDate = new Date(lastTrackingPoint.recordedAt.getTime() + remainingSeconds * 1000);

    const speedLabel = usingTelemetrySpeed
      ? `velocidade média real dos últimos ${RECENT_TELEMETRY_WINDOW_MINUTES} min de GPS`
      : 'velocidade média da rota planejada';
    const basis =
      `Baseado na última posição de GPS registrada em ${lastTrackingPoint.recordedAt.toISOString()} ` +
      `(${Math.round(distanceRemainingMeters / 1000)} km restantes da rota) e ${speedLabel} ` +
      `(${avgSpeedKmh.toFixed(1)} km/h).`;

    return { arrivalDate, basis };
  }

  private delayShiftBasis(departureDelaySeconds: number): string {
    const minutes = Math.round(departureDelaySeconds / 60);
    if (minutes === 0) {
      return 'Previsão igual ao planejado — a viagem partiu no horário previsto.';
    }
    const label = minutes > 0 ? `${minutes} min de atraso` : `${Math.abs(minutes)} min de adiantamento`;
    return `Sem rota geográfica/GPS suficientes -- previsão obtida deslocando o planejado pelo atraso real de partida (${label} em relação ao planejado).`;
  }
}
