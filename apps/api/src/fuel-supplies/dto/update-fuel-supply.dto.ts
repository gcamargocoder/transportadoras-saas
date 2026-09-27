import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateFuelSupplyDto } from './create-fuel-supply.dto';

// tripId e estrutural, nunca editavel apos a criacao (mesmo padrao ja usado
// em TripExpense/TripRevenue/TripAdvance). Quando o abastecimento original
// tem tripId, vehicleId/driverId enviados aqui sao ignorados pelo service
// (permanecem os derivados da viagem) -- ver FuelSuppliesService.update.
//
// Fase 7 -- fuelTankId tambem e estrutural e imutavel: o tanque ja foi
// debitado na criacao (FuelTankMovement.INTERNAL_FUELING); trocar o tanque
// de um abastecimento existente deixaria o ledger inconsistente. Para
// corrigir, cancele (gera o estorno compensatorio) e registre de novo.
export class UpdateFuelSupplyDto extends PartialType(
  OmitType(CreateFuelSupplyDto, ['tripId', 'fuelTankId'] as const),
) {}
