import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional } from 'class-validator';

// Fase 28, secao 3 -- posicao GPS no momento da pausa, opcional (o motorista
// pode estar sem sinal). Quando informada, registrada via TrackingPoint
// (mesmo pipeline do Fase 25, sem mecanismo paralelo).
export class PauseTripDto {
  @ApiPropertyOptional({ description: 'Latitude no momento da pausa (GPS), quando disponivel.' })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Longitude no momento da pausa (GPS), quando disponivel.' })
  @IsOptional()
  @IsNumber()
  longitude?: number;
}
