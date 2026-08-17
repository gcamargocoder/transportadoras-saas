import { ApiProperty } from '@nestjs/swagger';

// Resultado da simulacao (secao 6) -- nunca persistido. available=false
// significa explicitamente "nao existe tabela/regra aplicavel", nunca um
// preco zero mascarando a ausencia (secao 21).
export class FreightQuoteEntity {
  @ApiProperty()
  available!: boolean;

  @ApiProperty({ nullable: true })
  reason!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  freightTableId!: string | null;

  @ApiProperty({ nullable: true })
  freightTableName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  ruleId!: string | null;

  @ApiProperty({ nullable: true })
  ruleVersion!: number | null;

  @ApiProperty({ nullable: true })
  baseAmount!: number | null;

  @ApiProperty({ nullable: true })
  additionsAmount!: number | null;

  @ApiProperty({ nullable: true })
  tollAmount!: number | null;

  @ApiProperty({ nullable: true })
  feesAmount!: number | null;

  @ApiProperty({ nullable: true })
  totalAmount!: number | null;
}
