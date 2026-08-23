import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AlertSeverity,
  DriverStatus,
  FiscalDocumentStatus,
  FiscalDocumentType,
  Notification,
  NotificationType,
  Prisma,
  TripBillingStatus,
  TripStatus,
  TripOccurrenceSeverity,
  VehicleMaintenanceStatus,
  VehicleStatus,
} from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { compact } from '../../common/utils/compact.util';
import { detectOdometerRegression } from '../../common/utils/fuel-consumption.util';
import { PrismaService } from '../../prisma/prisma.service';
import { NEAR_REPLACEMENT_THRESHOLD_MM } from '../../tires/services/tires.service';
import { FindNotificationsQueryDto } from '../dto/find-notifications-query.dto';
import { NotificationEntity, PaginatedNotificationsEntity, UnreadNotificationCountEntity } from '../entities/notification.entity';
import { toNotificationEntity } from '../mappers/notification.mapper';
import { collectRolesNeeded, groupRecipientsByType } from '../utils/notification-recipients.util';

// Viagens ainda nao encerradas -- mesmo criterio de NON_TERMINAL_TRIP_STATUSES
// em FleetOperationsMetricsService (nao exportado de la, redefinido aqui:
// e um array pequeno, nao vale acoplar os 2 modulos so por isso).
const NON_TERMINAL_TRIP_STATUSES: TripStatus[] = [
  TripStatus.PLANNED,
  TripStatus.WAITING_DRIVER,
  TripStatus.WAITING_DEPARTURE,
  TripStatus.IN_PROGRESS,
  TripStatus.PAUSED,
];

const OPEN_MAINTENANCE_STATUSES_EXCLUDED: VehicleMaintenanceStatus[] = [
  VehicleMaintenanceStatus.COMPLETED,
  VehicleMaintenanceStatus.CANCELLED,
];

interface NotificationCandidate {
  type: NotificationType;
  severity: AlertSeverity;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  // Fase 70 -- destinatario ESPECIFICO desta condicao (ex: o motorista
  // dono da viagem), alem do grupo por role de NOTIFICATION_RECIPIENT_ROLES.
  // Nunca "todos os motoristas" -- so quem tem relacao real com a origem.
  directRecipientIds?: string[];
}

// Fase 69 -- Centro de Alertas e Notificacoes. Transforma condicoes JA
// detectadas em outros dominios (mesmas fontes de FleetAlert/TripOccurrence/
// Vehicle/etc, nunca uma segunda logica de deteccao) em Notification
// persistida, lida/nao-lida por usuario. Idempotente via
// createMany({skipDuplicates:true}) contra o unique constraint do schema
// (tenantId+recipientId+type+entityType+entityId) -- nunca um "findFirst
// then create" por notificacao (evita N+1 na geracao); seguro contra 2
// execucoes simultaneas do job (a constraint de banco e a barreira final,
// nunca um "if (!exists) create()" em memoria).
//
// Fase 70 -- a geracao NAO acontece mais no caminho sincrono de
// findAllForUser/getUnreadCount (GET /notifications e GET /notifications/
// unread-count agora sao leitura pura). Passa a ser responsabilidade de
// processAllTenants() (chamado pelo NotificationsProcessingScheduler a
// cada NOTIFICATIONS_PROCESS_CRON, ver notifications-processing.scheduler.ts)
// e do endpoint administrativo POST /notifications/process (trigger manual
// tenant-scoped, usado por operacao/testes -- nunca dispara um scan
// global a partir de uma requisicao HTTP).
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAllForUser(tenantId: string, userId: string, query: FindNotificationsQueryDto): Promise<PaginatedNotificationsEntity> {
    const where = this.buildWhere(tenantId, userId, query);
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);

    const result = new PaginatedNotificationsEntity();
    result.items = items.map(toNotificationEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  // Fase 70 -- leitura pura (secao 12 do pedido): nunca dispara geracao.
  // 2 counts com o indice (recipientId, readAt) ja existente -- rapido,
  // independente do numero de coletores/condicoes do tenant.
  async getUnreadCount(tenantId: string, userId: string): Promise<UnreadNotificationCountEntity> {
    const [total, critical] = await Promise.all([
      this.prisma.notification.count({ where: { tenantId, recipientId: userId, readAt: null } }),
      this.prisma.notification.count({
        where: { tenantId, recipientId: userId, readAt: null, severity: AlertSeverity.CRITICAL },
      }),
    ]);

    const entity = new UnreadNotificationCountEntity();
    entity.total = total;
    entity.critical = critical;
    return entity;
  }

  async findOne(tenantId: string, userId: string, id: string): Promise<NotificationEntity> {
    return toNotificationEntity(await this.findOwnedOrThrow(tenantId, userId, id));
  }

  // PATCH /notifications/:id/read -- idempotente (ler 2x nunca sobrescreve
  // readAt com um instante mais novo).
  async markRead(tenantId: string, userId: string, id: string, actor: AuditActor, metadata: RequestMetadata): Promise<NotificationEntity> {
    const before = await this.findOwnedOrThrow(tenantId, userId, id);
    if (before.readAt) {
      return toNotificationEntity(before);
    }

    const updated = await this.prisma.notification.update({
      where: { id: before.id },
      data: { readAt: new Date() },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'notification.read',
      entityName: 'Notification',
      entityId: updated.id,
      newValue: { readAt: updated.readAt },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toNotificationEntity(updated);
  }

  // PATCH /notifications/read-all -- idempotente (repetir so afeta as que
  // ainda estiverem nao lidas; nunca gera inconsistencia).
  async markAllRead(tenantId: string, userId: string, actor: AuditActor, metadata: RequestMetadata): Promise<{ count: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { tenantId, recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'notification.read_all',
      entityName: 'Notification',
      entityId: userId,
      newValue: { count: result.count },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return { count: result.count };
  }

  private buildWhere(tenantId: string, userId: string, query: FindNotificationsQueryDto): Prisma.NotificationWhereInput {
    const dateRange = compact({
      gte: query.from ? new Date(query.from) : undefined,
      lte: query.to ? new Date(`${query.to}T23:59:59.999Z`) : undefined,
    });

    let readFilter: Prisma.NotificationWhereInput = {};
    if (query.unread === 'true') readFilter = { readAt: null };
    else if (query.unread === 'false') readFilter = { readAt: { not: null } };

    return {
      tenantId,
      recipientId: userId,
      ...compact({
        type: query.type,
        severity: query.severity,
        entityType: query.entityType,
        createdAt: Object.keys(dateRange).length > 0 ? dateRange : undefined,
      }),
      ...readFilter,
    };
  }

  private async findOwnedOrThrow(tenantId: string, userId: string, id: string): Promise<Notification> {
    // recipientId = userId: um usuario NUNCA acessa notificacao de outro,
    // nem trocando o id na URL (secao 7 do pedido) -- garantido no proprio
    // WHERE, nao so no RBAC de rota.
    const notification = await this.prisma.notification.findFirst({ where: { id, tenantId, recipientId: userId } });
    if (!notification) {
      throw new NotFoundException('Notificacao nao encontrada.');
    }
    return notification;
  }

  // ==========================================================================
  // GERACAO (secao 5 da Fase 69, secao 9-11 da Fase 70)
  // ==========================================================================

  // Fase 70 -- entrada usada pelo job agendado (NotificationsProcessingScheduler,
  // 1x por NOTIFICATIONS_PROCESS_CRON). Itera tenants ATIVOS sequencialmente
  // (nunca em paralelo -- mesmo principio de TollDataSyncScheduler: evita
  // sobrecarregar o pool de conexoes do banco) e reaproveita EXATAMENTE
  // processTenant por tenant (nenhuma segunda logica de geracao). O numero
  // de queries cresce com o numero de TENANTS (esperado, e um job de
  // background varrendo toda a base), nunca com o numero de
  // condicoes/notificacoes/destinatarios DENTRO de um tenant (ver
  // processTenant, que continua O(1) nisso).
  async processAllTenants(): Promise<{ tenantsProcessed: number; notificationsCreated: number }> {
    const tenants = await this.prisma.tenant.findMany({ where: { isActive: true }, select: { id: true } });

    let notificationsCreated = 0;
    for (const tenant of tenants) {
      try {
        notificationsCreated += await this.processTenant(tenant.id);
      } catch (error) {
        this.logger.error(
          `Processamento de notificacoes falhou para o tenant ${tenant.id}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
    return { tenantsProcessed: tenants.length, notificationsCreated };
  }

  // Fase 70 -- gera as notificacoes de UM tenant (usado pelo job E pelo
  // trigger manual POST /notifications/process). Idempotente e seguro
  // contra execucao concorrente: a UNICA barreira real e o unique
  // constraint do banco (createMany + skipDuplicates), nunca um
  // "findFirst then create" -- 2 chamadas simultaneas para o MESMO tenant
  // no maximo tentam inserir as mesmas linhas 2x, o banco descarta as
  // duplicatas silenciosamente.
  async processTenant(tenantId: string): Promise<number> {
    const candidates = await this.collectCandidates(tenantId);
    if (candidates.length === 0) return 0;

    const typesPresent = [...new Set(candidates.map((c) => c.type))];
    const recipientsByRole = await this.resolveRecipients(tenantId, typesPresent);

    const rows: Prisma.NotificationCreateManyInput[] = [];
    for (const candidate of candidates) {
      const roleRecipients = recipientsByRole.get(candidate.type) ?? [];
      const recipients = new Set([...roleRecipients, ...(candidate.directRecipientIds ?? [])]);
      for (const recipientId of recipients) {
        rows.push({
          tenantId,
          recipientId,
          type: candidate.type,
          title: candidate.title,
          message: candidate.message,
          severity: candidate.severity,
          entityType: candidate.entityType,
          entityId: candidate.entityId,
          metadata: (candidate.metadata as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        });
      }
    }
    if (rows.length === 0) return 0;

    // Idempotente: o unique constraint (tenantId+recipientId+type+
    // entityType+entityId) garante que reprocessar a MESMA condicao nunca
    // cria uma segunda notificacao logica -- 1 unico INSERT em lote, nunca
    // 1 query por notificacao.
    const result = await this.prisma.notification.createMany({ data: rows, skipDuplicates: true });
    return result.count;
  }

  // 1 query por role presente entre os tipos candidatos (nunca 1 por
  // candidato/notificacao) -- agrupado em memoria por tipo depois.
  private async resolveRecipients(tenantId: string, types: NotificationType[]): Promise<Map<NotificationType, string[]>> {
    const rolesNeeded = collectRolesNeeded(types);
    if (rolesNeeded.length === 0) return new Map();

    const users = await this.prisma.userAccount.findMany({
      where: { tenantId, isActive: true, deletedAt: null, role: { in: rolesNeeded } },
      select: { id: true, role: true },
    });

    return groupRecipientsByType(users, types);
  }

  private async collectCandidates(tenantId: string): Promise<NotificationCandidate[]> {
    const [
      occurrences,
      unavailableVehicles,
      overdueMaintenances,
      nearReplacementTires,
      odometerRegressions,
      fiscalProblems,
      delayedTrips,
      suspendedDrivers,
      inactiveDrivers,
      pendingBillings,
      deliveryProofPending,
      deliveryProofProblem,
    ] = await Promise.all([
      this.collectCriticalOccurrences(tenantId),
      this.collectVehicleUnavailable(tenantId),
      this.collectVehicleMaintenance(tenantId),
      this.collectTireNearReplacement(tenantId),
      this.collectFuelOdometerRegression(tenantId),
      this.collectFiscalDocumentProblems(tenantId),
      this.collectTripDelayed(tenantId),
      this.collectDriverByStatus(tenantId, DriverStatus.SUSPENDED, 'DRIVER_SUSPENDED'),
      this.collectDriverByStatus(tenantId, DriverStatus.INACTIVE, 'DRIVER_INACTIVE'),
      this.collectBillingPending(tenantId),
      this.collectDeliveryProofPending(tenantId),
      this.collectDeliveryProofProblem(tenantId),
    ]);

    return [
      ...occurrences,
      ...unavailableVehicles,
      ...overdueMaintenances,
      ...nearReplacementTires,
      ...odometerRegressions,
      ...fiscalProblems,
      ...delayedTrips,
      ...suspendedDrivers,
      ...inactiveDrivers,
      ...pendingBillings,
      ...deliveryProofPending,
      ...deliveryProofProblem,
    ];
  }

  // Fase 70 -- reaproveita EXATAMENTE a classificacao de
  // trip-compliance.util.ts (DeliveryProofStatus.PENDING = comprovante JA
  // enviado, aguardando revisao -- nunca "ausente"; a Fase 54 documenta que
  // nao ha regra de obrigatoriedade configurada, entao "ausencia" nunca
  // vira notificacao aqui, so o que ja e um dado real e objetivo:
  // FiscalDocument.status=PENDING de um DELIVERY_PROOF ja submetido).
  // Destinatario inclui o motorista da propria viagem (direto, nunca
  // "todos os motoristas") alem do grupo operacional por role.
  private async collectDeliveryProofPending(tenantId: string): Promise<NotificationCandidate[]> {
    const rows = await this.prisma.fiscalDocument.findMany({
      where: { tenantId, documentType: FiscalDocumentType.DELIVERY_PROOF, status: FiscalDocumentStatus.PENDING, tripId: { not: null } },
      select: {
        id: true,
        tripId: true,
        trip: {
          select: {
            driver: { select: { userAccountId: true, isActive: true } },
            origin: { select: { name: true } },
            destination: { select: { name: true } },
          },
        },
      },
    });
    return rows
      .filter((row): row is typeof row & { tripId: string; trip: NonNullable<(typeof row)['trip']> } => row.tripId !== null && row.trip !== null)
      .map((row) => ({
        type: NotificationType.DELIVERY_PROOF_PENDING,
        severity: AlertSeverity.MEDIUM,
        title: 'Comprovante de entrega aguardando revisão',
        message: `Comprovante de entrega da viagem ${row.trip.origin.name} → ${row.trip.destination.name} foi enviado e aguarda revisão.`,
        entityType: 'FiscalDocument',
        entityId: row.id,
        metadata: { tripId: row.tripId },
        directRecipientIds: this.directRecipientFromDriver(row.trip.driver),
      }));
  }

  // Reaproveita a mesma classificacao PROBLEMATIC de computeDeliveryProofStatus
  // (invalidCount>0 || cancelledCount>0), so no campo ja persistido
  // FiscalDocument.status -- mesma simplificacao ja documentada para
  // FISCAL_DOCUMENT_PROBLEM (nunca recomputa classifyFiscalDocumentIssues
  // tenant-wide, custo desproporcional para um job periodico).
  private async collectDeliveryProofProblem(tenantId: string): Promise<NotificationCandidate[]> {
    const rows = await this.prisma.fiscalDocument.findMany({
      where: {
        tenantId,
        documentType: FiscalDocumentType.DELIVERY_PROOF,
        status: { in: [FiscalDocumentStatus.INVALID, FiscalDocumentStatus.CANCELLED] },
        tripId: { not: null },
      },
      select: {
        id: true,
        tripId: true,
        status: true,
        trip: {
          select: {
            driver: { select: { userAccountId: true, isActive: true } },
            origin: { select: { name: true } },
            destination: { select: { name: true } },
          },
        },
      },
    });
    return rows
      .filter((row): row is typeof row & { tripId: string; trip: NonNullable<(typeof row)['trip']> } => row.tripId !== null && row.trip !== null)
      .map((row) => ({
        type: NotificationType.DELIVERY_PROOF_PROBLEM,
        severity: AlertSeverity.HIGH,
        title: 'Comprovante de entrega com problema',
        message: `Comprovante de entrega da viagem ${row.trip.origin.name} → ${row.trip.destination.name} está ${
          row.status === FiscalDocumentStatus.CANCELLED ? 'cancelado' : 'inválido'
        }.`,
        entityType: 'FiscalDocument',
        entityId: row.id,
        metadata: { tripId: row.tripId },
        directRecipientIds: this.directRecipientFromDriver(row.trip.driver),
      }));
  }

  // Motorista so entra como destinatario DIRETO quando o vinculo com o
  // app existe e esta ativo (mesmo criterio do DriverGuard: driver.isActive
  // + userAccountId presente) -- nunca notifica um motorista sem login no
  // app ou desativado.
  private directRecipientFromDriver(driver: { userAccountId: string | null; isActive: boolean } | null): string[] {
    return driver?.userAccountId && driver.isActive ? [driver.userAccountId] : [];
  }

  // Mesma condicao de TRIP_OCCURRENCE_CRITICAL (FleetOperationsMetricsService.
  // computeAlerts): severity=CRITICAL, status OPEN (resolvedAt/cancelledAt
  // nulos) -- nunca uma segunda deteccao.
  private async collectCriticalOccurrences(tenantId: string): Promise<NotificationCandidate[]> {
    const rows = await this.prisma.tripOccurrence.findMany({
      where: { tenantId, severity: TripOccurrenceSeverity.CRITICAL, resolvedAt: null, cancelledAt: null },
      select: { id: true, type: true, tripId: true, description: true },
    });
    return rows.map((row) => ({
      type: NotificationType.CRITICAL_OCCURRENCE,
      severity: AlertSeverity.CRITICAL,
      title: `Ocorrência crítica: ${row.type}`,
      message: row.description,
      entityType: 'TripOccurrence',
      entityId: row.id,
      metadata: { tripId: row.tripId },
    }));
  }

  private async collectVehicleUnavailable(tenantId: string): Promise<NotificationCandidate[]> {
    const rows = await this.prisma.vehicle.findMany({
      where: { tenantId, deletedAt: null, status: { in: [VehicleStatus.SUSPENDED, VehicleStatus.MAINTENANCE] } },
      select: { id: true, plate: true, status: true },
    });
    return rows.map((row) => ({
      type: NotificationType.VEHICLE_UNAVAILABLE,
      severity: AlertSeverity.HIGH,
      title: `Veículo indisponível: ${row.plate}`,
      message: `Veículo ${row.plate} está ${row.status === VehicleStatus.SUSPENDED ? 'suspenso' : 'em manutenção'} e indisponível para operar.`,
      entityType: 'Vehicle',
      entityId: row.id,
    }));
  }

  // Mesma condicao de VEHICLE_MAINTENANCE_OVERDUE (VehicleOverviewService):
  // status em aberto E scheduledAt no passado.
  private async collectVehicleMaintenance(tenantId: string): Promise<NotificationCandidate[]> {
    const rows = await this.prisma.vehicleMaintenance.findMany({
      where: {
        tenantId,
        status: { notIn: OPEN_MAINTENANCE_STATUSES_EXCLUDED },
        scheduledAt: { lte: new Date() },
      },
      select: { id: true, vehicleId: true, component: true, vehicle: { select: { plate: true } } },
    });
    return rows.map((row) => ({
      type: NotificationType.VEHICLE_MAINTENANCE,
      severity: AlertSeverity.HIGH,
      title: `Manutenção atrasada: ${row.vehicle.plate}`,
      message: `Manutenção do componente ${row.component} está com a data programada vencida.`,
      entityType: 'VehicleMaintenance',
      entityId: row.id,
      metadata: { vehicleId: row.vehicleId },
    }));
  }

  private async collectTireNearReplacement(tenantId: string): Promise<NotificationCandidate[]> {
    const rows = await this.prisma.tire.findMany({
      where: { tenantId, currentTreadDepthMm: { lte: NEAR_REPLACEMENT_THRESHOLD_MM }, vehicleId: { not: null } },
      select: { id: true, fireNumber: true, vehicleId: true, vehicle: { select: { plate: true } } },
    });
    return rows.map((row) => ({
      type: NotificationType.TIRE_NEAR_REPLACEMENT,
      severity: AlertSeverity.MEDIUM,
      title: `Pneu próximo da troca: ${row.fireNumber}`,
      message: `Pneu ${row.fireNumber} do veículo ${row.vehicle?.plate ?? '—'} está com sulco próximo do limite de troca.`,
      entityType: 'Tire',
      entityId: row.id,
      metadata: { vehicleId: row.vehicleId },
    }));
  }

  // Mesma deteccao de ODOMETER_REGRESSION (detectOdometerRegression, ja
  // usada pelo dashboard de frota/overview do veiculo) -- agrupa os
  // abastecimentos do tenant por veiculo em memoria (1 query, nunca 1 por
  // veiculo) e roda a MESMA funcao pura.
  private async collectFuelOdometerRegression(tenantId: string): Promise<NotificationCandidate[]> {
    const rows = await this.prisma.fuelSupply.findMany({
      where: { tenantId },
      select: { id: true, vehicleId: true, supplyDate: true, odometerKm: true, vehicle: { select: { plate: true } } },
    });

    const byVehicle = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byVehicle.get(row.vehicleId) ?? [];
      list.push(row);
      byVehicle.set(row.vehicleId, list);
    }

    const candidates: NotificationCandidate[] = [];
    for (const [vehicleId, supplies] of byVehicle) {
      const regressions = detectOdometerRegression(
        supplies.map((s) => ({ id: s.id, supplyDate: s.supplyDate, odometerKm: Number(s.odometerKm) })),
      );
      const plate = supplies[0]?.vehicle.plate ?? '—';
      for (const regression of regressions) {
        candidates.push({
          type: NotificationType.FUEL_ODOMETER_REGRESSION,
          severity: AlertSeverity.HIGH,
          title: `Hodômetro regressivo: ${plate}`,
          message: `Abastecimento com hodômetro (${regression.currentOdometerKm} km) menor que o anterior (${regression.previousOdometerKm} km).`,
          entityType: 'FuelSupply',
          entityId: regression.currentId,
          metadata: { vehicleId },
        });
      }
    }
    return candidates;
  }

  // Simplificacao deliberada (ver docs/notifications.md): "problema fiscal"
  // = documento com status=INVALID (campo real ja persistido), nunca a
  // recomputacao completa de classifyFiscalDocumentIssues tenant-wide (isso
  // exigiria reprocessar a validacao estrutural de TODOS os documentos a
  // cada geracao -- fora do minimo necessario desta fase).
  private async collectFiscalDocumentProblems(tenantId: string): Promise<NotificationCandidate[]> {
    const rows = await this.prisma.fiscalDocument.findMany({
      where: { tenantId, status: FiscalDocumentStatus.INVALID },
      select: { id: true, documentType: true, documentNumber: true, tripId: true },
    });
    return rows.map((row) => ({
      type: NotificationType.FISCAL_DOCUMENT_PROBLEM,
      severity: AlertSeverity.HIGH,
      title: `Documento fiscal inválido: ${row.documentType}`,
      message: `Documento ${row.documentType}${row.documentNumber ? ` nº ${row.documentNumber}` : ''} está marcado como inválido.`,
      entityType: 'FiscalDocument',
      entityId: row.id,
      ...(row.tripId ? { metadata: { tripId: row.tripId } } : {}),
    }));
  }

  // Mesma condicao do KPI "delayedTrips" (FleetOperationalIndicatorsEntity):
  // ainda nao terminada e plannedArrival no passado.
  private async collectTripDelayed(tenantId: string): Promise<NotificationCandidate[]> {
    const rows = await this.prisma.trip.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: { in: NON_TERMINAL_TRIP_STATUSES },
        plannedArrival: { lt: new Date() },
      },
      select: { id: true, origin: { select: { name: true } }, destination: { select: { name: true } } },
    });
    return rows.map((row) => ({
      type: NotificationType.TRIP_DELAYED,
      severity: AlertSeverity.MEDIUM,
      title: 'Viagem atrasada',
      message: `Viagem ${row.origin.name} → ${row.destination.name} passou da chegada planejada e ainda não foi concluída.`,
      entityType: 'Trip',
      entityId: row.id,
    }));
  }

  private async collectDriverByStatus(
    tenantId: string,
    status: DriverStatus,
    type: 'DRIVER_SUSPENDED' | 'DRIVER_INACTIVE',
  ): Promise<NotificationCandidate[]> {
    const rows = await this.prisma.driver.findMany({
      where: { tenantId, deletedAt: null, status },
      select: { id: true, name: true },
    });
    return rows.map((row) => ({
      type: NotificationType[type],
      severity: type === 'DRIVER_SUSPENDED' ? AlertSeverity.HIGH : AlertSeverity.MEDIUM,
      title: `Motorista ${type === 'DRIVER_SUSPENDED' ? 'suspenso' : 'inativo'}: ${row.name}`,
      message: `Motorista ${row.name} está com status ${status}.`,
      entityType: 'Driver',
      entityId: row.id,
    }));
  }

  // "Pendente" = mesmo criterio de BillingDashboardEntity.pendingCount
  // (READY ou PARTIALLY_INVOICED) -- nunca uma segunda regra.
  private async collectBillingPending(tenantId: string): Promise<NotificationCandidate[]> {
    const rows = await this.prisma.tripBilling.findMany({
      where: { tenantId, status: { in: [TripBillingStatus.READY, TripBillingStatus.PARTIALLY_INVOICED] } },
      select: { id: true, tripId: true, billableAmount: true },
    });
    return rows.map((row) => ({
      type: NotificationType.BILLING_PENDING,
      severity: AlertSeverity.MEDIUM,
      title: 'Faturamento pendente',
      message: `Viagem com valor faturável de R$ ${Number(row.billableAmount).toFixed(2)} aguardando faturamento.`,
      entityType: 'TripBilling',
      entityId: row.id,
      metadata: { tripId: row.tripId },
    }));
  }
}
