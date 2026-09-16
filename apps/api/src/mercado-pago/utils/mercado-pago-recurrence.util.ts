import { BillingPeriodicity } from '@prisma/client';

export interface MercadoPagoRecurrence {
  frequency: number;
  frequencyType: 'months';
}

// Mercado Pago (Preapproval API) so aceita frequency_type 'days' ou 'months'
// (nunca 'years') -- YEARLY vira frequency=12/months. MONTHLY vira
// frequency=1/months.
export function toMercadoPagoRecurrence(periodicity: BillingPeriodicity): MercadoPagoRecurrence {
  return periodicity === 'MONTHLY'
    ? { frequency: 1, frequencyType: 'months' }
    : { frequency: 12, frequencyType: 'months' };
}
