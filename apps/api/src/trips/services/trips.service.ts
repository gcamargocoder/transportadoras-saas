import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TripStatus } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTripDto } from '../dto/create-trip.dto';
import { FindTripsQueryDto } from '../dto/find-trips-query.dto';
import { UpdateTripStatusDto } from '../dto/update-trip-status.dto';
import { UpdateTripDto } from '../dto/update-trip.dto';
import { PaginatedTripsEntity } from '../entities/paginated-trips.entity';
import { TripEntity } from '../entities/trip.entity';
import { toTripEntity, TripWithRelations } from '../mappers/trip.mapper';
import { CustomersService } from './customers.service';
import { LocationsService } from './locations.service';

const TRIP_INCLUDE = {
  customer: true,
  driver: true,
  origin: true,
  destination: true,
  composition: { include: { vehicle: true } },
} satisfies Prisma.TripInclude;

// PLANNED -> IN_PROGRESS -> COMPLETED, com CANCELLED acessivel a partir de
// PLANNED ou IN_PROGRESS. COMPLETED/CANCELLED sao terminais. Sem status
// "Replanned", conforme instruido.
const ALLOWED_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  PLANNED: [TripStatus.IN_PROGRESS, TripStatus.CANCELLED],
  IN_PROGRESS: [TripStatus.COMPLETED, TripStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
};

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly locationsService: LocationsService,
    private readonly customersService: CustomersService,
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
    if (dto.driverId) {
      await this.assertDriverAvailable(tenantId, dto.driverId, departure, arrival);
    }
    if (dto.compositionId) {
      await this.assertCompositionAvailable(tenantId, dto.compositionId);
    }

    const trip = await this.prisma.$transaction(async (tx) => {
      const created = await tx.trip.create({
        data: {
          tenantId,
          originLocationId: dto.originLocationId,
          destinationLocationId: dto.destinationLocationId,
          plannedDeparture: departure,
          plannedArrival: arrival,
          ...compact({
            customerId: dto.customerId,
            driverId: dto.driverId,
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

      if (dto.compositionId) {
        await tx.tripComposition.update({
          where: { id: dto.compositionId },
          data: { tripId: created.id },
        });
      }

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
    if (dto.driverId && departure && arrival) {
      await this.assertDriverAvailable(tenantId, dto.driverId, departure, arrival, id);
    }

    const currentCompositionId = before.composition?.id ?? null;
    const nextCompositionIdProvided = dto.compositionId !== undefined;
    if (
      nextCompositionIdProvided &&
      dto.compositionId &&
      dto.compositionId !== currentCompositionId
    ) {
      await this.assertCompositionAvailable(tenantId, dto.compositionId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.trip.update({
        where: { id },
        data: compact({
          customerId: dto.customerId,
          driverId: dto.driverId,
          originLocationId: dto.originLocationId,
          destinationLocationId: dto.destinationLocationId,
          plannedDeparture: dto.plannedDeparture ? departure : undefined,
          plannedArrival: dto.plannedArrival ? arrival : undefined,
          priority: dto.priority,
          notes: dto.notes,
        }),
      });

      if (nextCompositionIdProvided && dto.compositionId !== currentCompositionId) {
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
      }),
      newValue: toJsonSafe({
        originLocationId: after.originLocationId,
        destinationLocationId: after.destinationLocationId,
        plannedDeparture: after.plannedDeparture,
        plannedArrival: after.plannedArrival,
        driverId: after.driverId,
        compositionId: after.composition?.id ?? null,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

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

    const data: Prisma.TripUpdateInput = { status: dto.status };
    if (dto.status === TripStatus.IN_PROGRESS && !before.actualDeparture) {
      data.actualDeparture = new Date();
    }
    if (dto.status === TripStatus.COMPLETED && !before.actualArrival) {
      data.actualArrival = new Date();
    }

    await this.prisma.trip.update({ where: { id }, data });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip.status_changed',
      entityName: 'Trip',
      entityId: id,
      previousValue: { status: before.status },
      newValue: { status: dto.status },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

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
    if (before.status === TripStatus.IN_PROGRESS || before.status === TripStatus.COMPLETED) {
      throw new ConflictException('Nao e possivel excluir uma viagem em andamento ou concluida.');
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
        status: { in: [TripStatus.PLANNED, TripStatus.IN_PROGRESS] },
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

  private async assertCompositionAvailable(tenantId: string, compositionId: string): Promise<void> {
    const composition = await this.prisma.tripComposition.findFirst({
      where: { id: compositionId, tenantId },
    });
    if (!composition) {
      throw new NotFoundException('Composicao (compositionId) nao encontrada nesta empresa.');
    }
    if (composition.tripId) {
      throw new ConflictException('Esta composicao ja esta vinculada a outra viagem.');
    }
  }
}
