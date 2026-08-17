import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FreightRuleStatus, FreightTableStatus, Prisma, RevenueCategory } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { TripRevenuesService } from '../../trip-revenues/services/trip-revenues.service';
import { TripSettlementsService } from '../../trip-settlements/services/trip-settlements.service';
import { ApplyFreightToTripDto } from '../dto/apply-freight-to-trip.dto';
import { SimulateFreightDto } from '../dto/simulate-freight.dto';
import { UpdateTripFreightDto } from '../dto/update-trip-freight.dto';
import { FreightQuoteEntity } from '../entities/freight-quote.entity';
import { TripFreightEntity } from '../entities/trip-freight.entity';
import { TripProfitabilityEntity } from '../entities/trip-profitability.entity';
import { toFreightRuleCandidate } from '../mappers/freight-rule.mapper';
import { toTripFreightEntity } from '../mappers/trip-freight.mapper';
import { computeFreightQuote, FreightMatchCriteria, selectApplicableFreightRule } from '../utils/freight-calculation.util';
import { ContractsService } from './contracts.service';

const TRIP_FREIGHT_INCLUDE = {
  contract: true,
  freightTable: true,
  freightRule: { select: { version: true } },
  creator: true,
  updater: true,
} satisfies Prisma.TripFreightInclude;

interface ResolvedQuote {
  quote: FreightQuoteEntity;
  ruleId: string | null;
  freightTableId: string | null;
}

@Injectable()
export class FreightPricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly contractsService: ContractsService,
    private readonly tripRevenuesService: TripRevenuesService,
    private readonly tripSettlementsService: TripSettlementsService,
  ) {}

  /// GET /freight/simulate -- nunca persiste nada (secao 6).
  async simulate(tenantId: string, dto: SimulateFreightDto): Promise<FreightQuoteEntity> {
    await this.assertCustomerExists(tenantId, dto.customerId);
    const asOf = dto.asOf ? new Date(dto.asOf) : new Date();
    const resolved = await this.resolveQuote(tenantId, dto.customerId, dto, asOf);
    return resolved.quote;
  }

  async getTripFreight(tenantId: string, tripId: string): Promise<TripFreightEntity | null> {
    await this.findTripOrThrow(tenantId, tripId);
    const row = await this.prisma.tripFreight.findFirst({
      where: { tenantId, tripId },
      include: TRIP_FREIGHT_INCLUDE,
    });
    return row ? toTripFreightEntity(row) : null;
  }

  /// POST /freight/trips/:tripId/apply -- recalcula e grava um SNAPSHOT
  /// (secao 7). Reaplicar (nova simulacao para a mesma viagem) atualiza
  /// APENAS os campos calculados -- contractedAmount/finalAmount/revenueId
  /// (definidos por um humano, seção 8) NUNCA sao sobrescritos aqui.
  async applyToTrip(
    tenantId: string,
    tripId: string,
    dto: ApplyFreightToTripDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripFreightEntity> {
    const trip = await this.findTripOrThrow(tenantId, tripId);

    const customerId = dto.customerId ?? trip.customerId ?? null;
    if (!customerId) {
      throw new ConflictException(
        'customerId e obrigatorio: a viagem nao tem cliente definido e nenhum foi informado na requisicao.',
      );
    }
    await this.assertCustomerExists(tenantId, customerId);

    if (dto.contractId) {
      await this.contractsService.assertUsableForNewTrip(tenantId, dto.contractId);
    }

    const asOf = new Date();
    const resolved = await this.resolveQuote(tenantId, customerId, dto, asOf);

    const calculationInput = toJsonSafe({
      customerId,
      originLocationId: dto.originLocationId ?? null,
      destinationLocationId: dto.destinationLocationId ?? null,
      originRegion: dto.originRegion ?? null,
      destinationRegion: dto.destinationRegion ?? null,
      cargoType: dto.cargoType ?? null,
      vehicleType: dto.vehicleType ?? null,
      distanceKm: dto.distanceKm ?? null,
      weightKg: dto.weightKg ?? null,
      cubageM3: dto.cubageM3 ?? null,
      nightService: dto.nightService ?? false,
      riskCargo: dto.riskCargo ?? false,
      dailyCount: dto.dailyCount ?? 0,
      demurrageCount: dto.demurrageCount ?? 0,
      calculatedAt: asOf.toISOString(),
    }) as Prisma.InputJsonValue;

    const existing = await this.prisma.tripFreight.findFirst({ where: { tenantId, tripId } });

    const snapshotData = {
      ...compact({ contractId: dto.contractId }),
      freightTableId: resolved.freightTableId,
      freightRuleId: resolved.ruleId,
      calculationInput,
      baseAmount: resolved.quote.baseAmount,
      additionsAmount: resolved.quote.additionsAmount,
      tollAmount: resolved.quote.tollAmount,
      feesAmount: resolved.quote.feesAmount,
      estimatedAmount: resolved.quote.totalAmount,
    };

    const row = existing
      ? await this.prisma.tripFreight.update({
          where: { id: existing.id },
          data: { ...snapshotData, updatedBy: actor.userId },
          include: TRIP_FREIGHT_INCLUDE,
        })
      : await this.prisma.tripFreight.create({
          data: { tenantId, tripId, createdBy: actor.userId, ...snapshotData },
          include: TRIP_FREIGHT_INCLUDE,
        });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: existing ? 'trip_freight.recalculated' : 'trip_freight.applied',
      entityName: 'TripFreight',
      entityId: row.id,
      previousValue: existing ? toJsonSafe({ estimatedAmount: existing.estimatedAmount }) : null,
      newValue: toJsonSafe({
        freightRuleId: row.freightRuleId,
        estimatedAmount: row.estimatedAmount,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripFreightEntity(row);
  }

  /// PATCH /freight/trips/:tripId -- edicao humana de contractedAmount/
  /// finalAmount (secao 7/8). Nunca recalcula, nunca mexe em estimatedAmount.
  async updateTripFreight(
    tenantId: string,
    tripId: string,
    dto: UpdateTripFreightDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripFreightEntity> {
    await this.findTripOrThrow(tenantId, tripId);
    const existing = await this.prisma.tripFreight.findFirst({ where: { tenantId, tripId } });
    if (!existing) {
      throw new NotFoundException(
        'Esta viagem ainda nao tem uma cotacao comercial aplicada (POST /freight/trips/:tripId/apply primeiro).',
      );
    }

    const row = await this.prisma.tripFreight.update({
      where: { id: existing.id },
      data: {
        ...compact({ contractedAmount: dto.contractedAmount, finalAmount: dto.finalAmount }),
        updatedBy: actor.userId,
      },
      include: TRIP_FREIGHT_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_freight.updated',
      entityName: 'TripFreight',
      entityId: row.id,
      previousValue: toJsonSafe({ contractedAmount: existing.contractedAmount, finalAmount: existing.finalAmount }),
      newValue: toJsonSafe({ contractedAmount: row.contractedAmount, finalAmount: row.finalAmount }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripFreightEntity(row);
  }

  /// POST /freight/trips/:tripId/apply-revenue -- secao 8: usa o valor
  /// comercial como referencia para a receita, nunca duplica (revenueId e
  /// @unique -- reaplica retorna a mesma receita ja criada, nunca cria
  /// outra) e reaproveita INTEGRALMENTE TripRevenuesService.create (nenhuma
  /// logica de criacao de receita duplicada aqui).
  async applyRevenue(
    tenantId: string,
    tripId: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripFreightEntity> {
    const trip = await this.findTripOrThrow(tenantId, tripId);
    const existing = await this.prisma.tripFreight.findFirst({ where: { tenantId, tripId } });
    if (!existing) {
      throw new NotFoundException(
        'Esta viagem ainda nao tem uma cotacao comercial aplicada (POST /freight/trips/:tripId/apply primeiro).',
      );
    }
    if (existing.revenueId) {
      throw new ConflictException(
        'Ja existe uma receita gerada a partir deste valor comercial -- nunca duplicada automaticamente.',
      );
    }
    // Fase 60 -- quando o faturamento operacional (TripBilling) ja foi
    // iniciado para esta viagem, ele passa a ser o unico caminho valido
    // para gerar receita (suporta parcial, este endpoint so sabe faturar
    // o valor cheio) -- bloqueia aqui para nunca duplicar/expandir alem
    // do saldo ja controlado por TripBillingService.
    const existingBilling = await this.prisma.tripBilling.findFirst({ where: { tenantId, tripId } });
    if (existingBilling) {
      throw new ConflictException(
        'Esta viagem ja usa o faturamento operacional (Fase 60) -- utilize POST /operational-billing/trips/:tripId/invoice.',
      );
    }

    const amount =
      existing.contractedAmount != null
        ? Number(existing.contractedAmount)
        : existing.finalAmount != null
          ? Number(existing.finalAmount)
          : existing.estimatedAmount != null
            ? Number(existing.estimatedAmount)
            : null;
    if (amount === null) {
      throw new ConflictException(
        'Nenhum valor comercial disponivel (contratado/final/estimado) -- nao ha o que registrar como receita.',
      );
    }

    const revenue = await this.tripRevenuesService.create(
      tenantId,
      {
        tripId,
        category: RevenueCategory.FREIGHT,
        description: 'Frete contratado (gerado a partir do valor comercial da viagem)',
        amount,
        receivedAt: new Date().toISOString(),
        ...(trip.customerId ? { customerId: trip.customerId } : {}),
      },
      actor,
      metadata,
    );

    const row = await this.prisma.tripFreight.update({
      where: { id: existing.id },
      data: { revenueId: revenue.id, updatedBy: actor.userId },
      include: TRIP_FREIGHT_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_freight.revenue_applied',
      entityName: 'TripFreight',
      entityId: row.id,
      newValue: toJsonSafe({ revenueId: revenue.id, amount }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripFreightEntity(row);
  }

  /// GET /freight/trips/:tripId/profitability -- secao 9: reaproveita
  /// INTEGRALMENTE TripSettlementsService.getFinancialDashboard (Fase 51)
  /// para receita/custo realizados -- nenhum custo e recalculado aqui.
  /// "Custo previsto" nao existe como conceito no projeto: a margem
  /// prevista compara o valor CONTRATADO contra o custo JA REALIZADO
  /// conhecido ate o momento (nunca uma estimativa de custo inventada).
  async getProfitability(tenantId: string, tripId: string): Promise<TripProfitabilityEntity> {
    await this.findTripOrThrow(tenantId, tripId);

    const [tripFreight, financialDashboard] = await Promise.all([
      this.prisma.tripFreight.findFirst({ where: { tenantId, tripId } }),
      this.tripSettlementsService.getFinancialDashboard(tenantId, tripId),
    ]);

    const contractedAmount =
      tripFreight?.contractedAmount != null
        ? Number(tripFreight.contractedAmount)
        : tripFreight?.finalAmount != null
          ? Number(tripFreight.finalAmount)
          : tripFreight?.estimatedAmount != null
            ? Number(tripFreight.estimatedAmount)
            : null;

    const entity = new TripProfitabilityEntity();
    entity.tripId = tripId;
    entity.contractedAmount = contractedAmount;
    entity.contractedAmountAvailable = contractedAmount !== null;
    entity.realizedRevenue = financialDashboard.totalRevenue;
    entity.realizedCost = financialDashboard.totalCost;
    entity.projectedMargin = contractedAmount !== null ? contractedAmount - financialDashboard.totalCost : null;
    entity.projectedResult = entity.projectedMargin;
    entity.realResult = financialDashboard.grossResult;
    entity.resultDifference = entity.projectedResult !== null ? entity.realResult - entity.projectedResult : null;
    return entity;
  }

  private async resolveQuote(
    tenantId: string,
    customerId: string,
    input: SimulateFreightDto | ApplyFreightToTripDto,
    asOf: Date,
  ): Promise<ResolvedQuote> {
    const tables = await this.prisma.freightTable.findMany({
      where: {
        tenantId,
        customerId,
        status: FreightTableStatus.ACTIVE,
        effectiveFrom: { lte: asOf },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: asOf } }],
        ...('freightTableId' in input && input.freightTableId ? { id: input.freightTableId } : {}),
      },
    });

    if (tables.length === 0) {
      return {
        quote: this.buildUnavailableQuote('Nenhuma tabela de frete ACTIVE e vigente encontrada para este cliente.'),
        ruleId: null,
        freightTableId: null,
      };
    }

    const tableIds = tables.map((table) => table.id);
    const rules = await this.prisma.freightRule.findMany({
      where: { tenantId, freightTableId: { in: tableIds }, status: FreightRuleStatus.ACTIVE },
    });

    const criteria: FreightMatchCriteria = {
      originLocationId: input.originLocationId ?? null,
      destinationLocationId: input.destinationLocationId ?? null,
      originRegion: input.originRegion ?? null,
      destinationRegion: input.destinationRegion ?? null,
      cargoType: input.cargoType ?? null,
      vehicleType: input.vehicleType ?? null,
      weightKg: input.weightKg ?? null,
      cubageM3: input.cubageM3 ?? null,
      asOf,
    };

    const candidates = rules.map(toFreightRuleCandidate);
    const selected = selectApplicableFreightRule(candidates, criteria);

    if (!selected) {
      return {
        quote: this.buildUnavailableQuote(
          'Nenhuma regra de frete compativel com os parametros informados (verifique origem/destino/tipo de ' +
            'veiculo/carga/faixa de peso ou cubagem).',
        ),
        ruleId: null,
        freightTableId: tables.length === 1 ? (tables[0]?.id ?? null) : null,
      };
    }

    const breakdown = computeFreightQuote(selected, {
      distanceKm: input.distanceKm ?? null,
      weightKg: input.weightKg ?? null,
      cubageM3: input.cubageM3 ?? null,
      nightService: input.nightService ?? false,
      riskCargo: input.riskCargo ?? false,
      dailyCount: input.dailyCount ?? 0,
      demurrageCount: input.demurrageCount ?? 0,
    });

    const table = tables.find((item) => item.id === selected.freightTableId) ?? null;

    const quote = new FreightQuoteEntity();
    quote.available = true;
    quote.reason = null;
    quote.freightTableId = selected.freightTableId;
    quote.freightTableName = table?.name ?? null;
    quote.ruleId = breakdown.ruleId;
    quote.ruleVersion = breakdown.ruleVersion;
    quote.baseAmount = breakdown.baseAmount;
    quote.additionsAmount = breakdown.additionsAmount;
    quote.tollAmount = breakdown.tollAmount;
    quote.feesAmount = breakdown.feesAmount;
    quote.totalAmount = breakdown.totalAmount;

    return { quote, ruleId: selected.id, freightTableId: selected.freightTableId };
  }

  private buildUnavailableQuote(reason: string): FreightQuoteEntity {
    const quote = new FreightQuoteEntity();
    quote.available = false;
    quote.reason = reason;
    quote.freightTableId = null;
    quote.freightTableName = null;
    quote.ruleId = null;
    quote.ruleVersion = null;
    quote.baseAmount = null;
    quote.additionsAmount = null;
    quote.tollAmount = null;
    quote.feesAmount = null;
    quote.totalAmount = null;
    return quote;
  }

  private async assertCustomerExists(tenantId: string, customerId: string): Promise<void> {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, tenantId } });
    if (!customer) {
      throw new NotFoundException('Cliente (customerId) nao encontrado nesta empresa.');
    }
  }

  private async findTripOrThrow(
    tenantId: string,
    tripId: string,
  ): Promise<{ id: string; customerId: string | null }> {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, tenantId, deletedAt: null },
      select: { id: true, customerId: true },
    });
    if (!trip) {
      throw new NotFoundException('Viagem (tripId) nao encontrada nesta empresa.');
    }
    return trip;
  }
}
