import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, SubscriptionPaymentMethod, SubscriptionPaymentStatus, TenantSubscription } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { AppConfig } from '../../config/configuration';
import { MercadoPagoService } from '../../mercado-pago/services/mercado-pago.service';
import { toMercadoPagoRecurrence } from '../../mercado-pago/utils/mercado-pago-recurrence.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSubscriptionDto } from '../dto/create-subscription.dto';
import { FindSubscriptionsQueryDto } from '../dto/find-subscriptions-query.dto';
import { RegisterPaymentDto } from '../dto/register-payment.dto';
import { UpdateSubscriptionDto } from '../dto/update-subscription.dto';
import { PaginatedSubscriptionPaymentsEntity } from '../entities/paginated-subscription-payments.entity';
import { PaginatedSubscriptionsEntity } from '../entities/paginated-subscriptions.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { SubscriptionPaymentEntity } from '../entities/subscription-payment.entity';
import {
  SubscriptionPaymentWithCreator,
  toSubscriptionEntity,
  toSubscriptionPaymentEntity,
} from '../mappers/subscription.mapper';
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
    private readonly mercadoPago: MercadoPagoService,
    private readonly configService: ConfigService<AppConfig, true>,
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

    const payment = await this.prisma.$transaction((tx) =>
      this.recordPaymentInTransaction(tx, subscription, {
        amount: dto.amount,
        dueDate: new Date(dto.dueDate),
        paidAt,
        paymentMethod: dto.paymentMethod,
        status: dto.status,
        createdBy: actor.userId,
        ...compact({ reference: dto.reference }),
      }),
    );

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

  // Extraido de registerPayment para ser reaproveitado pelo webhook do
  // Mercado Pago (Task 8) -- MESMA logica transacional (criar o registro +
  // avancar nextDueDate/status quando PAID), nunca duplicada. Publico de
  // proposito: MercadoPagoWebhookService chama isto diretamente (mesmo
  // modulo `billing`, nunca cross-module).
  async recordPaymentInTransaction(
    tx: Prisma.TransactionClient,
    subscription: TenantSubscription,
    data: {
      amount: Prisma.Decimal | number;
      dueDate: Date;
      paidAt: Date | null;
      paymentMethod: SubscriptionPaymentMethod;
      status: SubscriptionPaymentStatus;
      createdBy: string | null;
      reference?: string;
      externalPaymentId?: string;
    },
  ): Promise<SubscriptionPaymentWithCreator> {
    const created = await tx.subscriptionPayment.create({
      data: {
        tenantId: subscription.tenantId,
        subscriptionId: subscription.id,
        amount: data.amount,
        dueDate: data.dueDate,
        paidAt: data.paidAt,
        paymentMethod: data.paymentMethod,
        status: data.status,
        ...compact({
          createdBy: data.createdBy ?? undefined,
          reference: data.reference,
          externalPaymentId: data.externalPaymentId,
        }),
      },
      include: CREATOR_INCLUDE,
    });

    if (data.status === 'PAID') {
      const nextDueDate = computeNextDueDate(
        subscription.nextDueDate,
        subscription.periodicity,
        subscription.dueDay,
      );
      await tx.tenantSubscription.update({
        where: { id: subscription.id },
        data: { nextDueDate, status: 'ACTIVE' },
      });
    }

    return created;
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

  // [Mercado Pago] Self-service: GET /billing/subscriptions/me.
  async getOwnSubscription(tenantId: string): Promise<SubscriptionEntity> {
    const subscription = await this.prisma.tenantSubscription.findUnique({
      where: { tenantId },
      include: TENANT_INCLUDE,
    });
    if (!subscription) {
      throw new NotFoundException('Este tenant nao possui assinatura cadastrada.');
    }
    const lastPayment = await this.prisma.subscriptionPayment.findFirst({
      where: { subscriptionId: subscription.id },
      orderBy: { createdAt: 'desc' },
    });
    return toSubscriptionEntity(subscription, lastPayment);
  }

  // [Mercado Pago] Self-service: POST /billing/subscriptions/me/mercado-pago/authorization.
  // Cria o preapproval no Mercado Pago e devolve o link de checkout para o
  // tenant ADMIN autorizar o cartao -- dado de cartao nunca trafega por
  // aqui, so pelo checkout do proprio Mercado Pago.
  async createMercadoPagoAuthorization(tenantId: string, payerEmail: string): Promise<{ initPoint: string }> {
    const subscription = await this.prisma.tenantSubscription.findUnique({ where: { tenantId } });
    if (!subscription) {
      throw new NotFoundException('Este tenant nao possui assinatura cadastrada.');
    }
    if (subscription.paymentMethod !== 'MERCADO_PAGO') {
      throw new ConflictException('Esta assinatura nao esta configurada para cobranca via Mercado Pago.');
    }

    if (subscription.externalSubscriptionId) {
      const existing = await this.mercadoPago.getPreapproval(subscription.externalSubscriptionId);
      if (existing.status === 'authorized' || existing.status === 'pending') {
        throw new ConflictException(
          'Ja existe uma autorizacao de cobranca em andamento ou ativa para esta assinatura no Mercado Pago.',
        );
      }
    }

    const recurrence = toMercadoPagoRecurrence(subscription.periodicity);
    const adminWebUrl = this.configService.get('mercadoPago', { infer: true }).adminWebUrl;
    const preapproval = await this.mercadoPago.createPreapproval({
      reason: `Assinatura ${subscription.planTier} - transportadoras-saas`,
      payerEmail,
      externalReference: tenantId,
      transactionAmount: subscription.amount.toNumber(),
      frequency: recurrence.frequency,
      frequencyType: recurrence.frequencyType,
      startDate: subscription.nextDueDate,
      backUrl: `${adminWebUrl}/settings/company`,
    });

    if (!preapproval.initPoint) {
      throw new ServiceUnavailableException('Mercado Pago nao retornou o link de autorizacao.');
    }

    await this.prisma.tenantSubscription.update({
      where: { id: subscription.id },
      data: { externalSubscriptionId: preapproval.id },
    });

    return { initPoint: preapproval.initPoint };
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
