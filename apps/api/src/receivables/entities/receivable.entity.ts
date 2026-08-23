import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReceivableStatus } from '@prisma/client';
import { ReceivablePaymentEntity } from './receivable-payment.entity';

// Titulo de conta a receber (Fase 72) -- ver comentario do model
// Receivable no schema. status aqui e sempre o EFETIVO (pode ser
// 'OVERDUE', que nunca existe como valor persistido -- ver
// receivable-status.util.ts).
export class ReceivableEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  customerId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  customerName!: string | null;

  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiPropertyOptional({ nullable: true })
  tripLabel!: string | null;

  @ApiProperty({ format: 'uuid' })
  billingId!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  originalAmount!: number;

  @ApiProperty()
  receivedAmount!: number;

  @ApiProperty({ description: 'originalAmount - receivedAmount, nunca negativo.' })
  balance!: number;

  @ApiProperty()
  issueDate!: Date;

  @ApiProperty()
  dueDate!: Date;

  @ApiProperty({
    enum: ['OPEN', 'PARTIALLY_RECEIVED', 'PAID', 'OVERDUE', 'CANCELLED'],
    description: 'Status EFETIVO (calculado) -- OVERDUE nunca e persistido, so calculado a partir de dueDate.',
  })
  status!: ReceivableStatus | 'OVERDUE';

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

  @ApiPropertyOptional({ type: [ReceivablePaymentEntity], description: 'Presente apenas no detalhe (GET /receivables/:id).' })
  payments?: ReceivablePaymentEntity[];
}
