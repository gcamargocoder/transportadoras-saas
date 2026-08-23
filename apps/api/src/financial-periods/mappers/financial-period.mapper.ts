import { FinancialPeriod, UserAccount } from '@prisma/client';
import { AuditLogEntity } from '../../audit/entities/audit-log.entity';
import { FinancialPeriodSummaryEntity } from '../entities/financial-period-summary.entity';
import { FinancialPeriodEntity } from '../entities/financial-period.entity';

export type FinancialPeriodWithRelations = FinancialPeriod & {
  opener: UserAccount | null;
  closer: UserAccount | null;
};

export function toFinancialPeriodEntity(
  row: FinancialPeriodWithRelations,
  summary?: FinancialPeriodSummaryEntity,
  auditHistory?: AuditLogEntity[],
): FinancialPeriodEntity {
  const entity = new FinancialPeriodEntity();
  entity.id = row.id;
  entity.year = row.year;
  entity.month = row.month;
  entity.status = row.status;
  entity.openedAt = row.openedAt;
  entity.closedAt = row.closedAt;
  entity.openedBy = row.openedBy;
  entity.openerName = row.opener?.name ?? null;
  entity.closedBy = row.closedBy;
  entity.closerName = row.closer?.name ?? null;
  entity.createdAt = row.createdAt;
  entity.updatedAt = row.updatedAt;
  if (summary) entity.summary = summary;
  if (auditHistory) entity.auditHistory = auditHistory;
  return entity;
}
