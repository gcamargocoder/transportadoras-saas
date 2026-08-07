import { ImportJobError } from '@prisma/client';
import { ImportJobErrorEntity } from '../entities/import-job-error.entity';

export function toImportJobErrorEntity(row: ImportJobError): ImportJobErrorEntity {
  const entity = new ImportJobErrorEntity();
  entity.id = row.id;
  entity.importJobId = row.importJobId;
  entity.rowNumber = row.rowNumber;
  entity.issueType = row.issueType;
  entity.message = row.message;
  entity.rawData = row.rawData as Record<string, unknown>;
  entity.createdAt = row.createdAt;
  return entity;
}
