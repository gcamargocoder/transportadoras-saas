import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';

// Somente valores PREVISTOS -- os executados ficam vazios nesta fase
// (preenchidos por fases futuras de rastreamento/telemetria/pedagio).
export class PlannedTripMetricsDto {
  @ApiPropertyOptional({ example: 450.5, description: 'Distancia prevista, em km.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  distanceKm?: number;

  @ApiPropertyOptional({ example: 360, description: 'Duracao prevista, em minutos.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  durationMin?: number;

  @ApiPropertyOptional({ example: 180, description: 'Combustivel previsto, em litros.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fuelLiters?: number;

  @ApiPropertyOptional({ example: 320.9, description: 'Pedagio previsto, em R$.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  tollAmount?: number;

  @ApiPropertyOptional({ example: 2500, description: 'Custo total previsto, em R$.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalCost?: number;
}
