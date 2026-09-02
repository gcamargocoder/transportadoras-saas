import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
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
import { TenantModule } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import { FLEET_READ_ROLES, FLEET_WRITE_ROLES } from '../../fleet/constants/fleet-roles.constants';
import { CreateMaintenancePlanDto } from '../dto/create-maintenance-plan.dto';
import { FindMaintenancePlanExecutionsQueryDto } from '../dto/find-maintenance-plan-executions-query.dto';
import { FindMaintenancePlansQueryDto } from '../dto/find-maintenance-plans-query.dto';
import { RegisterMaintenancePlanExecutionDto } from '../dto/register-maintenance-plan-execution.dto';
import { UpdateMaintenancePlanDto } from '../dto/update-maintenance-plan.dto';
import { PaginatedMaintenancePlanExecutionsEntity } from '../entities/maintenance-plan-execution.entity';
import { MaintenancePlanEntity } from '../entities/maintenance-plan.entity';
import { PaginatedMaintenancePlansEntity } from '../entities/paginated-maintenance-plans.entity';
import { MaintenancePlansService } from '../services/maintenance-plans.service';

// Fase 45 -- planos de manutencao preventiva. Mesmo RBAC do modulo de
// manutencao ja existente (FLEET_READ_ROLES/FLEET_WRITE_ROLES) -- nao
// justificaria um grupo novo so para isto.
@ApiTags('maintenance-plans')
@ApiBearerAuth()
@Controller('maintenance/plans')
@RequireModule(TenantModule.MAINTENANCE)
export class MaintenancePlansController {
  constructor(
    private readonly maintenancePlansService: MaintenancePlansService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({ summary: 'Lista planos de manutencao preventiva (filtro por veiculo/componente/ativo, paginado).' })
  @ApiOkResponse({ type: PaginatedMaintenancePlansEntity })
  findAll(@Query() query: FindMaintenancePlansQueryDto): Promise<PaginatedMaintenancePlansEntity> {
    return this.maintenancePlansService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({ summary: 'Consulta um plano de manutencao.' })
  @ApiOkResponse({ type: MaintenancePlanEntity })
  @ApiNotFoundResponse({ description: 'Plano nao encontrado nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<MaintenancePlanEntity> {
    return this.maintenancePlansService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Post()
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({ summary: 'Cria um plano de manutencao preventiva para um veiculo.' })
  @ApiCreatedResponse({ type: MaintenancePlanEntity })
  @ApiNotFoundResponse({ description: 'Veiculo nao encontrado nesta empresa.' })
  create(@Body() dto: CreateMaintenancePlanDto): Promise<MaintenancePlanEntity> {
    return this.maintenancePlansService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({ summary: 'Atualiza um plano de manutencao.' })
  @ApiOkResponse({ type: MaintenancePlanEntity })
  @ApiNotFoundResponse({ description: 'Plano ou veiculo nao encontrados.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMaintenancePlanDto): Promise<MaintenancePlanEntity> {
    return this.maintenancePlansService.update(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post(':id/executions')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Fase 81 -- registra uma execucao do plano preventivo (o servico foi feito). Grava como uma ' +
      'manutencao COMPLETED vinculada ao plano (reaproveita o historico existente). NUNCA abre OS, ' +
      'NUNCA altera o odometro real do veiculo. Recalcula automaticamente o proximo vencimento e ' +
      'devolve o plano ja reavaliado.',
  })
  @ApiCreatedResponse({ type: MaintenancePlanEntity })
  @ApiNotFoundResponse({ description: 'Plano nao encontrado nesta empresa.' })
  registerExecution(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegisterMaintenancePlanExecutionDto,
  ): Promise<MaintenancePlanEntity> {
    return this.maintenancePlansService.registerExecution(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Get(':id/executions')
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({ summary: 'Fase 81 -- historico (append-only) de execucoes registradas para este plano, paginado.' })
  @ApiOkResponse({ type: PaginatedMaintenancePlanExecutionsEntity })
  @ApiNotFoundResponse({ description: 'Plano nao encontrado nesta empresa.' })
  findExecutions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: FindMaintenancePlanExecutionsQueryDto,
  ): Promise<PaginatedMaintenancePlanExecutionsEntity> {
    return this.maintenancePlansService.findExecutions(this.tenantContext.requireTenantId(), id, query);
  }

  @Delete(':id')
  @Roles(...FLEET_WRITE_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui um plano de manutencao (somente se nao houver manutencao vinculada).' })
  @ApiNoContentResponse({ description: 'Plano excluido.' })
  @ApiNotFoundResponse({ description: 'Plano nao encontrado nesta empresa.' })
  @ApiConflictResponse({ description: 'Existe manutencao vinculada a este plano.' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.maintenancePlansService.remove(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
