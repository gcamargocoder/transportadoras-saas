import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FinancialPeriodStatus } from '@prisma/client';
import { AuditLogEntity } from '../../audit/entities/audit-log.entity';
import { FinancialPeriodSummaryEntity } from './financial-period-summary.entity';

// Periodo financeiro mensal (Fase 76) -- ver comentario do model
// FinancialPeriod no schema. CAMADA DE CONTROLE sobre Receivable/Payable,
// nunca um ledger novo.
export class FinancialPeriodEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 2026 })
  year!: number;

  @ApiProperty({ example: 8, minimum: 1, maximum: 12 })
  month!: number;

  @ApiProperty({ enum: FinancialPeriodStatus })
  status!: FinancialPeriodStatus;

  @ApiProperty()
  openedAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  closedAt!: Date | null;

  @ApiProperty({ format: 'uuid' })
  openedBy!: string;

  @ApiPropertyOptional({ nullable: true })
  openerName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  closedBy!: string | null;

  @ApiPropertyOptional({ nullable: true })
  closerName!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional({ type: FinancialPeriodSummaryEntity, description: 'Presente apenas no detalhe (GET /finance/periods/:id).' })
  summary?: FinancialPeriodSummaryEntity;

  @ApiPropertyOptional({
    type: [AuditLogEntity],
    description:
      'Presente apenas no detalhe (GET /finance/periods/:id). Historico de auditoria do PROPRIO periodo ' +
      '(financial_period.created/closed) -- unico vinculo estruturalmente seguro com AuditLog (Fase 77). ' +
      'Nao inclui eventos de Receivable/Payable (ver docs/financial-audit.md).',
  })
  auditHistory?: AuditLogEntity[];
}
