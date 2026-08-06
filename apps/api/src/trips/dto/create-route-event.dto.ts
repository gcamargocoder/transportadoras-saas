import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RouteEventType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

// CRUD administrativo -- nenhuma geracao automatica de evento nesta fase.
// Preparado para: acidente, desvio, obra, bloqueio (interdicao), alteracao
// de destino (valores ja cobertos por RouteEventType).
export class CreateRouteEventDto {
  @ApiProperty({ enum: RouteEventType, example: RouteEventType.ROADWORK })
  @IsEnum(RouteEventType, { message: 'type invalido.' })
  type!: RouteEventType;

  @ApiPropertyOptional({ description: 'Quando o evento foi detectado. Default: agora.' })
  @IsOptional()
  @IsDateString({}, { message: 'detectedAt deve ser uma data valida (ISO 8601).' })
  detectedAt?: string;
}
