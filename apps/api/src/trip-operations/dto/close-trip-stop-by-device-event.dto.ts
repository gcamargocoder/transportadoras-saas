import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TripStopType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

// Fecha uma parada identificada pelo deviceEventId USADO NA ABERTURA (nao
// pelo id gerado pelo servidor) -- Fase 43. Resolve a limitacao real
// documentada no driver-app (syncQueue.ts/useLocationTracker.ts): fechar
// pela fila offline precisava do id do servidor, que so chega depois de
// uma resposta online bem-sucedida. Com esta rota, a fila pode enfileirar
// o fechamento com o MESMO deviceEventId conhecido desde a abertura, sem
// depender de ter recebido resposta antes.
export class CloseTripStopByDeviceEventDto {
  @ApiProperty({ description: 'deviceEventId usado para ABRIR esta parada (nao um novo id).' })
  @IsString()
  deviceEventId!: string;

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

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
