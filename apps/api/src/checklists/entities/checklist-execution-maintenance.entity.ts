import { ApiProperty } from '@nestjs/swagger';
import { VehicleMaintenanceStatus } from '@prisma/client';

// Fase 111 -- OS(s) abertas a partir da nao-conformidade critica encontrada
// neste checklist (VehicleMaintenance.checklistExecutionId). Denormalizado
// minimo (mesmo padrao de MaintenanceTireMovementEntity, Fase 109) -- so em
// ChecklistExecutionsService.findOne (nunca em findAll/listagem).
export class ChecklistExecutionMaintenanceEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ nullable: true })
  serviceOrderNumber!: string | null;

  @ApiProperty({ enum: VehicleMaintenanceStatus })
  status!: VehicleMaintenanceStatus;
}
