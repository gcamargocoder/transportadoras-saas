import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TripStopType } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

// Fontes aceitas vindas do driver-app -- SOMENTE estas duas (nunca ADMIN/
// SYSTEM/IMPORT, que so o backend atribui). Sao um HINT de qual fluxo do
// proprio app disparou a chamada (toque manual em StopsScreen vs deteccao
// automatica em useLocationTracker) -- os dois ja existiam antes da Fase 43
// e ja chamavam este mesmo endpoint sem essa distincao ser persistida.
export const DRIVER_APP_TRIP_STOP_SOURCES = ['DRIVER_APP', 'GPS'] as const;
export type DriverAppTripStopSource = (typeof DRIVER_APP_TRIP_STOP_SOURCES)[number];

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

  @ApiPropertyOptional({ enum: DRIVER_APP_TRIP_STOP_SOURCES, default: 'DRIVER_APP' })
  @IsOptional()
  @IsIn(DRIVER_APP_TRIP_STOP_SOURCES, { message: 'source invalido.' })
  source?: DriverAppTripStopSource;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
