import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTollRouteDto } from '../dto/create-toll-route.dto';
import { FindTollRoutesQueryDto } from '../dto/find-toll-routes-query.dto';
import { ReplaceTollRouteStopsDto } from '../dto/replace-toll-route-stops.dto';
import { UpdateTollRouteStatusDto } from '../dto/update-toll-route-status.dto';
import { UpdateTollRouteDto } from '../dto/update-toll-route.dto';
import { PaginatedTollRoutesEntity } from '../entities/paginated-toll-routes.entity';
import { TollRouteEntity } from '../entities/toll-route.entity';
import { toTollRouteEntity, TollRouteWithStops } from '../mappers/toll-route.mapper';

const ROUTE_INCLUDE = {
  stops: { include: { tollPlaza: true } },
} satisfies Prisma.TollRouteInclude;

@Injectable()
export class TollRoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(
    tenantId: string,
    query: FindTollRoutesQueryDto,
  ): Promise<PaginatedTollRoutesEntity> {
    const where: Prisma.TollRouteWhereInput = {
      tenantId,
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { originLabel: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { destinationLabel: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.tollRoute.findMany({
        where,
        include: ROUTE_INCLUDE,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.tollRoute.count({ where }),
    ]);

    const result = new PaginatedTollRoutesEntity();
    result.items = items.map(toTollRouteEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<TollRouteEntity> {
    return toTollRouteEntity(await this.findOwnedOrThrow(tenantId, id));
  }

  async create(
    tenantId: string,
    dto: CreateTollRouteDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TollRouteEntity> {
    const route = await this.prisma.tollRoute.create({
      data: {
        tenantId,
        name: dto.name,
        originLabel: dto.originLabel,
        destinationLabel: dto.destinationLabel,
      },
      include: ROUTE_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'toll_route.created',
      entityName: 'TollRoute',
      entityId: route.id,
      newValue: toJsonSafe({
        name: route.name,
        originLabel: route.originLabel,
        destinationLabel: route.destinationLabel,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTollRouteEntity(route);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateTollRouteDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TollRouteEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    const route = await this.prisma.tollRoute.update({
      where: { id },
      data: compact({
        name: dto.name,
        originLabel: dto.originLabel,
        destinationLabel: dto.destinationLabel,
      }),
      include: ROUTE_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'toll_route.updated',
      entityName: 'TollRoute',
      entityId: id,
      previousValue: toJsonSafe({
        name: before.name,
        originLabel: before.originLabel,
        destinationLabel: before.destinationLabel,
      }),
      newValue: toJsonSafe({
        name: route.name,
        originLabel: route.originLabel,
        destinationLabel: route.destinationLabel,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTollRouteEntity(route);
  }

  async updateStatus(
    tenantId: string,
    id: string,
    dto: UpdateTollRouteStatusDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TollRouteEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    const route = await this.prisma.tollRoute.update({
      where: { id },
      data: { isActive: dto.isActive },
      include: ROUTE_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: dto.isActive ? 'toll_route.activated' : 'toll_route.deactivated',
      entityName: 'TollRoute',
      entityId: id,
      previousValue: { isActive: before.isActive },
      newValue: { isActive: route.isActive },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTollRouteEntity(route);
  }

  // Substitui a lista INTEIRA de paradas pela ordem do array recebido
  // (indice 0 = sequence 1). Nao aceita pracas repetidas na mesma rota
  // (mesma regra do @@unique([tollRouteId, tollPlazaId])).
  async replaceStops(
    tenantId: string,
    id: string,
    dto: ReplaceTollRouteStopsDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TollRouteEntity> {
    await this.findOwnedOrThrow(tenantId, id);

    const plazaIds = dto.stops.map((s) => s.tollPlazaId);
    const uniquePlazaIds = new Set(plazaIds);
    if (uniquePlazaIds.size !== plazaIds.length) {
      throw new ConflictException('Uma mesma praca nao pode aparecer duas vezes na mesma rota.');
    }

    if (plazaIds.length > 0) {
      const foundPlazas = await this.prisma.tollPlaza.count({ where: { id: { in: plazaIds } } });
      if (foundPlazas !== uniquePlazaIds.size) {
        throw new NotFoundException('Uma ou mais pracas (tollPlazaId) nao foram encontradas.');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tollRouteStop.deleteMany({ where: { tollRouteId: id } });
      if (plazaIds.length > 0) {
        await tx.tollRouteStop.createMany({
          data: plazaIds.map((tollPlazaId, index) => ({
            tenantId,
            tollRouteId: id,
            tollPlazaId,
            sequence: index + 1,
          })),
        });
      }
    });

    const route = await this.findOwnedOrThrow(tenantId, id);

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'toll_route.stops_replaced',
      entityName: 'TollRoute',
      entityId: id,
      newValue: toJsonSafe({ stopCount: plazaIds.length, plazaIds }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTollRouteEntity(route);
  }

  async remove(
    tenantId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<void> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    const tripsUsingRoute = await this.prisma.trip.count({ where: { tenantId, tollRouteId: id } });
    if (tripsUsingRoute > 0) {
      throw new ConflictException(
        `Nao e possivel excluir esta rota: existem ${tripsUsingRoute} viagem(ns) vinculada(s). ` +
          'Desvincule-as antes de excluir a rota.',
      );
    }

    await this.prisma.tollRoute.delete({ where: { id } });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'toll_route.deleted',
      entityName: 'TollRoute',
      entityId: id,
      previousValue: toJsonSafe({ name: before.name }),
      newValue: null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  async findOwnedOrThrow(tenantId: string, id: string): Promise<TollRouteWithStops> {
    const route = await this.prisma.tollRoute.findFirst({
      where: { id, tenantId },
      include: ROUTE_INCLUDE,
    });
    if (!route) {
      throw new NotFoundException('Rota de pedagio nao encontrada nesta empresa.');
    }
    return route;
  }

  // Usado por TripsService ao vincular/trocar a rota de uma viagem -- so
  // permite vincular rotas ATIVAS (nao impede LEITURA de uma rota inativa
  // ja vinculada a viagens antigas).
  async findActiveOrThrow(tenantId: string, id: string): Promise<TollRouteWithStops> {
    const route = await this.findOwnedOrThrow(tenantId, id);
    if (!route.isActive) {
      throw new ConflictException(
        'Esta rota de pedagio esta inativa e nao pode ser vinculada a novas viagens.',
      );
    }
    return route;
  }
}
