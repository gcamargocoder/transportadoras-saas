import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTollTransactionDto } from '../dto/create-toll-transaction.dto';
import { FindTollTransactionsQueryDto } from '../dto/find-toll-transactions-query.dto';
import { UpdateTollTransactionDto } from '../dto/update-toll-transaction.dto';
import { TollDashboardEntity } from '../entities/toll-dashboard.entity';
import { PaginatedTollTransactionsEntity } from '../entities/paginated-toll-transactions.entity';
import { TollTransactionEntity } from '../entities/toll-transaction.entity';
import {
  toTollTransactionEntity,
  TollTransactionWithRelations,
} from '../mappers/toll-transaction.mapper';
import {
  classifyTollTransaction,
  computeDiscrepancy,
  computeExpectedAmount,
} from '../utils/toll-calculation.util';

const TRANSACTION_INCLUDE = {
  vehicle: true,
  driver: true,
  tollPlaza: true,
  tagProvider: true,
} satisfies Prisma.TollTransactionInclude;

@Injectable()
export class TollTransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(
    tenantId: string,
    query: FindTollTransactionsQueryDto,
  ): Promise<PaginatedTollTransactionsEntity> {
    const where = this.buildWhere(tenantId, query);

    const [items, total] = await Promise.all([
      this.prisma.tollTransaction.findMany({
        where,
        include: TRANSACTION_INCLUDE,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.tollTransaction.count({ where }),
    ]);

    const result = new PaginatedTollTransactionsEntity();
    result.items = items.map(toTollTransactionEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<TollTransactionEntity> {
    return toTollTransactionEntity(await this.findOwnedOrThrow(tenantId, id));
  }

  async create(
    tenantId: string,
    dto: CreateTollTransactionDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TollTransactionEntity> {
    const trip = await this.prisma.trip.findFirst({
      where: { id: dto.tripId, tenantId, deletedAt: null },
      include: { composition: true },
    });
    if (!trip) {
      throw new NotFoundException('Viagem (tripId) nao encontrada nesta empresa.');
    }
    const vehicleId = trip.composition?.vehicleId;
    if (!vehicleId) {
      throw new ConflictException('Esta viagem nao possui veiculo (composicao) vinculado.');
    }

    const tollPlaza = await this.prisma.tollPlaza.findUnique({ where: { id: dto.tollPlazaId } });
    if (!tollPlaza) {
      throw new NotFoundException('Praca de pedagio (tollPlazaId) nao encontrada.');
    }

    const tagProviderId = await this.assertVehicleHasValidTag(tenantId, vehicleId);

    const expectedAmount = computeExpectedAmount(tollPlaza.pricePerAxle, dto.axleCount);
    const discrepancyAmount = computeDiscrepancy(dto.chargedAmount, expectedAmount);
    const status = classifyTollTransaction(dto.chargedAmount, discrepancyAmount);

    const transaction = await this.prisma.tollTransaction.create({
      data: {
        tenantId,
        tripId: dto.tripId,
        vehicleId,
        driverId: trip.driverId,
        tollPlazaId: dto.tollPlazaId,
        tagProviderId,
        axleCount: dto.axleCount,
        expectedAmount,
        chargedAmount: dto.chargedAmount,
        discrepancyAmount,
        status,
        chargedAt: new Date(dto.chargedAt),
        ...compact({ source: dto.source }),
      },
      include: TRANSACTION_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'toll_transaction.created',
      entityName: 'TollTransaction',
      entityId: transaction.id,
      newValue: toJsonSafe({
        tripId: transaction.tripId,
        tollPlazaId: transaction.tollPlazaId,
        chargedAmount: transaction.chargedAmount,
        expectedAmount: transaction.expectedAmount,
        status: transaction.status,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTollTransactionEntity(transaction);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateTollTransactionDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TollTransactionEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    let tollPlazaPricePerAxle = before.tollPlaza.pricePerAxle;
    if (dto.tollPlazaId && dto.tollPlazaId !== before.tollPlazaId) {
      const tollPlaza = await this.prisma.tollPlaza.findUnique({ where: { id: dto.tollPlazaId } });
      if (!tollPlaza) {
        throw new NotFoundException('Praca de pedagio (tollPlazaId) nao encontrada.');
      }
      tollPlazaPricePerAxle = tollPlaza.pricePerAxle;
    }

    const axleCount = dto.axleCount ?? before.axleCount;
    const chargedAmount = dto.chargedAmount ?? Number(before.chargedAmount);
    const expectedAmount = computeExpectedAmount(tollPlazaPricePerAxle, axleCount);
    const discrepancyAmount = computeDiscrepancy(chargedAmount, expectedAmount);
    const status = classifyTollTransaction(chargedAmount, discrepancyAmount);

    const transaction = await this.prisma.tollTransaction.update({
      where: { id },
      data: {
        ...compact({
          tollPlazaId: dto.tollPlazaId,
          axleCount: dto.axleCount,
          chargedAmount: dto.chargedAmount,
          chargedAt: dto.chargedAt ? new Date(dto.chargedAt) : undefined,
          source: dto.source,
        }),
        expectedAmount,
        discrepancyAmount,
        status,
      },
      include: TRANSACTION_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'toll_transaction.updated',
      entityName: 'TollTransaction',
      entityId: id,
      previousValue: toJsonSafe(before),
      newValue: toJsonSafe(transaction),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTollTransactionEntity(transaction);
  }

  async remove(
    tenantId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<void> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    await this.prisma.tollTransaction.delete({ where: { id } });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'toll_transaction.deleted',
      entityName: 'TollTransaction',
      entityId: id,
      previousValue: toJsonSafe({
        tripId: before.tripId,
        tollPlazaId: before.tollPlazaId,
        chargedAmount: before.chargedAmount,
      }),
      newValue: null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  async getDashboard(
    tenantId: string,
    query: FindTollTransactionsQueryDto,
  ): Promise<TollDashboardEntity> {
    const where = this.buildWhere(tenantId, query);

    const [totals, byStatus, byProvider, byVehicle, byDriver, byPlaza] = await Promise.all([
      this.prisma.tollTransaction.aggregate({
        where,
        _count: { _all: true },
        _sum: { chargedAmount: true, expectedAmount: true, discrepancyAmount: true },
      }),
      this.prisma.tollTransaction.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
        _sum: { chargedAmount: true },
      }),
      this.prisma.tollTransaction.groupBy({
        by: ['tagProviderId'],
        where,
        _count: { _all: true },
        _sum: { chargedAmount: true },
      }),
      this.prisma.tollTransaction.groupBy({
        by: ['vehicleId'],
        where,
        _count: { _all: true },
        _sum: { chargedAmount: true },
      }),
      this.prisma.tollTransaction.groupBy({
        by: ['driverId'],
        where,
        _count: { _all: true },
        _sum: { chargedAmount: true },
      }),
      this.prisma.tollTransaction.groupBy({
        by: ['tollPlazaId'],
        where,
        _count: { _all: true },
        _sum: { chargedAmount: true },
      }),
    ]);

    const [providers, vehicles, drivers, plazas] = await Promise.all([
      this.prisma.tagProvider.findMany({
        where: { id: { in: this.compactIds(byProvider.map((g) => g.tagProviderId)) } },
      }),
      this.prisma.vehicle.findMany({
        where: { id: { in: byVehicle.map((g) => g.vehicleId) } },
      }),
      this.prisma.driver.findMany({
        where: { id: { in: this.compactIds(byDriver.map((g) => g.driverId)) } },
      }),
      this.prisma.tollPlaza.findMany({
        where: { id: { in: byPlaza.map((g) => g.tollPlazaId) } },
      }),
    ]);

    const entity = new TollDashboardEntity();
    entity.totalCount = totals._count._all;
    entity.totalChargedAmount = Number(totals._sum.chargedAmount ?? 0);
    entity.totalExpectedAmount = Number(totals._sum.expectedAmount ?? 0);
    entity.totalDiscrepancyAmount = Number(totals._sum.discrepancyAmount ?? 0);
    entity.countByStatus = byStatus.map((g) => ({
      status: g.status,
      count: g._count._all,
      totalChargedAmount: Number(g._sum.chargedAmount ?? 0),
    }));
    entity.countByProvider = byProvider.map((g) => ({
      id: g.tagProviderId,
      label: providers.find((p) => p.id === g.tagProviderId)?.name ?? 'Sem operadora',
      count: g._count._all,
      totalChargedAmount: Number(g._sum.chargedAmount ?? 0),
    }));
    entity.countByVehicle = byVehicle.map((g) => ({
      id: g.vehicleId,
      label: vehicles.find((v) => v.id === g.vehicleId)?.plate ?? g.vehicleId,
      count: g._count._all,
      totalChargedAmount: Number(g._sum.chargedAmount ?? 0),
    }));
    entity.countByDriver = byDriver.map((g) => ({
      id: g.driverId,
      label: drivers.find((d) => d.id === g.driverId)?.name ?? 'Sem motorista',
      count: g._count._all,
      totalChargedAmount: Number(g._sum.chargedAmount ?? 0),
    }));
    entity.countByPlaza = byPlaza.map((g) => ({
      id: g.tollPlazaId,
      label: plazas.find((p) => p.id === g.tollPlazaId)?.name ?? g.tollPlazaId,
      count: g._count._all,
      totalChargedAmount: Number(g._sum.chargedAmount ?? 0),
    }));

    return entity;
  }

  private buildWhere(
    tenantId: string,
    query: FindTollTransactionsQueryDto,
  ): Prisma.TollTransactionWhereInput {
    return {
      tenantId,
      ...(query.tripId ? { tripId: query.tripId } : {}),
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
      ...(query.driverId ? { driverId: query.driverId } : {}),
      ...(query.tagProviderId ? { tagProviderId: query.tagProviderId } : {}),
      ...(query.tollPlazaId ? { tollPlazaId: query.tollPlazaId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.chargedFrom || query.chargedTo
        ? {
            chargedAt: {
              ...(query.chargedFrom ? { gte: new Date(query.chargedFrom) } : {}),
              ...(query.chargedTo ? { lte: new Date(query.chargedTo) } : {}),
            },
          }
        : {}),
    };
  }

  private async findOwnedOrThrow(
    tenantId: string,
    id: string,
  ): Promise<TollTransactionWithRelations> {
    const transaction = await this.prisma.tollTransaction.findFirst({
      where: { id, tenantId },
      include: TRANSACTION_INCLUDE,
    });
    if (!transaction) {
      throw new NotFoundException('Transacao de pedagio nao encontrada.');
    }
    return transaction;
  }

  // "Nao permitir: Tag vencida, Tag inativa, Veiculo sem tag". Retorna o
  // tagProviderId da tag valida encontrada (denormalizado na transacao).
  private async assertVehicleHasValidTag(tenantId: string, vehicleId: string): Promise<string> {
    const tags = await this.prisma.vehicleTag.findMany({ where: { tenantId, vehicleId } });
    if (tags.length === 0) {
      throw new ConflictException('Veiculo sem tag cadastrada.');
    }

    const now = new Date();
    const validTag = tags.find((t) => t.isActive && (!t.expiresAt || t.expiresAt > now));
    if (validTag) {
      return validTag.tagProviderId;
    }

    const hasExpired = tags.some((t) => t.expiresAt && t.expiresAt <= now);
    if (hasExpired) {
      throw new ConflictException('Tag vencida.');
    }
    throw new ConflictException('Tag inativa.');
  }

  private compactIds(ids: (string | null)[]): string[] {
    return ids.filter((id): id is string => id !== null);
  }
}
