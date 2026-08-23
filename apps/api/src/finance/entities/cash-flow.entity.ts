import { ApiProperty } from '@nestjs/swagger';
import { ReceivablesByCustomerEntity } from '../../receivables/entities/receivables-dashboard.entity';
import { PayablesByCategoryEntity } from '../../payables/entities/payables-dashboard.entity';

// GET /finance/cash-flow -- Fase 74: PROJECAO calculada sobre os ledgers
// ja existentes (Receivable/ReceivablePayment/Payable/PayablePayment).
// NAO representa saldo bancario real: nao ha conta bancaria cadastrada,
// nao ha integracao/conciliacao bancaria neste projeto (ver
// docs/cash-flow.md). "Recebido"/"Pago" aqui SEMPRE vem do valor
// materializado receivedAmount/paidAmount (que e a soma real de
// ReceivablePayment/PayablePayment) -- nunca de TripBilling.status=PAID
// nem de TripExpense diretamente.
export class CashFlowSummaryEntity {
  @ApiProperty({ description: 'Soma de Receivable.receivedAmount (= soma de ReceivablePayment ja registrados), estado atual.' })
  totalReceived!: number;

  @ApiProperty({ description: 'Soma de Payable.paidAmount (= soma de PayablePayment ja registrados), estado atual.' })
  totalPaid!: number;

  @ApiProperty({ description: 'Saldo em aberto a receber (Receivable nao pago/nao cancelado) -- entrada prevista.' })
  totalReceivableOpen!: number;

  @ApiProperty({ description: 'Saldo em aberto a pagar (Payable nao pago/nao cancelado) -- saida prevista.' })
  totalPayableOpen!: number;

  @ApiProperty({ description: 'Parcela de totalReceivableOpen com dueDate no passado.' })
  totalReceivableOverdue!: number;

  @ApiProperty({ description: 'Parcela de totalPayableOpen com dueDate no passado.' })
  totalPayableOverdue!: number;

  @ApiProperty({
    description:
      'totalReceivableOpen - totalPayableOpen (entradas previstas - saidas previstas). NUNCA um saldo bancario real -- projecao simples sobre titulos em aberto.',
  })
  projectedNetBalance!: number;

  @ApiProperty({ description: 'Quantidade de ReceivablePayment ja registrados (todo o historico do tenant).' })
  receivedCount!: number;

  @ApiProperty({ description: 'Quantidade de PayablePayment ja registrados (todo o historico do tenant).' })
  paidCount!: number;
}

// Secao 3 -- serie mensal. period no formato "AAAA-MM". received/paid
// somam ReceivablePayment/PayablePayment cujo paymentDate cai no mes;
// receivableDue/payableDue somam o SALDO de titulos (nao pagos/nao
// cancelados) cujo dueDate cai no mes; receivableOverdue/payableOverdue
// sao a parcela desses com dueDate ja no passado (normalmente = due
// integral para meses passados, 0 para meses futuros).
export class CashFlowMonthlyPointEntity {
  @ApiProperty({ example: '2026-08' })
  period!: string;

  @ApiProperty()
  received!: number;

  @ApiProperty()
  paid!: number;

  @ApiProperty({ description: 'received - paid.' })
  net!: number;

  @ApiProperty()
  receivableDue!: number;

  @ApiProperty()
  payableDue!: number;

  @ApiProperty()
  receivableOverdue!: number;

  @ApiProperty()
  payableOverdue!: number;
}

export class CashFlowEntity {
  @ApiProperty({ type: CashFlowSummaryEntity })
  summary!: CashFlowSummaryEntity;

  @ApiProperty({ type: [CashFlowMonthlyPointEntity] })
  monthly!: CashFlowMonthlyPointEntity[];

  @ApiProperty({
    type: [ReceivablesByCustomerEntity],
    description: 'Top 10 clientes por saldo em aberto (balance) -- reaproveita ReceivablesDashboardService.byCustomer, apenas reordenado.',
  })
  topReceivableCustomers!: ReceivablesByCustomerEntity[];

  @ApiProperty({
    type: [PayablesByCategoryEntity],
    description: 'Top 10 categorias por saldo em aberto (balance) -- reaproveita PayablesDashboardService.byCategory, apenas reordenado.',
  })
  topPayableCategories!: PayablesByCategoryEntity[];
}
