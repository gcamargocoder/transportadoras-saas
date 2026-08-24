import { Controller, Param, ParseUUIDPipe, Post, UploadedFile, UseFilters, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiCreatedResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TenantModule } from '@prisma/client';
import { memoryStorage } from 'multer';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UPLOAD_THROTTLE } from '../../common/constants/throttle.constants';
import { TenantContext } from '../../tenants/context/tenant-context';
import { RequireModule } from '../../tenants/decorators/require-module.decorator';
import { MulterExceptionFilter } from '../../toll-import/filters/multer-exception.filter';
import { BANK_RECONCILIATION_WRITE_ROLES } from '../constants/bank-reconciliation-roles.constants';
import { ImportBankTransactionsResultEntity } from '../entities/import-bank-transactions-result.entity';
import { BankTransactionsImportService } from '../services/bank-transactions-import.service';

const MAX_CSV_SIZE_BYTES = 5 * 1024 * 1024; // 5MB -- extrato mensal tipico nunca chega perto disso.

// Fase 80, secao 13 -- controller SEPARADO, nested sob /finance/accounts/:id
// (mesmo principio de FinancialAccountsController vs FinancialTransfersController
// na Fase 78: rota final diferente do resto do modulo). memoryStorage()
// inline (nenhum MulterModule/config novo) -- o arquivo NUNCA toca o disco,
// conforme pedido explicito da secao 13 ("nao criar upload para storage
// permanente se nao houver necessidade").
@ApiTags('finance')
@ApiBearerAuth()
@RequireModule(TenantModule.FREIGHT)
@Controller('finance/accounts/:accountId/bank-transactions')
export class BankTransactionsImportController {
  constructor(
    private readonly importService: BankTransactionsImportService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post('import')
  @Roles(...BANK_RECONCILIATION_WRITE_ROLES)
  @Throttle(UPLOAD_THROTTLE)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_CSV_SIZE_BYTES } }))
  @UseFilters(MulterExceptionFilter)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary', description: 'CSV do extrato.' } } },
  })
  @ApiOperation({
    summary:
      'Importa um extrato CSV (colunas date/description/amount/type/externalId) para esta conta financeira. ' +
      'Sincrono: o resumo (lidas/importadas/duplicadas/invalidas) volta na propria resposta. NUNCA cria FinancialTransaction.',
  })
  @ApiCreatedResponse({ type: ImportBankTransactionsResultEntity })
  @ApiNotFoundResponse({ description: 'Conta financeira nao encontrada nesta empresa.' })
  importCsv(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ImportBankTransactionsResultEntity> {
    return this.importService.import(
      this.tenantContext.requireTenantId(),
      accountId,
      file,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
