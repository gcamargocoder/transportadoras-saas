import { computeFirstDueDate, computeNextDueDate, daysOverdue } from './billing-date.util';

describe('billing-date.util', () => {
  describe('computeNextDueDate', () => {
    it('periodicidade MONTHLY avanca exatamente 1 mes, mesmo dia', () => {
      const next = computeNextDueDate(new Date('2026-03-10T00:00:00.000Z'), 'MONTHLY', 10);
      expect(next.toISOString()).toBe('2026-04-10T00:00:00.000Z');
    });

    it('periodicidade YEARLY avanca exatamente 1 ano, mesmo dia/mes', () => {
      const next = computeNextDueDate(new Date('2026-03-10T00:00:00.000Z'), 'YEARLY', 10);
      expect(next.toISOString()).toBe('2027-03-10T00:00:00.000Z');
    });

    it('clampa dueDay=31 para o ultimo dia de um mes de 30 dias (abril)', () => {
      const next = computeNextDueDate(new Date('2026-03-31T00:00:00.000Z'), 'MONTHLY', 31);
      expect(next.toISOString()).toBe('2026-04-30T00:00:00.000Z');
    });

    it('clampa dueDay=31 para fevereiro (ano nao bissexto -> 28)', () => {
      const next = computeNextDueDate(new Date('2027-01-31T00:00:00.000Z'), 'MONTHLY', 31);
      expect(next.toISOString()).toBe('2027-02-28T00:00:00.000Z');
    });

    it('clampa dueDay=29 para fevereiro em ano bissexto (2028 -> 29)', () => {
      const next = computeNextDueDate(new Date('2028-01-29T00:00:00.000Z'), 'MONTHLY', 29);
      expect(next.toISOString()).toBe('2028-02-29T00:00:00.000Z');
    });

    it('MONTHLY em dezembro vira janeiro do ano seguinte (virada de ano)', () => {
      const next = computeNextDueDate(new Date('2026-12-15T00:00:00.000Z'), 'MONTHLY', 15);
      expect(next.toISOString()).toBe('2027-01-15T00:00:00.000Z');
    });

    it('e deterministico independente do horario/timezone de entrada (sempre UTC 00:00)', () => {
      const next = computeNextDueDate(new Date('2026-03-10T23:59:59.999Z'), 'MONTHLY', 10);
      expect(next.toISOString()).toBe('2026-04-10T00:00:00.000Z');
    });
  });

  describe('computeFirstDueDate', () => {
    it('usa o dueDay dentro do mes de inicio quando ainda nao passou', () => {
      const first = computeFirstDueDate(new Date('2026-06-01T00:00:00.000Z'), 15);
      expect(first.toISOString()).toBe('2026-06-15T00:00:00.000Z');
    });

    it('rola para o mes seguinte quando o dueDay ja passou dentro do mes de inicio', () => {
      const first = computeFirstDueDate(new Date('2026-06-20T00:00:00.000Z'), 5);
      expect(first.toISOString()).toBe('2026-07-05T00:00:00.000Z');
    });

    it('usa o proprio dia de inicio quando coincide com o dueDay', () => {
      const first = computeFirstDueDate(new Date('2026-06-10T00:00:00.000Z'), 10);
      expect(first.toISOString()).toBe('2026-06-10T00:00:00.000Z');
    });
  });

  describe('daysOverdue', () => {
    it('retorna 0 quando o vencimento ainda nao chegou', () => {
      const now = new Date('2026-06-01T00:00:00.000Z');
      const dueDate = new Date('2026-06-05T00:00:00.000Z');
      expect(daysOverdue(dueDate, now)).toBe(0);
    });

    it('retorna 0 exatamente no dia do vencimento', () => {
      const now = new Date('2026-06-05T00:00:00.000Z');
      expect(daysOverdue(now, now)).toBe(0);
    });

    it('calcula dias corridos de atraso corretamente', () => {
      const dueDate = new Date('2026-06-01T00:00:00.000Z');
      const now = new Date('2026-06-06T00:00:00.000Z');
      expect(daysOverdue(dueDate, now)).toBe(5);
    });
  });
});
