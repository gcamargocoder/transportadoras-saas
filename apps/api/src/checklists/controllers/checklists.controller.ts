import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { CHECKLISTS_READ_ROLES, CHECKLISTS_WRITE_ROLES } from '../constants/checklist-roles.constants';
import { CreateChecklistTemplateDto } from '../dto/create-checklist-template.dto';
import { FindChecklistExecutionsQueryDto } from '../dto/find-checklist-executions-query.dto';
import { FindChecklistTemplatesQueryDto } from '../dto/find-checklist-templates-query.dto';
import { UpdateChecklistTemplateDto } from '../dto/update-checklist-template.dto';
import { ChecklistExecutionEntity } from '../entities/checklist-execution.entity';
import { ChecklistTemplateEntity } from '../entities/checklist-template.entity';
import { PaginatedChecklistExecutionsEntity } from '../entities/paginated-checklist-executions.entity';
import { PaginatedChecklistTemplatesEntity } from '../entities/paginated-checklist-templates.entity';
import { ChecklistExecutionsService } from '../services/checklist-executions.service';
import { ChecklistTemplatesService } from '../services/checklist-templates.service';

@ApiTags('checklists')
@ApiBearerAuth()
@Controller('checklists')
export class ChecklistsController {
  constructor(
    private readonly templatesService: ChecklistTemplatesService,
    private readonly executionsService: ChecklistExecutionsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get('templates')
  @Roles(...CHECKLISTS_READ_ROLES)
  @ApiOperation({ summary: 'Lista os templates de checklist da empresa (paginado, filtro por tipo/status).' })
  @ApiOkResponse({ type: PaginatedChecklistTemplatesEntity })
  findAllTemplates(@Query() query: FindChecklistTemplatesQueryDto): Promise<PaginatedChecklistTemplatesEntity> {
    return this.templatesService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get('templates/:id')
  @Roles(...CHECKLISTS_READ_ROLES)
  @ApiOperation({ summary: 'Consulta um template de checklist (com sections e items).' })
  @ApiOkResponse({ type: ChecklistTemplateEntity })
  @ApiNotFoundResponse({ description: 'Template nao encontrado nesta empresa.' })
  findOneTemplate(@Param('id', ParseUUIDPipe) id: string): Promise<ChecklistTemplateEntity> {
    return this.templatesService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Post('templates')
  @Roles(...CHECKLISTS_WRITE_ROLES)
  @ApiOperation({ summary: 'Cria um template de checklist (sections+items aninhados). Nasce sempre DRAFT.' })
  @ApiCreatedResponse({ type: ChecklistTemplateEntity })
  createTemplate(@Body() dto: CreateChecklistTemplateDto): Promise<ChecklistTemplateEntity> {
    return this.templatesService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch('templates/:id')
  @Roles(...CHECKLISTS_WRITE_ROLES)
  @ApiOperation({ summary: 'Substitui a arvore inteira (sections+items) de um template. So permitido enquanto DRAFT.' })
  @ApiOkResponse({ type: ChecklistTemplateEntity })
  @ApiNotFoundResponse({ description: 'Template nao encontrado nesta empresa.' })
  @ApiConflictResponse({ description: 'Template PUBLISHED nao pode ser alterado diretamente.' })
  updateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateChecklistTemplateDto,
  ): Promise<ChecklistTemplateEntity> {
    return this.templatesService.update(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post('templates/:id/publish')
  @HttpCode(HttpStatus.OK)
  @Roles(...CHECKLISTS_WRITE_ROLES)
  @ApiOperation({ summary: 'Publica um template DRAFT (torna-o imutavel e disponivel para o motorista).' })
  @ApiOkResponse({ type: ChecklistTemplateEntity })
  @ApiNotFoundResponse({ description: 'Template nao encontrado nesta empresa.' })
  @ApiConflictResponse({ description: 'Template ja publicado, ou vazio (sem section/item).' })
  publishTemplate(@Param('id', ParseUUIDPipe) id: string): Promise<ChecklistTemplateEntity> {
    return this.templatesService.publish(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  // Fora da lista literal de endpoints do pedido da Fase 38, mas exigida
  // pela propria regra de imutabilidade da fase (secao 19) -- ver
  // justificativa no plano.
  @Post('templates/:id/versions')
  @Roles(...CHECKLISTS_WRITE_ROLES)
  @ApiOperation({ summary: 'Cria uma nova versao (DRAFT) a partir de um template PUBLISHED, copiando sections/items.' })
  @ApiCreatedResponse({ type: ChecklistTemplateEntity })
  @ApiNotFoundResponse({ description: 'Template nao encontrado nesta empresa.' })
  @ApiConflictResponse({ description: 'Somente um template PUBLISHED pode gerar uma nova versao.' })
  createTemplateVersion(@Param('id', ParseUUIDPipe) id: string): Promise<ChecklistTemplateEntity> {
    return this.templatesService.createNewVersion(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Get('executions')
  @Roles(...CHECKLISTS_READ_ROLES)
  @ApiOperation({ summary: 'Lista execucoes de checklist da empresa (paginado, filtro por viagem/veiculo/status).' })
  @ApiOkResponse({ type: PaginatedChecklistExecutionsEntity })
  findAllExecutions(@Query() query: FindChecklistExecutionsQueryDto): Promise<PaginatedChecklistExecutionsEntity> {
    return this.executionsService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get('executions/:id')
  @Roles(...CHECKLISTS_READ_ROLES)
  @ApiOperation({ summary: 'Consulta uma execucao de checklist (com respostas e evidencias).' })
  @ApiOkResponse({ type: ChecklistExecutionEntity })
  @ApiNotFoundResponse({ description: 'Checklist nao encontrado nesta empresa.' })
  findOneExecution(@Param('id', ParseUUIDPipe) id: string): Promise<ChecklistExecutionEntity> {
    return this.executionsService.findOne(this.tenantContext.requireTenantId(), id);
  }
}
