import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleIdleReason } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

// POST /fleet-operations/idle-periods (Fase B) -- criacao ADMINISTRATIVA de
// um periodo ocioso (ex: registro retroativo, periodo sem viagem de
// referencia). `source` NUNCA e aceito do cliente -- este fluxo grava
// sempre MANUAL_ADMIN. `durationMinutes` tambem nunca e aceito: quando
// `endedAt` e informado, o backend calcula (computeDurationMinutesOrThrow).
export class CreateVehicleIdlePeriodDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  vehicleId!: string;

  @ApiProperty({ example: '2026-09-01T18:00:00.000Z' })
  @IsDateString()
  startedAt!: string;

  @ApiPropertyOptional({ example: '2026-09-02T06:00:00.000Z', description: 'Se informado, cria o periodo ja fechado (duracao calculada pelo backend).' })
  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @ApiPropertyOptional({ enum: VehicleIdleReason, description: 'Default resolvido pelo tenant quando omitido.' })
  @IsOptional()
  @IsEnum(VehicleIdleReason, { message: 'reason invalido.' })
  reason?: VehicleIdleReason;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  tripBeforeId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  tripAfterId?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
