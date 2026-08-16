import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSubscriptionDto } from '../dto/create-subscription.dto';
import { FindSubscriptionsQueryDto } from '../dto/find-subscriptions-query.dto';
import { RegisterPaymentDto } from '../dto/register-payment.dto';
import { UpdateSubscriptionDto } from '../dto/update-subscription.dto';
import { PaginatedSubscriptionPaymentsEntity } from '../entities/paginated-subscription-payments.entity';
import { PaginatedSubscriptionsEntity } from '../entities/paginated-subscriptions.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { SubscriptionPaymentEntity } from '../entities/subscription-payment.entity';
import { toSubscriptionEntity, toSubscriptionPaymentEntity } from '../mappers/subscription.mapper';
import { computeFirstDueDate, computeNextDueDate } from '../utils/billing-date.util';

const TENANT_INCLUDE = { tenant: { select: { name: true } } } satisfies Prisma.TenantSubscriptionInclude;
const CREATOR_INCLUDE = { creator: { select: { name: true } } } satisfies Prisma.SubscriptionPaymentInclude;

// Fase 50 -- assinatura/cobranca e um dominio SUPER_ADMIN-only (garantido
// pelo @Roles(SUPER_ADMIN) no controller): nao ha necessidade de escopar
// por tenant aqui como o resto do sistema faz (SUPER_ADMIN enxerga todos os
// tenants por design, mesma logica de TenantsService neste modulo).
@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    dto: CreateSubscriptionDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<SubscriptionEntity> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: dto.tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant nao encontrado.');
    }

    const existing = await this.prisma.tenantSubscription.findUnique({
      where: { tenantId: dto.tenantId },
    });
    if (existing) {
      throw new ConflictException('Este tenant ja possui uma assinatura. Edite a assinatura existente.');
    }

    const startDate = new Date(dto.startDate);
    const nextDueDate = computeFirstDueDate(startDate, dto.dueDay);

    const subscription = await this.prisma.tenantSubscription.create({
      data: {
        tenantId: dto.tenantId,
        planTier: dto.planTier,
        amount: dto.amount,
        periodicity: dto.periodicity,
        paymentMethod: dto.paymentMethod,
        startDate,
        dueDay: dto.dueDay,
        nextDueDate,
        ...compact({ notes: dto.notes }),
      },
      include: TENANT_INCLUDE,
    });

    await this.audit.log({
      tenantId: dto.tenantId,
      userId: actor.userId,
      action: 'billing.subscription_created',
      entityName: 'TenantSubscription',
      entityId: subscription.id,
      newValue: toJsonSafe({
        planTier: subscription.planTier,
        amount: subscription.amount,
        periodicity: subscription.periodicity,
        paymentMethod: subscription.paymentMethod,
        nextDueDate: subscription.nextDueDate,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toSubscriptionEntity(subscription);
  }

  async update(
    id: string,
    dto: UpdateSubscriptionDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<SubscriptionEntity> {
    const before = await this.findByIdOrThrow(id);

    const after = await this.prisma.tenantSubscription.update({
      where: { id },
      data: compact({
        planTier: dto.planTier,
        amount: dto.amount,
        periodicity: dto.periodicity,
        paymentMethod: dto.paymentMethod,
        dueDay: dto.dueDay,
        nextDueDate: dto.nextDueDate ? new Date(dto.nextDueDate) : undefined,
        status: dto.status,
        notes: dto.notes,
      }),
      include: TENANT_INCLUDE,
    });

    // "Cancelamento" (secao 4/10 do pedido) e uma acao de auditoria
    // distinta, mesmo passando pelo mesmo endpoint generico de edicao
    // (nunca uma rota duplicada so para isso).
    const isCancellation = before.status !== 'CANCELLED' && after.status === 'CANCELLED';

    await this.audit.log({
      tenantId: after.tenantId,
      userId: actor.userId,
      action: isCancellation ? 'billing.subscription_cancelled' : 'billing.subscription_updated',
      entityName: 'TenantSubscription',
      entityId: id,
      previousValue: toJsonSafe({
        planTier: before.planTier,
        amount: before.amount,
        periodicity: before.periodicity,
        paymentMethod: before.paymentMethod,
        dueDay: before.dueDay,
        nextDueDate: before.nextDueDate,
        status: before.status,
      }),
      newValue: toJsonSafe({
        planTier: after.planTier,
        amount: after.amount,
        periodicity: after.periodicity,
        paymentMethod: after.paymentMethod,
        dueDay: after.dueDay,
        nextDueDate: after.nextDueDate,
        status: after.status,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toSubscriptionEntity(after);
  }

  // Filtros resolvidos direto no where do findMany/count -- tenant/plano
  // nunca resolvidos numa query por linha (include no proprio findMany).
  async findAll(query: FindSubscriptionsQueryDto): Promise<PaginatedSubscriptionsEntity> {
    const where: Prisma.TenantSubscriptionWhereInput = compact({
      tenantId: query.tenantId,
      status: query.status,
      paymentMethod: query.paymentMethod,
      planTier: query.planTier,
      nextDueDate:
        query.dueFrom || query.dueTo
          ? ({
              ...(query.dueFrom ? { gte: new Date(query.dueFrom) } : {}),
              ...(query.dueTo ? { lte: new Date(query.dueTo) } : {}),
            } as Prisma.DateTimeFilter)
          : undefined,
      tenant: query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { tradeName: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : undefined,
    });

    const [items, total] = await Promise.all([
      this.prisma.tenantSubscription.findMany({
        where,
        include: TENANT_INCLUDE,
        orderBy: { nextDueDate: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.tenantSubscription.count({ where }),
    ]);

    const result = new PaginatedSubscriptionsEntity();
    result.items = items.map((item) => toSubscriptionEntity(item));
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findById(id: string): Promise<SubscriptionEntity> {
    const subscription = await this.findByIdOrThrow(id);
    const lastPayment = await this.prisma.subscriptionPayment.findFirst({
      where: { subscriptionId: id },
      orderBy: { createdAt: 'desc' },
    });
    return toSubscriptionEntity(subscription, lastPayment);
  }

  // Cria 1 linha nova no ledger (nunca altera uma existente). Quando
  // status=PAID, avanca nextDueDate conforme a periodicidade (sempre
  // calculado no backend) e marca a assinatura como ACTIVE de novo --
  // dentro da MESMA transacao, nunca 2 escritas independentes.
  async registerPayment(
    id: string,
    dto: RegisterPaymentDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<SubscriptionPaymentEntity> {
    const subscription = await this.findByIdOrThrow(id);

    const paidAt = dto.paidAt
      ? new Date(dto.paidAt)
      : dto.status === 'PAID'
        ? new Date()
        : null;

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.subscriptionPayment.create({
        data: {
          tenantId: subscription.tenantId,
          subscriptionId: id,
          amount: dto.amount,
          dueDate: new Date(dto.dueDate),
          paidAt,
          paymentMethod: dto.paymentMethod,
          status: dto.status,
          createdBy: actor.userId,
          ...compact({ reference: dto.reference }),
        },
        include: CREATOR_INCLUDE,
      });

      if (dto.status === 'PAID') {
        const nextDueDate = computeNextDueDate(
          subscription.nextDueDate,
          subscription.periodicity,
          subscription.dueDay,
        );
        await tx.tenantSubscription.update({
          where: { id },
          data: { nextDueDate, status: 'ACTIVE' },
        });
      }

      return created;
    });

    await this.audit.log({
      tenantId: subscription.tenantId,
      userId: actor.userId,
      action: 'billing.payment_registered',
      entityName: 'SubscriptionPayment',
      entityId: payment.id,
      newValue: toJsonSafe({
        subscriptionId: id,
        amount: payment.amount,
        dueDate: payment.dueDate,
        status: payment.status,
        paymentMethod: payment.paymentMethod,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toSubscriptionPaymentEntity(payment);
  }

  async listPayments(
    id: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedSubscriptionPaymentsEntity> {
    await this.findByIdOrThrow(id);

    const where: Prisma.SubscriptionPaymentWhereInput = { subscriptionId: id };
    const [items, total] = await Promise.all([
      this.prisma.subscriptionPayment.findMany({
        where,
        include: CREATOR_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.subscriptionPayment.count({ where }),
    ]);

    const result = new PaginatedSubscriptionPaymentsEntity();
    result.items = items.map(toSubscriptionPaymentEntity);
    result.meta = buildPaginationMeta(total, page, pageSize);
    return result;
  }

  private async findByIdOrThrow(id: string) {
    const subscription = await this.prisma.tenantSubscription.findUnique({
      where: { id },
      include: TENANT_INCLUDE,
    });
    if (!subscription) {
      throw new NotFoundException('Assinatura nao encontrada.');
    }
    return subscription;
  }
}
