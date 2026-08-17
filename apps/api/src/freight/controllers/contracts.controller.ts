import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantModule } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { FREIGHT_READ_ROLES, FREIGHT_WRITE_ROLES } from '../constants/freight-roles.constants';
import { CreateContractDto } from '../dto/create-contract.dto';
import { FindContractsQueryDto } from '../dto/find-contracts-query.dto';
import { UpdateContractDto } from '../dto/update-contract.dto';
import { ContractEntity } from '../entities/contract.entity';
import { PaginatedContractsEntity } from '../entities/paginated-contracts.entity';
import { ContractsService } from '../services/contracts.service';

@ApiTags('freight-contracts')
@ApiBearerAuth()
@RequireModule(TenantModule.FREIGHT)
@Controller('freight/contracts')
export class ContractsController {
  constructor(
    private readonly contractsService: ContractsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...FREIGHT_READ_ROLES)
  @ApiOperation({ summary: 'Lista contratos de frete da empresa (filtro por cliente/status/vencidos/busca).' })
  @ApiOkResponse({ type: PaginatedContractsEntity })
  findAll(@Query() query: FindContractsQueryDto): Promise<PaginatedContractsEntity> {
    return this.contractsService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...FREIGHT_READ_ROLES)
  @ApiOperation({ summary: 'Consulta um contrato de frete.' })
  @ApiOkResponse({ type: ContractEntity })
  @ApiNotFoundResponse({ description: 'Contrato nao encontrado nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ContractEntity> {
    return this.contractsService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Post()
  @Roles(...FREIGHT_WRITE_ROLES)
  @ApiOperation({ summary: 'Cria um contrato de frete (DRAFT).' })
  @ApiCreatedResponse({ type: ContractEntity })
  @ApiNotFoundResponse({ description: 'Cliente nao encontrado nesta empresa.' })
  create(@Body() dto: CreateContractDto): Promise<ContractEntity> {
    return this.contractsService.create(
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
      'Atualiza um contrato de frete (inclui transicao de status -- ativacao/suspensao/cancelamento, ' +
      'cada uma auditada com uma acao distinta).',
  })
  @ApiOkResponse({ type: ContractEntity })
  @ApiNotFoundResponse({ description: 'Contrato ou cliente nao encontrados nesta empresa.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContractDto,
  ): Promise<ContractEntity> {
    return this.contractsService.update(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
