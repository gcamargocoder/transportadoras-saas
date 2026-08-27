import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { PaginatedAuditLogEntity } from '../../audit/entities/paginated-audit-log.entity';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { FREIGHT_READ_ROLES, FREIGHT_WRITE_ROLES } from '../../freight/constants/freight-roles.constants';
import { TenantContext } from '../../tenants/context/tenant-context';
import { CreatePipelineOpportunityDto } from '../dto/create-pipeline-opportunity.dto';
import { FindPipelineOpportunitiesQueryDto } from '../dto/find-pipeline-opportunities-query.dto';
import { UpdatePipelineOpportunityDto } from '../dto/update-pipeline-opportunity.dto';
import { UpdatePipelineOpportunityStageDto } from '../dto/update-pipeline-opportunity-stage.dto';
import { PaginatedPipelineOpportunitiesEntity } from '../entities/paginated-pipeline-opportunities.entity';
import { PipelineOpportunityEntity } from '../entities/pipeline-opportunity.entity';
import { PipelineOpportunitiesService } from '../services/pipeline-opportunities.service';

// Fase 96 -- oportunidades do pipeline comercial. Mesma politica de roles
// ja usada por Freight/Quotations/Proposals.
@ApiTags('pipeline')
@ApiBearerAuth()
@Controller('pipeline/opportunities')
export class PipelineOpportunitiesController {
  constructor(
    private readonly opportunitiesService: PipelineOpportunitiesService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...FREIGHT_READ_ROLES)
  @ApiOperation({ summary: 'Lista oportunidades (busca, filtro cliente/estagio/periodo, ordenacao, paginacao).' })
  @ApiOkResponse({ type: PaginatedPipelineOpportunitiesEntity })
  findAll(@Query() query: FindPipelineOpportunitiesQueryDto): Promise<PaginatedPipelineOpportunitiesEntity> {
    return this.opportunitiesService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...FREIGHT_READ_ROLES)
  @ApiOperation({ summary: 'Consulta uma oportunidade.' })
  @ApiOkResponse({ type: PipelineOpportunityEntity })
  @ApiNotFoundResponse({ description: 'Oportunidade nao encontrada nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<PipelineOpportunityEntity> {
    return this.opportunitiesService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Get(':id/history')
  @Roles(...FREIGHT_READ_ROLES)
  @ApiOperation({ summary: 'Historico basico de alteracoes da oportunidade (quem, quando, antes/depois).' })
  @ApiOkResponse({ type: PaginatedAuditLogEntity })
  @ApiNotFoundResponse({ description: 'Oportunidade nao encontrada nesta empresa.' })
  findHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedAuditLogEntity> {
    return this.opportunitiesService.getHistory(this.tenantContext.requireTenantId(), id, query);
  }

  @Post()
  @Roles(...FREIGHT_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Cria uma oportunidade, vinculando cliente e, quando aplicavel, cotacao/proposta. estimatedValue e ' +
      'herdado da proposta/cotacao vinculada quando omitido.',
  })
  @ApiCreatedResponse({ type: PipelineOpportunityEntity })
  @ApiNotFoundResponse({ description: 'Cliente, cotacao, proposta ou estagio nao encontrados nesta empresa.' })
  @ApiConflictResponse({ description: 'Cotacao/proposta de outro cliente, ou estagio inativo.' })
  create(@Body() dto: CreatePipelineOpportunityDto): Promise<PipelineOpportunityEntity> {
    return this.opportunitiesService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id')
  @Roles(...FREIGHT_WRITE_ROLES)
  @ApiOperation({ summary: 'Atualiza o conteudo de uma oportunidade (bloqueado em estagio terminal). O estagio muda apenas via PATCH /:id/stage.' })
  @ApiOkResponse({ type: PipelineOpportunityEntity })
  @ApiNotFoundResponse({ description: 'Oportunidade nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'Oportunidade em estagio terminal -- nao pode mais ser editada.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePipelineOpportunityDto): Promise<PipelineOpportunityEntity> {
    return this.opportunitiesService.update(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id/stage')
  @Roles(...FREIGHT_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Move a oportunidade para outro estagio. "reason" e obrigatorio ao mover para um estagio de perda ' +
      '(isLost=true). Nunca sai de um estagio terminal (isWon/isLost).',
  })
  @ApiOkResponse({ type: PipelineOpportunityEntity })
  @ApiNotFoundResponse({ description: 'Oportunidade ou estagio nao encontrados nesta empresa.' })
  @ApiConflictResponse({ description: 'Oportunidade ja em estagio terminal.' })
  updateStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePipelineOpportunityStageDto,
  ): Promise<PipelineOpportunityEntity> {
    return this.opportunitiesService.updateStage(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
