import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { FREIGHT_READ_ROLES } from '../../freight/constants/freight-roles.constants';
import { TenantContext } from '../../tenants/context/tenant-context';
import { PipelineBoardEntity } from '../entities/pipeline-board.entity';
import { PipelineDashboardEntity } from '../entities/pipeline-dashboard.entity';
import { PipelineDashboardService } from '../services/pipeline-dashboard.service';

@ApiTags('pipeline')
@ApiBearerAuth()
@Controller('pipeline')
export class PipelineDashboardController {
  constructor(
    private readonly dashboardService: PipelineDashboardService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get('board')
  @Roles(...FREIGHT_READ_ROLES)
  @ApiOperation({ summary: 'Visao Kanban: colunas por estagio, com totais reais e uma amostra de cartoes.' })
  @ApiOkResponse({ type: PipelineBoardEntity })
  getBoard(): Promise<PipelineBoardEntity> {
    return this.dashboardService.getBoard(this.tenantContext.requireTenantId());
  }

  @Get('dashboard')
  @Roles(...FREIGHT_READ_ROLES)
  @ApiOperation({
    summary: 'Dashboard simples: oportunidades abertas, valor estimado aberto, ganhos, perdas e taxa de conversao.',
  })
  @ApiOkResponse({ type: PipelineDashboardEntity })
  getDashboard(): Promise<PipelineDashboardEntity> {
    return this.dashboardService.getDashboard(this.tenantContext.requireTenantId());
  }
}
