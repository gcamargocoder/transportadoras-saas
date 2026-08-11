import { ApiProperty } from '@nestjs/swagger';
import { ChecklistEvidenceEntity } from './checklist-evidence.entity';

export class ChecklistAnswerEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  executionId!: string;

  @ApiProperty({ format: 'uuid' })
  itemId!: string;

  @ApiProperty({ nullable: true })
  booleanValue!: boolean | null;

  @ApiProperty({ nullable: true })
  textValue!: string | null;

  @ApiProperty({ nullable: true })
  numberValue!: number | null;

  @ApiProperty({ nullable: true })
  selectedValue!: string | null;

  @ApiProperty({ type: [ChecklistEvidenceEntity] })
  evidence!: ChecklistEvidenceEntity[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
