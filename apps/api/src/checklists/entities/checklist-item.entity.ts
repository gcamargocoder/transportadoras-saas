import { ApiProperty } from '@nestjs/swagger';
import { ChecklistItemType } from '@prisma/client';

export class ChecklistItemEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  sectionId!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({ enum: ChecklistItemType })
  type!: ChecklistItemType;

  @ApiProperty()
  required!: boolean;

  @ApiProperty()
  order!: number;

  @ApiProperty()
  requiresObservation!: boolean;

  @ApiProperty()
  requiresPhoto!: boolean;

  @ApiProperty()
  critical!: boolean;

  @ApiProperty({ nullable: true })
  options!: Record<string, unknown> | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
