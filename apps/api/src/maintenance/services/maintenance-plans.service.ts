import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  MaintenancePlan,
  Prisma,
  VehicleMaintenanceStatus,
  VehicleMaintenanceType,
} from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import {
  evaluateMaintenancePlan,
  MaintenancePlanEvaluation,
} from '../../fleet-operations/utils/maintenance-plan-status.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMaintenancePlanDto } from '../dto/create-maintenance-plan.dto';
import { FindMaintenancePlanExecutionsQueryDto } from '../dto/find-maintenance-plan-executions-query.dto';
import { FindMaintenancePlansQueryDto } from '../dto/find-maintenance-plans-query.dto';
import { RegisterMaintenancePlanExecutionDto } from '../dto/register-maintenance-plan-execution.dto';
import { UpdateMaintenancePlanDto } from '../dto/update-maintenance-plan.dto';
import {
  MaintenancePlanExecutionEntity,
  PaginatedMaintenancePlanExecutionsEntity,
} from '../entities/maintenance-plan-execution.entity';
import { MaintenancePlanEntity } from '../entities/maintenance-plan.entity';
import { PaginatedMaintenancePlansEntity } from '../entities/paginated-maintenance-plans.entity';
import { MaintenancePlanLastExecution, toMaintenancePlanEntity } from '../mappers/maintenance-plan.mapper';

interface PlanEvaluationResult {
  evaluation: MaintenancePlanEvaluation;
  lastExecution: MaintenancePlanLastExecution | null;
}

// Fase 45 -- CRUD de planos de manutencao preventiva. Nao gera
// VehicleMaintenance sozinho -- so alimenta o calculo de vencidas/proximas
// em FleetOperationsMetricsService (que le MaintenancePlan + VehicleMaintenance
// em lote, nunca por plano).
@Injectable()
export class MaintenancePlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(tenantId: string, query: FindMaintenancePlansQueryDto): Promise<PaginatedMaintenancePlansEntity> {
    const where: Prisma.MaintenancePlanWhereInput = {
      tenantId,
      ...compact({ vehicleId: query.vehicleId, component: query.component, active: query.active }),
    };

    const [items, total] = await Promise.all([
      this.prisma.maintenancePlan.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.maintenancePlan.count({ where }),
    ]);

    const evaluations = await this.evaluatePlansInBatch(tenantId, items);
    const result = new PaginatedMaintenancePlansEntity();
    result.items = items.map((plan) => this.toEntity(plan, evaluations.get(plan.id)));
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<MaintenancePlanEntity> {
    const plan = await this.findOwnedOrThrow(tenantId, id);
    const evaluations = await this.evaluatePlansInBatch(tenantId, [plan]);
    return this.toEntity(plan, evaluations.get(plan.id));
  }

  private toEntity(plan: MaintenancePlan, result: PlanEvaluationResult | undefined): MaintenancePlanEntity {
    return toMaintenancePlanEntity(plan, result?.evaluation, result?.lastExecution ?? null);
  }

  // Fase 108 -- MESMO padrao de lote (nunca 1 query por plano) ja usado por
  // FleetOperationsMetricsService.computeMaintenancePlanStatus e por
  // NotificationsService.collectMaintenancePlansDue -- reaproveitado aqui
  // (nao duplicado) so para devolver a avaliacao junto das rotas de CRUD de
  // planos, fechando a lacuna real de "informacao operacional relevante no
  // veiculo/OS": ate aqui so o dashboard de frota mostrava vencidas/proximas.
  private async evaluatePlansInBatch(
    tenantId: string,
    plans: MaintenancePlan[],
  ): Promise<Map<string, PlanEvaluationResult>> {
    const result = new Map<string, PlanEvaluationResult>();
    if (plans.length === 0) return result;

    const planIds = plans.map((p) => p.id);
    const vehicleIds = [...new Set(plans.map((p) => p.vehicleId))];

    const [lastCompletedRows, vehicles] = await Promise.all([
      this.prisma.vehicleMaintenance.findMany({
        where: { tenantId, maintenancePlanId: { in: planIds }, status: VehicleMaintenanceStatus.COMPLETED },
        select: { maintenancePlanId: true, completedAt: true, odometerKm: true },
        orderBy: { completedAt: 'desc' },
      }),
      this.prisma.vehicle.findMany({ where: { id: { in: vehicleIds } }, select: { id: true, odometerKm: true } }),
    ]);

    const lastByPlan = new Map<string, { completedAt: Date | null; odometerKm: number | null }>();
    for (const row of lastCompletedRows) {
      if (!row.maintenancePlanId || lastByPlan.has(row.maintenancePlanId)) continue;
      lastByPlan.set(row.maintenancePlanId, { completedAt: row.completedAt, odometerKm: toNumberOrNull(row.odometerKm) });
    }
    const odometerByVehicle = new Map(vehicles.map((v) => [v.id, toNumberOrNull(v.odometerKm)]));

    const now = new Date();
    for (const plan of plans) {
      const last = lastByPlan.get(plan.id) ?? null;
      const evaluation = evaluateMaintenancePlan(
        { intervalKm: plan.intervalKm, intervalDays: plan.intervalDays, alertBeforeKm: plan.alertBeforeKm, alertBeforeDays: plan.alertBeforeDays },
        last,
        odometerByVehicle.get(plan.vehicleId) ?? null,
        now,
      );
      result.set(plan.id, {
        evaluation,
        lastExecution: last ? { executedAt: last.completedAt, odometerKm: last.odometerKm } : null,
      });
    }
    return result;
  }

  async create(
    tenantId: string,
    dto: CreateMaintenancePlanDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<MaintenancePlanEntity> {
    await this.assertVehicleExists(tenantId, dto.vehicleId);
    this.assertHasAtLeastOneInterval(dto.intervalKm, dto.intervalDays, dto.intervalHours);

    const plan = await this.prisma.maintenancePlan.create({
      data: {
        tenantId,
        vehicleId: dto.vehicleId,
        name: dto.name,
        component: dto.component,
        ...compact({
          maintenanceType: dto.maintenanceType,
          intervalKm: dto.intervalKm,
          intervalDays: dto.intervalDays,
          intervalHours: dto.intervalHours,
          alertBeforeKm: dto.alertBeforeKm,
          alertBeforeDays: dto.alertBeforeDays,
          active: dto.active,
          notes: dto.notes,
        }),
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'maintenance_plan.created',
      entityName: 'MaintenancePlan',
      entityId: plan.id,
      newValue: toJsonSafe({ vehicleId: plan.vehicleId, component: plan.component, name: plan.name }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toMaintenancePlanEntity(plan);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateMaintenancePlanDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<MaintenancePlanEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    if (dto.vehicleId && dto.vehicleId !== before.vehicleId) {
      await this.assertVehicleExists(tenantId, dto.vehicleId);
    }

    const effectiveIntervalKm = dto.intervalKm ?? before.intervalKm ?? undefined;
    const effectiveIntervalDays = dto.intervalDays ?? before.intervalDays ?? undefined;
    const effectiveIntervalHours = dto.intervalHours ?? before.intervalHours ?? undefined;
    this.assertHasAtLeastOneInterval(effectiveIntervalKm, effectiveIntervalDays, effectiveIntervalHours);

    const plan = await this.prisma.maintenancePlan.update({
      where: { id },
      data: compact({
        vehicleId: dto.vehicleId,
        name: dto.name,
        component: dto.component,
        maintenanceType: dto.maintenanceType,
        intervalKm: dto.intervalKm,
        intervalDays: dto.intervalDays,
        intervalHours: dto.intervalHours,
        alertBeforeKm: dto.alertBeforeKm,
        alertBeforeDays: dto.alertBeforeDays,
        active: dto.active,
        notes: dto.notes,
      }),
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'maintenance_plan.updated',
      entityName: 'MaintenancePlan',
      entityId: id,
      previousValue: toJsonSafe(before),
      newValue: toJsonSafe(plan),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    const evaluations = await this.evaluatePlansInBatch(tenantId, [plan]);
    return this.toEntity(plan, evaluations.get(plan.id));
  }

  // Fase 81 -- "registrar execucao": grava que o servico preventivo foi
  // FEITO, como uma VehicleMaintenance COMPLETED vinculada ao plano
  // (maintenancePlanId). Reaproveita o historico ja existente -- NENHUMA
  // tabela nova, NENHUMA OS aberta (nunca status OPEN, nunca aciona
  // VehiclesService.syncStatusForMaintenance -> Vehicle.status intocado),
  // NENHUMA alteracao no odometro real do veiculo. Append-only: cada
  // execucao e uma linha nova; as anteriores permanecem. O proximo
  // vencimento e recalculado automaticamente (evaluateMaintenancePlan ja le
  // a VehicleMaintenance COMPLETED mais recente vinculada).
  async registerExecution(
    tenantId: string,
    planId: string,
    dto: RegisterMaintenancePlanExecutionDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<MaintenancePlanEntity> {
    const plan = await this.findOwnedOrThrow(tenantId, planId);
    const executedAt = dto.executedAt ? new Date(dto.executedAt) : new Date();

    const execution = await this.prisma.vehicleMaintenance.create({
      data: {
        tenantId,
        vehicleId: plan.vehicleId,
        type: VehicleMaintenanceType.PREVENTIVE,
        status: VehicleMaintenanceStatus.COMPLETED,
        component: plan.component,
        maintenancePlanId: plan.id,
        openedAt: executedAt,
        completedAt: executedAt,
        description: plan.name,
        ...compact({ odometerKm: dto.odometerKm, notes: dto.notes }),
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'maintenance_plan.execution_registered',
      entityName: 'MaintenancePlan',
      entityId: plan.id,
      newValue: toJsonSafe({
        executionId: execution.id,
        executedAt: execution.completedAt,
        odometerKm: toNumberOrNull(execution.odometerKm),
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    const evaluations = await this.evaluatePlansInBatch(tenantId, [plan]);
    return this.toEntity(plan, evaluations.get(plan.id));
  }

  // Fase 81 -- historico (append-only) de execucoes do plano: as
  // VehicleMaintenance COMPLETED vinculadas por maintenancePlanId. Projecao
  // SOMENTE-LEITURA, sem tabela nova.
  async findExecutions(
    tenantId: string,
    planId: string,
    query: FindMaintenancePlanExecutionsQueryDto,
  ): Promise<PaginatedMaintenancePlanExecutionsEntity> {
    await this.findOwnedOrThrow(tenantId, planId);

    const where: Prisma.VehicleMaintenanceWhereInput = {
      tenantId,
      maintenancePlanId: planId,
      status: VehicleMaintenanceStatus.COMPLETED,
    };
    const [rows, total] = await Promise.all([
      this.prisma.vehicleMaintenance.findMany({
        where,
        orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          maintenancePlanId: true,
          vehicleId: true,
          component: true,
          completedAt: true,
          odometerKm: true,
          notes: true,
          createdAt: true,
        },
      }),
      this.prisma.vehicleMaintenance.count({ where }),
    ]);

    const result = new PaginatedMaintenancePlanExecutionsEntity();
    result.items = rows.map((row) => {
      const entity = new MaintenancePlanExecutionEntity();
      entity.id = row.id;
      entity.maintenancePlanId = row.maintenancePlanId as string;
      entity.vehicleId = row.vehicleId;
      entity.component = row.component;
      entity.executedAt = row.completedAt;
      entity.odometerKm = toNumberOrNull(row.odometerKm);
      entity.notes = row.notes;
      entity.createdAt = row.createdAt;
      return entity;
    });
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async remove(tenantId: string, id: string, actor: AuditActor, metadata: RequestMetadata): Promise<void> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    const linkedRecordsCount = await this.prisma.vehicleMaintenance.count({ where: { tenantId, maintenancePlanId: id } });
    if (linkedRecordsCount > 0) {
      throw new ConflictException(
        `Nao e possivel excluir este plano: existem ${linkedRecordsCount} manutencao(oes) vinculada(s) a ele.`,
      );
    }

    await this.prisma.maintenancePlan.delete({ where: { id } });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'maintenance_plan.deleted',
      entityName: 'MaintenancePlan',
      entityId: id,
      previousValue: toJsonSafe({ vehicleId: before.vehicleId, component: before.component, name: before.name }),
      newValue: null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  private async findOwnedOrThrow(tenantId: string, id: string): Promise<MaintenancePlan> {
    const plan = await this.prisma.maintenancePlan.findFirst({ where: { id, tenantId } });
    if (!plan) {
      throw new NotFoundException('Plano de manutencao nao encontrado nesta empresa.');
    }
    return plan;
  }

  private async assertVehicleExists(tenantId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, tenantId, deletedAt: null } });
    if (!vehicle) {
      throw new NotFoundException('Veiculo nao encontrado nesta empresa.');
    }
  }

  // Um plano sem NENHUM criterio de vencimento nunca poderia gerar
  // MAINTENANCE_OVERDUE/MAINTENANCE_DUE_SOON -- rejeitado na origem, nunca
  // um plano "morto" salvo silenciosamente.
  private assertHasAtLeastOneInterval(
    intervalKm: number | undefined,
    intervalDays: number | undefined,
    intervalHours: number | undefined,
  ): void {
    if (intervalKm === undefined && intervalDays === undefined && intervalHours === undefined) {
      throw new BadRequestException(
        'Informe ao menos um intervalo de recorrencia (intervalKm, intervalDays ou intervalHours).',
      );
    }
  }
}
