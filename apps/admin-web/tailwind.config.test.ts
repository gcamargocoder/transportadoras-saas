import { describe, expect, it } from 'vitest';
import config from './tailwind.config';

describe('tailwind.config', () => {
  it('ativa dark mode via classe (.dark), nao via media query', () => {
    expect(config.darkMode).toBe('class');
  });

  it('cores semanticas usam CSS custom properties (nao hex fixo) para suportar dark mode', () => {
    const colors = config.theme?.extend?.colors as Record<string, unknown>;

    const surface = colors.surface as { DEFAULT: string; subtle: string; muted: string };
    expect(surface.DEFAULT).toBe('rgb(var(--color-surface) / <alpha-value>)');
    expect(surface.subtle).toBe('rgb(var(--color-surface-subtle) / <alpha-value>)');
    expect(surface.muted).toBe('rgb(var(--color-surface-muted) / <alpha-value>)');

    const ink = colors.ink as { DEFAULT: string; muted: string; subtle: string };
    expect(ink.DEFAULT).toBe('rgb(var(--color-ink) / <alpha-value>)');

    const border = colors.border as { DEFAULT: string; strong: string };
    expect(border.DEFAULT).toBe('rgb(var(--color-border) / <alpha-value>)');

    const success = colors.success as Record<string, string>;
    expect(success['600']).toBe('rgb(var(--color-success-600) / <alpha-value>)');

    const danger = colors.danger as Record<string, string>;
    expect(danger['700']).toBe('rgb(var(--color-danger-700) / <alpha-value>)');

    const brand = colors.brand as Record<string, string>;
    expect(brand['900']).toBe('rgb(var(--color-brand-900) / <alpha-value>)');
  });
});
