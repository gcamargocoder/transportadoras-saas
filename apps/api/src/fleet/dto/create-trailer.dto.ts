import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TrailerType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsVehiclePlate } from '../validators/is-vehicle-plate.validator';

export class CreateTrailerDto {
  @ApiProperty({ example: 'DEF2G34', description: 'Placa (formato antigo ou Mercosul).' })
  @IsVehiclePlate()
  plate!: string;

  @ApiProperty({ enum: TrailerType, example: TrailerType.SEMI_TRAILER })
  @IsEnum(TrailerType, { message: 'type invalido.' })
  type!: TrailerType;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
