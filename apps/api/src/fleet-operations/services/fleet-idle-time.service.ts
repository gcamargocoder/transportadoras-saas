import { Injectable } from '@nestjs/common';
import { TripStatus, VehicleMaintenanceStatus } from '@prisma/client';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { PrismaService } from '../../prisma/prisma.service';
import { FindIdleTimeQueryDto } from '../dto/find-idle-time-query.dto';
import { FleetIdleTimeEntity, FleetVehicleIdleTimeEntity } from '../entities/fleet-idle-time.entity';
import {
  computeIdleSegments,
  computeMaintenanceOverlapMinutes,
  IdleTripBoundary,
  MaintenanceInterval,
} from '../utils/idle-time.util';

// Fase A -- tempo ocioso entre operacoes. Servico PROPRIO (mesmo desenho de
// FleetOccurrencesMetricsService, Fase 68: so PrismaService, injetado no
// MESMO FleetOperationsController). Toda a regra de calculo esta na util
// pura idle-time.util.ts -- aqui so ha as consultas em lote (veiculos +
// viagens + manutencoes, sempre IN vehicleIds, nunca 1 query por veiculo) e
// a montagem/paginacao do resultado.
//
// NAO cria model/tabela nova, NAO altera schema, NAO altera
// VehicleMaintenance.downtimeMinutes -- so leitura.

// Viagens que participam do calculo: concluidas (lado esquerdo dos gaps) e
// as ativas (lado direito -- fecham a ociosidade anterior e sinalizam
// "veiculo nao esta ocioso agora"). PLANNED/WAITING_* nao tem
// actualDeparture, entao nunca encerram um periodo ocioso real.
const RELEVANT_TRIP_STATUSES: TripStatus[] = [
  TripStatus.COMPLETED,
  TripStatus.IN_PROGRESS,
  TripStatus.PAUSED,
];

@Injectable()
export class FleetIdleTimeService {
  constructor(private readonly prisma: PrismaService) {}

  async getIdleTime(tenantId: string, query: FindIdleTimeQueryDto): Promise<FleetIdleTimeEntity> {
    const now = new Date();
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(`${query.to}T23:59:59.999Z`) : null;

    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(query.vehicleId ? { id: query.vehicleId } : {}),
      },
      select: { id: true, plate: true },
    });

    const result = new FleetIdleTimeEntity();
    result.asOf = now;

    if (vehicles.length === 0) {
      result.items = [];
      result.meta = buildPaginationMeta(0, query.page, query.pageSize);
      return result;
    }

    const vehicleIds = vehicles.map((v) => v.id);
    const plateById = new Map(vehicles.map((v) => [v.id, v.plate]));

    const [trips, maintenances] = await Promise.all([
      this.prisma.trip.findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: { in: RELEVANT_TRIP_STATUSES },
          composition: { vehicleId: { in: vehicleIds } },
        },
        select: {
          id: true,
          status: true,
          actualDeparture: true,
          actualArrival: true,
          composition: { select: { vehicleId: true } },
          destination: { select: { name: true } },
        },
      }),
      // Todas as OS dos veiculos EXCETO canceladas (uma OS cancelada nunca
      // representa tempo de veiculo parado). Concluidas entram normalmente
      // -- explicam parte de um gap historico. Nunca lemos/alteramos
      // downtimeMinutes; so as datas ancora.
      this.prisma.vehicleMaintenance.findMany({
        where: {
          tenantId,
          vehicleId: { in: vehicleIds },
          status: { not: VehicleMaintenanceStatus.CANCELLED },
        },
        select: {
          vehicleId: true,
          openedAt: true,
          startedAt: true,
          completedAt: true,
        },
      }),
    ]);

    const tripsByVehicle = new Map<string, IdleTripBoundary[]>();
    for (const trip of trips) {
      const vehicleId = trip.composition?.vehicleId;
      if (!vehicleId) continue;
      const list = tripsByVehicle.get(vehicleId) ?? [];
      list.push({
        tripId: trip.id,
        status: trip.status,
        actualDeparture: trip.actualDeparture,
        actualArrival: trip.actualArrival,
        destinationLabel: trip.destination?.name ?? null,
      });
      tripsByVehicle.set(vehicleId, list);
    }

    const maintByVehicle = new Map<string, MaintenanceInterval[]>();
    for (const m of maintenances) {
      // Intervalo real de parada: da data em que a execucao comecou
      // (startedAt, Fase 82) ou, na ausencia, da abertura da OS (openedAt),
      // ate a conclusao (completedAt) ou -- OS ainda em aberto -- ate o fim
      // do proprio periodo ocioso (o recorte e feito na util, nunca alem).
      const list = maintByVehicle.get(m.vehicleId) ?? [];
      list.push({ start: m.startedAt ?? m.openedAt, end: m.completedAt ?? null });
      maintByVehicle.set(m.vehicleId, list);
    }

    const rows: FleetVehicleIdleTimeEntity[] = [];
    for (const vehicleId of vehicleIds) {
      const vehicleTrips = tripsByVehicle.get(vehicleId) ?? [];
      if (vehicleTrips.length === 0) continue;

      const segments = computeIdleSegments(vehicleTrips, now);
      const maintenanceIntervals = maintByVehicle.get(vehicleId) ?? [];

      for (const segment of segments) {
        const rangeEnd = segment.idleEnd ?? now;

        // Janela from/to: mantem o periodo se ele SOBREPOE [from, to].
        if (from && rangeEnd.getTime() < from.getTime()) continue;
        if (to && segment.idleStart.getTime() > to.getTime()) continue;

        const maintenanceMinutes = computeMaintenanceOverlapMinutes(
          segment.idleStart,
          rangeEnd,
          maintenanceIntervals,
        );
        const netIdleMinutes = Math.max(0, segment.totalMinutes - maintenanceMinutes);

        const row = new FleetVehicleIdleTimeEntity();
        row.vehicleId = vehicleId;
        row.plate = plateById.get(vehicleId) ?? '—';
        row.lastTripId = segment.previousTripId;
        row.lastArrival = segment.previousArrival;
        row.lastDestinationLabel = segment.previousDestinationLabel;
        row.nextTripId = segment.nextTripId;
        row.nextDeparture = segment.nextDeparture;
        row.idleStart = segment.idleStart;
        row.idleEnd = segment.idleEnd;
        row.totalMinutes = segment.totalMinutes;
        row.maintenanceMinutes = maintenanceMinutes;
        row.netIdleMinutes = netIdleMinutes;
        row.isCurrentlyIdle = segment.isCurrent;
        row.isEstimate = segment.isCurrent;
        rows.push(row);
      }
    }

    // Ordenacao deterministica: periodo em aberto primeiro (maior
    // ociosidade liquida no topo), depois o historico do mais recente para
    // o mais antigo. Desempate por placa.
    rows.sort((a, b) => {
      if (a.isCurrentlyIdle !== b.isCurrentlyIdle) return a.isCurrentlyIdle ? -1 : 1;
      if (a.isCurrentlyIdle && b.isCurrentlyIdle) {
        if (b.netIdleMinutes !== a.netIdleMinutes) return b.netIdleMinutes - a.netIdleMinutes;
        return a.plate.localeCompare(b.plate);
      }
      const diff = b.idleStart.getTime() - a.idleStart.getTime();
      if (diff !== 0) return diff;
      return a.plate.localeCompare(b.plate);
    });

    const total = rows.length;
    const startIndex = (query.page - 1) * query.pageSize;
    result.items = rows.slice(startIndex, startIndex + query.pageSize);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }
}
