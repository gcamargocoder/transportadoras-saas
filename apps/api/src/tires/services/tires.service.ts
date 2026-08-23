import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TireLocationType, TireStatus } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTireDisposalDto } from '../dto/create-tire-disposal.dto';
import { CreateTireInspectionDto } from '../dto/create-tire-inspection.dto';
import { CreateTireMovementDto } from '../dto/create-tire-movement.dto';
import { CreateTireRetreadDto } from '../dto/create-tire-retread.dto';
import { CreateTireDto } from '../dto/create-tire.dto';
import { FindTiresQueryDto } from '../dto/find-tires-query.dto';
import { UpdateTireDto } from '../dto/update-tire.dto';
import { PaginatedTireInspectionsEntity } from '../entities/paginated-tire-inspections.entity';
import { PaginatedTireMovementsEntity } from '../entities/paginated-tire-movements.entity';
import { PaginatedTireRetreadsEntity } from '../entities/paginated-tire-retreads.entity';
import { PaginatedTiresEntity } from '../entities/paginated-tires.entity';
import { TireDashboardEntity } from '../entities/tire-dashboard.entity';
import { TireDisposalEntity } from '../entities/tire-disposal.entity';
import { TireEntity } from '../entities/tire.entity';
import {
  TireHistoryEntity,
  TireHistoryEventEntity,
  TireHistoryEventType,
} from '../entities/tire-history.entity';
import { TireInspectionEntity } from '../entities/tire-inspection.entity';
import { TireMovementEntity } from '../entities/tire-movement.entity';
import { TireRetreadEntity } from '../entities/tire-retread.entity';
import { toTireDisposalEntity } from '../mappers/tire-disposal.mapper';
import { toTireInspectionEntity } from '../mappers/tire-inspection.mapper';
import { toTireMovementEntity, TireMovementWithRelations } from '../mappers/tire-movement.mapper';
import { toTireRetreadEntity } from '../mappers/tire-retread.mapper';
import { toTireEntity, TireWithRelations } from '../mappers/tire.mapper';
import { describeTireMovement } from '../utils/tire-location-description.util';
import { computeTireLifecycle } from '../utils/tire-lifecycle.util';

const TIRE_INCLUDE = {
  vehicle: true,
  trailer: true,
  creator: true,
  updater: true,
} satisfies Prisma.TireInclude;

const MOVEMENT_INCLUDE = {
  previousVehicle: true,
  newVehicle: true,
  previousTrailer: true,
  newTrailer: true,
  creator: true,
} satisfies Prisma.TireMovementInclude;

const RETREAD_INCLUDE = { creator: true } satisfies Prisma.TireRetreadInclude;
const INSPECTION_INCLUDE = { creator: true } satisfies Prisma.TireInspectionInclude;
const DISPOSAL_INCLUDE = { creator: true } satisfies Prisma.TireDisposalInclude;

// Limiar de seguranca (mm) usado no dashboard para "pneus proximos da
// troca" -- nao ha configuracao de limite legal/por frota no sistema ainda,
// entao usamos um valor fixo, documentado, comum na industria (abaixo do
// minimo legal de 1.6mm ja e critico; 3mm e uma margem de seguranca usual
// antes da troca programada).
export const NEAR_REPLACEMENT_THRESHOLD_MM = 3;

@Injectable()
export class TiresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ==========================================================================
  // CRUD
  // ==========================================================================
  async findAll(tenantId: string, query: FindTiresQueryDto): Promise<PaginatedTiresEntity> {
    const where = this.buildWhere(tenantId, query);

    const [items, total] = await Promise.all([
      this.prisma.tire.findMany({
        where,
        include: TIRE_INCLUDE,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.tire.count({ where }),
    ]);

    const result = new PaginatedTiresEntity();
    result.items = items.map((item) => toTireEntity(item));
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  // Fase 64 -- indicadores de vida util (secao 10 do pedido), calculados
  // apenas aqui (nunca em findAll -- evitaria N+1 real numa listagem
  // paginada). 3 queries fixas, bounded a UM pneu, independente do
  // historico dele.
  async findOne(tenantId: string, id: string): Promise<TireEntity> {
    const tire = await this.findOwnedOrThrow(tenantId, id);

    const [retreadAgg, inspectionsCount, mostRecentInstall, odometerRows] = await Promise.all([
      this.prisma.tireRetread.aggregate({
        where: { tenantId, tireId: id },
        _sum: { cost: true },
        _count: { _all: true },
      }),
      this.prisma.tireInspection.count({ where: { tenantId, tireId: id } }),
      tire.locationType !== TireLocationType.STOCK
        ? this.prisma.tireMovement.findFirst({
            where: { tenantId, tireId: id, newLocationType: { not: TireLocationType.STOCK } },
            orderBy: { movementDate: 'desc' },
            select: { movementDate: true },
          })
        : null,
      this.prisma.tireMovement.findMany({
        where: { tenantId, tireId: id, odometerKm: { not: null } },
        select: { odometerKm: true },
      }),
    ]);

    const lifecycle = computeTireLifecycle({
      purchasePrice: toNumberOrNull(tire.purchasePrice),
      retreadCostSum: toNumberOrNull(retreadAgg._sum.cost) ?? 0,
      retreadsCount: retreadAgg._count._all,
      inspectionsCount,
      currentLocationType: tire.locationType,
      mostRecentInstallDate: mostRecentInstall?.movementDate ?? null,
      odometerReadings: odometerRows
        .map((row) => toNumberOrNull(row.odometerKm))
        .filter((value): value is number => value !== null),
      now: new Date(),
    });

    return toTireEntity(tire, lifecycle);
  }

  async create(
    tenantId: string,
    dto: CreateTireDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TireEntity> {
    await this.assertFireNumberAvailable(tenantId, dto.fireNumber);

    const tire = await this.prisma.tire.create({
      data: {
        tenantId,
        fireNumber: dto.fireNumber,
        manufacturer: dto.manufacturer,
        model: dto.model,
        size: dto.size,
        status: dto.status ?? TireStatus.STOCK,
        locationType: TireLocationType.STOCK,
        createdBy: actor.userId,
        ...compact({
          dot: dto.dot,
          serialNumber: dto.serialNumber,
          purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : undefined,
          purchasePrice: dto.purchasePrice,
          expectedLifespanKm: dto.expectedLifespanKm,
          initialTreadDepthMm: dto.initialTreadDepthMm,
          currentTreadDepthMm: dto.currentTreadDepthMm ?? dto.initialTreadDepthMm,
        }),
      },
      include: TIRE_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'tire.created',
      entityName: 'Tire',
      entityId: tire.id,
      newValue: toJsonSafe({
        fireNumber: tire.fireNumber,
        manufacturer: tire.manufacturer,
        status: tire.status,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTireEntity(tire);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateTireDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TireEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    if (dto.fireNumber && dto.fireNumber !== before.fireNumber) {
      await this.assertFireNumberAvailable(tenantId, dto.fireNumber);
    }

    const tire = await this.prisma.tire.update({
      where: { id },
      data: {
        ...compact({
          fireNumber: dto.fireNumber,
          manufacturer: dto.manufacturer,
          model: dto.model,
          size: dto.size,
          dot: dto.dot,
          serialNumber: dto.serialNumber,
          purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : undefined,
          purchasePrice: dto.purchasePrice,
          expectedLifespanKm: dto.expectedLifespanKm,
          initialTreadDepthMm: dto.initialTreadDepthMm,
          currentTreadDepthMm: dto.currentTreadDepthMm,
          status: dto.status,
        }),
        updatedBy: actor.userId,
      },
      include: TIRE_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'tire.updated',
      entityName: 'Tire',
      entityId: id,
      previousValue: toJsonSafe(before),
      newValue: toJsonSafe(tire),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTireEntity(tire);
  }

  async remove(
    tenantId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<void> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    const [movementsCount, retreadsCount, inspectionsCount, disposal] = await Promise.all([
      this.prisma.tireMovement.count({ where: { tireId: id } }),
      this.prisma.tireRetread.count({ where: { tireId: id } }),
      this.prisma.tireInspection.count({ where: { tireId: id } }),
      this.prisma.tireDisposal.findUnique({ where: { tireId: id } }),
    ]);
    if (movementsCount > 0 || retreadsCount > 0 || inspectionsCount > 0 || disposal) {
      throw new ConflictException(
        'Nao e possivel excluir um pneu com historico (movimentacoes, recapagens, inspecoes ou descarte).',
      );
    }

    await this.prisma.tire.delete({ where: { id } });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'tire.deleted',
      entityName: 'Tire',
      entityId: id,
      previousValue: toJsonSafe({
        fireNumber: before.fireNumber,
        manufacturer: before.manufacturer,
      }),
      newValue: null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  // ==========================================================================
  // MOVIMENTACOES
  // ==========================================================================
  async findMovements(
    tenantId: string,
    tireId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedTireMovementsEntity> {
    await this.findOwnedOrThrow(tenantId, tireId);

    const where: Prisma.TireMovementWhereInput = { tenantId, tireId };
    const [items, total] = await Promise.all([
      this.prisma.tireMovement.findMany({
        where,
        include: MOVEMENT_INCLUDE,
        orderBy: { movementDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.tireMovement.count({ where }),
    ]);

    const result = new PaginatedTireMovementsEntity();
    result.items = items.map(toTireMovementEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  // Toda troca gera historico automatico (TireMovement), nunca sobrescreve
  // o registro anterior -- so o snapshot ATUAL em Tire (locationType/
  // vehicleId/trailerId/position/status) e atualizado.
  async createMovement(
    tenantId: string,
    tireId: string,
    dto: CreateTireMovementDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TireMovementEntity> {
    const tire = await this.findOwnedOrThrow(tenantId, tireId);
    if (tire.status === TireStatus.SCRAPPED) {
      throw new ConflictException('Pneu descartado nao pode ser movimentado.');
    }

    let newVehicleId: string | null = null;
    let newTrailerId: string | null = null;

    if (dto.newLocationType === TireLocationType.VEHICLE) {
      await this.assertVehicleExists(tenantId, dto.newVehicleId as string);
      newVehicleId = dto.newVehicleId as string;
    } else if (dto.newLocationType === TireLocationType.TRAILER) {
      await this.assertTrailerExists(tenantId, dto.newTrailerId as string);
      newTrailerId = dto.newTrailerId as string;
    }

    // "Nenhum pneu pode estar instalado em dois veiculos" -- alem de cada
    // Tire so guardar uma unica localizacao (garantido pelo proprio
    // modelo), tambem nao pode haver DOIS pneus na MESMA posicao do MESMO
    // veiculo/carreta ao mesmo tempo.
    await this.assertPositionAvailable(
      tenantId,
      tireId,
      dto.newLocationType,
      newVehicleId,
      newTrailerId,
      dto.newPosition,
    );

    const movement = await this.prisma.tireMovement.create({
      data: {
        tenantId,
        tireId,
        movementDate: dto.movementDate ? new Date(dto.movementDate) : new Date(),
        previousLocationType: tire.locationType,
        previousVehicleId: tire.vehicleId,
        previousTrailerId: tire.trailerId,
        previousPosition: tire.position,
        newLocationType: dto.newLocationType,
        newVehicleId,
        newTrailerId,
        createdBy: actor.userId,
        ...compact({
          newPosition: dto.newPosition,
          odometerKm: dto.odometerKm,
          reason: dto.reason,
        }),
      },
      include: MOVEMENT_INCLUDE,
    });

    const newStatus =
      dto.newLocationType === TireLocationType.STOCK ? TireStatus.STOCK : TireStatus.IN_USE;

    await this.prisma.tire.update({
      where: { id: tireId },
      data: {
        locationType: dto.newLocationType,
        vehicleId: newVehicleId,
        trailerId: newTrailerId,
        position: dto.newPosition ?? null,
        status: newStatus,
        updatedBy: actor.userId,
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'tire.moved',
      entityName: 'Tire',
      entityId: tireId,
      previousValue: toJsonSafe({
        locationType: tire.locationType,
        vehicleId: tire.vehicleId,
        trailerId: tire.trailerId,
        position: tire.position,
      }),
      newValue: toJsonSafe({
        locationType: dto.newLocationType,
        vehicleId: newVehicleId,
        trailerId: newTrailerId,
        position: dto.newPosition ?? null,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTireMovementEntity(movement);
  }

  // ==========================================================================
  // RECAPAGENS
  // ==========================================================================
  async findRetreads(
    tenantId: string,
    tireId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedTireRetreadsEntity> {
    await this.findOwnedOrThrow(tenantId, tireId);

    const where: Prisma.TireRetreadWhereInput = { tenantId, tireId };
    const [items, total] = await Promise.all([
      this.prisma.tireRetread.findMany({
        where,
        include: RETREAD_INCLUDE,
        orderBy: { retreadDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.tireRetread.count({ where }),
    ]);

    const result = new PaginatedTireRetreadsEntity();
    result.items = items.map(toTireRetreadEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async createRetread(
    tenantId: string,
    tireId: string,
    dto: CreateTireRetreadDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TireRetreadEntity> {
    const tire = await this.findOwnedOrThrow(tenantId, tireId);
    if (tire.status === TireStatus.SCRAPPED) {
      throw new ConflictException('Pneu descartado nao pode ser recapado.');
    }

    const retread = await this.prisma.tireRetread.create({
      data: {
        tenantId,
        tireId,
        company: dto.company,
        cost: dto.cost,
        retreadDate: new Date(dto.retreadDate),
        createdBy: actor.userId,
        ...compact({ warranty: dto.warranty, mileageKm: dto.mileageKm, notes: dto.notes }),
      },
      include: RETREAD_INCLUDE,
    });

    await this.prisma.tire.update({
      where: { id: tireId },
      data: { status: TireStatus.RETREADED, updatedBy: actor.userId },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'tire.retread_registered',
      entityName: 'Tire',
      entityId: tireId,
      newValue: toJsonSafe({
        company: retread.company,
        cost: retread.cost,
        retreadDate: retread.retreadDate,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTireRetreadEntity(retread);
  }

  // ==========================================================================
  // INSPECOES
  // ==========================================================================
  async findInspections(
    tenantId: string,
    tireId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedTireInspectionsEntity> {
    await this.findOwnedOrThrow(tenantId, tireId);

    const where: Prisma.TireInspectionWhereInput = { tenantId, tireId };
    const [items, total] = await Promise.all([
      this.prisma.tireInspection.findMany({
        where,
        include: INSPECTION_INCLUDE,
        orderBy: { inspectionDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.tireInspection.count({ where }),
    ]);

    const result = new PaginatedTireInspectionsEntity();
    result.items = items.map(toTireInspectionEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async createInspection(
    tenantId: string,
    tireId: string,
    dto: CreateTireInspectionDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TireInspectionEntity> {
    const tire = await this.findOwnedOrThrow(tenantId, tireId);
    if (tire.status === TireStatus.SCRAPPED) {
      throw new ConflictException('Pneu descartado nao pode ser inspecionado.');
    }

    const inspection = await this.prisma.tireInspection.create({
      data: {
        tenantId,
        tireId,
        treadDepthMm: dto.treadDepthMm,
        inspectionDate: dto.inspectionDate ? new Date(dto.inspectionDate) : new Date(),
        createdBy: actor.userId,
        ...compact({ pressurePsi: dto.pressurePsi, notes: dto.notes }),
      },
      include: INSPECTION_INCLUDE,
    });

    await this.prisma.tire.update({
      where: { id: tireId },
      data: { currentTreadDepthMm: dto.treadDepthMm, updatedBy: actor.userId },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'tire.inspected',
      entityName: 'Tire',
      entityId: tireId,
      newValue: toJsonSafe({
        treadDepthMm: inspection.treadDepthMm,
        pressurePsi: inspection.pressurePsi,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTireInspectionEntity(inspection);
  }

  // ==========================================================================
  // DESCARTE
  // ==========================================================================
  async findDisposal(tenantId: string, tireId: string): Promise<TireDisposalEntity> {
    await this.findOwnedOrThrow(tenantId, tireId);
    const disposal = await this.prisma.tireDisposal.findFirst({
      where: { tenantId, tireId },
      include: DISPOSAL_INCLUDE,
    });
    if (!disposal) {
      throw new NotFoundException('Este pneu ainda nao foi descartado.');
    }
    return toTireDisposalEntity(disposal);
  }

  async createDisposal(
    tenantId: string,
    tireId: string,
    dto: CreateTireDisposalDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TireDisposalEntity> {
    await this.findOwnedOrThrow(tenantId, tireId);

    const existing = await this.prisma.tireDisposal.findUnique({ where: { tireId } });
    if (existing) {
      throw new ConflictException('Este pneu ja foi descartado.');
    }

    const disposal = await this.prisma.tireDisposal.create({
      data: {
        tenantId,
        tireId,
        reason: dto.reason,
        disposalDate: new Date(dto.disposalDate),
        createdBy: actor.userId,
        ...compact({ odometerKm: dto.odometerKm, residualValue: dto.residualValue }),
      },
      include: DISPOSAL_INCLUDE,
    });

    await this.prisma.tire.update({
      where: { id: tireId },
      data: {
        status: TireStatus.SCRAPPED,
        locationType: TireLocationType.STOCK,
        vehicleId: null,
        trailerId: null,
        position: null,
        updatedBy: actor.userId,
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'tire.disposed',
      entityName: 'Tire',
      entityId: tireId,
      newValue: toJsonSafe({ reason: disposal.reason, disposalDate: disposal.disposalDate }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTireDisposalEntity(disposal);
  }

  // ==========================================================================
  // HISTORICO COMPLETO (movimentacoes + recapagens + inspecoes + descarte)
  // ==========================================================================
  async getHistory(tenantId: string, tireId: string): Promise<TireHistoryEntity> {
    await this.findOwnedOrThrow(tenantId, tireId);

    const [movements, retreads, inspections, disposal] = await Promise.all([
      this.prisma.tireMovement.findMany({ where: { tenantId, tireId }, include: MOVEMENT_INCLUDE }),
      this.prisma.tireRetread.findMany({ where: { tenantId, tireId }, include: RETREAD_INCLUDE }),
      this.prisma.tireInspection.findMany({
        where: { tenantId, tireId },
        include: INSPECTION_INCLUDE,
      }),
      this.prisma.tireDisposal.findFirst({
        where: { tenantId, tireId },
        include: DISPOSAL_INCLUDE,
      }),
    ]);

    const events: TireHistoryEventEntity[] = [];

    for (const movement of movements) {
      events.push({
        type: TireHistoryEventType.MOVEMENT,
        id: movement.id,
        date: movement.movementDate,
        description: this.describeMovement(movement),
        userId: movement.createdBy,
        userName: movement.creator.name,
      });
    }
    for (const retread of retreads) {
      events.push({
        type: TireHistoryEventType.RETREAD,
        id: retread.id,
        date: retread.retreadDate,
        description: `Recapagem em ${retread.company} -- R$ ${Number(retread.cost).toFixed(2)}`,
        userId: retread.createdBy,
        userName: retread.creator.name,
      });
    }
    for (const inspection of inspections) {
      events.push({
        type: TireHistoryEventType.INSPECTION,
        id: inspection.id,
        date: inspection.inspectionDate,
        description: `Inspecao -- sulco ${Number(inspection.treadDepthMm)}mm`,
        userId: inspection.createdBy,
        userName: inspection.creator.name,
      });
    }
    if (disposal) {
      events.push({
        type: TireHistoryEventType.DISPOSAL,
        id: disposal.id,
        date: disposal.disposalDate,
        description: `Descarte -- ${disposal.reason}`,
        userId: disposal.createdBy,
        userName: disposal.creator.name,
      });
    }

    events.sort((a, b) => b.date.getTime() - a.date.getTime());

    const entity = new TireHistoryEntity();
    entity.tireId = tireId;
    entity.events = events;
    return entity;
  }

  // ==========================================================================
  // DASHBOARD
  // ==========================================================================
  async getDashboard(tenantId: string): Promise<TireDashboardEntity> {
    const [
      statusGroups,
      purchaseAgg,
      retreadAgg,
      lifespanAgg,
      retreadedTiresCount,
      nearReplacementCount,
      latestMovements,
    ] = await Promise.all([
      this.prisma.tire.groupBy({ by: ['status'], where: { tenantId }, _count: { _all: true } }),
      this.prisma.tire.aggregate({ where: { tenantId }, _sum: { purchasePrice: true } }),
      this.prisma.tireRetread.aggregate({ where: { tenantId }, _sum: { cost: true } }),
      this.prisma.tire.aggregate({
        where: { tenantId, expectedLifespanKm: { not: null } },
        _avg: { expectedLifespanKm: true },
      }),
      this.prisma.tire.count({ where: { tenantId, retreads: { some: {} } } }),
      this.prisma.tire.count({
        where: {
          tenantId,
          status: TireStatus.IN_USE,
          currentTreadDepthMm: { lte: NEAR_REPLACEMENT_THRESHOLD_MM },
        },
      }),
      // Ultima movimentacao de cada pneu (odometro mais recente conhecido)
      // -- uma unica consulta com distinct, sem N+1.
      this.prisma.tireMovement.findMany({
        where: { tenantId },
        distinct: ['tireId'],
        orderBy: [{ tireId: 'asc' }, { movementDate: 'desc' }],
        select: { odometerKm: true },
      }),
    ]);

    const odometerValues = latestMovements
      .map((m) => toNumberOrNull(m.odometerKm))
      .filter((value): value is number => value !== null);
    const averageMileageKm =
      odometerValues.length > 0
        ? odometerValues.reduce((sum, value) => sum + value, 0) / odometerValues.length
        : 0;

    const entity = new TireDashboardEntity();
    entity.countByStatus = statusGroups.map((group) => ({
      status: group.status,
      count: group._count._all,
    }));
    entity.stockCount = statusGroups.find((g) => g.status === TireStatus.STOCK)?._count._all ?? 0;
    entity.inUseCount = statusGroups.find((g) => g.status === TireStatus.IN_USE)?._count._all ?? 0;
    entity.scrappedCount =
      statusGroups.find((g) => g.status === TireStatus.SCRAPPED)?._count._all ?? 0;
    entity.retreadedTiresCount = retreadedTiresCount;
    entity.investedValue = Number(purchaseAgg._sum.purchasePrice ?? 0);
    entity.retreadValue = Number(retreadAgg._sum.cost ?? 0);
    entity.averageLifespanKm = Number(lifespanAgg._avg.expectedLifespanKm ?? 0);
    entity.averageMileageKm = averageMileageKm;
    entity.nearReplacementCount = nearReplacementCount;
    return entity;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================
  private buildWhere(tenantId: string, query: FindTiresQueryDto): Prisma.TireWhereInput {
    return {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.locationType ? { locationType: query.locationType } : {}),
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
      ...(query.trailerId ? { trailerId: query.trailerId } : {}),
      ...(query.search
        ? {
            OR: [
              { fireNumber: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { manufacturer: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { model: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { serialNumber: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
    };
  }

  private describeMovement(movement: TireMovementWithRelations): string {
    return describeTireMovement(
      {
        type: movement.previousLocationType,
        vehiclePlate: movement.previousVehicle?.plate ?? null,
        trailerPlate: movement.previousTrailer?.plate ?? null,
        position: movement.previousPosition,
      },
      {
        type: movement.newLocationType,
        vehiclePlate: movement.newVehicle?.plate ?? null,
        trailerPlate: movement.newTrailer?.plate ?? null,
        position: movement.newPosition,
      },
    );
  }

  private async assertFireNumberAvailable(tenantId: string, fireNumber: string): Promise<void> {
    const existing = await this.prisma.tire.findUnique({
      where: { tenantId_fireNumber: { tenantId, fireNumber } },
    });
    if (existing) {
      throw new ConflictException('Ja existe um pneu com este numero de fogo nesta empresa.');
    }
  }

  private async assertPositionAvailable(
    tenantId: string,
    tireId: string,
    locationType: TireLocationType,
    vehicleId: string | null,
    trailerId: string | null,
    position: string | undefined,
  ): Promise<void> {
    if (locationType === TireLocationType.STOCK || !position) return;

    const conflict = await this.prisma.tire.findFirst({
      where: {
        tenantId,
        id: { not: tireId },
        position,
        ...(locationType === TireLocationType.VEHICLE ? { vehicleId } : { trailerId }),
      },
    });
    if (conflict) {
      throw new ConflictException(
        `Ja existe um pneu (numero de fogo ${conflict.fireNumber}) na posicao "${position}" deste ${
          locationType === TireLocationType.VEHICLE ? 'veiculo' : 'carreta'
        }.`,
      );
    }
  }

  private async assertVehicleExists(tenantId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, tenantId, deletedAt: null },
    });
    if (!vehicle) {
      throw new NotFoundException('Veiculo (newVehicleId) nao encontrado nesta empresa.');
    }
  }

  private async assertTrailerExists(tenantId: string, trailerId: string): Promise<void> {
    const trailer = await this.prisma.trailer.findFirst({
      where: { id: trailerId, tenantId, deletedAt: null },
    });
    if (!trailer) {
      throw new NotFoundException('Carreta (newTrailerId) nao encontrada nesta empresa.');
    }
  }

  private async findOwnedOrThrow(tenantId: string, id: string): Promise<TireWithRelations> {
    const tire = await this.prisma.tire.findFirst({
      where: { id, tenantId },
      include: TIRE_INCLUDE,
    });
    if (!tire) {
      throw new NotFoundException('Pneu nao encontrado nesta empresa.');
    }
    return tire;
  }
}
