import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LocationType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// geoPoint (PostGIS) nao e exposto aqui -- exige SQL bruto ($queryRaw) e
// esta fora do escopo desta fase (nenhuma funcionalidade de mapa/rota).
export class CreateLocationDto {
  @ApiProperty({ example: 'CD Guarulhos' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @ApiProperty({ enum: LocationType, example: LocationType.DISTRIBUTION_CENTER })
  @IsEnum(LocationType, { message: 'type invalido.' })
  type!: LocationType;

  @ApiPropertyOptional({ example: 'Rod. Presidente Dutra, km 12' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;
}
