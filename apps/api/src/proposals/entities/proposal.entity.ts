import { ApiProperty } from '@nestjs/swagger';
import { ProposalStatus } from '@prisma/client';

export class ProposalEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ description: 'Sequencial por tenant.' })
  number!: number;

  @ApiProperty({ format: 'uuid' })
  customerId!: string;

  @ApiProperty({ nullable: true })
  customerName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  quotationId!: string | null;

  @ApiProperty({ nullable: true, description: 'Numero da cotacao de origem, quando aplicavel.' })
  quotationOriginLocationName!: string | null;

  @ApiProperty({ nullable: true })
  quotationDestinationLocationName!: string | null;

  @ApiProperty({ enum: ProposalStatus })
  status!: ProposalStatus;

  @ApiProperty({ description: 'Valor total da proposta (snapshot).' })
  totalAmount!: number;

  @ApiProperty({ nullable: true })
  commercialConditions!: string | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty()
  issuedAt!: Date;

  @ApiProperty()
  validUntil!: Date;

  @ApiProperty({ description: 'Derivado de validUntil < agora -- nunca uma transicao de status propria.' })
  expired!: boolean;

  @ApiProperty({ nullable: true })
  decidedAt!: Date | null;

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
