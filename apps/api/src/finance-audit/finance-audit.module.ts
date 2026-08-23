import { Module } from '@nestjs/common';
import { FinanceAuditController } from './controllers/finance-audit.controller';
import { FinanceAuditService } from './services/finance-audit.service';

// Fase 77 -- AuditService e global (AuditModule @Global, Fase 1), nao
// precisa ser importado aqui.
@Module({
  controllers: [FinanceAuditController],
  providers: [FinanceAuditService],
})
export class FinanceAuditModule {}
