import { ApiProperty } from '@nestjs/swagger';
import { MaintenanceComponent } from '@prisma/client';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';

// Fase 81 -- uma execucao do plano preventivo. Projecao SOMENTE-LEITURA da
// VehicleMaintenance COMPLETED vinculada (maintenancePlanId), reaproveitando
// o historico ja existente -- nenhuma tabela nova. Append-only: registrar
// nova execucao nunca apaga as anteriores.
export class MaintenancePlanExecutionEntity {
  @ApiProperty({ format: 'uuid', description: 'Id da VehicleMaintenance que representa esta execucao.' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  maintenancePlanId!: string;

  @ApiProperty({ format: 'uuid' })
  vehicleId!: string;

  @ApiProperty({ enum: MaintenanceComponent, nullable: true })
  component!: MaintenanceComponent | null;

  @ApiProperty({ nullable: true, description: 'Data/hora da execucao (VehicleMaintenance.completedAt).' })
  executedAt!: Date | null;

  @ApiProperty({ nullable: true, description: 'Odometro informado na execucao (VehicleMaintenance.odometerKm). Nunca alterou Vehicle.odometerKm.' })
  odometerKm!: number | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export class PaginatedMaintenancePlanExecutionsEntity {
  @ApiProperty({ type: [MaintenancePlanExecutionEntity] })
  items!: MaintenancePlanExecutionEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
