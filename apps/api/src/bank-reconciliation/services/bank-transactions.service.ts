import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FinancialBankTransactionStatus, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { FinancialPeriodGuardService } from '../../financial-periods/services/financial-period-guard.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FindBankTransactionsQueryDto } from '../dto/find-bank-transactions-query.dto';
import { ReconcileBankTransactionDto } from '../dto/reconcile-bank-transaction.dto';
import { BankTransactionCandidateEntity } from '../entities/bank-transaction-candidate.entity';
import { BankTransactionEntity } from '../entities/bank-transaction.entity';
import { PaginatedBankTransactionsEntity } from '../entities/paginated-bank-transactions.entity';
import { BankTransactionWithRelations, computeDateDifferenceDays, toBankTransactionEntity } from '../mappers/bank-transaction.mapper';
import { toFinancialTransactionEntity } from '../../finance-accounts/mappers/financial-transaction.mapper';

const DETAIL_INCLUDE = {
  financialAccount: { select: { name: true } },
  financialTransaction: { include: { creator: true } },
} satisfies Prisma.FinancialBankTransactionInclude;

// Candidatos limitados a uma janela de +/-5 dias em torno da data bancaria
// (secao 15 do pedido -- "bounded", nunca um scan livre da conta inteira) e
// a no maximo 10 resultados. Sem base explicita no pedido para outro valor
// -- documentado como escolha razoavel para um extrato mensal tipico.
const CANDIDATE_DATE_WINDOW_DAYS = 5;
const CANDIDATE_LIMIT = 10;

// Fase 80 -- leitura/conciliacao manual de FinancialBankTransaction. NUNCA
// cria FinancialTransaction (o ledger, Fase 78, e imutavel por aqui) -- so
// vincula/desvincula um registro externo a um registro interno ja
// existente. Ver docs/bank-reconciliation.md para a regra de
// MATCHED/DIVERGENT/incompatibilidade.
@Injectable()
export class BankTransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly periodGuard: FinancialPeriodGuardService,
  ) {}

  async findAll(tenantId: string, query: FindBankTransactionsQueryDto): Promise<PaginatedBankTransactionsEntity> {
    const where: Prisma.FinancialBankTransactionWhereInput = {
      tenantId,
      ...(query.financialAccountId ? { financialAccountId: query.financialAccountId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.financialBankTransaction.findMany({
        where,
        include: DETAIL_INCLUDE,
        orderBy: { date: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.financialBankTransaction.count({ where }),
    ]);

    const result = new PaginatedBankTransactionsEntity();
    result.items = items.map((item) => toBankTransactionEntity(item as unknown as BankTransactionWithRelations));
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findById(tenantId: string, id: string): Promise<BankTransactionEntity> {
    return toBankTransactionEntity(await this.findOrThrow(tenantId, id, DETAIL_INCLUDE));
  }

  // GET /finance/bank-transactions/:id/candidates -- secao 4: SOMENTE
  // leitura, nunca vincula. amount exigido EXATO aqui tambem -- nunca
  // sugerir algo que o proprio reconcile() rejeitaria por incompatibilidade
  // (secao 6).
  async findCandidates(tenantId: string, id: string): Promise<BankTransactionCandidateEntity[]> {
    const bankTransaction = await this.findOrThrow(tenantId, id, { financialAccount: { select: { name: true } } });

    const windowStart = new Date(bankTransaction.date);
    windowStart.setUTCDate(windowStart.getUTCDate() - CANDIDATE_DATE_WINDOW_DAYS);
    const windowEnd = new Date(bankTransaction.date);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + CANDIDATE_DATE_WINDOW_DAYS);

    const candidates = await this.prisma.financialTransaction.findMany({
      where: {
        tenantId,
        accountId: bankTransaction.financialAccountId,
        type: bankTransaction.type,
        amount: bankTransaction.amount,
        bankTransaction: null,
        transactionDate: { gte: windowStart, lte: windowEnd },
      },
      include: { creator: true },
      orderBy: { transactionDate: 'asc' },
      take: CANDIDATE_LIMIT,
    });

    return candidates.map((candidate) => {
      const dateDifferenceDays = computeDateDifferenceDays(bankTransaction.date, candidate.transactionDate);
      const entity = new BankTransactionCandidateEntity();
      entity.financialTransaction = toFinancialTransactionEntity(candidate);
      entity.exactMatch = dateDifferenceDays === 0;
      entity.dateDifferenceDays = dateDifferenceDays;
      return entity;
    });
  }

  // POST /finance/bank-transactions/:id/reconcile -- secao 5: 10 validacoes
  // antes de criar o vinculo, nesta ordem. Atomico (uma unica escrita --
  // nao ha necessidade de $transaction, so 1 UPDATE).
  async reconcile(
    tenantId: string,
    id: string,
    dto: ReconcileBankTransactionDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<BankTransactionEntity> {
    const bankTransaction = await this.findOrThrow(tenantId, id, DETAIL_INCLUDE);

    const financialTransaction = await this.prisma.financialTransaction.findFirst({
      where: { id: dto.financialTransactionId, tenantId },
      include: { bankTransaction: true },
    });
    if (!financialTransaction) {
      throw new NotFoundException('Transacao financeira (financialTransactionId) nao encontrada nesta empresa.');
    }

    if (bankTransaction.financialTransactionId) {
      throw new ConflictException('Esta movimentacao bancaria ja esta conciliada.');
    }
    if (financialTransaction.bankTransaction) {
      throw new ConflictException('Esta transacao financeira ja esta conciliada com outra movimentacao bancaria.');
    }

    // Secao 6 -- incompatibilidades NUNCA sao vinculadas (conta/tipo/valor
    // diferentes). Divergencia PERMITIDA e mostrada e so a de DATA (ver
    // docs/bank-reconciliation.md para a justificativa desta fronteira).
    if (financialTransaction.accountId !== bankTransaction.financialAccountId) {
      throw new ConflictException('A transacao financeira pertence a uma conta financeira diferente -- vinculo incompativel.');
    }
    if (financialTransaction.type !== bankTransaction.type) {
      throw new ConflictException('Tipo (CREDIT/DEBIT) incompativel entre a movimentacao bancaria e a transacao financeira.');
    }
    if (!financialTransaction.amount.equals(bankTransaction.amount)) {
      throw new ConflictException('Valor incompativel entre a movimentacao bancaria e a transacao financeira.');
    }

    // Secao 8/10 -- competencia da operacao = data da movimentacao bancaria.
    await this.periodGuard.assertPeriodOpenForDate(tenantId, bankTransaction.date);

    const dateDifferenceDays = computeDateDifferenceDays(bankTransaction.date, financialTransaction.transactionDate);
    const status = dateDifferenceDays === 0 ? FinancialBankTransactionStatus.MATCHED : FinancialBankTransactionStatus.DIVERGENT;

    await this.prisma.financialBankTransaction.update({
      where: { id },
      data: { financialTransactionId: financialTransaction.id, status },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'financial_bank_transaction.reconciled',
      entityName: 'FinancialBankTransaction',
      entityId: id,
      newValue: toJsonSafe({
        financialAccountId: bankTransaction.financialAccountId,
        bankTransactionId: id,
        financialTransactionId: financialTransaction.id,
        amount: bankTransaction.amount,
        date: bankTransaction.date,
        externalId: bankTransaction.externalId,
        status,
        dateDifferenceDays,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return this.findById(tenantId, id);
  }

  // POST /finance/bank-transactions/:id/unreconcile -- secao 7: remove
  // SOMENTE o vinculo. Nunca apaga BankTransaction/FinancialTransaction,
  // nunca altera valor, nunca cria nova transacao.
  async unreconcile(tenantId: string, id: string, actor: AuditActor, metadata: RequestMetadata): Promise<BankTransactionEntity> {
    const bankTransaction = await this.findOrThrow(tenantId, id, DETAIL_INCLUDE);
    if (!bankTransaction.financialTransactionId) {
      throw new ConflictException('Esta movimentacao bancaria nao esta conciliada.');
    }

    await this.periodGuard.assertPeriodOpenForDate(tenantId, bankTransaction.date);

    const previousFinancialTransactionId = bankTransaction.financialTransactionId;
    await this.prisma.financialBankTransaction.update({
      where: { id },
      data: { financialTransactionId: null, status: FinancialBankTransactionStatus.PENDING },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'financial_bank_transaction.unreconciled',
      entityName: 'FinancialBankTransaction',
      entityId: id,
      previousValue: toJsonSafe({ financialTransactionId: previousFinancialTransactionId, status: bankTransaction.status }),
      newValue: toJsonSafe({ financialTransactionId: null, status: FinancialBankTransactionStatus.PENDING }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return this.findById(tenantId, id);
  }

  private async findOrThrow<T extends Prisma.FinancialBankTransactionInclude>(
    tenantId: string,
    id: string,
    include: T,
  ): Promise<Prisma.FinancialBankTransactionGetPayload<{ include: T }>> {
    const row = await this.prisma.financialBankTransaction.findFirst({ where: { id, tenantId }, include });
    if (!row) {
      throw new NotFoundException('Movimentacao bancaria nao encontrada nesta empresa.');
    }
    return row;
  }
}
