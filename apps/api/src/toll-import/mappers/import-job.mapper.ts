import { ImportJob, TagProvider } from '@prisma/client';
import { ImportJobEntity } from '../entities/import-job.entity';

export type ImportJobWithProvider = ImportJob & { provider: TagProvider };

export function toImportJobEntity(job: ImportJobWithProvider): ImportJobEntity {
  const entity = new ImportJobEntity();
  entity.id = job.id;
  entity.tenantId = job.tenantId;
  entity.providerId = job.providerId;
  entity.providerName = job.provider.name;
  entity.filename = job.filename;
  entity.originalFilename = job.originalFilename;
  entity.fileType = job.fileType;
  entity.status = job.status;
  entity.importedRecords = job.importedRecords;
  entity.ignoredRecords = job.ignoredRecords;
  entity.errorRecords = job.errorRecords;
  entity.totalRecords = job.importedRecords + job.ignoredRecords + job.errorRecords;
  entity.startedAt = job.startedAt;
  entity.finishedAt = job.finishedAt;
  entity.createdBy = job.createdBy;
  entity.createdAt = job.createdAt;
  return entity;
}
