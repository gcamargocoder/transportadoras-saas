import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { compact } from '../../common/utils/compact.util';
import { FinancialPeriodGuardService } from '../../financial-periods/services/financial-period-guard.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFinancialTransactionDto } from '../dto/create-financial-transaction.dto';
import { FindFinancialTransactionsQueryDto } from '../dto/find-financial-transactions-query.dto';
import { FinancialTransactionEntity } from '../entities/financial-transaction.entity';
import { PaginatedFinancialTransactionsEntity } from '../entities/paginated-financial-transactions.entity';
import { FinancialTransactionWithRelations, toFinancialTransactionEntity } from '../mappers/financial-transaction.mapper';
import { FinancialAccountsService } from './financial-accounts.service';

const INCLUDE = { creator: true } satisfies Prisma.FinancialTransactionInclude;

// Fase 78, secao 6/8 -- movimentacao manual de credito/debito de uma conta.
// Ledger append-only: nenhum metodo de update/delete existe aqui, de
// proposito (secao 18 do pedido).
@Injectable()
export class FinancialTransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly accounts: FinancialAccountsService,
    private readonly periodGuard: FinancialPeriodGuardService,
  ) {}

  // GET /finance/accounts/:id/transactions -- secao 8: paginado no banco,
  // ordenado por transactionDate DESC, createdAt DESC.
  async findAll(
    tenantId: string,
    accountId: string,
    query: FindFinancialTransactionsQueryDto,
  ): Promise<PaginatedFinancialTransactionsEntity> {
    await this.assertAccountExists(tenantId, accountId);

    const where: Prisma.FinancialTransactionWhereInput = {
      tenantId,
      accountId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.from || query.to
        ? {
            transactionDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.financialTransaction.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.financialTransaction.count({ where }),
    ]);

    const result = new PaginatedFinancialTransactionsEntity();
    result.items = items.map((item) => toFinancialTransactionEntity(item as unknown as FinancialTransactionWithRelations));
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  // POST /finance/accounts/:id/transactions -- secao 6/10: bloqueado se o
  // periodo (mes da transactionDate) estiver CLOSED; conta precisa existir
  // e estar ativa.
  async create(
    tenantId: string,
    accountId: string,
    dto: CreateFinancialTransactionDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<FinancialTransactionEntity> {
    await this.accounts.assertActiveAndTenant(tenantId, accountId);

    const transactionDate = new Date(dto.transactionDate);
    await this.periodGuard.assertPeriodOpenForDate(tenantId, transactionDate);

    const created = await this.prisma.financialTransaction.create({
      data: {
        tenantId,
        accountId,
        type: dto.type,
        amount: dto.amount,
        transactionDate,
        description: dto.description.trim(),
        createdBy: actor.userId,
        ...compact({ referenceType: dto.referenceType, referenceId: dto.referenceId }),
      },
      include: INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'financial_transaction.created',
      entityName: 'FinancialTransaction',
      entityId: created.id,
      newValue: toJsonSafe({
        accountId,
        type: created.type,
        amount: dto.amount,
        transactionDate,
        description: created.description,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toFinancialTransactionEntity(created as unknown as FinancialTransactionWithRelations);
  }

  private async assertAccountExists(tenantId: string, accountId: string): Promise<void> {
    const row = await this.prisma.financialAccount.findFirst({ where: { id: accountId, tenantId }, select: { id: true } });
    if (!row) {
      throw new NotFoundException('Conta financeira nao encontrada nesta empresa.');
    }
  }
}
