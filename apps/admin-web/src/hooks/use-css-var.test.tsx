import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '../lib/theme/theme-context';
import { useCssVar } from './use-css-var';

function Probe({ name, fallback }: { name: string; fallback: string }) {
  const value = useCssVar(name, fallback);
  return <span data-testid="value">{value}</span>;
}

describe('useCssVar', () => {
  it('usa o fallback quando a CSS var não está definida no documento', () => {
    const { getByTestId } = render(
      <ThemeProvider>
        <Probe name="--color-nao-existe" fallback="rgb(226 232 240)" />
      </ThemeProvider>,
    );
    expect(getByTestId('value').textContent).toBe('rgb(226 232 240)');
  });

  it('lê o valor real quando a CSS var está definida no documento', () => {
    document.documentElement.style.setProperty('--color-teste', '79 70 229');
    const { getByTestId } = render(
      <ThemeProvider>
        <Probe name="--color-teste" fallback="rgb(0 0 0)" />
      </ThemeProvider>,
    );
    expect(getByTestId('value').textContent).toBe('rgb(79 70 229)');
    document.documentElement.style.removeProperty('--color-teste');
  });
});
