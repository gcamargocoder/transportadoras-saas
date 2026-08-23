import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseCategory, PayableStatus } from '@prisma/client';
import { PayablePaymentEntity } from './payable-payment.entity';

// Titulo de conta a pagar (Fase 73) -- ver comentario do model Payable no
// schema. status aqui e sempre o EFETIVO (pode ser 'OVERDUE', que nunca
// existe como valor persistido -- ver payable-status.util.ts).
export class PayableEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiPropertyOptional({ nullable: true })
  tripLabel!: string | null;

  @ApiProperty({ format: 'uuid' })
  expenseId!: string;

  @ApiProperty({ nullable: true, description: 'Snapshot de TripExpense.supplier (texto livre -- projeto nao possui model Supplier).' })
  supplierName!: string | null;

  @ApiProperty({ enum: ExpenseCategory })
  category!: ExpenseCategory;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  originalAmount!: number;

  @ApiProperty()
  paidAmount!: number;

  @ApiProperty({ description: 'originalAmount - paidAmount, nunca negativo.' })
  balance!: number;

  @ApiProperty()
  issueDate!: Date;

  @ApiProperty()
  dueDate!: Date;

  @ApiProperty({
    enum: ['OPEN', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'],
    description: 'Status EFETIVO (calculado) -- OVERDUE nunca e persistido, so calculado a partir de dueDate.',
  })
  status!: PayableStatus | 'OVERDUE';

  @ApiPropertyOptional({ nullable: true })
  cancelledAt!: Date | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  cancelledBy!: string | null;

  @ApiPropertyOptional({ nullable: true })
  cancellerName!: string | null;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiPropertyOptional({ nullable: true })
  creatorName!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional({ type: [PayablePaymentEntity], description: 'Presente apenas no detalhe (GET /payables/:id).' })
  payments?: PayablePaymentEntity[];
}
