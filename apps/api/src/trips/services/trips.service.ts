import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TripStatus, VehicleStatus } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { PaginatedAuditLogEntity } from '../../audit/entities/paginated-audit-log.entity';
import { toAuditLogEntity } from '../../audit/mappers/audit-log.mapper';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTripDto } from '../dto/create-trip.dto';
import { FindTripsQueryDto } from '../dto/find-trips-query.dto';
import { UpdateTripStatusDto } from '../dto/update-trip-status.dto';
import { UpdateTripDto } from '../dto/update-trip.dto';
import { PaginatedTripsEntity } from '../entities/paginated-trips.entity';
import { TripEntity } from '../entities/trip.entity';
import { TripSummaryEntity } from '../entities/trip-summary.entity';
import { toTripEntity, TripWithRelations } from '../mappers/trip.mapper';
import { toTripSummaryEntity } from '../mappers/trip-summary.mapper';
import { TollRoutesService } from '../../toll-routes/services/toll-routes.service';
import { CustomersService } from './customers.service';
import { LocationsService } from './locations.service';

const TRIP_INCLUDE = {
  customer: true,
  driver: true,
  origin: true,
  destination: true,
  composition: { include: { vehicle: true } },
  tollRoute: true,
} satisfies Prisma.TripInclude;

// Viagens ainda "em aberto" (nao concluidas/canceladas) -- usado tanto para
// bloquear exclusao de Driver/Vehicle (ver DriversService/VehiclesService)
// quanto para checagem de disponibilidade aqui.
const NON_TERMINAL_STATUSES: TripStatus[] = [
  TripStatus.PLANNED,
  TripStatus.WAITING_DRIVER,
  TripStatus.WAITING_DEPARTURE,
  TripStatus.IN_PROGRESS,
  TripStatus.PAUSED,
];

// Fluxo operacional: PLANNED (planejamento) -> WAITING_DRIVER (despachada,
// aguardando motorista chegar) -> WAITING_DEPARTURE (motorista/veiculo
// prontos, aguardando saida) -> IN_PROGRESS (na estrada) -> PAUSED (parada
// temporaria) -> COMPLETED. CANCELLED e alcancavel de qualquer estado nao
// terminal. Estagios intermediarios podem ser pulados (ex: PLANNED direto
// para IN_PROGRESS), mas nunca "andar para tras" exceto PAUSED -> IN_PROGRESS
// (retorno) -- nao ha "replanejamento" de volta a PLANNED.
const ALLOWED_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  PLANNED: [
    TripStatus.WAITING_DRIVER,
    TripStatus.WAITING_DEPARTURE,
    TripStatus.IN_PROGRESS,
    TripStatus.CANCELLED,
  ],
  WAITING_DRIVER: [TripStatus.WAITING_DEPARTURE, TripStatus.IN_PROGRESS, TripStatus.CANCELLED],
  WAITING_DEPARTURE: [TripStatus.IN_PROGRESS, TripStatus.CANCELLED],
  IN_PROGRESS: [TripStatus.PAUSED, TripStatus.COMPLETED, TripStatus.CANCELLED],
  PAUSED: [TripStatus.IN_PROGRESS, TripStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
};

// Nomes de acao de auditoria alinhados ao vocabulario da timeline pedido
// (Inicio, Pausa, Retorno, Chegada, Conclusao, Cancelamento...) -- em vez do
// generico "trip.status_changed" para toda transicao.
function resolveStatusChangeAction(from: TripStatus, to: TripStatus): string {
  switch (to) {
    case TripStatus.WAITING_DRIVER:
      return 'trip.waiting_driver';
    case TripStatus.WAITING_DEPARTURE:
      return 'trip.waiting_departure';
    case TripStatus.IN_PROGRESS:
      return from === TripStatus.PAUSED ? 'trip.resumed' : 'trip.started';
    case TripStatus.PAUSED:
      return 'trip.paused';
    case TripStatus.COMPLETED:
      return 'trip.completed';
    case TripStatus.CANCELLED:
      return 'trip.cancelled';
    default:
      return 'trip.status_changed';
  }
}

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly locationsService: LocationsService,
    private readonly customersService: CustomersService,
    private readonly tollRoutesService: TollRoutesService,
  ) {}

  async findAll(tenantId: string, query: FindTripsQueryDto): Promise<PaginatedTripsEntity> {
    const where: Prisma.TripWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.driverId ? { driverId: query.driverId } : {}),
      ...(query.vehicleId ? { composition: { vehicleId: query.vehicleId } } : {}),
      ...(query.originLocationId ? { originLocationId: query.originLocationId } : {}),
      ...(query.destinationLocationId
        ? { destinationLocationId: query.destinationLocationId }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.departureFrom || query.departureTo
        ? {
            plannedDeparture: {
              ...(query.departureFrom ? { gte: new Date(query.departureFrom) } : {}),
              ...(query.departureTo ? { lte: new Date(query.departureTo) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { notes: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              {
                customer: { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              },
              { origin: { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } } },
              {
                destination: {
                  name: { contains: query.search, mode: Prisma.QueryMode.insensitive },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        include: TRIP_INCLUDE,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.trip.count({ where }),
    ]);

    const result = new PaginatedTripsEntity();
    result.items = items.map(toTripEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<TripEntity> {
    return toTripEntity(await this.findOwnedOrThrow(tenantId, id));
  }

  // GET /trips/:id/timeline -- reaproveita o mesmo mecanismo generico de
  // historico de auditoria ja usado em Vehicle (Fase 12): AuditLog ja
  // registra quem/quando/IP/User-Agent/antes/depois para toda mutacao.
  async getTimeline(
    tenantId: string,
    id: string,
    pagination: PaginationQueryDto,
  ): Promise<PaginatedAuditLogEntity> {
    await this.findOwnedOrThrow(tenantId, id);

    const { items, total } = await this.audit.findByEntity(tenantId, 'Trip', id, pagination);

    const result = new PaginatedAuditLogEntity();
    result.items = items.map(toAuditLogEntity);
    result.meta = buildPaginationMeta(total, pagination.page, pagination.pageSize);
    return result;
  }

  // GET /trips/:id/summary -- visao consolidada (motorista, veiculo, origem,
  // destino, tempo, status, distancia, pedagios, custos), agregando dados ja
  // existentes (Trip + TripMetrics + TollTransaction) sem persistir nada novo.
  async getSummary(tenantId: string, id: string): Promise<TripSummaryEntity> {
    const trip = await this.findOwnedOrThrow(tenantId, id);

    const [metrics, tollAggregate] = await Promise.all([
      this.prisma.tripMetrics.findUnique({ where: { tripId: id } }),
      this.prisma.tollTransaction.aggregate({
        where: { tenantId, tripId: id },
        _count: { _all: true },
        _sum: { chargedAmount: true },
      }),
    ]);

    return toTripSummaryEntity(trip, metrics, {
      count: tollAggregate._count._all,
      total: tollAggregate._sum.chargedAmount,
    });
  }

  async create(
    tenantId: string,
    dto: CreateTripDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripEntity> {
    if (dto.originLocationId === dto.destinationLocationId) {
      throw new BadRequestException(
        'originLocationId e destinationLocationId nao podem ser o mesmo local.',
      );
    }

    const departure = new Date(dto.plannedDeparture);
    const arrival = new Date(dto.plannedArrival);
    if (arrival <= departure) {
      throw new BadRequestException('plannedArrival deve ser posterior a plannedDeparture.');
    }

    await this.locationsService.findActiveOrThrow(tenantId, dto.originLocationId);
    await this.locationsService.findActiveOrThrow(tenantId, dto.destinationLocationId);
    if (dto.customerId) {
      await this.customersService.findActiveOrThrow(tenantId, dto.customerId);
    }
    if (dto.tollRouteId) {
      await this.tollRoutesService.findActiveOrThrow(tenantId, dto.tollRouteId);
    }
    await this.assertDriverAvailable(tenantId, dto.driverId, departure, arrival);
    const composition = await this.assertCompositionAvailable(tenantId, dto.compositionId);
    await this.assertVehicleAvailable(tenantId, composition.vehicleId, departure, arrival);

    const trip = await this.prisma.$transaction(async (tx) => {
      const created = await tx.trip.create({
        data: {
          tenantId,
          driverId: dto.driverId,
          originLocationId: dto.originLocationId,
          destinationLocationId: dto.destinationLocationId,
          plannedDeparture: departure,
          plannedArrival: arrival,
          ...compact({
            customerId: dto.customerId,
            tollRouteId: dto.tollRouteId,
            priority: dto.priority,
            notes: dto.notes,
          }),
        },
      });

      // RouteVersion inicial -- imutavel, unica criada nesta fase.
      await tx.routeVersion.create({
        data: { tenantId, tripId: created.id, versionNumber: 1, reason: 'INITIAL' },
      });

      // TripMetrics 1:1 -- so valores previstos; executados ficam null.
      await tx.tripMetrics.create({
        data: {
          tenantId,
          tripId: created.id,
          ...compact({
            plannedDistanceKm: dto.plannedMetrics?.distanceKm,
            plannedDurationMin: dto.plannedMetrics?.durationMin,
            plannedFuelLiters: dto.plannedMetrics?.fuelLiters,
            plannedTollAmount: dto.plannedMetrics?.tollAmount,
            plannedTotalCost: dto.plannedMetrics?.totalCost,
          }),
        },
      });

      await tx.tripComposition.update({
        where: { id: dto.compositionId },
        data: { tripId: created.id },
      });

      return created;
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip.created',
      entityName: 'Trip',
      entityId: trip.id,
      newValue: toJsonSafe({
        originLocationId: trip.originLocationId,
        destinationLocationId: trip.destinationLocationId,
        plannedDeparture: trip.plannedDeparture,
        plannedArrival: trip.plannedArrival,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
    // Eventos de timeline dedicados: motorista e veiculo ja nascem
    // vinculados nesta fase (ambos obrigatorios na criacao).
    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip.driver_linked',
      entityName: 'Trip',
      entityId: trip.id,
      newValue: { driverId: dto.driverId },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip.vehicle_linked',
      entityName: 'Trip',
      entityId: trip.id,
      newValue: { compositionId: dto.compositionId, vehicleId: composition.vehicleId },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return this.findOne(tenantId, trip.id);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateTripDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);
    if (before.status !== TripStatus.PLANNED) {
      throw new ConflictException('Somente viagens com status PLANNED podem ser editadas.');
    }

    const originLocationId = dto.originLocationId ?? before.originLocationId;
    const destinationLocationId = dto.destinationLocationId ?? before.destinationLocationId;
    if (originLocationId === destinationLocationId) {
      throw new BadRequestException(
        'originLocationId e destinationLocationId nao podem ser o mesmo local.',
      );
    }

    const departure = dto.plannedDeparture
      ? new Date(dto.plannedDeparture)
      : before.plannedDeparture;
    const arrival = dto.plannedArrival ? new Date(dto.plannedArrival) : before.plannedArrival;
    if (departure && arrival && arrival <= departure) {
      throw new BadRequestException('plannedArrival deve ser posterior a plannedDeparture.');
    }

    if (dto.originLocationId)
      await this.locationsService.findActiveOrThrow(tenantId, dto.originLocationId);
    if (dto.destinationLocationId) {
      await this.locationsService.findActiveOrThrow(tenantId, dto.destinationLocationId);
    }
    if (dto.customerId) await this.customersService.findActiveOrThrow(tenantId, dto.customerId);

    const tollRouteChanged =
      dto.tollRouteId !== undefined && dto.tollRouteId !== before.tollRouteId;
    if (tollRouteChanged && dto.tollRouteId) {
      await this.tollRoutesService.findActiveOrThrow(tenantId, dto.tollRouteId);
    }

    const driverChanged = dto.driverId !== undefined && dto.driverId !== before.driverId;
    if (driverChanged && departure && arrival) {
      await this.assertDriverAvailable(tenantId, dto.driverId as string, departure, arrival, id);
    }

    const currentCompositionId = before.composition?.id ?? null;
    const compositionChanged =
      dto.compositionId !== undefined && dto.compositionId !== currentCompositionId;
    let newComposition: { id: string; vehicleId: string } | undefined;
    if (compositionChanged && dto.compositionId) {
      newComposition = await this.assertCompositionAvailable(tenantId, dto.compositionId);
      if (departure && arrival) {
        await this.assertVehicleAvailable(
          tenantId,
          newComposition.vehicleId,
          departure,
          arrival,
          id,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.trip.update({
        where: { id },
        data: compact({
          customerId: dto.customerId,
          driverId: dto.driverId,
          originLocationId: dto.originLocationId,
          destinationLocationId: dto.destinationLocationId,
          tollRouteId: dto.tollRouteId,
          plannedDeparture: dto.plannedDeparture ? departure : undefined,
          plannedArrival: dto.plannedArrival ? arrival : undefined,
          priority: dto.priority,
          notes: dto.notes,
        }),
      });

      if (compositionChanged) {
        if (currentCompositionId) {
          await tx.tripComposition.update({
            where: { id: currentCompositionId },
            data: { tripId: null },
          });
        }
        if (dto.compositionId) {
          await tx.tripComposition.update({
            where: { id: dto.compositionId },
            data: { tripId: id },
          });
        }
      }
    });

    const after = await this.findOwnedOrThrow(tenantId, id);

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip.updated',
      entityName: 'Trip',
      entityId: id,
      previousValue: toJsonSafe({
        originLocationId: before.originLocationId,
        destinationLocationId: before.destinationLocationId,
        plannedDeparture: before.plannedDeparture,
        plannedArrival: before.plannedArrival,
        driverId: before.driverId,
        compositionId: currentCompositionId,
        tollRouteId: before.tollRouteId,
      }),
      newValue: toJsonSafe({
        originLocationId: after.originLocationId,
        destinationLocationId: after.destinationLocationId,
        plannedDeparture: after.plannedDeparture,
        plannedArrival: after.plannedArrival,
        driverId: after.driverId,
        compositionId: after.composition?.id ?? null,
        tollRouteId: after.tollRouteId,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
    if (driverChanged) {
      await this.audit.log({
        tenantId,
        userId: actor.userId,
        action: 'trip.driver_linked',
        entityName: 'Trip',
        entityId: id,
        previousValue: { driverId: before.driverId },
        newValue: { driverId: after.driverId },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
    }
    if (compositionChanged) {
      await this.audit.log({
        tenantId,
        userId: actor.userId,
        action: 'trip.vehicle_linked',
        entityName: 'Trip',
        entityId: id,
        previousValue: { compositionId: currentCompositionId },
        newValue: { compositionId: after.composition?.id ?? null },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
    }

    return toTripEntity(after);
  }

  async updateStatus(
    tenantId: string,
    id: string,
    dto: UpdateTripStatusDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);
    const allowed = ALLOWED_TRANSITIONS[before.status];
    if (!allowed.includes(dto.status)) {
      throw new ConflictException(
        `Transicao de status invalida: ${before.status} -> ${dto.status}.`,
      );
    }

    if (dto.status === TripStatus.IN_PROGRESS) {
      await this.assertCanStart(tenantId, before, id);
    }

    const data: Prisma.TripUpdateInput = { status: dto.status };
    if (dto.status === TripStatus.IN_PROGRESS && !before.actualDeparture) {
      data.actualDeparture = new Date();
    }

    let durationMinutes: number | null = null;
    if (dto.status === TripStatus.COMPLETED) {
      const actualArrival = before.actualArrival ?? new Date();
      data.actualArrival = actualArrival;
      const actualDeparture = before.actualDeparture;
      if (actualDeparture) {
        durationMinutes = Math.round(
          (actualArrival.getTime() - actualDeparture.getTime()) / 60_000,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.trip.update({ where: { id }, data });

      // Ao concluir: registra automaticamente duracao (TripMetrics) e
      // quilometragem final (Vehicle.odometerKm, quando informada).
      if (dto.status === TripStatus.COMPLETED) {
        if (durationMinutes !== null) {
          await tx.tripMetrics.update({
            where: { tripId: id },
            data: { actualDurationMin: durationMinutes },
          });
        }
        if (dto.finalOdometerKm !== undefined && before.composition?.vehicleId) {
          await tx.vehicle.update({
            where: { id: before.composition.vehicleId },
            data: { odometerKm: dto.finalOdometerKm },
          });
        }
      }
    });

    const action = resolveStatusChangeAction(before.status, dto.status);
    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action,
      entityName: 'Trip',
      entityId: id,
      previousValue: { status: before.status },
      newValue: { status: dto.status },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
    if (dto.status === TripStatus.COMPLETED) {
      // "Chegada" e "Conclusao" sao dois eventos distintos na timeline
      // pedida, ainda que ocorram no mesmo instante nesta fase (sem estado
      // dedicado de "chegou mas nao fechou a viagem").
      await this.audit.log({
        tenantId,
        userId: actor.userId,
        action: 'trip.arrived',
        entityName: 'Trip',
        entityId: id,
        newValue: { actualArrival: data.actualArrival },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
    }

    return this.findOne(tenantId, id);
  }

  cancel(
    tenantId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripEntity> {
    return this.updateStatus(tenantId, id, { status: TripStatus.CANCELLED }, actor, metadata);
  }

  async softDelete(
    tenantId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<void> {
    const before = await this.findOwnedOrThrow(tenantId, id);
    // So permitido enquanto a viagem nunca saiu do planejamento (ou ja foi
    // cancelada) -- qualquer outro estado intermediario (Fase 14) significa
    // que a viagem ja envolveu motorista/veiculo em campo.
    if (before.status !== TripStatus.PLANNED && before.status !== TripStatus.CANCELLED) {
      throw new ConflictException(
        'Nao e possivel excluir uma viagem que ja saiu do planejamento (apenas PLANNED ou CANCELLED).',
      );
    }

    await this.prisma.trip.update({ where: { id }, data: { deletedAt: new Date() } });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip.deleted',
      entityName: 'Trip',
      entityId: id,
      previousValue: { status: before.status },
      newValue: null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  async findOwnedOrThrow(tenantId: string, id: string): Promise<TripWithRelations> {
    const trip = await this.prisma.trip.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: TRIP_INCLUDE,
    });
    if (!trip) {
      throw new NotFoundException('Viagem nao encontrada.');
    }
    return trip;
  }

  // "Nao permitir iniciar viagem": motorista inativo, veiculo inativo/em
  // manutencao, motorista ou veiculo ja em outra viagem fisicamente ativa
  // (IN_PROGRESS/PAUSED -- ninguem dirige dois caminhoes ao mesmo tempo).
  private async assertCanStart(
    tenantId: string,
    trip: TripWithRelations,
    tripId: string,
  ): Promise<void> {
    if (trip.driverId) {
      const driver = await this.prisma.driver.findFirst({
        where: { id: trip.driverId, tenantId, deletedAt: null },
      });
      if (!driver || !driver.isActive) {
        throw new ConflictException('Nao e possivel iniciar a viagem: motorista inativo.');
      }

      const driverBusy = await this.prisma.trip.findFirst({
        where: {
          tenantId,
          driverId: trip.driverId,
          deletedAt: null,
          id: { not: tripId },
          status: { in: [TripStatus.IN_PROGRESS, TripStatus.PAUSED] },
        },
      });
      if (driverBusy) {
        throw new ConflictException(
          'Nao e possivel iniciar a viagem: motorista ja esta em outra viagem ativa.',
        );
      }
    }

    const vehicleId = trip.composition?.vehicleId;
    if (vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: vehicleId, tenantId, deletedAt: null },
      });
      if (!vehicle) {
        throw new ConflictException('Nao e possivel iniciar a viagem: veiculo nao encontrado.');
      }
      if (vehicle.status === VehicleStatus.MAINTENANCE) {
        throw new ConflictException('Nao e possivel iniciar a viagem: veiculo em manutencao.');
      }
      if (vehicle.status !== VehicleStatus.ACTIVE) {
        throw new ConflictException('Nao e possivel iniciar a viagem: veiculo inativo.');
      }

      const vehicleBusy = await this.prisma.trip.findFirst({
        where: {
          tenantId,
          deletedAt: null,
          id: { not: tripId },
          status: { in: [TripStatus.IN_PROGRESS, TripStatus.PAUSED] },
          composition: { vehicleId },
        },
      });
      if (vehicleBusy) {
        throw new ConflictException(
          'Nao e possivel iniciar a viagem: veiculo ja esta em outra viagem ativa.',
        );
      }
    }
  }

  private async assertDriverAvailable(
    tenantId: string,
    driverId: string,
    departure: Date,
    arrival: Date,
    excludeTripId?: string,
  ): Promise<void> {
    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, tenantId, deletedAt: null, isActive: true },
    });
    if (!driver) {
      throw new NotFoundException('Motorista (driverId) nao encontrado ou inativo nesta empresa.');
    }

    const overlapping = await this.prisma.trip.findFirst({
      where: {
        tenantId,
        driverId,
        deletedAt: null,
        status: { in: NON_TERMINAL_STATUSES },
        ...(excludeTripId ? { id: { not: excludeTripId } } : {}),
        plannedDeparture: { lt: arrival },
        plannedArrival: { gt: departure },
      },
    });
    if (overlapping) {
      throw new ConflictException(
        'Motorista ja possui outra viagem planejada/em andamento no mesmo periodo.',
      );
    }
  }

  // Mesma logica de disponibilidade por data do motorista, aplicada ao
  // veiculo por tras da composicao -- nao basta a composicao estar livre
  // (unica por vez), o mesmo VEICULO pode estar preso a uma composicao
  // diferente ja vinculada a outra viagem no mesmo periodo.
  private async assertVehicleAvailable(
    tenantId: string,
    vehicleId: string,
    departure: Date,
    arrival: Date,
    excludeTripId?: string,
  ): Promise<void> {
    const overlapping = await this.prisma.trip.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        status: { in: NON_TERMINAL_STATUSES },
        ...(excludeTripId ? { id: { not: excludeTripId } } : {}),
        plannedDeparture: { lt: arrival },
        plannedArrival: { gt: departure },
        composition: { vehicleId },
      },
    });
    if (overlapping) {
      throw new ConflictException(
        'Veiculo ja possui outra viagem planejada/em andamento no mesmo periodo.',
      );
    }
  }

  private async assertCompositionAvailable(
    tenantId: string,
    compositionId: string,
  ): Promise<{ id: string; vehicleId: string }> {
    const composition = await this.prisma.tripComposition.findFirst({
      where: { id: compositionId, tenantId },
    });
    if (!composition) {
      throw new NotFoundException('Composicao (compositionId) nao encontrada nesta empresa.');
    }
    if (composition.tripId) {
      throw new ConflictException('Esta composicao ja esta vinculada a outra viagem.');
    }
    return composition;
  }
}
