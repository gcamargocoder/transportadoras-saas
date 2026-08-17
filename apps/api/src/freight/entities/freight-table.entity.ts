import { ApiProperty } from '@nestjs/swagger';
import { FreightTableStatus } from '@prisma/client';

export class FreightTableEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  customerId!: string;

  @ApiProperty({ nullable: true })
  customerName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  contractId!: string | null;

  @ApiProperty({ nullable: true })
  contractCode!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty({ enum: FreightTableStatus })
  status!: FreightTableStatus;

  @ApiProperty()
  effectiveFrom!: Date;

  @ApiProperty({ nullable: true })
  effectiveUntil!: Date | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty({ description: 'Quantidade de regras (todas as versoes) cadastradas nesta tabela.' })
  rulesCount!: number;

  @ApiProperty({ description: 'Quantidade de regras ACTIVE (vigentes/selecionaveis) nesta tabela.' })
  activeRulesCount!: number;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiProperty({ nullable: true })
  creatorName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  updatedBy!: string | null;

  @ApiProperty({ nullable: true })
  updaterName!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
