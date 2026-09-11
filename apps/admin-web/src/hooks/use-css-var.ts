'use client';

import { useEffect, useState } from 'react';
import { useTheme } from './use-theme';

// Recharts nao aceita classe Tailwind em stroke/fill (sao props SVG puras)
// -- este hook le a CSS custom property equivalente direto do documento,
// recalculando quando o tema (claro/escuro) muda. Ver src/app/globals.css
// para a definicao de cada --color-*.
export function useCssVar(name: string, fallback: string): string {
  const { resolvedTheme } = useTheme();
  const [value, setValue] = useState(fallback);

  useEffect(() => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    setValue(raw ? `rgb(${raw})` : fallback);
    // fallback intencionalmente fora das deps: e uma constante de chamada,
    // recalcular por causa dela geraria loop de renderizacao sem motivo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, resolvedTheme]);

  return value;
}
