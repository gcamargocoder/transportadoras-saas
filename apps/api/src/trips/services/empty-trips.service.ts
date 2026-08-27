import { Injectable } from '@nestjs/common';
import { Prisma, TripLoadStatus } from '@prisma/client';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { compact } from '../../common/utils/compact.util';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { PrismaService } from '../../prisma/prisma.service';
import { FindEmptyTripsQueryDto } from '../dto/find-empty-trips-query.dto';
import { EmptyTripEntity, PaginatedEmptyTripsEntity } from '../entities/empty-trip.entity';
import { buildDeliveryStopCountsByTrip, classifyEmptyTripReason, EMPTY_DELIVERY_STOP_STATUS_COUNTS } from '../utils/empty-trip.util';

const TRIP_INCLUDE = {
  customer: true,
  driver: true,
  origin: true,
  destination: true,
  composition: { include: { vehicle: true } },
} satisfies Prisma.TripInclude;

type EmptyTripRow = Prisma.TripGetPayload<{ include: typeof TRIP_INCLUDE }>;

// Fase 92 -- listagem de viagens vazias (Trip.loadStatus === 'EMPTY',
// informado pelo motorista na largada -- Fase 27). NUNCA infere "vazia" de
// ausencia de cliente/entrega (regra 2); NUNCA cria uma entidade de viagem
// nova (regra 6) -- e uma PROJECAO de leitura sobre Trip/TripDeliveryStop/
// TripMetrics ja existentes, nada persistido aqui.
@Injectable()
export class EmptyTripsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: FindEmptyTripsQueryDto): Promise<PaginatedEmptyTripsEntity> {
    const where: Prisma.TripWhereInput = {
      tenantId,
      deletedAt: null,
      loadStatus: TripLoadStatus.EMPTY,
      ...compact({
        driverId: query.driverId,
        status: query.status,
        composition: query.vehicleId ? { vehicleId: query.vehicleId } : undefined,
        actualDeparture:
          query.departureFrom || query.departureTo
            ? compact({
                gte: query.departureFrom ? new Date(query.departureFrom) : undefined,
                lte: query.departureTo ? new Date(query.departureTo) : undefined,
              })
            : undefined,
      }),
    };

    // Pagina PRIMEIRO (no banco, so `where` acima) -- classificacao/custo
    // sao calculados so para as linhas da PAGINA atual, nunca para o total
    // do tenant (nº de queries nao cresce com o total de viagens vazias).
    const [trips, total] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        include: TRIP_INCLUDE,
        orderBy: { actualDeparture: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.trip.count({ where }),
    ]);

    const items = await this.attachClassificationAndMetrics(tenantId, trips);

    const result = new PaginatedEmptyTripsEntity();
    result.items = items;
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  // Lote fixo (2 queries), independente do tamanho da PAGINA (bounded por
  // pageSize, nunca por quantas viagens vazias o tenant tem no total):
  // status das TripDeliveryStop (groupBy) + TripMetrics (findMany), ambos
  // filtrados por `tripId IN (ids da pagina)`. Nunca 1 query por viagem.
  private async attachClassificationAndMetrics(
    tenantId: string,
    trips: EmptyTripRow[],
  ): Promise<EmptyTripEntity[]> {
    const tripIds = trips.map((t) => t.id);
    if (tripIds.length === 0) return [];

    const [stopCountRows, metricsRows] = await Promise.all([
      this.prisma.tripDeliveryStop.groupBy({
        by: ['tripId', 'status'],
        where: { tenantId, tripId: { in: tripIds } },
        _count: true,
      }),
      this.prisma.tripMetrics.findMany({
        where: { tenantId, tripId: { in: tripIds } },
        select: { tripId: true, actualDistanceKm: true, actualTotalCost: true },
      }),
    ]);

    const stopCountsByTrip = buildDeliveryStopCountsByTrip(
      stopCountRows.map((row) => ({ tripId: row.tripId, status: row.status, _count: row._count })),
    );
    const metricsByTrip = new Map(metricsRows.map((m) => [m.tripId, m]));

    return trips.map((trip) => {
      const counts = stopCountsByTrip.get(trip.id) ?? EMPTY_DELIVERY_STOP_STATUS_COUNTS;
      const metrics = metricsByTrip.get(trip.id);

      const entity = new EmptyTripEntity();
      entity.id = trip.id;
      entity.status = trip.status;
      entity.plannedDeparture = trip.plannedDeparture;
      entity.actualDeparture = trip.actualDeparture;
      entity.actualArrival = trip.actualArrival;
      entity.originName = trip.origin.name;
      entity.destinationName = trip.destination.name;
      entity.vehicleId = trip.composition?.vehicleId ?? null;
      entity.vehiclePlate = trip.composition?.vehicle.plate ?? null;
      entity.driverId = trip.driverId;
      entity.driverName = trip.driver?.name ?? null;
      entity.customerId = trip.customerId;
      entity.customerName = trip.customer?.name ?? null;
      entity.reason = classifyEmptyTripReason(counts);
      entity.hasDeliveryStops =
        counts.completed + counts.cancelled + counts.pending + counts.inProgress + counts.failed > 0;
      entity.distanceKm = toNumberOrNull(metrics?.actualDistanceKm ?? null);
      entity.totalCost = toNumberOrNull(metrics?.actualTotalCost ?? null);
      return entity;
    });
  }
}
