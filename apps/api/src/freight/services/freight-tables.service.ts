import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FreightRuleStatus, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFreightTableDto } from '../dto/create-freight-table.dto';
import { FindFreightTablesQueryDto } from '../dto/find-freight-tables-query.dto';
import { UpdateFreightTableDto } from '../dto/update-freight-table.dto';
import { FreightTableEntity } from '../entities/freight-table.entity';
import { PaginatedFreightTablesEntity } from '../entities/paginated-freight-tables.entity';
import { FreightTableWithRelations, toFreightTableEntity } from '../mappers/freight-table.mapper';

const TABLE_INCLUDE = {
  customer: true,
  contract: true,
  creator: true,
  updater: true,
  _count: { select: { rules: true } },
} satisfies Prisma.FreightTableInclude;

@Injectable()
export class FreightTablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(tenantId: string, query: FindFreightTablesQueryDto): Promise<PaginatedFreightTablesEntity> {
    const where = this.buildWhere(tenantId, query);

    const [items, total] = await Promise.all([
      this.prisma.freightTable.findMany({
        where,
        include: TABLE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.freightTable.count({ where }),
    ]);

    // Contagem de regras ACTIVE em lote (1 query extra, nunca 1 por linha
    // -- Prisma nao permite contar a mesma relacao 2x com filtros
    // diferentes dentro do mesmo _count.select).
    const activeCounts = await this.getActiveRuleCounts(
      tenantId,
      items.map((item) => item.id),
    );

    const result = new PaginatedFreightTablesEntity();
    result.items = items.map((item) => toFreightTableEntity(item, activeCounts.get(item.id) ?? 0));
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<FreightTableEntity> {
    const table = await this.findOwnedOrThrow(tenantId, id);
    const activeRulesCount = await this.prisma.freightRule.count({
      where: { tenantId, freightTableId: id, status: FreightRuleStatus.ACTIVE },
    });
    return toFreightTableEntity(table, activeRulesCount);
  }

  async create(
    tenantId: string,
    dto: CreateFreightTableDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<FreightTableEntity> {
    await this.assertCustomerExists(tenantId, dto.customerId);
    if (dto.contractId) {
      await this.assertContractExists(tenantId, dto.contractId);
    }
    await this.assertCodeAvailable(tenantId, dto.code);

    const table = await this.prisma.freightTable.create({
      data: {
        tenantId,
        customerId: dto.customerId,
        name: dto.name,
        code: dto.code,
        effectiveFrom: new Date(dto.effectiveFrom),
        createdBy: actor.userId,
        ...compact({
          contractId: dto.contractId,
          effectiveUntil: dto.effectiveUntil ? new Date(dto.effectiveUntil) : undefined,
          notes: dto.notes,
        }),
      },
      include: TABLE_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'freight_table.created',
      entityName: 'FreightTable',
      entityId: table.id,
      newValue: toJsonSafe({ customerId: table.customerId, code: table.code, status: table.status }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toFreightTableEntity(table, 0);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateFreightTableDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<FreightTableEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    if (dto.customerId) {
      await this.assertCustomerExists(tenantId, dto.customerId);
    }
    if (dto.contractId) {
      await this.assertContractExists(tenantId, dto.contractId);
    }
    if (dto.code && dto.code !== before.code) {
      await this.assertCodeAvailable(tenantId, dto.code, id);
    }

    const table = await this.prisma.freightTable.update({
      where: { id },
      data: {
        ...compact({
          customerId: dto.customerId,
          contractId: dto.contractId,
          name: dto.name,
          code: dto.code,
          status: dto.status,
          effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
          effectiveUntil: dto.effectiveUntil ? new Date(dto.effectiveUntil) : undefined,
          notes: dto.notes,
        }),
        updatedBy: actor.userId,
      },
      include: TABLE_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: before.status === table.status ? 'freight_table.updated' : 'freight_table.status_changed',
      entityName: 'FreightTable',
      entityId: id,
      previousValue: toJsonSafe({ status: before.status, code: before.code }),
      newValue: toJsonSafe({ status: table.status, code: table.code }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    const activeRulesCount = await this.prisma.freightRule.count({
      where: { tenantId, freightTableId: id, status: FreightRuleStatus.ACTIVE },
    });
    return toFreightTableEntity(table, activeRulesCount);
  }

  /// Reaproveitado pelo FreightRulesService/FreightPricingService --
  /// garante que o cliente informado bate com o dono real da tabela (nunca
  /// confia em customerId vindo solto do request).
  async findOwnedOrThrow(tenantId: string, id: string): Promise<FreightTableWithRelations> {
    const table = await this.prisma.freightTable.findFirst({
      where: { id, tenantId },
      include: TABLE_INCLUDE,
    });
    if (!table) {
      throw new NotFoundException('Tabela de frete nao encontrada nesta empresa.');
    }
    return table;
  }

  private async getActiveRuleCounts(tenantId: string, tableIds: string[]): Promise<Map<string, number>> {
    if (tableIds.length === 0) return new Map();
    const grouped = await this.prisma.freightRule.groupBy({
      by: ['freightTableId'],
      where: { tenantId, freightTableId: { in: tableIds }, status: FreightRuleStatus.ACTIVE },
      _count: { _all: true },
    });
    return new Map(grouped.map((row) => [row.freightTableId, row._count._all]));
  }

  private buildWhere(tenantId: string, query: FindFreightTablesQueryDto): Prisma.FreightTableWhereInput {
    return {
      tenantId,
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.contractId ? { contractId: query.contractId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
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

  private async assertContractExists(tenantId: string, contractId: string): Promise<void> {
    const contract = await this.prisma.contract.findFirst({ where: { id: contractId, tenantId } });
    if (!contract) {
      throw new NotFoundException('Contrato (contractId) nao encontrado nesta empresa.');
    }
  }

  private async assertCodeAvailable(tenantId: string, code: string, excludingId?: string): Promise<void> {
    const existing = await this.prisma.freightTable.findFirst({
      where: { tenantId, code, ...(excludingId ? { id: { not: excludingId } } : {}) },
    });
    if (existing) {
      throw new ConflictException(`Ja existe uma tabela de frete com o codigo "${code}" nesta empresa.`);
    }
  }
}
