import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

// POST /driver/shifts/start -- inicia a jornada. tripId opcional (secao 17
// do pedido: a jornada pode existir fora de uma viagem especifica, ex.
// deslocamento ate a garagem antes de qualquer viagem ser atribuida).
export class StartDriverShiftDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  tripId?: string;
}
