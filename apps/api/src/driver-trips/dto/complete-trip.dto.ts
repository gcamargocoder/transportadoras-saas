import { ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleIdleReason } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';

// Fase 28, secao 11/12 -- tela "FINALIZAR VIAGEM": so pede o KM final (opcional
// no contrato HTTP, mesmo principio da Fase 27 -- a obrigatoriedade e regra
// da tela do app, chamadas antigas sem corpo continuam funcionando). Validado
// contra Vehicle.odometerKm em TripsService.updateStatus (odometer.util.ts),
// nunca duplicado aqui.
export class CompleteTripDto {
  @ApiPropertyOptional({
    example: 152890.4,
    description: 'Odometro (KM) final do veiculo, informado pelo motorista ao encerrar a viagem.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'finalOdometerKm nao pode ser negativo.' })
  finalOdometerKm?: number;

  @ApiPropertyOptional({ description: 'Latitude no momento da finalizacao (GPS), quando disponivel.' })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Longitude no momento da finalizacao (GPS), quando disponivel.' })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  // Fase C -- motivo OPCIONAL da parada do veiculo apos esta viagem. Quando
  // informado, e aplicado ao VehicleIdlePeriod que o backend abre ao
  // concluir (Fase B) -- source passa a DRIVER_APP. NUNCA cria um 2o
  // periodo. Omitir mantem o motivo default (AGUARDANDO_ORDEM ou o
  // configurado pelo tenant) -- o motorista nunca e obrigado a informar.
  @ApiPropertyOptional({ enum: VehicleIdleReason, description: 'Motivo da parada do veiculo apos a viagem (opcional).' })
  @IsOptional()
  @IsEnum(VehicleIdleReason, { message: 'idleReason invalido.' })
  idleReason?: VehicleIdleReason;
}
