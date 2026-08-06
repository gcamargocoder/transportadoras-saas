import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FleetType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateFleetDto {
  @ApiProperty({ example: 'Filial SP' })
  @IsString()
  @MinLength(2, { message: 'name deve ter no minimo 2 caracteres.' })
  @MaxLength(100)
  name!: string;

  @ApiProperty({ enum: FleetType, example: FleetType.OWN })
  @IsEnum(FleetType, { message: 'type invalido.' })
  type!: FleetType;

  @ApiPropertyOptional({ format: 'uuid', description: 'Local/base associado (opcional).' })
  @IsOptional()
  @IsUUID('4', { message: 'locationId deve ser um UUID valido.' })
  locationId?: string;
}
