import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { FREIGHT_READ_ROLES, FREIGHT_WRITE_ROLES } from '../../freight/constants/freight-roles.constants';
import { TenantContext } from '../../tenants/context/tenant-context';
import { CreatePipelineStageDto } from '../dto/create-pipeline-stage.dto';
import { FindPipelineStagesQueryDto } from '../dto/find-pipeline-stages-query.dto';
import { UpdatePipelineStageDto } from '../dto/update-pipeline-stage.dto';
import { PipelineStageEntity } from '../entities/pipeline-stage.entity';
import { PipelineStagesService } from '../services/pipeline-stages.service';

// Fase 96 -- estagios configuraveis por tenant. Mesma politica de roles ja
// usada por Freight/Quotations/Proposals.
@ApiTags('pipeline')
@ApiBearerAuth()
@Controller('pipeline/stages')
export class PipelineStagesController {
  constructor(
    private readonly stagesService: PipelineStagesService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...FREIGHT_READ_ROLES)
  @ApiOperation({
    summary:
      'Lista os estagios do pipeline do tenant (cria o conjunto inicial padrao no primeiro acesso, quando ainda nao existir nenhum).',
  })
  @ApiOkResponse({ type: [PipelineStageEntity] })
  findAll(@Query() query: FindPipelineStagesQueryDto): Promise<PipelineStageEntity[]> {
    return this.stagesService.listForTenant(this.tenantContext.requireTenantId(), query.includeInactive ?? false);
  }

  @Post()
  @Roles(...FREIGHT_WRITE_ROLES)
  @ApiOperation({ summary: 'Cria um novo estagio (posiciona ao final quando "order" e omitido).' })
  @ApiCreatedResponse({ type: PipelineStageEntity })
  @ApiConflictResponse({ description: '"order" ja ocupado por outro estagio.' })
  create(@Body() dto: CreatePipelineStageDto): Promise<PipelineStageEntity> {
    return this.stagesService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id')
  @Roles(...FREIGHT_WRITE_ROLES)
  @ApiOperation({ summary: 'Renomeia/reordena/reclassifica ou ativa/inativa um estagio.' })
  @ApiOkResponse({ type: PipelineStageEntity })
  @ApiNotFoundResponse({ description: 'Estagio nao encontrado nesta empresa.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePipelineStageDto): Promise<PipelineStageEntity> {
    return this.stagesService.update(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
