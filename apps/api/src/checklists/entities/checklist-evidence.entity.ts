import { ApiProperty } from '@nestjs/swagger';
import { ChecklistEvidenceType } from '@prisma/client';

export class ChecklistEvidenceEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  executionId!: string;

  @ApiProperty({ format: 'uuid', nullable: true, description: 'Item do template ao qual esta evidencia se associa.' })
  itemId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  answerId!: string | null;

  @ApiProperty({ enum: ChecklistEvidenceType })
  type!: ChecklistEvidenceType;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'Referencia ao Attachment existente (mecanismo de storage ja usado no projeto).',
  })
  attachmentId!: string | null;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({ nullable: true })
  latitude!: number | null;

  @ApiProperty({ nullable: true })
  longitude!: number | null;

  @ApiProperty()
  capturedAt!: Date;

  @ApiProperty()
  createdAt!: Date;
}
