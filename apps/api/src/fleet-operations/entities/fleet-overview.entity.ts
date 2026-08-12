import { ApiProperty } from '@nestjs/swagger';

export class FleetOverviewEntity {
  @ApiProperty()
  totalVehicles!: number;

  @ApiProperty({ description: 'Veiculos com status ACTIVE.' })
  activeVehicles!: number;

  @ApiProperty({ description: 'Veiculos com status INACTIVE.' })
  inactiveVehicles!: number;

  @ApiProperty({ description: 'Veiculos com status MAINTENANCE.' })
  maintenanceVehicles!: number;

  @ApiProperty({ description: 'Veiculos com status SOLD.' })
  soldVehicles!: number;

  @ApiProperty({ description: 'Viagens IN_PROGRESS ou PAUSED.' })
  activeTrips!: number;

  @ApiProperty({
    description:
      'Fase 41 -- veiculos com status ACTIVE atualmente vinculados a uma viagem IN_PROGRESS/PAUSED (subconjunto de activeVehicles).',
  })
  vehiclesOnTrip!: number;

  @ApiProperty({
    description: 'Fase 41 -- veiculos com status ACTIVE SEM viagem ativa no momento (activeVehicles - vehiclesOnTrip).',
  })
  vehiclesAvailable!: number;

  @ApiProperty({ description: 'Motoristas ativos (isActive=true, nao excluidos).' })
  activeDrivers!: number;

  @ApiProperty({ description: 'Alertas (Alert) nao reconhecidos (acknowledgedAt nulo).' })
  openAlerts!: number;
}
