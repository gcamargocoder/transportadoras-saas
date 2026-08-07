import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateTripRevenueDto } from './create-trip-revenue.dto';

// tripId e estrutural, nunca editavel apos a criacao (mesmo padrao de
// UpdateTollTransactionDto/UpdateTripExpenseDto).
export class UpdateTripRevenueDto extends PartialType(
  OmitType(CreateTripRevenueDto, ['tripId'] as const),
) {}
