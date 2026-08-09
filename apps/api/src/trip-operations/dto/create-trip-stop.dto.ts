import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TripStopType } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

// Abre uma parada operacional (Fase 25) -- o app do motorista decide QUANDO
// abrir (veiculo parado na mesma regiao acima do limite configuravel), o
// backend so valida e persiste. type comeca UNKNOWN por padrao e pode ser
// reclassificado depois (ver CloseTripStopDto), nunca bloqueia o registro.
export class CreateTripStopDto {
  @ApiProperty({ description: 'Id gerado pelo dispositivo -- garante idempotencia.' })
  @IsString()
  deviceEventId!: string;

  @ApiProperty()
  @IsNumber()
  latitude!: number;

  @ApiProperty()
  @IsNumber()
  longitude!: number;

  @ApiProperty()
  @IsDateString({}, { message: 'startedAt deve ser uma data valida (ISO 8601).' })
  startedAt!: string;

  @ApiPropertyOptional({ enum: TripStopType, default: TripStopType.UNKNOWN })
  @IsOptional()
  @IsEnum(TripStopType, { message: 'type invalido.' })
  type?: TripStopType;
}
