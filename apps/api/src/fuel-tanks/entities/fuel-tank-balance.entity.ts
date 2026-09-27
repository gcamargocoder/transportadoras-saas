import { ApiProperty } from '@nestjs/swagger';
import { FuelTankStatus } from '@prisma/client';

// Leitura rapida e minima do saldo (secao 8 da Fase 1: "consultar saldo"
// como acao propria, distinta do detalhe completo do tanque).
export class FuelTankBalanceEntity {
  @ApiProperty({ format: 'uuid' })
  tankId!: string;

  @ApiProperty()
  currentStockLiters!: number;

  @ApiProperty()
  capacityLiters!: number;

  @ApiProperty()
  occupancyPercent!: number;

  @ApiProperty({ nullable: true })
  minStockLiters!: number | null;

  @ApiProperty()
  isLowStock!: boolean;

  @ApiProperty({ enum: FuelTankStatus })
  status!: FuelTankStatus;
}
