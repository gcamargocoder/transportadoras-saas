import { ApiProperty } from '@nestjs/swagger';
import { FuelTankInventoryCheckEntity } from './fuel-tank-inventory-check.entity';
import { FuelTankEntity } from './fuel-tank.entity';

// Secao 9 da Fase 4 -- retorna tanque (com o novo saldo, se ajustado),
// conferencia registrada e, quando aplicavel, o ADJUSTMENT criado.
export class FuelTankInventoryCheckResultEntity {
  @ApiProperty({ type: FuelTankEntity })
  tank!: FuelTankEntity;

  @ApiProperty({ type: FuelTankInventoryCheckEntity })
  check!: FuelTankInventoryCheckEntity;
}
