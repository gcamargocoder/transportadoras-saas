import { ApiProperty } from '@nestjs/swagger';

export class TireDisposalEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tireId!: string;

  @ApiProperty()
  reason!: string;

  @ApiProperty()
  disposalDate!: Date;

  @ApiProperty({ nullable: true })
  odometerKm!: number | null;

  @ApiProperty({ nullable: true })
  residualValue!: number | null;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiProperty({ nullable: true })
  creatorName!: string | null;

  @ApiProperty()
  createdAt!: Date;
}
