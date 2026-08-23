import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ExpenseStatus, PayableStatus, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { FindPayablesQueryDto } from '../dto/find-payables-query.dto';
import { GeneratePayableDto } from '../dto/generate-payable.dto';
import { RegisterPayablePaymentDto } from '../dto/register-payable-payment.dto';
import { PaginatedPayablesEntity } from '../entities/paginated-payables.entity';
import { PayableEntity } from '../entities/payable.entity';
import { toPayableEntity, PayableWithRelations } from '../mappers/payable.mapper';
import { buildPayableStatusWhere, computeBalance, computeWrittenStatus } from '../utils/payable-status.util';

const DETAIL_INCLUDE = {
  trip: { select: { origin: { select: { name: true } }, destination: { select: { name: true } } } },
  creator: true,
  canceller: true,
  payments: { include: { creator: true }, orderBy: { createdAt: 'asc' } },
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

  // POST /payables/:id/payments -- secao 8: nunca permite
  // paidAmount > originalAmount. Atualiza o saldo materializado dentro da
  // MESMA transacao que cria a linha do ledger.
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

    const originalAmount = toNumberOrNull(payable.originalAmount) ?? 0;
    const paidAmount = toNumberOrNull(payable.paidAmount) ?? 0;
    const balance = computeBalance(originalAmount, paidAmount);
    if (balance <= 0) {
      throw new ConflictException('Este titulo ja esta totalmente pago -- nenhum saldo restante.');
    }
    if (dto.amount > balance) {
      throw new BadRequestException(
        `O valor informado (${dto.amount}) ultrapassa o saldo em aberto (${balance}) -- nunca permitido.`,
      );
    }

    const newPaidAmount = paidAmount + dto.amount;
    const newStatus = computeWrittenStatus(originalAmount, newPaidAmount, null);

    const { paymentId } = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payablePayment.create({
        data: {
          tenantId,
          payableId: id,
          amount: dto.amount,
          paymentDate: new Date(dto.paymentDate),
          paymentMethod: dto.paymentMethod,
          createdBy: actor.userId,
          ...(dto.reference ? { reference: dto.reference } : {}),
          ...(dto.notes ? { notes: dto.notes } : {}),
        },
      });
      await tx.payable.update({
        where: { id },
        data: { paidAmount: newPaidAmount, status: newStatus },
      });
      return { paymentId: payment.id };
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
        paymentMethod: dto.paymentMethod,
        newPaidAmount,
        newStatus,
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
