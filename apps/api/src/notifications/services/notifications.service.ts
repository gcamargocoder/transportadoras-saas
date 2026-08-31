import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AlertSeverity,
  ChecklistExecutionStatus,
  ContractStatus,
  DriverStatus,
  FiscalDocumentStatus,
  FiscalDocumentType,
  Notification,
  NotificationType,
  Prisma,
  TenantModule,
  TireLocationType,
  TollDataProvider,
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
import { hasCriticalNonConformity } from '../../checklists/utils/checklist-non-conformity.util';
import { NOTIFICATION_RECIPIENT_ROLES } from '../constants/notification-recipient-roles.constants';
import { compact } from '../../common/utils/compact.util';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { detectOdometerRegression } from '../../common/utils/fuel-consumption.util';
import { resolveDocumentExpiryStatus } from '../../fleet/utils/document-expiry.util';
import { evaluateMaintenancePlan } from '../../fleet-operations/utils/maintenance-plan-status.util';
import { PrismaService } from '../../prisma/prisma.service';
import { NEAR_REPLACEMENT_LIFESPAN_USED_PERCENT, NEAR_REPLACEMENT_THRESHOLD_MM } from '../../tires/services/tires.service';
import { computeTireDistanceLifespan } from '../../tires/utils/tire-lifecycle.util';
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

// Fase 111 -- ver collectChecklistCriticalNonConformity: janela deliberada
// (distinta dos demais coletores de evento, sem limite de data) porque
// ChecklistExecution cresce sem teto por viagem.
const CHECKLIST_NOTIFICATION_WINDOW_DAYS = 7;

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

  // ==========================================================================
  // ALERTAS DE SINCRONIZACAO (Fase "Alertas de sincronizacao") -- diferente
  // do restante deste arquivo (condicoes varridas periodicamente por tenant
  // via collectCandidates/processTenant), estes 2 metodos sao chamados
  // DIRETAMENTE por TollDataSyncService ao final de cada execucao de
  // sincronizacao (evento, nao scan) -- TollPlaza/TollRate/TollDataSource
  // sao dado GLOBAL (sem tenantId), entao "alertar a transportadora"
  // significa: toda transportadora ATIVA com o modulo TOLLS habilitado,
  // destinatario = NOTIFICATION_RECIPIENT_ROLES.TOLL_DATA_SYNC_FAILURE
  // (SUPER_ADMIN, unico role com acao real sobre isso).
  // ==========================================================================

  // Chamado quando um provider acumula falhas consecutivas (ver
  // TollDataSyncService -- o "retry antes do alerta" e o proprio
  // agendamento diario: nunca alerta na 1a falha isolada). Nunca duplica
  // enquanto o MESMO episodio de falha continua (verifica se ja existe uma
  // notificacao NAO LIDA para esta fonte antes de criar) -- por isso nunca
  // 1 notificacao por dia durante toda uma indisponibilidade prolongada.
  async notifyTollDataSyncFailure(params: {
    sourceId: string;
    provider: TollDataProvider;
    sourceName: string;
    runId: string;
    errorMessage: string | null;
  }): Promise<number> {
    const alreadyOpen = await this.prisma.notification.findFirst({
      where: {
        type: NotificationType.TOLL_DATA_SYNC_FAILURE,
        entityType: 'TollDataSource',
        readAt: null,
        metadata: { path: ['sourceId'], equals: params.sourceId },
      },
      select: { id: true },
    });
    if (alreadyOpen) return 0;

    const tenants = await this.prisma.tenant.findMany({
      where: { isActive: true, plan: { enabledModules: { has: TenantModule.TOLLS } } },
      select: { id: true },
    });
    if (tenants.length === 0) return 0;

    const recipientRoles = NOTIFICATION_RECIPIENT_ROLES[NotificationType.TOLL_DATA_SYNC_FAILURE];
    const recipients = await this.prisma.userAccount.findMany({
      where: { tenantId: { in: tenants.map((t) => t.id) }, isActive: true, deletedAt: null, role: { in: recipientRoles } },
      select: { id: true, tenantId: true },
    });
    if (recipients.length === 0) return 0;

    const errorSummary = (params.errorMessage ?? 'Erro nao especificado pela fonte.').slice(0, 300);
    const rows: Prisma.NotificationCreateManyInput[] = recipients.map((recipient) => ({
      tenantId: recipient.tenantId,
      recipientId: recipient.id,
      type: NotificationType.TOLL_DATA_SYNC_FAILURE,
      title: `Falha persistente na sincronização de pedágios: ${params.sourceName}`,
      message: `A sincronização automática de "${params.sourceName}" (${params.provider}) falhou em execuções consecutivas. Último erro: ${errorSummary}`,
      severity: AlertSeverity.CRITICAL,
      entityType: 'TollDataSource',
      // entityId = id da EXECUCAO que cruzou o limiar (nunca sourceId fixo):
      // permite reabrir o alerta num episodio de falha futuro sem colidir
      // com o unique constraint da notificacao anterior (ja resolvida).
      entityId: params.runId,
      metadata: { sourceId: params.sourceId, provider: params.provider, runId: params.runId } as Prisma.InputJsonValue,
    }));

    const result = await this.prisma.notification.createMany({ data: rows, skipDuplicates: true });
    if (result.count > 0) {
      this.logger.warn(`Alerta critico de sincronizacao criado para ${params.sourceName}: ${result.count} destinatario(s).`);
    }
    return result.count;
  }

  // Chamado quando um provider volta a ter uma execucao SUCCESS/PARTIAL
  // (fonte respondeu e algo foi aplicado) -- resolve automaticamente
  // (readAt=now) qualquer alerta ainda aberto desta fonte, reaproveitando o
  // MESMO campo `readAt` ja usado por PATCH /notifications/:id/read (nunca
  // um campo/status novo). O alerta continua no historico do usuario (nunca
  // apagado), so deixa de contar como nao-lido/critico pendente.
  async resolveTollDataSyncAlerts(sourceId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: {
        type: NotificationType.TOLL_DATA_SYNC_FAILURE,
        entityType: 'TollDataSource',
        readAt: null,
        metadata: { path: ['sourceId'], equals: sourceId },
      },
      data: { readAt: new Date() },
    });
    if (result.count > 0) {
      this.logger.log(`Alerta de sincronizacao resolvido automaticamente para a fonte ${sourceId}: ${result.count} notificacao(oes).`);
    }
    return result.count;
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

  // Fase 111 -- corrigido um bug real encontrado nesta auditoria: o array de
  // nomes desestruturados do Promise.all abaixo estava desalinhado com a
  // lista de coletores desde a Fase 110 (2 coletores adicionados ao
  // Promise.all -- collectTireLifespanNearReplacement e
  // collectChecklistCriticalNonConformity -- sem os 2 nomes correspondentes
  // na desestruturacao). Resultado real: os 2 ULTIMOS coletores da lista
  // (collectDeliveryProofProblem/collectContractsExpiring) tinham seu
  // resultado silenciosamente descartado (posicoes do Promise.all alem da
  // quantidade de nomes desestruturados nunca sao atribuidas a nada) --
  // nenhuma notificacao desses 2 tipos era criada, sem nenhum erro visivel
  // (JS/TS nao acusam desestruturacao de array com menos nomes que
  // elementos). Cada nome agora corresponde 1:1, na MESMA ordem, ao
  // respectivo coletor -- nunca mais confiar em contagem manual aqui.
  private async collectCandidates(tenantId: string): Promise<NotificationCandidate[]> {
    const [
      occurrences,
      unavailableVehicles,
      overdueMaintenances,
      duePlanMaintenances,
      nearReplacementTires,
      lifespanNearReplacementTires,
      checklistCriticalNonConformities,
      odometerRegressions,
      fiscalProblems,
      delayedTrips,
      suspendedDrivers,
      inactiveDrivers,
      pendingBillings,
      deliveryProofPending,
      deliveryProofProblem,
      contractsExpiring,
    ] = await Promise.all([
      this.collectCriticalOccurrences(tenantId),
      this.collectVehicleUnavailable(tenantId),
      this.collectVehicleMaintenance(tenantId),
      this.collectMaintenancePlansDue(tenantId),
      this.collectTireNearReplacement(tenantId),
      this.collectTireLifespanNearReplacement(tenantId),
      this.collectChecklistCriticalNonConformity(tenantId),
      this.collectFuelOdometerRegression(tenantId),
      this.collectFiscalDocumentProblems(tenantId),
      this.collectTripDelayed(tenantId),
      this.collectDriverByStatus(tenantId, DriverStatus.SUSPENDED, 'DRIVER_SUSPENDED'),
      this.collectDriverByStatus(tenantId, DriverStatus.INACTIVE, 'DRIVER_INACTIVE'),
      this.collectBillingPending(tenantId),
      this.collectDeliveryProofPending(tenantId),
      this.collectDeliveryProofProblem(tenantId),
      this.collectContractsExpiring(tenantId),
    ]);

    return [
      ...occurrences,
      ...unavailableVehicles,
      ...overdueMaintenances,
      ...duePlanMaintenances,
      ...nearReplacementTires,
      ...lifespanNearReplacementTires,
      ...checklistCriticalNonConformities,
      ...odometerRegressions,
      ...fiscalProblems,
      ...delayedTrips,
      ...suspendedDrivers,
      ...inactiveDrivers,
      ...pendingBillings,
      ...deliveryProofPending,
      ...deliveryProofProblem,
      ...contractsExpiring,
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
      select: { id: true, type: true, tripId: true, tripDeliveryStopId: true, description: true },
    });
    return rows.map((row) => ({
      type: NotificationType.CRITICAL_OCCURRENCE,
      severity: AlertSeverity.CRITICAL,
      title: `Ocorrência crítica: ${row.type}`,
      message: row.description,
      entityType: 'TripOccurrence',
      entityId: row.id,
      // Fase 101 -- tripDeliveryStopId incluido quando a ocorrencia critica
      // e de uma entrega especifica (nunca uma segunda condicao de
      // deteccao -- o filtro acima continua sendo so severity=CRITICAL +
      // aberta, igual desde a Fase 68).
      metadata: { tripId: row.tripId, tripDeliveryStopId: row.tripDeliveryStopId },
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

  // Fase 108 -- fecha a lacuna real entre manutencao PREVENTIVA (MaintenancePlan,
  // Fase 45) e o centro de notificacoes: ate aqui, collectVehicleMaintenance
  // (acima) so reagia a uma VehicleMaintenance JA ABERTA com scheduledAt
  // vencido -- um plano vencido/proximo por km ou data SEM nenhuma OS aberta
  // ainda (o caso normal, ja que MaintenancePlan nunca gera VehicleMaintenance
  // automaticamente) nunca virava notificacao, so aparecia no dashboard de
  // frota (FleetOperationsMetricsService.computeMaintenancePlanStatus).
  // Reaproveita INTEGRALMENTE a MESMA funcao pura (evaluateMaintenancePlan) e
  // o MESMO padrao de 2 queries em lote (nunca 1 por plano) -- nenhuma
  // segunda regra de vencimento. Mesmo NotificationType.VEHICLE_MAINTENANCE
  // ja existente (nunca um enum novo); entityType='MaintenancePlan' distingue
  // esta notificacao (chave de deduplicacao) da gerada por
  // collectVehicleMaintenance (entityType='VehicleMaintenance').
  private async collectMaintenancePlansDue(tenantId: string): Promise<NotificationCandidate[]> {
    const activePlans = await this.prisma.maintenancePlan.findMany({
      where: { tenantId, active: true },
    });
    if (activePlans.length === 0) return [];

    const planIds = activePlans.map((p) => p.id);
    const vehicleIds = [...new Set(activePlans.map((p) => p.vehicleId))];

    const [lastCompletedRows, vehicles] = await Promise.all([
      this.prisma.vehicleMaintenance.findMany({
        where: { tenantId, maintenancePlanId: { in: planIds }, status: VehicleMaintenanceStatus.COMPLETED },
        select: { maintenancePlanId: true, completedAt: true, odometerKm: true },
        orderBy: { completedAt: 'desc' },
      }),
      this.prisma.vehicle.findMany({ where: { id: { in: vehicleIds } }, select: { id: true, plate: true, odometerKm: true } }),
    ]);

    const lastByPlan = new Map<string, { completedAt: Date | null; odometerKm: number | null }>();
    for (const row of lastCompletedRows) {
      if (!row.maintenancePlanId || lastByPlan.has(row.maintenancePlanId)) continue;
      lastByPlan.set(row.maintenancePlanId, { completedAt: row.completedAt, odometerKm: toNumberOrNull(row.odometerKm) });
    }
    const vehicleById = new Map(vehicles.map((v) => [v.id, { plate: v.plate, odometerKm: toNumberOrNull(v.odometerKm) }]));

    const now = new Date();
    const candidates: NotificationCandidate[] = [];
    for (const plan of activePlans) {
      const lastService = lastByPlan.get(plan.id) ?? null;
      const vehicleInfo = vehicleById.get(plan.vehicleId);
      const evaluation = evaluateMaintenancePlan(
        { intervalKm: plan.intervalKm, intervalDays: plan.intervalDays, alertBeforeKm: plan.alertBeforeKm, alertBeforeDays: plan.alertBeforeDays },
        lastService,
        vehicleInfo?.odometerKm ?? null,
        now,
      );
      if (evaluation.status !== 'OVERDUE' && evaluation.status !== 'DUE_SOON') continue;

      const plate = vehicleInfo?.plate ?? '—';
      const overdue = evaluation.status === 'OVERDUE';
      const detail = overdue
        ? evaluation.overdueByDays !== null
          ? `há ${evaluation.overdueByDays} dia(s)`
          : `há ${evaluation.overdueByKm} km`
        : evaluation.dueDate !== null
          ? `em ${evaluation.dueDate.toISOString().slice(0, 10)}`
          : `aos ${evaluation.dueOdometerKm} km`;

      candidates.push({
        type: NotificationType.VEHICLE_MAINTENANCE,
        severity: overdue ? AlertSeverity.HIGH : AlertSeverity.MEDIUM,
        title: overdue ? `Manutenção preventiva vencida: ${plate}` : `Manutenção preventiva próxima: ${plate}`,
        message: `${plan.name} (${plan.component}) do veículo ${plate} ${overdue ? 'está vencida' : 'vence'} ${detail}.`,
        entityType: 'MaintenancePlan',
        entityId: plan.id,
        metadata: { vehicleId: plan.vehicleId },
      });
    }
    return candidates;
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

  // Fase 110 -- fecha a lacuna real entre o novo indicador de vida util por
  // distancia (Tire.expectedLifespanKm vs km rodados desde a instalacao,
  // TiresService.findOne/computeTireDistanceLifespan) e o centro de
  // notificacoes: ate aqui, collectTireNearReplacement (acima) so reagia ao
  // SULCO medido manualmente numa inspecao -- um pneu de composto duro que
  // ainda tem sulco alto mas ja passou da distancia projetada nunca virava
  // notificacao. Mesmo NotificationType.TIRE_NEAR_REPLACEMENT ja existente
  // (nunca um enum novo); entityType='TireLifespan' distingue esta
  // notificacao (chave de deduplicacao) da gerada por
  // collectTireNearReplacement (entityType='Tire'). Reaproveita
  // INTEGRALMENTE a MESMA formula (computeTireDistanceLifespan) usada por
  // GET /tires/:id -- nenhuma segunda regra de calculo. 2 queries em lote
  // (pneus + movimentacoes de instalacao mais recentes), nunca 1 por pneu.
  private async collectTireLifespanNearReplacement(tenantId: string): Promise<NotificationCandidate[]> {
    const tires = await this.prisma.tire.findMany({
      where: {
        tenantId,
        locationType: TireLocationType.VEHICLE,
        vehicleId: { not: null },
        expectedLifespanKm: { not: null },
      },
      select: {
        id: true,
        fireNumber: true,
        vehicleId: true,
        expectedLifespanKm: true,
        vehicle: { select: { plate: true, odometerKm: true } },
      },
    });
    if (tires.length === 0) return [];

    const tireIds = tires.map((t) => t.id);
    const installMovements = await this.prisma.tireMovement.findMany({
      where: { tenantId, tireId: { in: tireIds }, newLocationType: { not: TireLocationType.STOCK } },
      select: { tireId: true, odometerKm: true, movementDate: true },
      orderBy: { movementDate: 'desc' },
    });
    const installByTire = new Map<string, number | null>();
    for (const movement of installMovements) {
      if (installByTire.has(movement.tireId)) continue;
      installByTire.set(movement.tireId, toNumberOrNull(movement.odometerKm));
    }

    const candidates: NotificationCandidate[] = [];
    for (const tire of tires) {
      const { remainingLifespanKm, lifespanUsedPercent } = computeTireDistanceLifespan({
        currentLocationType: TireLocationType.VEHICLE,
        expectedLifespanKm: toNumberOrNull(tire.expectedLifespanKm),
        installedAtOdometerKm: installByTire.get(tire.id) ?? null,
        currentOdometerKm: toNumberOrNull(tire.vehicle?.odometerKm ?? null),
      });
      if (lifespanUsedPercent === null || lifespanUsedPercent < NEAR_REPLACEMENT_LIFESPAN_USED_PERCENT) continue;

      const plate = tire.vehicle?.plate ?? '—';
      const overdue = remainingLifespanKm !== null && remainingLifespanKm <= 0;
      candidates.push({
        type: NotificationType.TIRE_NEAR_REPLACEMENT,
        severity: overdue ? AlertSeverity.HIGH : AlertSeverity.MEDIUM,
        title: overdue ? `Pneu além da vida útil projetada: ${tire.fireNumber}` : `Pneu próximo da vida útil projetada: ${tire.fireNumber}`,
        message: `Pneu ${tire.fireNumber} do veículo ${plate} já rodou ${lifespanUsedPercent.toFixed(0)}% da vida útil esperada.`,
        entityType: 'TireLifespan',
        entityId: tire.id,
        metadata: { vehicleId: tire.vehicleId },
      });
    }
    return candidates;
  }

  // Fase 111 -- fecha a lacuna real entre a nao-conformidade critica do
  // checklist (hasCriticalNonConformity, ja calculada desde a Fase 38 mas
  // ate aqui so exposta em GET/leitura, nunca notificada) e o Centro de
  // Notificacoes. Mesma funcao pura (hasCriticalNonConformity) usada por
  // ChecklistExecutionsService/TripsService.assertPreTripChecklistSatisfied
  // -- nenhuma segunda regra de criticidade. entityType='ChecklistExecution',
  // entityId=execution.id garante deduplicacao por execucao (mesma condicao
  // reprocessada nunca gera uma segunda notificacao).
  //
  // Diferente dos demais coletores baseados em EVENTO (ex.:
  // collectFuelOdometerRegression, que varre TODO o historico do tenant sem
  // limite de data): ChecklistExecution e um log operacional que cresce sem
  // teto (potencialmente 1+ por viagem, muito mais volume que abastecimento).
  // Por isso este coletor limita a janela a
  // CHECKLIST_NOTIFICATION_WINDOW_DAYS `completedAt` -- uma nao-conformidade
  // critica de meses atras ja nao e "situacao que exige atencao agora"
  // (seção 8 do pedido), e sem o limite a query cresceria indefinidamente a
  // cada processamento. Decisao deliberada, documentada em
  // docs/notifications.md.
  private async collectChecklistCriticalNonConformity(tenantId: string): Promise<NotificationCandidate[]> {
    const since = new Date(Date.now() - CHECKLIST_NOTIFICATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const executions = await this.prisma.checklistExecution.findMany({
      where: { tenantId, status: ChecklistExecutionStatus.COMPLETED, completedAt: { gte: since } },
      select: {
        id: true,
        vehicleId: true,
        vehicle: { select: { plate: true } },
        template: { select: { name: true } },
        answers: { select: { booleanValue: true, item: { select: { type: true, required: true, critical: true } } } },
      },
    });

    const candidates: NotificationCandidate[] = [];
    for (const execution of executions) {
      if (!hasCriticalNonConformity(execution.answers)) continue;
      const plate = execution.vehicle?.plate ?? '—';
      candidates.push({
        type: NotificationType.CHECKLIST_CRITICAL_NON_CONFORMITY,
        severity: AlertSeverity.HIGH,
        title: `Checklist com item crítico: ${plate}`,
        message: `Checklist "${execution.template.name}" do veículo ${plate} tem item crítico marcado como NÃO.`,
        entityType: 'ChecklistExecution',
        entityId: execution.id,
        metadata: { vehicleId: execution.vehicleId },
      });
    }
    return candidates;
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

  // Fase 98 -- "contrato vencendo/vencido". MESMO limiar de
  // resolveDocumentExpiryStatus (fleet/utils/document-expiry.util.ts, 30
  // dias) e a MESMA condicao de elegibilidade de
  // ContractRenewalsService.getExpiringContracts (status ACTIVE/EXPIRED,
  // endDate dentro do limiar) -- nunca uma segunda regra de vencimento.
  private async collectContractsExpiring(tenantId: string): Promise<NotificationCandidate[]> {
    const now = new Date();
    const threshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.contract.findMany({
      where: {
        tenantId,
        status: { in: [ContractStatus.ACTIVE, ContractStatus.EXPIRED] },
        endDate: { not: null, lte: threshold },
      },
      select: { id: true, code: true, endDate: true, customer: { select: { name: true } } },
    });

    return rows
      .filter((row): row is typeof row & { endDate: Date } => row.endDate !== null)
      .map((row) => {
        const expired = resolveDocumentExpiryStatus(row.endDate, now) === 'EXPIRED';
        const dateLabel = row.endDate.toISOString().slice(0, 10);
        return {
          type: NotificationType.CONTRACT_EXPIRING,
          severity: expired ? AlertSeverity.HIGH : AlertSeverity.MEDIUM,
          title: expired ? `Contrato vencido: ${row.code}` : `Contrato vencendo: ${row.code}`,
          message: expired
            ? `Contrato ${row.code} do cliente ${row.customer.name} está vencido desde ${dateLabel}.`
            : `Contrato ${row.code} do cliente ${row.customer.name} vence em ${dateLabel}.`,
          entityType: 'Contract',
          entityId: row.id,
        };
      });
  }
}
