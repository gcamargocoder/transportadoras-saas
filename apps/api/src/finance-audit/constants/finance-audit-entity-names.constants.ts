// Fase 77 -- escopo do que conta como "auditoria financeira" nesta API:
// exatamente os entityName ja gravados por ReceivablesService/PayablesService/
// FinancialPeriodsService (ver AuditLogEntry.entityName em cada servico).
// Mantido como allow-list explicita -- GET /finance/audit nunca vira um
// backdoor generico para AuditLog de qualquer outro modulo (frota,
// usuarios, tenants etc).
// Fase 78 -- FinancialAccount/FinancialTransaction/FinancialTransfer
// adicionados pelo mesmo motivo: sao os entityName gravados por
// FinancialAccountsService/FinancialTransactionsService/FinancialTransfersService.
// Fase 80 -- FinancialBankTransaction, gravado por
// BankTransactionsImportService/BankTransactionsService.
export const FINANCE_AUDIT_ENTITY_NAMES = [
  'Receivable',
  'ReceivablePayment',
  'Payable',
  'PayablePayment',
  'FinancialPeriod',
  'FinancialAccount',
  'FinancialTransaction',
  'FinancialTransfer',
  'FinancialBankTransaction',
] as const;

export type FinanceAuditEntityName = (typeof FINANCE_AUDIT_ENTITY_NAMES)[number];
