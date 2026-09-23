import { describe, expect, it } from 'vitest';
import { formatPeriodLabel, isPeriodPreset, resolvePeriodRange } from './period';

// Datas construidas em horario LOCAL (mesma referencia do componente).
const now = new Date(2026, 8, 22, 15, 30); // 22/09/2026 15:30 local

function local(iso: string): Date {
  return new Date(iso);
}

describe('resolvePeriodRange', () => {
  it('hoje: do inicio ao fim do dia local', () => {
    const range = resolvePeriodRange('today', now)!;
    expect(local(range.startDate)).toEqual(new Date(2026, 8, 22, 0, 0, 0, 0));
    expect(local(range.endDate)).toEqual(new Date(2026, 8, 22, 23, 59, 59, 999));
  });

  it('7 e 30 dias incluem hoje (dias inteiros)', () => {
    expect(local(resolvePeriodRange('7d', now)!.startDate)).toEqual(new Date(2026, 8, 16));
    expect(local(resolvePeriodRange('30d', now)!.startDate)).toEqual(new Date(2026, 7, 24));
  });

  it('3 meses: do dia seguinte de 3 meses atras ate hoje', () => {
    expect(local(resolvePeriodRange('3m', now)!.startDate)).toEqual(new Date(2026, 5, 23));
  });

  it('intervalo e estavel ao longo do dia (mesma queryKey)', () => {
    expect(resolvePeriodRange('30d', new Date(2026, 8, 22, 0, 1))).toEqual(resolvePeriodRange('30d', new Date(2026, 8, 22, 23, 58)));
  });

  it('personalizado exige as duas datas e inicio <= fim', () => {
    const range = resolvePeriodRange('custom', now, { from: '2026-01-01', to: '2026-01-31' })!;
    expect(local(range.startDate)).toEqual(new Date(2026, 0, 1));
    expect(local(range.endDate)).toEqual(new Date(2026, 0, 31, 23, 59, 59, 999));
    expect(resolvePeriodRange('custom', now, { from: '2026-01-01', to: '' })).toBeNull();
    expect(resolvePeriodRange('custom', now, { from: '2026-02-01', to: '2026-01-01' })).toBeNull();
    expect(resolvePeriodRange('custom', now, { from: 'lixo', to: '2026-01-01' })).toBeNull();
  });
});

describe('isPeriodPreset / formatPeriodLabel', () => {
  it('valida presets vindos da URL', () => {
    expect(isPeriodPreset('7d')).toBe(true);
    expect(isPeriodPreset('1y')).toBe(false);
    expect(isPeriodPreset(null)).toBe(false);
  });

  it('rotulo de um dia e de intervalo', () => {
    expect(formatPeriodLabel(new Date(2026, 8, 22), new Date(2026, 8, 22, 23))).toContain('2026');
    const label = formatPeriodLabel(new Date(2026, 7, 24), new Date(2026, 8, 22));
    expect(label).toContain('–');
  });
});
