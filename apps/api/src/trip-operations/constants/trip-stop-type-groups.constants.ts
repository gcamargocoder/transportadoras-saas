import { TripStopType } from '@prisma/client';

// Fase 43 -- agrupamento de APRESENTACAO do catalogo de TripStopType
// (secao 12 do pedido). Nao e uma coluna no banco -- e só usado para
// montar o breakdown "por categoria" da analytics e para as telas
// (admin-web/driver-app espelham este mesmo agrupamento em seus proprios
// arquivos de labels, mesmo padrao ja usado para TRIP_STOP_TYPE_LABELS).
export type TripStopCategory = 'OPERATIONAL' | 'VEHICLE' | 'TRAFFIC' | 'DRIVER' | 'ADMINISTRATIVE' | 'OTHER';

export const TRIP_STOP_TYPE_CATEGORY: Record<TripStopType, TripStopCategory> = {
  LOADING: 'OPERATIONAL',
  UNLOADING: 'OPERATIONAL',
  WAITING_LOADING: 'OPERATIONAL',
  WAITING_UNLOADING: 'OPERATIONAL',
  YARD: 'OPERATIONAL',
  CUSTOMER: 'OPERATIONAL',
  GARAGE: 'OPERATIONAL',
  FUEL: 'VEHICLE',
  MAINTENANCE: 'VEHICLE',
  BREAKDOWN: 'VEHICLE',
  TIRE: 'VEHICLE',
  CONGESTION: 'TRAFFIC',
  ACCIDENT: 'TRAFFIC',
  ROAD_CLOSURE: 'TRAFFIC',
  INSPECTION: 'TRAFFIC',
  REST: 'DRIVER',
  MEAL: 'DRIVER',
  PERSONAL_NEED: 'DRIVER',
  DOCUMENTATION: 'ADMINISTRATIVE',
  WAITING_AUTHORIZATION: 'ADMINISTRATIVE',
  OTHER: 'OTHER',
  UNKNOWN: 'OTHER',
};
