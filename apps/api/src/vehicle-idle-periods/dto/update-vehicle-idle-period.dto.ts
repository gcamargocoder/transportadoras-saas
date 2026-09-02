import { ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleIdleReason } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

// PATCH /fleet-operations/idle-periods/:id (Fase B) -- correcao pelo
// administrador. Usos: corrigir o `reason` de um periodo auto-criado
// (secao 6), adicionar `notes`, ou FECHAR/AJUSTAR manualmente informando
// `endedAt` (a duracao e SEMPRE recalculada pelo backend, nunca aceita, e
// nunca negativa). Nao permite mexer em vehicleId/startedAt/source/
// tripBeforeId/tripAfterId -- esses sao definidos na abertura.
export class UpdateVehicleIdlePeriodDto {
  @ApiPropertyOptional({ enum: VehicleIdleReason })
  @IsOptional()
  @IsEnum(VehicleIdleReason, { message: 'reason invalido.' })
  reason?: VehicleIdleReason;

  @ApiPropertyOptional({ description: 'Fecha/ajusta o fim do periodo. Duracao recalculada pelo backend.' })
  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
