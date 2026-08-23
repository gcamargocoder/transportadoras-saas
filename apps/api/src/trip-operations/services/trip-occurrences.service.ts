import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TripOccurrence, TripOccurrenceSeverity } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDriverTripOccurrenceDto } from '../dto/create-driver-trip-occurrence.dto';
import { CreateTripOccurrenceDto } from '../dto/create-trip-occurrence.dto';
import { FindTripOccurrencesQueryDto } from '../dto/find-trip-occurrences-query.dto';
import { TripOccurrenceEntity } from '../entities/trip-occurrence.entity';
import { toTripOccurrenceEntity } from '../mappers/trip-occurrence.mapper';

// Fase 67 -- ocorrencia registrada durante uma viagem. Nunca uma segunda
// fonte de eventos: apenas o registro do proprio incidente (a timeline
// unificada em TripTimelineService agrega este model como mais uma origem).
// Mesmo desenho de idempotencia/RBAC/auditoria ja usado em TripStopsService.
@Injectable()
export class TripOccurrencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // POST /trips/:id/occurrences -- registro administrativo.
  async create(
    tenantId: string,
    tripId: string,
    dto: CreateTripOccurrenceDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripOccurrenceEntity> {
    await this.assertTripExists(tenantId, tripId);
    if (dto.driverId) await this.assertDriverExists(tenantId, dto.driverId);
    if (dto.vehicleId) await this.assertVehicleExists(tenantId, dto.vehicleId);
    if (dto.attachmentId) await this.assertAttachmentExists(tenantId, dto.attachmentId);

    const activeShiftId = dto.driverId ? await this.findActiveShiftId(tenantId, dto.driverId) : null;

    const occurrence = await this.prisma.tripOccurrence.create({
      data: {
        tenantId,
        tripId,
        type: dto.type,
        severity: dto.severity ?? TripOccurrenceSeverity.INFO,
        description: dto.description,
        occurredAt: new Date(dto.occurredAt),
        createdBy: actor.userId,
        ...compact({
          driverId: dto.driverId,
          vehicleId: dto.vehicleId,
          driverShiftId: activeShiftId ?? undefined,
          latitude: dto.latitude,
          longitude: dto.longitude,
          locationLabel: dto.locationLabel,
          attachmentId: dto.attachmentId,
        }),
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip.occurrence_created',
      entityName: 'TripOccurrence',
      entityId: occurrence.id,
      newValue: toJsonSafe({ tripId, type: occurrence.type, severity: occurrence.severity }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripOccurrenceEntity(occurrence);
  }

  // POST /driver/trips/:id/occurrences -- registro pelo proprio motorista.
  // Idempotente por deviceEventId (mesmo padrao de TripStopsService.open).
  // vehicleId SEMPRE derivado da Trip, driverId SEMPRE o motorista
  // autenticado -- nunca aceitos do corpo.
  async createFromDriverApp(
    tenantId: string,
    tripId: string,
    driverId: string,
    dto: CreateDriverTripOccurrenceDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripOccurrenceEntity> {
    const existing = await this.prisma.tripOccurrence.findFirst({
      where: { tenantId, deviceEventId: dto.deviceEventId },
    });
    if (existing) {
      return toTripOccurrenceEntity(existing);
    }

    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, tenantId, deletedAt: null },
      include: { composition: true },
    });
    if (!trip) {
      throw new NotFoundException('Viagem nao encontrada nesta empresa.');
    }

    const activeShiftId = await this.findActiveShiftId(tenantId, driverId);

    const occurrence = await this.prisma.tripOccurrence.create({
      data: {
        tenantId,
        tripId,
        driverId,
        type: dto.type,
        severity: dto.severity ?? TripOccurrenceSeverity.INFO,
        description: dto.description,
        occurredAt: new Date(dto.occurredAt),
        deviceEventId: dto.deviceEventId,
        createdBy: actor.userId,
        ...compact({
          vehicleId: trip.composition?.vehicleId,
          driverShiftId: activeShiftId ?? undefined,
          latitude: dto.latitude,
          longitude: dto.longitude,
          attachmentId: dto.attachmentId,
        }),
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip.occurrence_created',
      entityName: 'TripOccurrence',
      entityId: occurrence.id,
      newValue: toJsonSafe({ tripId, type: occurrence.type, severity: occurrence.severity, source: 'DRIVER_APP' }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripOccurrenceEntity(occurrence);
  }

  // PATCH /trips/:id/occurrences/:occId/resolve -- idempotente (resolver 2x
  // devolve o mesmo estado, nunca sobrescreve resolvedAt/resolvedBy).
  async resolve(
    tenantId: string,
    tripId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripOccurrenceEntity> {
    const before = await this.findOwnedOrThrow(tenantId, tripId, id);
    if (before.cancelledAt) {
      throw new ConflictException('Esta ocorrencia foi cancelada e nao pode ser resolvida.');
    }
    if (before.resolvedAt) {
      return toTripOccurrenceEntity(before);
    }

    const occurrence = await this.prisma.tripOccurrence.update({
      where: { id: before.id },
      data: { resolvedAt: new Date(), resolvedBy: actor.userId },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip.occurrence_resolved',
      entityName: 'TripOccurrence',
      entityId: occurrence.id,
      newValue: toJsonSafe({ resolvedAt: occurrence.resolvedAt }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripOccurrenceEntity(occurrence);
  }

  // PATCH /trips/:id/occurrences/:occId/cancel -- correcao de um registro
  // indevido. Idempotente; permitido tanto para uma ocorrencia aberta
  // quanto ja resolvida (mesmo principio de TripStopsService.cancel) --
  // uma vez cancelada, nunca deve entrar em KPIs/alertas.
  async cancel(
    tenantId: string,
    tripId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripOccurrenceEntity> {
    const before = await this.findOwnedOrThrow(tenantId, tripId, id);
    if (before.cancelledAt) {
      return toTripOccurrenceEntity(before);
    }

    const occurrence = await this.prisma.tripOccurrence.update({
      where: { id: before.id },
      data: { cancelledAt: new Date() },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip.occurrence_cancelled',
      entityName: 'TripOccurrence',
      entityId: occurrence.id,
      newValue: toJsonSafe({ cancelledAt: occurrence.cancelledAt }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripOccurrenceEntity(occurrence);
  }

  async findAllForTrip(
    tenantId: string,
    tripId: string,
    query: FindTripOccurrencesQueryDto,
  ): Promise<TripOccurrenceEntity[]> {
    await this.assertTripExists(tenantId, tripId);

    let statusFilter: Record<string, unknown> = {};
    if (query.status === 'OPEN') statusFilter = { resolvedAt: null, cancelledAt: null };
    else if (query.status === 'RESOLVED') statusFilter = { resolvedAt: { not: null }, cancelledAt: null };
    else if (query.status === 'CANCELLED') statusFilter = { cancelledAt: { not: null } };

    const occurrences = await this.prisma.tripOccurrence.findMany({
      where: {
        tenantId,
        tripId,
        ...compact({ type: query.type, severity: query.severity }),
        ...statusFilter,
      },
      orderBy: { occurredAt: 'desc' },
    });
    return occurrences.map(toTripOccurrenceEntity);
  }

  async findOne(tenantId: string, tripId: string, id: string): Promise<TripOccurrenceEntity> {
    return toTripOccurrenceEntity(await this.findOwnedOrThrow(tenantId, tripId, id));
  }

  private async findActiveShiftId(tenantId: string, driverId: string): Promise<string | null> {
    const shift = await this.prisma.driverShift.findFirst({
      where: { tenantId, driverId, endedAt: null, cancelledAt: null },
      select: { id: true },
    });
    return shift?.id ?? null;
  }

  private async assertTripExists(tenantId: string, tripId: string): Promise<void> {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, tenantId, deletedAt: null } });
    if (!trip) {
      throw new NotFoundException('Viagem nao encontrada nesta empresa.');
    }
  }

  private async assertDriverExists(tenantId: string, driverId: string): Promise<void> {
    const driver = await this.prisma.driver.findFirst({ where: { id: driverId, tenantId, deletedAt: null } });
    if (!driver) {
      throw new NotFoundException('Motorista nao encontrado nesta empresa.');
    }
  }

  private async assertVehicleExists(tenantId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, tenantId, deletedAt: null } });
    if (!vehicle) {
      throw new NotFoundException('Veiculo nao encontrado nesta empresa.');
    }
  }

  private async assertAttachmentExists(tenantId: string, attachmentId: string): Promise<void> {
    const attachment = await this.prisma.attachment.findFirst({ where: { id: attachmentId, tenantId } });
    if (!attachment) {
      throw new NotFoundException('Anexo nao encontrado nesta empresa.');
    }
  }

  private async findOwnedOrThrow(tenantId: string, tripId: string, id: string): Promise<TripOccurrence> {
    const occurrence = await this.prisma.tripOccurrence.findFirst({ where: { id, tenantId, tripId } });
    if (!occurrence) {
      throw new NotFoundException('Ocorrencia nao encontrada para esta viagem.');
    }
    return occurrence;
  }
}
