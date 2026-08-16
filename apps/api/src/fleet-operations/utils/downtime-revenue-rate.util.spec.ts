import { computeRevenuePerHour } from './downtime-revenue-rate.util';

describe('computeRevenuePerHour', () => {
  it('fica indisponivel quando o veiculo tem menos viagens concluidas que o minimo', () => {
    const result = computeRevenuePerHour(1000, 600, 1, 2);
    expect(result).toEqual({ value: null, available: false, reason: 'INSUFFICIENT_TRIP_HISTORY' });
  });

  it('fica indisponivel quando nao ha horas de operacao registradas', () => {
    const result = computeRevenuePerHour(1000, 0, 3, 2);
    expect(result).toEqual({ value: null, available: false, reason: 'NO_OPERATING_HOURS_RECORDED' });
  });

  it('calcula receita/hora corretamente com dado suficiente', () => {
    // 600 minutos = 10 horas; 5000 / 10 = 500 R$/h.
    const result = computeRevenuePerHour(5000, 600, 3, 2);
    expect(result).toEqual({ value: 500, available: true, reason: null });
  });

  it('receita real zero (viagens concluidas sem nenhum lancamento) e uma taxa 0 legitima, nunca indisponivel', () => {
    const result = computeRevenuePerHour(0, 600, 3, 2);
    expect(result).toEqual({ value: 0, available: true, reason: null });
  });

  it('respeita o minimo de viagens exatamente no limite (nao estritamente maior)', () => {
    const result = computeRevenuePerHour(1000, 120, 2, 2);
    expect(result).toMatchObject({ available: true, value: 500 });
  });
});
