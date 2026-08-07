import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateTripExpenseDto } from './create-trip-expense.dto';

// tripId e estrutural, nunca editavel apos a criacao (mesmo padrao de
// UpdateTollTransactionDto). Permitido apenas enquanto status = PENDING
// (ver TripExpensesService.update) -- para aprovar/rejeitar/cancelar, usar
// PATCH /trip-expenses/:id/status.
export class UpdateTripExpenseDto extends PartialType(
  OmitType(CreateTripExpenseDto, ['tripId'] as const),
) {}
