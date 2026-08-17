import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

// Fase 56 -- POST /driver/trips/:id/delivery-proof. tripId vem da URL
// (ja validado contra o motorista autenticado pelo controller); vehicleId/
// driverId/customerId NUNCA vem do cliente -- sempre derivados da viagem/
// motorista autenticado no service (ver FiscalDocumentsService.
// submitDeliveryProofFromDriverApp).
export class SubmitDeliveryProofDto {
  @ApiProperty({ description: 'Id gerado pelo dispositivo -- garante idempotencia ao reenviar apos reconexao (fila offline do Driver App).' })
  @IsString()
  deviceEventId!: string;

  @ApiPropertyOptional({ maxLength: 1000, description: 'Observacao livre do motorista sobre a entrega.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observation?: string;

  @ApiPropertyOptional({
    example: '2026-08-16T14:30:00.000Z',
    description: 'Timestamp do dispositivo no momento do registro -- se omitido, usa o momento do recebimento no servidor.',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'capturedAt deve ser uma data valida (ISO 8601).' })
  capturedAt?: string;
}
