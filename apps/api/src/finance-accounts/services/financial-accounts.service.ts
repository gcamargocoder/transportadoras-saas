import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFinancialAccountDto } from '../dto/create-financial-account.dto';
import { FindFinancialAccountsQueryDto } from '../dto/find-financial-accounts-query.dto';
import { UpdateFinancialAccountDto } from '../dto/update-financial-account.dto';
import { FinancialAccountEntity } from '../entities/financial-account.entity';
import { PaginatedFinancialAccountsEntity } from '../entities/paginated-financial-accounts.entity';
import { FinancialAccountWithRelations, toFinancialAccountEntity } from '../mappers/financial-account.mapper';
import { computeCurrentBalance, sumTransactionsByAccount } from '../utils/account-balance.util';

const INCLUDE = { creator: true } satisfies Prisma.FinancialAccountInclude;

// Fase 78 -- primeira camada estrutural de contas financeiras (bancarias/
// caixa). Ver docs/financial-accounts.md para o porque de nao integrar com
// banco algum e nao sincronizar automaticamente com Receivable/Payable
// nesta fase.
@Injectable()
export class FinancialAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // POST /finance/accounts -- secao 2/5: initialBalance fixado aqui, NUNCA
  // gera FinancialTransaction para representar o saldo inicial (decisao
  // documentada em docs/financial-accounts.md).
  async create(
    tenantId: string,
    dto: CreateFinancialAccountDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<FinancialAccountEntity> {
    const initialBalance = dto.initialBalance ?? 0;
    const created = await this.prisma.financialAccount.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        type: dto.type,
        initialBalance,
        bankName: dto.bankName?.trim() || null,
        bankCode: dto.bankCode?.trim() || null,
        accountNumberMasked: dto.accountNumberMasked?.trim() || null,
        createdBy: actor.userId,
      },
      include: INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'financial_account.created',
      entityName: 'FinancialAccount',
      entityId: created.id,
      newValue: toJsonSafe({ name: created.name, type: created.type, initialBalance }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toFinancialAccountEntity(created as unknown as FinancialAccountWithRelations, initialBalance);
  }

  // GET /finance/accounts -- secao 7: saldo calculado SEM N+1 (1 groupBy
  // para a pagina inteira, nunca 1 query por conta).
  async findAll(tenantId: string, query: FindFinancialAccountsQueryDto): Promise<PaginatedFinancialAccountsEntity> {
    const where: Prisma.FinancialAccountWhereInput = {
      tenantId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.financialAccount.findMany({
        where,
        include: INCLUDE,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.financialAccount.count({ where }),
    ]);

    const sums = await sumTransactionsByAccount(this.prisma, tenantId, items.map((item) => item.id));

    const result = new PaginatedFinancialAccountsEntity();
    result.items = items.map((item) =>
      toFinancialAccountEntity(
        item as unknown as FinancialAccountWithRelations,
        computeCurrentBalance(item.initialBalance.toNumber(), sums.get(item.id)),
      ),
    );
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findById(tenantId: string, id: string): Promise<FinancialAccountEntity> {
    const row = await this.findOrThrow(tenantId, id);
    const sums = await sumTransactionsByAccount(this.prisma, tenantId, [id]);
    return toFinancialAccountEntity(
      row as unknown as FinancialAccountWithRelations,
      computeCurrentBalance(row.initialBalance.toNumber(), sums.get(id)),
    );
  }

  // PATCH /finance/accounts/:id -- secao 5/7: nunca altera type/
  // initialBalance/isActive (ver UpdateFinancialAccountDto).
  async update(
    tenantId: string,
    id: string,
    dto: UpdateFinancialAccountDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<FinancialAccountEntity> {
    const before = await this.findOrThrow(tenantId, id);

    const updated = await this.prisma.financialAccount.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.bankName !== undefined ? { bankName: dto.bankName?.trim() || null } : {}),
        ...(dto.bankCode !== undefined ? { bankCode: dto.bankCode?.trim() || null } : {}),
        ...(dto.accountNumberMasked !== undefined ? { accountNumberMasked: dto.accountNumberMasked?.trim() || null } : {}),
      },
      include: INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'financial_account.updated',
      entityName: 'FinancialAccount',
      entityId: id,
      previousValue: toJsonSafe({
        name: before.name,
        bankName: before.bankName,
        bankCode: before.bankCode,
        accountNumberMasked: before.accountNumberMasked,
      }),
      newValue: toJsonSafe({
        name: updated.name,
        bankName: updated.bankName,
        bankCode: updated.bankCode,
        accountNumberMasked: updated.accountNumberMasked,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return this.findById(tenantId, id);
  }

  // POST /finance/accounts/:id/activate | .../deactivate -- secao 7:
  // idempotente por status (bloqueia re-ativar/re-desativar o que ja esta
  // no estado pedido, mesmo padrao de PayablesService.cancel).
  async activate(tenantId: string, id: string, actor: AuditActor, metadata: RequestMetadata): Promise<FinancialAccountEntity> {
    return this.setActive(tenantId, id, true, actor, metadata);
  }

  async deactivate(tenantId: string, id: string, actor: AuditActor, metadata: RequestMetadata): Promise<FinancialAccountEntity> {
    return this.setActive(tenantId, id, false, actor, metadata);
  }

  private async setActive(
    tenantId: string,
    id: string,
    isActive: boolean,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<FinancialAccountEntity> {
    const before = await this.findOrThrow(tenantId, id);
    if (before.isActive === isActive) {
      throw new ConflictException(isActive ? 'Esta conta ja esta ativa.' : 'Esta conta ja esta inativa.');
    }

    await this.prisma.financialAccount.update({ where: { id }, data: { isActive } });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: isActive ? 'financial_account.activated' : 'financial_account.deactivated',
      entityName: 'FinancialAccount',
      entityId: id,
      previousValue: toJsonSafe({ isActive: before.isActive }),
      newValue: toJsonSafe({ isActive }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return this.findById(tenantId, id);
  }

  async assertActiveAndTenant(tenantId: string, id: string): Promise<void> {
    const row = await this.findOrThrow(tenantId, id);
    if (!row.isActive) {
      throw new ConflictException('Esta conta financeira esta inativa -- nao e possivel registrar movimentacoes.');
    }
  }

  private async findOrThrow(tenantId: string, id: string): Promise<Prisma.FinancialAccountGetPayload<{ include: typeof INCLUDE }>> {
    const row = await this.prisma.financialAccount.findFirst({ where: { id, tenantId }, include: INCLUDE });
    if (!row) {
      throw new NotFoundException('Conta financeira nao encontrada nesta empresa.');
    }
    return row;
  }
}
