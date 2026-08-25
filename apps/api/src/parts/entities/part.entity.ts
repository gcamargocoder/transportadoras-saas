import { ApiProperty } from '@nestjs/swagger';

export class PartEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty()
  sku!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty()
  unit!: string;

  @ApiProperty({ nullable: true })
  category!: string | null;

  @ApiProperty({ nullable: true })
  manufacturer!: string | null;

  @ApiProperty({ nullable: true })
  oemCode!: string | null;

  @ApiProperty({ nullable: true })
  minStock!: number | null;

  @ApiProperty({ description: 'Cache persistido, sempre recalculado pelo service (nunca aceito do cliente).' })
  currentStock!: number;

  @ApiProperty({ description: 'Cache persistido: currentStock <= minStock (false quando minStock nao informado).' })
  isLowStock!: boolean;

  @ApiProperty({ description: 'currentStock <= 0.' })
  isZeroStock!: boolean;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
