import { ApiProperty } from '@nestjs/swagger';

// fuelConsumed/fuelCost/averageConsumptionKmL/costPerKm sao reaproveitados
// integralmente de FuelSuppliesService.getDashboard (Fase 18) -- ver
// DashboardService.getFleet. maintenance* consultam VehicleMaintenance
// diretamente (nao ha metodo de agregacao ja pronto em MaintenancesService).
export class DashboardFleetEntity {
  @ApiProperty()
  fuelConsumed!: number;

  @ApiProperty()
  fuelCost!: number;

  @ApiProperty()
  averageConsumptionKmL!: number;

  @ApiProperty()
  costPerKm!: number;

  @ApiProperty({ description: 'Soma de VehicleMaintenance.totalCost.' })
  maintenanceCost!: number;

  @ApiProperty({ description: 'Manutencoes com status OPEN, IN_PROGRESS ou WAITING_PARTS.' })
  maintenanceOpen!: number;

  @ApiProperty({ description: 'Manutencoes com status COMPLETED ou CANCELLED.' })
  maintenanceClosed!: number;
}
