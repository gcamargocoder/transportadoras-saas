import { PartialType } from '@nestjs/swagger';
import { CreateProposalDto } from './create-proposal.dto';

// PATCH /proposals/:id -- so permitido em DRAFT (regra: conteudo bloqueado
// a partir de SENT). status muda apenas via PATCH /proposals/:id/status.
export class UpdateProposalDto extends PartialType(CreateProposalDto) {}
