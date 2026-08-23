import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  RECONCILIATION_ENTITY_TYPES,
  RECONCILIATION_ISSUE_TYPES,
  RECONCILIATION_SEVERITIES,
  ReconciliationEntityType,
  ReconciliationIssueType,
  ReconciliationSeverity,
} from '../utils/reconciliation-issue-type.util';

// GET /finance/reconciliation (secao 5 do pedido). type/severity/
// entityType filtram a lista de PROBLEMAS (calculada em memoria, nunca
// colunas de uma tabela); tripId/customerId/from/to sao aplicados no
// banco, em cada consulta de origem, sempre que fizer sentido para aquele
// detector (Receivable/TripBilling tem customerId; Payable/TripExpense
// nao -- ver docs/finance-reconciliation.md).
export class FindFinanceReconciliationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: RECONCILIATION_ISSUE_TYPES })
  @IsOptional()
  @IsIn(RECONCILIATION_ISSUE_TYPES)
  type?: ReconciliationIssueType;

  @ApiPropertyOptional({ enum: RECONCILIATION_SEVERITIES })
  @IsOptional()
  @IsIn(RECONCILIATION_SEVERITIES)
  severity?: ReconciliationSeverity;

  @ApiPropertyOptional({ enum: RECONCILIATION_ENTITY_TYPES })
  @IsOptional()
  @IsIn(RECONCILIATION_ENTITY_TYPES)
  entityType?: ReconciliationEntityType;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  tripId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Aplicado somente aos detectores de Receivable/TripBilling (Payable/TripExpense nao tem cliente).' })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;
}
