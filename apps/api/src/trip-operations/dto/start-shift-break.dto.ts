import { ApiPropertyOptional } from '@nestjs/swagger';
import { TripStopType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

// POST /driver/shifts/:id/breaks -- inicia uma pausa (equivalente ao
// "pausar" da jornada). type reaproveita TripStopType.
export class StartShiftBreakDto {
  @ApiPropertyOptional({ enum: TripStopType, default: TripStopType.REST })
  @IsOptional()
  @IsEnum(TripStopType, { message: 'type invalido.' })
  type?: TripStopType;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
