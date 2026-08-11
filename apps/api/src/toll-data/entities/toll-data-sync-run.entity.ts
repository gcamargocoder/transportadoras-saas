import { ApiProperty } from '@nestjs/swagger';
import { TollDataProvider, TollDataSyncStatus } from '@prisma/client';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';

// Historico de execucoes de sincronizacao (Fase 33, secao 12).
export class TollDataSyncRunEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  sourceId!: string;

  @ApiProperty({ enum: TollDataProvider })
  provider!: TollDataProvider;

  @ApiProperty()
  startedAt!: Date;

  @ApiProperty({ nullable: true })
  finishedAt!: Date | null;

  @ApiProperty({ enum: TollDataSyncStatus })
  status!: TollDataSyncStatus;

  @ApiProperty()
  recordsRead!: number;

  @ApiProperty()
  recordsCreated!: number;

  @ApiProperty()
  recordsUpdated!: number;

  @ApiProperty()
  recordsUnchanged!: number;

  @ApiProperty()
  recordsRejected!: number;

  @ApiProperty({ nullable: true, description: 'Sanitizado -- nunca contem token/segredo.' })
  errorMessage!: string | null;

  @ApiProperty({ nullable: true, description: '"scheduler" ou o userId do administrador que disparou manualmente.' })
  triggeredBy!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export class PaginatedTollDataSyncRunsEntity {
  @ApiProperty({ type: [TollDataSyncRunEntity] })
  items!: TollDataSyncRunEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
