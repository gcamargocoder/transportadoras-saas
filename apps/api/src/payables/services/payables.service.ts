import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ExpenseStatus, FinancialTransactionType, PayableStatus, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { buildInstallmentPlan } from '../../common/utils/installment-plan.util';
import { FinancialAccountsService } from '../../finance-accounts/services/financial-accounts.service';
import { FinancialPeriodGuardService } from '../../financial-periods/services/financial-period-guard.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePayableDto } from '../dto/create-payable.dto';
import { FindPayablesQueryDto } from '../dto/find-payables-query.dto';
import { GeneratePayableDto } from '../dto/generate-payable.dto';
import { RegisterPayablePaymentDto } from '../dto/register-payable-payment.dto';
import { PaginatedPayablesEntity } from '../entities/paginated-payables.entity';
import { PayableEntity } from '../entities/payable.entity';
import { toPayableEntity, PayableWithRelations } from '../mappers/payable.mapper';
import { buildPayableStatusWhere, computeBalance, computeWrittenStatus, round2 } from '../utils/payable-status.util';

const DETAIL_INCLUDE = {
  trip: { select: { origin: { select: { name: true } }, destination: { select: { name: true } } } },
  creator: true,
  canceller: true,
  // Fase 79, secao 18 -- mesmo principio de ReceivablesService: financialAccount
  // no MESMO include (sem N+1) para expor "conta financeira utilizada".
  payments: { include: { creator: true, financialAccount: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.PayableInclude;

const LIST_INCLUDE = {
  trip: { select: { origin: { select: { name: true } }, destination: { select: { name: true } } } },
  creator: true,
  canceller: true,
} satisfies Prisma.PayableInclude;

@Injectable()
export class PayablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly periodGuard: FinancialPeriodGuardService,
    private readonly financialAccounts: FinancialAccountsService,
  ) {}

  // POST /payables/from-expense/:expenseId -- secao 7: 1 titulo por
  // despesa (idempotente, reforcado por constraint unica em
  // Payable.expenseId), snapshot do valor/categoria/fornecedor NO MOMENTO
  // da geracao (nunca recalculado se a despesa for editada depois -- ver
  // limitacao documentada em docs/payables.md). Exige TripExpense.status
  // = APPROVED (mesmo criterio ja usado por getFinancialDashboard/Fase 51
  // para considerar uma despesa como custo real).
  async generateFromExpense(
    tenantId: string,
    expenseId: string,
    dto: GeneratePayableDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<PayableEntity> {
    const expense = await this.prisma.tripExpense.findFirst({
      where: { id: expenseId, tenantId },
      include: {
        trip: { select: { id: true } },
      },
    });
    if (!expense) {
      throw new NotFoundException('Despesa (expenseId) nao encontrada nesta empresa.');
    }
    if (expense.status !== ExpenseStatus.APPROVED) {
      throw new ConflictException('Esta despesa ainda nao foi aprovada -- aprove antes de gerar a conta a pagar.');
    }

    const existing = await this.prisma.payable.findFirst({ where: { expenseId, tenantId } });
    if (existing) {
      throw new ConflictException('Ja existe uma conta a pagar gerada para esta despesa.');
    }

    // Fase 76, secao 9/10 -- competencia do titulo = issueDate (snapshot de
    // TripExpense.expenseDate, secao 10 do pedido). Bloqueia ANTES de criar
    // se o periodo daquele mes ja estiver fechado.
    await this.periodGuard.assertPeriodOpenForDate(tenantId, expense.expenseDate);

    const originalAmount = toNumberOrNull(expense.amount) ?? 0;
    const status = computeWrittenStatus(originalAmount, 0, null);
    const created = await this.prisma.payable.create({
      data: {
        tenantId,
        tripId: expense.tripId,
        expenseId,
        supplierName: expense.supplier,
        category: expense.category,
        description: dto.description?.trim() || expense.description,
        originalAmount,
        paidAmount: 0,
        issueDate: expense.expenseDate,
        dueDate: new Date(dto.dueDate),
        status,
        createdBy: actor.userId,
      },
      include: DETAIL_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'payable.created',
      entityName: 'Payable',
      entityId: created.id,
      newValue: toJsonSafe({
        expenseId,
        tripId: created.tripId,
        originalAmount: created.originalAmount,
        dueDate: created.dueDate,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toPayableEntity(created as unknown as PayableWithRelations);
  }

  // POST /payables -- titulo MANUAL (Fase Financeiro CP/CR), sem
  // TripExpense de origem (tripId/expenseId ficam nulos). Suporta
  // parcelamento (installments > 1): gera N Payables numa unica
  // transacao, todos com o mesmo installmentGroupId. Nao reaproveita
  // generateFromExpense pois nao ha despesa nenhuma para validar/copiar.
  async create(tenantId: string, dto: CreatePayableDto, actor: AuditActor, metadata: RequestMetadata): Promise<PayableEntity[]> {
    const firstDueDate = new Date(dto.dueDate);
    const issueDate = new Date(dto.issueDate);

    // Fase 76, secao 9/10 -- competencia do titulo = issueDate, igual ao
    // fluxo derivado de despesa.
    await this.periodGuard.assertPeriodOpenForDate(tenantId, issueDate);

    // Fase Fiscal/XML -- um documento fiscal gera exatamente 1 titulo, nunca
    // parcelas (ver comentario de Payable.fiscalDocumentId no schema).
    if (dto.fiscalDocumentId && (dto.installments ?? 1) > 1) {
      throw new BadRequestException('Nao e possivel parcelar um titulo gerado a partir de um documento fiscal.');
    }
    if (dto.fiscalDocumentId) {
      await this.assertFiscalDocumentLinkable(tenantId, dto.fiscalDocumentId);
    }

    const plan = buildInstallmentPlan(dto.originalAmount, firstDueDate, dto.installments ?? 1);
    const installmentGroupId = plan.length > 1 ? randomUUID() : null;

    const createdIds = await this.prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const [i, entry] of plan.entries()) {
        const status = computeWrittenStatus(entry.amount, 0, null);
        const description = plan.length > 1 ? `${dto.description} (${i + 1}/${plan.length})` : dto.description;
        const created = await tx.payable.create({
          data: {
            tenantId,
            supplierName: dto.supplierName ?? null,
            category: dto.category,
            description,
            originalAmount: entry.amount,
            paidAmount: 0,
            issueDate,
            dueDate: entry.dueDate,
            status,
            ...(installmentGroupId
              ? { installmentGroupId, installmentNumber: i + 1, installmentTotal: plan.length }
              : {}),
            ...(dto.fiscalDocumentId ? { fiscalDocumentId: dto.fiscalDocumentId } : {}),
            createdBy: actor.userId,
          },
        });
        ids.push(created.id);
      }
      return ids;
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'payable.created',
      entityName: 'Payable',
      entityId: createdIds[0] ?? '',
      newValue: toJsonSafe({
        manual: true,
        installments: plan.length,
        installmentGroupId,
        fiscalDocumentId: dto.fiscalDocumentId ?? null,
        originalAmount: dto.originalAmount,
        dueDate: firstDueDate,
        payableIds: createdIds,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    const rows = await this.prisma.payable.findMany({ where: { id: { in: createdIds }, tenantId }, include: DETAIL_INCLUDE });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return createdIds.map((id) => toPayableEntity(byId.get(id) as unknown as PayableWithRelations));
  }

  async findAll(tenantId: string, query: FindPayablesQueryDto): Promise<PaginatedPayablesEntity> {
    const now = new Date();
    const where: Prisma.PayableWhereInput = {
      tenantId,
      ...(query.tripId ? { tripId: query.tripId } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.status ? buildPayableStatusWhere(query.status, now) : {}),
      ...(query.from || query.to
        ? {
            issueDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.dueFrom || query.dueTo
        ? {
            dueDate: {
              ...(query.dueFrom ? { gte: new Date(query.dueFrom) } : {}),
              ...(query.dueTo ? { lte: new Date(query.dueTo) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { description: { contains: query.search, mode: 'insensitive' } },
              { supplierName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.payable.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: { dueDate: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.payable.count({ where }),
    ]);

    const result = new PaginatedPayablesEntity();
    result.items = items.map((item) => toPayableEntity(item as unknown as PayableWithRelations, now));
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findById(tenantId: string, id: string): Promise<PayableEntity> {
    const row = await this.findOrThrow(tenantId, id, DETAIL_INCLUDE);
    return toPayableEntity(row as unknown as PayableWithRelations);
  }

  // POST /payables/:id/payments -- secao 8 (Fase 73): nunca permite
  // paidAmount > originalAmount. Fase 79: agora TAMBEM cria, na MESMA
  // transacao Prisma, a FinancialTransaction (DEBIT) na conta financeira
  // informada -- espelho exato de ReceivablesService.registerPayment (ver
  // docs/financial-payment-integration.md).
  async registerPayment(
    tenantId: string,
    id: string,
    dto: RegisterPayablePaymentDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<PayableEntity> {
    const payable = await this.findOrThrow(tenantId, id, LIST_INCLUDE);
    if (payable.cancelledAt) {
      throw new ConflictException('Este titulo foi cancelado -- nao e possivel registrar pagamento.');
    }

    // Fase 79, secao 6 -- mesma checagem reaproveitada de
    // FinancialTransactionsService.create (Fase 78).
    await this.financialAccounts.assertActiveAndTenant(tenantId, dto.financialAccountId);

    const originalAmount = toNumberOrNull(payable.originalAmount) ?? 0;
    const paidAmount = toNumberOrNull(payable.paidAmount) ?? 0;
    const balance = computeBalance(originalAmount, paidAmount);
    if (balance <= 0) {
      throw new ConflictException('Este titulo ja esta totalmente pago -- nenhum saldo restante.');
    }
    // Fase Financeiro CP/CR -- discountAmount ABATE o saldo junto com
    // amount (quita o titulo), interestAmount/fineAmount NAO (sao cobranca
    // adicional, nunca reduzem originalAmount). Ver comentario do model
    // PayablePayment no schema.
    const discountAmount = dto.discountAmount ?? 0;
    const interestAmount = dto.interestAmount ?? 0;
    const fineAmount = dto.fineAmount ?? 0;
    const settledAmount = round2(dto.amount + discountAmount);
    if (settledAmount > balance) {
      throw new BadRequestException(
        `O valor informado (${dto.amount} + desconto ${discountAmount} = ${settledAmount}) ultrapassa o saldo em aberto (${balance}) -- nunca permitido.`,
      );
    }
    const cashAmount = round2(dto.amount + interestAmount + fineAmount);

    // Fase 76, secao 9/10 -- competencia do pagamento = paymentDate (data
    // informada pelo usuario, secao 10 do pedido). Fase 79, secao 10 --
    // MESMA data usada como transactionDate da FinancialTransaction.
    const paymentDate = new Date(dto.paymentDate);
    await this.periodGuard.assertPeriodOpenForDate(tenantId, paymentDate);

    const newPaidAmount = round2(paidAmount + settledAmount);
    const newStatus = computeWrittenStatus(originalAmount, newPaidAmount, null);

    const { paymentId, transactionId } = await this.prisma.$transaction(async (tx) => {
      // Fase 79, secao 20 -- CAS no valor lido antes da transacao (mesmo
      // mecanismo de ReceivablesService.registerPayment): duas requisicoes
      // concorrentes nunca ultrapassam o saldo juntas, sem lock distribuido.
      const cas = await tx.payable.updateMany({
        where: { id, tenantId, paidAmount: payable.paidAmount },
        data: { paidAmount: newPaidAmount, status: newStatus },
      });
      if (cas.count === 0) {
        throw new ConflictException(
          'O saldo deste titulo foi alterado por outra operacao simultanea -- verifique o saldo atual e tente novamente.',
        );
      }

      const payment = await tx.payablePayment.create({
        data: {
          tenantId,
          payableId: id,
          amount: dto.amount,
          paymentDate,
          paymentMethod: dto.paymentMethod,
          financialAccountId: dto.financialAccountId,
          createdBy: actor.userId,
          ...(dto.reference ? { reference: dto.reference } : {}),
          ...(dto.notes ? { notes: dto.notes } : {}),
          ...(dto.interestAmount != null ? { interestAmount: dto.interestAmount } : {}),
          ...(dto.fineAmount != null ? { fineAmount: dto.fineAmount } : {}),
          ...(dto.discountAmount != null ? { discountAmount: dto.discountAmount } : {}),
        },
      });

      const transaction = await tx.financialTransaction.create({
        data: {
          tenantId,
          accountId: dto.financialAccountId,
          type: FinancialTransactionType.DEBIT,
          amount: cashAmount,
          transactionDate: paymentDate,
          description: `Pagamento -- ${payable.description}`,
          referenceType: 'PayablePayment',
          referenceId: payment.id,
          createdBy: actor.userId,
        },
      });

      await tx.payablePayment.update({
        where: { id: payment.id },
        data: { financialTransactionId: transaction.id },
      });

      return { paymentId: payment.id, transactionId: transaction.id };
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'payable.payment_created',
      entityName: 'PayablePayment',
      entityId: paymentId,
      newValue: toJsonSafe({
        payableId: id,
        amount: dto.amount,
        interestAmount,
        fineAmount,
        discountAmount,
        cashAmount,
        paymentDate,
        paymentMethod: dto.paymentMethod,
        newPaidAmount,
        newStatus,
        financialAccountId: dto.financialAccountId,
        financialTransactionId: transactionId,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return this.findById(tenantId, id);
  }

  // POST /payables/:id/cancel -- secao 9: preserva pagamentos ja
  // registrados (nunca apaga), so bloqueia pagamentos futuros.
  async cancel(tenantId: string, id: string, actor: AuditActor, metadata: RequestMetadata): Promise<PayableEntity> {
    const payable = await this.findOrThrow(tenantId, id, LIST_INCLUDE);
    if (payable.cancelledAt) {
      throw new ConflictException('Este titulo ja esta cancelado.');
    }

    // Fase 76, secao 9/10 -- cancelamento protegido pela competencia do
    // PROPRIO titulo (issueDate), nunca pela data do cancelamento.
    await this.periodGuard.assertPeriodOpenForDate(tenantId, payable.issueDate);

    const cancelledAt = new Date();
    await this.prisma.payable.update({
      where: { id },
      data: {
        cancelledAt,
        cancelledBy: actor.userId,
        status: PayableStatus.CANCELLED,
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'payable.cancelled',
      entityName: 'Payable',
      entityId: id,
      previousValue: toJsonSafe({ status: payable.status }),
      newValue: toJsonSafe({ status: PayableStatus.CANCELLED, cancelledAt }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return this.findById(tenantId, id);
  }

  // Fase Fiscal/XML -- POST /payables com fiscalDocumentId: garante que o
  // documento existe neste tenant e que nenhum outro Payable ja o
  // referencia (mensagem amigavel antes da constraint @unique do banco,
  // mesmo padrao de assertNoDuplicate/findDuplicate acima).
  private async assertFiscalDocumentLinkable(tenantId: string, fiscalDocumentId: string): Promise<void> {
    const document = await this.prisma.fiscalDocument.findFirst({ where: { id: fiscalDocumentId, tenantId } });
    if (!document) {
      throw new NotFoundException('Documento fiscal (fiscalDocumentId) nao encontrado nesta empresa.');
    }
    const existing = await this.prisma.payable.findFirst({ where: { tenantId, fiscalDocumentId } });
    if (existing) {
      throw new ConflictException('Ja existe uma conta a pagar gerada a partir deste documento fiscal.');
    }
  }

  private async findOrThrow<T extends Prisma.PayableInclude>(
    tenantId: string,
    id: string,
    include: T,
  ): Promise<Prisma.PayableGetPayload<{ include: T }>> {
    const row = await this.prisma.payable.findFirst({ where: { id, tenantId }, include });
    if (!row) {
      throw new NotFoundException('Conta a pagar nao encontrada nesta empresa.');
    }
    return row;
  }
}
