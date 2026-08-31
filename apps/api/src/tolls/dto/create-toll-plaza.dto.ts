import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TollPlazaType } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTollPlazaDto {
  @ApiProperty({ example: 'Praca Sao Roque' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @ApiProperty({ example: 'CCR ViaOeste', description: 'Concessionaria da rodovia.' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  operator!: string;

  @ApiPropertyOptional({
    enum: TollPlazaType,
    default: TollPlazaType.PHYSICAL_PLAZA,
    description:
      'PHYSICAL_PLAZA (padrao) ou FREE_FLOW_GANTRY (portico de cobranca sem parada). ' +
      'Omitido = PHYSICAL_PLAZA.',
  })
  @IsOptional()
  @IsEnum(TollPlazaType)
  type?: TollPlazaType;

  @ApiPropertyOptional({ example: 'SP-280' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  highway?: string;

  @ApiPropertyOptional({ example: 45.2, description: 'Quilometro da rodovia.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  km?: number;

  @ApiPropertyOptional({ example: 'Sao Roque' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'SP' })
  @IsOptional()
  @IsString()
  @Length(2, 2, { message: 'state deve ser a UF com 2 letras (ex: SP).' })
  state?: string;

  @ApiPropertyOptional({ example: -23.5283 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ example: -47.1349 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({
    example: 12.5,
    description: 'Valor cobrado por eixo -- usado no calculo automatico do valor esperado.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'pricePerAxle deve ser maior que zero quando informado.' })
  pricePerAxle?: number;
}
