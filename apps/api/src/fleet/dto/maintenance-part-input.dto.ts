import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, Min, MaxLength } from 'class-validator';

// Fase 45 -- item de uma lista de pecas enviada em CreateMaintenanceDto/
// UpdateMaintenanceDto. Quando presente, MaintenancesService substitui TODA
// a lista de MaintenancePart do registro e recalcula partsCost como a soma
// -- nunca mescla item a item (evita duplicar/perder linha por reenvio
// parcial).
export class MaintenancePartInputDto {
  @ApiProperty({ example: 'Filtro de óleo' })
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiProperty({ example: 2 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'quantity deve ser maior que zero.' })
  quantity!: number;

  @ApiProperty({ example: 45.9 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'unitPrice nao pode ser negativo.' })
  unitPrice!: number;
}
