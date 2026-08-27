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
import { CreateProposalDto } from '../dto/create-proposal.dto';
import { FindProposalsQueryDto } from '../dto/find-proposals-query.dto';
import { UpdateProposalDto } from '../dto/update-proposal.dto';
import { UpdateProposalStatusDto } from '../dto/update-proposal-status.dto';
import { PaginatedProposalsEntity } from '../entities/paginated-proposals.entity';
import { ProposalEntity } from '../entities/proposal.entity';
import { ProposalsService } from '../services/proposals.service';

// Fase 95 -- Propostas: documento comercial formal enviado ao cliente,
// gerado diretamente ou a partir de uma Quotation (Fase 94) APPROVED. Mesma
// politica de roles ja usada por Freight/Quotations (leitura ampla
// incluindo AUDITOR, escrita restrita ao grupo operacional/comercial) --
// reaproveitada diretamente, nenhuma constante de roles duplicada.
@ApiTags('proposals')
@ApiBearerAuth()
@Controller('proposals')
export class ProposalsController {
  constructor(
    private readonly proposalsService: ProposalsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...FREIGHT_READ_ROLES)
  @ApiOperation({ summary: 'Lista propostas (busca, filtro por cliente/cotacao/status/periodo, paginacao).' })
  @ApiOkResponse({ type: PaginatedProposalsEntity })
  findAll(@Query() query: FindProposalsQueryDto): Promise<PaginatedProposalsEntity> {
    return this.proposalsService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...FREIGHT_READ_ROLES)
  @ApiOperation({ summary: 'Consulta uma proposta.' })
  @ApiOkResponse({ type: ProposalEntity })
  @ApiNotFoundResponse({ description: 'Proposta nao encontrada nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ProposalEntity> {
    return this.proposalsService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Get(':id/history')
  @Roles(...FREIGHT_READ_ROLES)
  @ApiOperation({ summary: 'Historico basico de alteracoes da proposta (quem, quando, antes/depois).' })
  @ApiOkResponse({ type: PaginatedAuditLogEntity })
  @ApiNotFoundResponse({ description: 'Proposta nao encontrada nesta empresa.' })
  findHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedAuditLogEntity> {
    return this.proposalsService.getHistory(this.tenantContext.requireTenantId(), id, query);
  }

  @Post()
  @Roles(...FREIGHT_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Cria uma proposta -- diretamente (totalAmount obrigatorio) ou a partir de uma Quotation APPROVED ' +
      '(valor/condicoes herdados do snapshot ja calculado, salvo sobrescrita explicita).',
  })
  @ApiCreatedResponse({ type: ProposalEntity })
  @ApiNotFoundResponse({ description: 'Cliente ou cotacao nao encontrados nesta empresa.' })
  @ApiConflictResponse({ description: 'Cotacao nao APPROVED, de outro cliente, ou totalAmount ausente sem quotationId.' })
  create(@Body() dto: CreateProposalDto): Promise<ProposalEntity> {
    return this.proposalsService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id')
  @Roles(...FREIGHT_WRITE_ROLES)
  @ApiOperation({ summary: 'Atualiza uma proposta (somente em DRAFT).' })
  @ApiOkResponse({ type: ProposalEntity })
  @ApiNotFoundResponse({ description: 'Proposta nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'Proposta fora de DRAFT -- nao pode mais ser editada.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProposalDto): Promise<ProposalEntity> {
    return this.proposalsService.update(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id/status')
  @Roles(...FREIGHT_WRITE_ROLES)
  @ApiOperation({ summary: 'Altera o status da proposta, respeitando as transicoes permitidas.' })
  @ApiOkResponse({ type: ProposalEntity })
  @ApiNotFoundResponse({ description: 'Proposta nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'Transicao de status invalida.' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProposalStatusDto,
  ): Promise<ProposalEntity> {
    return this.proposalsService.updateStatus(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
