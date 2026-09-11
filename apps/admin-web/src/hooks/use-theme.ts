'use client';

import { useContext } from 'react';
import { ThemeContext, type Theme, type ThemeContextValue } from '../lib/theme/theme-context';

export type { Theme, ThemeContextValue };

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme deve ser usado dentro de <ThemeProvider>.');
  return ctx;
}
