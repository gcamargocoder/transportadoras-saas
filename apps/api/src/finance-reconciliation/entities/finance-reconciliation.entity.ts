import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import {
  RECONCILIATION_ENTITY_TYPES,
  RECONCILIATION_ISSUE_TYPES,
  RECONCILIATION_SEVERITIES,
  ReconciliationEntityType,
  ReconciliationIssueType,
  ReconciliationSeverity,
} from '../utils/reconciliation-issue-type.util';

// GET /finance/reconciliation -- Fase 75: PROJECAO calculada a partir dos
// ledgers existentes (Receivable/ReceivablePayment/Payable/PayablePayment/
// TripBilling/TripExpense). Nunca persistida -- detectedAt e sempre o
// instante da propria chamada (ver docs/finance-reconciliation.md).
export class FinanceReconciliationIssueEntity {
  @ApiProperty({ enum: RECONCILIATION_ISSUE_TYPES })
  type!: ReconciliationIssueType;

  @ApiProperty({ enum: RECONCILIATION_SEVERITIES })
  severity!: ReconciliationSeverity;

  @ApiProperty({ enum: RECONCILIATION_ENTITY_TYPES, description: 'Entidade de origem do problema -- usada pelo frontend para montar o link de navegacao.' })
  entityType!: ReconciliationEntityType;

  @ApiProperty({ format: 'uuid' })
  entityId!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  tripId!: string | null;

  @ApiProperty({ nullable: true, description: 'Rota de origem/destino da viagem, para exibicao.' })
  tripLabel!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true, description: 'Presente somente em problemas de Receivable/TripBilling (despesa nao tem cliente).' })
  customerId!: string | null;

  @ApiProperty({ nullable: true, description: 'Valor de referencia do titulo (originalAmount/invoicedAmount conforme o tipo).' })
  amount!: number | null;

  @ApiProperty({ nullable: true, description: 'Valor esperado (ex: teto permitido, ou saldo materializado no titulo).' })
  expectedAmount!: number | null;

  @ApiProperty({ nullable: true, description: 'Valor efetivamente encontrado (ex: soma real dos pagamentos).' })
  actualAmount!: number | null;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  detectedAt!: Date;
}

export class FinanceReconciliationSummaryEntity {
  @ApiProperty()
  totalIssues!: number;

  @ApiProperty()
  criticalCount!: number;

  @ApiProperty()
  warningCount!: number;

  @ApiProperty()
  infoCount!: number;

  @ApiProperty()
  totalReceivableIssues!: number;

  @ApiProperty()
  totalPayableIssues!: number;

  @ApiProperty()
  totalBillingIssues!: number;

  @ApiProperty()
  totalExpenseIssues!: number;
}

export class ReconciliationByTypeEntity {
  @ApiProperty({ enum: RECONCILIATION_ISSUE_TYPES })
  type!: ReconciliationIssueType;

  @ApiProperty({ enum: RECONCILIATION_SEVERITIES })
  severity!: ReconciliationSeverity;

  @ApiProperty()
  count!: number;
}

export class ReconciliationBySeverityEntity {
  @ApiProperty({ enum: RECONCILIATION_SEVERITIES })
  severity!: ReconciliationSeverity;

  @ApiProperty()
  count!: number;
}

export class PaginatedFinanceReconciliationIssuesEntity {
  @ApiProperty({ type: [FinanceReconciliationIssueEntity] })
  items!: FinanceReconciliationIssueEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}

export class FinanceReconciliationEntity {
  @ApiProperty({ type: FinanceReconciliationSummaryEntity })
  summary!: FinanceReconciliationSummaryEntity;

  @ApiProperty({ type: [ReconciliationByTypeEntity] })
  byType!: ReconciliationByTypeEntity[];

  @ApiProperty({ type: [ReconciliationBySeverityEntity] })
  bySeverity!: ReconciliationBySeverityEntity[];

  @ApiProperty({ type: PaginatedFinanceReconciliationIssuesEntity })
  issues!: PaginatedFinanceReconciliationIssuesEntity;
}
