import { ApiProperty } from '@nestjs/swagger';

export class DashboardOverviewEntity {
  @ApiProperty()
  totalTrips!: number;

  @ApiProperty({ description: 'Viagens IN_PROGRESS ou PAUSED.' })
  activeTrips!: number;

  @ApiProperty()
  finishedTrips!: number;

  @ApiProperty()
  cancelledTrips!: number;

  @ApiProperty()
  totalDrivers!: number;

  @ApiProperty()
  activeDrivers!: number;

  @ApiProperty()
  totalVehicles!: number;

  @ApiProperty({ description: 'Veiculos com status ACTIVE.' })
  availableVehicles!: number;

  @ApiProperty({ description: 'Veiculos com status MAINTENANCE.' })
  maintenanceVehicles!: number;

  @ApiProperty()
  fuelStations!: number;

  @ApiProperty()
  customers!: number;
}
