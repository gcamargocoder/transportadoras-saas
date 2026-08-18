import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  TripStatus,
  Vehicle,
  VehicleMaintenanceStatus,
  VehicleOwnershipType,
  VehicleStatus,
} from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { PaginatedAuditLogEntity } from '../../audit/entities/paginated-audit-log.entity';
import { toAuditLogEntity } from '../../audit/mappers/audit-log.mapper';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { PLAN_ERRORS } from '../../tenants/constants/plan-error.constants';
import { assertUnderLimit, runSerializable } from '../../tenants/utils/plan-limit.util';
import { CreateVehicleDto } from '../dto/create-vehicle.dto';
import { FindVehiclesQueryDto } from '../dto/find-vehicles-query.dto';
import { UpdateVehicleStatusDto } from '../dto/update-vehicle-status.dto';
import { UpdateVehicleDto } from '../dto/update-vehicle.dto';
import { PaginatedVehiclesEntity } from '../entities/paginated-vehicles.entity';
import { VehicleDriverAssignmentEntity } from '../entities/vehicle-driver-assignment.entity';
import { VehicleSummaryEntity } from '../entities/vehicle-summary.entity';
import { VehicleEntity } from '../entities/vehicle.entity';
import { hasActiveRelationship } from '../interfaces/vehicle-relationship-counts.interface';
import { VehicleDerivedContext, toVehicleEntity } from '../mappers/vehicle.mapper';
import { normalizePlate } from '../utils/normalize-plate.util';
import { resolveVehicleStatusChangeAction } from '../utils/vehicle-status-transition.util';

const ACTIVE_TRIP_STATUSES: TripStatus[] = [TripStatus.IN_PROGRESS, TripStatus.PAUSED];

const CURRENT_DRIVER_ASSIGNMENT_INCLUDE = {
  driver: { select: { id: true, name: true } },
} satisfies Prisma.DriverVehicleAssignmentInclude;

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(tenantId: string, query: FindVehiclesQueryDto): Promise<PaginatedVehiclesEntity> {
    const where: Prisma.VehicleWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.fleetId ? { fleetId: query.fleetId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.ownershipType ? { ownershipType: query.ownershipType } : {}),
      ...(query.currentDriverId
        ? { driverAssignments: { some: { driverId: query.currentDriverId, endedAt: null } } }
        : {}),
      ...(query.availability ? this.buildAvailabilityWhere(query.availability) : {}),
      ...(query.category
        ? { category: { contains: query.category, mode: Prisma.QueryMode.insensitive } }
        : {}),
      ...(query.manufactureYear !== undefined ? { manufactureYear: query.manufactureYear } : {}),
      ...(query.modelYear !== undefined ? { modelYear: query.modelYear } : {}),
      ...(query.plate
        ? { plate: { contains: normalizePlate(query.plate), mode: Prisma.QueryMode.insensitive } }
        : {}),
      ...(query.brand
        ? { brand: { contains: query.brand, mode: Prisma.QueryMode.insensitive } }
        : {}),
      ...(query.model
        ? { model: { contains: query.model, mode: Prisma.QueryMode.insensitive } }
        : {}),
      ...(query.search
        ? {
            OR: [
              {
                plate: {
                  contains: normalizePlate(query.search),
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              { brand: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { model: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { chassisNumber: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    // Motorista atual + "em viagem agora" resolvidos em lote (2 queries no
    // total para a pagina inteira) -- nunca 1 por linha (secao 12 da Fase 62).
    const derivedContexts = await this.getDerivedContextMap(
      tenantId,
      items.map((item) => item.id),
    );

    const result = new PaginatedVehiclesEntity();
    result.items = items.map((item) => toVehicleEntity(item, derivedContexts.get(item.id)));
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<VehicleEntity> {
    const vehicle = await this.findActiveOrThrow(tenantId, id);
    const derivedContexts = await this.getDerivedContextMap(tenantId, [id]);
    return toVehicleEntity(vehicle, derivedContexts.get(id));
  }

  // GET /vehicles/summary -- contagens do tenant inteiro via groupBy/count
  // em paralelo, independente da quantidade de veiculos (secao 11/12 da
  // Fase 62).
  async getSummary(tenantId: string): Promise<VehicleSummaryEntity> {
    const baseWhere: Prisma.VehicleWhereInput = { tenantId, deletedAt: null };

    const [total, byStatus, byOwnership, totalOnTrip] = await Promise.all([
      this.prisma.vehicle.count({ where: baseWhere }),
      this.prisma.vehicle.groupBy({ by: ['status'], where: baseWhere, _count: { _all: true } }),
      this.prisma.vehicle.groupBy({ by: ['ownershipType'], where: baseWhere, _count: { _all: true } }),
      this.countVehiclesOnTrip(baseWhere),
    ]);

    const findCount = (
      rows: { _count: { _all: number } }[],
      predicate: (row: unknown) => boolean,
    ): number => rows.filter(predicate).reduce((sum, row) => sum + row._count._all, 0);

    const totalActive = findCount(byStatus, (row) => (row as { status: VehicleStatus }).status === VehicleStatus.ACTIVE);

    const entity = new VehicleSummaryEntity();
    entity.total = total;
    entity.totalActive = totalActive;
    entity.totalInactive = findCount(byStatus, (row) => (row as { status: VehicleStatus }).status === VehicleStatus.INACTIVE);
    entity.totalSuspended = findCount(byStatus, (row) => (row as { status: VehicleStatus }).status === VehicleStatus.SUSPENDED);
    entity.totalMaintenance = findCount(byStatus, (row) => (row as { status: VehicleStatus }).status === VehicleStatus.MAINTENANCE);
    entity.totalOnTrip = totalOnTrip;
    entity.totalAvailable = Math.max(totalActive - totalOnTrip, 0);
    entity.totalUnavailable = Math.max(total - entity.totalAvailable, 0);
    entity.totalOwn = findCount(byOwnership, (row) => (row as { ownershipType: VehicleOwnershipType }).ownershipType === VehicleOwnershipType.OWN);
    entity.totalAggregated = findCount(byOwnership, (row) => (row as { ownershipType: VehicleOwnershipType }).ownershipType === VehicleOwnershipType.AGGREGATED);
    entity.totalThirdParty = findCount(byOwnership, (row) => (row as { ownershipType: VehicleOwnershipType }).ownershipType === VehicleOwnershipType.THIRD_PARTY);
    return entity;
  }

  // GET /vehicles/:id/driver-assignments -- mesma tabela DriverVehicleAssignment
  // (Fase 61) filtrada pelo veiculo, nunca duplicada (secao 5 da Fase 62).
  async getDriverAssignments(tenantId: string, vehicleId: string): Promise<VehicleDriverAssignmentEntity[]> {
    await this.findActiveOrThrow(tenantId, vehicleId);
    return this.getDriverAssignmentsRaw(tenantId, vehicleId);
  }

  // Sem checagem de existencia -- reaproveitado internamente por
  // VehicleOverviewService, que ja validou o veiculo antes.
  async getDriverAssignmentsRaw(tenantId: string, vehicleId: string): Promise<VehicleDriverAssignmentEntity[]> {
    const assignments = await this.prisma.driverVehicleAssignment.findMany({
      where: { tenantId, vehicleId },
      include: { driver: { select: { id: true, name: true, type: true, status: true } }, creator: true },
      orderBy: { startedAt: 'desc' },
    });

    return assignments.map((assignment) => {
      const entity = new VehicleDriverAssignmentEntity();
      entity.id = assignment.id;
      entity.vehicleId = assignment.vehicleId;
      entity.driverId = assignment.driverId;
      entity.driverName = assignment.driver.name;
      entity.driverType = assignment.driver.type;
      entity.driverStatus = assignment.driver.status;
      entity.startedAt = assignment.startedAt;
      entity.endedAt = assignment.endedAt;
      entity.notes = assignment.notes;
      entity.createdBy = assignment.createdBy;
      entity.creatorName = assignment.creator.name;
      entity.createdAt = assignment.createdAt;
      return entity;
    });
  }

  // Historico de auditoria do veiculo (AuditService.findByEntity e generico
  // -- so filtramos entityName='Vehicle'). Confirma que o veiculo existe e
  // pertence ao tenant antes de consultar, mesmo padrao de isolamento usado
  // em todo o resto do modulo.
  async getHistory(
    tenantId: string,
    id: string,
    pagination: PaginationQueryDto,
  ): Promise<PaginatedAuditLogEntity> {
    await this.findActiveOrThrow(tenantId, id);

    const { items, total } = await this.audit.findByEntity(tenantId, 'Vehicle', id, pagination);

    const result = new PaginatedAuditLogEntity();
    result.items = items.map(toAuditLogEntity);
    result.meta = buildPaginationMeta(total, pagination.page, pagination.pageSize);
    return result;
  }

  async create(
    tenantId: string,
    dto: CreateVehicleDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<VehicleEntity> {
    const plate = normalizePlate(dto.plate);
    this.assertYearConsistency(dto.manufactureYear, dto.modelYear);

    // Fase 48 -- checagem de duplicidade + limite do plano + create numa
    // unica transacao Serializable: garante que duas criacoes concorrentes
    // nunca ultrapassem juntas o limite de veiculos do tenant.
    const vehicle = await runSerializable(this.prisma, async (tx) => {
      await this.assertUniqueFields(
        tenantId,
        { plate, renavam: dto.renavam, chassisNumber: dto.chassisNumber },
        undefined,
        tx,
      );
      if (dto.fleetId) {
        await this.assertFleetBelongsToTenant(tenantId, dto.fleetId, tx);
      }

      const plan = await tx.tenantPlan.findUnique({ where: { tenantId } });
      const count = await tx.vehicle.count({ where: { tenantId, deletedAt: null } });
      assertUnderLimit(count, plan?.maxVehicles, PLAN_ERRORS.VEHICLE_LIMIT_REACHED);

      return tx.vehicle.create({
        data: {
          tenantId,
          plate,
          type: dto.type,
          brand: dto.brand,
          model: dto.model,
          ...compact({
            fleetId: dto.fleetId,
            renavam: dto.renavam,
            chassisNumber: dto.chassisNumber,
            manufactureYear: dto.manufactureYear,
            modelYear: dto.modelYear,
            color: dto.color,
            category: dto.category,
            ownershipType: dto.ownershipType,
            fuelType: dto.fuelType,
            tankCapacityLiters: dto.tankCapacityLiters,
            averageConsumptionKmL: dto.averageConsumptionKmL,
            odometerKm: dto.odometerKm,
            grossWeightKg: dto.grossWeightKg,
            netWeightKg: dto.netWeightKg,
            cargoCapacityKg: dto.cargoCapacityKg,
            axleCount: dto.axleCount,
            notes: dto.notes,
          }),
        },
      });
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'vehicle.created',
      entityName: 'Vehicle',
      entityId: vehicle.id,
      newValue: toJsonSafe({
        plate: vehicle.plate,
        type: vehicle.type,
        brand: vehicle.brand,
        model: vehicle.model,
        ownershipType: vehicle.ownershipType,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toVehicleEntity(vehicle);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateVehicleDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<VehicleEntity> {
    const before = await this.findActiveOrThrow(tenantId, id);

    const plate = dto.plate ? normalizePlate(dto.plate) : undefined;
    this.assertYearConsistency(
      dto.manufactureYear ?? before.manufactureYear ?? undefined,
      dto.modelYear ?? before.modelYear ?? undefined,
    );
    await this.assertUniqueFields(
      tenantId,
      { plate, renavam: dto.renavam, chassisNumber: dto.chassisNumber },
      before,
    );
    if (dto.fleetId) {
      await this.assertFleetBelongsToTenant(tenantId, dto.fleetId);
    }

    const vehicle = await this.prisma.vehicle.update({
      where: { id },
      data: compact({
        plate,
        fleetId: dto.fleetId,
        renavam: dto.renavam,
        chassisNumber: dto.chassisNumber,
        brand: dto.brand,
        model: dto.model,
        manufactureYear: dto.manufactureYear,
        modelYear: dto.modelYear,
        color: dto.color,
        type: dto.type,
        category: dto.category,
        ownershipType: dto.ownershipType,
        fuelType: dto.fuelType,
        tankCapacityLiters: dto.tankCapacityLiters,
        averageConsumptionKmL: dto.averageConsumptionKmL,
        odometerKm: dto.odometerKm,
        grossWeightKg: dto.grossWeightKg,
        netWeightKg: dto.netWeightKg,
        cargoCapacityKg: dto.cargoCapacityKg,
        axleCount: dto.axleCount,
        notes: dto.notes,
      }),
    });

    // Alteracao de classificacao ganha sua propria acao de auditoria
    // distinta (mesmo padrao de driver.classification_changed, Fase 61),
    // sem duplicar o log generico abaixo.
    const ownershipChanged = dto.ownershipType !== undefined && dto.ownershipType !== before.ownershipType;

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: ownershipChanged ? 'vehicle.ownership_changed' : 'vehicle.updated',
      entityName: 'Vehicle',
      entityId: id,
      previousValue: toJsonSafe(before),
      newValue: toJsonSafe(vehicle),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    const derivedContexts = await this.getDerivedContextMap(tenantId, [id]);
    return toVehicleEntity(vehicle, derivedContexts.get(id));
  }

  async updateStatus(
    tenantId: string,
    id: string,
    dto: UpdateVehicleStatusDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<VehicleEntity> {
    const before = await this.findActiveOrThrow(tenantId, id);

    const vehicle = await this.prisma.vehicle.update({
      where: { id },
      data: { status: dto.status },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: resolveVehicleStatusChangeAction(before.status, vehicle.status),
      entityName: 'Vehicle',
      entityId: id,
      previousValue: { status: before.status },
      newValue: { status: vehicle.status },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    const derivedContexts = await this.getDerivedContextMap(tenantId, [id]);
    return toVehicleEntity(vehicle, derivedContexts.get(id));
  }

  async softDelete(
    tenantId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<void> {
    const before = await this.findActiveOrThrow(tenantId, id);

    // "viagem em andamento" = composicao deste veiculo ligada a um Trip
    // IN_PROGRESS/PAUSED (fisicamente na estrada agora). "composicao ativa" =
    // composicao deste veiculo ainda nao concluida/cancelada (sem trip ainda,
    // ou trip em qualquer estado nao-terminal -- PLANNED, WAITING_DRIVER,
    // WAITING_DEPARTURE, IN_PROGRESS, PAUSED -- Fase 14). "manutencao aberta" =
    // VehicleMaintenance.status fora de COMPLETED/CANCELLED (Fase 13). Os
    // contadores podem se sobrepor, o que e aceitavel para a mensagem de erro
    // (mesmo padrao usado no bloqueio de exclusao de Tenant/Driver:
    // contadores informativos, nao mutuamente exclusivos).
    const NON_TERMINAL_TRIP_STATUSES = [
      TripStatus.PLANNED,
      TripStatus.WAITING_DRIVER,
      TripStatus.WAITING_DEPARTURE,
      TripStatus.IN_PROGRESS,
      TripStatus.PAUSED,
    ];
    const [activeTrips, activeCompositions, openMaintenances] = await Promise.all([
      this.prisma.tripComposition.count({
        where: {
          tenantId,
          vehicleId: id,
          trip: { status: { in: [TripStatus.IN_PROGRESS, TripStatus.PAUSED] } },
        },
      }),
      this.prisma.tripComposition.count({
        where: {
          tenantId,
          vehicleId: id,
          OR: [{ tripId: null }, { trip: { status: { in: NON_TERMINAL_TRIP_STATUSES } } }],
        },
      }),
      this.prisma.vehicleMaintenance.count({
        where: {
          tenantId,
          vehicleId: id,
          status: {
            notIn: [VehicleMaintenanceStatus.COMPLETED, VehicleMaintenanceStatus.CANCELLED],
          },
        },
      }),
    ]);
    if (hasActiveRelationship({ activeTrips, activeCompositions, openMaintenances })) {
      throw new ConflictException(
        'Nao e possivel excluir este veiculo: existem viagens ativas ' +
          `(${activeTrips} em andamento, ${activeCompositions} composicoes ativas) ou ` +
          `manutencao aberta (${openMaintenances}) vinculadas. Finalize as viagens, remova as ` +
          'composicoes e conclua/cancele as manutencoes antes de excluir o veiculo.',
      );
    }

    await this.prisma.vehicle.update({
      where: { id },
      data: { deletedAt: new Date(), status: VehicleStatus.INACTIVE },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'vehicle.deleted',
      entityName: 'Vehicle',
      entityId: id,
      previousValue: toJsonSafe({ plate: before.plate, status: before.status }),
      newValue: null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  async findActiveOrThrow(tenantId: string, id: string): Promise<Vehicle> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!vehicle) {
      throw new NotFoundException('Veiculo nao encontrado.');
    }
    return vehicle;
  }

  // Fase 62 -- "em viagem agora" reaproveita EXATAMENTE o mesmo criterio ja
  // usado por FleetOperationsMetricsService.countVehiclesOnTrip: composicao
  // do veiculo vinculada a um Trip IN_PROGRESS/PAUSED.
  private countVehiclesOnTrip(vehicleWhere: Prisma.VehicleWhereInput): Promise<number> {
    return this.prisma.vehicle.count({
      where: { ...vehicleWhere, tripCompositions: { some: { trip: { status: { in: ACTIVE_TRIP_STATUSES } } } } },
    });
  }

  private buildAvailabilityWhere(
    availability: 'AVAILABLE' | 'ON_TRIP' | 'UNAVAILABLE',
  ): Prisma.VehicleWhereInput {
    const onTripFilter: Prisma.VehicleWhereInput = {
      tripCompositions: { some: { trip: { status: { in: ACTIVE_TRIP_STATUSES } } } },
    };
    if (availability === 'ON_TRIP') {
      return { status: VehicleStatus.ACTIVE, ...onTripFilter };
    }
    if (availability === 'AVAILABLE') {
      return {
        status: VehicleStatus.ACTIVE,
        tripCompositions: { none: { trip: { status: { in: ACTIVE_TRIP_STATUSES } } } },
      };
    }
    // UNAVAILABLE = nao-ACTIVE OU ACTIVE em viagem.
    return { OR: [{ status: { not: VehicleStatus.ACTIVE } }, onTripFilter] };
  }

  // Resolve motorista atual + "em viagem agora" de varios veiculos em 2
  // queries no total (nunca 1 por linha) -- secao 12 da Fase 62.
  private async getDerivedContextMap(
    tenantId: string,
    vehicleIds: string[],
  ): Promise<Map<string, VehicleDerivedContext>> {
    if (vehicleIds.length === 0) return new Map();

    const [currentAssignments, onTripRows] = await Promise.all([
      this.prisma.driverVehicleAssignment.findMany({
        where: { tenantId, vehicleId: { in: vehicleIds }, endedAt: null },
        include: CURRENT_DRIVER_ASSIGNMENT_INCLUDE,
      }),
      this.prisma.vehicle.findMany({
        where: {
          tenantId,
          id: { in: vehicleIds },
          tripCompositions: { some: { trip: { status: { in: ACTIVE_TRIP_STATUSES } } } },
        },
        select: { id: true },
      }),
    ]);

    const onTripSet = new Set(onTripRows.map((row) => row.id));
    const map = new Map<string, VehicleDerivedContext>();
    for (const vehicleId of vehicleIds) {
      map.set(vehicleId, { currentDriverId: null, currentDriverName: null, onTrip: onTripSet.has(vehicleId) });
    }
    for (const assignment of currentAssignments) {
      const existing = map.get(assignment.vehicleId);
      map.set(assignment.vehicleId, {
        currentDriverId: assignment.driverId,
        currentDriverName: assignment.driver.name,
        onTrip: existing?.onTrip ?? onTripSet.has(assignment.vehicleId),
      });
    }
    return map;
  }

  private assertYearConsistency(manufactureYear?: number, modelYear?: number): void {
    if (manufactureYear === undefined || modelYear === undefined) return;
    if (modelYear < manufactureYear) {
      throw new ConflictException(
        'Ano inconsistente: modelYear nao pode ser anterior a manufactureYear.',
      );
    }
  }

  // Fase 48 -- aceita opcionalmente o client de uma transacao (`tx`) para
  // create() poder rodar esta checagem dentro da mesma transacao
  // Serializable do limite do plano; update() continua chamando sem client
  // (default this.prisma), comportamento identico ao anterior.
  private async assertFleetBelongsToTenant(
    tenantId: string,
    fleetId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const fleet = await client.fleet.findFirst({
      where: { id: fleetId, tenantId, deletedAt: null },
    });
    if (!fleet) {
      throw new NotFoundException('Frota (fleetId) nao encontrada nesta empresa.');
    }
  }

  private async assertUniqueFields(
    tenantId: string,
    fields: {
      plate?: string | undefined;
      renavam?: string | undefined;
      chassisNumber?: string | undefined;
    },
    before?: Vehicle,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    if (fields.plate && fields.plate !== before?.plate) {
      const existing = await client.vehicle.findUnique({
        where: { tenantId_plate: { tenantId, plate: fields.plate } },
      });
      if (existing)
        throw new ConflictException('Ja existe um veiculo com esta placa nesta empresa.');
    }
    if (fields.renavam && fields.renavam !== before?.renavam) {
      const existing = await client.vehicle.findUnique({
        where: { tenantId_renavam: { tenantId, renavam: fields.renavam } },
      });
      if (existing)
        throw new ConflictException('Ja existe um veiculo com este RENAVAM nesta empresa.');
    }
    if (fields.chassisNumber && fields.chassisNumber !== before?.chassisNumber) {
      const existing = await client.vehicle.findUnique({
        where: { tenantId_chassisNumber: { tenantId, chassisNumber: fields.chassisNumber } },
      });
      if (existing)
        throw new ConflictException('Ja existe um veiculo com este chassi nesta empresa.');
    }
  }
}
