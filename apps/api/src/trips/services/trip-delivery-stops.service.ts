import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TripDeliveryStopStatus } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTripDeliveryStopDto } from '../dto/create-trip-delivery-stop.dto';
import { ReorderTripDeliveryStopsDto } from '../dto/reorder-trip-delivery-stops.dto';
import { UpdateTripDeliveryStopDto } from '../dto/update-trip-delivery-stop.dto';
import { UpdateTripDeliveryStopStatusDto } from '../dto/update-trip-delivery-stop-status.dto';
import { TripDeliveryStopEntity } from '../entities/trip-delivery-stop.entity';
import {
  toTripDeliveryStopEntity,
  TripDeliveryStopWithRelations,
} from '../mappers/trip-delivery-stop.mapper';
import { assertTripPlanningAllowed } from '../utils/trip-planning-lock.util';
import { CustomersService } from './customers.service';
import { LocationsService } from './locations.service';
import { TripsService } from './trips.service';

const STOP_INCLUDE = { customer: true, location: true } satisfies Prisma.TripDeliveryStopInclude;

// PENDING/IN_PROGRESS podem avancar (inclusive pulando etapa, mesmo espirito
// de ALLOWED_TRANSITIONS de Trip -- "chegou e ja concluiu" e valido); estados
// terminais (COMPLETED/CANCELLED) nunca saem de onde estao.
const ALLOWED_STATUS_TRANSITIONS: Record<TripDeliveryStopStatus, TripDeliveryStopStatus[]> = {
  PENDING: [
    TripDeliveryStopStatus.IN_PROGRESS,
    TripDeliveryStopStatus.COMPLETED,
    TripDeliveryStopStatus.CANCELLED,
  ],
  IN_PROGRESS: [TripDeliveryStopStatus.COMPLETED, TripDeliveryStopStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
};

// Fase 88 -- CRUD das paradas/entregas PLANEJADAS de uma viagem (distinto de
// TripStopsService, que trata das paradas OPERACIONAIS detectadas pelo app
// do motorista). Reaproveita TripsService (dono da checagem de tenant/
// existencia da viagem) e Customers/LocationsService (mesma validacao ja
// usada por TripsService.create/update) -- nenhuma logica de propriedade
// duplicada.
@Injectable()
export class TripDeliveryStopsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tripsService: TripsService,
    private readonly customersService: CustomersService,
    private readonly locationsService: LocationsService,
  ) {}

  async findAllForTrip(tenantId: string, tripId: string): Promise<TripDeliveryStopEntity[]> {
    await this.tripsService.findOwnedOrThrow(tenantId, tripId);

    const stops = await this.prisma.tripDeliveryStop.findMany({
      where: { tenantId, tripId },
      include: STOP_INCLUDE,
      orderBy: { sequence: 'asc' },
    });
    return stops.map(toTripDeliveryStopEntity);
  }

  async create(
    tenantId: string,
    tripId: string,
    dto: CreateTripDeliveryStopDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripDeliveryStopEntity> {
    const trip = await this.tripsService.findOwnedOrThrow(tenantId, tripId);
    assertTripPlanningAllowed(trip);

    if (dto.customerId) {
      await this.customersService.findActiveOrThrow(tenantId, dto.customerId);
    }
    await this.locationsService.findActiveOrThrow(tenantId, dto.locationId);

    const stop = await this.prisma.$transaction(async (tx) => {
      const last = await tx.tripDeliveryStop.findFirst({
        where: { tenantId, tripId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });
      return tx.tripDeliveryStop.create({
        data: {
          tenantId,
          tripId,
          sequence: (last?.sequence ?? 0) + 1,
          locationId: dto.locationId,
          ...compact({
            customerId: dto.customerId,
            plannedArrival: dto.plannedArrival ? new Date(dto.plannedArrival) : undefined,
            notes: dto.notes,
          }),
        },
        include: STOP_INCLUDE,
      });
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_delivery_stop.created',
      entityName: 'TripDeliveryStop',
      entityId: stop.id,
      newValue: toJsonSafe({
        tripId,
        sequence: stop.sequence,
        customerId: stop.customerId,
        locationId: stop.locationId,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripDeliveryStopEntity(stop);
  }

  async update(
    tenantId: string,
    tripId: string,
    stopId: string,
    dto: UpdateTripDeliveryStopDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripDeliveryStopEntity> {
    const trip = await this.tripsService.findOwnedOrThrow(tenantId, tripId);
    assertTripPlanningAllowed(trip);
    const before = await this.findOwnedStopOrThrow(tenantId, tripId, stopId);

    if (dto.customerId) {
      await this.customersService.findActiveOrThrow(tenantId, dto.customerId);
    }
    if (dto.locationId) {
      await this.locationsService.findActiveOrThrow(tenantId, dto.locationId);
    }

    const stop = await this.prisma.tripDeliveryStop.update({
      where: { id: stopId },
      data: compact({
        customerId: dto.customerId,
        locationId: dto.locationId,
        plannedArrival: dto.plannedArrival ? new Date(dto.plannedArrival) : undefined,
        notes: dto.notes,
      }),
      include: STOP_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_delivery_stop.updated',
      entityName: 'TripDeliveryStop',
      entityId: stopId,
      previousValue: toJsonSafe({
        customerId: before.customerId,
        locationId: before.locationId,
        plannedArrival: before.plannedArrival,
        notes: before.notes,
      }),
      newValue: toJsonSafe({
        customerId: stop.customerId,
        locationId: stop.locationId,
        plannedArrival: stop.plannedArrival,
        notes: stop.notes,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripDeliveryStopEntity(stop);
  }

  async updateStatus(
    tenantId: string,
    tripId: string,
    stopId: string,
    dto: UpdateTripDeliveryStopStatusDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripDeliveryStopEntity> {
    const trip = await this.tripsService.findOwnedOrThrow(tenantId, tripId);
    if (trip.status === 'COMPLETED' || trip.status === 'CANCELLED') {
      throw new ConflictException(
        'Nao e possivel alterar o status de uma parada: a viagem ja esta COMPLETED/CANCELLED.',
      );
    }
    const before = await this.findOwnedStopOrThrow(tenantId, tripId, stopId);

    if (before.status === dto.status) {
      return toTripDeliveryStopEntity(before);
    }
    const allowed = ALLOWED_STATUS_TRANSITIONS[before.status];
    if (!allowed.includes(dto.status)) {
      throw new ConflictException(
        `Transicao de status invalida: ${before.status} -> ${dto.status}.`,
      );
    }

    const stop = await this.prisma.tripDeliveryStop.update({
      where: { id: stopId },
      data: { status: dto.status },
      include: STOP_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_delivery_stop.status_changed',
      entityName: 'TripDeliveryStop',
      entityId: stopId,
      previousValue: { status: before.status },
      newValue: { status: stop.status },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripDeliveryStopEntity(stop);
  }

  async remove(
    tenantId: string,
    tripId: string,
    stopId: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<void> {
    const trip = await this.tripsService.findOwnedOrThrow(tenantId, tripId);
    assertTripPlanningAllowed(trip);
    const before = await this.findOwnedStopOrThrow(tenantId, tripId, stopId);

    await this.prisma.$transaction(async (tx) => {
      await tx.tripDeliveryStop.delete({ where: { id: stopId } });

      // Fecha a lacuna deixada na sequencia (regra 5 -- "sequencia consistente
      // e unica"): as paradas remanescentes, ordenadas, viram 1..N de novo.
      // Duas fases (offset negativo -> final) para nunca colidir com a
      // constraint unica (tripId, sequence) durante o proprio update.
      const remaining = await tx.tripDeliveryStop.findMany({
        where: { tenantId, tripId },
        orderBy: { sequence: 'asc' },
        select: { id: true },
      });
      await Promise.all(
        remaining.map((s, index) =>
          tx.tripDeliveryStop.update({ where: { id: s.id }, data: { sequence: -(index + 1) } }),
        ),
      );
      await Promise.all(
        remaining.map((s, index) =>
          tx.tripDeliveryStop.update({ where: { id: s.id }, data: { sequence: index + 1 } }),
        ),
      );
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_delivery_stop.deleted',
      entityName: 'TripDeliveryStop',
      entityId: stopId,
      previousValue: toJsonSafe({
        tripId,
        sequence: before.sequence,
        customerId: before.customerId,
        locationId: before.locationId,
      }),
      newValue: null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  async reorder(
    tenantId: string,
    tripId: string,
    dto: ReorderTripDeliveryStopsDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripDeliveryStopEntity[]> {
    const trip = await this.tripsService.findOwnedOrThrow(tenantId, tripId);
    assertTripPlanningAllowed(trip);

    const existing = await this.prisma.tripDeliveryStop.findMany({
      where: { tenantId, tripId },
      select: { id: true, sequence: true },
    });

    const existingIds = new Set(existing.map((s) => s.id));
    const dtoIds = new Set(dto.items.map((i) => i.id));
    if (existingIds.size !== dtoIds.size || [...existingIds].some((id) => !dtoIds.has(id))) {
      throw new BadRequestException(
        'items deve conter exatamente todas as paradas atuais da viagem (nenhuma a mais ou a menos).',
      );
    }

    const sequences = dto.items.map((i) => i.sequence).sort((a, b) => a - b);
    const expected = Array.from({ length: sequences.length }, (_, i) => i + 1);
    if (sequences.some((seq, index) => seq !== expected[index])) {
      throw new BadRequestException('sequence deve formar a sequencia 1..N sem lacunas nem repeticoes.');
    }

    const previous = new Map(existing.map((s) => [s.id, s.sequence]));

    await this.prisma.$transaction(async (tx) => {
      // Mesma tecnica de duas fases do remove() acima -- evita colidir com a
      // constraint unica (tripId, sequence) ao trocar posicoes entre si.
      await Promise.all(
        dto.items.map((item) =>
          tx.tripDeliveryStop.update({ where: { id: item.id }, data: { sequence: -item.sequence } }),
        ),
      );
      await Promise.all(
        dto.items.map((item) =>
          tx.tripDeliveryStop.update({ where: { id: item.id }, data: { sequence: item.sequence } }),
        ),
      );
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_delivery_stop.reordered',
      entityName: 'TripDeliveryStop',
      entityId: tripId,
      previousValue: toJsonSafe(Object.fromEntries(previous)),
      newValue: toJsonSafe(Object.fromEntries(dto.items.map((i) => [i.id, i.sequence]))),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return this.findAllForTrip(tenantId, tripId);
  }

  private async findOwnedStopOrThrow(
    tenantId: string,
    tripId: string,
    stopId: string,
  ): Promise<TripDeliveryStopWithRelations> {
    const stop = await this.prisma.tripDeliveryStop.findFirst({
      where: { id: stopId, tenantId, tripId },
      include: STOP_INCLUDE,
    });
    if (!stop) {
      throw new NotFoundException('Parada/entrega nao encontrada para esta viagem.');
    }
    return stop;
  }
}
