import type { TireStatus } from '../../types/enums';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

export const TIRE_STATUS_TONE: Record<TireStatus, Tone> = {
  NEW: 'info',
  IN_USE: 'success',
  STOCK: 'neutral',
  RETREADED: 'brand',
  SCRAPPED: 'danger',
};
