import { ApiProperty } from '@nestjs/swagger';

export class MaintenancePartEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', nullable: true, description: 'Fase 83 -- vinculo com o catalogo de pecas, quando aplicavel.' })
  partId!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  unitPrice!: number;

  @ApiProperty({ description: 'Sempre calculado: quantity * unitPrice.' })
  totalPrice!: number;
}
