import { ApiProperty } from '@nestjs/swagger';

export class TireInspectionEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tireId!: string;

  @ApiProperty()
  inspectionDate!: Date;

  @ApiProperty()
  treadDepthMm!: number;

  @ApiProperty({ nullable: true })
  pressurePsi!: number | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiProperty({ nullable: true })
  creatorName!: string | null;

  @ApiProperty()
  createdAt!: Date;
}
