import { ApiProperty } from '@nestjs/swagger';
import { TollDataProvider, TollRateStatus } from '@prisma/client';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';

// Tarifa versionada por praca+categoria de eixos (Fase 33) -- rastreavel ate
// a fonte oficial (secao 38: "de onde veio essa tarifa?").
export class TollRateEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tollPlazaId!: string;

  @ApiProperty({ nullable: true })
  tollPlazaName!: string | null;

  @ApiProperty({ example: '9 eixos' })
  axleCategory!: string;

  @ApiProperty()
  price!: number;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  effectiveFrom!: Date;

  @ApiProperty({ nullable: true, description: 'Nulo = ainda vigente.' })
  effectiveUntil!: Date | null;

  @ApiProperty({ enum: TollRateStatus })
  status!: TollRateStatus;

  @ApiProperty({ enum: TollDataProvider, nullable: true })
  sourceProvider!: TollDataProvider | null;

  @ApiProperty({ nullable: true })
  sourceDocument!: string | null;

  @ApiProperty({ nullable: true })
  sourceReference!: string | null;

  @ApiProperty({ nullable: true })
  collectedAt!: Date | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  createdBy!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class PaginatedTollRatesEntity {
  @ApiProperty({ type: [TollRateEntity] })
  items!: TollRateEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}

// GET /toll-data/plazas/:id/effective-tariff (Fase 33, secao 17).
export class EffectiveTollTariffEntity {
  @ApiProperty({ format: 'uuid', nullable: true })
  rateId!: string | null;

  @ApiProperty({ format: 'uuid' })
  tollPlazaId!: string;

  @ApiProperty()
  axleCategory!: string;

  @ApiProperty({ nullable: true, description: 'Nulo quando nao ha tarifa oficial conhecida (nunca inventada).' })
  price!: number | null;

  @ApiProperty({ nullable: true })
  currency!: string | null;

  @ApiProperty({ nullable: true })
  effectiveFrom!: Date | null;

  @ApiProperty({ nullable: true })
  effectiveUntil!: Date | null;

  @ApiProperty({ enum: TollRateStatus, nullable: true })
  status!: TollRateStatus | null;
}
