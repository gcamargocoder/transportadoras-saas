import type { Paginated, PaginationParams } from '../../types/api';
import type { TollDataSourceEntity, TollDataSyncRunEntity } from '../../types/entities';
import type { TollDataProvider, TollDataSyncStatus } from '../../types/enums';
import { api } from './http';

// Fase "Alertas de sincronizacao" -- endpoints ja existentes desde a Fase
// 33 (GET /toll-data/sources e /toll-data/sync-runs), sem nenhum cliente
// de API no frontend ate esta fase (nenhuma UI os consumia). Nenhum
// endpoint novo criado aqui -- so o cliente para os 2 ja existentes.

export function listTollDataSources(signal?: AbortSignal) {
  return api.get<TollDataSourceEntity[]>('/toll-data/sources', undefined, signal);
}

export interface FindTollDataSyncRunsQuery extends PaginationParams {
  provider?: TollDataProvider | undefined;
  status?: TollDataSyncStatus | undefined;
}

export function listTollDataSyncRuns(query: FindTollDataSyncRunsQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<TollDataSyncRunEntity>>('/toll-data/sync-runs', query, signal);
}
