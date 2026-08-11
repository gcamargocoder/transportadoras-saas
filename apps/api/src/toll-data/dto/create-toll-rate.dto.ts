import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TollDataProvider } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

// Entrada ADMINISTRATIVA de uma tarifa oficial (Fase 33) -- usada quando a
// fonte nao permite coleta automatica confiavel (ver relatorio da fase:
// nenhuma tarifa ANTT/ARTESP tem fonte estruturada confirmada nesta fase).
// sourceDocument/sourceReference/collectedAt sao OBRIGATORIOS de proposito:
// nunca permitir registrar uma tarifa "porque alguem digitou um numero" sem
// rastreabilidade (secao 38 -- "de onde veio essa tarifa?").
export class CreateTollRateDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  tollPlazaId!: string;

  @ApiProperty({ example: '9 eixos' })
  @IsString()
  @MinLength(1)
  axleCategory!: string;

  @ApiProperty({ example: 87.4 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'price nao pode ser negativo.' })
  price!: number;

  @ApiPropertyOptional({ default: 'BRL' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ description: 'Data de inicio de vigencia oficial da tarifa.' })
  @IsDateString({}, { message: 'effectiveFrom deve ser uma data valida (ISO 8601).' })
  effectiveFrom!: string;

  @ApiProperty({ enum: TollDataProvider })
  @IsEnum(TollDataProvider, { message: 'provider invalido.' })
  provider!: TollDataProvider;

  @ApiProperty({ description: 'Referencia ao documento oficial (ex: numero do ato/deliberacao).' })
  @IsString()
  @MinLength(1, { message: 'sourceDocument e obrigatorio -- toda tarifa precisa de um documento oficial rastreavel.' })
  sourceDocument!: string;

  @ApiProperty({ description: 'URL ou identificador oficial de onde o valor foi obtido.' })
  @IsString()
  @MinLength(1, { message: 'sourceReference e obrigatorio.' })
  sourceReference!: string;

  @ApiProperty({ description: 'Quando o valor foi efetivamente coletado/conferido.' })
  @IsDateString({}, { message: 'collectedAt deve ser uma data valida (ISO 8601).' })
  collectedAt!: string;
}
