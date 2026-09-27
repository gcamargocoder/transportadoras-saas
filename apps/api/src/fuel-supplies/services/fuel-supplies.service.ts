import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FuelType, Prisma, Vehicle } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { assertAttachmentExists } from '../../common/utils/assert-attachment-exists.util';
import { compact } from '../../common/utils/compact.util';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import {
  computeAverageConsumptionKmL,
  computeConsumptionTotals,
  computeTotalAmount,
  detectOdometerRegression,
} from '../../common/utils/fuel-consumption.util';
import { assertOdometerNotBelowVehicle, computeBumpedOdometer } from '../../common/utils/odometer.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { FuelTanksService } from '../../fuel-tanks/services/fuel-tanks.service';
import { PrismaService } from '../../prisma/prisma.service';
import { runSerializable } from '../../tenants/utils/plan-limit.util';
import { CreateDriverFuelSupplyDto } from '../dto/create-driver-fuel-supply.dto';
import { CreateFuelSupplyDto } from '../dto/create-fuel-supply.dto';
import { FindFuelSuppliesQueryDto } from '../dto/find-fuel-supplies-query.dto';
import { FuelHistoryQueryDto } from '../dto/fuel-history-query.dto';
import { UpdateFuelSupplyDto } from '../dto/update-fuel-supply.dto';
import {
  FuelDashboardEntity,
  FuelDashboardTopEntryEntity,
} from '../entities/fuel-dashboard.entity';
import { FuelSupplyEntity } from '../entities/fuel-supply.entity';
import { PaginatedFuelSuppliesEntity } from '../entities/paginated-fuel-supplies.entity';
import { VehicleFuelHistoryEntity } from '../entities/vehicle-fuel-history.entity';
import { FuelSupplyWithRelations, toFuelSupplyEntity } from '../mappers/fuel-supply.mapper';

const SUPPLY_INCLUDE = {
  vehicle: true,
  driver: true,
  // Fase 107 -- so para tripLabel ("origem -> destino"); select minimo,
  // mesmo padrao ja usado em TripBillingEntity/FinanceReconciliationEntity
  // (nunca um segundo formato de rotulo de viagem).
  trip: {
    select: {
      origin: { select: { name: true } },
      destination: { select: { name: true } },
    },
  },
  fuelStation: true,
  // Gestao de Combustivel, Fase 3 -- mesmo padrao de fuelStation acima.
  fuelTank: true,
  creator: true,
  updater: true,
} satisfies Prisma.FuelSupplyInclude;

@Injectable()
export class FuelSuppliesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly fuelTanksService: FuelTanksService,
  ) {}

  async findAll(
    tenantId: string,
    query: FindFuelSuppliesQueryDto,
  ): Promise<PaginatedFuelSuppliesEntity> {
    const where = this.buildWhere(tenantId, query);

    const [items, total] = await Promise.all([
      this.prisma.fuelSupply.findMany({
        where,
        include: SUPPLY_INCLUDE,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.fuelSupply.count({ where }),
    ]);

    const result = new PaginatedFuelSuppliesEntity();
    result.items = items.map(toFuelSupplyEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<FuelSupplyEntity> {
    return toFuelSupplyEntity(await this.findOwnedOrThrow(tenantId, id));
  }

  async create(
    tenantId: string,
    dto: CreateFuelSupplyDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<FuelSupplyEntity> {
    let vehicleId: string;
    let driverId: string;

    if (dto.tripId) {
      const trip = await this.findTripOrThrow(tenantId, dto.tripId);
      if (!trip.composition?.vehicleId) {
        throw new ConflictException('Esta viagem nao possui veiculo (composicao) vinculado.');
      }
      if (!trip.driverId) {
        throw new ConflictException('Esta viagem nao possui motorista vinculado.');
      }
      vehicleId = trip.composition.vehicleId;
      driverId = trip.driverId;
    } else {
      if (!dto.vehicleId) {
        throw new BadRequestException('vehicleId e obrigatorio quando tripId nao e informado.');
      }
      if (!dto.driverId) {
        throw new BadRequestException('driverId e obrigatorio quando tripId nao e informado.');
      }
      await this.assertDriverExists(tenantId, dto.driverId);
      vehicleId = dto.vehicleId;
      driverId = dto.driverId;
    }

    const vehicle = await this.assertVehicleExists(tenantId, vehicleId);

    // Fase 7 -- fuelTankId (interno) e fuelStationId (externo) sao mutuamente
    // exclusivos (mesmo principio ja documentado em FuelTankMovement: nunca
    // os dois juntos). pricePerLiter so e exigido quando EXTERNO -- interno
    // nao tem compra associada a ELE (custo ja pago no RECEIPT), mesma regra
    // do Driver App (createFromDriverApp, Fase 3).
    if (dto.fuelTankId && dto.fuelStationId) {
      throw new BadRequestException(
        'Informe apenas um: fuelTankId (abastecimento interno) ou fuelStationId (abastecimento externo), nunca os dois.',
      );
    }
    if (!dto.fuelTankId && (dto.pricePerLiter === undefined || dto.pricePerLiter <= 0)) {
      throw new BadRequestException('pricePerLiter e obrigatorio (maior que zero) para abastecimento externo.');
    }
    if (dto.fuelStationId) {
      await this.assertFuelStationExists(tenantId, dto.fuelStationId);
    }
    if (dto.attachmentId) {
      await assertAttachmentExists(this.prisma, tenantId, dto.attachmentId);
    }

    this.assertOdometerNotBelowCurrent(vehicle, dto.odometerKm);
    const pricePerLiter = dto.pricePerLiter ?? 0;
    const totalAmount = computeTotalAmount(dto.liters, pricePerLiter);

    const supplyData = {
      tenantId,
      vehicleId,
      driverId,
      fuelType: dto.fuelType,
      liters: dto.liters,
      pricePerLiter,
      totalAmount,
      odometerKm: dto.odometerKm,
      supplyDate: new Date(dto.supplyDate),
      createdBy: actor.userId,
      ...compact({
        tripId: dto.tripId,
        fuelStationId: dto.fuelStationId,
        attachmentId: dto.attachmentId,
        paymentType: dto.paymentType,
        invoiceNumber: dto.invoiceNumber,
        notes: dto.notes,
      }),
    } satisfies Prisma.FuelSupplyUncheckedCreateInput;

    let supply: FuelSupplyWithRelations;
    if (dto.fuelTankId) {
      // Gestao de Combustivel, Fase 7 -- abastecimento interno lancado pelo
      // administrativo: MESMA operacao atomica do Driver App
      // (createFromDriverApp abaixo) -- FuelSupply + FuelTankMovement
      // (INTERNAL_FUELING) + baixa do tanque numa UNICA transacao
      // Serializable, via FuelTanksService.registerInternalFueling (mesmo
      // wrapper de applyMovement das Fases 1-3). Nenhuma logica de saldo/
      // capacidade/concorrencia duplicada -- a unica diferenca entre as duas
      // origens e o ator/auditoria.
      const fuelTankId = dto.fuelTankId;
      supply = await runSerializable(this.prisma, async (tx) => {
        const created = await tx.fuelSupply.create({
          data: { ...supplyData, fuelTankId },
          include: SUPPLY_INCLUDE,
        });
        await this.fuelTanksService.registerInternalFueling(tx, tenantId, fuelTankId, dto.liters, actor, {
          fuelSupplyId: created.id,
          vehicleId,
          driverId,
          ...compact({ tripId: dto.tripId }),
        });
        await this.bumpVehicleOdometerIfGreater(vehicleId, dto.odometerKm, vehicle.odometerKm, tx);
        return created;
      });
    } else {
      // Abastecimento EXTERNO -- fluxo inalterado, nunca toca em FuelTank.
      supply = await this.prisma.fuelSupply.create({ data: supplyData, include: SUPPLY_INCLUDE });
      await this.bumpVehicleOdometerIfGreater(vehicleId, dto.odometerKm, vehicle.odometerKm);
    }

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'fuel_supply.created',
      entityName: 'FuelSupply',
      entityId: supply.id,
      newValue: toJsonSafe({
        vehicleId: supply.vehicleId,
        driverId: supply.driverId,
        tripId: supply.tripId,
        liters: supply.liters,
        totalAmount: supply.totalAmount,
        fuelTankId: supply.fuelTankId,
        source: 'admin',
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
    if (supply.fuelTankId) {
      await this.audit.log({
        tenantId,
        userId: actor.userId,
        action: 'fuel_tank.internal_fueling_registered',
        entityName: 'FuelTank',
        entityId: supply.fuelTankId,
        newValue: toJsonSafe({ fuelSupplyId: supply.id, liters: supply.liters, vehicleId, driverId, tripId: supply.tripId, source: 'admin' }),
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
    }

    return toFuelSupplyEntity(supply);
  }

  // POST /driver/trips/:id/fuel-supplies (Fase 25) -- tela do app do
  // motorista tem so KM+litros; vehicleId/driverId SEMPRE derivados da trip
  // (nunca aceitos do cliente, mesmo principio de create()) e fuelStationId
  // nunca e exigido/inventado -- so a localizacao (lat/lng), quando
  // disponivel. Idempotente por deviceEventId: reenvio (ex: apos reconexao)
  // devolve o registro ja criado em vez de duplicar ou lancar erro.
  async createFromDriverApp(
    tenantId: string,
    tripId: string,
    dto: CreateDriverFuelSupplyDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<FuelSupplyEntity> {
    const existing = await this.prisma.fuelSupply.findFirst({
      where: { tenantId, deviceEventId: dto.deviceEventId },
      include: SUPPLY_INCLUDE,
    });
    if (existing) {
      return toFuelSupplyEntity(existing);
    }

    const trip = await this.findTripOrThrow(tenantId, tripId);
    if (!trip.composition?.vehicleId) {
      throw new ConflictException('Esta viagem nao possui veiculo (composicao) vinculado.');
    }
    if (!trip.driverId) {
      throw new ConflictException('Esta viagem nao possui motorista vinculado.');
    }
    const vehicleId = trip.composition.vehicleId;
    const driverId = trip.driverId;

    const vehicle = await this.assertVehicleExists(tenantId, vehicleId);
    this.assertOdometerNotBelowCurrent(vehicle, dto.odometerKm);

    const pricePerLiter = dto.pricePerLiter ?? 0;
    const totalAmount = computeTotalAmount(dto.liters, pricePerLiter);
    const supplyData = {
      tenantId,
      vehicleId,
      driverId,
      tripId,
      fuelType: dto.fuelType ?? FuelType.OUTRO,
      liters: dto.liters,
      pricePerLiter,
      totalAmount,
      odometerKm: dto.odometerKm,
      supplyDate: dto.supplyDate ? new Date(dto.supplyDate) : new Date(),
      deviceEventId: dto.deviceEventId,
      syncedAt: new Date(),
      createdBy: actor.userId,
      ...compact({ latitude: dto.latitude, longitude: dto.longitude }),
    } satisfies Prisma.FuelSupplyUncheckedCreateInput;

    let supply: FuelSupplyWithRelations;
    if (dto.fuelTankId) {
      // Gestao de Combustivel, Fase 3 -- abastecimento INTERNO: FuelSupply +
      // FuelTankMovement(INTERNAL_FUELING) + baixa do tanque numa UNICA
      // transacao Serializable (regra central da fase). Reaproveita
      // FuelTanksService.registerInternalFueling (wrapper de applyMovement,
      // Fase 1) -- nenhuma logica de saldo/capacidade/concorrencia duplicada
      // aqui. Se o tanque estiver inativo, sem saldo, ou nao existir, o
      // metodo lanca e o FuelSupply criado acima sofre rollback junto.
      const fuelTankId = dto.fuelTankId;
      supply = await runSerializable(this.prisma, async (tx) => {
        const created = await tx.fuelSupply.create({
          data: { ...supplyData, fuelTankId },
          include: SUPPLY_INCLUDE,
        });
        await this.fuelTanksService.registerInternalFueling(tx, tenantId, fuelTankId, dto.liters, actor, {
          fuelSupplyId: created.id,
          vehicleId,
          driverId,
          tripId,
        });
        await this.bumpVehicleOdometerIfGreater(vehicleId, dto.odometerKm, vehicle.odometerKm, tx);
        return created;
      });
    } else {
      // Abastecimento EXTERNO -- fluxo inalterado desde a Fase 25, nunca
      // toca em FuelTank.
      supply = await this.prisma.fuelSupply.create({ data: supplyData, include: SUPPLY_INCLUDE });
      await this.bumpVehicleOdometerIfGreater(vehicleId, dto.odometerKm, vehicle.odometerKm);
    }

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'fuel_supply.created',
      entityName: 'FuelSupply',
      entityId: supply.id,
      newValue: toJsonSafe({
        vehicleId: supply.vehicleId,
        driverId: supply.driverId,
        tripId: supply.tripId,
        liters: supply.liters,
        totalAmount: supply.totalAmount,
        fuelTankId: supply.fuelTankId,
        source: 'driver-app',
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
    if (supply.fuelTankId) {
      await this.audit.log({
        tenantId,
        userId: actor.userId,
        action: 'fuel_tank.internal_fueling_registered',
        entityName: 'FuelTank',
        entityId: supply.fuelTankId,
        newValue: toJsonSafe({ fuelSupplyId: supply.id, liters: supply.liters, vehicleId, driverId, tripId }),
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
    }

    return toFuelSupplyEntity(supply);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateFuelSupplyDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<FuelSupplyEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    // tripId e imutavel (fora do DTO); se o abastecimento ja pertence a uma
    // viagem, vehicleId/driverId enviados aqui sao ignorados -- permanecem
    // os derivados da viagem original (nunca confiar no frontend).
    let vehicleId = before.vehicleId;
    let driverId = before.driverId;
    if (!before.tripId) {
      if (dto.vehicleId) {
        await this.assertVehicleExists(tenantId, dto.vehicleId);
        vehicleId = dto.vehicleId;
      }
      if (dto.driverId) {
        await this.assertDriverExists(tenantId, dto.driverId);
        driverId = dto.driverId;
      }
    }

    // Fase 7 -- fuelTankId e imutavel (fora do DTO de update, ver
    // UpdateFuelSupplyDto) e a exclusividade fuelTankId x fuelStationId
    // estabelecida na criacao nunca pode ser quebrada por uma edicao
    // (deixaria o registro com as duas origens ao mesmo tempo).
    if (before.fuelTankId && dto.fuelStationId) {
      throw new ConflictException(
        'Nao e possivel definir um posto (fuelStationId) em um abastecimento interno (vinculado a um tanque proprio).',
      );
    }
    if (dto.fuelStationId) {
      await this.assertFuelStationExists(tenantId, dto.fuelStationId);
    }
    if (dto.attachmentId) {
      await assertAttachmentExists(this.prisma, tenantId, dto.attachmentId);
    }

    // Gestao de Combustivel, Fase 4 -- um abastecimento INTERNO ja baixou o
    // tanque com os litros originais (FuelTankMovement.INTERNAL_FUELING,
    // Fase 3). Editar liters aqui deixaria o ledger e o FuelSupply
    // divergentes sem nenhuma movimentacao compensatoria -- fora do escopo
    // desta fase (so cancelamento/exclusao ganhou estorno, ver remove()
    // abaixo). Para corrigir a quantidade, cancele e registre novamente.
    if (before.fuelTankId && dto.liters !== undefined && dto.liters !== (toNumberOrNull(before.liters) ?? 0)) {
      throw new ConflictException(
        'Nao e possivel alterar os litros de um abastecimento interno (vinculado a um tanque proprio). Cancele o abastecimento e registre novamente.',
      );
    }

    const liters = dto.liters ?? toNumberOrNull(before.liters) ?? 0;
    const pricePerLiter = dto.pricePerLiter ?? toNumberOrNull(before.pricePerLiter) ?? 0;
    const totalAmount = computeTotalAmount(liters, pricePerLiter);

    let vehicleForOdometer: Vehicle | null = null;
    if (dto.odometerKm !== undefined) {
      vehicleForOdometer = await this.assertVehicleExists(tenantId, vehicleId);
      this.assertOdometerNotBelowCurrent(vehicleForOdometer, dto.odometerKm);
    }

    const supply = await this.prisma.fuelSupply.update({
      where: { id },
      data: {
        ...compact({
          vehicleId: vehicleId !== before.vehicleId ? vehicleId : undefined,
          driverId: driverId !== before.driverId ? driverId : undefined,
          fuelStationId: dto.fuelStationId,
          fuelType: dto.fuelType,
          liters: dto.liters,
          pricePerLiter: dto.pricePerLiter,
          odometerKm: dto.odometerKm,
          supplyDate: dto.supplyDate ? new Date(dto.supplyDate) : undefined,
          paymentType: dto.paymentType,
          invoiceNumber: dto.invoiceNumber,
          notes: dto.notes,
          attachmentId: dto.attachmentId,
        }),
        totalAmount,
        updatedBy: actor.userId,
      },
      include: SUPPLY_INCLUDE,
    });

    if (dto.odometerKm !== undefined && vehicleForOdometer) {
      await this.bumpVehicleOdometerIfGreater(
        vehicleId,
        dto.odometerKm,
        vehicleForOdometer.odometerKm,
      );
    }

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'fuel_supply.updated',
      entityName: 'FuelSupply',
      entityId: id,
      previousValue: toJsonSafe(before),
      newValue: toJsonSafe(supply),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toFuelSupplyEntity(supply);
  }

  async remove(
    tenantId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<void> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    if (before.fuelTankId) {
      // Gestao de Combustivel, Fase 4, secao 13 -- excluir um abastecimento
      // INTERNO devolve os litros ao tanque via um ADJUSTMENT compensatorio
      // (FuelTanksService.reverseInternalFueling, mesmo applyMovement das
      // Fases 1-3), na MESMA transacao da exclusao. O INTERNAL_FUELING
      // original NUNCA e apagado/editado -- so perde o vinculo com o
      // FuelSupply (fuelSupplyId -> null via onDelete: SetNull no schema),
      // permanecendo no ledger exatamente como aconteceu. Se o tanque
      // estiver inativo ou sem capacidade para receber de volta, a
      // exclusao inteira e rejeitada (nunca deixa o FuelSupply sumir com o
      // tanque inconsistente) -- limitacao aceitavel e documentada.
      const litersToRestore = toNumberOrNull(before.liters) ?? 0;
      await runSerializable(this.prisma, async (tx) => {
        await this.fuelTanksService.reverseInternalFueling(tx, tenantId, before.fuelTankId!, litersToRestore, actor, {
          notes: `Estorno do abastecimento interno cancelado (FuelSupply ${before.id}).`,
        });
        await tx.fuelSupply.delete({ where: { id } });
      });
    } else {
      await this.prisma.fuelSupply.delete({ where: { id } });
    }

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'fuel_supply.deleted',
      entityName: 'FuelSupply',
      entityId: id,
      previousValue: toJsonSafe({
        vehicleId: before.vehicleId,
        driverId: before.driverId,
        liters: before.liters,
        totalAmount: before.totalAmount,
      }),
      newValue: null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
    if (before.fuelTankId) {
      await this.audit.log({
        tenantId,
        userId: actor.userId,
        action: 'fuel_tank.internal_fueling_reversed',
        entityName: 'FuelTank',
        entityId: before.fuelTankId,
        newValue: toJsonSafe({ fuelSupplyId: before.id, litersRestored: toNumberOrNull(before.liters) }),
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
    }
  }

  // GET /vehicles/:id/fuel-history -- items = ultimos N (limit); os totais/
  // consumo medio consideram o HISTORICO COMPLETO do veiculo, nao apenas os
  // itens exibidos.
  async getVehicleFuelHistory(
    tenantId: string,
    vehicleId: string,
    query: FuelHistoryQueryDto,
  ): Promise<VehicleFuelHistoryEntity> {
    await this.assertVehicleExists(tenantId, vehicleId);

    const [items, points, totals] = await Promise.all([
      this.prisma.fuelSupply.findMany({
        where: { tenantId, vehicleId },
        include: SUPPLY_INCLUDE,
        orderBy: { supplyDate: 'desc' },
        take: query.limit,
      }),
      this.prisma.fuelSupply.findMany({
        where: { tenantId, vehicleId },
        select: { id: true, odometerKm: true, liters: true, supplyDate: true },
      }),
      this.prisma.fuelSupply.aggregate({
        where: { tenantId, vehicleId },
        _count: { _all: true },
        _sum: { liters: true, totalAmount: true },
      }),
    ]);

    const entity = new VehicleFuelHistoryEntity();
    entity.vehicleId = vehicleId;
    entity.items = items.map(toFuelSupplyEntity);
    entity.suppliesCount = totals._count._all;
    entity.totalLiters = Number(totals._sum.liters ?? 0);
    entity.totalAmount = Number(totals._sum.totalAmount ?? 0);
    entity.averageConsumptionKmL = computeAverageConsumptionKmL(
      points.map((p) => ({ id: p.id, odometerKm: Number(p.odometerKm), liters: Number(p.liters) })),
    );
    // Fase 65 -- mesma funcao pura ja usada pelos alertas de frota
    // (ODOMETER_REGRESSION), so que no escopo deste UM veiculo -- nenhuma
    // query adicional (reaproveita os mesmos `points`, so precisou de
    // supplyDate a mais no select acima).
    entity.hasOdometerRegression =
      detectOdometerRegression(
        points.map((p) => ({ id: p.id, odometerKm: Number(p.odometerKm), supplyDate: p.supplyDate })),
      ).length > 0;
    return entity;
  }

  // GET /fuel-supplies/dashboard -- consumo medio/custo por km agregam
  // POR VEICULO (distancia entre 1o/ultimo odometro de cada um, dentro do
  // filtro) e depois somam entre veiculos -- uma unica consulta bruta
  // (sem N+1), reduzida em memoria.
  async getDashboard(
    tenantId: string,
    query: FindFuelSuppliesQueryDto,
  ): Promise<FuelDashboardEntity> {
    const where = this.buildWhere(tenantId, query);

    const [totals, byStation, byVehicle, byDriver, points] = await Promise.all([
      this.prisma.fuelSupply.aggregate({
        where,
        _count: { _all: true },
        _sum: { liters: true, totalAmount: true },
      }),
      this.prisma.fuelSupply.groupBy({ by: ['fuelStationId'], where, _count: { _all: true } }),
      this.prisma.fuelSupply.groupBy({ by: ['vehicleId'], where, _count: { _all: true } }),
      this.prisma.fuelSupply.groupBy({ by: ['driverId'], where, _count: { _all: true } }),
      this.prisma.fuelSupply.findMany({
        where,
        select: { id: true, vehicleId: true, odometerKm: true, liters: true },
      }),
    ]);

    const entity = new FuelDashboardEntity();
    entity.suppliesCount = totals._count._all;
    entity.totalLiters = Number(totals._sum.liters ?? 0);
    entity.totalAmount = Number(totals._sum.totalAmount ?? 0);

    const pointsByVehicle = new Map<string, { id: string; odometerKm: number; liters: number }[]>();
    for (const point of points) {
      const list = pointsByVehicle.get(point.vehicleId) ?? [];
      list.push({
        id: point.id,
        odometerKm: Number(point.odometerKm),
        liters: Number(point.liters),
      });
      pointsByVehicle.set(point.vehicleId, list);
    }

    let totalDistanceKm = 0;
    let totalLitersBetweenSupplies = 0;
    for (const vehiclePoints of pointsByVehicle.values()) {
      const totals = computeConsumptionTotals(vehiclePoints);
      if (!totals) continue;
      totalDistanceKm += totals.totalDistanceKm;
      totalLitersBetweenSupplies += totals.totalLiters;
    }
    entity.averageConsumptionKmL =
      totalLitersBetweenSupplies > 0 ? totalDistanceKm / totalLitersBetweenSupplies : null;
    entity.costPerKm = totalDistanceKm > 0 ? entity.totalAmount / totalDistanceKm : null;

    // fuelStationId pode ser nulo (abastecimento so com localizacao, Fase 25)
    // -- nao entra na disputa de "posto mais usado".
    const byStationKnown = byStation.filter(
      (g): g is typeof g & { fuelStationId: string } => g.fuelStationId !== null,
    );
    const topStation = this.pickTop(byStationKnown, 'fuelStationId');
    const topVehicle = this.pickTop(byVehicle, 'vehicleId');
    const topDriver = this.pickTop(byDriver, 'driverId');

    const [stationRecord, vehicleRecord, driverRecord] = await Promise.all([
      topStation
        ? this.prisma.fuelStation.findFirst({ where: { id: topStation.id, tenantId } })
        : null,
      topVehicle ? this.prisma.vehicle.findFirst({ where: { id: topVehicle.id, tenantId } }) : null,
      topDriver ? this.prisma.driver.findFirst({ where: { id: topDriver.id, tenantId } }) : null,
    ]);

    entity.mostUsedStation = this.toTopEntry(topStation, stationRecord?.name);
    entity.topVehicle = this.toTopEntry(topVehicle, vehicleRecord?.plate);
    entity.topDriver = this.toTopEntry(topDriver, driverRecord?.name);

    return entity;
  }

  private toTopEntry(
    top: { id: string; count: number } | null,
    label: string | undefined,
  ): FuelDashboardTopEntryEntity | null {
    if (!top || !label) return null;
    const entry = new FuelDashboardTopEntryEntity();
    entry.id = top.id;
    entry.label = label;
    entry.count = top.count;
    return entry;
  }

  private pickTop<K extends string>(
    groups: Array<Record<K, string> & { _count: { _all: number } }>,
    key: K,
  ): { id: string; count: number } | null {
    let best: { id: string; count: number } | null = null;
    for (const group of groups) {
      const id = group[key];
      if (!best || group._count._all > best.count) {
        best = { id, count: group._count._all };
      }
    }
    return best;
  }

  private buildWhere(
    tenantId: string,
    query: FindFuelSuppliesQueryDto,
  ): Prisma.FuelSupplyWhereInput {
    return {
      tenantId,
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
      ...(query.driverId ? { driverId: query.driverId } : {}),
      ...(query.tripId ? { tripId: query.tripId } : {}),
      ...(query.fuelStationId ? { fuelStationId: query.fuelStationId } : {}),
      ...(query.fuelTankId ? { fuelTankId: query.fuelTankId } : {}),
      ...(query.source ? { deviceEventId: query.source === 'DRIVER_APP' ? { not: null } : null } : {}),
      ...(query.fuelType ? { fuelType: query.fuelType } : {}),
      ...(query.supplyDateFrom || query.supplyDateTo
        ? {
            supplyDate: {
              ...(query.supplyDateFrom ? { gte: new Date(query.supplyDateFrom) } : {}),
              ...(query.supplyDateTo ? { lte: new Date(query.supplyDateTo) } : {}),
            },
          }
        : {}),
    };
  }

  // "odometerKm nao pode ser menor que a quilometragem atual do veiculo."
  private assertOdometerNotBelowCurrent(vehicle: Vehicle, odometerKm: number): void {
    assertOdometerNotBelowVehicle(toNumberOrNull(vehicle.odometerKm), odometerKm);
  }

  // "Ao salvar abastecimento, atualizar automaticamente Vehicle.odometerKm
  // caso seja maior."
  private async bumpVehicleOdometerIfGreater(
    vehicleId: string,
    odometerKm: number,
    currentOdometerKm: Prisma.Decimal | null,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const bumped = computeBumpedOdometer(toNumberOrNull(currentOdometerKm), odometerKm);
    if (bumped !== null) {
      await (tx ?? this.prisma).vehicle.update({ where: { id: vehicleId }, data: { odometerKm: bumped } });
    }
  }

  private async assertVehicleExists(tenantId: string, vehicleId: string): Promise<Vehicle> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, tenantId, deletedAt: null },
    });
    if (!vehicle) {
      throw new NotFoundException('Veiculo (vehicleId) nao encontrado nesta empresa.');
    }
    return vehicle;
  }

  private async assertDriverExists(tenantId: string, driverId: string): Promise<void> {
    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, tenantId, deletedAt: null },
    });
    if (!driver) {
      throw new NotFoundException('Motorista (driverId) nao encontrado nesta empresa.');
    }
  }

  private async assertFuelStationExists(tenantId: string, fuelStationId: string): Promise<void> {
    const station = await this.prisma.fuelStation.findFirst({
      where: { id: fuelStationId, tenantId },
    });
    if (!station) {
      throw new NotFoundException('Posto (fuelStationId) nao encontrado nesta empresa.');
    }
  }

  private async findTripOrThrow(tenantId: string, tripId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, tenantId, deletedAt: null },
      include: { composition: true },
    });
    if (!trip) {
      throw new NotFoundException('Viagem (tripId) nao encontrada nesta empresa.');
    }
    return trip;
  }

  private async findOwnedOrThrow(tenantId: string, id: string): Promise<FuelSupplyWithRelations> {
    const supply = await this.prisma.fuelSupply.findFirst({
      where: { id, tenantId },
      include: SUPPLY_INCLUDE,
    });
    if (!supply) {
      throw new NotFoundException('Abastecimento nao encontrado nesta empresa.');
    }
    return supply;
  }
}
