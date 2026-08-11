import { ApiProperty } from '@nestjs/swagger';
import { ChecklistItemEntity } from './checklist-item.entity';

export class ChecklistSectionEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  templateId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty()
  order!: number;

  @ApiProperty({ type: [ChecklistItemEntity] })
  items!: ChecklistItemEntity[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
