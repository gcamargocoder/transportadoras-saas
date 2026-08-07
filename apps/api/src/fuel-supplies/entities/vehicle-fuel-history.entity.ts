import { ApiProperty } from '@nestjs/swagger';
import { FuelSupplyEntity } from './fuel-supply.entity';

// GET /vehicles/:id/fuel-history
export class VehicleFuelHistoryEntity {
  @ApiProperty({ format: 'uuid' })
  vehicleId!: string;

  @ApiProperty({
    type: [FuelSupplyEntity],
    description: 'Ultimos abastecimentos, mais recente primeiro.',
  })
  items!: FuelSupplyEntity[];

  @ApiProperty()
  suppliesCount!: number;

  @ApiProperty()
  totalLiters!: number;

  @ApiProperty()
  totalAmount!: number;

  @ApiProperty({
    nullable: true,
    description:
      'Distancia total / litros abastecidos entre o 1o e o ultimo odometro (null com menos de 2 abastecimentos).',
  })
  averageConsumptionKmL!: number | null;
}
