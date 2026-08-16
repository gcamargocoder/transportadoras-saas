import { ApiProperty } from '@nestjs/swagger';

export class MaintenancePartEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  unitPrice!: number;

  @ApiProperty({ description: 'Sempre calculado: quantity * unitPrice.' })
  totalPrice!: number;
}
