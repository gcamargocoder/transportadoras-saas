import { buildInstallmentPlan } from './installment-plan.util';

describe('installment-plan.util', () => {
  describe('buildInstallmentPlan', () => {
    it('retorna 1 parcela com o valor integral quando installments e omitido ou 1', () => {
      const firstDueDate = new Date(Date.UTC(2026, 8, 15));
      expect(buildInstallmentPlan(1000, firstDueDate)).toEqual([{ amount: 1000, dueDate: firstDueDate }]);
      expect(buildInstallmentPlan(1000, firstDueDate, 1)).toEqual([{ amount: 1000, dueDate: firstDueDate }]);
    });

    it('divide igualmente entre N parcelas quando o valor e exatamente divisivel', () => {
      const firstDueDate = new Date(Date.UTC(2026, 8, 15));
      const plan = buildInstallmentPlan(300, firstDueDate, 3);
      expect(plan.map((p) => p.amount)).toEqual([100, 100, 100]);
      expect(plan.map((p) => p.dueDate.toISOString())).toEqual([
        new Date(Date.UTC(2026, 8, 15)).toISOString(),
        new Date(Date.UTC(2026, 9, 15)).toISOString(),
        new Date(Date.UTC(2026, 10, 15)).toISOString(),
      ]);
    });

    it('a ultima parcela absorve o resto do arredondamento -- soma sempre bate com originalAmount', () => {
      const firstDueDate = new Date(Date.UTC(2026, 8, 15));
      const plan = buildInstallmentPlan(100, firstDueDate, 3);
      expect(plan.map((p) => p.amount)).toEqual([33.33, 33.33, 33.34]);
      const sum = plan.reduce((acc, p) => acc + p.amount, 0);
      expect(Math.round(sum * 100) / 100).toBe(100);
    });

    it('clampa o dia no ultimo dia do mes de destino quando o mes de origem nao existe no destino', () => {
      const firstDueDate = new Date(Date.UTC(2026, 0, 31)); // 31/jan
      const plan = buildInstallmentPlan(200, firstDueDate, 2);
      expect(plan[1]?.dueDate.toISOString()).toBe(new Date(Date.UTC(2026, 1, 28)).toISOString()); // 28/fev (2026 nao e bissexto)
    });

    it('trata installments fracionario/zero/negativo como 1 parcela (nunca gera plano vazio ou invalido)', () => {
      const firstDueDate = new Date(Date.UTC(2026, 8, 15));
      expect(buildInstallmentPlan(500, firstDueDate, 0)).toHaveLength(1);
      expect(buildInstallmentPlan(500, firstDueDate, -3)).toHaveLength(1);
    });
  });
});
