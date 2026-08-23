import { Injectable, NotFoundException } from '@nestjs/common';
import { RouteEvent } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRouteEventDto } from '../dto/create-route-event.dto';
import { UpdateRouteEventDto } from '../dto/update-route-event.dto';
import { RouteEventEntity } from '../entities/route-event.entity';
import { toRouteEventEntity } from '../mappers/route-event.mapper';
import { TripsService } from './trips.service';

// CRUD administrativo (criacao/edicao/remocao manual de um evento de rota).
// Este NAO e o unico ponto de criacao de RouteEvent: RoutingService.
// checkDeviation() (disparado a cada lote de TrackingPoint recebido) ja
// cria automaticamente um evento tipo DEVIATION quando a posicao real se
// afasta da rota planejada por tempo/distancia suficientes -- comentario
// corrigido na Fase 66 (estava desatualizado desde que essa deteccao
// automatica foi implementada em fase posterior a este arquivo).
@Injectable()
export class RouteEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tripsService: TripsService,
  ) {}

  async findAll(tenantId: string, tripId: string): Promise<RouteEventEntity[]> {
    await this.tripsService.findOwnedOrThrow(tenantId, tripId);

    const events = await this.prisma.routeEvent.findMany({
      where: { tenantId, tripId },
      orderBy: { detectedAt: 'desc' },
    });
    return events.map(toRouteEventEntity);
  }

  async findOne(tenantId: string, tripId: string, eventId: string): Promise<RouteEventEntity> {
    return toRouteEventEntity(await this.findOwnedEventOrThrow(tenantId, tripId, eventId));
  }

  async create(
    tenantId: string,
    tripId: string,
    dto: CreateRouteEventDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<RouteEventEntity> {
    await this.tripsService.findOwnedOrThrow(tenantId, tripId);

    const event = await this.prisma.routeEvent.create({
      data: {
        tenantId,
        tripId,
        type: dto.type,
        ...compact({ detectedAt: dto.detectedAt ? new Date(dto.detectedAt) : undefined }),
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'route_event.created',
      entityName: 'RouteEvent',
      entityId: event.id,
      newValue: toJsonSafe({ tripId, type: event.type }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toRouteEventEntity(event);
  }

  async update(
    tenantId: string,
    tripId: string,
    eventId: string,
    dto: UpdateRouteEventDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<RouteEventEntity> {
    const before = await this.findOwnedEventOrThrow(tenantId, tripId, eventId);

    const event = await this.prisma.routeEvent.update({
      where: { id: eventId },
      data: compact({ resolvedAt: dto.resolvedAt ? new Date(dto.resolvedAt) : undefined }),
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'route_event.updated',
      entityName: 'RouteEvent',
      entityId: eventId,
      previousValue: { resolvedAt: before.resolvedAt },
      newValue: { resolvedAt: event.resolvedAt },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toRouteEventEntity(event);
  }

  async remove(
    tenantId: string,
    tripId: string,
    eventId: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<void> {
    const before = await this.findOwnedEventOrThrow(tenantId, tripId, eventId);

    await this.prisma.routeEvent.delete({ where: { id: eventId } });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'route_event.deleted',
      entityName: 'RouteEvent',
      entityId: eventId,
      previousValue: toJsonSafe({ type: before.type }),
      newValue: null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  private async findOwnedEventOrThrow(
    tenantId: string,
    tripId: string,
    eventId: string,
  ): Promise<RouteEvent> {
    const event = await this.prisma.routeEvent.findFirst({
      where: { id: eventId, tenantId, tripId },
    });
    if (!event) {
      throw new NotFoundException('Evento de rota nao encontrado para esta viagem.');
    }
    return event;
  }
}
