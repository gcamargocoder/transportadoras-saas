import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Min, MaxLength } from 'class-validator';

// totalAmount NAO faz parte deste DTO -- e SEMPRE calculado no service
// (quantityLiters * pricePerLiter, mesma funcao computeTotalAmount de
// FuelSupply), nunca aceito do cliente (mesmo principio de
// CreateFuelSupplyDto). fuelStationId reaproveita FuelStation como
// fornecedor -- sem cadastro de fornecedor paralelo (secao 5 da Fase 2).
export class CreateFuelTankReceiptDto {
  @ApiProperty({ example: 2000, description: 'Litros recebidos -- deve ser maior que zero.' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001, { message: 'quantityLiters deve ser maior que zero.' })
  quantityLiters!: number;

  @ApiProperty({ example: 5.899, description: 'Preco por litro pago nesta compra.' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0, { message: 'pricePerLiter nao pode ser negativo.' })
  pricePerLiter!: number;

  @ApiPropertyOptional({ format: 'uuid', description: 'Fornecedor (reaproveita FuelStation). Opcional.' })
  @IsOptional()
  @IsUUID('4', { message: 'fuelStationId deve ser um UUID valido.' })
  fuelStationId?: string;

  @ApiPropertyOptional({ example: 'NF-4521' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  invoiceNumber?: string;

  @ApiPropertyOptional({ example: '2026-09-27T14:00:00.000Z', description: 'Data/hora do recebimento (default: agora).' })
  @IsOptional()
  @IsDateString({}, { message: 'receivedAt deve ser uma data valida (ISO 8601).' })
  receivedAt?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
