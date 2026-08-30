import { ApiProperty } from '@nestjs/swagger';
import { TripBillingStatus, TripStatus } from '@prisma/client';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';

// Fase 103 -- linha da listagem "viagens elegiveis para faturamento"
// (GET /operational-billing/eligible-trips). Reaproveita integralmente o
// calculo de valor faturavel/saldo ja usado por TripBillingEntity (Fase
// 60) -- nunca uma segunda formula. Elegivel = tem valor comercial
// calculado (TripFreight) e ainda tem saldo a faturar (nenhum
// TripBilling ainda, ou um com status PARTIALLY_INVOICED -- INVOICED/PAID
// ja tem saldo zero, CANCELLED esta bloqueado, ver BillingListService).
export class EligibleTripForBillingEntity {
  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty({ enum: TripStatus })
  tripStatus!: TripStatus;

  @ApiProperty()
  tripLabel!: string;

  @ApiProperty({ nullable: true })
  plannedDeparture!: Date | null;

  @ApiProperty({ nullable: true })
  actualArrival!: Date | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  customerId!: string | null;

  @ApiProperty({ nullable: true })
  customerName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  driverId!: string | null;

  @ApiProperty({ nullable: true })
  driverName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  vehicleId!: string | null;

  @ApiProperty({ nullable: true })
  vehiclePlate!: string | null;

  @ApiProperty({ nullable: true, description: 'TripFreight.contractedAmount (Fase 59).' })
  contractedAmount!: number | null;

  @ApiProperty({ nullable: true, description: 'TripFreight.estimatedAmount (Fase 59).' })
  calculatedAmount!: number | null;

  @ApiProperty({ nullable: true, description: 'contratado -> final -> calculado, o primeiro disponivel. Nunca recalculado.' })
  billableAmount!: number | null;

  @ApiProperty({ description: 'Ja faturado ate agora nesta viagem (0 quando nenhum faturamento foi iniciado).' })
  invoicedAmount!: number;

  @ApiProperty({ nullable: true, description: 'billableAmount - invoicedAmount, nunca negativo.' })
  balance!: number | null;

  @ApiProperty({
    enum: TripBillingStatus,
    nullable: true,
    description: 'Status do TripBilling ja existente, quando houver (sempre PARTIALLY_INVOICED ou nulo nesta listagem).',
  })
  billingStatus!: TripBillingStatus | null;
}

export class PaginatedEligibleTripsForBillingEntity {
  @ApiProperty({ type: [EligibleTripForBillingEntity] })
  items!: EligibleTripForBillingEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
