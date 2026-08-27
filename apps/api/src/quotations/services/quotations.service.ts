import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, QuotationAmountSource, QuotationStatus, VehicleType } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { PaginatedAuditLogEntity } from '../../audit/entities/paginated-audit-log.entity';
import { toAuditLogEntity } from '../../audit/mappers/audit-log.mapper';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { FreightPricingService } from '../../freight/services/freight-pricing.service';
import { TripsService } from '../../trips/services/trips.service';
import { CreateQuotationDto } from '../dto/create-quotation.dto';
import { UpdateQuotationDto } from '../dto/update-quotation.dto';
import { UpdateQuotationStatusDto } from '../dto/update-quotation-status.dto';
import { ConvertQuotationToTripDto } from '../dto/convert-quotation-to-trip.dto';
import { FindQuotationsQueryDto } from '../dto/find-quotations-query.dto';
import { QuotationEntity } from '../entities/quotation.entity';
import { PaginatedQuotationsEntity } from '../entities/paginated-quotations.entity';
import { QuotationWithRelations, toQuotationEntity } from '../mappers/quotation.mapper';

const QUOTATION_INCLUDE = {
  customer: true,
  customerContact: true,
  originLocation: true,
  destinationLocation: true,
  freightTable: { select: { name: true } },
  freightRule: { select: { version: true } },
  creator: true,
  updater: true,
} satisfies Prisma.QuotationInclude;

// Estados finais: nunca saem de onde estao, nem para o conteudo (regra 7 --
// "impedir alteracoes incompativeis apos estados finais") nem para o
// status. DRAFT/SENT sao os unicos editaveis (ver assertContentEditable).
const ALLOWED_STATUS_TRANSITIONS: Record<QuotationStatus, QuotationStatus[]> = {
  DRAFT: [QuotationStatus.SENT, QuotationStatus.CANCELLED],
  SENT: [QuotationStatus.APPROVED, QuotationStatus.REJECTED, QuotationStatus.CANCELLED],
  APPROVED: [QuotationStatus.CONVERTED, QuotationStatus.CANCELLED],
  REJECTED: [],
  CONVERTED: [],
  CANCELLED: [],
};

interface ResolvedAmount {
  amount: number;
  amountSource: QuotationAmountSource;
  freightTableId: string | null;
  freightRuleId: string | null;
  baseAmount: number | null;
  additionsAmount: number | null;
  tollAmount: number | null;
  feesAmount: number | null;
  calculatedAmount: number | null;
  calculationInput: Prisma.InputJsonValue;
}

interface PricingInput {
  customerId: string;
  originLocationId: string;
  destinationLocationId: string;
  cargoType?: string | undefined;
  vehicleType?: VehicleType | undefined;
  weightKg?: number | undefined;
  cubageM3?: number | undefined;
  freightTableId?: string | undefined;
  nightService?: boolean | undefined;
  riskCargo?: boolean | undefined;
  dailyCount?: number | undefined;
  demurrageCount?: number | undefined;
  manualAmount?: number | undefined;
}

// Fase 94 -- Cotacoes: registra e acompanha solicitacoes de transporte de
// clientes, ANTES de existir uma Trip. Reutiliza integralmente Customer/
// CustomerContact (Fase 93), Location e o motor de precificacao existente
// (FreightPricingService.simulate, Fase 59) -- nunca duplica nenhum deles
// (regras 1/2/3). O valor e as condicoes sao SEMPRE um snapshot gravado no
// momento da cotacao (mesmo principio de TripFreight, Fase 59 secao 4/5):
// editar uma cotacao so recalcula quando o proprio pedido de edicao muda um
// parametro relevante ao calculo (ver assertContentEditable/resolveAmount);
// uma FreightTable/FreightRule sendo editada depois NUNCA altera
// silenciosamente uma cotacao ja gravada (regra 5).
@Injectable()
export class QuotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly freightPricingService: FreightPricingService,
    private readonly tripsService: TripsService,
  ) {}

  async findAll(tenantId: string, query: FindQuotationsQueryDto): Promise<PaginatedQuotationsEntity> {
    const where = this.buildWhere(tenantId, query);

    const [items, total] = await Promise.all([
      this.prisma.quotation.findMany({
        where,
        include: QUOTATION_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.quotation.count({ where }),
    ]);

    const result = new PaginatedQuotationsEntity();
    result.items = items.map(toQuotationEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<QuotationEntity> {
    return toQuotationEntity(await this.findOwnedOrThrow(tenantId, id));
  }

  async create(
    tenantId: string,
    dto: CreateQuotationDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<QuotationEntity> {
    await this.assertCustomerExists(tenantId, dto.customerId);
    if (dto.customerContactId) {
      await this.assertCustomerContactExists(tenantId, dto.customerId, dto.customerContactId);
    }
    await this.assertLocationExists(tenantId, dto.originLocationId);
    await this.assertLocationExists(tenantId, dto.destinationLocationId);

    const resolved = await this.resolveAmount(tenantId, {
      customerId: dto.customerId,
      originLocationId: dto.originLocationId,
      destinationLocationId: dto.destinationLocationId,
      cargoType: dto.cargoType,
      vehicleType: dto.vehicleType,
      weightKg: dto.weightKg,
      cubageM3: dto.cubageM3,
      freightTableId: dto.freightTableId,
      nightService: dto.nightService,
      riskCargo: dto.riskCargo,
      dailyCount: dto.dailyCount,
      demurrageCount: dto.demurrageCount,
      manualAmount: dto.manualAmount,
    });

    const quotation = await this.prisma.quotation.create({
      data: {
        tenantId,
        customerId: dto.customerId,
        originLocationId: dto.originLocationId,
        destinationLocationId: dto.destinationLocationId,
        validUntil: new Date(dto.validUntil),
        createdBy: actor.userId,
        ...resolved,
        ...compact({
          customerContactId: dto.customerContactId,
          cargoType: dto.cargoType,
          weightKg: dto.weightKg,
          cubageM3: dto.cubageM3,
          vehicleType: dto.vehicleType,
          conditions: dto.conditions,
        }),
      },
      include: QUOTATION_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'quotation.created',
      entityName: 'Quotation',
      entityId: quotation.id,
      newValue: toJsonSafe({
        customerId: quotation.customerId,
        status: quotation.status,
        amount: resolved.amount,
        amountSource: resolved.amountSource,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toQuotationEntity(quotation);
  }

  // PATCH /quotations/:id -- so permitido em DRAFT/SENT (regra 7). So
  // recalcula o valor quando o proprio pedido muda um parametro relevante ao
  // calculo (ou informa manualAmount) -- editar so `conditions`/
  // `customerContactId`/`validUntil` NUNCA reprocessa o valor ja gravado
  // (regra 5: preservar o que foi apresentado naquele momento).
  async update(
    tenantId: string,
    id: string,
    dto: UpdateQuotationDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<QuotationEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);
    this.assertContentEditable(before);

    const customerId = dto.customerId ?? before.customerId;
    if (dto.customerId) {
      await this.assertCustomerExists(tenantId, dto.customerId);
    }
    if (dto.customerContactId) {
      await this.assertCustomerContactExists(tenantId, customerId, dto.customerContactId);
    }
    if (dto.originLocationId) {
      await this.assertLocationExists(tenantId, dto.originLocationId);
    }
    if (dto.destinationLocationId) {
      await this.assertLocationExists(tenantId, dto.destinationLocationId);
    }

    const pricingKeys: (keyof CreateQuotationDto)[] = [
      'customerId',
      'originLocationId',
      'destinationLocationId',
      'cargoType',
      'vehicleType',
      'weightKg',
      'cubageM3',
      'freightTableId',
      'nightService',
      'riskCargo',
      'dailyCount',
      'demurrageCount',
      'manualAmount',
    ];
    const shouldRecalculate = pricingKeys.some((key) => dto[key] !== undefined);

    const resolved = shouldRecalculate
      ? await this.resolveAmount(tenantId, {
          customerId,
          originLocationId: dto.originLocationId ?? before.originLocationId,
          destinationLocationId: dto.destinationLocationId ?? before.destinationLocationId,
          cargoType: dto.cargoType ?? before.cargoType ?? undefined,
          vehicleType: dto.vehicleType ?? before.vehicleType ?? undefined,
          weightKg: dto.weightKg ?? (before.weightKg ? before.weightKg.toNumber() : undefined),
          cubageM3: dto.cubageM3 ?? (before.cubageM3 ? before.cubageM3.toNumber() : undefined),
          freightTableId: dto.freightTableId ?? before.freightTableId ?? undefined,
          nightService: dto.nightService,
          riskCargo: dto.riskCargo,
          dailyCount: dto.dailyCount,
          demurrageCount: dto.demurrageCount,
          manualAmount: dto.manualAmount,
        })
      : null;

    const quotation = await this.prisma.quotation.update({
      where: { id: before.id },
      data: {
        ...compact({
          customerId: dto.customerId,
          customerContactId: dto.customerContactId,
          originLocationId: dto.originLocationId,
          destinationLocationId: dto.destinationLocationId,
          cargoType: dto.cargoType,
          weightKg: dto.weightKg,
          cubageM3: dto.cubageM3,
          vehicleType: dto.vehicleType,
          conditions: dto.conditions,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        }),
        ...(resolved ?? {}),
        updatedBy: actor.userId,
      },
      include: QUOTATION_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'quotation.updated',
      entityName: 'Quotation',
      entityId: id,
      previousValue: toJsonSafe({ amount: Number(before.amount), amountSource: before.amountSource }),
      newValue: toJsonSafe({ amount: quotation.amount, amountSource: quotation.amountSource }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toQuotationEntity(quotation);
  }

  // PATCH /quotations/:id/status -- unica forma de mudar o status (regra 6:
  // transicoes claras e explicitas, ver ALLOWED_STATUS_TRANSITIONS).
  async updateStatus(
    tenantId: string,
    id: string,
    dto: UpdateQuotationStatusDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<QuotationEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    if (before.status === dto.status) {
      return toQuotationEntity(before);
    }
    const allowed = ALLOWED_STATUS_TRANSITIONS[before.status];
    if (!allowed.includes(dto.status)) {
      throw new ConflictException(`Transicao de status invalida: ${before.status} -> ${dto.status}.`);
    }
    if (dto.status === QuotationStatus.CONVERTED) {
      throw new ConflictException(
        'CONVERTED so e definido por POST /quotations/:id/convert-to-trip -- nunca diretamente.',
      );
    }

    const quotation = await this.prisma.quotation.update({
      where: { id: before.id },
      data: { status: dto.status, updatedBy: actor.userId },
      include: QUOTATION_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'quotation.status_changed',
      entityName: 'Quotation',
      entityId: id,
      previousValue: { status: before.status },
      newValue: { status: quotation.status },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toQuotationEntity(quotation);
  }

  // POST /quotations/:id/convert-to-trip -- unica "proxima etapa" que a
  // arquitetura atual suporta de fato (regra 10 da Fase 94; Pipeline/
  // Proposta ficam para fases futuras, regra 9). Reaproveita INTEGRALMENTE
  // TripsService.create -- nenhuma segunda logica de criacao de viagem.
  // Nao aplica nenhum calculo financeiro a viagem criada (regra 10: sem
  // nova funcionalidade financeira) -- isso continua sendo uma acao
  // separada e deliberada via POST /freight/trips/:tripId/apply, ja
  // existente.
  async convertToTrip(
    tenantId: string,
    id: string,
    dto: ConvertQuotationToTripDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<QuotationEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);
    if (before.status !== QuotationStatus.APPROVED) {
      throw new ConflictException(
        `Somente cotacoes APPROVED podem ser convertidas em viagem (status atual: ${before.status}).`,
      );
    }

    const trip = await this.tripsService.create(
      tenantId,
      {
        customerId: before.customerId,
        originLocationId: before.originLocationId,
        destinationLocationId: before.destinationLocationId,
        driverId: dto.driverId,
        compositionId: dto.compositionId,
        plannedDeparture: dto.plannedDeparture,
        plannedArrival: dto.plannedArrival,
        ...compact({ tollRouteId: dto.tollRouteId, priority: dto.priority, notes: before.conditions ?? undefined }),
      },
      actor,
      metadata,
    );

    const quotation = await this.prisma.quotation.update({
      where: { id: before.id },
      data: { status: QuotationStatus.CONVERTED, convertedTripId: trip.id, updatedBy: actor.userId },
      include: QUOTATION_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'quotation.converted',
      entityName: 'Quotation',
      entityId: id,
      previousValue: { status: before.status },
      newValue: { status: quotation.status, convertedTripId: trip.id },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toQuotationEntity(quotation);
  }

  // GET /quotations/:id/history -- historico basico de alteracoes (regra
  // "histórico básico de alterações"), reaproveitando INTEGRALMENTE
  // AuditService.findByEntity (mesmo padrao ja usado por Vehicle/Tire/
  // Maintenance/FiscalDocument/Tenant) -- nenhuma tabela de historico
  // paralela criada para esta fase.
  async getHistory(tenantId: string, id: string, pagination: PaginationQueryDto): Promise<PaginatedAuditLogEntity> {
    await this.findOwnedOrThrow(tenantId, id);

    const { items, total } = await this.audit.findByEntity(tenantId, 'Quotation', id, pagination);

    const result = new PaginatedAuditLogEntity();
    result.items = items.map(toAuditLogEntity);
    result.meta = buildPaginationMeta(total, pagination.page, pagination.pageSize);
    return result;
  }

  private async resolveAmount(tenantId: string, input: PricingInput): Promise<ResolvedAmount> {
    const calculatedAt = new Date().toISOString();
    const calculationInput = toJsonSafe({
      customerId: input.customerId,
      originLocationId: input.originLocationId,
      destinationLocationId: input.destinationLocationId,
      cargoType: input.cargoType ?? null,
      vehicleType: input.vehicleType ?? null,
      weightKg: input.weightKg ?? null,
      cubageM3: input.cubageM3 ?? null,
      nightService: input.nightService ?? false,
      riskCargo: input.riskCargo ?? false,
      dailyCount: input.dailyCount ?? 0,
      demurrageCount: input.demurrageCount ?? 0,
      calculatedAt,
    }) as Prisma.InputJsonValue;

    const quote = await this.freightPricingService.simulate(tenantId, {
      customerId: input.customerId,
      ...compact({
        originLocationId: input.originLocationId,
        destinationLocationId: input.destinationLocationId,
        cargoType: input.cargoType,
        vehicleType: input.vehicleType,
        weightKg: input.weightKg,
        cubageM3: input.cubageM3,
        freightTableId: input.freightTableId,
        nightService: input.nightService,
        riskCargo: input.riskCargo,
        dailyCount: input.dailyCount,
        demurrageCount: input.demurrageCount,
      }),
    });

    if (!quote.available) {
      if (input.manualAmount === undefined) {
        throw new ConflictException(
          `Nao foi possivel calcular o frete automaticamente: ${quote.reason} Informe manualAmount para cotar manualmente.`,
        );
      }
      return {
        amount: input.manualAmount,
        amountSource: QuotationAmountSource.MANUAL,
        freightTableId: null,
        freightRuleId: null,
        baseAmount: null,
        additionsAmount: null,
        tollAmount: null,
        feesAmount: null,
        calculatedAmount: null,
        calculationInput,
      };
    }

    const usesManual = input.manualAmount !== undefined;
    return {
      amount: usesManual ? (input.manualAmount as number) : (quote.totalAmount as number),
      amountSource: usesManual ? QuotationAmountSource.MANUAL : QuotationAmountSource.CALCULATED,
      freightTableId: quote.freightTableId,
      freightRuleId: quote.ruleId,
      baseAmount: quote.baseAmount,
      additionsAmount: quote.additionsAmount,
      tollAmount: quote.tollAmount,
      feesAmount: quote.feesAmount,
      calculatedAmount: quote.totalAmount,
      calculationInput,
    };
  }

  // DRAFT/SENT: conteudo e valor ainda podem mudar. A partir de
  // APPROVED/REJECTED/CONVERTED/CANCELLED (todos finais para o conteudo),
  // nenhuma edicao e permitida -- so a transicao de status explicitamente
  // permitida por ALLOWED_STATUS_TRANSITIONS (regra 7).
  private assertContentEditable(quotation: { status: QuotationStatus }): void {
    if (quotation.status !== QuotationStatus.DRAFT && quotation.status !== QuotationStatus.SENT) {
      throw new ConflictException(
        `Cotacao em status ${quotation.status} nao pode mais ser editada.`,
      );
    }
  }

  private buildWhere(tenantId: string, query: FindQuotationsQueryDto): Prisma.QuotationWhereInput {
    return {
      tenantId,
      ...compact({ customerId: query.customerId, status: query.status }),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { cargoType: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { conditions: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { customer: { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } } },
            ],
          }
        : {}),
    };
  }

  private async assertCustomerExists(tenantId: string, customerId: string): Promise<void> {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, tenantId } });
    if (!customer) {
      throw new NotFoundException('Cliente (customerId) nao encontrado nesta empresa.');
    }
  }

  private async assertCustomerContactExists(tenantId: string, customerId: string, contactId: string): Promise<void> {
    const contact = await this.prisma.customerContact.findFirst({ where: { id: contactId, tenantId, customerId } });
    if (!contact) {
      throw new NotFoundException('Contato (customerContactId) nao encontrado para este cliente.');
    }
  }

  private async assertLocationExists(tenantId: string, locationId: string): Promise<void> {
    const location = await this.prisma.location.findFirst({ where: { id: locationId, tenantId } });
    if (!location) {
      throw new NotFoundException('Local (origem/destino) nao encontrado nesta empresa.');
    }
  }

  private async findOwnedOrThrow(tenantId: string, id: string): Promise<QuotationWithRelations> {
    const quotation = await this.prisma.quotation.findFirst({
      where: { id, tenantId },
      include: QUOTATION_INCLUDE,
    });
    if (!quotation) {
      throw new NotFoundException('Cotacao nao encontrada nesta empresa.');
    }
    return quotation;
  }
}
