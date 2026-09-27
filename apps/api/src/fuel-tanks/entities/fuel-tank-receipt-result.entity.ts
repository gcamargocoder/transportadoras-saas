import { ApiProperty } from '@nestjs/swagger';
import { FuelTankMovementEntity } from './fuel-tank-movement.entity';
import { FuelTankEntity } from './fuel-tank.entity';

// Secao 6 da Fase 2 -- o endpoint de recebimento retorna tanto o novo saldo
// (tank, ja com currentStockLiters/occupancyPercent atualizados) quanto os
// dados da movimentacao criada, numa unica resposta.
export class FuelTankReceiptResultEntity {
  @ApiProperty({ type: FuelTankEntity })
  tank!: FuelTankEntity;

  @ApiProperty({ type: FuelTankMovementEntity })
  movement!: FuelTankMovementEntity;
}
