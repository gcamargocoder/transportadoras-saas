import { ApiProperty } from '@nestjs/swagger';

export class VehicleTagEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  vehicleId!: string;

  @ApiProperty({ format: 'uuid' })
  tagProviderId!: string;

  @ApiProperty()
  tagNumber!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ nullable: true })
  activatedAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;
}
