import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TripOccurrenceSeverity, TripOccurrenceType } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

// POST /driver/trips/:id/occurrences -- registro pelo proprio motorista.
// driverId/vehicleId SEMPRE derivados da Trip/DriverContext (mesmo
// principio de CreateTripStopDto), nunca aceitos do corpo. Idempotente por
// deviceEventId (mesma fila offline syncQueue.ts, nenhum mecanismo novo).
export class CreateDriverTripOccurrenceDto {
  @ApiProperty({ description: 'Id gerado pelo dispositivo -- garante idempotencia.' })
  @IsString()
  deviceEventId!: string;

  @ApiProperty({ enum: TripOccurrenceType })
  @IsEnum(TripOccurrenceType, { message: 'type invalido.' })
  type!: TripOccurrenceType;

  @ApiPropertyOptional({ enum: TripOccurrenceSeverity, default: TripOccurrenceSeverity.INFO })
  @IsOptional()
  @IsEnum(TripOccurrenceSeverity, { message: 'severity invalido.' })
  severity?: TripOccurrenceSeverity;

  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  description!: string;

  @ApiProperty()
  @IsDateString({}, { message: 'occurredAt deve ser uma data valida (ISO 8601).' })
  occurredAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ format: 'uuid', description: 'Evidencia (foto) ja enviada via /attachments.' })
  @IsOptional()
  @IsUUID('4')
  attachmentId?: string;
}
