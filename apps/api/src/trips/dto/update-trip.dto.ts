import { PartialType } from '@nestjs/swagger';
import { CreateTripDto } from './create-trip.dto';

// Nao inclui "status" -- transicoes de status tem endpoint proprio
// (PATCH /trips/:id/status e PATCH /trips/:id/cancel) com validacao de
// transicao permitida, para nao misturar edicao de planejamento com
// mudanca de ciclo de vida.
export class UpdateTripDto extends PartialType(CreateTripDto) {}
