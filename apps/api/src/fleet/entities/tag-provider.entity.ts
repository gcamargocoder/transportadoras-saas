import { ApiProperty } from '@nestjs/swagger';

// Dado de referencia GLOBAL (nao pertence a nenhum tenant) -- ver
// packages/database/prisma/seed.ts para a lista seedada (Sem Parar,
// ConectCar, Veloe, Move Mais).
export class TagProviderEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ nullable: true })
  website!: string | null;

  @ApiProperty({ nullable: true })
  phone!: string | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
