import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PipelineStage } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { runSerializable } from '../../tenants/utils/plan-limit.util';
import { PIPELINE_DEFAULT_STAGES } from '../constants/pipeline-default-stages.constant';
import { CreatePipelineStageDto } from '../dto/create-pipeline-stage.dto';
import { UpdatePipelineStageDto } from '../dto/update-pipeline-stage.dto';
import { PipelineStageEntity } from '../entities/pipeline-stage.entity';
import { toPipelineStageEntity } from '../mappers/pipeline-stage.mapper';

// Fase 96 -- estagios do pipeline, CONFIGURAVEIS POR TENANT (regra da
// fase) -- por isso e uma tabela, nao um enum fixo como QuotationStatus/
// ProposalStatus. Todo tenant recebe o conjunto inicial padrao (LEAD,
// QUOTATION, PROPOSAL, NEGOTIATION, WON, LOST) na primeira vez que acessa
// o pipeline (ensureDefaultStages, idempotente e race-safe via
// runSerializable -- mesmo padrao ja usado por Driver/Vehicle/Maintenance/
// FiscalDocument/User); depois disso, o tenant e livre para customizar.
@Injectable()
export class PipelineStagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async ensureDefaultStages(tenantId: string): Promise<void> {
    const existing = await this.prisma.pipelineStage.count({ where: { tenantId } });
    if (existing > 0) return;

    await runSerializable(this.prisma, async (tx) => {
      const count = await tx.pipelineStage.count({ where: { tenantId } });
      if (count > 0) return;
      await tx.pipelineStage.createMany({
        data: PIPELINE_DEFAULT_STAGES.map((stage) => ({ tenantId, ...stage })),
      });
    });
  }

  async listForTenant(tenantId: string, includeInactive = false): Promise<PipelineStageEntity[]> {
    await this.ensureDefaultStages(tenantId);
    const stages = await this.prisma.pipelineStage.findMany({
      where: { tenantId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { order: 'asc' },
    });
    return stages.map(toPipelineStageEntity);
  }

  async create(
    tenantId: string,
    dto: CreatePipelineStageDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<PipelineStageEntity> {
    await this.ensureDefaultStages(tenantId);
    this.assertNotBothWonAndLost(dto.isWon ?? false, dto.isLost ?? false);

    let order = dto.order;
    if (order === undefined) {
      const last = await this.prisma.pipelineStage.findFirst({ where: { tenantId }, orderBy: { order: 'desc' } });
      order = (last?.order ?? 0) + 1;
    } else {
      const conflicting = await this.prisma.pipelineStage.findFirst({ where: { tenantId, order } });
      if (conflicting) {
        throw new ConflictException(
          `Ja existe um estagio na posicao ${order} ("${conflicting.name}") -- omita "order" para adicionar ao final, ou reordene via PATCH.`,
        );
      }
    }

    const stage = await this.prisma.pipelineStage.create({
      data: { tenantId, name: dto.name, order, isWon: dto.isWon ?? false, isLost: dto.isLost ?? false },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'pipeline_stage.created',
      entityName: 'PipelineStage',
      entityId: stage.id,
      newValue: toJsonSafe({ name: stage.name, order: stage.order, isWon: stage.isWon, isLost: stage.isLost }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toPipelineStageEntity(stage);
  }

  // PATCH /pipeline/stages/:id -- quando `order` colide com outro estagio
  // do mesmo tenant, os dois trocam de posicao (swap simples) em vez de
  // recalcular toda a sequencia -- suficiente para reordenar um Kanban sem
  // uma cascata de renumeracao.
  async update(
    tenantId: string,
    id: string,
    dto: UpdatePipelineStageDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<PipelineStageEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);
    this.assertNotBothWonAndLost(dto.isWon ?? before.isWon, dto.isLost ?? before.isLost);

    const stage = await this.prisma.$transaction(async (tx) => {
      if (dto.order !== undefined && dto.order !== before.order) {
        const conflicting = await tx.pipelineStage.findFirst({
          where: { tenantId, order: dto.order, id: { not: id } },
        });
        if (conflicting) {
          // Duas fases (sentinela negativo -> valor final) para nunca colidir
          // com a constraint unica (tenantId, order) ao trocar posicoes entre
          // si -- mesma tecnica ja usada em TripDeliveryStopsService.remove/
          // reorder.
          await tx.pipelineStage.update({ where: { id }, data: { order: -1 } });
          await tx.pipelineStage.update({ where: { id: conflicting.id }, data: { order: before.order } });
        }
      }
      return tx.pipelineStage.update({
        where: { id: before.id },
        data: compact({ name: dto.name, order: dto.order, isWon: dto.isWon, isLost: dto.isLost, isActive: dto.isActive }),
      });
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'pipeline_stage.updated',
      entityName: 'PipelineStage',
      entityId: id,
      previousValue: toJsonSafe({ name: before.name, order: before.order, isWon: before.isWon, isLost: before.isLost, isActive: before.isActive }),
      newValue: toJsonSafe({ name: stage.name, order: stage.order, isWon: stage.isWon, isLost: stage.isLost, isActive: stage.isActive }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toPipelineStageEntity(stage);
  }

  private assertNotBothWonAndLost(isWon: boolean, isLost: boolean): void {
    if (isWon && isLost) {
      throw new BadRequestException('Um estagio nao pode ser isWon e isLost ao mesmo tempo.');
    }
  }

  async findOwnedOrThrow(tenantId: string, id: string): Promise<PipelineStage> {
    const stage = await this.prisma.pipelineStage.findFirst({ where: { id, tenantId } });
    if (!stage) {
      throw new NotFoundException('Estagio do pipeline nao encontrado nesta empresa.');
    }
    return stage;
  }
}
