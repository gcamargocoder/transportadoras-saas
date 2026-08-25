import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MaintenancePart, MaintenanceProviderType, Prisma, VehicleMaintenance, VehicleMaintenanceStatus } from '@prisma/client';
import { PaginatedAuditLogEntity } from '../../audit/entities/paginated-audit-log.entity';
import { toAuditLogEntity } from '../../audit/mappers/audit-log.mapper';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CompleteMaintenanceDto } from '../dto/complete-maintenance.dto';
import { CreateMaintenanceDto } from '../dto/create-maintenance.dto';
import { DiagnoseMaintenanceDto } from '../dto/diagnose-maintenance.dto';
import { FindMaintenancesQueryDto } from '../dto/find-maintenances-query.dto';
import { MaintenancePartInputDto } from '../dto/maintenance-part-input.dto';
import { UpdateMaintenanceStatusDto } from '../dto/update-maintenance-status.dto';
import { UpdateMaintenanceDto } from '../dto/update-maintenance.dto';
import { MaintenanceEntity } from '../entities/maintenance.entity';
import { PaginatedMaintenancesEntity } from '../entities/paginated-maintenances.entity';
import { toMaintenanceEntity } from '../mappers/maintenance.mapper';
import {
  assertValidMaintenanceStatusTransition,
  assertWorkOrderActionAllowed,
  resolveMaintenanceStatusChangeAction,
} from '../utils/maintenance-status-transition.util';
import { normalizePlate } from '../utils/normalize-plate.util';
import { VehicleAvailabilityService } from './vehicle-availability.service';
import { VehiclesService } from './vehicles.service';
import { PartsService } from '../../parts/services/parts.service';
import { MaintenanceProvidersService } from '../../maintenance-providers/services/maintenance-providers.service';
import { runSerializable } from '../../tenants/utils/plan-limit.util';

// Reutiliza VehiclesService.findActiveOrThrow para validar "veiculo
// inexistente"/"veiculo de outro tenant" -- nao duplica essa checagem aqui.
//
// Fase 82 -- "Ordem de Servico" (OS) NAO e uma entidade nova: e o proprio
// VehicleMaintenance, evoluido (ver docs/work-orders.md). As acoes
// diagnose/submitForApproval/approve/start/complete/cancel sao a camada de
// workflow sobre o mesmo registro/tabela que ja existia desde a Fase 13.
//
// Fase 83 -- PartsService injetado para consumir estoque (PEÇA -> ESTOQUE ->
// OS) no unico momento em que uma peca vinculada e considerada efetivamente
// usada: a conclusao da OS (ver applyStatusChange/consumePartsForMaintenance,
// docs/parts-inventory.md secao 6).
@Injectable()
export class MaintenancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly vehiclesService: VehiclesService,
    private readonly vehicleAvailability: VehicleAvailabilityService,
    private readonly partsService: PartsService,
    private readonly maintenanceProvidersService: MaintenanceProvidersService,
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
      ...(query.component ? { component: query.component } : {}),
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
        include: { parts: true, vehicle: { select: { plate: true } }, workshopProvider: { select: { name: true } }, supplierProvider: { select: { name: true } } },
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
    if (dto.maintenancePlanId) {
      await this.assertMaintenancePlanBelongsToTenant(tenantId, dto.maintenancePlanId);
    }
    if (dto.parts?.length) {
      await this.partsService.assertPartsBelongToTenant(
        tenantId,
        dto.parts.flatMap((p) => (p.partId ? [p.partId] : [])),
      );
    }
    if (dto.workshopId) {
      await this.maintenanceProvidersService.assertActiveProviderOfType(
        tenantId,
        dto.workshopId,
        MaintenanceProviderType.WORKSHOP,
      );
    }
    if (dto.supplierId) {
      await this.maintenanceProvidersService.assertActiveProviderOfType(
        tenantId,
        dto.supplierId,
        MaintenanceProviderType.SUPPLIER,
      );
    }

    const { partsCost, partsItems } = this.resolvePartsCost(dto.parts, dto.partsCost);
    const totalCost = this.computeTotalCost(dto.laborCost, partsCost);

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
          workshopId: dto.workshopId,
          supplierId: dto.supplierId,
          responsibleUserId: dto.responsibleUserId,
          description: dto.description,
          diagnosis: dto.diagnosis,
          notes: dto.notes,
          laborCost: dto.laborCost,
          partsCost,
          totalCost,
          serviceOrderNumber: dto.serviceOrderNumber,
          warrantyUntil: dto.warrantyUntil ? new Date(dto.warrantyUntil) : undefined,
          nextReviewAt: dto.nextReviewAt ? new Date(dto.nextReviewAt) : undefined,
          component: dto.component,
          nextOdometerKm: dto.nextOdometerKm,
          downtimeMinutes: dto.downtimeMinutes,
          invoiceNumber: dto.invoiceNumber,
          maintenancePlanId: dto.maintenancePlanId,
        }),
        ...(partsItems ? { parts: { create: partsItems } } : {}),
      },
      include: { parts: true, vehicle: { select: { plate: true } }, workshopProvider: { select: { name: true } }, supplierProvider: { select: { name: true } } },
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
    if (dto.maintenancePlanId && dto.maintenancePlanId !== before.maintenancePlanId) {
      await this.assertMaintenancePlanBelongsToTenant(tenantId, dto.maintenancePlanId);
    }
    // Fase 83 -- uma vez COMPLETED, a conclusao ja gerou saidas de estoque
    // para as pecas vinculadas (ver consumePartsForMaintenance); reenviar
    // `parts` substituiria a lista inteira (Fase 45) e divergiria do que ja
    // foi baixado no estoque, sem nenhuma movimentacao correspondente.
    // CANCELLED e terminal por definicao -- editar pecas de uma OS encerrada
    // nao tem efeito operacional real. Bloqueado para ambos.
    const isTerminal =
      before.status === VehicleMaintenanceStatus.COMPLETED || before.status === VehicleMaintenanceStatus.CANCELLED;
    if (dto.parts !== undefined && isTerminal) {
      throw new ConflictException(
        'Nao e possivel alterar as pecas de uma OS encerrada (concluida ou cancelada).',
      );
    }
    if (dto.parts?.length) {
      await this.partsService.assertPartsBelongToTenant(
        tenantId,
        dto.parts.flatMap((p) => (p.partId ? [p.partId] : [])),
      );
    }
    if (dto.workshopId && dto.workshopId !== before.workshopId) {
      await this.maintenanceProvidersService.assertActiveProviderOfType(
        tenantId,
        dto.workshopId,
        MaintenanceProviderType.WORKSHOP,
      );
    }
    if (dto.supplierId && dto.supplierId !== before.supplierId) {
      await this.maintenanceProvidersService.assertActiveProviderOfType(
        tenantId,
        dto.supplierId,
        MaintenanceProviderType.SUPPLIER,
      );
    }

    const effectiveOpenedAt = dto.openedAt ? new Date(dto.openedAt) : before.openedAt;
    this.assertDatesConsistent(effectiveOpenedAt, before.completedAt);

    const { partsCost, partsItems } = this.resolvePartsCost(
      dto.parts,
      dto.partsCost ?? toNumberOrNull(before.partsCost) ?? undefined,
    );
    const totalCost = this.computeTotalCost(dto.laborCost ?? toNumberOrNull(before.laborCost) ?? undefined, partsCost);

    const maintenance = await this.prisma.vehicleMaintenance.update({
      where: { id },
      data: {
        ...compact({
          vehicleId: dto.vehicleId,
          type: dto.type,
          priority: dto.priority,
          openedAt: dto.openedAt ? new Date(dto.openedAt) : undefined,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
          odometerKm: dto.odometerKm,
          workshop: dto.workshop,
          supplier: dto.supplier,
          mechanic: dto.mechanic,
          workshopId: dto.workshopId,
          supplierId: dto.supplierId,
          responsibleUserId: dto.responsibleUserId,
          description: dto.description,
          diagnosis: dto.diagnosis,
          notes: dto.notes,
          laborCost: dto.laborCost,
          partsCost,
          totalCost,
          serviceOrderNumber: dto.serviceOrderNumber,
          warrantyUntil: dto.warrantyUntil ? new Date(dto.warrantyUntil) : undefined,
          nextReviewAt: dto.nextReviewAt ? new Date(dto.nextReviewAt) : undefined,
          component: dto.component,
          nextOdometerKm: dto.nextOdometerKm,
          downtimeMinutes: dto.downtimeMinutes,
          invoiceNumber: dto.invoiceNumber,
          maintenancePlanId: dto.maintenancePlanId,
        }),
        // Fase 45 -- quando `parts` e enviado (mesmo vazio, para limpar a
        // lista), substitui TODAS as linhas -- nunca mescla com o que ja
        // existia (reenvio parcial nunca deve deixar itens orfaos).
        ...(partsItems ? { parts: { deleteMany: {}, create: partsItems } } : {}),
      },
      include: { parts: true, vehicle: { select: { plate: true } }, workshopProvider: { select: { name: true } }, supplierProvider: { select: { name: true } } },
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
    assertValidMaintenanceStatusTransition(before.status, dto.status);

    const data: Prisma.VehicleMaintenanceUpdateInput =
      dto.status === VehicleMaintenanceStatus.COMPLETED
        ? this.buildCompletedData(before, dto.completedAt)
        : { status: dto.status };

    const maintenance = await this.applyStatusChange(tenantId, id, before, data, actor, metadata);
    return toMaintenanceEntity(maintenance);
  }

  // ==========================================================================
  // Fase 82 -- acoes dedicadas do ciclo de vida da OS (secao 4 do pedido).
  // PATCH /:id/status acima permanece inalterado (permissivo, compatibilidade
  // retroativa); as acoes abaixo aplicam o guard mais estrito
  // assertWorkOrderActionAllowed, com precondicoes proprias por acao.
  // ==========================================================================

  async diagnose(
    tenantId: string,
    id: string,
    dto: DiagnoseMaintenanceDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<MaintenanceEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);
    assertWorkOrderActionAllowed('diagnose', before.status);
    const maintenance = await this.applyStatusChange(
      tenantId,
      id,
      before,
      { status: VehicleMaintenanceStatus.DIAGNOSING, diagnosis: dto.diagnosis },
      actor,
      metadata,
    );
    return toMaintenanceEntity(maintenance);
  }

  async submitForApproval(
    tenantId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<MaintenanceEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);
    assertWorkOrderActionAllowed('submitForApproval', before.status);
    const maintenance = await this.applyStatusChange(
      tenantId,
      id,
      before,
      { status: VehicleMaintenanceStatus.AWAITING_APPROVAL },
      actor,
      metadata,
    );
    return toMaintenanceEntity(maintenance);
  }

  async approve(
    tenantId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<MaintenanceEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);
    assertWorkOrderActionAllowed('approve', before.status);
    const maintenance = await this.applyStatusChange(
      tenantId,
      id,
      before,
      { status: VehicleMaintenanceStatus.APPROVED },
      actor,
      metadata,
    );
    return toMaintenanceEntity(maintenance);
  }

  async start(
    tenantId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<MaintenanceEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);
    assertWorkOrderActionAllowed('start', before.status);

    // Fase 82, secao 6 -- conflito com viagem: iniciar a execucao
    // indisponibiliza o veiculo (via VehiclesService.syncStatusForMaintenance,
    // que promove Vehicle.status para MAINTENANCE quando ha uma OS
    // IN_PROGRESS). Nao permitir isso se o veiculo ja estiver fisicamente em
    // viagem agora -- reutiliza VehicleAvailabilityService da Fase 81, nenhuma
    // funcao de disponibilidade nova.
    const onTrip = await this.vehicleAvailability.isOnTrip(tenantId, before.vehicleId);
    if (onTrip) {
      throw new ConflictException(
        'Nao e possivel iniciar a execucao: o veiculo esta em viagem no momento.',
      );
    }

    // Fase 82, secao 6/18 -- conflito com outra OS incompativel: nunca 2 OS
    // simultaneamente IN_PROGRESS para o mesmo veiculo (duas equipes
    // "executando" o mesmo veiculo fisicamente ao mesmo tempo seria uma
    // inconsistencia operacional).
    const concurrentInProgress = await this.prisma.vehicleMaintenance.findFirst({
      where: {
        tenantId,
        vehicleId: before.vehicleId,
        id: { not: id },
        status: VehicleMaintenanceStatus.IN_PROGRESS,
      },
    });
    if (concurrentInProgress) {
      throw new ConflictException(
        'Nao e possivel iniciar a execucao: ja existe outra OS em execucao para este veiculo.',
      );
    }

    const maintenance = await this.applyStatusChange(
      tenantId,
      id,
      before,
      { status: VehicleMaintenanceStatus.IN_PROGRESS, startedAt: before.startedAt ?? new Date() },
      actor,
      metadata,
    );
    return toMaintenanceEntity(maintenance);
  }

  async complete(
    tenantId: string,
    id: string,
    dto: CompleteMaintenanceDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<MaintenanceEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);
    assertWorkOrderActionAllowed('complete', before.status);
    const data = this.buildCompletedData(before, dto.completedAt);
    if (dto.completionOdometerKm !== undefined) {
      data.completionOdometerKm = dto.completionOdometerKm;
    }
    const maintenance = await this.applyStatusChange(tenantId, id, before, data, actor, metadata);
    return toMaintenanceEntity(maintenance);
  }

  async cancel(
    tenantId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<MaintenanceEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);
    assertWorkOrderActionAllowed('cancel', before.status);
    const maintenance = await this.applyStatusChange(
      tenantId,
      id,
      before,
      { status: VehicleMaintenanceStatus.CANCELLED },
      actor,
      metadata,
    );
    return toMaintenanceEntity(maintenance);
  }

  // GET /maintenances/:id/history -- mesmo padrao de VehiclesService.getHistory
  // (AuditService.findByEntity generico, so filtramos entityName).
  async getHistory(
    tenantId: string,
    id: string,
    pagination: { page: number; pageSize: number },
  ): Promise<PaginatedAuditLogEntity> {
    await this.findOwnedOrThrow(tenantId, id);

    const { items, total } = await this.audit.findByEntity(tenantId, 'VehicleMaintenance', id, pagination);

    const result = new PaginatedAuditLogEntity();
    result.items = items.map(toAuditLogEntity);
    result.meta = buildPaginationMeta(total, pagination.page, pagination.pageSize);
    return result;
  }

  // Fase 63 -- atualiza a manutencao e sincroniza Vehicle.status (ver
  // VehiclesService.syncStatusForMaintenance) na MESMA transacao: nunca um
  // estado intermediario onde a manutencao ja esta IN_PROGRESS mas o veiculo
  // ainda aparece disponivel (ou vice-versa). Fase 82 -- extraido para ser
  // reaproveitado por updateStatus (generico) e por todas as acoes dedicadas
  // do ciclo de vida da OS, nunca duplicado.
  private async applyStatusChange(
    tenantId: string,
    id: string,
    before: VehicleMaintenance,
    data: Prisma.VehicleMaintenanceUpdateInput,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<VehicleMaintenance> {
    const isCompleting = data.status === VehicleMaintenanceStatus.COMPLETED;

    const runTransaction = async (
      tx: Prisma.TransactionClient,
    ): Promise<VehicleMaintenance> => {
      const updated = await tx.vehicleMaintenance.update({ where: { id }, data });
      await this.vehiclesService.syncStatusForMaintenance(
        tenantId,
        updated.vehicleId,
        actor,
        metadata,
        tx,
      );
      // Fase 83 -- consumo de pecas do catalogo vinculadas a esta OS
      // (MaintenancePart.partId) SOMENTE ao concluir, na MESMA transacao: se
      // o estoque for insuficiente, a conclusao inteira e abortada (a OS nao
      // fica COMPLETED). Isolamento Serializable (mesmo utilitario da Fase
      // 48) evita 2 conclusoes concorrentes consumindo a mesma peca alem do
      // saldo disponivel.
      if (isCompleting) {
        await this.partsService.consumePartsForMaintenance(tenantId, id, actor, metadata, tx);
      }
      return updated;
    };

    const maintenance = isCompleting
      ? await runSerializable(this.prisma, runTransaction)
      : await this.prisma.$transaction(runTransaction);

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: resolveMaintenanceStatusChangeAction(before.status, maintenance.status),
      entityName: 'VehicleMaintenance',
      entityId: id,
      previousValue: { status: before.status },
      newValue: { status: maintenance.status },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return maintenance;
  }

  // Extraido de updateStatus (Fase 63) para ser reaproveitado pela acao
  // dedicada complete() (Fase 82) -- mesma validacao exata (data de conclusao
  // obrigatoria + custo total > 0), nunca duplicada.
  private buildCompletedData(
    before: VehicleMaintenance,
    completedAt?: string,
  ): Prisma.VehicleMaintenanceUpdateInput {
    const effectiveCompletedAt = completedAt ? new Date(completedAt) : before.completedAt;
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
    return { status: VehicleMaintenanceStatus.COMPLETED, completedAt: effectiveCompletedAt };
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

  private async findOwnedOrThrow(
    tenantId: string,
    id: string,
  ): Promise<
    VehicleMaintenance & {
      parts: MaintenancePart[];
      vehicle: { plate: string };
      workshopProvider: { name: string } | null;
      supplierProvider: { name: string } | null;
    }
  > {
    const maintenance = await this.prisma.vehicleMaintenance.findFirst({
      where: { id, tenantId },
      include: { parts: true, vehicle: { select: { plate: true } }, workshopProvider: { select: { name: true } }, supplierProvider: { select: { name: true } } },
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

  private async assertMaintenancePlanBelongsToTenant(tenantId: string, maintenancePlanId: string): Promise<void> {
    const plan = await this.prisma.maintenancePlan.findFirst({ where: { id: maintenancePlanId, tenantId } });
    if (!plan) {
      throw new NotFoundException('Plano de manutencao (maintenancePlanId) nao encontrado nesta empresa.');
    }
  }

  // Fase 45 -- quando `parts` e enviado, ele SEMPRE vence sobre um
  // `partsCost` enviado junto (nunca os dois divergindo): partsCost passa a
  // ser a soma calculada, nunca o valor solto do body. Sem `parts`, o
  // comportamento e o mesmo desde a Fase 13 (partsCost aceito diretamente).
  private resolvePartsCost(
    parts: MaintenancePartInputDto[] | undefined,
    fallbackPartsCost: number | undefined,
  ): { partsCost: number | undefined; partsItems: Prisma.MaintenancePartCreateWithoutMaintenanceInput[] | undefined } {
    if (parts === undefined) {
      return { partsCost: fallbackPartsCost, partsItems: undefined };
    }
    const partsItems = parts.map((part) => ({
      partId: part.partId,
      name: part.name,
      quantity: part.quantity,
      unitPrice: part.unitPrice,
      totalPrice: Math.round(part.quantity * part.unitPrice * 100) / 100,
    }));
    const partsCost = Math.round(partsItems.reduce((sum, item) => sum + item.totalPrice, 0) * 100) / 100;
    return { partsCost, partsItems };
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
