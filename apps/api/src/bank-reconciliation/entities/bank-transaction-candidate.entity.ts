import { ApiProperty } from '@nestjs/swagger';
import { FinancialTransactionEntity } from '../../finance-accounts/entities/financial-transaction.entity';

// GET /finance/bank-transactions/:id/candidates -- secao 4 do pedido:
// SOMENTE apresenta candidatos, nunca vincula (leitura pura).
export class BankTransactionCandidateEntity {
  @ApiProperty({ type: FinancialTransactionEntity })
  financialTransaction!: FinancialTransactionEntity;

  @ApiProperty({ description: 'true quando a data bate exatamente (resultaria em MATCHED); false = DIVERGENT por data.' })
  exactMatch!: boolean;

  @ApiProperty()
  dateDifferenceDays!: number;
}
