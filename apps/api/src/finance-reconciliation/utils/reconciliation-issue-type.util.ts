// Fase 75 -- tipos de inconsistencia (secao 1 do pedido). Nao sao um enum
// Prisma: nada aqui e persistido (secao 2 -- "status da conciliacao NAO
// deve ser persistido"), entao um union de string literals basta, mesmo
// espirito de EffectiveReceivableStatus (Fase 72) que estende um enum
// Prisma com valores calculados sem criar uma coluna nova.
export const RECONCILIATION_ISSUE_TYPES = [
  'RECEIVABLE_WITHOUT_BILLING',
  'BILLING_WITHOUT_RECEIVABLE',
  'RECEIVABLE_BALANCE_INCONSISTENT',
  'RECEIVABLE_PAYMENT_EXCEEDS_INVOICED',
  'PAYABLE_WITHOUT_APPROVED_EXPENSE',
  'PAYABLE_BALANCE_INCONSISTENT',
  'PAYABLE_PAYMENT_EXCEEDS_EXPENSE',
  'DUPLICATE_RECEIVABLE',
  'DUPLICATE_PAYABLE',
  'TRIP_EXPENSE_WITHOUT_PAYABLE',
  'TRIP_BILLING_WITHOUT_RECEIVABLE',
] as const;
export type ReconciliationIssueType = (typeof RECONCILIATION_ISSUE_TYPES)[number];

// Secao 3 -- "Use somente INFO/WARNING/CRITICAL. Nao crie outro enum se o
// projeto ja possuir um padrao reutilizavel." O enum existente mais
// proximo (AlertSeverity: LOW/MEDIUM/HIGH/CRITICAL, Fase 69) usa uma
// escala DIFERENTE da pedida aqui -- forcar o reuso proporia uma
// correspondencia arbitraria (MEDIUM = WARNING? HIGH = WARNING?) sem base
// real. Como esta severidade nunca e persistida (mesma razao do tipo
// acima), um union literal proprio e a opcao mais honesta.
export const RECONCILIATION_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const;
export type ReconciliationSeverity = (typeof RECONCILIATION_SEVERITIES)[number];

export const RECONCILIATION_ENTITY_TYPES = ['Receivable', 'Payable', 'TripBilling', 'TripExpense'] as const;
export type ReconciliationEntityType = (typeof RECONCILIATION_ENTITY_TYPES)[number];

// Severidade FIXA por tipo (secao 3 do pedido) -- nunca decidida ad-hoc no
// meio do detector, para o mapeamento tipo->severidade ficar auditavel em
// um unico lugar.
export const RECONCILIATION_SEVERITY_BY_TYPE: Record<ReconciliationIssueType, ReconciliationSeverity> = {
  // CRITICAL -- erro matematico real (saldo/pagamento impossivel) ou
  // duplicidade efetiva de titulo (secao 3: "duplicidade efetiva").
  RECEIVABLE_BALANCE_INCONSISTENT: 'CRITICAL',
  RECEIVABLE_PAYMENT_EXCEEDS_INVOICED: 'CRITICAL',
  PAYABLE_BALANCE_INCONSISTENT: 'CRITICAL',
  PAYABLE_PAYMENT_EXCEEDS_EXPENSE: 'CRITICAL',
  DUPLICATE_RECEIVABLE: 'CRITICAL',
  DUPLICATE_PAYABLE: 'CRITICAL',
  // WARNING -- vinculo problematico, mas nao um erro matematico (secao 3:
  // "faturamento sem conta a receber" / "despesa aprovada sem conta a
  // pagar" / titulo apontando para uma origem ja cancelada).
  RECEIVABLE_WITHOUT_BILLING: 'WARNING',
  BILLING_WITHOUT_RECEIVABLE: 'WARNING',
  PAYABLE_WITHOUT_APPROVED_EXPENSE: 'WARNING',
  TRIP_EXPENSE_WITHOUT_PAYABLE: 'WARNING',
  // INFO -- diferenca de materializacao esperada (faturamento/titulo
  // ainda em andamento, geracao de titulo e sempre manual/opcional -- ver
  // docs/finance-reconciliation.md).
  TRIP_BILLING_WITHOUT_RECEIVABLE: 'INFO',
};
