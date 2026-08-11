import { ApiProperty } from '@nestjs/swagger';
import { ChecklistTemplateStatus, ChecklistType, TrailerType, VehicleType } from '@prisma/client';
import { ChecklistSectionEntity } from './checklist-section.entity';

export class ChecklistTemplateEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({ enum: ChecklistType })
  type!: ChecklistType;

  @ApiProperty({ enum: VehicleType, nullable: true })
  vehicleType!: VehicleType | null;

  @ApiProperty({ enum: TrailerType, nullable: true })
  trailerType!: TrailerType | null;

  @ApiProperty()
  version!: number;

  @ApiProperty({ enum: ChecklistTemplateStatus })
  status!: ChecklistTemplateStatus;

  @ApiProperty({ format: 'uuid', nullable: true })
  previousVersionId!: string | null;

  @ApiProperty({ nullable: true })
  publishedAt!: Date | null;

  @ApiProperty({ nullable: true })
  archivedAt!: Date | null;

  @ApiProperty({ type: [ChecklistSectionEntity] })
  sections!: ChecklistSectionEntity[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
