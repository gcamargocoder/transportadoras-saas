import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateTollTransactionDto } from './create-toll-transaction.dto';

// tripId nao e editavel (estrutural -- para corrigir a viagem, exclua e
// recadastre a transacao). Qualquer alteracao em tollPlazaId/axleCount/
// chargedAmount recalcula automaticamente expectedAmount/discrepancyAmount/
// status (ver TollTransactionsService.update).
export class UpdateTollTransactionDto extends PartialType(
  OmitType(CreateTollTransactionDto, ['tripId'] as const),
) {}
