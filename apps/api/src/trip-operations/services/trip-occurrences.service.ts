import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TripOccurrence, TripOccurrenceSeverity } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDriverTripOccurrenceDto } from '../dto/create-driver-trip-occurrence.dto';
import { CreateTripOccurrenceDto } from '../dto/create-trip-occurrence.dto';
import { FindDeliveryOccurrencesQueryDto } from '../dto/find-delivery-occurrences-query.dto';
import { FindTripOccurrencesQueryDto } from '../dto/find-trip-occurrences-query.dto';
import {
  DeliveryOccurrenceSeverityCountEntity,
  DeliveryOccurrenceTypeCountEntity,
  DeliveryOccurrencesDashboardEntity,
} from '../entities/delivery-occurrences-dashboard.entity';
import { PaginatedDeliveryOccurrencesEntity } from '../entities/paginated-delivery-occurrences.entity';
import { TripOccurrenceEntity } from '../entities/trip-occurrence.entity';
import { DeliveryOccurrenceListRow, toDeliveryOccurrenceListItemEntity, toTripOccurrenceEntity } from '../mappers/trip-occurrence.mapper';

const DELIVERY_OCCURRENCE_INCLUDE = {
  trip: { include: { origin: true, destination: true } },
  tripDeliveryStop: { select: { sequence: true } },
  driver: true,
  vehicle: true,
  creator: true,
  resolver: true,
} satisfies Prisma.TripOccurrenceInclude;

// Status ainda em aberto (nunca resolvida/cancelada) -- usado tanto para o
// filtro "OPEN"/"IN_PROGRESS" quanto para os indicadores do dashboard.
const OPEN_WHERE = { resolvedAt: null, cancelledAt: null } satisfies Prisma.TripOccurrenceWhereInput;

// Fase 67 -- ocorrencia registrada durante uma viagem. Nunca uma segunda
// fonte de eventos: apenas o registro do proprio incidente (a timeline
// unificada em TripTimelineService agrega este model como mais uma origem).
// Mesmo desenho de idempotencia/RBAC/auditoria ja usado em TripStopsService.
// Fase 101 -- evoluido com vinculo a TripDeliveryStop (ocorrencias de
// entrega), status IN_PROGRESS e a visao cross-trip (findAllDeliveryOccurrences/
// getDeliveryOccurrencesDashboard) -- nunca um segundo model/service.
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
    if (dto.tripDeliveryStopId) await this.assertTripDeliveryStopBelongsToTrip(tenantId, tripId, dto.tripDeliveryStopId);

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
          tripDeliveryStopId: dto.tripDeliveryStopId,
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
      newValue: toJsonSafe({ tripId, tripDeliveryStopId: occurrence.tripDeliveryStopId, type: occurrence.type, severity: occurrence.severity }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripOccurrenceEntity(occurrence);
  }

  // POST /driver/trips/:id/occurrences -- registro pelo proprio motorista.
  // Idempotente por deviceEventId (mesmo padrao de TripStopsService.open).
  // vehicleId SEMPRE derivado da Trip, driverId SEMPRE o motorista
  // autenticado -- nunca aceitos do corpo. tripDeliveryStopId (Fase 101) e
  // o unico vinculo operacional que o proprio app escolhe, sempre validado
  // contra a viagem do motorista autenticado.
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
    if (dto.tripDeliveryStopId) await this.assertTripDeliveryStopBelongsToTrip(tenantId, tripId, dto.tripDeliveryStopId);

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
          tripDeliveryStopId: dto.tripDeliveryStopId,
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
      newValue: toJsonSafe({
        tripId,
        tripDeliveryStopId: occurrence.tripDeliveryStopId,
        type: occurrence.type,
        severity: occurrence.severity,
        source: 'DRIVER_APP',
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripOccurrenceEntity(occurrence);
  }

  // PATCH /trips/:id/occurrences/:occId/start (Fase 101) -- marca que a
  // ocorrencia esta sendo tratada. Idempotente; bloqueado se ja
  // resolvida/cancelada (mesma trava de resolve/cancel abaixo).
  async markInProgress(tenantId: string, tripId: string, id: string, actor: AuditActor, metadata: RequestMetadata): Promise<TripOccurrenceEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id, tripId);
    return this.applyMarkInProgress(tenantId, before, actor, metadata);
  }

  async markInProgressByOccurrenceId(tenantId: string, id: string, actor: AuditActor, metadata: RequestMetadata): Promise<TripOccurrenceEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id, null);
    return this.applyMarkInProgress(tenantId, before, actor, metadata);
  }

  // PATCH /trips/:id/occurrences/:occId/resolve -- idempotente (resolver 2x
  // devolve o mesmo estado, nunca sobrescreve resolvedAt/resolvedBy).
  async resolve(tenantId: string, tripId: string, id: string, actor: AuditActor, metadata: RequestMetadata): Promise<TripOccurrenceEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id, tripId);
    return this.applyResolve(tenantId, before, actor, metadata);
  }

  async resolveByOccurrenceId(tenantId: string, id: string, actor: AuditActor, metadata: RequestMetadata): Promise<TripOccurrenceEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id, null);
    return this.applyResolve(tenantId, before, actor, metadata);
  }

  // PATCH /trips/:id/occurrences/:occId/cancel -- correcao de um registro
  // indevido. Idempotente; permitido tanto para uma ocorrencia aberta
  // quanto ja resolvida (mesmo principio de TripStopsService.cancel) --
  // uma vez cancelada, nunca deve entrar em KPIs/alertas.
  async cancel(tenantId: string, tripId: string, id: string, actor: AuditActor, metadata: RequestMetadata): Promise<TripOccurrenceEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id, tripId);
    return this.applyCancel(tenantId, before, actor, metadata);
  }

  async cancelByOccurrenceId(tenantId: string, id: string, actor: AuditActor, metadata: RequestMetadata): Promise<TripOccurrenceEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id, null);
    return this.applyCancel(tenantId, before, actor, metadata);
  }

  async findAllForTrip(tenantId: string, tripId: string, query: FindTripOccurrencesQueryDto): Promise<TripOccurrenceEntity[]> {
    await this.assertTripExists(tenantId, tripId);

    const occurrences = await this.prisma.tripOccurrence.findMany({
      where: {
        tenantId,
        tripId,
        ...compact({ type: query.type, severity: query.severity, tripDeliveryStopId: query.tripDeliveryStopId }),
        ...this.buildStatusWhere(query.status),
      },
      orderBy: { occurredAt: 'desc' },
    });
    return occurrences.map(toTripOccurrenceEntity);
  }

  async findOne(tenantId: string, tripId: string, id: string): Promise<TripOccurrenceEntity> {
    return toTripOccurrenceEntity(await this.findOwnedOrThrow(tenantId, id, tripId));
  }

  // GET /delivery-occurrences (Fase 101) -- visao operacional CROSS-TRIP das
  // ocorrencias de ENTREGA. Base where SEMPRE exige tripDeliveryStopId !=
  // null -- e o que distingue esta listagem de GET /trips/:id/occurrences
  // (ocorrencias gerais da viagem inteira, ja existente desde a Fase 67).
  // Paginacao sempre no banco; 1 unica query com include (JOIN), nunca 1
  // query por linha.
  async findAllDeliveryOccurrences(tenantId: string, query: FindDeliveryOccurrencesQueryDto): Promise<PaginatedDeliveryOccurrencesEntity> {
    return this.findAllOccurrencesWithWhere(this.buildDeliveryOccurrenceWhere(tenantId, query), query);
  }

  // Fase 115 -- GET /trip-occurrences: a MESMA visao cross-trip acima, mas
  // sem a restricao a paradas -- cobre TAMBEM as ocorrencias GERAIS da
  // viagem (quebra, acidente etc., sem tripDeliveryStopId), que ate aqui so
  // eram visiveis viagem por viagem (GET /trips/:id/occurrences). Nenhuma
  // segunda fonte/tabela/regra: mesmo buildOccurrenceWhere, mesmo include,
  // mesmo mapper, mesma paginacao no banco de findAllDeliveryOccurrences
  // acima -- so sem o filtro fixo de tripDeliveryStopId.
  async findAllOccurrences(tenantId: string, query: FindDeliveryOccurrencesQueryDto): Promise<PaginatedDeliveryOccurrencesEntity> {
    const where = this.buildOccurrenceWhere(tenantId, query);
    return this.findAllOccurrencesWithWhere(where, query);
  }

  private async findAllOccurrencesWithWhere(
    where: Prisma.TripOccurrenceWhereInput,
    query: FindDeliveryOccurrencesQueryDto,
  ): Promise<PaginatedDeliveryOccurrencesEntity> {
    if (query.status) Object.assign(where, this.buildStatusWhere(query.status));

    const [rows, total] = await Promise.all([
      this.prisma.tripOccurrence.findMany({
        where,
        include: DELIVERY_OCCURRENCE_INCLUDE,
        orderBy: { occurredAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.tripOccurrence.count({ where }),
    ]);

    const result = new PaginatedDeliveryOccurrencesEntity();
    result.items = rows.map((row) => toDeliveryOccurrenceListItemEntity(row as DeliveryOccurrenceListRow));
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  // Fase 115 -- reaproveitado tanto por GET /delivery-occurrences/:id quanto
  // por GET /trip-occurrences/:id (nunca teve nada especifico de entrega:
  // findOwnedOrThrow/toTripOccurrenceEntity ja sao genericos desde a
  // Fase 67).
  async findOneOccurrence(tenantId: string, id: string): Promise<TripOccurrenceEntity> {
    return toTripOccurrenceEntity(await this.findOwnedOrThrow(tenantId, id, null));
  }

  // GET /delivery-occurrences/dashboard -- indicadores. 4 contagens (status
  // derivado, nunca uma coluna -- groupBy nao se aplica) + groupBy por
  // severity/type (colunas reais) + 1 contagem de alerta critico, tudo em
  // paralelo -- custo constante, independente do volume de ocorrencias.
  async getDeliveryOccurrencesDashboard(tenantId: string, query: FindDeliveryOccurrencesQueryDto): Promise<DeliveryOccurrencesDashboardEntity> {
    return this.buildDashboard(this.buildDeliveryOccurrenceWhere(tenantId, query));
  }

  // Fase 115 -- GET /trip-occurrences/dashboard: mesmos indicadores acima,
  // agora sobre TODAS as ocorrencias (nao so as de entrega).
  async getOccurrencesDashboard(tenantId: string, query: FindDeliveryOccurrencesQueryDto): Promise<DeliveryOccurrencesDashboardEntity> {
    const where = this.buildOccurrenceWhere(tenantId, query);
    return this.buildDashboard(where);
  }

  private async buildDashboard(where: Prisma.TripOccurrenceWhereInput): Promise<DeliveryOccurrencesDashboardEntity> {
    const [total, openCount, inProgressCount, resolvedCount, cancelledCount, criticalOpenCount, severityRows, typeRows] = await Promise.all([
      this.prisma.tripOccurrence.count({ where }),
      this.prisma.tripOccurrence.count({ where: { ...where, ...OPEN_WHERE, inProgressAt: null } }),
      this.prisma.tripOccurrence.count({ where: { ...where, ...OPEN_WHERE, inProgressAt: { not: null } } }),
      this.prisma.tripOccurrence.count({ where: { ...where, resolvedAt: { not: null }, cancelledAt: null } }),
      this.prisma.tripOccurrence.count({ where: { ...where, cancelledAt: { not: null } } }),
      this.prisma.tripOccurrence.count({ where: { ...where, ...OPEN_WHERE, severity: TripOccurrenceSeverity.CRITICAL } }),
      this.prisma.tripOccurrence.groupBy({ by: ['severity'], where, _count: true }),
      this.prisma.tripOccurrence.groupBy({ by: ['type'], where, _count: true }),
    ]);

    const entity = new DeliveryOccurrencesDashboardEntity();
    entity.totalCount = total;
    entity.openCount = openCount;
    entity.inProgressCount = inProgressCount;
    entity.resolvedCount = resolvedCount;
    entity.cancelledCount = cancelledCount;
    entity.criticalOpenCount = criticalOpenCount;
    entity.bySeverity = severityRows.map((row) => {
      const entry = new DeliveryOccurrenceSeverityCountEntity();
      entry.severity = row.severity;
      entry.count = row._count;
      return entry;
    });
    entity.byType = typeRows.map((row) => {
      const entry = new DeliveryOccurrenceTypeCountEntity();
      entry.type = row.type;
      entry.count = row._count;
      return entry;
    });
    return entity;
  }

  private async applyMarkInProgress(
    tenantId: string,
    before: TripOccurrence,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripOccurrenceEntity> {
    if (before.cancelledAt) {
      throw new ConflictException('Esta ocorrencia foi cancelada e nao pode ser marcada como em andamento.');
    }
    if (before.resolvedAt) {
      throw new ConflictException('Esta ocorrencia ja foi resolvida e nao pode ser marcada como em andamento.');
    }
    if (before.inProgressAt) {
      return toTripOccurrenceEntity(before);
    }

    const occurrence = await this.prisma.tripOccurrence.update({
      where: { id: before.id },
      data: { inProgressAt: new Date() },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip.occurrence_in_progress',
      entityName: 'TripOccurrence',
      entityId: occurrence.id,
      newValue: toJsonSafe({ inProgressAt: occurrence.inProgressAt }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripOccurrenceEntity(occurrence);
  }

  private async applyResolve(tenantId: string, before: TripOccurrence, actor: AuditActor, metadata: RequestMetadata): Promise<TripOccurrenceEntity> {
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

  private async applyCancel(tenantId: string, before: TripOccurrence, actor: AuditActor, metadata: RequestMetadata): Promise<TripOccurrenceEntity> {
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

  private buildStatusWhere(status?: string): Prisma.TripOccurrenceWhereInput {
    if (status === 'OPEN') return { ...OPEN_WHERE, inProgressAt: null };
    if (status === 'IN_PROGRESS') return { ...OPEN_WHERE, inProgressAt: { not: null } };
    if (status === 'RESOLVED') return { resolvedAt: { not: null }, cancelledAt: null };
    if (status === 'CANCELLED') return { cancelledAt: { not: null } };
    return {};
  }

  // Fase 115 -- extraido de buildDeliveryOccurrenceWhere (Fase 101) para ser
  // reaproveitado TAMBEM por GET /trip-occurrences (sem a restricao fixa a
  // paradas). Nenhum filtro novo em relacao ao que ja existia -- so deixou
  // de forcar tripDeliveryStopId != null por padrao.
  private buildOccurrenceWhere(tenantId: string, query: FindDeliveryOccurrencesQueryDto): Prisma.TripOccurrenceWhereInput {
    const occurredRange = compact({
      gte: query.occurredFrom ? new Date(query.occurredFrom) : undefined,
      lte: query.occurredTo ? new Date(`${query.occurredTo}T23:59:59.999Z`) : undefined,
    });

    return {
      tenantId,
      ...compact({
        type: query.type,
        severity: query.severity,
        tripId: query.tripId,
        driverId: query.driverId,
        vehicleId: query.vehicleId,
        tripDeliveryStopId: query.tripDeliveryStopId,
        occurredAt: Object.keys(occurredRange).length > 0 ? occurredRange : undefined,
      }),
      ...(query.search ? { description: { contains: query.search, mode: 'insensitive' as const } } : {}),
      // Fase 104 -- "relatorio por cliente": filtra pelo cliente da VIAGEM
      // (relacao, nunca uma coluna duplicada em TripOccurrence).
      ...(query.customerId ? { trip: { customerId: query.customerId } } : {}),
    };
  }

  // Regra fixa de GET /delivery-occurrences (Fase 101): SEMPRE ocorrencias
  // de entrega (vinculadas a uma parada) -- distingue esta rota de
  // GET /trips/:id/occurrences e da nova GET /trip-occurrences (Fase 115).
  // Quando o usuario ja filtrou por um tripDeliveryStopId especifico
  // (buildOccurrenceWhere ja aplicou), o "not null" e redundante e por isso
  // omitido -- nunca sobrescreve o filtro mais especifico do usuario.
  private buildDeliveryOccurrenceWhere(tenantId: string, query: FindDeliveryOccurrencesQueryDto): Prisma.TripOccurrenceWhereInput {
    const where = this.buildOccurrenceWhere(tenantId, query);
    if (!query.tripDeliveryStopId) {
      where.tripDeliveryStopId = { not: null };
    }
    return where;
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

  // Fase 101 -- garante que a parada informada realmente pertence a esta
  // viagem (nunca aceita uma parada de outra viagem so porque e do mesmo
  // tenant). Nenhuma exigencia de status da parada: uma ocorrencia pode
  // acontecer antes, durante ou depois da tentativa de entrega.
  // Distingue os dois motivos de falha: parada inexistente no tenant (404,
  // nunca existiu) vs. parada existente mas de OUTRA viagem (400, entrada
  // invalida do chamador).
  private async assertTripDeliveryStopBelongsToTrip(tenantId: string, tripId: string, tripDeliveryStopId: string): Promise<void> {
    const stop = await this.prisma.tripDeliveryStop.findFirst({ where: { id: tripDeliveryStopId, tenantId } });
    if (!stop) {
      throw new NotFoundException('Parada/entrega (tripDeliveryStopId) nao encontrada nesta empresa.');
    }
    if (stop.tripId !== tripId) {
      throw new BadRequestException('Parada/entrega (tripDeliveryStopId) nao pertence a esta viagem.');
    }
  }

  // tripId nulo = busca cross-trip (usada pelas rotas /delivery-occurrences,
  // que nao tem tripId na URL); tripId informado = escopo estrito da viagem
  // (usado pelas rotas administrativas /trips/:id/occurrences/*, mesmo
  // comportamento de sempre).
  private async findOwnedOrThrow(tenantId: string, id: string, tripId: string | null): Promise<TripOccurrence> {
    const occurrence = await this.prisma.tripOccurrence.findFirst({
      where: { id, tenantId, ...(tripId ? { tripId } : {}) },
    });
    if (!occurrence) {
      throw new NotFoundException('Ocorrencia nao encontrada nesta empresa.');
    }
    return occurrence;
  }
}
