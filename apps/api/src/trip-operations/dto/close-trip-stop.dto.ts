import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TripStopType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

// Fecha uma parada ja aberta -- durationMinutes e SEMPRE calculado
// (endedAt - startedAt), nunca aceito do cliente. type/locationLabel podem
// ser informados aqui (classificacao feita depois, ver Fase 25 secao 7).
export class CloseTripStopDto {
  @ApiProperty()
  @IsDateString({}, { message: 'endedAt deve ser uma data valida (ISO 8601).' })
  endedAt!: string;

  @ApiPropertyOptional({ enum: TripStopType })
  @IsOptional()
  @IsEnum(TripStopType, { message: 'type invalido.' })
  type?: TripStopType;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  locationLabel?: string;
}
