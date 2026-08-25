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
import { Throttle } from '@nestjs/throttler';
import { TenantModule } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { PaginatedAuditLogEntity } from '../../audit/entities/paginated-audit-log.entity';
import { CRITICAL_THROTTLE } from '../../common/constants/throttle.constants';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { TenantContext } from '../../tenants/context/tenant-context';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import { FLEET_READ_ROLES, FLEET_WRITE_ROLES } from '../constants/fleet-roles.constants';
import { CompleteMaintenanceDto } from '../dto/complete-maintenance.dto';
import { CreateMaintenanceDto } from '../dto/create-maintenance.dto';
import { DiagnoseMaintenanceDto } from '../dto/diagnose-maintenance.dto';
import { FindMaintenancesQueryDto } from '../dto/find-maintenances-query.dto';
import { UpdateMaintenanceStatusDto } from '../dto/update-maintenance-status.dto';
import { UpdateMaintenanceDto } from '../dto/update-maintenance.dto';
import { MaintenanceEntity } from '../entities/maintenance.entity';
import { PaginatedMaintenancesEntity } from '../entities/paginated-maintenances.entity';
import { MaintenancesService } from '../services/maintenances.service';

@ApiTags('maintenances')
@ApiBearerAuth()
@Controller('maintenances')
@RequireModule(TenantModule.MAINTENANCE)
export class MaintenancesController {
  constructor(
    private readonly maintenancesService: MaintenancesService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({
    summary:
      'Lista manutencoes da empresa (filtro por status/tipo/prioridade/veiculo/placa/periodo/oficina/fornecedor, busca, paginacao, ordenacao).',
  })
  @ApiOkResponse({ type: PaginatedMaintenancesEntity })
  findAll(@Query() query: FindMaintenancesQueryDto): Promise<PaginatedMaintenancesEntity> {
    return this.maintenancesService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({ summary: 'Consulta uma manutencao da empresa.' })
  @ApiOkResponse({ type: MaintenanceEntity })
  @ApiNotFoundResponse({ description: 'Manutencao nao encontrada nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<MaintenanceEntity> {
    return this.maintenancesService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Post()
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({ summary: 'Abre uma manutencao para um veiculo da empresa.' })
  @ApiCreatedResponse({ type: MaintenanceEntity })
  @ApiNotFoundResponse({
    description: 'Veiculo (vehicleId) ou usuario responsavel (responsibleUserId) nao encontrados.',
  })
  create(@Body() dto: CreateMaintenanceDto): Promise<MaintenanceEntity> {
    return this.maintenancesService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({ summary: 'Atualiza dados de uma manutencao.' })
  @ApiOkResponse({ type: MaintenanceEntity })
  @ApiNotFoundResponse({
    description: 'Manutencao, veiculo ou usuario responsavel nao encontrados.',
  })
  @ApiConflictResponse({ description: 'Data de conclusao anterior a data de abertura.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaintenanceDto,
  ): Promise<MaintenanceEntity> {
    return this.maintenancesService.update(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id/status')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Altera o status da manutencao (OPEN, IN_PROGRESS, WAITING_PARTS, COMPLETED, CANCELLED).',
  })
  @ApiOkResponse({ type: MaintenanceEntity })
  @ApiNotFoundResponse({ description: 'Manutencao nao encontrada nesta empresa.' })
  @ApiConflictResponse({
    description: 'Conclusao sem data de conclusao/valor total, ou data inconsistente.',
  })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaintenanceStatusDto,
  ): Promise<MaintenanceEntity> {
    return this.maintenancesService.updateStatus(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Get(':id/history')
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({ summary: 'Historico de auditoria da OS (abertura, diagnostico, aprovacao, execucao, conclusao etc).' })
  @ApiOkResponse({ type: PaginatedAuditLogEntity })
  @ApiNotFoundResponse({ description: 'Manutencao nao encontrada nesta empresa.' })
  getHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() pagination: PaginationQueryDto,
  ): Promise<PaginatedAuditLogEntity> {
    return this.maintenancesService.getHistory(this.tenantContext.requireTenantId(), id, pagination);
  }

  // ==========================================================================
  // Fase 82 -- acoes dedicadas do ciclo de vida da OS (Ordem de Servico).
  // ABERTA -> DIAGNOSTICO -> AGUARDANDO APROVACAO -> APROVADA -> EM EXECUCAO
  // -> CONCLUIDA, + CANCELADA. Ver docs/work-orders.md.
  // ==========================================================================

  @Post(':id/diagnose')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({ summary: 'Inicia o diagnostico da OS (OPEN -> DIAGNOSING).' })
  @ApiOkResponse({ type: MaintenanceEntity })
  @ApiNotFoundResponse({ description: 'Manutencao nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'OS nao esta em um status que permita iniciar diagnostico.' })
  diagnose(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DiagnoseMaintenanceDto,
  ): Promise<MaintenanceEntity> {
    return this.maintenancesService.diagnose(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post(':id/submit-for-approval')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({ summary: 'Envia a OS para aprovacao (OPEN/DIAGNOSING -> AWAITING_APPROVAL).' })
  @ApiOkResponse({ type: MaintenanceEntity })
  @ApiNotFoundResponse({ description: 'Manutencao nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'OS nao esta em um status que permita enviar para aprovacao.' })
  submitForApproval(@Param('id', ParseUUIDPipe) id: string): Promise<MaintenanceEntity> {
    return this.maintenancesService.submitForApproval(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post(':id/approve')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({ summary: 'Aprova a OS (AWAITING_APPROVAL -> APPROVED).' })
  @ApiOkResponse({ type: MaintenanceEntity })
  @ApiNotFoundResponse({ description: 'Manutencao nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'OS nao esta aguardando aprovacao.' })
  approve(@Param('id', ParseUUIDPipe) id: string): Promise<MaintenanceEntity> {
    return this.maintenancesService.approve(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post(':id/start')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Inicia a execucao da OS (-> IN_PROGRESS). Bloqueia se o veiculo estiver em viagem agora ou ' +
      'se ja houver outra OS em execucao para o mesmo veiculo.',
  })
  @ApiOkResponse({ type: MaintenanceEntity })
  @ApiNotFoundResponse({ description: 'Manutencao nao encontrada nesta empresa.' })
  @ApiConflictResponse({
    description: 'OS nao esta em um status que permita iniciar execucao, veiculo em viagem, ou outra OS em execucao.',
  })
  start(@Param('id', ParseUUIDPipe) id: string): Promise<MaintenanceEntity> {
    return this.maintenancesService.start(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post(':id/complete')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({ summary: 'Conclui a OS (-> COMPLETED). Exige data de conclusao e valor total > 0.' })
  @ApiOkResponse({ type: MaintenanceEntity })
  @ApiNotFoundResponse({ description: 'Manutencao nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'OS ja encerrada, ou sem data de conclusao/valor total.' })
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteMaintenanceDto,
  ): Promise<MaintenanceEntity> {
    return this.maintenancesService.complete(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Post(':id/cancel')
  @Roles(...FLEET_WRITE_ROLES)
  @ApiOperation({ summary: 'Cancela a OS (-> CANCELLED).' })
  @ApiOkResponse({ type: MaintenanceEntity })
  @ApiNotFoundResponse({ description: 'Manutencao nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'OS ja encerrada (concluida ou cancelada).' })
  cancel(@Param('id', ParseUUIDPipe) id: string): Promise<MaintenanceEntity> {
    return this.maintenancesService.cancel(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Delete(':id')
  @Roles(...FLEET_WRITE_ROLES)
  @Throttle(CRITICAL_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Exclui uma manutencao -- somente se nao estiver concluida nem possuir historico de auditoria.',
  })
  @ApiNoContentResponse({ description: 'Manutencao excluida.' })
  @ApiNotFoundResponse({ description: 'Manutencao nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'Manutencao concluida ou com historico de auditoria.' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.maintenancesService.remove(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
