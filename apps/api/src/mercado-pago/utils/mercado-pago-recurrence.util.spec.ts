import { toMercadoPagoRecurrence } from './mercado-pago-recurrence.util';

describe('toMercadoPagoRecurrence', () => {
  it('MONTHLY vira frequency=1/months', () => {
    expect(toMercadoPagoRecurrence('MONTHLY')).toEqual({ frequency: 1, frequencyType: 'months' });
  });

  it('YEARLY vira frequency=12/months (Mercado Pago nao aceita frequency_type "years")', () => {
    expect(toMercadoPagoRecurrence('YEARLY')).toEqual({ frequency: 12, frequencyType: 'months' });
  });
});
