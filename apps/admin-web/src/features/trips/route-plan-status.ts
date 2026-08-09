import type { RouteTollEstimateSource, TollMatchStatus } from '../../types/enums';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

export const ROUTE_TOLL_ESTIMATE_SOURCE_TONE: Record<RouteTollEstimateSource, Tone> = {
  MATCHED_PLAZAS: 'success',
  PROVIDER_AGGREGATE: 'warning',
  NONE: 'neutral',
};

export const TOLL_MATCH_STATUS_TONE: Record<TollMatchStatus, Tone> = {
  MATCHED: 'success',
  UNMATCHED: 'neutral',
};
