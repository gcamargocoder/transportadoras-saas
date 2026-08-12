import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TripStop, TripStopSource, TripStopType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { PrismaService } from '../../prisma/prisma.service';
import { CloseTripStopByDeviceEventDto } from '../dto/close-trip-stop-by-device-event.dto';
import { CloseTripStopDto } from '../dto/close-trip-stop.dto';
import { CreateAdminTripStopDto } from '../dto/create-admin-trip-stop.dto';
import { CreateTripStopDto } from '../dto/create-trip-stop.dto';
import { FindTripStopsQueryDto } from '../dto/find-trip-stops-query.dto';
import { PaginatedTripStopsEntity } from '../entities/paginated-trip-stops.entity';
import { TripStopEntity } from '../entities/trip-stop.entity';
import { toTripStopEntity } from '../mappers/trip-stop.mapper';

@Injectable()
export class TripStopsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // POST /driver/trips/:id/stops -- abre uma parada. Idempotente por
  // deviceEventId (reenvio apos reconexao devolve a parada ja criada, nunca
  // duplica). vehicleId/driverId SEMPRE derivados da Trip, mesmo principio
  // ja usado em FuelSupply/TollTransaction/TripExpense.
  async open(
    tenantId: string,
    tripId: string,
    dto: CreateTripStopDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripStopEntity> {
    const existing = await this.prisma.tripStop.findFirst({
      where: { tenantId, deviceEventId: dto.deviceEventId },
    });
    if (existing) {
      return toTripStopEntity(existing);
    }

    const trip = await this.findTripOrThrow(tenantId, tripId);
    if (!trip.composition?.vehicleId) {
      throw new ConflictException('Esta viagem nao possui veiculo (composicao) vinculado.');
    }
    if (!trip.driverId) {
      throw new ConflictException('Esta viagem nao possui motorista vinculado.');
    }
    await this.assertNoOpenStopForVehicle(tenantId, trip.composition.vehicleId);

    const stop = await this.prisma.tripStop.create({
      data: {
        tenantId,
        tripId,
        vehicleId: trip.composition.vehicleId,
        driverId: trip.driverId,
        type: dto.type ?? TripStopType.UNKNOWN,
        source: (dto.source as TripStopSource | undefined) ?? TripStopSource.DRIVER_APP,
        latitude: dto.latitude,
        longitude: dto.longitude,
        startedAt: new Date(dto.startedAt),
        ...compact({ notes: dto.notes }),
        deviceEventId: dto.deviceEventId,
        syncedAt: new Date(),
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_stop.opened',
      entityName: 'TripStop',
      entityId: stop.id,
      newValue: toJsonSafe({ tripId, latitude: stop.latitude, longitude: stop.longitude, source: stop.source }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripStopEntity(stop);
  }

  // POST /trip-stops (Fase 43) -- criacao ADMINISTRATIVA, sem exigir uma
  // viagem ativa (patio/garagem/quebra fora de viagem). vehicleId sempre
  // explicito no corpo (nunca inferido). source sempre ADMIN, nunca aceito
  // do cliente. Idempotente por deviceEventId, mesmo padrao do fluxo do
  // driver-app -- gera um id proprio quando o chamador nao envia um
  // (admin-web nao e offline-first, mas double-click ainda pode acontecer).
  async createAdministrative(
    tenantId: string,
    dto: CreateAdminTripStopDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripStopEntity> {
    const deviceEventId = dto.deviceEventId ?? `admin-${randomUUID()}`;
    const existing = await this.prisma.tripStop.findFirst({ where: { tenantId, deviceEventId } });
    if (existing) {
      return toTripStopEntity(existing);
    }

    await this.assertVehicleExists(tenantId, dto.vehicleId);
    if (dto.tripId) {
      await this.assertTripExists(tenantId, dto.tripId);
    }
    if (dto.driverId) {
      await this.assertDriverExists(tenantId, dto.driverId);
    }

    const startedAt = new Date(dto.startedAt);
    let endedAt: Date | null = null;
    let durationMinutes: number | null = null;
    if (dto.endedAt) {
      endedAt = new Date(dto.endedAt);
      durationMinutes = this.computeDurationMinutesOrThrow(startedAt, endedAt);
    } else {
      await this.assertNoOpenStopForVehicle(tenantId, dto.vehicleId);
    }

    const stop = await this.prisma.tripStop.create({
      data: {
        tenantId,
        vehicleId: dto.vehicleId,
        type: dto.type ?? TripStopType.UNKNOWN,
        source: TripStopSource.ADMIN,
        startedAt,
        endedAt,
        durationMinutes,
        deviceEventId,
        syncedAt: new Date(),
        ...compact({
          tripId: dto.tripId,
          driverId: dto.driverId,
          latitude: dto.latitude,
          longitude: dto.longitude,
          locationLabel: dto.locationLabel,
          notes: dto.notes,
        }),
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_stop.created_administrative',
      entityName: 'TripStop',
      entityId: stop.id,
      newValue: toJsonSafe({ vehicleId: stop.vehicleId, tripId: stop.tripId, type: stop.type }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripStopEntity(stop);
  }

  // PATCH /driver/trips/:id/stops/:stopId/close -- fecha a parada. Se ja
  // estiver fechada, e idempotente (devolve o estado atual sem recalcular)
  // -- reenvio nao deve gerar um segundo calculo de duracao.
  async close(
    tenantId: string,
    tripId: string,
    stopId: string,
    dto: CloseTripStopDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripStopEntity> {
    const before = await this.findOwnedOrThrow(tenantId, tripId, stopId);
    return this.applyClose(before, dto, actor, metadata);
  }

  // PATCH /trip-stops/:id/close (Fase 43) -- mesmo fechamento, mas sem
  // exigir o tripId na rota (usado pelo endpoint administrativo, que tambem
  // fecha paradas sem viagem).
  async closeById(
    tenantId: string,
    id: string,
    dto: CloseTripStopDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripStopEntity> {
    const before = await this.findAnyOwnedOrThrow(tenantId, id);
    return this.applyClose(before, dto, actor, metadata);
  }

  // POST /driver/trips/:id/stops/close-by-device-event (Fase 43) -- fecha
  // pelo deviceEventId USADO NA ABERTURA, nao pelo id do servidor. Resolve
  // a limitacao real documentada no driver-app: a fila offline (syncQueue)
  // so conhece o deviceEventId no momento em que enfileira a acao (o id do
  // servidor so existe depois de uma resposta online bem-sucedida da
  // abertura) -- sem esta rota, um fechamento feito offline nao tinha como
  // ser enfileirado de forma coerente.
  async closeByDeviceEvent(
    tenantId: string,
    tripId: string,
    dto: CloseTripStopByDeviceEventDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripStopEntity> {
    const before = await this.prisma.tripStop.findFirst({
      where: { tenantId, tripId, deviceEventId: dto.deviceEventId },
    });
    if (!before) {
      throw new NotFoundException('Parada nao encontrada para esta viagem (deviceEventId de abertura desconhecido).');
    }
    return this.applyClose(before, dto, actor, metadata);
  }

  private async applyClose(
    before: TripStop,
    dto: { endedAt: string; type?: TripStopType; locationLabel?: string; notes?: string },
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripStopEntity> {
    if (before.cancelledAt) {
      throw new ConflictException('Esta parada foi cancelada e nao pode ser fechada.');
    }
    if (before.endedAt) {
      return toTripStopEntity(before);
    }

    const endedAt = new Date(dto.endedAt);
    const durationMinutes = this.computeDurationMinutesOrThrow(before.startedAt, endedAt);

    const stop = await this.prisma.tripStop.update({
      where: { id: before.id },
      data: {
        endedAt,
        durationMinutes,
        ...compact({ type: dto.type, locationLabel: dto.locationLabel, notes: dto.notes }),
      },
    });

    await this.audit.log({
      tenantId: stop.tenantId,
      userId: actor.userId,
      action: 'trip_stop.closed',
      entityName: 'TripStop',
      entityId: stop.id,
      newValue: toJsonSafe({ endedAt: stop.endedAt, durationMinutes: stop.durationMinutes }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripStopEntity(stop);
  }

  // PATCH /trip-stops/:id/cancel (Fase 43) -- cancela um registro indevido.
  // Idempotente (cancelar 2x devolve o mesmo estado). Permitido tanto para
  // uma parada aberta quanto ja concluida (correcao administrativa de um
  // lancamento errado) -- uma vez cancelada, NUNCA entra em indicadores/
  // rankings/alertas (ver FleetOperationsMetricsService.buildStopWhere).
  async cancel(tenantId: string, id: string, actor: AuditActor, metadata: RequestMetadata): Promise<TripStopEntity> {
    const before = await this.findAnyOwnedOrThrow(tenantId, id);
    if (before.cancelledAt) {
      return toTripStopEntity(before);
    }

    const stop = await this.prisma.tripStop.update({
      where: { id: before.id },
      data: { cancelledAt: new Date() },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_stop.cancelled',
      entityName: 'TripStop',
      entityId: stop.id,
      newValue: toJsonSafe({ cancelledAt: stop.cancelledAt }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripStopEntity(stop);
  }

  async findAll(tenantId: string, tripId: string): Promise<TripStopEntity[]> {
    await this.assertTripExists(tenantId, tripId);
    const stops = await this.prisma.tripStop.findMany({
      where: { tenantId, tripId },
      orderBy: { startedAt: 'desc' },
    });
    return stops.map(toTripStopEntity);
  }

  // GET /trip-stops (Fase 43) -- lista paginada cross-frota. Gap real desde
  // a Fase 40 (findAll so filtrava por tripId, documentado em
  // fleet-stops-dashboard.entity.ts).
  async findAllPaginated(tenantId: string, query: FindTripStopsQueryDto): Promise<PaginatedTripStopsEntity> {
    const where = this.buildListWhere(tenantId, query);

    const [items, total] = await Promise.all([
      this.prisma.tripStop.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.tripStop.count({ where }),
    ]);

    const result = new PaginatedTripStopsEntity();
    result.items = items.map(toTripStopEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<TripStopEntity> {
    return toTripStopEntity(await this.findAnyOwnedOrThrow(tenantId, id));
  }

  private buildListWhere(tenantId: string, query: FindTripStopsQueryDto) {
    const dateRange = compact({
      gte: query.from ? new Date(query.from) : undefined,
      lte: query.to ? new Date(`${query.to}T23:59:59.999Z`) : undefined,
    });

    let statusFilter: Record<string, unknown> = {};
    if (query.status === 'OPEN') statusFilter = { endedAt: null, cancelledAt: null };
    else if (query.status === 'COMPLETED') statusFilter = { endedAt: { not: null }, cancelledAt: null };
    else if (query.status === 'CANCELLED') statusFilter = { cancelledAt: { not: null } };

    return {
      tenantId,
      ...compact({
        vehicleId: query.vehicleId,
        driverId: query.driverId,
        tripId: query.tripId,
        type: query.type,
        startedAt: Object.keys(dateRange).length > 0 ? dateRange : undefined,
      }),
      ...statusFilter,
    };
  }

  private computeDurationMinutesOrThrow(startedAt: Date, endedAt: Date): number {
    const diffMs = endedAt.getTime() - startedAt.getTime();
    if (diffMs < 0) {
      throw new BadRequestException('endedAt nao pode ser anterior a startedAt.');
    }
    return Math.round(diffMs / 60_000);
  }

  // Impede duas paradas OPEN incompativeis para o mesmo veiculo (secao 11
  // do pedido) -- um veiculo nao pode estar "carregando" e "aguardando
  // descarga" ao mesmo tempo. Nao se aplica a paradas ja fechadas/canceladas.
  private async assertNoOpenStopForVehicle(tenantId: string, vehicleId: string): Promise<void> {
    const open = await this.prisma.tripStop.findFirst({
      where: { tenantId, vehicleId, endedAt: null, cancelledAt: null },
    });
    if (open) {
      throw new ConflictException('Este veiculo ja possui uma parada em aberto. Encerre-a antes de abrir outra.');
    }
  }

  private async assertTripExists(tenantId: string, tripId: string): Promise<void> {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, tenantId, deletedAt: null } });
    if (!trip) {
      throw new NotFoundException('Viagem nao encontrada nesta empresa.');
    }
  }

  private async assertVehicleExists(tenantId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, tenantId, deletedAt: null } });
    if (!vehicle) {
      throw new NotFoundException('Veiculo nao encontrado nesta empresa.');
    }
  }

  private async assertDriverExists(tenantId: string, driverId: string): Promise<void> {
    const driver = await this.prisma.driver.findFirst({ where: { id: driverId, tenantId, deletedAt: null } });
    if (!driver) {
      throw new NotFoundException('Motorista nao encontrado nesta empresa.');
    }
  }

  private async findTripOrThrow(tenantId: string, tripId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, tenantId, deletedAt: null },
      include: { composition: true },
    });
    if (!trip) {
      throw new NotFoundException('Viagem nao encontrada nesta empresa.');
    }
    return trip;
  }

  private async findOwnedOrThrow(tenantId: string, tripId: string, stopId: string) {
    const stop = await this.prisma.tripStop.findFirst({ where: { id: stopId, tenantId, tripId } });
    if (!stop) {
      throw new NotFoundException('Parada nao encontrada para esta viagem.');
    }
    return stop;
  }

  private async findAnyOwnedOrThrow(tenantId: string, id: string) {
    const stop = await this.prisma.tripStop.findFirst({ where: { id, tenantId } });
    if (!stop) {
      throw new NotFoundException('Parada nao encontrada nesta empresa.');
    }
    return stop;
  }
}
