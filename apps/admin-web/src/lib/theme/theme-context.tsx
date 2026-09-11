'use client';

import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'theme';

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

function resolveSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyResolvedTheme(resolved: ResolvedTheme): void {
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

// Mesmo padrao de AuthProvider (src/lib/auth/auth-context.tsx): contexto +
// provider aqui, hook de consumo em src/hooks/use-theme.ts.
export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');

  // So SINCRONIZA o estado React com o que o script anti-flash (ver
  // src/app/layout.tsx) ja aplicou em <html> antes do primeiro paint --
  // nunca reaplica a classe aqui, para nao causar um segundo flash.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const initialTheme = isTheme(stored) ? stored : 'system';
    const initialResolved = initialTheme === 'system' ? resolveSystemTheme() : initialTheme;
    setThemeState(initialTheme);
    setResolvedTheme(initialResolved);
  }, []);

  useEffect(() => {
    if (theme !== 'system') return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    function handleChange() {
      const resolved = resolveSystemTheme();
      applyResolvedTheme(resolved);
      setResolvedTheme(resolved);
    }
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    const resolved = next === 'system' ? resolveSystemTheme() : next;
    applyResolvedTheme(resolved);
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
    setResolvedTheme(resolved);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
