import { Injectable } from '@nestjs/common';
import { ExpenseStatus, PayableStatus, Prisma, ReceivableStatus, TripBillingStatus } from '@prisma/client';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { PrismaService } from '../../prisma/prisma.service';
import { FindFinanceReconciliationQueryDto } from '../dto/find-finance-reconciliation-query.dto';
import {
  FinanceReconciliationEntity,
  FinanceReconciliationIssueEntity,
  FinanceReconciliationSummaryEntity,
  PaginatedFinanceReconciliationIssuesEntity,
  ReconciliationBySeverityEntity,
  ReconciliationByTypeEntity,
} from '../entities/finance-reconciliation.entity';
import {
  RECONCILIATION_ISSUE_TYPES,
  RECONCILIATION_SEVERITIES,
  RECONCILIATION_SEVERITY_BY_TYPE,
  ReconciliationEntityType,
  ReconciliationIssueType,
} from '../utils/reconciliation-issue-type.util';

const AMOUNT_EPSILON = 0.01;
const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };

const TRIP_LABEL_SELECT = {
  select: { origin: { select: { name: true } }, destination: { select: { name: true } } },
} satisfies { select: Prisma.TripSelect };

function tripLabelOf(trip: { origin: { name: string }; destination: { name: string } }): string {
  return `${trip.origin.name} → ${trip.destination.name}`;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// Fase 75 -- conciliacao/integridade financeira. PROJECAO calculada a
// partir dos ledgers ja existentes (secao 6 do pedido: "nao gere
// automaticamente titulos", "apenas detecta"). Nenhuma tabela nova,
// nenhum status persistido -- ver docs/finance-reconciliation.md para a
// regra completa de cada detector.
//
// Performance (secao 10): numero de queries FIXO por chamada -- 4
// detectores em paralelo (Promise.all), cada um com no maximo 1 findMany
// "base" (bounded pelos filtros) + 1 groupBy de soma de pagamentos + 1
// groupBy de duplicidade + (condicional) 1 findMany de detalhe da
// duplicidade. Nunca uma query por titulo/cliente/categoria.
@Injectable()
export class FinanceReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async getReconciliation(tenantId: string, query: FindFinanceReconciliationQueryDto): Promise<FinanceReconciliationEntity> {
    const now = new Date();

    const [receivableIssues, payableIssues, billingIssues, expenseIssues] = await Promise.all([
      this.detectReceivableIssues(tenantId, query, now),
      this.detectPayableIssues(tenantId, query, now),
      this.detectBillingIssues(tenantId, query, now),
      this.detectExpenseIssues(tenantId, query, now),
    ]);

    let issues = [...receivableIssues, ...payableIssues, ...billingIssues, ...expenseIssues];
    // type/severity/entityType sao propriedades do problema CALCULADO
    // (nunca colunas de uma tabela) -- so podem ser filtradas em memoria,
    // depois de detectados (secao 5 do pedido: "aplicados no banco quando
    // isso for possivel" -- aqui nao e possivel).
    if (query.type) issues = issues.filter((i) => i.type === query.type);
    if (query.severity) issues = issues.filter((i) => i.severity === query.severity);
    if (query.entityType) issues = issues.filter((i) => i.entityType === query.entityType);

    const entity = new FinanceReconciliationEntity();
    entity.summary = this.buildSummary(issues);
    entity.byType = this.buildByType(issues);
    entity.bySeverity = this.buildBySeverity(issues);
    entity.issues = this.paginate(issues, query.page, query.pageSize);
    return entity;
  }

  // -- Receivable: saldo/pagamento impossivel + billing cancelado + duplicidade --
  private async detectReceivableIssues(
    tenantId: string,
    query: FindFinanceReconciliationQueryDto,
    now: Date,
  ): Promise<FinanceReconciliationIssueEntity[]> {
    const dateRange = this.buildDateRange(query);
    const receivables = await this.prisma.receivable.findMany({
      where: {
        tenantId,
        status: { not: ReceivableStatus.CANCELLED },
        ...(query.tripId ? { tripId: query.tripId } : {}),
        ...(query.customerId ? { customerId: query.customerId } : {}),
        ...(dateRange ? { issueDate: dateRange } : {}),
      },
      select: {
        id: true,
        tripId: true,
        customerId: true,
        billingId: true,
        originalAmount: true,
        receivedAmount: true,
        billing: { select: { status: true } },
        trip: TRIP_LABEL_SELECT,
      },
    });

    const issues: FinanceReconciliationIssueEntity[] = [];

    if (receivables.length > 0) {
      const ids = receivables.map((r) => r.id);
      const sums = await this.prisma.receivablePayment.groupBy({
        by: ['receivableId'],
        where: { tenantId, receivableId: { in: ids } },
        _sum: { amount: true },
      });
      const sumMap = new Map(sums.map((s) => [s.receivableId, toNumberOrNull(s._sum.amount) ?? 0]));

      for (const r of receivables) {
        const tripLabel = tripLabelOf(r.trip);
        const original = toNumberOrNull(r.originalAmount) ?? 0;
        const stored = toNumberOrNull(r.receivedAmount) ?? 0;
        const actual = round2(sumMap.get(r.id) ?? 0);

        if (Math.abs(actual - stored) > AMOUNT_EPSILON) {
          issues.push(
            this.buildIssue(
              'RECEIVABLE_BALANCE_INCONSISTENT',
              'Receivable',
              r.id,
              r.tripId,
              tripLabel,
              r.customerId,
              original,
              stored,
              actual,
              `Receivable.receivedAmount (${stored}) nao bate com a soma real de ReceivablePayment (${actual}).`,
              now,
            ),
          );
        }
        if (stored > original + AMOUNT_EPSILON) {
          issues.push(
            this.buildIssue(
              'RECEIVABLE_PAYMENT_EXCEEDS_INVOICED',
              'Receivable',
              r.id,
              r.tripId,
              tripLabel,
              r.customerId,
              original,
              original,
              stored,
              `receivedAmount (${stored}) ultrapassa originalAmount (${original}).`,
              now,
            ),
          );
        }
        if (r.billing.status === TripBillingStatus.CANCELLED) {
          issues.push(
            this.buildIssue(
              'RECEIVABLE_WITHOUT_BILLING',
              'Receivable',
              r.id,
              r.tripId,
              tripLabel,
              r.customerId,
              original,
              null,
              null,
              'O faturamento (TripBilling) que originou este titulo foi cancelado, mas o titulo continua ativo.',
              now,
            ),
          );
        }
      }
    }

    const dupGroups = await this.prisma.receivable.groupBy({
      by: ['billingId'],
      where: {
        tenantId,
        ...(query.tripId ? { tripId: query.tripId } : {}),
        ...(query.customerId ? { customerId: query.customerId } : {}),
      },
      _count: { billingId: true },
      having: { billingId: { _count: { gt: 1 } } },
    });
    if (dupGroups.length > 0) {
      const countByBilling = new Map(dupGroups.map((g) => [g.billingId, g._count.billingId]));
      const dupRows = await this.prisma.receivable.findMany({
        where: { tenantId, billingId: { in: dupGroups.map((g) => g.billingId) } },
        select: { id: true, tripId: true, customerId: true, billingId: true, originalAmount: true, trip: TRIP_LABEL_SELECT },
      });
      for (const row of dupRows) {
        issues.push(
          this.buildIssue(
            'DUPLICATE_RECEIVABLE',
            'Receivable',
            row.id,
            row.tripId,
            tripLabelOf(row.trip),
            row.customerId,
            toNumberOrNull(row.originalAmount),
            null,
            null,
            `Existem ${countByBilling.get(row.billingId)} titulos Receivable para o mesmo billingId (${row.billingId}).`,
            now,
          ),
        );
      }
    }

    return issues;
  }

  // -- Payable: saldo/pagamento impossivel + despesa nao mais aprovada + duplicidade --
  private async detectPayableIssues(
    tenantId: string,
    query: FindFinanceReconciliationQueryDto,
    now: Date,
  ): Promise<FinanceReconciliationIssueEntity[]> {
    const dateRange = this.buildDateRange(query);
    const payables = await this.prisma.payable.findMany({
      where: {
        tenantId,
        status: { not: PayableStatus.CANCELLED },
        ...(query.tripId ? { tripId: query.tripId } : {}),
        ...(dateRange ? { issueDate: dateRange } : {}),
      },
      select: {
        id: true,
        tripId: true,
        expenseId: true,
        originalAmount: true,
        paidAmount: true,
        expense: { select: { status: true } },
        trip: TRIP_LABEL_SELECT,
      },
    });

    const issues: FinanceReconciliationIssueEntity[] = [];

    if (payables.length > 0) {
      const ids = payables.map((p) => p.id);
      const sums = await this.prisma.payablePayment.groupBy({
        by: ['payableId'],
        where: { tenantId, payableId: { in: ids } },
        _sum: { amount: true },
      });
      const sumMap = new Map(sums.map((s) => [s.payableId, toNumberOrNull(s._sum.amount) ?? 0]));

      for (const p of payables) {
        const tripLabel = tripLabelOf(p.trip);
        const original = toNumberOrNull(p.originalAmount) ?? 0;
        const stored = toNumberOrNull(p.paidAmount) ?? 0;
        const actual = round2(sumMap.get(p.id) ?? 0);

        if (Math.abs(actual - stored) > AMOUNT_EPSILON) {
          issues.push(
            this.buildIssue(
              'PAYABLE_BALANCE_INCONSISTENT',
              'Payable',
              p.id,
              p.tripId,
              tripLabel,
              null,
              original,
              stored,
              actual,
              `Payable.paidAmount (${stored}) nao bate com a soma real de PayablePayment (${actual}).`,
              now,
            ),
          );
        }
        if (stored > original + AMOUNT_EPSILON) {
          issues.push(
            this.buildIssue(
              'PAYABLE_PAYMENT_EXCEEDS_EXPENSE',
              'Payable',
              p.id,
              p.tripId,
              tripLabel,
              null,
              original,
              original,
              stored,
              `paidAmount (${stored}) ultrapassa originalAmount (${original}).`,
              now,
            ),
          );
        }
        if (p.expense.status !== ExpenseStatus.APPROVED) {
          issues.push(
            this.buildIssue(
              'PAYABLE_WITHOUT_APPROVED_EXPENSE',
              'Payable',
              p.id,
              p.tripId,
              tripLabel,
              null,
              original,
              null,
              null,
              `A despesa (TripExpense) que originou este titulo esta com status ${p.expense.status}, nao mais APPROVED.`,
              now,
            ),
          );
        }
      }
    }

    const dupGroups = await this.prisma.payable.groupBy({
      by: ['expenseId'],
      where: { tenantId, ...(query.tripId ? { tripId: query.tripId } : {}) },
      _count: { expenseId: true },
      having: { expenseId: { _count: { gt: 1 } } },
    });
    if (dupGroups.length > 0) {
      const countByExpense = new Map(dupGroups.map((g) => [g.expenseId, g._count.expenseId]));
      const dupRows = await this.prisma.payable.findMany({
        where: { tenantId, expenseId: { in: dupGroups.map((g) => g.expenseId) } },
        select: { id: true, tripId: true, expenseId: true, originalAmount: true, trip: TRIP_LABEL_SELECT },
      });
      for (const row of dupRows) {
        issues.push(
          this.buildIssue(
            'DUPLICATE_PAYABLE',
            'Payable',
            row.id,
            row.tripId,
            tripLabelOf(row.trip),
            null,
            toNumberOrNull(row.originalAmount),
            null,
            null,
            `Existem ${countByExpense.get(row.expenseId)} titulos Payable para o mesmo expenseId (${row.expenseId}).`,
            now,
          ),
        );
      }
    }

    return issues;
  }

  // -- TripBilling faturado sem Receivable (fonte de verdade: TripBillingStatus) --
  private async detectBillingIssues(
    tenantId: string,
    query: FindFinanceReconciliationQueryDto,
    now: Date,
  ): Promise<FinanceReconciliationIssueEntity[]> {
    const dateRange = this.buildDateRange(query);
    const billings = await this.prisma.tripBilling.findMany({
      where: {
        tenantId,
        invoicedAmount: { gt: 0 },
        status: { not: TripBillingStatus.CANCELLED },
        receivable: null,
        trip: { deletedAt: null, ...(query.customerId ? { customerId: query.customerId } : {}) },
        ...(query.tripId ? { tripId: query.tripId } : {}),
        ...(dateRange ? { createdAt: dateRange } : {}),
      },
      select: {
        id: true,
        tripId: true,
        status: true,
        invoicedAmount: true,
        trip: { select: { customerId: true, origin: { select: { name: true } }, destination: { select: { name: true } } } },
      },
    });

    return billings.map((b) => {
      const tripLabel = tripLabelOf(b.trip);
      const amount = toNumberOrNull(b.invoicedAmount) ?? 0;
      const fullyInvoiced = b.status === TripBillingStatus.INVOICED || b.status === TripBillingStatus.PAID;
      const type: ReconciliationIssueType = fullyInvoiced ? 'BILLING_WITHOUT_RECEIVABLE' : 'TRIP_BILLING_WITHOUT_RECEIVABLE';
      const description = fullyInvoiced
        ? `Faturamento totalmente concluido (status ${b.status}, ${amount} faturado) sem nenhuma conta a receber gerada.`
        : `Faturamento ainda em andamento (status ${b.status}, ${amount} ja faturado) sem conta a receber gerada -- pode ser normal se o faturamento nao terminou.`;
      return this.buildIssue(type, 'TripBilling', b.id, b.tripId, tripLabel, b.trip.customerId, amount, null, null, description, now);
    });
  }

  // -- TripExpense aprovada sem Payable (fonte de verdade: ExpenseStatus) --
  private async detectExpenseIssues(
    tenantId: string,
    query: FindFinanceReconciliationQueryDto,
    now: Date,
  ): Promise<FinanceReconciliationIssueEntity[]> {
    if (query.customerId) return []; // TripExpense nao tem cliente -- filtro incompativel, nunca retorna resultado inventado.
    const dateRange = this.buildDateRange(query);
    const expenses = await this.prisma.tripExpense.findMany({
      where: {
        tenantId,
        status: ExpenseStatus.APPROVED,
        payable: null,
        trip: { deletedAt: null },
        ...(query.tripId ? { tripId: query.tripId } : {}),
        ...(dateRange ? { expenseDate: dateRange } : {}),
      },
      select: { id: true, tripId: true, amount: true, category: true, trip: TRIP_LABEL_SELECT },
    });

    return expenses.map((e) =>
      this.buildIssue(
        'TRIP_EXPENSE_WITHOUT_PAYABLE',
        'TripExpense',
        e.id,
        e.tripId,
        tripLabelOf(e.trip),
        null,
        toNumberOrNull(e.amount),
        null,
        null,
        `Despesa aprovada (categoria ${e.category}) ainda sem conta a pagar gerada -- pode ser normal (geracao e sempre manual).`,
        now,
      ),
    );
  }

  private buildDateRange(query: FindFinanceReconciliationQueryDto): Prisma.DateTimeFilter | undefined {
    if (!query.from && !query.to) return undefined;
    return {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lte: new Date(query.to) } : {}),
    };
  }

  private buildIssue(
    type: ReconciliationIssueType,
    entityType: ReconciliationEntityType,
    entityId: string,
    tripId: string | null,
    tripLabel: string | null,
    customerId: string | null,
    amount: number | null,
    expectedAmount: number | null,
    actualAmount: number | null,
    description: string,
    detectedAt: Date,
  ): FinanceReconciliationIssueEntity {
    const issue = new FinanceReconciliationIssueEntity();
    issue.type = type;
    issue.severity = RECONCILIATION_SEVERITY_BY_TYPE[type];
    issue.entityType = entityType;
    issue.entityId = entityId;
    issue.tripId = tripId;
    issue.tripLabel = tripLabel;
    issue.customerId = customerId;
    issue.amount = amount;
    issue.expectedAmount = expectedAmount;
    issue.actualAmount = actualAmount;
    issue.description = description;
    issue.detectedAt = detectedAt;
    return issue;
  }

  private buildSummary(issues: FinanceReconciliationIssueEntity[]): FinanceReconciliationSummaryEntity {
    const summary = new FinanceReconciliationSummaryEntity();
    summary.totalIssues = issues.length;
    summary.criticalCount = issues.filter((i) => i.severity === 'CRITICAL').length;
    summary.warningCount = issues.filter((i) => i.severity === 'WARNING').length;
    summary.infoCount = issues.filter((i) => i.severity === 'INFO').length;
    summary.totalReceivableIssues = issues.filter((i) => i.entityType === 'Receivable').length;
    summary.totalPayableIssues = issues.filter((i) => i.entityType === 'Payable').length;
    summary.totalBillingIssues = issues.filter((i) => i.entityType === 'TripBilling').length;
    summary.totalExpenseIssues = issues.filter((i) => i.entityType === 'TripExpense').length;
    return summary;
  }

  private buildByType(issues: FinanceReconciliationIssueEntity[]): ReconciliationByTypeEntity[] {
    const grouped = new Map<ReconciliationIssueType, number>();
    for (const issue of issues) grouped.set(issue.type, (grouped.get(issue.type) ?? 0) + 1);
    return RECONCILIATION_ISSUE_TYPES.filter((type) => grouped.has(type)).map((type) => {
      const entity = new ReconciliationByTypeEntity();
      entity.type = type;
      entity.severity = RECONCILIATION_SEVERITY_BY_TYPE[type];
      entity.count = grouped.get(type)!;
      return entity;
    });
  }

  private buildBySeverity(issues: FinanceReconciliationIssueEntity[]): ReconciliationBySeverityEntity[] {
    return RECONCILIATION_SEVERITIES.map((severity) => {
      const entity = new ReconciliationBySeverityEntity();
      entity.severity = severity;
      entity.count = issues.filter((i) => i.severity === severity).length;
      return entity;
    });
  }

  private paginate(issues: FinanceReconciliationIssueEntity[], page: number, pageSize: number): PaginatedFinanceReconciliationIssuesEntity {
    const sorted = [...issues].sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9));
    const start = (page - 1) * pageSize;
    const result = new PaginatedFinanceReconciliationIssuesEntity();
    result.items = sorted.slice(start, start + pageSize);
    result.meta = buildPaginationMeta(sorted.length, page, pageSize);
    return result;
  }
}
