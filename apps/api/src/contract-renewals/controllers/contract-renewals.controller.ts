import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantModule } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import { FREIGHT_READ_ROLES, FREIGHT_WRITE_ROLES } from '../../freight/constants/freight-roles.constants';
import { CompleteContractRenewalDto } from '../dto/complete-contract-renewal.dto';
import { ContractRenewalSummaryQueryDto } from '../dto/contract-renewal-summary-query.dto';
import { CreateContractRenewalDto } from '../dto/create-contract-renewal.dto';
import { FindContractRenewalsQueryDto } from '../dto/find-contract-renewals-query.dto';
import { FindExpiringContractsQueryDto } from '../dto/find-expiring-contracts-query.dto';
import { ContractRenewalEntity } from '../entities/contract-renewal.entity';
import { ContractRenewalSummaryEntity } from '../entities/contract-renewal-summary.entity';
import { PaginatedContractRenewalsEntity } from '../entities/paginated-contract-renewals.entity';
import { PaginatedExpiringContractsEntity } from '../entities/paginated-expiring-contracts.entity';
import { ContractRenewalsService } from '../services/contract-renewals.service';

@ApiTags('contract-renewals')
@ApiBearerAuth()
@RequireModule(TenantModule.FREIGHT)
@Controller('contract-renewals')
export class ContractRenewalsController {
  constructor(
    private readonly contractRenewalsService: ContractRenewalsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...FREIGHT_READ_ROLES)
  @ApiOperation({ summary: 'Lista renovacoes de contrato (filtro por contrato/cliente/status).' })
  @ApiOkResponse({ type: PaginatedContractRenewalsEntity })
  findAll(@Query() query: FindContractRenewalsQueryDto): Promise<PaginatedContractRenewalsEntity> {
    return this.contractRenewalsService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get('expiring-contracts')
  @Roles(...FREIGHT_READ_ROLES)
  @ApiOperation({ summary: 'Lista contratos vencendo (dentro de withinDays) ou ja vencidos.' })
  @ApiOkResponse({ type: PaginatedExpiringContractsEntity })
  getExpiringContracts(@Query() query: FindExpiringContractsQueryDto): Promise<PaginatedExpiringContractsEntity> {
    return this.contractRenewalsService.getExpiringContracts(this.tenantContext.requireTenantId(), query);
  }

  @Get('summary')
  @Roles(...FREIGHT_READ_ROLES)
  @ApiOperation({ summary: 'Indicadores de renovacao (contratos vencendo/vencidos, renovacoes pendentes) para o CRM.' })
  @ApiOkResponse({ type: ContractRenewalSummaryEntity })
  getSummary(@Query() query: ContractRenewalSummaryQueryDto): Promise<ContractRenewalSummaryEntity> {
    return this.contractRenewalsService.getSummary(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...FREIGHT_READ_ROLES)
  @ApiOperation({ summary: 'Consulta uma renovacao de contrato.' })
  @ApiOkResponse({ type: ContractRenewalEntity })
  @ApiNotFoundResponse({ description: 'Renovacao nao encontrada nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ContractRenewalEntity> {
    return this.contractRenewalsService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Post()
  @Roles(...FREIGHT_WRITE_ROLES)
  @ApiOperation({ summary: 'Inicia uma renovacao para um contrato ACTIVE ou EXPIRED.' })
  @ApiCreatedResponse({ type: ContractRenewalEntity })
  @ApiNotFoundResponse({ description: 'Contrato nao encontrado nesta empresa.' })
  @ApiConflictResponse({ description: 'Contrato nao esta em status renovavel, ou ja existe renovacao PENDING.' })
  initiate(@Body() dto: CreateContractRenewalDto): Promise<ContractRenewalEntity> {
    return this.contractRenewalsService.initiate(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post(':id/complete')
  @Roles(...FREIGHT_WRITE_ROLES)
  @ApiOperation({ summary: 'Conclui a renovacao: cria o novo contrato, ativa-o e marca o anterior como EXPIRED.' })
  @ApiOkResponse({ type: ContractRenewalEntity })
  @ApiNotFoundResponse({ description: 'Renovacao nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'Renovacao nao esta PENDING.' })
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteContractRenewalDto,
  ): Promise<ContractRenewalEntity> {
    return this.contractRenewalsService.complete(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post(':id/cancel')
  @Roles(...FREIGHT_WRITE_ROLES)
  @ApiOperation({ summary: 'Cancela uma renovacao PENDING (nao altera o contrato anterior).' })
  @ApiOkResponse({ type: ContractRenewalEntity })
  @ApiNotFoundResponse({ description: 'Renovacao nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'Renovacao nao esta PENDING.' })
  cancel(@Param('id', ParseUUIDPipe) id: string): Promise<ContractRenewalEntity> {
    return this.contractRenewalsService.cancel(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
