import { ApiProperty } from '@nestjs/swagger';

export class FleetOverviewEntity {
  @ApiProperty()
  totalVehicles!: number;

  @ApiProperty({ description: 'Veiculos com status ACTIVE.' })
  activeVehicles!: number;

  @ApiProperty({ description: 'Veiculos com status INACTIVE.' })
  inactiveVehicles!: number;

  @ApiProperty({ description: 'Veiculos com status SUSPENDED (Fase 62).' })
  suspendedVehicles!: number;

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

  // Fase 68 -- TripOccurrence (Fase 67). status sempre derivado de
  // resolvedAt/cancelledAt, nunca uma coluna propria -- ver
  // GET /fleet-operations/occurrences para o dashboard completo.
  @ApiProperty({ description: 'Ocorrencias com status OPEN.' })
  openOccurrences!: number;

  @ApiProperty({ description: 'Ocorrencias com status OPEN e severity CRITICAL.' })
  criticalOpenOccurrences!: number;

  @ApiProperty({ description: 'Ocorrencias com status RESOLVED.' })
  resolvedOccurrences!: number;

  @ApiProperty({ description: 'Ocorrencias com status CANCELLED.' })
  cancelledOccurrences!: number;
}
