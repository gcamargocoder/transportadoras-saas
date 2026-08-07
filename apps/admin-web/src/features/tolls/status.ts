import type { TollTransactionStatus } from '../../types/enums';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

export const TOLL_STATUS_TONE: Record<TollTransactionStatus, Tone> = {
  NORMAL: 'success',
  DIVERGENT: 'danger',
  EXEMPT: 'neutral',
};
