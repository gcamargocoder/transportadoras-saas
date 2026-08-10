import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional } from 'class-validator';

// Fase 28, secao 4 -- posicao GPS no momento da retomada, opcional. Quando
// informada, registrada via TrackingPoint -- o proprio pipeline existente
// (TrackingPointsService.createBatch) reavalia desvio (Fase 26) a partir
// dela, sem nenhuma logica de rota nova aqui.
export class ResumeTripDto {
  @ApiPropertyOptional({ description: 'Latitude no momento da retomada (GPS), quando disponivel.' })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Longitude no momento da retomada (GPS), quando disponivel.' })
  @IsOptional()
  @IsNumber()
  longitude?: number;
}
