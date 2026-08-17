import { ApiProperty } from '@nestjs/swagger';
import { DashboardChartPointEntity } from '../../dashboard/entities/dashboard-charts.entity';

export class BillingTopCustomerEntity {
  @ApiProperty({ format: 'uuid' })
  customerId!: string;

  @ApiProperty()
  customerName!: string;

  @ApiProperty()
  totalInvoiced!: number;

  @ApiProperty()
  billingsCount!: number;
}

export class BillingTopFleetEntity {
  @ApiProperty({ format: 'uuid', nullable: true })
  fleetId!: string | null;

  @ApiProperty()
  fleetName!: string;

  @ApiProperty()
  totalInvoiced!: number;

  @ApiProperty()
  billingsCount!: number;
}

export class BillingTopVehicleEntity {
  @ApiProperty({ format: 'uuid' })
  vehicleId!: string;

  @ApiProperty()
  plate!: string;

  @ApiProperty()
  totalInvoiced!: number;

  @ApiProperty()
  billingsCount!: number;
}

// Todos os agregados sao calculados sobre o MESMO lote de TripBilling ja
// carregado no escopo do filtro (periodo/cliente/frota/veiculo/motorista/
// status) -- numero de queries independente da quantidade de clientes/
// frotas/veiculos (mesmo principio da Fase 59).
export class BillingDashboardEntity {
  @ApiProperty()
  totalBillable!: number;

  @ApiProperty()
  totalInvoiced!: number;

  @ApiProperty({
    description:
      'Sempre igual a totalInvoiced -- o projeto nao tem nenhuma confirmacao de recebimento distinta do ' +
      'registro da receita (sem gateway de pagamento nesta fase). Exposto apenas para satisfazer a visao de ' +
      'conciliacao (secao 5).',
  })
  totalReceived!: number;

  @ApiProperty()
  balanceToInvoice!: number;

  @ApiProperty({ description: 'Viagens com valor faturavel e invoicedAmount=0 (nunca faturadas ainda).' })
  readyForInvoicingCount!: number;

  @ApiProperty({ description: 'TripBilling com status PARTIALLY_INVOICED.' })
  partiallyInvoicedCount!: number;

  @ApiProperty({ description: 'readyForInvoicingCount + partiallyInvoicedCount -- qualquer faturamento com saldo em aberto.' })
  pendingCount!: number;

  @ApiProperty({ type: [DashboardChartPointEntity], description: 'Ultimos 12 meses, valor faturado por mes.' })
  monthlyEvolution!: DashboardChartPointEntity[];

  @ApiProperty({ type: [BillingTopCustomerEntity] })
  topCustomers!: BillingTopCustomerEntity[];

  @ApiProperty({ type: [BillingTopFleetEntity] })
  topFleets!: BillingTopFleetEntity[];

  @ApiProperty({ type: [BillingTopVehicleEntity] })
  topVehicles!: BillingTopVehicleEntity[];

  @ApiProperty({
    description:
      'totalInvoiced - custo realizado das viagens no escopo (TripExpense aprovado + combustivel + pedagio, ' +
      'mesmas fontes ja usadas pelo financeiro/Fase 51/59 -- nenhum custo recalculado em paralelo).',
  })
  commercialMargin!: number;
}
