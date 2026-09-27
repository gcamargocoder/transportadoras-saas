import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FuelTank, FuelTankMovementType, FuelTankStatus, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { runSerializable } from '../../tenants/utils/plan-limit.util';
import { CreateFuelTankDto } from '../dto/create-fuel-tank.dto';
import { FindFuelTankMovementsQueryDto } from '../dto/find-fuel-tank-movements-query.dto';
import { FindFuelTanksQueryDto } from '../dto/find-fuel-tanks-query.dto';
import { UpdateFuelTankDto } from '../dto/update-fuel-tank.dto';
import { UpdateFuelTankStatusDto } from '../dto/update-fuel-tank-status.dto';
import { FuelTankBalanceEntity } from '../entities/fuel-tank-balance.entity';
import { PaginatedFuelTankMovementsEntity } from '../entities/paginated-fuel-tank-movements.entity';
import { PaginatedFuelTanksEntity } from '../entities/paginated-fuel-tanks.entity';
import { FuelTankEntity } from '../entities/fuel-tank.entity';
import { toFuelTankMovementEntity } from '../mappers/fuel-tank-movement.mapper';
import { toFuelTankBalanceEntity, toFuelTankEntity } from '../mappers/fuel-tank.mapper';
import {
  applyTankMovementDelta,
  assertTankActiveForMovement,
  assertTankBalanceNotNegative,
  assertTankBalanceWithinCapacity,
  computeIsLowStock,
} from '../utils/fuel-tank-stock.util';

// Gestao de Combustivel, Fase 1 -- fundacao do estoque de tanques proprios.
// FuelTank/FuelTankMovement sao DISTINTOS de FuelSupply (o que o veiculo
// recebeu) -- ver comentario do model no schema.prisma. currentStockLiters
// e um cache persistido, sempre recalculado dentro da mesma transacao
// Serializable de cada FuelTankMovement (applyMovement abaixo), nunca uma
// segunda fonte de verdade -- mesmo espirito de PartsService (Fase 83).
//
// Unico caminho de escrita nesta fase: create() (saldo inicial na criacao
// do tanque). RECEIPT (compra, Fase 2), INTERNAL_FUELING (abastecimento
// interno vinculado a um FuelSupply, Fase 3) e ADJUSTMENT (divergencia de
// inventario, Fase 4) ja existem no enum e no ledger para o modelo nascer
// completo, mas nenhum endpoint desta fase os cria -- applyMovement() e o
// motor generico e concorrencia-safe que essas fases futuras reaproveitarao
// sem reescrever a logica de saldo.
@Injectable()
export class FuelTanksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(tenantId: string, query: FindFuelTanksQueryDto): Promise<PaginatedFuelTanksEntity> {
    const where: Prisma.FuelTankWhereInput = {
      tenantId,
      ...(query.isActive !== undefined ? { status: query.isActive ? FuelTankStatus.ACTIVE : FuelTankStatus.INACTIVE } : {}),
      ...(query.lowStock !== undefined ? { isLowStock: query.lowStock } : {}),
      ...(query.fuelType ? { fuelType: query.fuelType } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { location: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.fuelTank.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.fuelTank.count({ where }),
    ]);

    const result = new PaginatedFuelTanksEntity();
    result.items = items.map(toFuelTankEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<FuelTankEntity> {
    return toFuelTankEntity(await this.findOwnedOrThrow(tenantId, id));
  }

  async getBalance(tenantId: string, id: string): Promise<FuelTankBalanceEntity> {
    return toFuelTankBalanceEntity(await this.findOwnedOrThrow(tenantId, id));
  }

  async create(
    tenantId: string,
    dto: CreateFuelTankDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<FuelTankEntity> {
    if (dto.initialStockLiters > dto.capacityLiters) {
      throw new BadRequestException('initialStockLiters nao pode ser maior que capacityLiters.');
    }
    if (dto.minStockLiters !== undefined && dto.minStockLiters > dto.capacityLiters) {
      throw new BadRequestException('minStockLiters nao pode ser maior que capacityLiters.');
    }

    const tank = await runSerializable(this.prisma, async (tx) => {
      // isLowStock nasce false (default do schema) -- applyMovement() abaixo
      // recalcula com o saldo real (initialStockLiters) na mesma transacao,
      // antes de qualquer leitor externo poder ver a linha.
      const created = await tx.fuelTank.create({
        data: {
          tenantId,
          name: dto.name,
          capacityLiters: dto.capacityLiters,
          initialStockLiters: dto.initialStockLiters,
          currentStockLiters: 0,
          createdBy: actor.userId,
          ...compact({
            fuelType: dto.fuelType,
            minStockLiters: dto.minStockLiters,
            location: dto.location,
          }),
        },
      });

      return this.applyMovement(
        tx,
        tenantId,
        created.id,
        FuelTankMovementType.INITIAL_BALANCE,
        dto.initialStockLiters,
        actor,
        { notes: 'Saldo inicial na criacao do tanque.' },
      );
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'fuel_tank.created',
      entityName: 'FuelTank',
      entityId: tank.id,
      newValue: toJsonSafe({ name: tank.name, capacityLiters: dto.capacityLiters, initialStockLiters: dto.initialStockLiters }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toFuelTankEntity(tank);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateFuelTankDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<FuelTankEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);
    const capacityLiters = toNumberOrNull(before.capacityLiters) ?? 0;

    if (dto.minStockLiters !== undefined && dto.minStockLiters > capacityLiters) {
      throw new BadRequestException('minStockLiters nao pode ser maior que capacityLiters.');
    }

    const effectiveMinStock = dto.minStockLiters !== undefined ? dto.minStockLiters : toNumberOrNull(before.minStockLiters);

    const tank = await this.prisma.fuelTank.update({
      where: { id },
      data: {
        ...compact({ name: dto.name, minStockLiters: dto.minStockLiters, location: dto.location }),
        isLowStock: computeIsLowStock(toNumberOrNull(before.currentStockLiters) ?? 0, effectiveMinStock ?? null),
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'fuel_tank.updated',
      entityName: 'FuelTank',
      entityId: id,
      previousValue: toJsonSafe(before),
      newValue: toJsonSafe(tank),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toFuelTankEntity(tank);
  }

  async updateStatus(
    tenantId: string,
    id: string,
    dto: UpdateFuelTankStatusDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<FuelTankEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);
    const status = dto.isActive ? FuelTankStatus.ACTIVE : FuelTankStatus.INACTIVE;

    const tank = await this.prisma.fuelTank.update({ where: { id }, data: { status } });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: dto.isActive ? 'fuel_tank.activated' : 'fuel_tank.deactivated',
      entityName: 'FuelTank',
      entityId: id,
      previousValue: { status: before.status },
      newValue: { status: tank.status },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toFuelTankEntity(tank);
  }

  async getMovements(
    tenantId: string,
    id: string,
    query: FindFuelTankMovementsQueryDto,
  ): Promise<PaginatedFuelTankMovementsEntity> {
    await this.findOwnedOrThrow(tenantId, id);

    const where: Prisma.FuelTankMovementWhereInput = {
      tenantId,
      tankId: id,
      ...(query.type ? { type: query.type } : {}),
      ...(query.from || query.to
        ? {
            effectiveDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.fuelTankMovement.findMany({
        where,
        orderBy: { effectiveDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.fuelTankMovement.count({ where }),
    ]);

    const result = new PaginatedFuelTankMovementsEntity();
    result.items = items.map(toFuelTankMovementEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  // Motor generico de movimentacao -- unico ponto que le e grava o saldo do
  // tanque (secao 1/5 da Fase 1). Roda dentro do runSerializable do chamador
  // (mesmo padrao de PartsService.applyMovement/Fase 48): qualquer conflito
  // real de concorrencia entre duas chamadas concorrentes sobre o MESMO
  // tankId e detectado pelo Postgres (isolationLevel Serializable) e o
  // runSerializable tenta de novo automaticamente -- nunca duas escritas
  // corrompem o saldo (cenario das duas retiradas simultaneas de 300L num
  // tanque de 500L, secao 5 da Fase 1). Reaproveitado sem alteracao pelas
  // Fases 2/3/4 (RECEIPT/INTERNAL_FUELING/ADJUSTMENT) quando existirem.
  private async applyMovement(
    tx: Prisma.TransactionClient,
    tenantId: string,
    tankId: string,
    type: FuelTankMovementType,
    quantityLiters: number,
    actor: AuditActor,
    extra: {
      notes?: string | undefined;
      fuelSupplyId?: string | undefined;
      vehicleId?: string | undefined;
      driverId?: string | undefined;
      tripId?: string | undefined;
      deviceEventId?: string | undefined;
    },
  ): Promise<FuelTank> {
    const tank = await tx.fuelTank.findFirst({ where: { id: tankId, tenantId } });
    if (!tank) {
      throw new NotFoundException('Tanque nao encontrado nesta empresa.');
    }
    assertTankActiveForMovement(tank.status, tank.name);

    const previousBalance = toNumberOrNull(tank.currentStockLiters) ?? 0;
    const nextBalance = applyTankMovementDelta(previousBalance, type, quantityLiters);
    assertTankBalanceNotNegative(nextBalance, tank.name);
    assertTankBalanceWithinCapacity(nextBalance, toNumberOrNull(tank.capacityLiters) ?? 0, tank.name);

    const updated = await tx.fuelTank.update({
      where: { id: tankId },
      data: { currentStockLiters: nextBalance, isLowStock: computeIsLowStock(nextBalance, toNumberOrNull(tank.minStockLiters)) },
    });

    await tx.fuelTankMovement.create({
      data: {
        tenantId,
        tankId,
        type,
        quantityLiters,
        previousBalanceLiters: previousBalance,
        newBalanceLiters: nextBalance,
        createdBy: actor.userId,
        ...compact({
          notes: extra.notes,
          fuelSupplyId: extra.fuelSupplyId,
          vehicleId: extra.vehicleId,
          driverId: extra.driverId,
          tripId: extra.tripId,
          deviceEventId: extra.deviceEventId,
        }),
      },
    });

    return updated;
  }

  private async findOwnedOrThrow(tenantId: string, id: string): Promise<FuelTank> {
    const tank = await this.prisma.fuelTank.findFirst({ where: { id, tenantId } });
    if (!tank) {
      throw new NotFoundException('Tanque nao encontrado nesta empresa.');
    }
    return tank;
  }
}
