import { ApiProperty } from '@nestjs/swagger';
import { ChecklistItemType } from '@prisma/client';
import { ChecklistEvidenceEntity } from './checklist-evidence.entity';

export class ChecklistAnswerEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  executionId!: string;

  @ApiProperty({ format: 'uuid' })
  itemId!: string;

  // Fase 111 -- denormalizado do ChecklistItem ja incluido na query (nenhuma
  // query nova, mesmo padrao de FuelSupplyEntity.tripLabel) -- fecha o gap
  // real de o admin-web nao ter como exibir a resposta com o rotulo/
  // criticidade do item sem buscar o template inteiro a parte.
  @ApiProperty({ description: 'ChecklistItem.code (denormalizado, sem query extra).' })
  itemCode!: string;

  @ApiProperty({ description: 'ChecklistItem.label (denormalizado, sem query extra).' })
  itemLabel!: string;

  @ApiProperty({ enum: ChecklistItemType })
  itemType!: ChecklistItemType;

  @ApiProperty()
  itemRequired!: boolean;

  @ApiProperty()
  itemCritical!: boolean;

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
