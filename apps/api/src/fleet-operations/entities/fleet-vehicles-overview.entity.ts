import { ApiProperty } from '@nestjs/swagger';
import { VehicleFuelType, VehicleStatus, VehicleType } from '@prisma/client';
import { FleetVehicleRankingEntryEntity } from './fleet-vehicle-ranking-entry.entity';

// Dashboard novo (iteracao de redesign visual) -- composicao da frota.
// Distinto de FleetOverviewEntity (dashboard consolidado, so contagem por
// status): aqui entram tipo/combustivel/frota/idade/odometro, nunca
// recomputados do zero -- mesma logica/where de computeOverview reutilizada
// via countVehiclesOnTrip (ver fleet-operations-metrics.service.ts).
export class FleetVehicleTypeBreakdownEntity {
  @ApiProperty({ enum: VehicleType })
  type!: VehicleType;

  @ApiProperty()
  count!: number;
}

export class FleetVehicleStatusBreakdownEntity {
  @ApiProperty({ enum: VehicleStatus })
  status!: VehicleStatus;

  @ApiProperty()
  count!: number;
}

export class FleetVehicleFuelTypeBreakdownEntity {
  @ApiProperty({ enum: VehicleFuelType, nullable: true })
  fuelType!: VehicleFuelType | null;

  @ApiProperty()
  count!: number;
}

export class FleetVehicleFleetBreakdownEntity {
  @ApiProperty({ nullable: true, format: 'uuid' })
  fleetId!: string | null;

  @ApiProperty({ description: '"Sem frota" quando fleetId=null.' })
  fleetName!: string;

  @ApiProperty()
  count!: number;
}

// Reaproveitada para idade media E odometro medio -- evita 2 entities
// quase identicas (mesmo formato {value,available,reason} ja usado em
// FleetFuelConsumptionEntity/FleetMaintenanceCostPerKmEntity/etc).
export class FleetVehicleAverageMetricEntity {
  @ApiProperty({ nullable: true })
  value!: number | null;

  @ApiProperty()
  available!: boolean;

  @ApiProperty({ nullable: true })
  reason!: string | null;
}

export class FleetVehiclesOverviewEntity {
  @ApiProperty()
  totalVehicles!: number;

  @ApiProperty({ description: 'Veiculos com status ACTIVE.' })
  activeCount!: number;

  @ApiProperty({ description: 'Veiculos com status INACTIVE.' })
  inactiveCount!: number;

  @ApiProperty({ description: 'Veiculos com status MAINTENANCE.' })
  maintenanceCount!: number;

  @ApiProperty({ description: 'Veiculos com status SOLD.' })
  soldCount!: number;

  @ApiProperty({ description: 'Veiculos ACTIVE vinculados a uma viagem IN_PROGRESS/PAUSED agora (subconjunto de activeCount).' })
  vehiclesOnTrip!: number;

  @ApiProperty({ description: 'activeCount - vehiclesOnTrip.' })
  vehiclesAvailable!: number;

  @ApiProperty({ type: [FleetVehicleTypeBreakdownEntity] })
  byType!: FleetVehicleTypeBreakdownEntity[];

  @ApiProperty({ type: [FleetVehicleStatusBreakdownEntity] })
  byStatus!: FleetVehicleStatusBreakdownEntity[];

  @ApiProperty({ type: [FleetVehicleFuelTypeBreakdownEntity] })
  byFuelType!: FleetVehicleFuelTypeBreakdownEntity[];

  @ApiProperty({ type: [FleetVehicleFleetBreakdownEntity] })
  byFleet!: FleetVehicleFleetBreakdownEntity[];

  @ApiProperty({ type: FleetVehicleAverageMetricEntity, description: 'Media de (ano atual - manufactureYear), so entre veiculos com manufactureYear preenchido.' })
  averageAgeYears!: FleetVehicleAverageMetricEntity;

  @ApiProperty({ type: FleetVehicleAverageMetricEntity, description: 'Media de odometerKm, so entre veiculos com o campo preenchido.' })
  averageOdometerKm!: FleetVehicleAverageMetricEntity;

  @ApiProperty({ type: [FleetVehicleRankingEntryEntity], description: '"value" = manufactureYear. Mais antigos primeiro. So entre veiculos com o campo preenchido.' })
  oldestVehicles!: FleetVehicleRankingEntryEntity[];

  @ApiProperty({ type: [FleetVehicleRankingEntryEntity], description: '"value" = manufactureYear. Mais novos primeiro. So entre veiculos com o campo preenchido.' })
  newestVehicles!: FleetVehicleRankingEntryEntity[];

  @ApiProperty({ type: [FleetVehicleRankingEntryEntity], description: '"value" = odometerKm. So entre veiculos com o campo preenchido.' })
  topVehiclesByOdometer!: FleetVehicleRankingEntryEntity[];
}
