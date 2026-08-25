import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Min, MaxLength } from 'class-validator';

// Fase 83, secao 5 -- saida manual. A origem PRINCIPAL de saida e o consumo
// automatico ao concluir uma Ordem de Servico (ver
// PartsService.consumePartsForMaintenance) -- este endpoint cobre o caso
// manual (uso avulso, perda, etc.), por isso aceita opcionalmente
// `maintenanceId` para referenciar uma OS mesmo fora do fluxo automatico.
export class RegisterStockOutDto {
  @ApiProperty({ example: 2 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'quantity deve ser maior que zero.' })
  quantity!: number;

  @ApiPropertyOptional({ example: '2026-08-20', description: 'Data do movimento (default: agora).' })
  @IsOptional()
  @IsDateString({}, { message: 'movementDate deve ser uma data valida (ISO 8601).' })
  movementDate?: string;

  @ApiPropertyOptional({ example: 'Uso avulso' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  reason?: string;

  @ApiPropertyOptional({ example: 'OS-2026-00123' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  reference?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'OS relacionada, quando aplicavel (fora do fluxo automatico).' })
  @IsOptional()
  @IsUUID('4', { message: 'maintenanceId deve ser um UUID valido.' })
  maintenanceId?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
