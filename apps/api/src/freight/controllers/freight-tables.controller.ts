import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantModule } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { FREIGHT_READ_ROLES, FREIGHT_WRITE_ROLES } from '../constants/freight-roles.constants';
import { CreateFreightTableDto } from '../dto/create-freight-table.dto';
import { FindFreightTablesQueryDto } from '../dto/find-freight-tables-query.dto';
import { UpdateFreightTableDto } from '../dto/update-freight-table.dto';
import { FreightTableEntity } from '../entities/freight-table.entity';
import { PaginatedFreightTablesEntity } from '../entities/paginated-freight-tables.entity';
import { FreightTablesService } from '../services/freight-tables.service';

@ApiTags('freight-tables')
@ApiBearerAuth()
@RequireModule(TenantModule.FREIGHT)
@Controller('freight/tables')
export class FreightTablesController {
  constructor(
    private readonly freightTablesService: FreightTablesService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...FREIGHT_READ_ROLES)
  @ApiOperation({ summary: 'Lista tabelas de frete da empresa (filtro por cliente/contrato/status/busca).' })
  @ApiOkResponse({ type: PaginatedFreightTablesEntity })
  findAll(@Query() query: FindFreightTablesQueryDto): Promise<PaginatedFreightTablesEntity> {
    return this.freightTablesService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...FREIGHT_READ_ROLES)
  @ApiOperation({ summary: 'Consulta uma tabela de frete.' })
  @ApiOkResponse({ type: FreightTableEntity })
  @ApiNotFoundResponse({ description: 'Tabela nao encontrada nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<FreightTableEntity> {
    return this.freightTablesService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Post()
  @Roles(...FREIGHT_WRITE_ROLES)
  @ApiOperation({ summary: 'Cria uma tabela de frete (DRAFT).' })
  @ApiCreatedResponse({ type: FreightTableEntity })
  @ApiNotFoundResponse({ description: 'Cliente ou contrato nao encontrados nesta empresa.' })
  create(@Body() dto: CreateFreightTableDto): Promise<FreightTableEntity> {
    return this.freightTablesService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id')
  @Roles(...FREIGHT_WRITE_ROLES)
  @ApiOperation({ summary: 'Atualiza uma tabela de frete (inclui transicao de status).' })
  @ApiOkResponse({ type: FreightTableEntity })
  @ApiNotFoundResponse({ description: 'Tabela, cliente ou contrato nao encontrados nesta empresa.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFreightTableDto,
  ): Promise<FreightTableEntity> {
    return this.freightTablesService.update(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
