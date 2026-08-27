import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ContractRenewalStatus, ContractStatus, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { resolveDocumentExpiryStatus } from '../../fleet/utils/document-expiry.util';
import { ContractsService } from '../../freight/services/contracts.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CompleteContractRenewalDto } from '../dto/complete-contract-renewal.dto';
import { ContractRenewalSummaryQueryDto } from '../dto/contract-renewal-summary-query.dto';
import { CreateContractRenewalDto } from '../dto/create-contract-renewal.dto';
import { FindContractRenewalsQueryDto } from '../dto/find-contract-renewals-query.dto';
import { FindExpiringContractsQueryDto } from '../dto/find-expiring-contracts-query.dto';
import { ContractRenewalEntity } from '../entities/contract-renewal.entity';
import { ContractRenewalSummaryEntity } from '../entities/contract-renewal-summary.entity';
import { ContractExpiryStatus, ExpiringContractEntity } from '../entities/expiring-contract.entity';
import { PaginatedContractRenewalsEntity } from '../entities/paginated-contract-renewals.entity';
import { PaginatedExpiringContractsEntity } from '../entities/paginated-expiring-contracts.entity';
import { ContractRenewalWithRelations, toContractRenewalEntity } from '../mappers/contract-renewal.mapper';

const RENEWAL_INCLUDE = {
  previousContract: { select: { code: true, customerId: true, customer: { select: { name: true } } } },
  newContract: { select: { code: true } },
  initiator: { select: { name: true } },
  completer: { select: { name: true } },
  canceller: { select: { name: true } },
} satisfies Prisma.ContractRenewalInclude;

// Contratos elegiveis para alerta/renovacao: precisam ja ter estado em uso
// (ACTIVE) ou ja vencidos (EXPIRED) -- um DRAFT nunca chegou a valer e um
// CANCELLED esta encerrado, entao nenhum dos dois entra em "vencendo/vencido".
const EXPIRY_ELIGIBLE_STATUSES: ContractStatus[] = [ContractStatus.ACTIVE, ContractStatus.EXPIRED];

@Injectable()
export class ContractRenewalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly contractsService: ContractsService,
  ) {}

  /// Secao "acao para iniciar uma renovacao". Snapshotta previousEndDate no
  /// momento da abertura -- a vigencia anterior nunca e reescrita depois
  /// disso (regra 3).
  async initiate(
    tenantId: string,
    dto: CreateContractRenewalDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<ContractRenewalEntity> {
    const contract = await this.contractsService.findOne(tenantId, dto.contractId);

    if (contract.status !== ContractStatus.ACTIVE && contract.status !== ContractStatus.EXPIRED) {
      throw new ConflictException(
        `Contrato ${contract.code} esta ${contract.status} -- somente contratos ACTIVE ou EXPIRED podem ser renovados.`,
      );
    }

    await this.assertNoPendingRenewal(tenantId, dto.contractId);

    const renewal = await this.prisma.contractRenewal.create({
      data: {
        tenantId,
        previousContractId: dto.contractId,
        previousEndDate: contract.endDate,
        initiatedBy: actor.userId,
        ...compact({ notes: dto.notes }),
      },
      include: RENEWAL_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'contract_renewal.initiated',
      entityName: 'ContractRenewal',
      entityId: renewal.id,
      newValue: toJsonSafe({ previousContractId: dto.contractId, previousEndDate: contract.endDate }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toContractRenewalEntity(renewal as ContractRenewalWithRelations);
  }

  /// Secao "acao para concluir uma renovacao". Cria um Contract NOVO de
  /// verdade via ContractsService.create (regra 2 -- nunca um segundo
  /// sistema de contratos), ativa-o, e marca o contrato anterior como
  /// EXPIRED -- sem jamais tocar em startDate/endDate/commercialTerms/notes
  /// do contrato anterior (regra 3). Campos omitidos no DTO sao herdados do
  /// contrato anterior (mesmo espirito de FreightRulesService.revise).
  async complete(
    tenantId: string,
    id: string,
    dto: CompleteContractRenewalDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<ContractRenewalEntity> {
    const renewal = await this.findOwnedOrThrow(tenantId, id);
    if (renewal.status !== ContractRenewalStatus.PENDING) {
      throw new ConflictException(
        `Renovacao esta ${renewal.status} -- somente uma renovacao PENDING pode ser concluida.`,
      );
    }

    const previousContract = await this.contractsService.findOne(tenantId, renewal.previousContractId);

    const newContract = await this.contractsService.create(
      tenantId,
      {
        customerId: previousContract.customerId,
        code: dto.code,
        startDate: dto.startDate,
        ...compact({
          endDate: dto.endDate,
          description: dto.description ?? previousContract.description ?? undefined,
          commercialTerms: dto.commercialTerms ?? previousContract.commercialTerms ?? undefined,
          notes: dto.notes ?? previousContract.notes ?? undefined,
        }),
      },
      actor,
      metadata,
    );
    await this.contractsService.update(tenantId, newContract.id, { status: ContractStatus.ACTIVE }, actor, metadata);
    await this.contractsService.update(
      tenantId,
      previousContract.id,
      { status: ContractStatus.EXPIRED },
      actor,
      metadata,
    );

    const updated = await this.prisma.contractRenewal.update({
      where: { id },
      data: {
        status: ContractRenewalStatus.COMPLETED,
        newContractId: newContract.id,
        newStartDate: new Date(dto.startDate),
        newEndDate: dto.endDate ? new Date(dto.endDate) : null,
        completedBy: actor.userId,
        completedAt: new Date(),
      },
      include: RENEWAL_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'contract_renewal.completed',
      entityName: 'ContractRenewal',
      entityId: id,
      previousValue: toJsonSafe({ previousContractId: previousContract.id, previousEndDate: renewal.previousEndDate }),
      newValue: toJsonSafe({ newContractId: newContract.id, newStartDate: dto.startDate, newEndDate: dto.endDate ?? null }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toContractRenewalEntity(updated);
  }

  async cancel(tenantId: string, id: string, actor: AuditActor, metadata: RequestMetadata): Promise<ContractRenewalEntity> {
    const renewal = await this.findOwnedOrThrow(tenantId, id);
    if (renewal.status !== ContractRenewalStatus.PENDING) {
      throw new ConflictException(
        `Renovacao esta ${renewal.status} -- somente uma renovacao PENDING pode ser cancelada.`,
      );
    }

    const updated = await this.prisma.contractRenewal.update({
      where: { id },
      data: { status: ContractRenewalStatus.CANCELLED, cancelledBy: actor.userId, cancelledAt: new Date() },
      include: RENEWAL_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'contract_renewal.cancelled',
      entityName: 'ContractRenewal',
      entityId: id,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toContractRenewalEntity(updated);
  }

  async findAll(tenantId: string, query: FindContractRenewalsQueryDto): Promise<PaginatedContractRenewalsEntity> {
    const where: Prisma.ContractRenewalWhereInput = {
      tenantId,
      ...(query.contractId
        ? { OR: [{ previousContractId: query.contractId }, { newContractId: query.contractId }] }
        : {}),
      ...(query.customerId ? { previousContract: { customerId: query.customerId } } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.contractRenewal.findMany({
        where,
        include: RENEWAL_INCLUDE,
        orderBy: { initiatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.contractRenewal.count({ where }),
    ]);

    const result = new PaginatedContractRenewalsEntity();
    result.items = items.map(toContractRenewalEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<ContractRenewalEntity> {
    return toContractRenewalEntity(await this.findOwnedOrThrow(tenantId, id));
  }

  /// "Contratos vencendo/vencidos". withinDays reaproveita o MESMO conceito
  /// de limiar de resolveDocumentExpiryStatus (fleet/utils) -- nunca um
  /// segundo calculo de "vencendo em breve". Uma unica query batched para
  /// os contratos + uma unica query batched para as renovacoes PENDING
  /// (evita N+1 -- nunca uma query por contrato).
  async getExpiringContracts(
    tenantId: string,
    query: FindExpiringContractsQueryDto,
  ): Promise<PaginatedExpiringContractsEntity> {
    const now = new Date();
    const thresholdDate = new Date(now.getTime() + query.withinDays * 24 * 60 * 60 * 1000);

    const where: Prisma.ContractWhereInput = {
      tenantId,
      status: { in: EXPIRY_ELIGIBLE_STATUSES },
      endDate: { not: null, lte: thresholdDate },
      ...(query.customerId ? { customerId: query.customerId } : {}),
    };

    const [contracts, total] = await Promise.all([
      this.prisma.contract.findMany({
        where,
        select: { id: true, code: true, customerId: true, endDate: true, customer: { select: { name: true } } },
        orderBy: { endDate: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.contract.count({ where }),
    ]);

    const contractIds = contracts.map((c) => c.id);
    const pendingRenewals = contractIds.length
      ? await this.prisma.contractRenewal.findMany({
          where: { tenantId, previousContractId: { in: contractIds }, status: ContractRenewalStatus.PENDING },
          select: { id: true, previousContractId: true },
        })
      : [];
    const pendingByContractId = new Map(pendingRenewals.map((r) => [r.previousContractId, r.id]));

    const result = new PaginatedExpiringContractsEntity();
    result.items = contracts.map((contract) => {
      const entity = new ExpiringContractEntity();
      entity.contractId = contract.id;
      entity.code = contract.code;
      entity.customerId = contract.customerId;
      entity.customerName = contract.customer.name;
      entity.endDate = contract.endDate as Date;
      entity.daysUntilExpiry = Math.ceil((entity.endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      const status = resolveDocumentExpiryStatus(entity.endDate, now, query.withinDays);
      entity.expiryStatus = (status === 'EXPIRED' ? 'EXPIRED' : 'EXPIRING_SOON') as ContractExpiryStatus;
      const activeRenewalId = pendingByContractId.get(contract.id) ?? null;
      entity.hasActiveRenewal = activeRenewalId !== null;
      entity.activeRenewalId = activeRenewalId;
      return entity;
    });
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  /// Indicadores para o CRM/pagina do cliente. Tres contagens batched em
  /// paralelo -- custo constante, nunca cresce com o volume de contratos.
  async getSummary(tenantId: string, query: ContractRenewalSummaryQueryDto): Promise<ContractRenewalSummaryEntity> {
    const now = new Date();
    const defaultThreshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const customerFilter = query.customerId ? { customerId: query.customerId } : {};

    const [expiringCount, expiredCount, pendingRenewalsCount] = await Promise.all([
      this.prisma.contract.count({
        where: { tenantId, status: ContractStatus.ACTIVE, endDate: { gte: now, lte: defaultThreshold }, ...customerFilter },
      }),
      this.prisma.contract.count({
        where: { tenantId, status: { in: EXPIRY_ELIGIBLE_STATUSES }, endDate: { lt: now }, ...customerFilter },
      }),
      this.prisma.contractRenewal.count({
        where: {
          tenantId,
          status: ContractRenewalStatus.PENDING,
          ...(query.customerId ? { previousContract: { customerId: query.customerId } } : {}),
        },
      }),
    ]);

    const summary = new ContractRenewalSummaryEntity();
    summary.expiringCount = expiringCount;
    summary.expiredCount = expiredCount;
    summary.pendingRenewalsCount = pendingRenewalsCount;
    return summary;
  }

  private async assertNoPendingRenewal(tenantId: string, contractId: string): Promise<void> {
    const existing = await this.prisma.contractRenewal.findFirst({
      where: { tenantId, previousContractId: contractId, status: ContractRenewalStatus.PENDING },
    });
    if (existing) {
      throw new ConflictException('Ja existe uma renovacao PENDING em andamento para este contrato.');
    }
  }

  private async findOwnedOrThrow(tenantId: string, id: string): Promise<ContractRenewalWithRelations> {
    const renewal = await this.prisma.contractRenewal.findFirst({
      where: { id, tenantId },
      include: RENEWAL_INCLUDE,
    });
    if (!renewal) {
      throw new NotFoundException('Renovacao de contrato nao encontrada nesta empresa.');
    }
    return renewal;
  }
}
