import { mapMercadoPagoPreapprovalStatus } from './mercado-pago-preapproval-status.util';

describe('mapMercadoPagoPreapprovalStatus', () => {
  it('authorized vira ACTIVE', () => {
    expect(mapMercadoPagoPreapprovalStatus('authorized')).toBe('ACTIVE');
  });

  it('paused vira SUSPENDED', () => {
    expect(mapMercadoPagoPreapprovalStatus('paused')).toBe('SUSPENDED');
  });

  it('cancelled vira CANCELLED', () => {
    expect(mapMercadoPagoPreapprovalStatus('cancelled')).toBe('CANCELLED');
  });

  it('pending vira PENDING', () => {
    expect(mapMercadoPagoPreapprovalStatus('pending')).toBe('PENDING');
  });

  it('status desconhecido retorna null (nunca inventa um status)', () => {
    expect(mapMercadoPagoPreapprovalStatus('algo_novo_da_api')).toBeNull();
  });
});
