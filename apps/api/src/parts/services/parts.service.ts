import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Part, Prisma, PartStockMovementType } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { runSerializable } from '../../tenants/utils/plan-limit.util';
import { CreatePartDto } from '../dto/create-part.dto';
import { FindPartMovementsQueryDto } from '../dto/find-part-movements-query.dto';
import { FindPartsQueryDto } from '../dto/find-parts-query.dto';
import { PartsDashboardQueryDto } from '../dto/parts-dashboard-query.dto';
import { RegisterStockAdjustmentDto } from '../dto/register-stock-adjustment.dto';
import { RegisterStockInDto } from '../dto/register-stock-in.dto';
import { RegisterStockOutDto } from '../dto/register-stock-out.dto';
import { UpdatePartStatusDto } from '../dto/update-part-status.dto';
import { UpdatePartDto } from '../dto/update-part.dto';
import { PaginatedPartsEntity } from '../entities/paginated-parts.entity';
import { PaginatedPartStockMovementsEntity } from '../entities/paginated-part-stock-movements.entity';
import { PartEntity } from '../entities/part.entity';
import { PartsDashboardEntity } from '../entities/parts-dashboard.entity';
import { toPartEntity } from '../mappers/part.mapper';
import { toPartStockMovementEntity } from '../mappers/part-stock-movement.mapper';
import { applyMovementDelta, assertStockNotNegative, computeIsLowStock } from '../utils/part-stock.util';

// Fase 83 -- catalogo de pecas + ledger de estoque. Part.currentStock/
// isLowStock sao cache persistido (ver comentario do model no schema.prisma),
// sempre recalculado AQUI dentro da mesma transacao Serializable de cada
// PartStockMovement -- nunca uma segunda fonte de verdade (a soma das
// movimentacoes sempre bate com currentStock, ver docs/parts-inventory.md).
@Injectable()
export class PartsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(tenantId: string, query: FindPartsQueryDto): Promise<PaginatedPartsEntity> {
    const where: Prisma.PartWhereInput = {
      tenantId,
      ...(query.category ? { category: { contains: query.category, mode: Prisma.QueryMode.insensitive } } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.lowStock !== undefined ? { isLowStock: query.lowStock } : {}),
      ...(query.zeroStock !== undefined ? { currentStock: query.zeroStock ? { lte: 0 } : { gt: 0 } } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { sku: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { oemCode: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.part.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.part.count({ where }),
    ]);

    const result = new PaginatedPartsEntity();
    result.items = items.map(toPartEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<PartEntity> {
    return toPartEntity(await this.findOwnedOrThrow(tenantId, id));
  }

  async create(
    tenantId: string,
    dto: CreatePartDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<PartEntity> {
    await this.assertSkuAvailable(tenantId, dto.sku);

    const part = await this.prisma.part.create({
      data: {
        tenantId,
        sku: dto.sku,
        name: dto.name,
        unit: dto.unit,
        createdBy: actor.userId,
        ...compact({
          description: dto.description,
          category: dto.category,
          manufacturer: dto.manufacturer,
          oemCode: dto.oemCode,
          minStock: dto.minStock,
        }),
        // currentStock=0 (default do schema) -- isLowStock recalculado com
        // base no minStock informado (0 <= minStock e frequentemente
        // verdadeiro: uma peca recem-cadastrada com estoque minimo definido
        // e, de fato, "estoque baixo" ate a primeira entrada).
        isLowStock: computeIsLowStock(0, dto.minStock ?? null),
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'part.created',
      entityName: 'Part',
      entityId: part.id,
      newValue: toJsonSafe({ sku: part.sku, name: part.name, unit: part.unit }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toPartEntity(part);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdatePartDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<PartEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    if (dto.sku && dto.sku !== before.sku) {
      await this.assertSkuAvailable(tenantId, dto.sku);
    }

    const effectiveMinStock = dto.minStock !== undefined ? dto.minStock : toNumberOrNull(before.minStock);

    const part = await this.prisma.part.update({
      where: { id },
      data: {
        ...compact({
          sku: dto.sku,
          name: dto.name,
          description: dto.description,
          unit: dto.unit,
          category: dto.category,
          manufacturer: dto.manufacturer,
          oemCode: dto.oemCode,
          minStock: dto.minStock,
        }),
        isLowStock: computeIsLowStock(toNumberOrNull(before.currentStock) ?? 0, effectiveMinStock ?? null),
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'part.updated',
      entityName: 'Part',
      entityId: id,
      previousValue: toJsonSafe(before),
      newValue: toJsonSafe(part),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toPartEntity(part);
  }

  async updateStatus(
    tenantId: string,
    id: string,
    dto: UpdatePartStatusDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<PartEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    const part = await this.prisma.part.update({ where: { id }, data: { isActive: dto.isActive } });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: dto.isActive ? 'part.activated' : 'part.deactivated',
      entityName: 'Part',
      entityId: id,
      previousValue: { isActive: before.isActive },
      newValue: { isActive: part.isActive },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toPartEntity(part);
  }

  async registerIn(
    tenantId: string,
    id: string,
    dto: RegisterStockInDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<PartEntity> {
    return this.applyMovement(
      tenantId,
      id,
      PartStockMovementType.IN,
      dto.quantity,
      actor,
      metadata,
      {
        unitCost: dto.unitCost,
        movementDate: dto.movementDate,
        reason: dto.reason,
        reference: dto.reference,
        notes: dto.notes,
      },
      'part.stock_in',
    );
  }

  async registerOut(
    tenantId: string,
    id: string,
    dto: RegisterStockOutDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<PartEntity> {
    if (dto.maintenanceId) {
      await this.assertMaintenanceBelongsToTenant(tenantId, dto.maintenanceId);
    }
    return this.applyMovement(
      tenantId,
      id,
      PartStockMovementType.OUT,
      dto.quantity,
      actor,
      metadata,
      {
        movementDate: dto.movementDate,
        reason: dto.reason,
        reference: dto.reference,
        notes: dto.notes,
        maintenanceId: dto.maintenanceId,
      },
      'part.stock_out',
    );
  }

  async registerAdjustment(
    tenantId: string,
    id: string,
    dto: RegisterStockAdjustmentDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<PartEntity> {
    return this.applyMovement(
      tenantId,
      id,
      PartStockMovementType.ADJUSTMENT,
      dto.quantity,
      actor,
      metadata,
      { movementDate: dto.movementDate, reason: dto.reason, notes: dto.notes },
      'part.stock_adjusted',
    );
  }

  async getMovements(
    tenantId: string,
    id: string,
    query: FindPartMovementsQueryDto,
  ): Promise<PaginatedPartStockMovementsEntity> {
    await this.findOwnedOrThrow(tenantId, id);

    const where: Prisma.PartStockMovementWhereInput = {
      tenantId,
      partId: id,
      ...(query.type ? { type: query.type } : {}),
      ...(query.from || query.to
        ? {
            movementDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.partStockMovement.findMany({
        where,
        orderBy: { movementDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.partStockMovement.count({ where }),
    ]);

    const result = new PaginatedPartStockMovementsEntity();
    result.items = items.map(toPartStockMovementEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  // Secao 9 da Fase 83 -- indicadores sempre em agregacoes O(1) (nunca 1
  // query por peca). estimatedStockValue so soma pecas com PELO MENOS um
  // custo unitario conhecido (ultima movimentacao IN com unitCost
  // preenchido) -- nunca inventa um custo para o restante.
  async getDashboard(tenantId: string, query: PartsDashboardQueryDto): Promise<PartsDashboardEntity> {
    const dateRange: Prisma.DateTimeFilter | undefined =
      query.startDate || query.endDate
        ? { ...(query.startDate ? { gte: new Date(query.startDate) } : {}), ...(query.endDate ? { lte: new Date(query.endDate) } : {}) }
        : undefined;

    const [totalParts, activeParts, lowStockCount, zeroStockCount, entriesAgg, exitsAgg, lastCostRows, allParts] =
      await Promise.all([
        this.prisma.part.count({ where: { tenantId } }),
        this.prisma.part.count({ where: { tenantId, isActive: true } }),
        this.prisma.part.count({ where: { tenantId, isLowStock: true } }),
        this.prisma.part.count({ where: { tenantId, currentStock: { lte: 0 } } }),
        this.prisma.partStockMovement.aggregate({
          where: { tenantId, type: PartStockMovementType.IN, ...(dateRange ? { movementDate: dateRange } : {}) },
          _sum: { quantity: true },
        }),
        this.prisma.partStockMovement.aggregate({
          where: { tenantId, type: PartStockMovementType.OUT, ...(dateRange ? { movementDate: dateRange } : {}) },
          _sum: { quantity: true },
        }),
        // Ultimo unitCost conhecido POR peca (distinct + orderBy, mesmo
        // padrao ja usado em FuelSuppliesService/TiresService para "ultimo
        // valor conhecido") -- 1 unica query, nunca 1 por peca.
        this.prisma.partStockMovement.findMany({
          where: { tenantId, type: PartStockMovementType.IN, unitCost: { not: null } },
          distinct: ['partId'],
          orderBy: [{ partId: 'asc' }, { movementDate: 'desc' }],
          select: { partId: true, unitCost: true },
        }),
        this.prisma.part.findMany({ where: { tenantId }, select: { id: true, currentStock: true } }),
      ]);

    const lastCostByPart = new Map(lastCostRows.map((row) => [row.partId, toNumberOrNull(row.unitCost) ?? 0]));
    const currentStockByPart = new Map(allParts.map((row) => [row.id, toNumberOrNull(row.currentStock) ?? 0]));

    let estimatedStockValue = 0;
    let partsWithKnownCost = 0;
    for (const [partId, cost] of lastCostByPart) {
      const stock = currentStockByPart.get(partId) ?? 0;
      estimatedStockValue += stock * cost;
      partsWithKnownCost += 1;
    }
    const partsWithoutKnownCost = totalParts - partsWithKnownCost;

    const entity = new PartsDashboardEntity();
    entity.totalParts = totalParts;
    entity.activeParts = activeParts;
    entity.inactiveParts = totalParts - activeParts;
    entity.lowStockCount = lowStockCount;
    entity.zeroStockCount = zeroStockCount;
    entity.estimatedStockValue = partsWithKnownCost > 0 ? Math.round(estimatedStockValue * 100) / 100 : null;
    entity.estimatedStockValueUnavailableReason =
      partsWithKnownCost > 0 ? null : 'Nenhuma peca possui custo unitario registrado em uma entrada de estoque.';
    entity.partsWithoutKnownCost = partsWithoutKnownCost;
    entity.entriesInPeriod = toNumberOrNull(entriesAgg._sum.quantity) ?? 0;
    entity.exitsInPeriod = toNumberOrNull(exitsAgg._sum.quantity) ?? 0;
    return entity;
  }

  // Fase 82/83 -- consumo de pecas ao CONCLUIR uma OS (unico momento em que
  // uma peca vinculada a MaintenancePart.partId e considerada efetivamente
  // usada, ver docs/work-orders.md secao 3 e docs/parts-inventory.md secao
  // 6). Chamado por MaintenancesService.applyStatusChange DENTRO da mesma
  // transacao Serializable da conclusao -- estoque insuficiente aborta a
  // transacao inteira (a OS nao fica COMPLETED). Idempotente por
  // construcao: COMPLETED e estado terminal (uma OS so pode ser concluida
  // uma vez), mais uma checagem defensiva abaixo.
  async consumePartsForMaintenance(
    tenantId: string,
    maintenanceId: string,
    actor: AuditActor,
    metadata: RequestMetadata,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const alreadyConsumed = await tx.partStockMovement.findFirst({
      where: { tenantId, maintenanceId, type: PartStockMovementType.OUT },
      select: { id: true },
    });
    if (alreadyConsumed) return;

    const linkedParts = await tx.maintenancePart.findMany({
      where: { maintenanceId, partId: { not: null } },
    });
    if (linkedParts.length === 0) return;

    const maintenance = await tx.vehicleMaintenance.findFirst({
      where: { id: maintenanceId, tenantId },
      select: { serviceOrderNumber: true },
    });

    for (const line of linkedParts) {
      const partId = line.partId!;
      const part = await tx.part.findFirst({ where: { id: partId, tenantId } });
      if (!part) {
        throw new NotFoundException(`Peca vinculada (partId ${partId}) nao encontrada nesta empresa.`);
      }

      const quantity = toNumberOrNull(line.quantity) ?? 0;
      const currentStock = toNumberOrNull(part.currentStock) ?? 0;
      const nextStock = applyMovementDelta(currentStock, PartStockMovementType.OUT, quantity);
      assertStockNotNegative(nextStock, part.name);

      await tx.part.update({
        where: { id: partId },
        data: { currentStock: nextStock, isLowStock: computeIsLowStock(nextStock, toNumberOrNull(part.minStock)) },
      });

      const movement = await tx.partStockMovement.create({
        data: {
          tenantId,
          partId,
          type: PartStockMovementType.OUT,
          quantity,
          unitCost: line.unitPrice,
          reason: 'Consumo em Ordem de Servico',
          reference: maintenance?.serviceOrderNumber ?? maintenanceId,
          maintenanceId,
          createdBy: actor.userId,
        },
      });

      await this.audit.log({
        tenantId,
        userId: actor.userId,
        action: 'part.consumed_in_maintenance',
        entityName: 'Part',
        entityId: partId,
        newValue: toJsonSafe({ maintenanceId, quantity, movementId: movement.id }),
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
    }
  }

  // Reutilizada por MaintenancesService (create/update de OS) para validar
  // que todo partId enviado em MaintenancePartInputDto pertence ao tenant --
  // 1 unica query em lote, nunca 1 por item.
  async assertPartsBelongToTenant(tenantId: string, partIds: string[]): Promise<void> {
    if (partIds.length === 0) return;
    const uniqueIds = [...new Set(partIds)];
    const found = await this.prisma.part.count({ where: { tenantId, id: { in: uniqueIds } } });
    if (found !== uniqueIds.length) {
      throw new NotFoundException('Uma ou mais pecas (partId) nao foram encontradas nesta empresa.');
    }
  }

  private async applyMovement(
    tenantId: string,
    id: string,
    type: PartStockMovementType,
    quantity: number,
    actor: AuditActor,
    metadata: RequestMetadata,
    extra: {
      unitCost?: number | undefined;
      movementDate?: string | undefined;
      reason?: string | undefined;
      reference?: string | undefined;
      notes?: string | undefined;
      maintenanceId?: string | undefined;
    },
    auditAction: string,
  ): Promise<PartEntity> {
    const part = await runSerializable(this.prisma, async (tx) => {
      const before = await tx.part.findFirst({ where: { id, tenantId } });
      if (!before) {
        throw new NotFoundException('Peca nao encontrada nesta empresa.');
      }

      const currentStock = toNumberOrNull(before.currentStock) ?? 0;
      const nextStock = applyMovementDelta(currentStock, type, quantity);
      assertStockNotNegative(nextStock, before.name);

      const updated = await tx.part.update({
        where: { id },
        data: { currentStock: nextStock, isLowStock: computeIsLowStock(nextStock, toNumberOrNull(before.minStock)) },
      });

      await tx.partStockMovement.create({
        data: {
          tenantId,
          partId: id,
          type,
          quantity,
          createdBy: actor.userId,
          ...compact({
            unitCost: extra.unitCost,
            movementDate: extra.movementDate ? new Date(extra.movementDate) : undefined,
            reason: extra.reason,
            reference: extra.reference,
            notes: extra.notes,
            maintenanceId: extra.maintenanceId,
          }),
        },
      });

      return updated;
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: auditAction,
      entityName: 'Part',
      entityId: id,
      newValue: toJsonSafe({ type, quantity, currentStock: toNumberOrNull(part.currentStock) }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toPartEntity(part);
  }

  private async findOwnedOrThrow(tenantId: string, id: string): Promise<Part> {
    const part = await this.prisma.part.findFirst({ where: { id, tenantId } });
    if (!part) {
      throw new NotFoundException('Peca nao encontrada nesta empresa.');
    }
    return part;
  }

  private async assertSkuAvailable(tenantId: string, sku: string): Promise<void> {
    const existing = await this.prisma.part.findUnique({ where: { tenantId_sku: { tenantId, sku } } });
    if (existing) {
      throw new ConflictException('Ja existe uma peca com este SKU nesta empresa.');
    }
  }

  private async assertMaintenanceBelongsToTenant(tenantId: string, maintenanceId: string): Promise<void> {
    const maintenance = await this.prisma.vehicleMaintenance.findFirst({ where: { id: maintenanceId, tenantId } });
    if (!maintenance) {
      throw new NotFoundException('OS (maintenanceId) nao encontrada nesta empresa.');
    }
  }
}
