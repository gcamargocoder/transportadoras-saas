import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// tagProviderId e vehicleId nao sao editaveis aqui (estruturais) -- para
// trocar de operadora/veiculo, remove-se a tag e cadastra-se uma nova.
export class UpdateVehicleTagDto {
  @ApiPropertyOptional({ example: '1234567890123456' })
  @IsOptional()
  @IsString()
  @MinLength(4, { message: 'tagNumber deve ter no minimo 4 caracteres.' })
  @MaxLength(30)
  tagNumber?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString({}, { message: 'activatedAt deve ser uma data valida (ISO 8601).' })
  activatedAt?: string;

  @ApiPropertyOptional({ example: '2027-01-01' })
  @IsOptional()
  @IsDateString({}, { message: 'expiresAt deve ser uma data valida (ISO 8601).' })
  expiresAt?: string;
}
