import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min, MaxLength } from 'class-validator';

// currentStock/isLowStock NAO fazem parte deste DTO de proposito: uma peca
// sempre nasce com currentStock=0 (entrada de estoque e um ato separado,
// via POST /parts/:id/stock/in) -- mesmo padrao ja usado por
// CreateMaintenanceDto (status/totalCost nunca aceitos do cliente).
export class CreatePartDto {
  @ApiProperty({ example: 'FLT-OL-001', description: 'Codigo/SKU interno, unico por empresa.' })
  @IsString()
  @MaxLength(50)
  sku!: string;

  @ApiProperty({ example: 'Filtro de óleo' })
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ example: 'UN', description: 'Unidade de medida (ex: UN, L, KG, M).' })
  @IsString()
  @MaxLength(10)
  unit!: string;

  @ApiPropertyOptional({ example: 'Filtros' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ example: 'Fram' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  manufacturer?: string;

  @ApiPropertyOptional({ example: 'PH-3593A', description: 'Codigo original do fabricante do veiculo (OEM).' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  oemCode?: string;

  @ApiPropertyOptional({ example: 5, description: 'Estoque minimo -- usado para calcular estoque baixo.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'minStock nao pode ser negativo.' })
  minStock?: number;
}
