import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

// Fase 111 -- tripId opcional: quando informado, filtra os templates pelo
// tipo de veiculo/carreta da composicao daquela viagem (ver
// ChecklistTemplatesService.findPublishedForDriver). Ausente = comportamento
// anterior (sem filtro), nunca quebra chamadas existentes.
export class FindAvailableChecklistsQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'tripId deve ser um UUID valido.' })
  tripId?: string;
}
