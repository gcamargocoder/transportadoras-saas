import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateTripAdvanceDto } from './create-trip-advance.dto';

export class UpdateTripAdvanceDto extends PartialType(
  OmitType(CreateTripAdvanceDto, ['tripId'] as const),
) {}
