import { Module } from '@nestjs/common';
import { PipelineDashboardController } from './controllers/pipeline-dashboard.controller';
import { PipelineOpportunitiesController } from './controllers/pipeline-opportunities.controller';
import { PipelineStagesController } from './controllers/pipeline-stages.controller';
import { PipelineDashboardService } from './services/pipeline-dashboard.service';
import { PipelineOpportunitiesService } from './services/pipeline-opportunities.service';
import { PipelineStagesService } from './services/pipeline-stages.service';

// Fase 96 -- nenhuma dependencia de modulo externo: valida Customer/
// Quotation/Proposal via consulta direta ao Prisma (mesmo padrao leve ja
// usado por QuotationsService/ProposalsService), nunca importa
// CustomersModule/QuotationsModule/ProposalsModule. Nenhum motor de
// precificacao, nenhuma criacao de Trip, nenhum dado financeiro.
@Module({
  controllers: [PipelineStagesController, PipelineOpportunitiesController, PipelineDashboardController],
  providers: [PipelineStagesService, PipelineOpportunitiesService, PipelineDashboardService],
})
export class PipelineModule {}
