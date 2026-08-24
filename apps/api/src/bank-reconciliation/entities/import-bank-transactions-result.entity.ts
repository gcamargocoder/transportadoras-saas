import { ApiProperty } from '@nestjs/swagger';

export class ImportBankTransactionRowErrorEntity {
  @ApiProperty()
  row!: number;

  @ApiProperty()
  message!: string;
}

// POST /finance/accounts/:id/bank-transactions/import -- secao 13 do
// pedido: resumo retornado diretamente na resposta (import sincrono, sem
// job/fila -- ver docs/bank-reconciliation.md).
export class ImportBankTransactionsResultEntity {
  @ApiProperty()
  rowsRead!: number;

  @ApiProperty()
  imported!: number;

  @ApiProperty()
  duplicates!: number;

  @ApiProperty()
  invalid!: number;

  @ApiProperty({ type: [ImportBankTransactionRowErrorEntity] })
  errors!: ImportBankTransactionRowErrorEntity[];
}
