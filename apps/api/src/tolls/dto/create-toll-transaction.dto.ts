import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TollTransactionSource } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

// vehicleId, driverId e tagProviderId NAO fazem parte deste DTO de proposito
// -- sao sempre DERIVADOS da Trip (motorista/veiculo da viagem) e da tag
// ativa do veiculo no momento do registro, nunca aceitos diretamente do
// cliente (mesma logica de "nunca confiar no tenant enviado pelo frontend",
// aplicada aqui a dados que devem espelhar a viagem real).
export class CreateTollTransactionDto {
  @ApiProperty({ format: 'uuid', description: 'Viagem a qual a transacao pertence.' })
  @IsUUID('4', { message: 'tripId deve ser um UUID valido.' })
  tripId!: string;

  @ApiProperty({ format: 'uuid', description: 'Praca de pedagio onde ocorreu a cobranca.' })
  @IsUUID('4', { message: 'tollPlazaId deve ser um UUID valido.' })
  tollPlazaId!: string;

  @ApiProperty({ example: 6, description: 'Quantidade de eixos considerada na cobranca.' })
  @IsInt()
  @Min(1, { message: 'axleCount deve ser no minimo 1.' })
  axleCount!: number;

  @ApiProperty({ example: 75.0, description: 'Valor efetivamente cobrado.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'chargedAmount nao pode ser negativo.' })
  chargedAmount!: number;

  @ApiProperty({ example: '2026-09-01T10:30:00.000Z' })
  @IsDateString({}, { message: 'chargedAt deve ser uma data valida (ISO 8601).' })
  chargedAt!: string;

  @ApiPropertyOptional({ enum: TollTransactionSource, default: TollTransactionSource.MANUAL })
  @IsOptional()
  @IsEnum(TollTransactionSource, { message: 'source invalido.' })
  source?: TollTransactionSource;
}
