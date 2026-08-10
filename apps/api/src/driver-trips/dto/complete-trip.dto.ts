import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min } from 'class-validator';

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
}
