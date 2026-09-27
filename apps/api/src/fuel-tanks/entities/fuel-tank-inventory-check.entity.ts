import { ApiProperty } from '@nestjs/swagger';

export class FuelTankInventoryCheckEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tankId!: string;

  @ApiProperty()
  checkedAt!: Date;

  @ApiProperty({ description: 'Estoque teorico no momento da conferencia (sempre lido do tanque, nunca do cliente).' })
  theoreticalStockLiters!: number;

  @ApiProperty()
  measuredStockLiters!: number;

  @ApiProperty({ description: 'measuredStockLiters - theoreticalStockLiters, congelado no momento da conferencia.' })
  divergenceLiters!: number;

  @ApiProperty({ nullable: true, description: 'divergenceLiters / theoreticalStockLiters * 100. Nulo quando theoreticalStockLiters = 0.' })
  divergencePercent!: number | null;

  @ApiProperty({ description: 'true quando um ADJUSTMENT foi criado para corrigir a divergencia.' })
  adjusted!: boolean;

  @ApiProperty({ format: 'uuid', nullable: true })
  adjustmentMovementId!: string | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiProperty()
  createdAt!: Date;
}
