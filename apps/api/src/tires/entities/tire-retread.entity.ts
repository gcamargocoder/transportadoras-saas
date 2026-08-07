import { ApiProperty } from '@nestjs/swagger';

export class TireRetreadEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tireId!: string;

  @ApiProperty()
  company!: string;

  @ApiProperty()
  cost!: number;

  @ApiProperty()
  retreadDate!: Date;

  @ApiProperty({ nullable: true })
  warranty!: string | null;

  @ApiProperty({ nullable: true })
  mileageKm!: number | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiProperty({ nullable: true })
  creatorName!: string | null;

  @ApiProperty()
  createdAt!: Date;
}
