import { ApiProperty } from '@nestjs/swagger';
import { FreightRuleStatus, VehicleType } from '@prisma/client';

export class FreightRuleFeeEntity {
  @ApiProperty()
  label!: string;

  @ApiProperty()
  amount!: number;
}

export class FreightRuleEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  freightTableId!: string;

  @ApiProperty()
  version!: number;

  @ApiProperty({ enum: FreightRuleStatus })
  status!: FreightRuleStatus;

  @ApiProperty({ format: 'uuid', nullable: true })
  previousVersionId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  nextVersionId!: string | null;

  @ApiProperty()
  effectiveFrom!: Date;

  @ApiProperty({ nullable: true })
  effectiveUntil!: Date | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  originLocationId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  destinationLocationId!: string | null;

  @ApiProperty({ nullable: true })
  originRegion!: string | null;

  @ApiProperty({ nullable: true })
  destinationRegion!: string | null;

  @ApiProperty({ nullable: true })
  cargoType!: string | null;

  @ApiProperty({ enum: VehicleType, nullable: true })
  vehicleType!: VehicleType | null;

  @ApiProperty({ nullable: true })
  minWeightKg!: number | null;

  @ApiProperty({ nullable: true })
  maxWeightKg!: number | null;

  @ApiProperty({ nullable: true })
  minCubageM3!: number | null;

  @ApiProperty({ nullable: true })
  maxCubageM3!: number | null;

  @ApiProperty()
  priority!: number;

  @ApiProperty({ nullable: true })
  baseAmount!: number | null;

  @ApiProperty({ nullable: true })
  perKmAmount!: number | null;

  @ApiProperty({ nullable: true })
  perTonAmount!: number | null;

  @ApiProperty({ nullable: true })
  minimumAmount!: number | null;

  @ApiProperty({ nullable: true })
  tollAmount!: number | null;

  @ApiProperty({ nullable: true })
  riskAdditionalAmount!: number | null;

  @ApiProperty({ nullable: true })
  nightAdditionalAmount!: number | null;

  @ApiProperty({ nullable: true })
  dailyRateAmount!: number | null;

  @ApiProperty({ nullable: true })
  demurrageAmount!: number | null;

  @ApiProperty({ type: [FreightRuleFeeEntity], nullable: true })
  otherFees!: FreightRuleFeeEntity[] | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

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
