import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FreightRuleStatus, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFreightRuleDto } from '../dto/create-freight-rule.dto';
import { FindFreightRulesQueryDto } from '../dto/find-freight-rules-query.dto';
import { ReviseFreightRuleDto } from '../dto/revise-freight-rule.dto';
import { FreightRuleEntity } from '../entities/freight-rule.entity';
import { PaginatedFreightRulesEntity } from '../entities/paginated-freight-rules.entity';
import { FreightRuleWithRelations, toFreightRuleEntity } from '../mappers/freight-rule.mapper';
import { FreightTablesService } from './freight-tables.service';

const RULE_INCLUDE = {
  creator: true,
  updater: true,
  nextVersion: { select: { id: true } },
} satisfies Prisma.FreightRuleInclude;

type RuleFieldValues = Pick<
  Prisma.FreightRuleUncheckedCreateInput,
  | 'originLocationId'
  | 'destinationLocationId'
  | 'originRegion'
  | 'destinationRegion'
  | 'cargoType'
  | 'vehicleType'
  | 'minWeightKg'
  | 'maxWeightKg'
  | 'minCubageM3'
  | 'maxCubageM3'
  | 'priority'
  | 'baseAmount'
  | 'perKmAmount'
  | 'perTonAmount'
  | 'minimumAmount'
  | 'tollAmount'
  | 'riskAdditionalAmount'
  | 'nightAdditionalAmount'
  | 'dailyRateAmount'
  | 'demurrageAmount'
  | 'otherFees'
  | 'notes'
>;

@Injectable()
export class FreightRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly freightTablesService: FreightTablesService,
  ) {}

  async findAll(tenantId: string, query: FindFreightRulesQueryDto): Promise<PaginatedFreightRulesEntity> {
    const where: Prisma.FreightRuleWhereInput = {
      tenantId,
      ...(query.freightTableId ? { freightTableId: query.freightTableId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.freightRule.findMany({
        where,
        include: RULE_INCLUDE,
        orderBy: [{ freightTableId: 'asc' }, { version: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.freightRule.count({ where }),
    ]);

    const result = new PaginatedFreightRulesEntity();
    result.items = items.map(toFreightRuleEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<FreightRuleEntity> {
    return toFreightRuleEntity(await this.findOwnedOrThrow(tenantId, id));
  }

  async create(
    tenantId: string,
    dto: CreateFreightRuleDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<FreightRuleEntity> {
    await this.freightTablesService.findOwnedOrThrow(tenantId, dto.freightTableId);

    const rule = await this.prisma.freightRule.create({
      data: {
        tenantId,
        freightTableId: dto.freightTableId,
        version: 1,
        status: FreightRuleStatus.ACTIVE,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date(),
        createdBy: actor.userId,
        ...this.extractFieldValues(dto),
      },
      include: RULE_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'freight_rule.created',
      entityName: 'FreightRule',
      entityId: rule.id,
      newValue: toJsonSafe({ freightTableId: rule.freightTableId, version: rule.version }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toFreightRuleEntity(rule);
  }

  /// Secao 4 -- nunca altera a linha em uso: fecha a versao atual
  /// (ARCHIVED, effectiveUntil = novo effectiveFrom) e cria uma nova
  /// (version + 1, previousVersionId = anterior) numa unica transacao.
  /// Campos omitidos no DTO sao herdados da versao anterior.
  async revise(
    tenantId: string,
    id: string,
    dto: ReviseFreightRuleDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<FreightRuleEntity> {
    const current = await this.findOwnedOrThrow(tenantId, id);
    if (current.status !== FreightRuleStatus.ACTIVE) {
      throw new ConflictException(
        'Somente uma regra ACTIVE pode ser revisada -- esta versao ja foi substituida ou arquivada.',
      );
    }

    const newEffectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();
    const overrides = this.extractFieldValues(dto);
    const inherited: RuleFieldValues = {
      originLocationId: current.originLocationId,
      destinationLocationId: current.destinationLocationId,
      originRegion: current.originRegion,
      destinationRegion: current.destinationRegion,
      cargoType: current.cargoType,
      vehicleType: current.vehicleType,
      minWeightKg: current.minWeightKg,
      maxWeightKg: current.maxWeightKg,
      minCubageM3: current.minCubageM3,
      maxCubageM3: current.maxCubageM3,
      priority: current.priority,
      baseAmount: current.baseAmount,
      perKmAmount: current.perKmAmount,
      perTonAmount: current.perTonAmount,
      minimumAmount: current.minimumAmount,
      tollAmount: current.tollAmount,
      riskAdditionalAmount: current.riskAdditionalAmount,
      nightAdditionalAmount: current.nightAdditionalAmount,
      dailyRateAmount: current.dailyRateAmount,
      demurrageAmount: current.demurrageAmount,
      otherFees: current.otherFees === null ? Prisma.JsonNull : (current.otherFees as Prisma.InputJsonValue),
      notes: current.notes,
    };

    const [, created] = await this.prisma.$transaction([
      this.prisma.freightRule.update({
        where: { id: current.id },
        data: { status: FreightRuleStatus.ARCHIVED, effectiveUntil: newEffectiveFrom },
      }),
      this.prisma.freightRule.create({
        data: {
          tenantId,
          freightTableId: current.freightTableId,
          version: current.version + 1,
          status: FreightRuleStatus.ACTIVE,
          previousVersionId: current.id,
          effectiveFrom: newEffectiveFrom,
          createdBy: actor.userId,
          ...compact({ ...inherited, ...overrides }),
        },
        include: RULE_INCLUDE,
      }),
    ]);

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'freight_rule.new_version_created',
      entityName: 'FreightRule',
      entityId: created.id,
      previousValue: toJsonSafe({ previousVersionId: current.id, version: current.version }),
      newValue: toJsonSafe({ version: created.version }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toFreightRuleEntity(await this.findOwnedOrThrow(tenantId, created.id));
  }

  private extractFieldValues(
    dto: CreateFreightRuleDto | ReviseFreightRuleDto,
  ): Partial<RuleFieldValues> {
    return compact({
      originLocationId: dto.originLocationId,
      destinationLocationId: dto.destinationLocationId,
      originRegion: dto.originRegion,
      destinationRegion: dto.destinationRegion,
      cargoType: dto.cargoType,
      vehicleType: dto.vehicleType,
      minWeightKg: dto.minWeightKg,
      maxWeightKg: dto.maxWeightKg,
      minCubageM3: dto.minCubageM3,
      maxCubageM3: dto.maxCubageM3,
      priority: dto.priority,
      baseAmount: dto.baseAmount,
      perKmAmount: dto.perKmAmount,
      perTonAmount: dto.perTonAmount,
      minimumAmount: dto.minimumAmount,
      tollAmount: dto.tollAmount,
      riskAdditionalAmount: dto.riskAdditionalAmount,
      nightAdditionalAmount: dto.nightAdditionalAmount,
      dailyRateAmount: dto.dailyRateAmount,
      demurrageAmount: dto.demurrageAmount,
      otherFees: dto.otherFees as Prisma.InputJsonValue | undefined,
      notes: dto.notes,
    });
  }

  async findOwnedOrThrow(tenantId: string, id: string): Promise<FreightRuleWithRelations> {
    const rule = await this.prisma.freightRule.findFirst({
      where: { id, tenantId },
      include: RULE_INCLUDE,
    });
    if (!rule) {
      throw new NotFoundException('Regra de frete nao encontrada nesta empresa.');
    }
    return rule;
  }
}
