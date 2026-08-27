import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

// Fase 88 -- adiciona uma parada/entrega ao FIM da viagem (sequence sempre
// calculada automaticamente pelo service, nunca aceita aqui). Reordenar e
// uma acao propria (ver ReorderTripDeliveryStopsDto), separada de criar.
export class CreateTripDeliveryStopDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Destinatario, quando ja cadastrado como Customer.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'customerId deve ser um UUID valido.' })
  customerId?: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Local de entrega (mesmo cadastro de Location usado por origem/destino da viagem).',
  })
  @IsUUID('4', { message: 'locationId deve ser um UUID valido.' })
  locationId!: string;

  @ApiPropertyOptional({
    example: '2026-03-10T14:00:00.000Z',
    description: 'Previsao de chegada informada manualmente -- nunca calculada por algoritmo.',
  })
  @IsOptional()
  @IsDateString({}, { message: 'plannedArrival deve ser uma data valida (ISO 8601).' })
  plannedArrival?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
