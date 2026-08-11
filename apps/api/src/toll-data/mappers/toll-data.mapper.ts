import { TollDataSource, TollDataSyncRun, TollRate } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { TollDataSourceEntity } from '../entities/toll-data-source.entity';
import { TollDataSyncRunEntity } from '../entities/toll-data-sync-run.entity';
import { TollRateEntity } from '../entities/toll-rate.entity';

export function toTollDataSourceEntity(source: TollDataSource): TollDataSourceEntity {
  const entity = new TollDataSourceEntity();
  entity.id = source.id;
  entity.provider = source.provider;
  entity.name = source.name;
  entity.authority = source.authority;
  entity.baseUrl = source.baseUrl;
  entity.enabled = source.enabled;
  entity.lastSyncAt = source.lastSyncAt;
  entity.lastSuccessAt = source.lastSuccessAt;
  entity.lastFailureAt = source.lastFailureAt;
  entity.lastError = source.lastError;
  entity.createdAt = source.createdAt;
  entity.updatedAt = source.updatedAt;
  return entity;
}

export function toTollDataSyncRunEntity(run: TollDataSyncRun): TollDataSyncRunEntity {
  const entity = new TollDataSyncRunEntity();
  entity.id = run.id;
  entity.sourceId = run.sourceId;
  entity.provider = run.provider;
  entity.startedAt = run.startedAt;
  entity.finishedAt = run.finishedAt;
  entity.status = run.status;
  entity.recordsRead = run.recordsRead;
  entity.recordsCreated = run.recordsCreated;
  entity.recordsUpdated = run.recordsUpdated;
  entity.recordsUnchanged = run.recordsUnchanged;
  entity.recordsRejected = run.recordsRejected;
  entity.errorMessage = run.errorMessage;
  entity.triggeredBy = run.triggeredBy;
  entity.createdAt = run.createdAt;
  return entity;
}

export type TollRateWithPlazaName = TollRate & { tollPlaza?: { name: string } | null; source?: { provider: string } | null };

export function toTollRateEntity(rate: TollRateWithPlazaName): TollRateEntity {
  const entity = new TollRateEntity();
  entity.id = rate.id;
  entity.tollPlazaId = rate.tollPlazaId;
  entity.tollPlazaName = rate.tollPlaza?.name ?? null;
  entity.axleCategory = rate.axleCategory;
  entity.price = toNumberOrNull(rate.price) ?? 0;
  entity.currency = rate.currency;
  entity.effectiveFrom = rate.effectiveFrom;
  entity.effectiveUntil = rate.effectiveUntil;
  entity.status = rate.status;
  entity.sourceProvider = (rate.source?.provider as TollRateEntity['sourceProvider']) ?? null;
  entity.sourceDocument = rate.sourceDocument;
  entity.sourceReference = rate.sourceReference;
  entity.collectedAt = rate.collectedAt;
  entity.createdBy = rate.createdBy;
  entity.createdAt = rate.createdAt;
  entity.updatedAt = rate.updatedAt;
  return entity;
}
