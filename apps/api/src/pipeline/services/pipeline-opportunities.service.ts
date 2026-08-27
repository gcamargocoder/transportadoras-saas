import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PipelineStage, Prisma, Proposal, Quotation } from '@prisma/client';
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
import { CreatePipelineOpportunityDto } from '../dto/create-pipeline-opportunity.dto';
import { UpdatePipelineOpportunityDto } from '../dto/update-pipeline-opportunity.dto';
import { UpdatePipelineOpportunityStageDto } from '../dto/update-pipeline-opportunity-stage.dto';
import { FindPipelineOpportunitiesQueryDto, PipelineOpportunitySortField } from '../dto/find-pipeline-opportunities-query.dto';
import { PipelineOpportunityEntity } from '../entities/pipeline-opportunity.entity';
import { PaginatedPipelineOpportunitiesEntity } from '../entities/paginated-pipeline-opportunities.entity';
import { PipelineOpportunityWithRelations, toPipelineOpportunityEntity } from '../mappers/pipeline-opportunity.mapper';
import { PipelineStagesService } from './pipeline-stages.service';

const OPPORTUNITY_INCLUDE = {
  customer: true,
  proposal: { select: { number: true } },
  stage: true,
  creator: true,
  updater: true,
} satisfies Prisma.PipelineOpportunityInclude;

// Fase 96 -- Pipeline Comercial: acompanha oportunidades do lead ate o
// fechamento, reaproveitando INTEGRALMENTE Customer/Quotation/Proposal e o
// AuditService -- nenhum motor de precificacao, nenhum dado financeiro
// (Receivable/Payable/FinancialTransaction) e criado ou lido aqui.
@Injectable()
export class PipelineOpportunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stagesService: PipelineStagesService,
  ) {}

  async findAll(tenantId: string, query: FindPipelineOpportunitiesQueryDto): Promise<PaginatedPipelineOpportunitiesEntity> {
    const where = this.buildWhere(tenantId, query);
    const orderBy = this.buildOrderBy(query);

    const [items, total] = await Promise.all([
      this.prisma.pipelineOpportunity.findMany({
        where,
        include: OPPORTUNITY_INCLUDE,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.pipelineOpportunity.count({ where }),
    ]);

    const result = new PaginatedPipelineOpportunitiesEntity();
    result.items = items.map(toPipelineOpportunityEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<PipelineOpportunityEntity> {
    return toPipelineOpportunityEntity(await this.findOwnedOrThrow(tenantId, id));
  }

  async create(
    tenantId: string,
    dto: CreatePipelineOpportunityDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<PipelineOpportunityEntity> {
    await this.assertCustomerExists(tenantId, dto.customerId);

    const quotation = dto.quotationId ? await this.assertQuotationBelongs(tenantId, dto.quotationId, dto.customerId) : null;
    const proposal = dto.proposalId ? await this.assertProposalBelongs(tenantId, dto.proposalId, dto.customerId) : null;

    const stageId = dto.stageId
      ? (await this.assertStageUsable(tenantId, dto.stageId)).id
      : (await this.firstStage(tenantId)).id;

    const estimatedValue = this.resolveEstimatedValue(dto.estimatedValue, quotation, proposal);

    const opportunity = await this.prisma.pipelineOpportunity.create({
      data: {
        tenantId,
        customerId: dto.customerId,
        stageId,
        createdBy: actor.userId,
        ...compact({
          quotationId: dto.quotationId,
          proposalId: dto.proposalId,
          title: dto.title,
          estimatedValue,
          notes: dto.notes,
        }),
      },
      include: OPPORTUNITY_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'pipeline_opportunity.created',
      entityName: 'PipelineOpportunity',
      entityId: opportunity.id,
      newValue: toJsonSafe({
        customerId: opportunity.customerId,
        quotationId: opportunity.quotationId,
        proposalId: opportunity.proposalId,
        stageId: opportunity.stageId,
        estimatedValue,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toPipelineOpportunityEntity(opportunity);
  }

  // PATCH /pipeline/opportunities/:id -- conteudo, nunca o estagio.
  // Bloqueado quando o estagio atual e terminal (isWon/isLost) -- mesmo
  // espirito de Quotation/Proposal: um fechamento preserva o registro tal
  // como estava no momento do fechamento.
  async update(
    tenantId: string,
    id: string,
    dto: UpdatePipelineOpportunityDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<PipelineOpportunityEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);
    this.assertContentEditable(before.stage);

    const customerId = dto.customerId ?? before.customerId;
    if (dto.customerId) {
      await this.assertCustomerExists(tenantId, dto.customerId);
    }
    if (dto.quotationId !== undefined) {
      await this.assertQuotationBelongs(tenantId, dto.quotationId, customerId);
    }
    if (dto.proposalId !== undefined) {
      await this.assertProposalBelongs(tenantId, dto.proposalId, customerId);
    }

    const opportunity = await this.prisma.pipelineOpportunity.update({
      where: { id: before.id },
      data: {
        ...compact({
          customerId: dto.customerId,
          quotationId: dto.quotationId,
          proposalId: dto.proposalId,
          title: dto.title,
          estimatedValue: dto.estimatedValue,
          notes: dto.notes,
        }),
        updatedBy: actor.userId,
      },
      include: OPPORTUNITY_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'pipeline_opportunity.updated',
      entityName: 'PipelineOpportunity',
      entityId: id,
      previousValue: toJsonSafe({
        title: before.title,
        estimatedValue: before.estimatedValue !== null ? Number(before.estimatedValue) : null,
      }),
      newValue: toJsonSafe({
        title: opportunity.title,
        estimatedValue: opportunity.estimatedValue !== null ? Number(opportunity.estimatedValue) : null,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toPipelineOpportunityEntity(opportunity);
  }

  // PATCH /pipeline/opportunities/:id/stage -- unica forma de mover uma
  // oportunidade entre estagios. Nunca sai de um estagio terminal (isWon/
  // isLost). Motivo obrigatorio ao entrar num estagio isLost=true (regra da
  // fase); wonAt/lostAt sao SEMPRE derivados da propria transicao.
  async updateStage(
    tenantId: string,
    id: string,
    dto: UpdatePipelineOpportunityStageDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<PipelineOpportunityEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    if (before.stageId === dto.stageId) {
      return toPipelineOpportunityEntity(before);
    }
    if (before.stage.isWon || before.stage.isLost) {
      throw new ConflictException(
        `Esta oportunidade ja esta em um estagio terminal (${before.stage.name}) e nao pode mais mudar de estagio.`,
      );
    }

    const targetStage = await this.assertStageUsable(tenantId, dto.stageId);
    const trimmedReason = dto.reason?.trim();
    if (targetStage.isLost && !trimmedReason) {
      throw new BadRequestException('Informe "reason" ao mover a oportunidade para um estagio de perda.');
    }

    const opportunity = await this.prisma.pipelineOpportunity.update({
      where: { id: before.id },
      data: {
        stageId: targetStage.id,
        updatedBy: actor.userId,
        ...(targetStage.isWon ? { wonAt: new Date() } : {}),
        ...(targetStage.isLost ? { lostAt: new Date(), lostReason: trimmedReason as string } : {}),
      },
      include: OPPORTUNITY_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'pipeline_opportunity.stage_changed',
      entityName: 'PipelineOpportunity',
      entityId: id,
      previousValue: { stageId: before.stageId, stageName: before.stage.name },
      newValue: toJsonSafe({ stageId: targetStage.id, stageName: targetStage.name, reason: dto.reason ?? null }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toPipelineOpportunityEntity(opportunity);
  }

  // GET /pipeline/opportunities/:id/history -- reaproveita INTEGRALMENTE
  // AuditService.findByEntity (mesmo padrao de Quotation/Proposal/Vehicle/...).
  async getHistory(tenantId: string, id: string, pagination: PaginationQueryDto): Promise<PaginatedAuditLogEntity> {
    await this.findOwnedOrThrow(tenantId, id);

    const { items, total } = await this.audit.findByEntity(tenantId, 'PipelineOpportunity', id, pagination);

    const result = new PaginatedAuditLogEntity();
    result.items = items.map(toAuditLogEntity);
    result.meta = buildPaginationMeta(total, pagination.page, pagination.pageSize);
    return result;
  }

  private assertContentEditable(stage: PipelineStage): void {
    if (stage.isWon || stage.isLost) {
      throw new ConflictException(`Oportunidade em estagio terminal (${stage.name}) nao pode mais ser editada.`);
    }
  }

  // estimatedValue: prioridade explicita (dto) > Proposal.totalAmount >
  // Quotation.amount > undefined (nunca inventado sem nenhum vinculo).
  private resolveEstimatedValue(
    explicit: number | undefined,
    quotation: Quotation | null,
    proposal: Proposal | null,
  ): number | undefined {
    if (explicit !== undefined) return explicit;
    if (proposal) return Number(proposal.totalAmount);
    if (quotation) return Number(quotation.amount);
    return undefined;
  }

  private buildWhere(tenantId: string, query: FindPipelineOpportunitiesQueryDto): Prisma.PipelineOpportunityWhereInput {
    return {
      tenantId,
      ...compact({ customerId: query.customerId, stageId: query.stageId }),
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
              { title: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { notes: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { customer: { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } } },
            ],
          }
        : {}),
    };
  }

  private buildOrderBy(query: FindPipelineOpportunitiesQueryDto): Prisma.PipelineOpportunityOrderByWithRelationInput {
    switch (query.sortBy) {
      case PipelineOpportunitySortField.ESTIMATED_VALUE:
        return { estimatedValue: query.sortOrder };
      case PipelineOpportunitySortField.UPDATED_AT:
        return { updatedAt: query.sortOrder };
      case PipelineOpportunitySortField.STAGE:
        return { stage: { order: query.sortOrder } };
      default:
        return { createdAt: query.sortOrder };
    }
  }

  private async firstStage(tenantId: string): Promise<PipelineStage> {
    await this.stagesService.ensureDefaultStages(tenantId);
    const stage = await this.prisma.pipelineStage.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { order: 'asc' },
    });
    if (!stage) {
      throw new ConflictException('Nenhum estagio ativo configurado para este tenant.');
    }
    return stage;
  }

  private async assertStageUsable(tenantId: string, stageId: string): Promise<PipelineStage> {
    const stage = await this.prisma.pipelineStage.findFirst({ where: { id: stageId, tenantId } });
    if (!stage) {
      throw new NotFoundException('Estagio (stageId) nao encontrado nesta empresa.');
    }
    if (!stage.isActive) {
      throw new ConflictException(`O estagio "${stage.name}" esta inativo e nao pode receber novas oportunidades.`);
    }
    return stage;
  }

  private async assertCustomerExists(tenantId: string, customerId: string): Promise<void> {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, tenantId } });
    if (!customer) {
      throw new NotFoundException('Cliente (customerId) nao encontrado nesta empresa.');
    }
  }

  private async assertQuotationBelongs(tenantId: string, quotationId: string, customerId: string): Promise<Quotation | null> {
    if (!quotationId) return null;
    const quotation = await this.prisma.quotation.findFirst({ where: { id: quotationId, tenantId } });
    if (!quotation) {
      throw new NotFoundException('Cotacao (quotationId) nao encontrada nesta empresa.');
    }
    if (quotation.customerId !== customerId) {
      throw new ConflictException('A cotacao informada pertence a outro cliente.');
    }
    return quotation;
  }

  private async assertProposalBelongs(tenantId: string, proposalId: string, customerId: string): Promise<Proposal | null> {
    if (!proposalId) return null;
    const proposal = await this.prisma.proposal.findFirst({ where: { id: proposalId, tenantId } });
    if (!proposal) {
      throw new NotFoundException('Proposta (proposalId) nao encontrada nesta empresa.');
    }
    if (proposal.customerId !== customerId) {
      throw new ConflictException('A proposta informada pertence a outro cliente.');
    }
    return proposal;
  }

  async findOwnedOrThrow(tenantId: string, id: string): Promise<PipelineOpportunityWithRelations> {
    const opportunity = await this.prisma.pipelineOpportunity.findFirst({
      where: { id, tenantId },
      include: OPPORTUNITY_INCLUDE,
    });
    if (!opportunity) {
      throw new NotFoundException('Oportunidade nao encontrada nesta empresa.');
    }
    return opportunity;
  }
}
