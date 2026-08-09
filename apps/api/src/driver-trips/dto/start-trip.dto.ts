import { ApiPropertyOptional } from '@nestjs/swagger';
import { TripLoadStatus } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';

// Tela "INICIAR VIAGEM" do app do motorista (Fase 27) -- todos os campos sao
// OPCIONAIS de proposito: chamadas antigas (scripts, testes) que fazem POST
// /driver/trips/:id/start sem corpo continuam funcionando exatamente como
// antes (nenhuma funcionalidade existente e removida). A obrigatoriedade de
// preencher KM/carga na largada e uma regra do FLUXO do app (tela nao deixa
// avancar sem isso), nao uma restricao do contrato HTTP.
export class StartTripDto {
  @ApiPropertyOptional({
    example: 152340.5,
    description: 'Odometro (KM) do veiculo no momento da largada, informado pelo motorista.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0, { message: 'odometerKm nao pode ser negativo.' })
  odometerKm?: number;

  @ApiPropertyOptional({ enum: TripLoadStatus, description: 'Carregado ou vazio, na largada.' })
  @IsOptional()
  @IsEnum(TripLoadStatus, { message: 'loadStatus invalido.' })
  loadStatus?: TripLoadStatus;
}
