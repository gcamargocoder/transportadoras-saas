import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TollDataProvider, UserRole } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ADMIN_THROTTLE } from '../../common/constants/throttle.constants';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { TenantContext } from '../../tenants/context/tenant-context';
import { TOLL_DATA_READ_ROLES } from '../constants/toll-data-roles.constants';
import { CreateTollRateDto } from '../dto/create-toll-rate.dto';
import { EffectiveTollTariffQueryDto } from '../dto/effective-toll-tariff-query.dto';
import { FindTollDataSyncRunsQueryDto } from '../dto/find-toll-data-sync-runs-query.dto';
import { FindTollRatesQueryDto } from '../dto/find-toll-rates-query.dto';
import { EffectiveTollTariffEntity, PaginatedTollRatesEntity, TollRateEntity } from '../entities/toll-rate.entity';
import { PaginatedTollDataSyncRunsEntity, TollDataSyncRunEntity } from '../entities/toll-data-sync-run.entity';
import { TollDataSourceEntity } from '../entities/toll-data-source.entity';
import { toTollDataSourceEntity, toTollDataSyncRunEntity } from '../mappers/toll-data.mapper';
import { TollDataSyncService } from '../services/toll-data-sync.service';
import { TollRatesService } from '../services/toll-rates.service';

class TriggerTollDataSyncDto {
  @ApiProperty({ enum: TollDataProvider })
  @IsEnum(TollDataProvider, { message: 'provider invalido.' })
  provider!: TollDataProvider;
}

// Fase 33 -- catalogo oficial de pedagios (dado de referencia GLOBAL, sem
// isolamento por tenant, mesmo padrao de TollPlaza/TagProvider). Autenticacao
// (JwtAuthGuard) e RBAC (RolesGuard) ja sao aplicados GLOBALMENTE via
// APP_GUARD (ver AuthModule) -- nunca redeclarados aqui, mesmo padrao de
// TollPlazasController. Leitura aberta aos papeis operacionais; sincronizar
// e registrar tarifa oficial restritos a SUPER_ADMIN (secao 11: "nunca
// permitir que motorista execute sincronizacao global").
@ApiTags('toll-data')
@ApiBearerAuth()
@Controller('toll-data')
export class TollDataController {
  constructor(
    private readonly syncService: TollDataSyncService,
    private readonly ratesService: TollRatesService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get('sources')
  @Roles(...TOLL_DATA_READ_ROLES)
  @ApiOperation({ summary: 'Lista as fontes oficiais conhecidas (ANTT/ARTESP) e o estado da ultima sincronizacao.' })
  @ApiOkResponse({ type: TollDataSourceEntity, isArray: true })
  async listSources(): Promise<TollDataSourceEntity[]> {
    const sources = await this.syncService.listSources();
    return sources.map(toTollDataSourceEntity);
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN)
  @Throttle(ADMIN_THROTTLE)
  @ApiOperation({
    summary:
      'Dispara sincronizacao manual de uma fonte oficial (secao 11). Somente SUPER_ADMIN -- ' +
      'catalogo e dado global, nunca por tenant.',
  })
  @ApiCreatedResponse()
  async triggerSync(@Body() dto: TriggerTollDataSyncDto) {
    const userId = this.tenantContext.requireUserId();
    return this.syncService.sync(dto.provider, userId);
  }

  @Get('sync-runs')
  @Roles(...TOLL_DATA_READ_ROLES)
  @ApiOperation({ summary: 'Historico de execucoes de sincronizacao (secao 12).' })
  @ApiOkResponse({ type: PaginatedTollDataSyncRunsEntity })
  async listSyncRuns(@Query() query: FindTollDataSyncRunsQueryDto): Promise<PaginatedTollDataSyncRunsEntity> {
    const { items, total } = await this.syncService.findSyncRuns(query);
    const result = new PaginatedTollDataSyncRunsEntity();
    result.items = items.map(toTollDataSyncRunEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  @Post('rates')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Registra uma tarifa oficial versionada (secao 4/13/31) -- entrada administrativa rastreavel ' +
      '(fonte/documento/data de coleta obrigatorios). Fecha automaticamente a vigencia anterior.',
  })
  @ApiCreatedResponse({ type: TollRateEntity })
  async createRate(@Body() dto: CreateTollRateDto): Promise<TollRateEntity> {
    return this.ratesService.create(
      dto,
      this.tenantContext.requireTenantId(),
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Get('rates')
  @Roles(...TOLL_DATA_READ_ROLES)
  @ApiOperation({ summary: 'Lista tarifas cadastradas (filtro por praca/status, paginacao).' })
  @ApiOkResponse({ type: PaginatedTollRatesEntity })
  async listRates(@Query() query: FindTollRatesQueryDto): Promise<PaginatedTollRatesEntity> {
    return this.ratesService.findAll(query);
  }

  @Get('plazas/:id/tariffs')
  @Roles(...TOLL_DATA_READ_ROLES)
  @ApiOperation({ summary: 'Historico completo de tarifas de uma praca (secao 18): atual + anteriores.' })
  @ApiOkResponse({ type: PaginatedTollRatesEntity })
  async plazaTariffHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() pagination: PaginationQueryDto,
  ): Promise<PaginatedTollRatesEntity> {
    return this.ratesService.findHistoryForPlaza(id, pagination);
  }

  @Get('plazas/:id/effective-tariff')
  @Roles(...TOLL_DATA_READ_ROLES)
  @ApiOperation({
    summary: 'Tarifa vigente de uma praca para uma categoria de eixos numa data (secao 17). Nunca inventa valor.',
  })
  @ApiOkResponse({ type: EffectiveTollTariffEntity })
  async effectiveTariff(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: EffectiveTollTariffQueryDto,
  ): Promise<EffectiveTollTariffEntity> {
    const date = query.date ? new Date(query.date) : new Date();
    return this.ratesService.getEffectiveTariff(id, query.axleCategory, date);
  }
}

// Reexport local -- usado so pela API de swagger da entidade de execucao
// (ApiOkResponse acima ja referencia TollDataSyncRunEntity indiretamente via
// PaginatedTollDataSyncRunsEntity; import explicito abaixo evita "unused"
// caso o bundler de tipos precise dele resolvido).
export type { TollDataSyncRunEntity };
