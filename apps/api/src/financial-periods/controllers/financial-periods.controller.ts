import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { TenantModule } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import { FINANCIAL_PERIOD_READ_ROLES, FINANCIAL_PERIOD_WRITE_ROLES } from '../constants/financial-period-roles.constants';
import { CreateFinancialPeriodDto } from '../dto/create-financial-period.dto';
import { FindFinancialPeriodsQueryDto } from '../dto/find-financial-periods-query.dto';
import { FinancialPeriodEntity } from '../entities/financial-period.entity';
import { PaginatedFinancialPeriodsEntity } from '../entities/paginated-financial-periods.entity';
import { FinancialPeriodsService } from '../services/financial-periods.service';

// Fase 76 -- fechamento financeiro/controle de periodo. Montado no MESMO
// prefixo /finance dos demais modulos financeiros (Fases 74/75) -- rotas
// finais GET/POST /finance/periods. Mesmo gate de modulo ja usado por
// /receivables, /payables, /finance/cash-flow e /finance/reconciliation
// (FREIGHT).
@ApiTags('finance')
@ApiBearerAuth()
@RequireModule(TenantModule.FREIGHT)
@Controller('finance/periods')
export class FinancialPeriodsController {
  constructor(
    private readonly financialPeriodsService: FinancialPeriodsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post()
  @Roles(...FINANCIAL_PERIOD_WRITE_ROLES)
  @ApiOperation({
    summary: 'Abre um periodo financeiro (YYYY-MM) para o tenant. Nasce sempre OPEN. Bloqueado se ja existir.',
  })
  @ApiCreatedResponse({ type: FinancialPeriodEntity })
  @ApiConflictResponse({ description: 'Ja existe um periodo para este year/month nesta empresa.' })
  create(@Body() dto: CreateFinancialPeriodDto): Promise<FinancialPeriodEntity> {
    return this.financialPeriodsService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Get()
  @Roles(...FINANCIAL_PERIOD_READ_ROLES)
  @ApiOperation({ summary: 'Lista periodos financeiros, paginado e filtravel por ano/status. Ordenado por year/month DESC.' })
  @ApiOkResponse({ type: PaginatedFinancialPeriodsEntity })
  findAll(@Query() query: FindFinancialPeriodsQueryDto): Promise<PaginatedFinancialPeriodsEntity> {
    return this.financialPeriodsService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...FINANCIAL_PERIOD_READ_ROLES)
  @ApiOperation({
    summary:
      'Detalhe de um periodo financeiro, incluindo um resumo calculado ao vivo (recebido/pago/em aberto/inconsistencias ' +
      'CRITICAL) a partir dos ledgers e da conciliacao ja existentes -- nunca um snapshot persistido.',
  })
  @ApiOkResponse({ type: FinancialPeriodEntity })
  @ApiNotFoundResponse({ description: 'Periodo financeiro nao encontrado nesta empresa.' })
  findById(@Param('id', ParseUUIDPipe) id: string): Promise<FinancialPeriodEntity> {
    return this.financialPeriodsService.findById(this.tenantContext.requireTenantId(), id);
  }

  @Post(':id/close')
  @Roles(...FINANCIAL_PERIOD_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Fecha o periodo -- bloqueia novas mutacoes financeiras cuja data de competencia caia neste mes. Somente OPEN pode ' +
      'ser fechado (idempotente, nunca fecha 2x). Bloqueado se houver inconsistencia CRITICAL nao resolvida na conciliacao. ' +
      'Nao ha reabertura nesta fase.',
  })
  @ApiOkResponse({ type: FinancialPeriodEntity })
  @ApiNotFoundResponse({ description: 'Periodo financeiro nao encontrado nesta empresa.' })
  @ApiConflictResponse({ description: 'Periodo ja fechado, ou existe inconsistencia CRITICAL nao resolvida.' })
  close(@Param('id', ParseUUIDPipe) id: string): Promise<FinancialPeriodEntity> {
    return this.financialPeriodsService.close(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
