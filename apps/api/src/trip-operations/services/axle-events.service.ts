import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CloseAxleEventDto } from '../dto/close-axle-event.dto';
import { CreateAxleEventDto } from '../dto/create-axle-event.dto';
import { AxleEventEntity } from '../entities/axle-event.entity';
import { AxleEventWithRelations, toAxleEventEntity } from '../mappers/axle-event.mapper';

const AXLE_EVENT_INCLUDE = { tollPlaza: true } satisfies Prisma.AxleEventInclude;

@Injectable()
export class AxleEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // POST /driver/trips/:id/axle-events -- registra uma excecao TEMPORARIA de
  // eixos (Fase 25). NUNCA altera AxleConfiguration.totalAxles -- e sempre
  // um registro historico paralelo. declaredAxles ausente = timeout (o
  // motorista nao respondeu ao alerta): assume automaticamente o padrao da
  // composicao, comportamento normal, nunca um erro.
  async open(
    tenantId: string,
    tripId: string,
    dto: CreateAxleEventDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<AxleEventEntity> {
    const existing = await this.prisma.axleEvent.findFirst({
      where: { tenantId, deviceEventId: dto.deviceEventId },
      include: AXLE_EVENT_INCLUDE,
    });
    if (existing) {
      return toAxleEventEntity(existing);
    }

    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, tenantId, deletedAt: null },
      include: { composition: { include: { axleConfiguration: true } } },
    });
    if (!trip) {
      throw new NotFoundException('Viagem nao encontrada nesta empresa.');
    }
    if (!trip.composition?.vehicleId) {
      throw new ConflictException('Esta viagem nao possui veiculo (composicao) vinculado.');
    }
    if (!trip.driverId) {
      throw new ConflictException('Esta viagem nao possui motorista vinculado.');
    }
    const axleConfiguration = trip.composition.axleConfiguration;
    if (!axleConfiguration) {
      throw new ConflictException(
        'A composicao desta viagem nao tem configuracao de eixos cadastrada.',
      );
    }

    if (dto.tollPlazaId) {
      const plazaExists = await this.prisma.tollPlaza.findUnique({ where: { id: dto.tollPlazaId } });
      if (!plazaExists) {
        throw new NotFoundException('Praca de pedagio (tollPlazaId) nao encontrada.');
      }
    }

    const defaultAxles = axleConfiguration.totalAxles;
    const declaredAxles = dto.declaredAxles ?? defaultAxles;
    const suspendedAxles = Math.max(defaultAxles - declaredAxles, 0);

    const event = await this.prisma.axleEvent.create({
      data: {
        tenantId,
        tripId,
        tripCompositionId: trip.composition.id,
        vehicleId: trip.composition.vehicleId,
        driverId: trip.driverId,
        tollPlazaId: dto.tollPlazaId ?? null,
        defaultAxles,
        declaredAxles,
        suspendedAxles,
        source: dto.source,
        startedAt: new Date(),
        latitude: dto.latitude,
        longitude: dto.longitude,
        deviceEventId: dto.deviceEventId,
        syncedAt: new Date(),
      },
      include: AXLE_EVENT_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'axle_event.opened',
      entityName: 'AxleEvent',
      entityId: event.id,
      newValue: toJsonSafe({
        tripId,
        tollPlazaId: event.tollPlazaId,
        defaultAxles: event.defaultAxles,
        declaredAxles: event.declaredAxles,
        source: event.source,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toAxleEventEntity(event);
  }

  // PATCH /driver/trips/:id/axle-events/:eventId/close -- praca ultrapassada,
  // configuracao "volta" ao padrao implicitamente (nao ha o que alterar em
  // Vehicle/AxleConfiguration -- eles nunca mudaram). Idempotente.
  async close(
    tenantId: string,
    tripId: string,
    eventId: string,
    dto: CloseAxleEventDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<AxleEventEntity> {
    const before = await this.findOwnedOrThrow(tenantId, tripId, eventId);
    if (before.endedAt) {
      return toAxleEventEntity(before);
    }

    const event = await this.prisma.axleEvent.update({
      where: { id: eventId },
      data: { endedAt: new Date(dto.endedAt) },
      include: AXLE_EVENT_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'axle_event.closed',
      entityName: 'AxleEvent',
      entityId: event.id,
      newValue: toJsonSafe({ endedAt: event.endedAt }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toAxleEventEntity(event);
  }

  async findAll(tenantId: string, tripId: string): Promise<AxleEventEntity[]> {
    await this.assertTripExists(tenantId, tripId);
    const events = await this.prisma.axleEvent.findMany({
      where: { tenantId, tripId },
      include: AXLE_EVENT_INCLUDE,
      orderBy: { startedAt: 'desc' },
    });
    return events.map(toAxleEventEntity);
  }

  private async assertTripExists(tenantId: string, tripId: string): Promise<void> {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, tenantId, deletedAt: null } });
    if (!trip) {
      throw new NotFoundException('Viagem nao encontrada nesta empresa.');
    }
  }

  private async findOwnedOrThrow(
    tenantId: string,
    tripId: string,
    eventId: string,
  ): Promise<AxleEventWithRelations> {
    const event = await this.prisma.axleEvent.findFirst({
      where: { id: eventId, tenantId, tripId },
      include: AXLE_EVENT_INCLUDE,
    });
    if (!event) {
      throw new NotFoundException('Evento de eixo nao encontrado para esta viagem.');
    }
    return event;
  }
}
