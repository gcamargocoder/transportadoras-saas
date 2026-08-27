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
import { ConvertQuotationToTripDto } from '../dto/convert-quotation-to-trip.dto';
import { CreateQuotationDto } from '../dto/create-quotation.dto';
import { FindQuotationsQueryDto } from '../dto/find-quotations-query.dto';
import { UpdateQuotationDto } from '../dto/update-quotation.dto';
import { UpdateQuotationStatusDto } from '../dto/update-quotation-status.dto';
import { PaginatedQuotationsEntity } from '../entities/paginated-quotations.entity';
import { QuotationEntity } from '../entities/quotation.entity';
import { QuotationsService } from '../services/quotations.service';

// Fase 94 -- Cotacoes: solicitacoes de transporte de clientes, registradas
// e acompanhadas ANTES de existir uma Trip. Mesma politica de roles ja
// usada por Freight (leitura ampla incluindo AUDITOR, escrita restrita ao
// grupo operacional/comercial) -- reaproveitada diretamente, nenhuma
// constante de roles duplicada para este modulo.
@ApiTags('quotations')
@ApiBearerAuth()
@Controller('quotations')
export class QuotationsController {
  constructor(
    private readonly quotationsService: QuotationsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...FREIGHT_READ_ROLES)
  @ApiOperation({ summary: 'Lista cotacoes (busca, filtro por cliente/status/periodo, paginacao).' })
  @ApiOkResponse({ type: PaginatedQuotationsEntity })
  findAll(@Query() query: FindQuotationsQueryDto): Promise<PaginatedQuotationsEntity> {
    return this.quotationsService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...FREIGHT_READ_ROLES)
  @ApiOperation({ summary: 'Consulta uma cotacao.' })
  @ApiOkResponse({ type: QuotationEntity })
  @ApiNotFoundResponse({ description: 'Cotacao nao encontrada nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<QuotationEntity> {
    return this.quotationsService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Get(':id/history')
  @Roles(...FREIGHT_READ_ROLES)
  @ApiOperation({ summary: 'Historico basico de alteracoes da cotacao (quem, quando, antes/depois).' })
  @ApiOkResponse({ type: PaginatedAuditLogEntity })
  @ApiNotFoundResponse({ description: 'Cotacao nao encontrada nesta empresa.' })
  findHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedAuditLogEntity> {
    return this.quotationsService.getHistory(this.tenantContext.requireTenantId(), id, query);
  }

  @Post()
  @Roles(...FREIGHT_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Cria uma cotacao. Calcula o valor via motor de precificacao existente quando ha tabela/regra ' +
      'aplicavel; senao, exige manualAmount.',
  })
  @ApiCreatedResponse({ type: QuotationEntity })
  @ApiNotFoundResponse({ description: 'Cliente, contato ou local (origem/destino) nao encontrados nesta empresa.' })
  @ApiConflictResponse({ description: 'Sem calculo automatico disponivel e manualAmount nao informado.' })
  create(@Body() dto: CreateQuotationDto): Promise<QuotationEntity> {
    return this.quotationsService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id')
  @Roles(...FREIGHT_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Atualiza uma cotacao (somente em DRAFT/SENT). So recalcula o valor quando o pedido muda um ' +
      'parametro relevante ao calculo.',
  })
  @ApiOkResponse({ type: QuotationEntity })
  @ApiNotFoundResponse({ description: 'Cotacao nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'Cotacao em estado final -- nao pode mais ser editada.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateQuotationDto): Promise<QuotationEntity> {
    return this.quotationsService.update(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id/status')
  @Roles(...FREIGHT_WRITE_ROLES)
  @ApiOperation({ summary: 'Altera o status da cotacao, respeitando as transicoes permitidas.' })
  @ApiOkResponse({ type: QuotationEntity })
  @ApiNotFoundResponse({ description: 'Cotacao nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'Transicao de status invalida.' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuotationStatusDto,
  ): Promise<QuotationEntity> {
    return this.quotationsService.updateStatus(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post(':id/convert-to-trip')
  @Roles(...FREIGHT_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Converte uma cotacao APPROVED em uma viagem (Trip) real, reaproveitando integralmente a criacao ' +
      'de viagens ja existente. Exige motorista/composicao (atribuicao operacional).',
  })
  @ApiOkResponse({ type: QuotationEntity })
  @ApiNotFoundResponse({ description: 'Cotacao nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'Cotacao nao esta APPROVED, ou dados de viagem invalidos (motorista/veiculo indisponiveis).' })
  convertToTrip(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertQuotationToTripDto,
  ): Promise<QuotationEntity> {
    return this.quotationsService.convertToTrip(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
