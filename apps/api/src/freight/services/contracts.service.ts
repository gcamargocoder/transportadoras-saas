import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ContractStatus, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContractDto } from '../dto/create-contract.dto';
import { FindContractsQueryDto } from '../dto/find-contracts-query.dto';
import { UpdateContractDto } from '../dto/update-contract.dto';
import { ContractEntity } from '../entities/contract.entity';
import { PaginatedContractsEntity } from '../entities/paginated-contracts.entity';
import { ContractWithRelations, toContractEntity } from '../mappers/contract.mapper';

const CONTRACT_INCLUDE = {
  customer: true,
  creator: true,
  updater: true,
  _count: { select: { freightTables: true } },
} satisfies Prisma.ContractInclude;

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(tenantId: string, query: FindContractsQueryDto): Promise<PaginatedContractsEntity> {
    const where = this.buildWhere(tenantId, query);

    const [items, total] = await Promise.all([
      this.prisma.contract.findMany({
        where,
        include: CONTRACT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.contract.count({ where }),
    ]);

    const result = new PaginatedContractsEntity();
    result.items = items.map(toContractEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<ContractEntity> {
    return toContractEntity(await this.findOwnedOrThrow(tenantId, id));
  }

  async create(
    tenantId: string,
    dto: CreateContractDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<ContractEntity> {
    await this.assertCustomerExists(tenantId, dto.customerId);
    await this.assertCodeAvailable(tenantId, dto.code);

    const contract = await this.prisma.contract.create({
      data: {
        tenantId,
        customerId: dto.customerId,
        code: dto.code,
        startDate: new Date(dto.startDate),
        createdBy: actor.userId,
        ...compact({
          description: dto.description,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          notes: dto.notes,
          commercialTerms: dto.commercialTerms,
        }),
      },
      include: CONTRACT_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'contract.created',
      entityName: 'Contract',
      entityId: contract.id,
      newValue: toJsonSafe({ customerId: contract.customerId, code: contract.code, status: contract.status }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toContractEntity(contract);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateContractDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<ContractEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    if (dto.customerId) {
      await this.assertCustomerExists(tenantId, dto.customerId);
    }
    if (dto.code && dto.code !== before.code) {
      await this.assertCodeAvailable(tenantId, dto.code, id);
    }

    const contract = await this.prisma.contract.update({
      where: { id },
      data: {
        ...compact({
          customerId: dto.customerId,
          code: dto.code,
          description: dto.description,
          status: dto.status,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          notes: dto.notes,
          commercialTerms: dto.commercialTerms,
        }),
        updatedBy: actor.userId,
      },
      include: CONTRACT_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: this.resolveUpdateAction(before.status, contract.status),
      entityName: 'Contract',
      entityId: id,
      previousValue: toJsonSafe({ status: before.status, code: before.code, endDate: before.endDate }),
      newValue: toJsonSafe({ status: contract.status, code: contract.code, endDate: contract.endDate }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toContractEntity(contract);
  }

  /// Reaproveitado pelo FreightPricingService antes de aplicar um contrato
  /// a uma viagem nova (secao 1: "contrato vencido nao pode ser usado para
  /// novas viagens"). Nunca bloqueia edicao/consulta -- so a APLICACAO a
  /// uma viagem nova.
  async assertUsableForNewTrip(tenantId: string, contractId: string): Promise<ContractWithRelations> {
    const contract = await this.findOwnedOrThrow(tenantId, contractId);
    if (contract.status !== ContractStatus.ACTIVE) {
      throw new ConflictException(
        `Contrato ${contract.code} nao esta ACTIVE (status atual: ${contract.status}) -- nao pode ser usado em uma nova viagem.`,
      );
    }
    if (contract.endDate && contract.endDate.getTime() < Date.now()) {
      throw new ConflictException(`Contrato ${contract.code} esta vencido (endDate no passado).`);
    }
    return contract;
  }

  private resolveUpdateAction(previousStatus: ContractStatus, newStatus: ContractStatus): string {
    if (previousStatus === newStatus) return 'contract.updated';
    if (newStatus === ContractStatus.ACTIVE) return 'contract.activated';
    if (newStatus === ContractStatus.SUSPENDED) return 'contract.suspended';
    if (newStatus === ContractStatus.CANCELLED) return 'contract.cancelled';
    return 'contract.updated';
  }

  private buildWhere(tenantId: string, query: FindContractsQueryDto): Prisma.ContractWhereInput {
    return {
      tenantId,
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.expired ? { endDate: { lt: new Date() } } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
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

  private async assertCodeAvailable(tenantId: string, code: string, excludingId?: string): Promise<void> {
    const existing = await this.prisma.contract.findFirst({
      where: { tenantId, code, ...(excludingId ? { id: { not: excludingId } } : {}) },
    });
    if (existing) {
      throw new ConflictException(`Ja existe um contrato com o codigo "${code}" nesta empresa.`);
    }
  }

  private async findOwnedOrThrow(tenantId: string, id: string): Promise<ContractWithRelations> {
    const contract = await this.prisma.contract.findFirst({
      where: { id, tenantId },
      include: CONTRACT_INCLUDE,
    });
    if (!contract) {
      throw new NotFoundException('Contrato nao encontrado nesta empresa.');
    }
    return contract;
  }
}
