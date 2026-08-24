import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

// POST /finance/bank-transactions/:id/reconcile -- secao 5 do pedido:
// vinculo sempre manual e explicito, nunca automatico.
export class ReconcileBankTransactionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  financialTransactionId!: string;
}
