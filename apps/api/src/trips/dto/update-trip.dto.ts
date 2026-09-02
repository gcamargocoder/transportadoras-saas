import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { TripLoadStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { CreateTripDto } from './create-trip.dto';

// Nao inclui "status" -- transicoes de status tem endpoint proprio
// (PATCH /trips/:id/status e PATCH /trips/:id/cancel) com validacao de
// transicao permitida, para nao misturar edicao de planejamento com
// mudanca de ciclo de vida.
//
// tollRouteId e omitido do PartialType e redeclarado abaixo aceitando
// tambem `null` -- e o unico jeito de expressar "desvincular a rota"
// (compact() preserva null e descarta somente undefined).
export class UpdateTripDto extends PartialType(
  OmitType(CreateTripDto, ['tollRouteId', 'previousTripId', 'plannedLoadStatus'] as const),
) {
  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Rota de pedagio. Envie null para desvincular a rota da viagem.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'tollRouteId deve ser um UUID valido.' })
  tollRouteId?: string | null;

  // Fase D -- mesmos campos do create, mas aceitando `null` para DESVINCULAR
  // (compact() preserva null e descarta undefined). A regra "so PLANNED
  // pode editar planejamento" continua valendo (TripsService.update).
  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Viagem de IDA que originou este retorno. Envie null para remover o vinculo.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('4', { message: 'previousTripId deve ser um UUID valido.' })
  previousTripId?: string | null;

  @ApiPropertyOptional({
    enum: TripLoadStatus,
    nullable: true,
    description: 'Intencao de carga do planejamento. Envie null para limpar. NAO altera loadStatus.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(TripLoadStatus, { message: 'plannedLoadStatus invalido.' })
  plannedLoadStatus?: TripLoadStatus | null;
}
