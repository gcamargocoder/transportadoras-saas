import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, VehicleMaintenance, VehicleMaintenanceStatus } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMaintenanceDto } from '../dto/create-maintenance.dto';
import { FindMaintenancesQueryDto } from '../dto/find-maintenances-query.dto';
import { UpdateMaintenanceStatusDto } from '../dto/update-maintenance-status.dto';
import { UpdateMaintenanceDto } from '../dto/update-maintenance.dto';
import { MaintenanceEntity } from '../entities/maintenance.entity';
import { PaginatedMaintenancesEntity } from '../entities/paginated-maintenances.entity';
import { toMaintenanceEntity } from '../mappers/maintenance.mapper';
import { normalizePlate } from '../utils/normalize-plate.util';
import { VehiclesService } from './vehicles.service';

// Reutiliza VehiclesService.findActiveOrThrow para validar "veiculo
// inexistente"/"veiculo de outro tenant" -- nao duplica essa checagem aqui.
@Injectable()
export class MaintenancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly vehiclesService: VehiclesService,
  ) {}

  async findAll(
    tenantId: string,
    query: FindMaintenancesQueryDto,
  ): Promise<PaginatedMaintenancesEntity> {
    const where: Prisma.VehicleMaintenanceWhereInput = {
      tenantId,
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.workshop
        ? { workshop: { contains: query.workshop, mode: Prisma.QueryMode.insensitive } }
        : {}),
      ...(query.supplier
        ? { supplier: { contains: query.supplier, mode: Prisma.QueryMode.insensitive } }
        : {}),
      ...(query.plate
        ? {
            vehicle: {
              plate: { contains: normalizePlate(query.plate), mode: Prisma.QueryMode.insensitive },
            },
          }
        : {}),
      ...(query.openedFrom || query.openedTo
        ? {
            openedAt: {
              ...(query.openedFrom ? { gte: new Date(query.openedFrom) } : {}),
              ...(query.openedTo ? { lte: new Date(query.openedTo) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { description: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { notes: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              {
                serviceOrderNumber: {
                  contains: query.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              { workshop: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { supplier: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { mechanic: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.vehicleMaintenance.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.vehicleMaintenance.count({ where }),
    ]);

    const result = new PaginatedMaintenancesEntity();
    result.items = items.map(toMaintenanceEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  // GET /vehicles/:vehicleId/maintenances -- delega para findAll forcando
  // vehicleId, reaproveitando toda a logica de where/paginacao/ordenacao
  // (nao duplica a query).
  async findAllForVehicle(
    tenantId: string,
    vehicleId: string,
    pagination: { page: number; pageSize: number },
  ): Promise<PaginatedMaintenancesEntity> {
    await this.vehiclesService.findActiveOrThrow(tenantId, vehicleId);

    const query = new FindMaintenancesQueryDto();
    query.page = pagination.page;
    query.pageSize = pagination.pageSize;
    query.vehicleId = vehicleId;
    return this.findAll(tenantId, query);
  }

  async findOne(tenantId: string, id: string): Promise<MaintenanceEntity> {
    return toMaintenanceEntity(await this.findOwnedOrThrow(tenantId, id));
  }

  async create(
    tenantId: string,
    dto: CreateMaintenanceDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<MaintenanceEntity> {
    await this.vehiclesService.findActiveOrThrow(tenantId, dto.vehicleId);
    if (dto.responsibleUserId) {
      await this.assertResponsibleUserBelongsToTenant(tenantId, dto.responsibleUserId);
    }

    const totalCost = this.computeTotalCost(dto.laborCost, dto.partsCost);

    const maintenance = await this.prisma.vehicleMaintenance.create({
      data: {
        tenantId,
        vehicleId: dto.vehicleId,
        type: dto.type,
        ...compact({
          priority: dto.priority,
          openedAt: dto.openedAt ? new Date(dto.openedAt) : undefined,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
          odometerKm: dto.odometerKm,
          workshop: dto.workshop,
          supplier: dto.supplier,
          mechanic: dto.mechanic,
          responsibleUserId: dto.responsibleUserId,
          description: dto.description,
          notes: dto.notes,
          laborCost: dto.laborCost,
          partsCost: dto.partsCost,
          totalCost,
          serviceOrderNumber: dto.serviceOrderNumber,
          warrantyUntil: dto.warrantyUntil ? new Date(dto.warrantyUntil) : undefined,
          nextReviewAt: dto.nextReviewAt ? new Date(dto.nextReviewAt) : undefined,
        }),
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'maintenance.created',
      entityName: 'VehicleMaintenance',
      entityId: maintenance.id,
      newValue: toJsonSafe({
        vehicleId: maintenance.vehicleId,
        type: maintenance.type,
        status: maintenance.status,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toMaintenanceEntity(maintenance);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateMaintenanceDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<MaintenanceEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    if (dto.vehicleId && dto.vehicleId !== before.vehicleId) {
      await this.vehiclesService.findActiveOrThrow(tenantId, dto.vehicleId);
    }
    if (dto.responsibleUserId && dto.responsibleUserId !== before.responsibleUserId) {
      await this.assertResponsibleUserBelongsToTenant(tenantId, dto.responsibleUserId);
    }

    const effectiveOpenedAt = dto.openedAt ? new Date(dto.openedAt) : before.openedAt;
    this.assertDatesConsistent(effectiveOpenedAt, before.completedAt);

    const totalCost = this.computeTotalCost(
      dto.laborCost ?? toNumberOrNull(before.laborCost) ?? undefined,
      dto.partsCost ?? toNumberOrNull(before.partsCost) ?? undefined,
    );

    const maintenance = await this.prisma.vehicleMaintenance.update({
      where: { id },
      data: compact({
        vehicleId: dto.vehicleId,
        type: dto.type,
        priority: dto.priority,
        openedAt: dto.openedAt ? new Date(dto.openedAt) : undefined,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        odometerKm: dto.odometerKm,
        workshop: dto.workshop,
        supplier: dto.supplier,
        mechanic: dto.mechanic,
        responsibleUserId: dto.responsibleUserId,
        description: dto.description,
        notes: dto.notes,
        laborCost: dto.laborCost,
        partsCost: dto.partsCost,
        totalCost,
        serviceOrderNumber: dto.serviceOrderNumber,
        warrantyUntil: dto.warrantyUntil ? new Date(dto.warrantyUntil) : undefined,
        nextReviewAt: dto.nextReviewAt ? new Date(dto.nextReviewAt) : undefined,
      }),
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'maintenance.updated',
      entityName: 'VehicleMaintenance',
      entityId: id,
      previousValue: toJsonSafe(before),
      newValue: toJsonSafe(maintenance),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toMaintenanceEntity(maintenance);
  }

  async updateStatus(
    tenantId: string,
    id: string,
    dto: UpdateMaintenanceStatusDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<MaintenanceEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    const data: Prisma.VehicleMaintenanceUpdateInput = { status: dto.status };

    if (dto.status === VehicleMaintenanceStatus.COMPLETED) {
      const effectiveCompletedAt = dto.completedAt ? new Date(dto.completedAt) : before.completedAt;
      if (!effectiveCompletedAt) {
        throw new ConflictException(
          'Nao e possivel concluir a manutencao sem informar a data de conclusao.',
        );
      }
      this.assertDatesConsistent(before.openedAt, effectiveCompletedAt);

      const effectiveTotalCost = toNumberOrNull(before.totalCost);
      if (effectiveTotalCost === null || effectiveTotalCost <= 0) {
        throw new ConflictException(
          'Nao e possivel concluir a manutencao sem valor total (informe mao de obra e/ou pecas antes).',
        );
      }
      data.completedAt = effectiveCompletedAt;
    }

    const maintenance = await this.prisma.vehicleMaintenance.update({ where: { id }, data });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'maintenance.status_changed',
      entityName: 'VehicleMaintenance',
      entityId: id,
      previousValue: { status: before.status },
      newValue: { status: maintenance.status },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toMaintenanceEntity(maintenance);
  }

  async remove(
    tenantId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<void> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    if (before.status === VehicleMaintenanceStatus.COMPLETED) {
      throw new ConflictException('Nao e possivel excluir uma manutencao ja concluida.');
    }

    // "Utilizada por auditoria": ja existe historico de alteracao registrado
    // (algo alem do proprio evento de criacao) -- excluir destruiria esse
    // rastro de auditoria.
    const auditUsageCount = await this.prisma.auditLog.count({
      where: {
        tenantId,
        entityName: 'VehicleMaintenance',
        entityId: id,
        action: { not: 'maintenance.created' },
      },
    });
    if (auditUsageCount > 0) {
      throw new ConflictException(
        'Nao e possivel excluir esta manutencao: ja possui historico de alteracoes registrado em auditoria.',
      );
    }

    await this.prisma.vehicleMaintenance.delete({ where: { id } });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'maintenance.deleted',
      entityName: 'VehicleMaintenance',
      entityId: id,
      previousValue: toJsonSafe({
        vehicleId: before.vehicleId,
        type: before.type,
        status: before.status,
      }),
      newValue: null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  private async findOwnedOrThrow(tenantId: string, id: string): Promise<VehicleMaintenance> {
    const maintenance = await this.prisma.vehicleMaintenance.findFirst({
      where: { id, tenantId },
    });
    if (!maintenance) {
      throw new NotFoundException('Manutencao nao encontrada.');
    }
    return maintenance;
  }

  private async assertResponsibleUserBelongsToTenant(
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const user = await this.prisma.userAccount.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
    });
    if (!user) {
      throw new NotFoundException(
        'Usuario responsavel (responsibleUserId) nao encontrado nesta empresa.',
      );
    }
  }

  private assertDatesConsistent(openedAt: Date, completedAt: Date | null): void {
    if (completedAt && completedAt < openedAt) {
      throw new ConflictException(
        'Data de conclusao nao pode ser anterior a data de abertura da manutencao.',
      );
    }
  }

  private computeTotalCost(laborCost?: number, partsCost?: number): number | undefined {
    if (laborCost === undefined && partsCost === undefined) return undefined;
    return (laborCost ?? 0) + (partsCost ?? 0);
  }
}
