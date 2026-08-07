import { aggregateMonthlySeries, buildMonthlyRange } from './monthly-series.util';

describe('monthly-series.util', () => {
  const reference = new Date(Date.UTC(2026, 8, 15)); // 15/set/2026

  describe('buildMonthlyRange', () => {
    it('retorna os ultimos N meses, do mais antigo para o mais recente, terminando no mes de referencia', () => {
      const months = buildMonthlyRange(3, reference);
      expect(months).toHaveLength(3);
      expect(months.map((m) => m.label)).toEqual(['Jul', 'Ago', 'Set']);
      expect(months[0]?.value).toBe(0);
    });
  });

  describe('aggregateMonthlySeries', () => {
    it('retorna 12 meses com value 0 quando nao ha nenhuma linha', () => {
      const series = aggregateMonthlySeries([], 12, reference);
      expect(series).toHaveLength(12);
      expect(series.every((point) => point.value === 0)).toBe(true);
      expect(series[series.length - 1]).toEqual({ month: 'Set', value: 0 });
    });

    it('soma os valores das linhas no mes correto', () => {
      const series = aggregateMonthlySeries(
        [
          { date: new Date(Date.UTC(2026, 6, 10)), value: 100 }, // Jul
          { date: new Date(Date.UTC(2026, 6, 20)), value: 50 }, // Jul
          { date: new Date(Date.UTC(2026, 8, 1)), value: 200 }, // Set
        ],
        3,
        reference,
      );

      expect(series).toEqual([
        { month: 'Jul', value: 150 },
        { month: 'Ago', value: 0 },
        { month: 'Set', value: 200 },
      ]);
    });

    it('conta ocorrencias quando cada linha usa value = 1 (ex: quantidade de viagens)', () => {
      const series = aggregateMonthlySeries(
        [
          { date: new Date(Date.UTC(2026, 8, 1)), value: 1 },
          { date: new Date(Date.UTC(2026, 8, 5)), value: 1 },
          { date: new Date(Date.UTC(2026, 8, 10)), value: 1 },
        ],
        1,
        reference,
      );
      expect(series).toEqual([{ month: 'Set', value: 3 }]);
    });

    it('ignora linhas fora da janela de meses', () => {
      const series = aggregateMonthlySeries(
        [{ date: new Date(Date.UTC(2025, 0, 1)), value: 999 }],
        3,
        reference,
      );
      expect(series.reduce((sum, p) => sum + p.value, 0)).toBe(0);
    });

    it('arredonda o valor final para 2 casas decimais', () => {
      const series = aggregateMonthlySeries(
        [
          { date: new Date(Date.UTC(2026, 8, 1)), value: 10.005 },
          { date: new Date(Date.UTC(2026, 8, 2)), value: 0.001 },
        ],
        1,
        reference,
      );
      expect(series[0]?.value).toBeCloseTo(10.01, 2);
    });
  });
});
