import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, Min } from 'class-validator';

export class CompleteMaintenanceDto {
  @ApiPropertyOptional({
    example: '2026-08-08',
    description: 'Data de conclusao. Obrigatoria (aqui ou ja registrada antes) para concluir a OS.',
  })
  @IsOptional()
  @IsDateString({}, { message: 'completedAt deve ser uma data valida (ISO 8601).' })
  completedAt?: string;

  @ApiPropertyOptional({ example: 125430, description: 'Quilometragem do veiculo na conclusao da OS.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'completionOdometerKm deve ser maior ou igual a zero.' })
  completionOdometerKm?: number;
}
