import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RevenueCategory, TripBillingStatus } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { FinancialPeriodGuardService } from '../../financial-periods/services/financial-period-guard.service';
import { resolveTripFreightBestAmount } from '../../freight/utils/trip-freight-amount.util';
import { PrismaService } from '../../prisma/prisma.service';
import { TripRevenuesService } from '../../trip-revenues/services/trip-revenues.service';
import { InvoiceTripBillingDto } from '../dto/invoice-trip-billing.dto';
import { UpdateTripBillingDto } from '../dto/update-trip-billing.dto';
import { TripBillingEntity } from '../entities/trip-billing.entity';
import {
  buildLiveTripBillingEntity,
  toTripBillingEntity,
  TripBillingTripContext,
  TripBillingWithRelations,
} from '../mappers/trip-billing.mapper';
import { computeBillingStatusFromAmounts, resolveInvoiceAmount } from '../utils/billing-status.util';

const BILLING_INCLUDE = {
  entries: { include: { creator: true }, orderBy: { createdAt: 'asc' } },
  creator: true,
  updater: true,
  canceller: true,
} satisfies Prisma.TripBillingInclude;

interface TripContext {
  id: string;
  customerId: string | null;
  customerName: string | null;
  tripLabel: string;
}

@Injectable()
export class TripBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tripRevenuesService: TripRevenuesService,
    private readonly periodGuard: FinancialPeriodGuardService,
  ) {}

  async getTripBilling(tenantId: string, tripId: string): Promise<TripBillingEntity> {
    const trip = await this.findTripContext(tenantId, tripId);
    const freightContext = await this.getFreightContext(tenantId, tripId);

    const row = await this.prisma.tripBilling.findFirst({
      where: { tenantId, tripId },
      include: BILLING_INCLUDE,
    });

    const context: TripBillingTripContext = {
      tripLabel: trip.tripLabel,
      customerId: trip.customerId,
      customerName: trip.customerName,
      contractedAmount: freightContext.contractedAmount,
      calculatedAmount: freightContext.estimatedAmount,
    };

    if (row) {
      return toTripBillingEntity(row as TripBillingWithRelations, context);
    }

    const billableAmount = resolveTripFreightBestAmount(freightContext);
    return buildLiveTripBillingEntity(tenantId, tripId, { ...context, billableAmount });
  }

  /// POST .../trips/:tripId/invoice -- faturamento total (amount omitido)
  /// ou parcial (amount informado). Idempotente: uma vez que o saldo
  /// chega a zero, qualquer nova tentativa e bloqueada (nunca gera uma
  /// segunda receita para o mesmo evento). Reaproveita INTEGRALMENTE
  /// TripRevenuesService.create -- nenhuma logica de criacao de receita
  /// duplicada aqui.
  async invoice(
    tenantId: string,
    tripId: string,
    dto: InvoiceTripBillingDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripBillingEntity> {
    const trip = await this.findTripContext(tenantId, tripId);
    const existing = await this.prisma.tripBilling.findFirst({ where: { tenantId, tripId } });

    // Fase 103 -- snapshot: uma vez que o faturamento tem QUALQUER valor ja
    // lancado (existing.billableAmount preenchido), o valor faturavel fica
    // CONGELADO -- nunca mais recalculado de TripFreight, mesmo que
    // PATCH /freight/trips/:tripId edite contractedAmount/finalAmount
    // depois. So a PRIMEIRA chamada (nenhum TripBilling ainda) le o valor
    // vigente em TripFreight -- exatamente o momento em que "a fonte pode
    // sofrer alteracao posterior" deixa de importar para este faturamento.
    const frozenBillableAmount = existing ? toNumberOrNull(existing.billableAmount) : null;
    const billableAmount = frozenBillableAmount ?? resolveTripFreightBestAmount(await this.getFreightContext(tenantId, tripId));

    if (billableAmount === null) {
      throw new ConflictException(
        'Esta viagem ainda nao tem valor comercial calculado -- aplique um calculo de frete antes (Fase 59, POST /freight/trips/:tripId/apply).',
      );
    }

    if (existing && existing.status === TripBillingStatus.CANCELLED) {
      throw new ConflictException('Este faturamento foi cancelado -- nao e possivel faturar mais nada nele.');
    }
    if (existing && existing.status === TripBillingStatus.PAID) {
      throw new ConflictException('Este faturamento ja esta marcado como PAID -- nenhum saldo restante para faturar.');
    }

    const currentInvoiced = existing ? (toNumberOrNull(existing.invoicedAmount) ?? 0) : 0;
    const balance = billableAmount - currentInvoiced > 0 ? billableAmount - currentInvoiced : 0;

    const resolution = resolveInvoiceAmount(dto.amount, balance);
    if (!resolution.ok) {
      if (resolution.reason === 'NO_BALANCE') {
        throw new ConflictException('Nao ha saldo a faturar para esta viagem -- valor ja totalmente faturado.');
      }
      if (resolution.reason === 'EXCEEDS_BALANCE') {
        throw new BadRequestException(
          `O valor informado (${dto.amount}) ultrapassa o saldo faturavel (${balance}) -- nunca permitido.`,
        );
      }
      throw new BadRequestException('amount deve ser maior que zero.');
    }

    // Fase 76/79 -- mesma competencia (mes/ano) da receita gerada logo
    // abaixo (receivedAt); bloqueia o faturamento quando esse periodo ja
    // esta FECHADO, mesmo criterio ja aplicado por
    // Receivables/Payables/FinancialTransactions a cada mutacao com data
    // financeira.
    const financialDate = new Date();
    await this.periodGuard.assertPeriodOpenForDate(tenantId, financialDate);

    const revenue = await this.tripRevenuesService.create(
      tenantId,
      {
        tripId,
        category: RevenueCategory.FREIGHT,
        description: dto.notes
          ? `Faturamento operacional da viagem -- ${dto.notes}`
          : 'Faturamento operacional da viagem',
        amount: resolution.amount,
        receivedAt: financialDate.toISOString(),
        ...(trip.customerId ? { customerId: trip.customerId } : {}),
      },
      actor,
      metadata,
    );

    const newInvoicedAmount = currentInvoiced + resolution.amount;
    const newStatus = computeBillingStatusFromAmounts(billableAmount, newInvoicedAmount);

    const { billingId, entryId } = await this.prisma.$transaction(async (tx) => {
      const billing = existing
        ? await tx.tripBilling.update({
            where: { id: existing.id },
            data: {
              billableAmount,
              invoicedAmount: newInvoicedAmount,
              status: newStatus,
              updatedBy: actor.userId,
            },
          })
        : await tx.tripBilling.create({
            data: {
              tenantId,
              tripId,
              billableAmount,
              invoicedAmount: newInvoicedAmount,
              status: newStatus,
              createdBy: actor.userId,
            },
          });

      const entry = await tx.tripBillingEntry.create({
        data: {
          tenantId,
          tripBillingId: billing.id,
          amount: resolution.amount,
          revenueId: revenue.id,
          createdBy: actor.userId,
          ...compact({ notes: dto.notes }),
        },
      });

      return { billingId: billing.id, entryId: entry.id };
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: existing ? 'billing.updated' : 'billing.created',
      entityName: 'TripBilling',
      entityId: billingId,
      previousValue: existing ? toJsonSafe({ invoicedAmount: currentInvoiced, status: existing.status }) : null,
      newValue: toJsonSafe({ invoicedAmount: newInvoicedAmount, status: newStatus }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'billing.revenue_generated',
      entityName: 'TripBillingEntry',
      entityId: entryId,
      newValue: toJsonSafe({ amount: resolution.amount, revenueId: revenue.id }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return this.getTripBilling(tenantId, tripId);
  }

  /// PATCH .../trips/:tripId -- unica transicao manual permitida e para
  /// PAID (confirmacao humana de recebimento -- nunca inferida
  /// automaticamente, ver DTO). notes pode ser atualizado a qualquer
  /// momento (exceto quando CANCELLED).
  async updateStatus(
    tenantId: string,
    tripId: string,
    dto: UpdateTripBillingDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripBillingEntity> {
    const existing = await this.prisma.tripBilling.findFirst({ where: { tenantId, tripId } });
    if (!existing) {
      throw new NotFoundException(
        'Esta viagem ainda nao tem nenhum faturamento iniciado (POST .../trips/:tripId/invoice primeiro).',
      );
    }
    if (existing.status === TripBillingStatus.CANCELLED) {
      throw new ConflictException('Este faturamento foi cancelado -- nao pode mais ser alterado.');
    }
    if (
      dto.status === 'PAID' &&
      existing.status !== TripBillingStatus.INVOICED &&
      existing.status !== TripBillingStatus.PARTIALLY_INVOICED
    ) {
      throw new ConflictException('So e possivel marcar como PAID um faturamento com algum valor ja faturado.');
    }

    const updated = await this.prisma.tripBilling.update({
      where: { id: existing.id },
      data: {
        ...compact({ status: dto.status, notes: dto.notes }),
        updatedBy: actor.userId,
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'billing.updated',
      entityName: 'TripBilling',
      entityId: existing.id,
      previousValue: toJsonSafe({ status: existing.status, notes: existing.notes }),
      newValue: toJsonSafe({ status: updated.status, notes: updated.notes }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return this.getTripBilling(tenantId, tripId);
  }

  /// POST .../trips/:tripId/cancel -- bloqueia qualquer faturamento
  /// futuro. Entradas/receitas ja geradas NUNCA sao apagadas ou alteradas
  /// (historico imutavel, mesmo principio da Fase 59).
  async cancel(tenantId: string, tripId: string, actor: AuditActor, metadata: RequestMetadata): Promise<TripBillingEntity> {
    const existing = await this.prisma.tripBilling.findFirst({ where: { tenantId, tripId } });
    if (!existing) {
      throw new NotFoundException('Esta viagem ainda nao tem nenhum faturamento iniciado.');
    }
    if (existing.status === TripBillingStatus.CANCELLED) {
      throw new ConflictException('Este faturamento ja esta cancelado.');
    }

    const cancelled = await this.prisma.tripBilling.update({
      where: { id: existing.id },
      data: { status: TripBillingStatus.CANCELLED, cancelledAt: new Date(), cancelledBy: actor.userId },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'billing.cancelled',
      entityName: 'TripBilling',
      entityId: existing.id,
      previousValue: toJsonSafe({ status: existing.status }),
      newValue: toJsonSafe({ status: cancelled.status }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return this.getTripBilling(tenantId, tripId);
  }

  private async getFreightContext(
    tenantId: string,
    tripId: string,
  ): Promise<{ contractedAmount: number | null; finalAmount: number | null; estimatedAmount: number | null }> {
    const freight = await this.prisma.tripFreight.findFirst({
      where: { tenantId, tripId },
      select: { contractedAmount: true, finalAmount: true, estimatedAmount: true },
    });
    return {
      contractedAmount: toNumberOrNull(freight?.contractedAmount ?? null),
      finalAmount: toNumberOrNull(freight?.finalAmount ?? null),
      estimatedAmount: toNumberOrNull(freight?.estimatedAmount ?? null),
    };
  }

  private async findTripContext(tenantId: string, tripId: string): Promise<TripContext> {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, tenantId, deletedAt: null },
      select: {
        id: true,
        customerId: true,
        customer: { select: { name: true } },
        origin: { select: { name: true } },
        destination: { select: { name: true } },
      },
    });
    if (!trip) {
      throw new NotFoundException('Viagem (tripId) nao encontrada nesta empresa.');
    }
    return {
      id: trip.id,
      customerId: trip.customerId,
      customerName: trip.customer?.name ?? null,
      tripLabel: `${trip.origin.name} → ${trip.destination.name}`,
    };
  }
}
