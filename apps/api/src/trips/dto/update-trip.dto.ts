import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { CreateTripDto } from './create-trip.dto';

// Nao inclui "status" -- transicoes de status tem endpoint proprio
// (PATCH /trips/:id/status e PATCH /trips/:id/cancel) com validacao de
// transicao permitida, para nao misturar edicao de planejamento com
// mudanca de ciclo de vida.
//
// tollRouteId e omitido do PartialType e redeclarado abaixo aceitando
// tambem `null` -- e o unico jeito de expressar "desvincular a rota"
// (compact() preserva null e descarta somente undefined).
export class UpdateTripDto extends PartialType(OmitType(CreateTripDto, ['tollRouteId'] as const)) {
  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Rota de pedagio. Envie null para desvincular a rota da viagem.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'tollRouteId deve ser um UUID valido.' })
  tollRouteId?: string | null;
}
