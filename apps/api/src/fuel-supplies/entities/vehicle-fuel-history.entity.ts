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

  @ApiProperty({
    description:
      'Fase 65 -- true quando algum abastecimento mais recente (por supplyDate) tem odometerKm menor que um ' +
      'anterior (detectOdometerRegression, mesma funcao ja usada pelos alertas de frota) -- nunca um "zero" ' +
      'mascarando a ausencia de inconsistencia.',
  })
  hasOdometerRegression!: boolean;
}
