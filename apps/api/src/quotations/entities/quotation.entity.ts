import { ApiProperty } from '@nestjs/swagger';
import { QuotationAmountSource, QuotationStatus, VehicleType } from '@prisma/client';

export class QuotationEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  customerId!: string;

  @ApiProperty({ nullable: true })
  customerName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  customerContactId!: string | null;

  @ApiProperty({ nullable: true })
  customerContactName!: string | null;

  @ApiProperty({ format: 'uuid' })
  originLocationId!: string;

  @ApiProperty({ nullable: true })
  originLocationName!: string | null;

  @ApiProperty({ format: 'uuid' })
  destinationLocationId!: string;

  @ApiProperty({ nullable: true })
  destinationLocationName!: string | null;

  @ApiProperty({ nullable: true })
  cargoType!: string | null;

  @ApiProperty({ nullable: true })
  weightKg!: number | null;

  @ApiProperty({ nullable: true })
  cubageM3!: number | null;

  @ApiProperty({ enum: VehicleType, nullable: true })
  vehicleType!: VehicleType | null;

  @ApiProperty({ nullable: true })
  conditions!: string | null;

  @ApiProperty({ enum: QuotationStatus })
  status!: QuotationStatus;

  @ApiProperty()
  validUntil!: Date;

  @ApiProperty({ description: 'Derivado de validUntil < agora -- nunca uma transicao de status propria.' })
  expired!: boolean;

  @ApiProperty({ enum: QuotationAmountSource })
  amountSource!: QuotationAmountSource;

  @ApiProperty({ description: 'Valor cotado final (snapshot).' })
  amount!: number;

  @ApiProperty({ format: 'uuid', nullable: true })
  freightTableId!: string | null;

  @ApiProperty({ nullable: true })
  freightTableName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  freightRuleId!: string | null;

  @ApiProperty({ nullable: true })
  freightRuleVersion!: number | null;

  @ApiProperty({ nullable: true })
  baseAmount!: number | null;

  @ApiProperty({ nullable: true })
  additionsAmount!: number | null;

  @ApiProperty({ nullable: true })
  tollAmount!: number | null;

  @ApiProperty({ nullable: true })
  feesAmount!: number | null;

  @ApiProperty({ nullable: true, description: 'Valor bruto sugerido pelo motor, preservado mesmo quando o valor final foi informado manualmente.' })
  calculatedAmount!: number | null;

  @ApiProperty({ type: Object, nullable: true })
  calculationInput!: Record<string, unknown> | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  convertedTripId!: string | null;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiProperty({ nullable: true })
  creatorName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  updatedBy!: string | null;

  @ApiProperty({ nullable: true })
  updaterName!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
