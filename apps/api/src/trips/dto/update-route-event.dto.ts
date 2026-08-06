import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

// Unica edicao permitida: marcar o evento como resolvido. type/detectedAt
// nao sao editaveis (evento e um registro do que aconteceu).
export class UpdateRouteEventDto {
  @ApiPropertyOptional({ description: 'Quando o evento foi resolvido.' })
  @IsOptional()
  @IsDateString({}, { message: 'resolvedAt deve ser uma data valida (ISO 8601).' })
  resolvedAt?: string;
}
