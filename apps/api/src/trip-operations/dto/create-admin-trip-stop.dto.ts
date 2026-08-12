import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TripStopType } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

// POST /trip-stops (Fase 43) -- criacao ADMINISTRATIVA de uma parada, sem
// depender de uma viagem ativa (patio/garagem/quebra fora de viagem).
// vehicleId e SEMPRE explicito (nunca inferido/inventado); tripId/driverId
// sao opcionais aqui (diferente do fluxo do driver-app, onde ambos vem
// sempre derivados da Trip). source e forcado para ADMIN pelo service,
// nunca aceito deste DTO.
export class CreateAdminTripStopDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  vehicleId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  tripId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  driverId?: string;

  @ApiPropertyOptional({ enum: TripStopType, default: TripStopType.UNKNOWN })
  @IsOptional()
  @IsEnum(TripStopType, { message: 'type invalido.' })
  type?: TripStopType;

  @ApiProperty()
  @IsDateString({}, { message: 'startedAt deve ser uma data valida (ISO 8601).' })
  startedAt!: string;

  @ApiPropertyOptional({ description: 'Quando informado, a parada ja e criada fechada (registro retroativo).' })
  @IsOptional()
  @IsDateString({}, { message: 'endedAt deve ser uma data valida (ISO 8601).' })
  endedAt?: string;

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

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({
    description: 'Idempotencia opcional (double-click). Se omitido, o backend gera um id proprio.',
  })
  @IsOptional()
  @IsString()
  deviceEventId?: string;
}
