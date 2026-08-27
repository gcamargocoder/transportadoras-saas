import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProposalStatus, Quotation, QuotationStatus } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { PaginatedAuditLogEntity } from '../../audit/entities/paginated-audit-log.entity';
import { toAuditLogEntity } from '../../audit/mappers/audit-log.mapper';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { runSerializable } from '../../tenants/utils/plan-limit.util';
import { CreateProposalDto } from '../dto/create-proposal.dto';
import { UpdateProposalDto } from '../dto/update-proposal.dto';
import { UpdateProposalStatusDto } from '../dto/update-proposal-status.dto';
import { FindProposalsQueryDto } from '../dto/find-proposals-query.dto';
import { ProposalEntity } from '../entities/proposal.entity';
import { PaginatedProposalsEntity } from '../entities/paginated-proposals.entity';
import { ProposalWithRelations, toProposalEntity } from '../mappers/proposal.mapper';

const PROPOSAL_INCLUDE = {
  customer: true,
  quotation: { include: { originLocation: { select: { name: true } }, destinationLocation: { select: { name: true } } } },
  creator: true,
  updater: true,
} satisfies Prisma.ProposalInclude;

// Unico estado com conteudo editavel e DRAFT (regra da Fase 95: "impedir
// alteracoes incompativeis depois de SENT/ACCEPTED/REJECTED/EXPIRED/
// CANCELLED" -- SENT ja bloqueia conteudo, so o status ainda avanca).
// ACCEPTED/REJECTED/EXPIRED/CANCELLED sao todos finais tambem para status.
const ALLOWED_STATUS_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  DRAFT: [ProposalStatus.SENT, ProposalStatus.CANCELLED],
  SENT: [ProposalStatus.ACCEPTED, ProposalStatus.REJECTED, ProposalStatus.EXPIRED, ProposalStatus.CANCELLED],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: [],
};

interface ResolvedProposalContent {
  totalAmount: number;
  commercialConditions: string | undefined;
}

// Fase 95 -- Propostas: documento comercial formal enviado ao cliente,
// distinto da Quotation (Fase 94, o pedido/calculo "de trabalho"). Nunca
// duplica o motor de precificacao (regra 3) nem cria dado financeiro/ledger
// (regra "nao duplicar dados financeiros") -- o valor vem sempre de uma
// Quotation ja calculada (APPROVED, portanto ja imutavel -- ver
// QuotationsService.assertContentEditable) ou e informado diretamente na
// criacao direta.
@Injectable()
export class ProposalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(tenantId: string, query: FindProposalsQueryDto): Promise<PaginatedProposalsEntity> {
    const where = this.buildWhere(tenantId, query);

    const [items, total] = await Promise.all([
      this.prisma.proposal.findMany({
        where,
        include: PROPOSAL_INCLUDE,
        orderBy: { number: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.proposal.count({ where }),
    ]);

    const result = new PaginatedProposalsEntity();
    result.items = items.map(toProposalEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<ProposalEntity> {
    return toProposalEntity(await this.findOwnedOrThrow(tenantId, id));
  }

  async create(
    tenantId: string,
    dto: CreateProposalDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<ProposalEntity> {
    await this.assertCustomerExists(tenantId, dto.customerId);

    const quotation = dto.quotationId
      ? await this.assertQuotationUsable(tenantId, dto.quotationId, dto.customerId)
      : null;
    const content = this.resolveContent(dto, quotation);

    // Numeracao sequencial por tenant, race-safe: mesma transacao
    // Serializable ja usada por Driver/Vehicle/Maintenance/FiscalDocument
    // para checagens concorrentes (ver runSerializable) -- nunca uma
    // segunda logica de retry/lock inventada aqui. O backstop real e o
    // indice unico (tenantId, number): se duas transacoes concorrentes
    // colidirem, o Postgres aborta uma por falha de serializacao e
    // runSerializable tenta novamente uma vez.
    const proposal = await runSerializable(this.prisma, async (tx) => {
      const last = await tx.proposal.findFirst({
        where: { tenantId },
        orderBy: { number: 'desc' },
        select: { number: true },
      });
      const number = (last?.number ?? 0) + 1;

      return tx.proposal.create({
        data: {
          tenantId,
          number,
          customerId: dto.customerId,
          validUntil: new Date(dto.validUntil),
          totalAmount: content.totalAmount,
          createdBy: actor.userId,
          ...compact({ quotationId: dto.quotationId, commercialConditions: content.commercialConditions, notes: dto.notes }),
        },
        include: PROPOSAL_INCLUDE,
      });
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'proposal.created',
      entityName: 'Proposal',
      entityId: proposal.id,
      newValue: toJsonSafe({
        number: proposal.number,
        customerId: proposal.customerId,
        quotationId: proposal.quotationId,
        totalAmount: content.totalAmount,
        status: proposal.status,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toProposalEntity(proposal);
  }

  // PATCH /proposals/:id -- so permitido em DRAFT (regra 7 -- ver
  // assertContentEditable). Trocar quotationId reprocessa totalAmount/
  // commercialConditions a partir da NOVA cotacao quando nao sobrescritos
  // explicitamente no mesmo pedido -- nunca silenciosamente depois.
  async update(
    tenantId: string,
    id: string,
    dto: UpdateProposalDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<ProposalEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);
    this.assertContentEditable(before);

    const customerId = dto.customerId ?? before.customerId;
    if (dto.customerId) {
      await this.assertCustomerExists(tenantId, dto.customerId);
    }

    let totalAmount = dto.totalAmount;
    let commercialConditions = dto.commercialConditions;
    if (dto.quotationId !== undefined) {
      const quotation = await this.assertQuotationUsable(tenantId, dto.quotationId, customerId);
      const resolved = this.resolveContent(dto, quotation);
      totalAmount = resolved.totalAmount;
      commercialConditions = resolved.commercialConditions;
    }

    const proposal = await this.prisma.proposal.update({
      where: { id: before.id },
      data: {
        ...compact({
          customerId: dto.customerId,
          quotationId: dto.quotationId,
          totalAmount,
          commercialConditions,
          notes: dto.notes,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        }),
        updatedBy: actor.userId,
      },
      include: PROPOSAL_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'proposal.updated',
      entityName: 'Proposal',
      entityId: id,
      previousValue: toJsonSafe({ totalAmount: Number(before.totalAmount), commercialConditions: before.commercialConditions }),
      newValue: toJsonSafe({ totalAmount: Number(proposal.totalAmount), commercialConditions: proposal.commercialConditions }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toProposalEntity(proposal);
  }

  // PATCH /proposals/:id/status -- unica forma de mudar o status.
  // decidedAt e SEMPRE derivado da propria transicao (ACCEPTED/REJECTED),
  // nunca informado manualmente.
  async updateStatus(
    tenantId: string,
    id: string,
    dto: UpdateProposalStatusDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<ProposalEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    if (before.status === dto.status) {
      return toProposalEntity(before);
    }
    const allowed = ALLOWED_STATUS_TRANSITIONS[before.status];
    if (!allowed.includes(dto.status)) {
      throw new ConflictException(`Transicao de status invalida: ${before.status} -> ${dto.status}.`);
    }

    const isDecision = dto.status === ProposalStatus.ACCEPTED || dto.status === ProposalStatus.REJECTED;

    const proposal = await this.prisma.proposal.update({
      where: { id: before.id },
      data: {
        status: dto.status,
        updatedBy: actor.userId,
        ...(isDecision ? { decidedAt: new Date() } : {}),
      },
      include: PROPOSAL_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'proposal.status_changed',
      entityName: 'Proposal',
      entityId: id,
      previousValue: { status: before.status },
      newValue: { status: proposal.status, decidedAt: proposal.decidedAt },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toProposalEntity(proposal);
  }

  // GET /proposals/:id/history -- reaproveita INTEGRALMENTE
  // AuditService.findByEntity (mesmo padrao de Vehicle/Tire/Maintenance/
  // FiscalDocument/Tenant/Quotation) -- nenhuma tabela de historico paralela.
  async getHistory(tenantId: string, id: string, pagination: PaginationQueryDto): Promise<PaginatedAuditLogEntity> {
    await this.findOwnedOrThrow(tenantId, id);

    const { items, total } = await this.audit.findByEntity(tenantId, 'Proposal', id, pagination);

    const result = new PaginatedAuditLogEntity();
    result.items = items.map(toAuditLogEntity);
    result.meta = buildPaginationMeta(total, pagination.page, pagination.pageSize);
    return result;
  }

  // DRAFT e o UNICO estado com conteudo editavel (regra da Fase 95).
  private assertContentEditable(proposal: { status: ProposalStatus }): void {
    if (proposal.status !== ProposalStatus.DRAFT) {
      throw new ConflictException(`Proposta em status ${proposal.status} nao pode mais ser editada.`);
    }
  }

  // Cotacao de origem precisa: existir no tenant, pertencer ao MESMO
  // cliente da proposta, e estar APPROVED (regra: "transformar uma cotacao
  // aprovada em proposta" -- nunca outro status, nunca uma cotacao ja
  // rejeitada/convertida/cancelada).
  private async assertQuotationUsable(tenantId: string, quotationId: string, customerId: string): Promise<Quotation> {
    const quotation = await this.prisma.quotation.findFirst({ where: { id: quotationId, tenantId } });
    if (!quotation) {
      throw new NotFoundException('Cotacao (quotationId) nao encontrada nesta empresa.');
    }
    if (quotation.customerId !== customerId) {
      throw new ConflictException('A cotacao informada pertence a outro cliente.');
    }
    if (quotation.status !== QuotationStatus.APPROVED) {
      throw new ConflictException(
        `A cotacao precisa estar APPROVED para gerar uma proposta (status atual: ${quotation.status}).`,
      );
    }
    return quotation;
  }

  // Snapshot: quando ha quotation, valor/condicoes sao herdados dela salvo
  // sobrescrita explicita no proprio dto (regra 5 do espirito da Fase 94,
  // reaplicado aqui). Sem quotation, totalAmount e obrigatorio -- nunca um
  // valor inventado.
  private resolveContent(
    dto: { totalAmount?: number; commercialConditions?: string },
    quotation: Quotation | null,
  ): ResolvedProposalContent {
    const totalAmount = dto.totalAmount ?? (quotation ? Number(quotation.amount) : undefined);
    if (totalAmount === undefined) {
      throw new ConflictException('totalAmount e obrigatorio quando quotationId nao e informado.');
    }
    return {
      totalAmount,
      commercialConditions: dto.commercialConditions ?? quotation?.conditions ?? undefined,
    };
  }

  private buildWhere(tenantId: string, query: FindProposalsQueryDto): Prisma.ProposalWhereInput {
    const searchAsNumber = query.search && /^\d+$/.test(query.search.trim()) ? Number(query.search.trim()) : null;

    return {
      tenantId,
      ...compact({ customerId: query.customerId, quotationId: query.quotationId, status: query.status }),
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
              ...(searchAsNumber !== null ? [{ number: searchAsNumber }] : []),
              { commercialConditions: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { notes: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
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

  private async findOwnedOrThrow(tenantId: string, id: string): Promise<ProposalWithRelations> {
    const proposal = await this.prisma.proposal.findFirst({
      where: { id, tenantId },
      include: PROPOSAL_INCLUDE,
    });
    if (!proposal) {
      throw new NotFoundException('Proposta nao encontrada nesta empresa.');
    }
    return proposal;
  }
}
