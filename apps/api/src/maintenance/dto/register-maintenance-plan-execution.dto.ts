import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

// Fase 81 -- "registrar execucao" de um plano de manutencao preventiva.
// Registra que o servico foi FEITO (nunca abre OS automaticamente, nunca
// altera o odometro real do veiculo). Recalcula o proximo vencimento a
// partir desta execucao. Todos os campos opcionais: sem executedAt usa
// "agora"; sem odometerKm o calculo por KM fica indisponivel ate a
// proxima execucao com KM (nunca inventa um valor).
export class RegisterMaintenancePlanExecutionDto {
  @ApiPropertyOptional({
    example: '2026-09-01T10:00:00.000Z',
    description: 'Data/hora em que a manutencao foi executada (ISO 8601). Default: agora.',
  })
  @IsOptional()
  @IsDateString({}, { message: 'executedAt deve ser uma data valida (ISO 8601).' })
  executedAt?: string;

  @ApiPropertyOptional({
    example: 152340,
    description: 'Odometro do veiculo no momento da execucao. Nunca altera Vehicle.odometerKm.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'odometerKm nao pode ser negativo.' })
  odometerKm?: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
