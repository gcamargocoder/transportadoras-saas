import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateFuelSupplyDto } from './create-fuel-supply.dto';

// tripId e estrutural, nunca editavel apos a criacao (mesmo padrao ja usado
// em TripExpense/TripRevenue/TripAdvance). Quando o abastecimento original
// tem tripId, vehicleId/driverId enviados aqui sao ignorados pelo service
// (permanecem os derivados da viagem) -- ver FuelSuppliesService.update.
export class UpdateFuelSupplyDto extends PartialType(
  OmitType(CreateFuelSupplyDto, ['tripId'] as const),
) {}
