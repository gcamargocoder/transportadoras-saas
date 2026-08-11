import { ApiProperty } from '@nestjs/swagger';
import { TollDataProvider } from '@prisma/client';

// Dado de referencia GLOBAL (Fase 33) -- 1 linha por provider.
export class TollDataSourceEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: TollDataProvider })
  provider!: TollDataProvider;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  authority!: string;

  @ApiProperty()
  baseUrl!: string;

  @ApiProperty()
  enabled!: boolean;

  @ApiProperty({ nullable: true })
  lastSyncAt!: Date | null;

  @ApiProperty({ nullable: true })
  lastSuccessAt!: Date | null;

  @ApiProperty({ nullable: true })
  lastFailureAt!: Date | null;

  @ApiProperty({ nullable: true })
  lastError!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
