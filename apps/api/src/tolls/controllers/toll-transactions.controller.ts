import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { TOLL_READ_ROLES, TOLL_WRITE_ROLES } from '../constants/toll-roles.constants';
import { CreateTollTransactionDto } from '../dto/create-toll-transaction.dto';
import { FindTollTransactionsQueryDto } from '../dto/find-toll-transactions-query.dto';
import { UpdateTollTransactionDto } from '../dto/update-toll-transaction.dto';
import { PaginatedTollTransactionsEntity } from '../entities/paginated-toll-transactions.entity';
import { TollDashboardEntity } from '../entities/toll-dashboard.entity';
import { TollTransactionEntity } from '../entities/toll-transaction.entity';
import { TollTransactionsService } from '../services/toll-transactions.service';

@ApiTags('toll-transactions')
@ApiBearerAuth()
@Controller('toll-transactions')
export class TollTransactionsController {
  constructor(
    private readonly tollTransactionsService: TollTransactionsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...TOLL_READ_ROLES)
  @ApiOperation({
    summary:
      'Lista transacoes de pedagio da empresa (filtro por viagem/veiculo/motorista/operadora/' +
      'praca/status/periodo, paginacao, ordenacao).',
  })
  @ApiOkResponse({ type: PaginatedTollTransactionsEntity })
  findAll(@Query() query: FindTollTransactionsQueryDto): Promise<PaginatedTollTransactionsEntity> {
    return this.tollTransactionsService.findAll(this.tenantContext.requireTenantId(), query);
  }

  // Declarado ANTES de ":id" de proposito -- "dashboard" nao pode ser
  // interceptado como se fosse um :id (mesmo padrao ja usado em outros
  // controllers para rotas literais vs. parametrizadas).
  @Get('dashboard')
  @Roles(...TOLL_READ_ROLES)
  @ApiOperation({
    summary:
      'Dashboard de pedagios: total, valor total, diferencas e quantidade por operadora/veiculo/' +
      'motorista/praca. Aceita os mesmos filtros da listagem.',
  })
  @ApiOkResponse({ type: TollDashboardEntity })
  getDashboard(@Query() query: FindTollTransactionsQueryDto): Promise<TollDashboardEntity> {
    return this.tollTransactionsService.getDashboard(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...TOLL_READ_ROLES)
  @ApiOperation({ summary: 'Consulta uma transacao de pedagio.' })
  @ApiOkResponse({ type: TollTransactionEntity })
  @ApiNotFoundResponse({ description: 'Transacao nao encontrada nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<TollTransactionEntity> {
    return this.tollTransactionsService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Post()
  @Roles(...TOLL_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Registra uma transacao de pedagio para uma viagem. Veiculo, motorista e operadora sao ' +
      'derivados automaticamente da viagem/tag ativa; valor esperado, diferenca e status ' +
      '(NORMAL/DIVERGENT/EXEMPT) sao calculados automaticamente.',
  })
  @ApiCreatedResponse({ type: TollTransactionEntity })
  @ApiNotFoundResponse({ description: 'Viagem ou praca de pedagio nao encontrada.' })
  @ApiConflictResponse({
    description: 'Veiculo sem tag, tag inativa/vencida, ou viagem sem veiculo vinculado.',
  })
  create(@Body() dto: CreateTollTransactionDto): Promise<TollTransactionEntity> {
    return this.tollTransactionsService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id')
  @Roles(...TOLL_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Atualiza uma transacao de pedagio (praca, eixos, valor, data, origem) -- valor esperado, ' +
      'diferenca e status sao recalculados automaticamente.',
  })
  @ApiOkResponse({ type: TollTransactionEntity })
  @ApiNotFoundResponse({ description: 'Transacao ou praca de pedagio nao encontrada.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTollTransactionDto,
  ): Promise<TollTransactionEntity> {
    return this.tollTransactionsService.update(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Delete(':id')
  @Roles(...TOLL_WRITE_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui uma transacao de pedagio.' })
  @ApiNoContentResponse({ description: 'Transacao excluida.' })
  @ApiNotFoundResponse({ description: 'Transacao nao encontrada nesta empresa.' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.tollTransactionsService.remove(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
