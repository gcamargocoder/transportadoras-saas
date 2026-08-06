import { ApiProperty } from '@nestjs/swagger';

export class AxleConfigurationEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  totalAxles!: number;

  @ApiProperty()
  raisedAxles!: number;

  @ApiProperty()
  loweredAxles!: number;

  @ApiProperty()
  suspendedAxles!: number;

  @ApiProperty()
  steeringAxles!: number;

  @ApiProperty()
  tractionAxles!: number;

  @ApiProperty()
  billableCategory!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
