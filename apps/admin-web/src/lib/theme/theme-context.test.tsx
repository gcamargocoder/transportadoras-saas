import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from './theme-context';
import { useTheme } from '../../hooks/use-theme';

function mockMatchMedia(matches: boolean) {
  const listeners: Array<(event: MediaQueryListEvent) => void> = [];
  let currentMatches = matches;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    get matches() {
      return currentMatches;
    },
    media: query,
    addEventListener: (_event: string, cb: (event: MediaQueryListEvent) => void) => {
      listeners.push(cb);
    },
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  return { fire: (next: boolean) => {
    currentMatches = next;
    listeners.forEach((cb) => cb({ matches: next } as MediaQueryListEvent));
  }};
}

function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={() => setTheme('dark')}>dark</button>
      <button onClick={() => setTheme('light')}>light</button>
      <button onClick={() => setTheme('system')}>system</button>
    </div>
  );
}

describe('ThemeProvider / useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lança erro quando useTheme é usado fora do ThemeProvider', () => {
    function Broken() {
      useTheme();
      return null;
    }
    expect(() => render(<Broken />)).toThrow('useTheme deve ser usado dentro de <ThemeProvider>.');
  });

  it('setTheme("dark") aplica a classe dark em <html> e persiste em localStorage', () => {
    mockMatchMedia(false);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    act(() => screen.getByRole('button', { name: 'dark' }).click());

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
  });

  it('setTheme("light") remove a classe dark mesmo com o sistema em modo escuro', () => {
    mockMatchMedia(true);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    act(() => screen.getByRole('button', { name: 'dark' }).click());
    act(() => screen.getByRole('button', { name: 'light' }).click());

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('setTheme("system") segue prefers-color-scheme atual', () => {
    mockMatchMedia(true);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    act(() => screen.getByRole('button', { name: 'system' }).click());

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('system');
  });

  it('reage a mudança do tema do sistema em tempo real quando theme = system', () => {
    const media = mockMatchMedia(false);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    act(() => screen.getByRole('button', { name: 'system' }).click());
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    act(() => media.fire(true));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
  });

  it('sincroniza o estado com o valor já salvo em localStorage ao montar', () => {
    localStorage.setItem('theme', 'dark');
    mockMatchMedia(false);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
  });
});
