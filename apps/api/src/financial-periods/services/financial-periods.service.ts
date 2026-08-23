import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FinancialPeriodStatus, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { toAuditLogEntity } from '../../audit/mappers/audit-log.mapper';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { FinanceReconciliationService } from '../../finance-reconciliation/services/finance-reconciliation.service';
import { PayablesDashboardService } from '../../payables/services/payables-dashboard.service';
import { ReceivablesDashboardService } from '../../receivables/services/receivables-dashboard.service';
import { CreateFinancialPeriodDto } from '../dto/create-financial-period.dto';
import { FindFinancialPeriodsQueryDto } from '../dto/find-financial-periods-query.dto';
import { FinancialPeriodSummaryEntity } from '../entities/financial-period-summary.entity';
import { FinancialPeriodEntity } from '../entities/financial-period.entity';
import { PaginatedFinancialPeriodsEntity } from '../entities/paginated-financial-periods.entity';
import { toFinancialPeriodEntity, FinancialPeriodWithRelations } from '../mappers/financial-period.mapper';
import { monthDateRange } from '../utils/period-range.util';

const DETAIL_INCLUDE = {
  opener: true,
  closer: true,
} satisfies Prisma.FinancialPeriodInclude;

// Fase 77, secao 5 -- unico vinculo ESTRUTURALMENTE seguro entre AuditLog e
// FinancialPeriod: os proprios eventos do periodo (entityName='FinancialPeriod',
// entityId=period.id -- financial_period.created/closed). Nunca mais que
// 2 linhas na pratica (nasce OPEN, fecha uma vez, sem reabertura), mas o
// limite fica explicito para nao crescer sem controle.
const AUDIT_HISTORY_PAGE_SIZE = 20;

// Fase 76 -- camada de CONTROLE DE PERIODO sobre os ledgers financeiros ja
// existentes (Receivable/Payable). Nunca um ledger novo, nunca um snapshot
// financeiro persistido -- ver comentario do model FinancialPeriod no
// schema e docs/financial-periods.md.
@Injectable()
export class FinancialPeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly receivablesDashboard: ReceivablesDashboardService,
    private readonly payablesDashboard: PayablesDashboardService,
    private readonly reconciliation: FinanceReconciliationService,
  ) {}

  // POST /finance/periods -- secao 4: nasce sempre OPEN, idempotencia
  // reforcada pela constraint unica tenantId+year+month.
  async create(
    tenantId: string,
    dto: CreateFinancialPeriodDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<FinancialPeriodEntity> {
    const existing = await this.prisma.financialPeriod.findUnique({
      where: { tenantId_year_month: { tenantId, year: dto.year, month: dto.month } },
    });
    if (existing) {
      throw new ConflictException(
        `Ja existe um periodo financeiro para ${String(dto.month).padStart(2, '0')}/${dto.year} nesta empresa.`,
      );
    }

    const created = await this.prisma.financialPeriod.create({
      data: {
        tenantId,
        year: dto.year,
        month: dto.month,
        status: FinancialPeriodStatus.OPEN,
        openedBy: actor.userId,
      },
      include: DETAIL_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'financial_period.created',
      entityName: 'FinancialPeriod',
      entityId: created.id,
      newValue: toJsonSafe({ year: created.year, month: created.month, status: created.status }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toFinancialPeriodEntity(created as unknown as FinancialPeriodWithRelations);
  }

  // GET /finance/periods -- secao 5: ordenado sempre por year DESC, month
  // DESC.
  async findAll(tenantId: string, query: FindFinancialPeriodsQueryDto): Promise<PaginatedFinancialPeriodsEntity> {
    const where: Prisma.FinancialPeriodWhereInput = {
      tenantId,
      ...(query.year ? { year: query.year } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.financialPeriod.findMany({
        where,
        include: DETAIL_INCLUDE,
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.financialPeriod.count({ where }),
    ]);

    const result = new PaginatedFinancialPeriodsEntity();
    result.items = items.map((item) => toFinancialPeriodEntity(item as unknown as FinancialPeriodWithRelations));
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  // GET /finance/periods/:id -- secao 6 (Fase 76): inclui o resumo
  // calculado ao vivo (nunca persistido), reaproveitando os mesmos
  // servicos ja usados por /receivables/dashboard, /payables/dashboard e
  // /finance/reconciliation. Fase 77, secao 5/8: tambem inclui o historico
  // de auditoria do PROPRIO periodo (financial_period.created/closed) --
  // o unico vinculo estruturalmente seguro com AuditLog (ver
  // docs/financial-audit.md para a limitacao de nao relacionar eventos de
  // Receivable/Payable a um periodo).
  async findById(tenantId: string, id: string): Promise<FinancialPeriodEntity> {
    const row = await this.findOrThrow(tenantId, id);
    const [summary, auditHistory] = await Promise.all([
      this.buildSummary(tenantId, row.year, row.month),
      this.audit.findByEntity(tenantId, 'FinancialPeriod', id, { page: 1, pageSize: AUDIT_HISTORY_PAGE_SIZE }),
    ]);
    return toFinancialPeriodEntity(row, summary, auditHistory.items.map(toAuditLogEntity));
  }

  // POST /finance/periods/:id/close -- secao 7: somente OPEN pode ser
  // fechado (idempotente -- nunca fecha 2x); bloqueado se houver
  // inconsistencia CRITICAL nao resolvida no escopo do periodo (secao 7/8).
  async close(tenantId: string, id: string, actor: AuditActor, metadata: RequestMetadata): Promise<FinancialPeriodEntity> {
    const row = await this.findOrThrow(tenantId, id);
    if (row.status === FinancialPeriodStatus.CLOSED) {
      throw new ConflictException('Este periodo financeiro ja esta fechado.');
    }

    const summary = await this.buildSummary(tenantId, row.year, row.month);
    if (summary.criticalReconciliationIssues > 0) {
      throw new ConflictException(
        `Existem ${summary.criticalReconciliationIssues} inconsistencia(s) CRITICA(s) detectada(s) pela conciliacao ` +
          `financeira neste periodo -- resolva-as (ou aguarde a correcao dos dados de origem) antes de fechar. ` +
          `Consulte GET /finance/reconciliation?from=... para o detalhe.`,
      );
    }

    const closedAt = new Date();
    await this.prisma.financialPeriod.update({
      where: { id },
      data: { status: FinancialPeriodStatus.CLOSED, closedAt, closedBy: actor.userId },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'financial_period.closed',
      entityName: 'FinancialPeriod',
      entityId: id,
      previousValue: toJsonSafe({ status: row.status }),
      // Fase 77, secao 4/8 -- resumo pequeno e objetivo da conciliacao
      // usada para decidir o fechamento (nunca um snapshot financeiro
      // completo, so a contagem ja calculada em buildSummary acima).
      newValue: toJsonSafe({
        status: FinancialPeriodStatus.CLOSED,
        closedAt,
        year: row.year,
        month: row.month,
        criticalReconciliationIssues: summary.criticalReconciliationIssues,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return this.findById(tenantId, id);
  }

  private async buildSummary(tenantId: string, year: number, month: number): Promise<FinancialPeriodSummaryEntity> {
    const { from, to } = monthDateRange(year, month);

    const [receivables, payables, reconciliation] = await Promise.all([
      this.receivablesDashboard.getDashboard(tenantId, { from, to }),
      this.payablesDashboard.getDashboard(tenantId, { from, to }),
      this.reconciliation.getReconciliation(tenantId, { from, to, page: 1, pageSize: 1 }),
    ]);

    const summary = new FinancialPeriodSummaryEntity();
    summary.totalReceived = receivables.summary.totalReceived;
    summary.totalPaid = payables.summary.totalPaid;
    summary.receivableOpen = receivables.summary.totalOpen;
    summary.payableOpen = payables.summary.totalOpen;
    summary.criticalReconciliationIssues = reconciliation.summary.criticalCount;
    return summary;
  }

  private async findOrThrow(tenantId: string, id: string): Promise<FinancialPeriodWithRelations> {
    const row = await this.prisma.financialPeriod.findFirst({ where: { id, tenantId }, include: DETAIL_INCLUDE });
    if (!row) {
      throw new NotFoundException('Periodo financeiro nao encontrado nesta empresa.');
    }
    return row as unknown as FinancialPeriodWithRelations;
  }
}
