import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FinancialTransactionType, Prisma, ReceivableStatus, TripBillingStatus } from '@prisma/client';
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
import { CreateReceivableDto } from '../dto/create-receivable.dto';
import { FindReceivablesQueryDto } from '../dto/find-receivables-query.dto';
import { GenerateReceivableDto } from '../dto/generate-receivable.dto';
import { RegisterReceivablePaymentDto } from '../dto/register-receivable-payment.dto';
import { PaginatedReceivablesEntity } from '../entities/paginated-receivables.entity';
import { ReceivableEntity } from '../entities/receivable.entity';
import { toReceivableEntity, ReceivableWithRelations } from '../mappers/receivable.mapper';
import { buildReceivableStatusWhere, computeBalance, computeWrittenStatus, round2 } from '../utils/receivable-status.util';

const DETAIL_INCLUDE = {
  customer: { select: { name: true } },
  trip: { select: { origin: { select: { name: true } }, destination: { select: { name: true } } } },
  creator: true,
  canceller: true,
  // Fase 79, secao 17 -- financialAccount incluido no MESMO include (nunca
  // uma consulta por payment / N+1) para expor "conta financeira utilizada"
  // no detalhe do titulo.
  payments: { include: { creator: true, financialAccount: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.ReceivableInclude;

const LIST_INCLUDE = {
  customer: { select: { name: true } },
  trip: { select: { origin: { select: { name: true } }, destination: { select: { name: true } } } },
  creator: true,
  canceller: true,
} satisfies Prisma.ReceivableInclude;

@Injectable()
export class ReceivablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly periodGuard: FinancialPeriodGuardService,
    private readonly financialAccounts: FinancialAccountsService,
  ) {}

  // POST /receivables/from-billing/:billingId -- secao 6: 1 titulo por
  // faturamento (idempotente, reforcado por constraint unica em
  // Receivable.billingId), snapshot do valor faturado NO MOMENTO da
  // geracao (nunca recalculado se o faturamento crescer depois -- ver
  // limitacao documentada em docs/receivables.md).
  async generateFromBilling(
    tenantId: string,
    billingId: string,
    dto: GenerateReceivableDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<ReceivableEntity> {
    const billing = await this.prisma.tripBilling.findFirst({
      where: { id: billingId, tenantId },
      include: {
        trip: {
          select: {
            id: true,
            customerId: true,
            origin: { select: { name: true } },
            destination: { select: { name: true } },
          },
        },
      },
    });
    if (!billing) {
      throw new NotFoundException('Faturamento (billingId) nao encontrado nesta empresa.');
    }
    if (billing.status === TripBillingStatus.CANCELLED) {
      throw new ConflictException('Este faturamento foi cancelado -- nao e possivel gerar conta a receber.');
    }

    const invoicedAmount = toNumberOrNull(billing.invoicedAmount) ?? 0;
    if (invoicedAmount <= 0) {
      throw new ConflictException('Este faturamento ainda nao tem nenhum valor faturado -- fature a viagem antes.');
    }

    const existing = await this.prisma.receivable.findFirst({ where: { billingId, tenantId } });
    if (existing) {
      throw new ConflictException('Ja existe uma conta a receber gerada para este faturamento.');
    }

    // Fase 76, secao 9/10 -- competencia do titulo = issueDate (data de
    // emissao, sempre "hoje" nesta criacao -- secao 10 do pedido). Bloqueia
    // ANTES de criar se o periodo do mes corrente ja estiver fechado.
    const issueDate = new Date();
    await this.periodGuard.assertPeriodOpenForDate(tenantId, issueDate);

    const status = computeWrittenStatus(invoicedAmount, 0, null);
    const created = await this.prisma.receivable.create({
      data: {
        tenantId,
        customerId: billing.trip.customerId,
        tripId: billing.tripId,
        billingId,
        description: dto.description?.trim() || `Faturamento da viagem ${billing.trip.origin.name} → ${billing.trip.destination.name}`,
        originalAmount: invoicedAmount,
        receivedAmount: 0,
        issueDate,
        dueDate: new Date(dto.dueDate),
        status,
        createdBy: actor.userId,
      },
      include: DETAIL_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'receivable.created',
      entityName: 'Receivable',
      entityId: created.id,
      newValue: toJsonSafe({
        billingId,
        tripId: created.tripId,
        originalAmount: created.originalAmount,
        dueDate: created.dueDate,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toReceivableEntity(created as unknown as ReceivableWithRelations);
  }

  // POST /receivables -- titulo MANUAL (Fase Financeiro CP/CR), sem
  // TripBilling de origem (tripId/billingId ficam nulos). Suporta
  // parcelamento (installments > 1): gera N Receivables numa unica
  // transacao, todos com o mesmo installmentGroupId. Nao reaproveita
  // generateFromBilling pois nao ha faturamento nenhum para validar/copiar.
  async create(tenantId: string, dto: CreateReceivableDto, actor: AuditActor, metadata: RequestMetadata): Promise<ReceivableEntity[]> {
    const firstDueDate = new Date(dto.dueDate);
    const issueDate = new Date(dto.issueDate);

    // Fase 76, secao 9/10 -- competencia do titulo = issueDate, igual ao
    // fluxo derivado de faturamento.
    await this.periodGuard.assertPeriodOpenForDate(tenantId, issueDate);

    // Fase Fiscal/XML -- um documento fiscal gera exatamente 1 titulo, nunca
    // parcelas (ver comentario de Receivable.fiscalDocumentId no schema).
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
        const created = await tx.receivable.create({
          data: {
            tenantId,
            customerId: dto.customerId,
            description,
            originalAmount: entry.amount,
            receivedAmount: 0,
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
      action: 'receivable.created',
      entityName: 'Receivable',
      entityId: createdIds[0] ?? '',
      newValue: toJsonSafe({
        manual: true,
        customerId: dto.customerId,
        installments: plan.length,
        installmentGroupId,
        fiscalDocumentId: dto.fiscalDocumentId ?? null,
        originalAmount: dto.originalAmount,
        dueDate: firstDueDate,
        receivableIds: createdIds,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    const rows = await this.prisma.receivable.findMany({ where: { id: { in: createdIds }, tenantId }, include: DETAIL_INCLUDE });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return createdIds.map((id) => toReceivableEntity(byId.get(id) as unknown as ReceivableWithRelations));
  }

  async findAll(tenantId: string, query: FindReceivablesQueryDto): Promise<PaginatedReceivablesEntity> {
    const now = new Date();
    const where: Prisma.ReceivableWhereInput = {
      tenantId,
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.tripId ? { tripId: query.tripId } : {}),
      ...(query.status ? buildReceivableStatusWhere(query.status, now) : {}),
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
              { customer: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.receivable.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: { dueDate: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.receivable.count({ where }),
    ]);

    const result = new PaginatedReceivablesEntity();
    result.items = items.map((item) => toReceivableEntity(item as unknown as ReceivableWithRelations, now));
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findById(tenantId: string, id: string): Promise<ReceivableEntity> {
    const row = await this.findOrThrow(tenantId, id, DETAIL_INCLUDE);
    return toReceivableEntity(row as unknown as ReceivableWithRelations);
  }

  // POST /receivables/:id/payments -- secao 9 (Fase 72): nunca permite
  // receivedAmount > originalAmount. Fase 79: agora TAMBEM cria, na MESMA
  // transacao Prisma, a FinancialTransaction (CREDIT) na conta financeira
  // informada -- nunca ReceivablePayment sem a movimentacao correspondente,
  // nem o contrario (ver docs/financial-payment-integration.md).
  async registerPayment(
    tenantId: string,
    id: string,
    dto: RegisterReceivablePaymentDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<ReceivableEntity> {
    const receivable = await this.findOrThrow(tenantId, id, LIST_INCLUDE);
    if (receivable.cancelledAt) {
      throw new ConflictException('Este titulo foi cancelado -- nao e possivel registrar recebimento.');
    }

    // Fase 79, secao 4 -- FinancialAccount precisa existir, pertencer ao
    // tenant e estar ativa. Reaproveita a mesma checagem ja usada por
    // FinancialTransactionsService.create (Fase 78) -- nenhuma logica
    // duplicada.
    await this.financialAccounts.assertActiveAndTenant(tenantId, dto.financialAccountId);

    const originalAmount = toNumberOrNull(receivable.originalAmount) ?? 0;
    const receivedAmount = toNumberOrNull(receivable.receivedAmount) ?? 0;
    const balance = computeBalance(originalAmount, receivedAmount);
    if (balance <= 0) {
      throw new ConflictException('Este titulo ja esta totalmente recebido -- nenhum saldo restante.');
    }
    // Fase Financeiro CP/CR -- discountAmount ABATE o saldo junto com
    // amount (quita o titulo), interestAmount/fineAmount NAO (sao cobranca
    // adicional, nunca reduzem originalAmount). Ver comentario do model
    // ReceivablePayment no schema.
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

    // Fase 76, secao 9/10 -- competencia do recebimento = paymentDate (data
    // informada pelo usuario, secao 10 do pedido). Fase 79, secao 10 --
    // MESMA data usada como transactionDate da FinancialTransaction.
    const paymentDate = new Date(dto.paymentDate);
    await this.periodGuard.assertPeriodOpenForDate(tenantId, paymentDate);

    const newReceivedAmount = round2(receivedAmount + settledAmount);
    const newStatus = computeWrittenStatus(originalAmount, newReceivedAmount, null);

    const { paymentId, transactionId } = await this.prisma.$transaction(async (tx) => {
      // Fase 79, secao 20 -- CAS (compare-and-swap) no valor lido ANTES da
      // transacao: se outra requisicao concorrente ja alterou receivedAmount
      // entretanto, updateMany casa 0 linhas e o pagamento inteiro e
      // revertido (nunca duas requisicoes simultaneas ultrapassam o saldo
      // juntas -- sem lock distribuido, sem Redis, so o proprio valor da
      // coluna como token de concorrencia).
      const cas = await tx.receivable.updateMany({
        where: { id, tenantId, receivedAmount: receivable.receivedAmount },
        data: { receivedAmount: newReceivedAmount, status: newStatus },
      });
      if (cas.count === 0) {
        throw new ConflictException(
          'O saldo deste titulo foi alterado por outra operacao simultanea -- verifique o saldo atual e tente novamente.',
        );
      }

      const payment = await tx.receivablePayment.create({
        data: {
          tenantId,
          receivableId: id,
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

      // Fase 79, secao 7 -- vinculo bidirecional: referenceType/referenceId
      // (ja existentes desde a Fase 78) apontam DESTA transacao PARA o
      // pagamento; o update logo abaixo aponta do pagamento PARA a
      // transacao. Nenhum identificador novo, so os dois lados da mesma
      // relacao.
      const transaction = await tx.financialTransaction.create({
        data: {
          tenantId,
          accountId: dto.financialAccountId,
          type: FinancialTransactionType.CREDIT,
          amount: cashAmount,
          transactionDate: paymentDate,
          description: `Recebimento -- ${receivable.description}`,
          referenceType: 'ReceivablePayment',
          referenceId: payment.id,
          createdBy: actor.userId,
        },
      });

      await tx.receivablePayment.update({
        where: { id: payment.id },
        data: { financialTransactionId: transaction.id },
      });

      return { paymentId: payment.id, transactionId: transaction.id };
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'receivable.payment_created',
      entityName: 'ReceivablePayment',
      entityId: paymentId,
      newValue: toJsonSafe({
        receivableId: id,
        amount: dto.amount,
        interestAmount,
        fineAmount,
        discountAmount,
        cashAmount,
        paymentDate,
        paymentMethod: dto.paymentMethod,
        newReceivedAmount,
        newStatus,
        financialAccountId: dto.financialAccountId,
        financialTransactionId: transactionId,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return this.findById(tenantId, id);
  }

  // POST /receivables/:id/cancel -- secao 10: preserva pagamentos ja
  // registrados (nunca apaga), so bloqueia recebimentos futuros.
  async cancel(tenantId: string, id: string, actor: AuditActor, metadata: RequestMetadata): Promise<ReceivableEntity> {
    const receivable = await this.findOrThrow(tenantId, id, LIST_INCLUDE);
    if (receivable.cancelledAt) {
      throw new ConflictException('Este titulo ja esta cancelado.');
    }

    // Fase 76, secao 9/10 -- cancelamento protegido pela competencia do
    // PROPRIO titulo (issueDate), nunca pela data do cancelamento.
    await this.periodGuard.assertPeriodOpenForDate(tenantId, receivable.issueDate);

    const cancelledAt = new Date();
    await this.prisma.receivable.update({
      where: { id },
      data: {
        cancelledAt,
        cancelledBy: actor.userId,
        status: ReceivableStatus.CANCELLED,
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'receivable.cancelled',
      entityName: 'Receivable',
      entityId: id,
      previousValue: toJsonSafe({ status: receivable.status }),
      newValue: toJsonSafe({ status: ReceivableStatus.CANCELLED, cancelledAt }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return this.findById(tenantId, id);
  }

  // Fase Fiscal/XML -- POST /receivables com fiscalDocumentId: garante que o
  // documento existe neste tenant e que nenhum outro Receivable ja o
  // referencia (mensagem amigavel antes da constraint @unique do banco).
  private async assertFiscalDocumentLinkable(tenantId: string, fiscalDocumentId: string): Promise<void> {
    const document = await this.prisma.fiscalDocument.findFirst({ where: { id: fiscalDocumentId, tenantId } });
    if (!document) {
      throw new NotFoundException('Documento fiscal (fiscalDocumentId) nao encontrado nesta empresa.');
    }
    const existing = await this.prisma.receivable.findFirst({ where: { tenantId, fiscalDocumentId } });
    if (existing) {
      throw new ConflictException('Ja existe uma conta a receber gerada a partir deste documento fiscal.');
    }
  }

  private async findOrThrow<T extends Prisma.ReceivableInclude>(
    tenantId: string,
    id: string,
    include: T,
  ): Promise<Prisma.ReceivableGetPayload<{ include: T }>> {
    const row = await this.prisma.receivable.findFirst({ where: { id, tenantId }, include });
    if (!row) {
      throw new NotFoundException('Conta a receber nao encontrada nesta empresa.');
    }
    return row;
  }
}
