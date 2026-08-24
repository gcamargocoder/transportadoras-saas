import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantModule } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import { FINANCIAL_ACCOUNT_WRITE_ROLES } from '../constants/financial-account-roles.constants';
import { CreateFinancialTransferDto } from '../dto/create-financial-transfer.dto';
import { FinancialTransferResultEntity } from '../entities/financial-transfer-result.entity';
import { FinancialTransfersService } from '../services/financial-transfers.service';

// Fase 78, secao 9 -- POST /finance/transfers, separado de
// /finance/accounts por ser uma operacao entre DUAS contas (nunca aninhada
// sob uma delas).
@ApiTags('finance')
@ApiBearerAuth()
@RequireModule(TenantModule.FREIGHT)
@Controller('finance/transfers')
export class FinancialTransfersController {
  constructor(
    private readonly transfersService: FinancialTransfersService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post()
  @Roles(...FINANCIAL_ACCOUNT_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Transfere valor entre duas contas financeiras do mesmo tenant (atomico: DEBIT na origem + CREDIT no destino, ' +
      'ou nenhuma das duas). Nunca tratada como receita/despesa.',
  })
  @ApiCreatedResponse({ type: FinancialTransferResultEntity })
  @ApiNotFoundResponse({ description: 'Conta de origem e/ou destino nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'Origem igual ao destino, conta inativa, ou periodo financeiro fechado.' })
  create(@Body() dto: CreateFinancialTransferDto): Promise<FinancialTransferResultEntity> {
    return this.transfersService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
