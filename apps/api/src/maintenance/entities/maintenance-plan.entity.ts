import { ApiProperty } from '@nestjs/swagger';
import { MaintenanceComponent, VehicleMaintenanceType } from '@prisma/client';

export class MaintenancePlanEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  vehicleId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: MaintenanceComponent })
  component!: MaintenanceComponent;

  @ApiProperty({ enum: VehicleMaintenanceType })
  maintenanceType!: VehicleMaintenanceType;

  @ApiProperty({ nullable: true })
  intervalKm!: number | null;

  @ApiProperty({ nullable: true })
  intervalDays!: number | null;

  @ApiProperty({ nullable: true })
  intervalHours!: number | null;

  @ApiProperty({ nullable: true })
  alertBeforeKm!: number | null;

  @ApiProperty({ nullable: true })
  alertBeforeDays!: number | null;

  @ApiProperty()
  active!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
