import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TripOccurrenceSeverity, TripOccurrenceType } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

// Criacao ADMINISTRATIVA (admin-web) -- tripId vem da rota (/trips/:id/occurrences),
// driverId/vehicleId opcionais e explicitos no corpo (nunca inferidos, o
// admin pode registrar uma ocorrencia sem veiculo/motorista definido ainda).
export class CreateTripOccurrenceDto {
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

  @ApiProperty({ description: 'Quando a ocorrencia de fato aconteceu (nunca inventado, nunca "agora" por padrao).' })
  @IsDateString({}, { message: 'occurredAt deve ser uma data valida (ISO 8601).' })
  occurredAt!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  driverId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  vehicleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  locationLabel?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Evidencia (foto) ja enviada via /attachments.' })
  @IsOptional()
  @IsUUID('4')
  attachmentId?: string;
}
