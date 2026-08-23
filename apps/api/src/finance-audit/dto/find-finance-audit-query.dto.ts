import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { FINANCE_AUDIT_ENTITY_NAMES, FinanceAuditEntityName } from '../constants/finance-audit-entity-names.constants';

// GET /finance/audit (Fase 77, secao 6) -- ordenado sempre por createdAt
// DESC. Sem periodId: nao existe vinculo estrutural seguro entre AuditLog
// e FinancialPeriod para eventos de Receivable/Payable (ver
// docs/financial-audit.md) -- para o historico do PROPRIO periodo, use
// GET /finance/periods/:id (campo auditHistory) ou entityName=FinancialPeriod
// + entityId=<periodId> aqui.
export class FindFinanceAuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-31' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: FINANCE_AUDIT_ENTITY_NAMES, description: 'Default: todas as entidades financeiras.' })
  @IsOptional()
  @IsIn(FINANCE_AUDIT_ENTITY_NAMES)
  entityName?: FinanceAuditEntityName;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  entityId?: string;

  @ApiPropertyOptional({ example: 'receivable.payment_created' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Usuario que executou a acao.' })
  @IsOptional()
  @IsUUID('4')
  userId?: string;
}
