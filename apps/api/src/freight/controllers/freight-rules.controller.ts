import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantModule } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { FREIGHT_READ_ROLES, FREIGHT_WRITE_ROLES } from '../constants/freight-roles.constants';
import { CreateFreightRuleDto } from '../dto/create-freight-rule.dto';
import { FindFreightRulesQueryDto } from '../dto/find-freight-rules-query.dto';
import { ReviseFreightRuleDto } from '../dto/revise-freight-rule.dto';
import { FreightRuleEntity } from '../entities/freight-rule.entity';
import { PaginatedFreightRulesEntity } from '../entities/paginated-freight-rules.entity';
import { FreightRulesService } from '../services/freight-rules.service';

@ApiTags('freight-rules')
@ApiBearerAuth()
@RequireModule(TenantModule.FREIGHT)
@Controller('freight/rules')
export class FreightRulesController {
  constructor(
    private readonly freightRulesService: FreightRulesService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...FREIGHT_READ_ROLES)
  @ApiOperation({ summary: 'Lista regras de frete (todas as versoes) -- filtro por tabela/status.' })
  @ApiOkResponse({ type: PaginatedFreightRulesEntity })
  findAll(@Query() query: FindFreightRulesQueryDto): Promise<PaginatedFreightRulesEntity> {
    return this.freightRulesService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...FREIGHT_READ_ROLES)
  @ApiOperation({ summary: 'Consulta uma versao especifica de uma regra de frete.' })
  @ApiOkResponse({ type: FreightRuleEntity })
  @ApiNotFoundResponse({ description: 'Regra nao encontrada nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<FreightRuleEntity> {
    return this.freightRulesService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Post()
  @Roles(...FREIGHT_WRITE_ROLES)
  @ApiOperation({ summary: 'Cria a primeira versao (version=1, ACTIVE) de uma regra de frete.' })
  @ApiCreatedResponse({ type: FreightRuleEntity })
  @ApiNotFoundResponse({ description: 'Tabela de frete (freightTableId) nao encontrada nesta empresa.' })
  create(@Body() dto: CreateFreightRuleDto): Promise<FreightRuleEntity> {
    return this.freightRulesService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post(':id/revise')
  @Roles(...FREIGHT_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Cria uma nova versao da regra (preserva a anterior intacta, arquivada) -- nunca altera a versao ' +
      'em uso por viagens ja cotadas. Campos omitidos herdam o valor da versao anterior.',
  })
  @ApiCreatedResponse({ type: FreightRuleEntity })
  @ApiNotFoundResponse({ description: 'Regra nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'Esta versao ja foi substituida ou arquivada.' })
  revise(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviseFreightRuleDto,
  ): Promise<FreightRuleEntity> {
    return this.freightRulesService.revise(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
