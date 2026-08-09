import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AxleEventSource } from '@prisma/client';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

// Abre uma excecao de eixo numa praca (Fase 25). declaredAxles omitido =
// timeout (motorista nao respondeu ao alerta) -- o service assume o padrao
// da composicao automaticamente, nunca gera erro. NUNCA altera
// AxleConfiguration.totalAxles (isso e o padrao permanente da composicao,
// esta e so uma excecao pontual e temporaria).
export class CreateAxleEventDto {
  @ApiProperty({ description: 'Id gerado pelo dispositivo -- garante idempotencia.' })
  @IsString()
  deviceEventId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Praca identificada por proximidade GPS -- omitido quando nao foi possivel identificar.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'tollPlazaId deve ser um UUID valido.' })
  tollPlazaId?: string;

  @ApiPropertyOptional({
    description:
      'Quantidade de eixos informada pelo motorista. Omitido = motorista nao respondeu a tempo ' +
      '(timeout) -- o service assume automaticamente o padrao da composicao.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  declaredAxles?: number;

  @ApiProperty({ enum: AxleEventSource })
  @IsEnum(AxleEventSource, { message: 'source invalido.' })
  source!: AxleEventSource;

  @ApiProperty()
  @IsNumber()
  latitude!: number;

  @ApiProperty()
  @IsNumber()
  longitude!: number;
}
