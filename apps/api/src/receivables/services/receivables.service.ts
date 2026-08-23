import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReceivableStatus, TripBillingStatus } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { FinancialPeriodGuardService } from '../../financial-periods/services/financial-period-guard.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FindReceivablesQueryDto } from '../dto/find-receivables-query.dto';
import { GenerateReceivableDto } from '../dto/generate-receivable.dto';
import { RegisterReceivablePaymentDto } from '../dto/register-receivable-payment.dto';
import { PaginatedReceivablesEntity } from '../entities/paginated-receivables.entity';
import { ReceivableEntity } from '../entities/receivable.entity';
import { toReceivableEntity, ReceivableWithRelations } from '../mappers/receivable.mapper';
import { buildReceivableStatusWhere, computeBalance, computeWrittenStatus } from '../utils/receivable-status.util';

const DETAIL_INCLUDE = {
  customer: { select: { name: true } },
  trip: { select: { origin: { select: { name: true } }, destination: { select: { name: true } } } },
  creator: true,
  canceller: true,
  payments: { include: { creator: true }, orderBy: { createdAt: 'asc' } },
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

  // POST /receivables/:id/payments -- secao 9: nunca permite
  // receivedAmount > originalAmount. Atualiza o saldo materializado dentro
  // da MESMA transacao que cria a linha do ledger (nunca 2 escritas
  // independentes -- mesmo padrao de TripBillingService.invoice).
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

    const originalAmount = toNumberOrNull(receivable.originalAmount) ?? 0;
    const receivedAmount = toNumberOrNull(receivable.receivedAmount) ?? 0;
    const balance = computeBalance(originalAmount, receivedAmount);
    if (balance <= 0) {
      throw new ConflictException('Este titulo ja esta totalmente recebido -- nenhum saldo restante.');
    }
    if (dto.amount > balance) {
      throw new BadRequestException(
        `O valor informado (${dto.amount}) ultrapassa o saldo em aberto (${balance}) -- nunca permitido.`,
      );
    }

    // Fase 76, secao 9/10 -- competencia do recebimento = paymentDate (data
    // informada pelo usuario, secao 10 do pedido).
    const paymentDate = new Date(dto.paymentDate);
    await this.periodGuard.assertPeriodOpenForDate(tenantId, paymentDate);

    const newReceivedAmount = receivedAmount + dto.amount;
    const newStatus = computeWrittenStatus(originalAmount, newReceivedAmount, null);

    const { paymentId } = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.receivablePayment.create({
        data: {
          tenantId,
          receivableId: id,
          amount: dto.amount,
          paymentDate,
          paymentMethod: dto.paymentMethod,
          createdBy: actor.userId,
          ...(dto.reference ? { reference: dto.reference } : {}),
          ...(dto.notes ? { notes: dto.notes } : {}),
        },
      });
      await tx.receivable.update({
        where: { id },
        data: { receivedAmount: newReceivedAmount, status: newStatus },
      });
      return { paymentId: payment.id };
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
        paymentDate,
        paymentMethod: dto.paymentMethod,
        newReceivedAmount,
        newStatus,
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
