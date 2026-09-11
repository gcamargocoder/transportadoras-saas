'use client';

import { useContext, useEffect, useState } from 'react';
import { ThemeContext } from '../lib/theme/theme-context';

// Recharts nao aceita classe Tailwind em stroke/fill (sao props SVG puras)
// -- este hook le a CSS custom property equivalente direto do documento,
// recalculando quando o tema (claro/escuro) muda. Ver src/app/globals.css
// para a definicao de cada --color-*.
//
// Le o ThemeContext diretamente (useContext, nunca lanca) em vez do hook
// useTheme() (que lanca fora de <ThemeProvider>) -- useCssVar e consumido
// por MonthlyChartCard, que e reutilizado em varias paginas de dashboard
// pre-existentes cujos testes unitarios renderizam a pagina isolada, sem
// <ThemeProvider> (nunca precisaram antes desta fase). O contrato deste
// hook e "sempre devolver uma cor ou o fallback", nunca quebrar a
// renderizacao -- resolvedTheme cai para 'light' quando nao ha provider
// (em producao, o app real sempre tem ThemeProvider no topo, via
// providers.tsx -- isso so afeta testes isolados).
export function useCssVar(name: string, fallback: string): string {
  const ctx = useContext(ThemeContext);
  const resolvedTheme = ctx?.resolvedTheme ?? 'light';
  const [value, setValue] = useState(fallback);

  useEffect(() => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    setValue(raw ? `rgb(${raw})` : fallback);
    // fallback intencionalmente fora das deps: e uma constante de chamada,
    // recalcular por causa dela geraria loop de renderizacao sem motivo.
  }, [name, resolvedTheme]);

  return value;
}
