import { ApiProperty } from '@nestjs/swagger';

export class TripBillingEntryEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  amount!: number;

  @ApiProperty({ format: 'uuid' })
  revenueId!: string;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiProperty({ nullable: true })
  creatorName!: string | null;

  @ApiProperty()
  createdAt!: Date;
}
