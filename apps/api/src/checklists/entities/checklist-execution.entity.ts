import { ApiProperty } from '@nestjs/swagger';
import { ChecklistExecutionStatus } from '@prisma/client';
import { ChecklistAnswerEntity } from './checklist-answer.entity';
import { ChecklistEvidenceEntity } from './checklist-evidence.entity';

export class ChecklistExecutionEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  templateId!: string;

  @ApiProperty()
  templateVersion!: number;

  @ApiProperty({ format: 'uuid', nullable: true })
  tripId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  driverId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  vehicleId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  trailerId!: string | null;

  @ApiProperty({ enum: ChecklistExecutionStatus })
  status!: ChecklistExecutionStatus;

  @ApiProperty()
  startedAt!: Date;

  @ApiProperty({ nullable: true })
  completedAt!: Date | null;

  @ApiProperty({ nullable: true })
  latitude!: number | null;

  @ApiProperty({ nullable: true })
  longitude!: number | null;

  @ApiProperty({ nullable: true })
  address!: string | null;

  @ApiProperty({ nullable: true })
  odometerKm!: number | null;

  @ApiProperty({ nullable: true })
  inspectionLocation!: string | null;

  @ApiProperty({ nullable: true })
  responsibleName!: string | null;

  @ApiProperty({
    description:
      'Calculado a partir das respostas (item critical+required respondido NAO) -- nunca persistido, ' +
      'nunca bloqueia nada automaticamente nesta fase (ver Fase 38, secao 16).',
  })
  hasCriticalNonConformity!: boolean;

  @ApiProperty({ type: [ChecklistAnswerEntity] })
  answers!: ChecklistAnswerEntity[];

  @ApiProperty({ type: [ChecklistEvidenceEntity] })
  evidence!: ChecklistEvidenceEntity[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
