import { ApiProperty } from '@nestjs/swagger';
import { TripBillingStatus } from '@prisma/client';
import { TripBillingEntryEntity } from './trip-billing-entry.entity';

// Visao de faturamento/conciliacao da viagem (secao 1/5 da Fase 60):
// contratado -> calculado -> faturavel -> faturado -> recebido -> saldo.
// "Persisted=false" significa que nenhum faturamento foi iniciado ainda
// -- entidade calculada ao vivo (mesmo espirito de TripSettlementsService.
// getSettlement, Fase 51), nunca um erro 404.
export class TripBillingEntity {
  @ApiProperty({ format: 'uuid', nullable: true, description: 'Nulo quando ainda nao persistido (nenhum faturamento iniciado).' })
  id!: string | null;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty({ nullable: true })
  tripLabel!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  customerId!: string | null;

  @ApiProperty({ nullable: true })
  customerName!: string | null;

  @ApiProperty()
  persisted!: boolean;

  @ApiProperty({ enum: TripBillingStatus })
  status!: TripBillingStatus;

  @ApiProperty({ nullable: true, description: 'TripFreight.contractedAmount (Fase 59) -- valor contratado.' })
  contractedAmount!: number | null;

  @ApiProperty({ nullable: true, description: 'TripFreight.estimatedAmount (Fase 59) -- valor calculado pelo motor.' })
  calculatedAmount!: number | null;

  @ApiProperty({ nullable: true, description: 'contratado -> final -> calculado, o primeiro disponivel. Nunca recalculado aqui.' })
  billableAmount!: number | null;

  @ApiProperty()
  invoicedAmount!: number;

  @ApiProperty({
    description:
      'Soma das receitas geradas por este faturamento. Sempre igual a invoicedAmount -- o projeto nao tem ' +
      'nenhuma confirmacao de recebimento distinta do registro da receita (sem gateway de pagamento nesta fase).',
  })
  receivedAmount!: number;

  @ApiProperty({ nullable: true })
  balance!: number | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty({ type: [TripBillingEntryEntity] })
  entries!: TripBillingEntryEntity[];

  @ApiProperty({ nullable: true })
  cancelledAt!: Date | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  cancelledBy!: string | null;

  @ApiProperty({ nullable: true })
  cancellerName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  createdBy!: string | null;

  @ApiProperty({ nullable: true })
  creatorName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  updatedBy!: string | null;

  @ApiProperty({ nullable: true })
  updaterName!: string | null;

  @ApiProperty({ nullable: true })
  createdAt!: Date | null;

  @ApiProperty({ nullable: true })
  updatedAt!: Date | null;
}
