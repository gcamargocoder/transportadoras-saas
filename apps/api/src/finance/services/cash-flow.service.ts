import { Injectable } from '@nestjs/common';
import { PayableStatus, Prisma, ReceivableStatus } from '@prisma/client';
import { computeBalance, round2 } from '../../common/utils/balance-status.util';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { PayablesDashboardEntity } from '../../payables/entities/payables-dashboard.entity';
import { PayablesDashboardService } from '../../payables/services/payables-dashboard.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ReceivablesDashboardEntity } from '../../receivables/entities/receivables-dashboard.entity';
import { ReceivablesDashboardService } from '../../receivables/services/receivables-dashboard.service';
import { FindCashFlowQueryDto } from '../dto/find-cash-flow-query.dto';
import { CashFlowEntity, CashFlowMonthlyPointEntity, CashFlowSummaryEntity } from '../entities/cash-flow.entity';
import { buildMonthlyRange, resolveMonthlyWindow } from '../utils/monthly-window.util';

const TOP_LIST_LIMIT = 10;

const RECEIVABLE_DUE_SELECT = {
  originalAmount: true,
  receivedAmount: true,
  dueDate: true,
} satisfies Prisma.ReceivableSelect;

const PAYABLE_DUE_SELECT = {
  originalAmount: true,
  paidAmount: true,
  dueDate: true,
} satisfies Prisma.PayableSelect;

const PAYMENT_SELECT = { amount: true, paymentDate: true } as const;

type MonthlyBuckets = ReturnType<typeof buildMonthlyRange>;
type ReceivableDueRow = Prisma.ReceivableGetPayload<{ select: typeof RECEIVABLE_DUE_SELECT }>;
type PayableDueRow = Prisma.PayableGetPayload<{ select: typeof PAYABLE_DUE_SELECT }>;
type PaymentRow = { amount: Prisma.Decimal; paymentDate: Date };

// Fase 74 -- projecao financeira consolidada, SEM ledger novo: tudo
// derivado de Receivable/ReceivablePayment/Payable/PayablePayment (Fases
// 72/73) e dos dois dashboards ja existentes (secao 9 do pedido: "Nao
// criar CashTransaction/BankTransaction/FinancialLedger/AccountBalance").
// NUNCA representa saldo bancario real -- nao ha conta bancaria cadastrada
// nem conciliacao/integracao bancaria no projeto (ver docs/cash-flow.md).
//
// Performance (secao 8): numero de queries FIXO, nunca por
// cliente/categoria/mes -- 4 queries em paralelo com os 2 dashboards
// (que ja fazem 1 findMany cada, mesmo padrao da Fase 72/73) + 4 queries
// bounded para a serie mensal (2 findMany para os titulos com vencimento
// na janela, 2 findMany para os pagamentos com data na janela). Nunca um
// loop de query.
@Injectable()
export class CashFlowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receivablesDashboardService: ReceivablesDashboardService,
    private readonly payablesDashboardService: PayablesDashboardService,
  ) {}

  async getCashFlow(tenantId: string, query: FindCashFlowQueryDto): Promise<CashFlowEntity> {
    const { monthsBack, reference } = resolveMonthlyWindow(query.from, query.to);
    const buckets = buildMonthlyRange(monthsBack, reference);
    const windowStart = buckets[0]!.start;
    const windowEnd = buckets[buckets.length - 1]!.end;

    const [
      receivablesDashboard,
      payablesDashboard,
      receivedCount,
      paidCount,
      receivableDueRows,
      payableDueRows,
      receivablePaymentRows,
      payablePaymentRows,
    ] = await Promise.all([
      // Reaproveita INTEGRALMENTE os dashboards da Fase 72/73 -- mesmo
      // resumo/aging/ranking ja expostos em /receivables/dashboard e
      // /payables/dashboard, nenhum calculo duplicado.
      this.receivablesDashboardService.getDashboard(tenantId, {}),
      this.payablesDashboardService.getDashboard(tenantId, {}),
      this.prisma.receivablePayment.count({ where: { tenantId } }),
      this.prisma.payablePayment.count({ where: { tenantId } }),
      this.prisma.receivable.findMany({
        where: {
          tenantId,
          status: { notIn: [ReceivableStatus.CANCELLED, ReceivableStatus.PAID] },
          dueDate: { gte: windowStart, lt: windowEnd },
        },
        select: RECEIVABLE_DUE_SELECT,
      }),
      this.prisma.payable.findMany({
        where: {
          tenantId,
          status: { notIn: [PayableStatus.CANCELLED, PayableStatus.PAID] },
          dueDate: { gte: windowStart, lt: windowEnd },
        },
        select: PAYABLE_DUE_SELECT,
      }),
      this.prisma.receivablePayment.findMany({
        where: { tenantId, paymentDate: { gte: windowStart, lt: windowEnd } },
        select: PAYMENT_SELECT,
      }),
      this.prisma.payablePayment.findMany({
        where: { tenantId, paymentDate: { gte: windowStart, lt: windowEnd } },
        select: PAYMENT_SELECT,
      }),
    ]);

    const entity = new CashFlowEntity();
    entity.summary = this.buildSummary(receivablesDashboard, payablesDashboard, receivedCount, paidCount);
    entity.monthly = this.buildMonthly(buckets, receivableDueRows, payableDueRows, receivablePaymentRows, payablePaymentRows);
    // "Ranking dos principais clientes/categorias por valor em ABERTO"
    // (secao 4/5) -- os dashboards ja trazem byCustomer/byCategory
    // ordenados por total faturado/original; aqui so reordenamos pelo
    // saldo (balance), sem nenhuma query nova.
    entity.topReceivableCustomers = [...receivablesDashboard.byCustomer]
      .sort((a, b) => b.balance - a.balance)
      .slice(0, TOP_LIST_LIMIT);
    entity.topPayableCategories = [...payablesDashboard.byCategory]
      .sort((a, b) => b.balance - a.balance)
      .slice(0, TOP_LIST_LIMIT);
    return entity;
  }

  private buildSummary(
    receivables: ReceivablesDashboardEntity,
    payables: PayablesDashboardEntity,
    receivedCount: number,
    paidCount: number,
  ): CashFlowSummaryEntity {
    const summary = new CashFlowSummaryEntity();
    // "Recebido"/"Pago" = receivedAmount/paidAmount materializados, que
    // sao SEMPRE a soma real de ReceivablePayment/PayablePayment (nunca
    // TripBilling.status=PAID nem TripExpense) -- ver secao 2 do pedido.
    summary.totalReceived = receivables.summary.totalReceived;
    summary.totalPaid = payables.summary.totalPaid;
    summary.totalReceivableOpen = receivables.summary.totalOpen;
    summary.totalPayableOpen = payables.summary.totalOpen;
    summary.totalReceivableOverdue = receivables.summary.totalOverdue;
    summary.totalPayableOverdue = payables.summary.totalOverdue;
    summary.projectedNetBalance = round2(summary.totalReceivableOpen - summary.totalPayableOpen);
    summary.receivedCount = receivedCount;
    summary.paidCount = paidCount;
    return summary;
  }

  private buildMonthly(
    buckets: MonthlyBuckets,
    receivableDueRows: ReceivableDueRow[],
    payableDueRows: PayableDueRow[],
    receivablePaymentRows: PaymentRow[],
    payablePaymentRows: PaymentRow[],
  ): CashFlowMonthlyPointEntity[] {
    const now = new Date();
    const points = buckets.map((bucket) => {
      const point = new CashFlowMonthlyPointEntity();
      point.period = `${bucket.start.getUTCFullYear()}-${String(bucket.start.getUTCMonth() + 1).padStart(2, '0')}`;
      point.received = 0;
      point.paid = 0;
      point.net = 0;
      point.receivableDue = 0;
      point.payableDue = 0;
      point.receivableOverdue = 0;
      point.payableOverdue = 0;
      return point;
    });

    const findBucketIndex = (date: Date): number => buckets.findIndex((b) => date >= b.start && date < b.end);

    for (const row of receivableDueRows) {
      const idx = findBucketIndex(row.dueDate);
      if (idx < 0) continue;
      const balance = computeBalance(toNumberOrNull(row.originalAmount) ?? 0, toNumberOrNull(row.receivedAmount) ?? 0);
      const point = points[idx]!;
      point.receivableDue = round2(point.receivableDue + balance);
      if (row.dueDate.getTime() < now.getTime()) {
        point.receivableOverdue = round2(point.receivableOverdue + balance);
      }
    }

    for (const row of payableDueRows) {
      const idx = findBucketIndex(row.dueDate);
      if (idx < 0) continue;
      const balance = computeBalance(toNumberOrNull(row.originalAmount) ?? 0, toNumberOrNull(row.paidAmount) ?? 0);
      const point = points[idx]!;
      point.payableDue = round2(point.payableDue + balance);
      if (row.dueDate.getTime() < now.getTime()) {
        point.payableOverdue = round2(point.payableOverdue + balance);
      }
    }

    for (const row of receivablePaymentRows) {
      const idx = findBucketIndex(row.paymentDate);
      if (idx < 0) continue;
      const point = points[idx]!;
      point.received = round2(point.received + (toNumberOrNull(row.amount) ?? 0));
    }

    for (const row of payablePaymentRows) {
      const idx = findBucketIndex(row.paymentDate);
      if (idx < 0) continue;
      const point = points[idx]!;
      point.paid = round2(point.paid + (toNumberOrNull(row.amount) ?? 0));
    }

    for (const point of points) {
      point.net = round2(point.received - point.paid);
    }

    return points;
  }
}
