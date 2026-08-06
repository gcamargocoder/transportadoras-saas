import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleMaintenanceStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export class UpdateMaintenanceStatusDto {
  @ApiProperty({ enum: VehicleMaintenanceStatus, example: VehicleMaintenanceStatus.COMPLETED })
  @IsEnum(VehicleMaintenanceStatus, { message: 'status invalido.' })
  status!: VehicleMaintenanceStatus;

  @ApiPropertyOptional({
    example: '2026-08-08',
    description:
      'Data de conclusao. Obrigatoria (aqui ou ja registrada antes) para concluir a manutencao.',
  })
  @IsOptional()
  @IsDateString({}, { message: 'completedAt deve ser uma data valida (ISO 8601).' })
  completedAt?: string;
}
