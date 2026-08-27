import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PipelineBoardColumnEntity, PipelineBoardEntity } from '../entities/pipeline-board.entity';
import { PipelineDashboardEntity, PipelineDashboardStageBreakdownEntity } from '../entities/pipeline-dashboard.entity';
import { toPipelineOpportunityEntity } from '../mappers/pipeline-opportunity.mapper';
import { toPipelineStageEntity } from '../mappers/pipeline-stage.mapper';
import { PipelineStagesService } from './pipeline-stages.service';

const OPPORTUNITY_INCLUDE = {
  customer: true,
  proposal: { select: { number: true } },
  stage: true,
  creator: true,
  updater: true,
} satisfies Prisma.PipelineOpportunityInclude;

// Amostra por coluna no Kanban -- a listagem paginada (GET
// /pipeline/opportunities) continua a fonte completa; o board e uma visao
// rapida, nunca a unica forma de acessar os dados.
const BOARD_CARDS_CAP = 300;

// Fase 96 -- board (Kanban) e dashboard, ambos SOMENTE LEITURA e agregados
// no banco (groupBy/count/sum) -- nunca uma query por oportunidade (evita
// N+1 mesmo com o volume crescendo). Dashboard "simples" (regra da fase):
// contagens/somas de estimatedValue, nunca nenhum dado financeiro real.
@Injectable()
export class PipelineDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stagesService: PipelineStagesService,
  ) {}

  async getBoard(tenantId: string): Promise<PipelineBoardEntity> {
    await this.stagesService.ensureDefaultStages(tenantId);

    const stages = await this.prisma.pipelineStage.findMany({
      where: { tenantId, isActive: true },
      orderBy: { order: 'asc' },
    });
    const stageIds = stages.map((s) => s.id);

    const [counts, sums, opportunities] = await Promise.all([
      this.prisma.pipelineOpportunity.groupBy({
        by: ['stageId'],
        where: { tenantId, stageId: { in: stageIds } },
        _count: true,
      }),
      this.prisma.pipelineOpportunity.groupBy({
        by: ['stageId'],
        where: { tenantId, stageId: { in: stageIds } },
        _sum: { estimatedValue: true },
      }),
      this.prisma.pipelineOpportunity.findMany({
        where: { tenantId, stageId: { in: stageIds } },
        include: OPPORTUNITY_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        take: BOARD_CARDS_CAP,
      }),
    ]);

    const countByStage = new Map(counts.map((c) => [c.stageId, c._count]));
    const sumByStage = new Map(sums.map((s) => [s.stageId, Number(s._sum.estimatedValue ?? 0)]));

    const board = new PipelineBoardEntity();
    board.columns = stages.map((stage) => {
      const column = new PipelineBoardColumnEntity();
      column.stage = toPipelineStageEntity(stage);
      column.totalCount = countByStage.get(stage.id) ?? 0;
      column.totalEstimatedValue = sumByStage.get(stage.id) ?? 0;
      column.opportunities = opportunities.filter((o) => o.stageId === stage.id).map(toPipelineOpportunityEntity);
      return column;
    });
    return board;
  }

  async getDashboard(tenantId: string): Promise<PipelineDashboardEntity> {
    await this.stagesService.ensureDefaultStages(tenantId);

    const stages = await this.prisma.pipelineStage.findMany({ where: { tenantId }, orderBy: { order: 'asc' } });

    const [counts, sums] = await Promise.all([
      this.prisma.pipelineOpportunity.groupBy({ by: ['stageId'], where: { tenantId }, _count: true }),
      this.prisma.pipelineOpportunity.groupBy({
        by: ['stageId'],
        where: { tenantId },
        _sum: { estimatedValue: true },
      }),
    ]);
    const countByStage = new Map(counts.map((c) => [c.stageId, c._count]));
    const sumByStage = new Map(sums.map((s) => [s.stageId, Number(s._sum.estimatedValue ?? 0)]));

    const byStage: PipelineDashboardStageBreakdownEntity[] = stages.map((stage) => {
      const row = new PipelineDashboardStageBreakdownEntity();
      row.stageId = stage.id;
      row.stageName = stage.name;
      row.isWon = stage.isWon;
      row.isLost = stage.isLost;
      row.count = countByStage.get(stage.id) ?? 0;
      row.estimatedValue = sumByStage.get(stage.id) ?? 0;
      return row;
    });

    const openRows = byStage.filter((r) => !r.isWon && !r.isLost);
    const wonRows = byStage.filter((r) => r.isWon);
    const lostRows = byStage.filter((r) => r.isLost);

    const dashboard = new PipelineDashboardEntity();
    dashboard.openCount = openRows.reduce((sum, r) => sum + r.count, 0);
    dashboard.openEstimatedValue = openRows.reduce((sum, r) => sum + r.estimatedValue, 0);
    dashboard.wonCount = wonRows.reduce((sum, r) => sum + r.count, 0);
    dashboard.wonEstimatedValue = wonRows.reduce((sum, r) => sum + r.estimatedValue, 0);
    dashboard.lostCount = lostRows.reduce((sum, r) => sum + r.count, 0);
    dashboard.lostEstimatedValue = lostRows.reduce((sum, r) => sum + r.estimatedValue, 0);
    const closedCount = dashboard.wonCount + dashboard.lostCount;
    dashboard.conversionRate = closedCount > 0 ? dashboard.wonCount / closedCount : 0;
    dashboard.byStage = byStage;

    return dashboard;
  }
}
