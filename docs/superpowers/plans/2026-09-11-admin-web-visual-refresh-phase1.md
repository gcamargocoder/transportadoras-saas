# Fundação de Tema (Dark Mode) + Dashboard Executivo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduzir dark/light/system mode em todo o `admin-web` via CSS custom properties (sem quebrar nenhuma tela existente) e repaginar o Dashboard executivo (`/dashboard`) como primeira vitrine — KPIs com tendência real, hierarquia visual, gráficos com paleta consistente.

**Architecture:** Tokens de cor do Tailwind passam a ler CSS vars (`rgb(var(--color-x) / <alpha-value>)`) redefinidas em `:root` (claro) e `:root.dark` (escuro); um `ThemeProvider` (contexto React, mesmo padrão de `AuthProvider`) controla o estado `light/dark/system`, persistido em `localStorage`, com um script bloqueante no `<head>` para evitar flash de tema errado. Componentes que já usam classes semânticas (`bg-surface`, `text-ink`, `border-border`) ganham dark mode sem serem tocados; corrigimos os poucos que usam `bg-white` literal.

**Tech Stack:** Next.js 14 (App Router), Tailwind CSS, React 18, Recharts 2.12, Vitest + @testing-library/react (jsdom), lucide-react. Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-09-11-admin-web-visual-refresh-phase1-design.md`

## Global Constraints

- Nenhuma dependência nova em `package.json` (toggle de tema escrito à mão).
- Nenhuma mudança de endpoint, DTO, entidade ou client de API (`src/lib/api/*`) — `getDashboard()` continua devolvendo exatamente `DashboardEntity`.
- Nenhum dado de tendência inventado: `trend` só aparece nas 4 KPIs com série mensal já existente (`monthlyRevenue/Expenses/FuelCost/Trips`).
- Nenhuma prop existente de componente muda de nome/tipo em modo claro — mudanças são aditivas (props opcionais com default que preserva o comportamento atual).
- Comentários e strings de UI em português do Brasil (padrão do projeto).
- Testes: Vitest + `@testing-library/react`, arquivos `*.test.ts`/`*.test.tsx` colocados ao lado do arquivo testado (convenção já usada em `limit-indicator.test.tsx`, `sidebar-nav.test.tsx`).
- Repositório está no branch `master` (branch padrão) — criar um branch novo antes do primeiro commit desta implementação (ex.: `git checkout -b feature/admin-web-visual-refresh-phase1`).
- Todo commit desta implementação termina com:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Wv4x2xvqtvydhcBVshn4ka
  ```
- Diretório de trabalho para todos os comandos: `apps/admin-web` (a partir da raiz do monorepo, use `cd apps/admin-web` primeiro).

---

### Task 1: Fundação de tema — tokens CSS + `darkMode: 'class'`

**Files:**
- Modify: `apps/admin-web/tailwind.config.ts`
- Modify: `apps/admin-web/src/app/globals.css`
- Test: `apps/admin-web/tailwind.config.test.ts` (novo)
- Test: `apps/admin-web/src/app/globals.css.test.ts` (novo)

**Interfaces:**
- Consumes: nada (primeira task).
- Produces: variáveis CSS `--color-surface`, `--color-surface-subtle`, `--color-surface-muted`, `--color-border`, `--color-border-strong`, `--color-ink`, `--color-ink-muted`, `--color-ink-subtle`, `--color-brand-{50,100,200,300,400,500,600,700,800,900}`, `--color-success-{50,100,500,600,700}`, `--color-warning-{50,100,500,600,700}`, `--color-danger-{50,100,500,600,700}`, `--color-info-{50,100,500,600,700}` — consumidas por qualquer classe Tailwind semântica já existente (`bg-surface`, `text-ink-muted` etc.) e, nas Tasks 9-11, lidas diretamente via `getComputedStyle` para o Recharts.

- [ ] **Step 1: Escrever o teste de `tailwind.config.ts` (falhando)**

Criar `apps/admin-web/tailwind.config.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd apps/admin-web && npx vitest run tailwind.config.test.ts`
Expected: FAIL (`config.darkMode` é `undefined`; cores ainda são hex fixo como `'#ffffff'`).

- [ ] **Step 3: Escrever o teste de `globals.css` (falhando)**

Criar `apps/admin-web/src/app/globals.css.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'globals.css'), 'utf-8');

describe('globals.css — tokens de tema', () => {
  it('define os tokens no :root (tema claro)', () => {
    const rootBlock = css.split(':root.dark')[0] as string;
    expect(rootBlock).toMatch(/--color-surface:\s*255 255 255/);
    expect(rootBlock).toMatch(/--color-surface-subtle:\s*248 250 252/);
    expect(rootBlock).toMatch(/--color-border:\s*226 232 240/);
    expect(rootBlock).toMatch(/--color-ink:\s*15 23 42/);
    expect(rootBlock).toMatch(/--color-brand-600:\s*79 70 229/);
    expect(rootBlock).toMatch(/--color-success-600:\s*22 163 74/);
    expect(rootBlock).toMatch(/--color-danger-600:\s*220 38 38/);
  });

  it('redefine os mesmos tokens em :root.dark com paleta escura (grafite, nao preto puro)', () => {
    const darkBlock = css.split(':root.dark')[1];
    expect(darkBlock).toBeDefined();
    const block = darkBlock as string;
    expect(block).toMatch(/--color-surface:\s*17 24 33/);
    expect(block).toMatch(/--color-surface-subtle:\s*11 16 22/);
    expect(block).toMatch(/--color-ink:\s*226 232 240/);
    expect(block).toMatch(/--color-border:\s*45 56 70/);
    // Acentos operacionais ficam mais claros no escuro (legibilidade sobre
    // fundo escuro) -- ver rationale no Step 5.
    expect(block).toMatch(/--color-success-600:\s*74 222 128/);
    expect(block).toMatch(/--color-danger-600:\s*248 113 113/);
  });
});
```

- [ ] **Step 4: Rodar o teste e confirmar que falha**

Run: `cd apps/admin-web && npx vitest run src/app/globals.css.test.ts`
Expected: FAIL (`globals.css` ainda não tem nenhuma dessas variáveis).

- [ ] **Step 5: Implementar `tailwind.config.ts`**

Substituir o bloco `colors` inteiro dentro de `theme.extend` e adicionar `darkMode: 'class'` no nível raiz do config:

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: 'rgb(var(--color-surface) / <alpha-value>)',
          subtle: 'rgb(var(--color-surface-subtle) / <alpha-value>)',
          muted: 'rgb(var(--color-surface-muted) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--color-border) / <alpha-value>)',
          strong: 'rgb(var(--color-border-strong) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--color-ink) / <alpha-value>)',
          muted: 'rgb(var(--color-ink-muted) / <alpha-value>)',
          subtle: 'rgb(var(--color-ink-subtle) / <alpha-value>)',
        },
        brand: {
          50: 'rgb(var(--color-brand-50) / <alpha-value>)',
          100: 'rgb(var(--color-brand-100) / <alpha-value>)',
          200: 'rgb(var(--color-brand-200) / <alpha-value>)',
          300: 'rgb(var(--color-brand-300) / <alpha-value>)',
          400: 'rgb(var(--color-brand-400) / <alpha-value>)',
          500: 'rgb(var(--color-brand-500) / <alpha-value>)',
          600: 'rgb(var(--color-brand-600) / <alpha-value>)',
          700: 'rgb(var(--color-brand-700) / <alpha-value>)',
          800: 'rgb(var(--color-brand-800) / <alpha-value>)',
          900: 'rgb(var(--color-brand-900) / <alpha-value>)',
        },
        success: {
          50: 'rgb(var(--color-success-50) / <alpha-value>)',
          100: 'rgb(var(--color-success-100) / <alpha-value>)',
          500: 'rgb(var(--color-success-500) / <alpha-value>)',
          600: 'rgb(var(--color-success-600) / <alpha-value>)',
          700: 'rgb(var(--color-success-700) / <alpha-value>)',
        },
        warning: {
          50: 'rgb(var(--color-warning-50) / <alpha-value>)',
          100: 'rgb(var(--color-warning-100) / <alpha-value>)',
          500: 'rgb(var(--color-warning-500) / <alpha-value>)',
          600: 'rgb(var(--color-warning-600) / <alpha-value>)',
          700: 'rgb(var(--color-warning-700) / <alpha-value>)',
        },
        danger: {
          50: 'rgb(var(--color-danger-50) / <alpha-value>)',
          100: 'rgb(var(--color-danger-100) / <alpha-value>)',
          500: 'rgb(var(--color-danger-500) / <alpha-value>)',
          600: 'rgb(var(--color-danger-600) / <alpha-value>)',
          700: 'rgb(var(--color-danger-700) / <alpha-value>)',
        },
        info: {
          50: 'rgb(var(--color-info-50) / <alpha-value>)',
          100: 'rgb(var(--color-info-100) / <alpha-value>)',
          500: 'rgb(var(--color-info-500) / <alpha-value>)',
          600: 'rgb(var(--color-info-600) / <alpha-value>)',
          700: 'rgb(var(--color-info-700) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.875rem', { lineHeight: '1.375rem' }],
        md: ['0.9375rem', { lineHeight: '1.5rem' }],
        lg: ['1.0625rem', { lineHeight: '1.625rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
      },
      borderRadius: {
        sm: '0.375rem',
        DEFAULT: '0.5rem',
        md: '0.625rem',
        lg: '0.875rem',
        xl: '1.125rem',
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(15 23 42 / 0.04)',
        sm: '0 1px 3px 0 rgb(15 23 42 / 0.06), 0 1px 2px -1px rgb(15 23 42 / 0.06)',
        md: '0 4px 12px -2px rgb(15 23 42 / 0.08), 0 2px 4px -2px rgb(15 23 42 / 0.05)',
        lg: '0 12px 24px -6px rgb(15 23 42 / 0.10), 0 4px 8px -4px rgb(15 23 42 / 0.06)',
        popover: '0 8px 24px -4px rgb(15 23 42 / 0.14), 0 2px 6px -2px rgb(15 23 42 / 0.08)',
      },
      spacing: {
        18: '4.5rem',
        72: '18rem',
        84: '21rem',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'slide-in-right': 'slide-in-right 220ms cubic-bezier(0.32, 0.72, 0, 1)',
        'slide-up': 'slide-up 150ms ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 6: Rodar o teste de `tailwind.config.ts` e confirmar que passa**

Run: `cd apps/admin-web && npx vitest run tailwind.config.test.ts`
Expected: PASS

- [ ] **Step 7: Implementar `globals.css`**

Substituir o conteúdo inteiro de `apps/admin-web/src/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --color-surface: 255 255 255;
  --color-surface-subtle: 248 250 252;
  --color-surface-muted: 241 245 249;
  --color-border: 226 232 240;
  --color-border-strong: 203 213 225;
  --color-ink: 15 23 42;
  --color-ink-muted: 71 85 105;
  --color-ink-subtle: 148 163 184;

  --color-brand-50: 238 242 255;
  --color-brand-100: 224 231 255;
  --color-brand-200: 199 210 254;
  --color-brand-300: 165 180 252;
  --color-brand-400: 129 140 248;
  --color-brand-500: 99 102 241;
  --color-brand-600: 79 70 229;
  --color-brand-700: 67 56 202;
  --color-brand-800: 55 48 163;
  --color-brand-900: 49 46 129;

  --color-success-50: 240 253 244;
  --color-success-100: 220 252 231;
  --color-success-500: 34 197 94;
  --color-success-600: 22 163 74;
  --color-success-700: 21 128 61;

  --color-warning-50: 255 251 235;
  --color-warning-100: 254 243 199;
  --color-warning-500: 245 158 11;
  --color-warning-600: 217 119 6;
  --color-warning-700: 180 83 9;

  --color-danger-50: 254 242 242;
  --color-danger-100: 254 226 226;
  --color-danger-500: 239 68 68;
  --color-danger-600: 220 38 38;
  --color-danger-700: 185 28 28;

  --color-info-50: 239 246 255;
  --color-info-100: 219 234 254;
  --color-info-500: 59 130 246;
  --color-info-600: 37 99 235;
  --color-info-700: 29 78 216;
}

/* Tema escuro -- grafite escuro (nao preto puro, reduz fadiga visual),
   aplicado via classe .dark em <html> (ver src/lib/theme/theme-context.tsx
   e o script anti-flash em src/app/layout.tsx). Acentos operacionais
   (brand/success/warning/danger/info) usam um tom mais claro/saturado
   (equivalente ao step "400" da paleta Tailwind padrão) tanto para bg
   quanto para texto -- sobre fundo escuro, os tons 500/600/700 do claro
   ficam escuros demais para contraste AA; um unico tom mais claro por
   familia evita a ambiguidade de qual step usar em cada papel (fundo vs.
   texto), diferente do tema claro que usa 3 steps distintos por familia. */
:root.dark {
  --color-surface: 17 24 33;
  --color-surface-subtle: 11 16 22;
  --color-surface-muted: 26 35 46;
  --color-border: 45 56 70;
  --color-border-strong: 61 74 90;
  --color-ink: 226 232 240;
  --color-ink-muted: 148 163 184;
  --color-ink-subtle: 100 116 139;

  --color-brand-50: 30 27 75;
  --color-brand-100: 49 46 129;
  --color-brand-200: 199 210 254;
  --color-brand-300: 165 180 252;
  --color-brand-400: 129 140 248;
  --color-brand-500: 129 140 248;
  --color-brand-600: 129 140 248;
  --color-brand-700: 129 140 248;
  --color-brand-800: 55 48 163;
  --color-brand-900: 49 46 129;

  --color-success-50: 5 46 22;
  --color-success-100: 20 83 45;
  --color-success-500: 74 222 128;
  --color-success-600: 74 222 128;
  --color-success-700: 74 222 128;

  --color-warning-50: 69 26 3;
  --color-warning-100: 120 53 15;
  --color-warning-500: 251 191 36;
  --color-warning-600: 251 191 36;
  --color-warning-700: 251 191 36;

  --color-danger-50: 69 10 10;
  --color-danger-100: 127 29 29;
  --color-danger-500: 248 113 113;
  --color-danger-600: 248 113 113;
  --color-danger-700: 248 113 113;

  --color-info-50: 23 37 84;
  --color-info-100: 30 58 138;
  --color-info-500: 96 165 250;
  --color-info-600: 96 165 250;
  --color-info-700: 96 165 250;
}

@layer base {
  html {
    -webkit-font-smoothing: antialiased;
  }

  body {
    @apply bg-surface-subtle text-ink font-sans antialiased;
  }

  *:focus-visible {
    @apply outline-none ring-2 ring-brand-500 ring-offset-2 ring-offset-surface;
  }

  ::selection {
    @apply bg-brand-200 text-brand-900;
  }
}

@layer utilities {
  .scrollbar-thin {
    scrollbar-width: thin;
    scrollbar-color: #cbd5e1 transparent;
  }

  .scrollbar-thin::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .scrollbar-thin::-webkit-scrollbar-thumb {
    background-color: #cbd5e1;
    border-radius: 9999px;
  }
}
```

- [ ] **Step 8: Rodar o teste de `globals.css` e confirmar que passa**

Run: `cd apps/admin-web && npx vitest run src/app/globals.css.test.ts`
Expected: PASS

- [ ] **Step 9: Rodar typecheck (config do Tailwind é TS)**

Run: `cd apps/admin-web && npx tsc --noEmit`
Expected: sem erros novos relacionados a `tailwind.config.ts`/`globals.css`.

- [ ] **Step 10: Commit**

```bash
git add apps/admin-web/tailwind.config.ts apps/admin-web/tailwind.config.test.ts \
        apps/admin-web/src/app/globals.css apps/admin-web/src/app/globals.css.test.ts
git commit -m "feat(admin-web): fundação de tema — tokens CSS + darkMode class

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Wv4x2xvqtvydhcBVshn4ka"
```

---

### Task 2: `ThemeProvider` + `useTheme` hook

**Files:**
- Create: `apps/admin-web/src/lib/theme/theme-context.tsx`
- Create: `apps/admin-web/src/hooks/use-theme.ts`
- Test: `apps/admin-web/src/lib/theme/theme-context.test.tsx`

**Interfaces:**
- Consumes: nada além de React/DOM/localStorage/matchMedia.
- Produces: `export type Theme = 'light' | 'dark' | 'system'`; `export interface ThemeContextValue { theme: Theme; resolvedTheme: 'light' | 'dark'; setTheme: (theme: Theme) => void }`; `export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element`; `export function useTheme(): ThemeContextValue` (em `hooks/use-theme.ts`) — usados pelas Tasks 3, 4 e 9.

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `apps/admin-web/src/lib/theme/theme-context.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from './theme-context';
import { useTheme } from '../../hooks/use-theme';

function mockMatchMedia(matches: boolean) {
  const listeners: Array<(event: MediaQueryListEvent) => void> = [];
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: (_event: string, cb: (event: MediaQueryListEvent) => void) => {
      listeners.push(cb);
    },
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  return { fire: (next: boolean) => listeners.forEach((cb) => cb({ matches: next } as MediaQueryListEvent)) };
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

    act(() => screen.getByText('dark').click());

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

    act(() => screen.getByText('dark').click());
    act(() => screen.getByText('light').click());

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

    act(() => screen.getByText('system').click());

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
    act(() => screen.getByText('system').click());
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
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd apps/admin-web && npx vitest run src/lib/theme/theme-context.test.tsx`
Expected: FAIL (`./theme-context` e `../../hooks/use-theme` ainda não existem).

- [ ] **Step 3: Implementar `theme-context.tsx`**

Criar `apps/admin-web/src/lib/theme/theme-context.tsx`:

```tsx
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
```

- [ ] **Step 4: Implementar `use-theme.ts`**

Criar `apps/admin-web/src/hooks/use-theme.ts`:

```ts
'use client';

import { useContext } from 'react';
import { ThemeContext, type Theme, type ThemeContextValue } from '../lib/theme/theme-context';

export type { Theme, ThemeContextValue };

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme deve ser usado dentro de <ThemeProvider>.');
  return ctx;
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `cd apps/admin-web && npx vitest run src/lib/theme/theme-context.test.tsx`
Expected: PASS (6 testes)

- [ ] **Step 6: Commit**

```bash
git add apps/admin-web/src/lib/theme/theme-context.tsx \
        apps/admin-web/src/lib/theme/theme-context.test.tsx \
        apps/admin-web/src/hooks/use-theme.ts
git commit -m "feat(admin-web): ThemeProvider + useTheme (light/dark/system)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Wv4x2xvqtvydhcBVshn4ka"
```

---

### Task 3: Script anti-flash (FOUC) + wiring em `layout.tsx`/`providers.tsx`

**Files:**
- Modify: `apps/admin-web/src/app/layout.tsx`
- Modify: `apps/admin-web/src/app/providers.tsx`

**Interfaces:**
- Consumes: `ThemeProvider` (Task 2, `../../lib/theme/theme-context`).
- Produces: nada consumido por tasks seguintes (é o topo da árvore) — mas é pré-requisito visual para todas as próximas.

Sem teste automatizado novo: a lógica do script é a mesma já validada em `theme-context.test.tsx` (Task 2) — testar o script inline exigiria executar uma string HTML fora do ambiente de componente, sem valor adicional real. Verificação é manual (Step 4).

- [ ] **Step 1: Adicionar `suppressHydrationWarning` e o script anti-flash em `layout.tsx`**

Substituir `apps/admin-web/src/app/layout.tsx` por:

```tsx
import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Painel Administrativo — Transportadoras SaaS',
  description: 'Gestão de viagens, frota, pedágios e financeiro para transportadoras.',
};

// Aplica a classe "dark" em <html> ANTES do primeiro paint (evita flash de
// tema errado). Espelha exatamente a mesma resolucao de src/lib/theme/
// theme-context.tsx (isTheme + resolveSystemTheme): tema explicito
// 'dark'/'light' respeitado; qualquer outro valor (ausente ou 'system')
// segue prefers-color-scheme.
const THEME_INIT_SCRIPT = `(function(){try{
  var stored = localStorage.getItem('theme');
  var isDark = stored === 'dark' || (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (isDark) document.documentElement.classList.add('dark');
} catch (e) {}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Envolver a árvore com `ThemeProvider` em `providers.tsx`**

Substituir `apps/admin-web/src/app/providers.tsx` por:

```tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { AuthProvider } from '../lib/auth/auth-context';
import { ThemeProvider } from '../lib/theme/theme-context';
import { ToastProvider } from '../components/ui/toast';

export function Providers({ children }: { children: ReactNode }): JSX.Element {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
```

- [ ] **Step 3: Rodar typecheck**

Run: `cd apps/admin-web && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Verificação manual (sem teste automatizado)**

Run: `cd apps/admin-web && npm run dev`, abrir `http://localhost:3000` no navegador.
- Trocar o tema do SO para escuro e recarregar a página: **não deve haver flash branco antes do escuro aplicar** (o `<html>` já nasce com a classe `dark`).
- Abrir o DevTools → Application → Local Storage: setar `theme` para `"dark"` manualmente e recarregar — página deve abrir direto no escuro.
- Remover a chave `theme` do Local Storage e recarregar — deve seguir o tema do SO.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/app/layout.tsx apps/admin-web/src/app/providers.tsx
git commit -m "feat(admin-web): script anti-flash de tema + ThemeProvider no providers.tsx

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Wv4x2xvqtvydhcBVshn4ka"
```

---

### Task 4: `ThemeToggle` + integração no `Header`

**Files:**
- Create: `apps/admin-web/src/components/ui/theme-toggle.tsx`
- Test: `apps/admin-web/src/components/ui/theme-toggle.test.tsx`
- Modify: `apps/admin-web/src/components/layout/header.tsx`

**Interfaces:**
- Consumes: `useTheme` (Task 2, `../../hooks/use-theme`), `Dropdown` (já existente, `./dropdown`).
- Produces: `export function ThemeToggle(): JSX.Element` — usado só pelo `Header` nesta fase.

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `apps/admin-web/src/components/ui/theme-toggle.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from './theme-toggle';
import { useTheme } from '../../hooks/use-theme';

vi.mock('../../hooks/use-theme', () => ({
  useTheme: vi.fn(),
}));

describe('ThemeToggle', () => {
  it('abre o menu e mostra as 3 opções de tema, marcando a atual', () => {
    vi.mocked(useTheme).mockReturnValue({ theme: 'system', resolvedTheme: 'light', setTheme: vi.fn() });
    render(<ThemeToggle />);

    fireEvent.click(screen.getByLabelText('Alternar tema'));

    expect(screen.getByText('Claro')).toBeInTheDocument();
    expect(screen.getByText('Escuro')).toBeInTheDocument();
    expect(screen.getByText('Sistema ✓')).toBeInTheDocument();
  });

  it('chama setTheme com o valor escolhido', () => {
    const setTheme = vi.fn();
    vi.mocked(useTheme).mockReturnValue({ theme: 'light', resolvedTheme: 'light', setTheme });
    render(<ThemeToggle />);

    fireEvent.click(screen.getByLabelText('Alternar tema'));
    fireEvent.click(screen.getByText('Escuro'));

    expect(setTheme).toHaveBeenCalledWith('dark');
  });

  it('usa o icone de lua quando o tema resolvido e escuro', () => {
    vi.mocked(useTheme).mockReturnValue({ theme: 'dark', resolvedTheme: 'dark', setTheme: vi.fn() });
    const { container } = render(<ThemeToggle />);
    expect(container.querySelector('svg.lucide-moon')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd apps/admin-web && npx vitest run src/components/ui/theme-toggle.test.tsx`
Expected: FAIL (`./theme-toggle` não existe).

- [ ] **Step 3: Implementar `theme-toggle.tsx`**

Criar `apps/admin-web/src/components/ui/theme-toggle.tsx`:

```tsx
'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type Theme } from '../../hooks/use-theme';
import { Dropdown } from './dropdown';

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
];

export function ThemeToggle(): JSX.Element {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const ActiveIcon = resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <Dropdown
      align="end"
      trigger={
        <span
          className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink"
          aria-label="Alternar tema"
        >
          <ActiveIcon size={17} />
        </span>
      }
      items={OPTIONS.map((option) => ({
        label: option.value === theme ? `${option.label} ✓` : option.label,
        icon: <option.icon size={14} />,
        onClick: () => setTheme(option.value),
      }))}
    />
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd apps/admin-web && npx vitest run src/components/ui/theme-toggle.test.tsx`
Expected: PASS (3 testes)

- [ ] **Step 5: Integrar no `Header` + trocar `bg-white` por `bg-surface`**

Em `apps/admin-web/src/components/layout/header.tsx`:

1. Adicionar o import (junto aos outros de `../ui/*`):

```tsx
import { ThemeToggle } from '../ui/theme-toggle';
```

2. Trocar a linha do `<header>`:

```tsx
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface/85 px-4 backdrop-blur sm:px-6">
```

3. Adicionar `<ThemeToggle />` antes do link de notificações, dentro da `<div className="flex items-center gap-1">`:

```tsx
      <div className="flex items-center gap-1">
        <ThemeToggle />

        <Link
          href="/notifications"
```

- [ ] **Step 6: Rodar typecheck**

Run: `cd apps/admin-web && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add apps/admin-web/src/components/ui/theme-toggle.tsx \
        apps/admin-web/src/components/ui/theme-toggle.test.tsx \
        apps/admin-web/src/components/layout/header.tsx
git commit -m "feat(admin-web): botão de alternar tema no Header

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Wv4x2xvqtvydhcBVshn4ka"
```

---

### Task 5: `Card` — prop `interactive` + `bg-surface`

**Files:**
- Modify: `apps/admin-web/src/components/ui/card.tsx`
- Test: `apps/admin-web/src/components/ui/card.test.tsx` (novo)

**Interfaces:**
- Consumes: `cn` (`../../utils/cn`, já existente).
- Produces: `Card` ganha prop opcional `interactive?: boolean` (default `false`) — usada pela Task 6 (`StatCard`).

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `apps/admin-web/src/components/ui/card.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from './card';

describe('Card', () => {
  it('usa bg-surface (reage ao dark mode), nunca bg-white fixo', () => {
    render(<Card data-testid="card">conteúdo</Card>);
    const card = screen.getByTestId('card');
    expect(card.className).toMatch(/bg-surface\b/);
    expect(card.className).not.toMatch(/bg-white/);
  });

  it('não aplica microinteração de hover quando interactive não é informado', () => {
    render(<Card data-testid="card">conteúdo</Card>);
    expect(screen.getByTestId('card').className).not.toMatch(/hover:shadow-sm/);
  });

  it('aplica hover:shadow-sm quando interactive=true', () => {
    render(
      <Card data-testid="card" interactive>
        conteúdo
      </Card>,
    );
    expect(screen.getByTestId('card').className).toMatch(/hover:shadow-sm/);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd apps/admin-web && npx vitest run src/components/ui/card.test.tsx`
Expected: FAIL (`Card` ainda não aceita `interactive` e ainda usa `bg-white`).

- [ ] **Step 3: Implementar**

Substituir a função `Card` em `apps/admin-web/src/components/ui/card.tsx` (mantendo `CardHeader`/`CardBody` intactos abaixo):

```tsx
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';

export function Card({
  className,
  interactive = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }): JSX.Element {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface shadow-xs',
        interactive && 'transition-shadow duration-150 hover:shadow-sm',
        className,
      )}
      {...props}
    />
  );
}
```

(O restante do arquivo — `CardHeader`, `CardBody` — permanece sem alteração.)

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd apps/admin-web && npx vitest run src/components/ui/card.test.tsx`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/components/ui/card.tsx apps/admin-web/src/components/ui/card.test.tsx
git commit -m "feat(admin-web): Card ganha prop interactive e usa bg-surface

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Wv4x2xvqtvydhcBVshn4ka"
```

---

### Task 6: `StatCard` — reaproveita `Card(interactive)` + tendência com `direction`/`favorable`

**Files:**
- Modify: `apps/admin-web/src/components/ui/stat-card.tsx`
- Test: `apps/admin-web/src/components/ui/stat-card.test.tsx` (novo)

**Interfaces:**
- Consumes: `Card` com `interactive` (Task 5, `./card`).
- Produces: `StatCard`'s `trend` prop muda de forma (**decisão tomada durante o planejamento, documentada abaixo** — prop nunca teve nenhum consumidor em produção até aqui, confirmado por auditoria, portanto não é uma mudança quebradiça):
  `trend?: { value: string; direction: 'up' | 'down'; favorable: boolean }`.
  Usado pela Task 8 (`computeMonthOverMonthTrend` produz exatamente esse shape) e pela Task 12 (`dashboard/page.tsx`).

**Por que `direction` + `favorable` em vez do `positive` original:** o `positive` original controlava a SETA (↑/↓) e a COR (verde/vermelho) com o mesmo booleano. Isso quebra para métricas onde "subir é ruim" (ex.: despesas) — mostrar "+12%" com seta pra cima em VERMELHO seria natural, mas com um único booleano a seta viraria pra baixo (contradizendo o número). Separar os dois conceitos resolve isso: a seta sempre reflete a direção real do número; a cor reflete se aquilo é bom ou ruim para o negócio.

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `apps/admin-web/src/components/ui/stat-card.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatCard } from './stat-card';

describe('StatCard', () => {
  it('renderiza label e valor', () => {
    render(<StatCard label="Receita" value="R$ 1.000,00" />);
    expect(screen.getByText('Receita')).toBeInTheDocument();
    expect(screen.getByText('R$ 1.000,00')).toBeInTheDocument();
  });

  it('variante default usa bg-surface e microinteração de hover (via Card interactive)', () => {
    const { container } = render(<StatCard label="Receita" value="R$ 1.000,00" />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toMatch(/bg-surface\b/);
    expect(card.className).toMatch(/hover:shadow-sm/);
  });

  it('variante gradient não usa Card interactive (destaque não precisa de hover extra)', () => {
    const { container } = render(
      <StatCard label="Receita" value="R$ 1.000,00" variant="gradient" />,
    );
    const card = container.firstChild as HTMLElement;
    expect(card.className).not.toMatch(/hover:shadow-sm/);
  });

  it('seta reflete a direção real do número, cor reflete se é favorável', () => {
    const { rerender } = render(
      <StatCard
        label="Despesas"
        value="R$ 1.200"
        trend={{ value: '+20.0% vs mês anterior', direction: 'up', favorable: false }}
      />,
    );
    let trendText = screen.getByText('+20.0% vs mês anterior');
    expect(trendText.parentElement?.className).toMatch(/text-danger-600/);

    rerender(
      <StatCard
        label="Receita"
        value="R$ 1.200"
        trend={{ value: '+20.0% vs mês anterior', direction: 'up', favorable: true }}
      />,
    );
    trendText = screen.getByText('+20.0% vs mês anterior');
    expect(trendText.parentElement?.className).toMatch(/text-success-600/);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd apps/admin-web && npx vitest run src/components/ui/stat-card.test.tsx`
Expected: FAIL (`trend` ainda espera `{ value, positive }`; `StatCard` ainda não usa `Card`).

- [ ] **Step 3: Implementar**

Substituir `apps/admin-web/src/components/ui/stat-card.tsx` inteiro:

```tsx
import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Card } from './card';

export interface StatCardTrend {
  value: string;
  /** Direção real do número (sempre honesta — nunca invertida por conveniência). */
  direction: 'up' | 'down';
  /** Se essa direção é boa para o negócio (ex.: despesa caindo = favorável). */
  favorable: boolean;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  tone = 'brand',
  variant = 'default',
  className,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  trend?: StatCardTrend;
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'info';
  /** 'gradient' = card de destaque com fundo escuro (uso pontual, 1-2 métricas por dashboard). */
  variant?: 'default' | 'gradient';
  className?: string;
}): JSX.Element {
  if (variant === 'gradient') {
    return (
      <div
        className={cn(
          'rounded-lg bg-gradient-to-br from-brand-700 to-brand-900 p-5 text-white shadow-md',
          className,
        )}
      >
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-brand-100">{label}</p>
          {Icon && (
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-white">
              <Icon size={16} />
            </span>
          )}
        </div>
        <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p>
        {trend && (
          <p
            className={cn(
              'mt-1.5 flex items-center gap-1 text-xs font-medium',
              trend.favorable ? 'text-success-300' : 'text-danger-300',
            )}
          >
            {trend.direction === 'up' ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {trend.value}
          </p>
        )}
      </div>
    );
  }

  return (
    <Card interactive className={cn('p-5', className)}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-ink-muted">{label}</p>
        {Icon && (
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md',
              {
                brand: 'bg-brand-50 text-brand-600',
                success: 'bg-success-50 text-success-600',
                warning: 'bg-warning-50 text-warning-600',
                danger: 'bg-danger-50 text-danger-600',
                info: 'bg-info-50 text-info-600',
              }[tone],
            )}
          >
            <Icon size={16} />
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-ink">{value}</p>
      {trend && (
        <p
          className={cn(
            'mt-1.5 flex items-center gap-1 text-xs font-medium',
            trend.favorable ? 'text-success-600' : 'text-danger-600',
          )}
        >
          {trend.direction === 'up' ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          {trend.value}
        </p>
      )}
    </Card>
  );
}
```

Nota: `Card` já aplica `rounded-lg border border-border bg-surface shadow-xs`; o `p-5` (antes no `div` raiz) agora vai em `className` do próprio `Card` (via `cn('p-5', className)`), preservando o espaçamento visual idêntico ao anterior.

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd apps/admin-web && npx vitest run src/components/ui/stat-card.test.tsx`
Expected: PASS (4 testes)

- [ ] **Step 5: Rodar typecheck (StatCardTrend é novo tipo exportado)**

Run: `cd apps/admin-web && npx tsc --noEmit`
Expected: sem erros (nenhum outro arquivo usa `trend` ainda nesta altura do plano).

- [ ] **Step 6: Commit**

```bash
git add apps/admin-web/src/components/ui/stat-card.tsx apps/admin-web/src/components/ui/stat-card.test.tsx
git commit -m "feat(admin-web): StatCard reaproveita Card(interactive) e corrige semântica de trend

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Wv4x2xvqtvydhcBVshn4ka"
```

---

### Task 7: Sweep de cor bruta restante — kit base completo

**Descoberta durante o planejamento:** uma varredura por `bg-white` no
projeto inteiro achou ~90 ocorrências, não só as 5 do spec original. Duas
categorias bem diferentes: (a) **9 componentes do kit base** (`input`,
`select`, `search-combobox`, `date-picker`, `modal`, `drawer`, `skeleton`,
`toast`, `data-table`) — usados por praticamente toda tela do projeto,
inclusive pelo próprio Dashboard executivo (`DatePicker`/`SkeletonCards`
aparecem direto nele; `Toast`/`Drawer` são globais); (b) **~50 páginas de
listagem**, cada uma com seu próprio wrapper `<div className="...
bg-white">` em vez de usar `Card`. **Decisão (confirmada com o usuário):**
esta task cobre (a) — é fundação de verdade, mesmo padrão mecânico das
Tasks 5-6. (b) fica fora de escopo, é o "rollout das listagens CRUD" já
adiado no spec para um sub-projeto futuro.

**Files:**
- Modify: `apps/admin-web/src/components/ui/button.tsx`
- Test: `apps/admin-web/src/components/ui/button.test.tsx` (novo)
- Modify: `apps/admin-web/src/components/ui/dropdown.tsx`
- Test: `apps/admin-web/src/components/ui/dropdown.test.tsx` (novo)
- Modify: `apps/admin-web/src/components/ui/input.tsx`
- Test: `apps/admin-web/src/components/ui/input.test.tsx` (novo)
- Modify: `apps/admin-web/src/components/ui/select.tsx`
- Test: `apps/admin-web/src/components/ui/select.test.tsx` (novo)
- Modify: `apps/admin-web/src/components/ui/date-picker.tsx`
- Test: `apps/admin-web/src/components/ui/date-picker.test.tsx` (novo)
- Modify: `apps/admin-web/src/components/ui/search-combobox.tsx`
- Test: `apps/admin-web/src/components/ui/search-combobox.test.tsx` (novo)
- Modify: `apps/admin-web/src/components/ui/modal.tsx`
- Test: `apps/admin-web/src/components/ui/modal.test.tsx` (novo)
- Modify: `apps/admin-web/src/components/ui/drawer.tsx`
- Test: `apps/admin-web/src/components/ui/drawer.test.tsx` (novo)
- Modify: `apps/admin-web/src/components/ui/skeleton.tsx`
- Test: `apps/admin-web/src/components/ui/skeleton.test.tsx` (novo)
- Modify: `apps/admin-web/src/components/ui/toast.tsx`
- Test: `apps/admin-web/src/components/ui/toast.test.tsx` (novo)
- Modify: `apps/admin-web/src/components/ui/data-table.tsx`
- Modify: `apps/admin-web/src/components/ui/data-table.test.tsx` (já existe — adicionar 1 caso)
- Modify: `apps/admin-web/src/components/layout/app-shell.tsx`

**Interfaces:**
- Consumes: nada novo.
- Produces: nada consumido por tasks seguintes — último ponto de "cor bruta" identificado na auditoria (dentro do kit base).

- [ ] **Step 1: Escrever o teste de `Button` (falhando)**

Criar `apps/admin-web/src/components/ui/button.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('renderiza o texto do botão', () => {
    render(<Button>Salvar</Button>);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
  });

  it('variante outline usa bg-surface (reage ao dark mode), nunca bg-white fixo', () => {
    render(<Button variant="outline">Cancelar</Button>);
    const button = screen.getByRole('button', { name: 'Cancelar' });
    expect(button.className).toMatch(/bg-surface\b/);
    expect(button.className).not.toMatch(/bg-white/);
  });

  it('fica desabilitado enquanto loading', () => {
    render(<Button loading>Salvando</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd apps/admin-web && npx vitest run src/components/ui/button.test.tsx`
Expected: FAIL na asserção de `bg-surface` (ainda é `bg-white`).

- [ ] **Step 3: Corrigir `button.tsx`**

Em `apps/admin-web/src/components/ui/button.tsx`, trocar apenas a linha `outline` dentro de `VARIANT_CLASSES`:

```tsx
const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-xs',
  secondary: 'bg-surface-muted text-ink hover:bg-border',
  outline: 'border border-border-strong bg-surface text-ink hover:bg-surface-muted',
  ghost: 'text-ink-muted hover:bg-surface-muted hover:text-ink',
  danger: 'bg-danger-600 text-white hover:bg-danger-700 shadow-xs',
};
```

- [ ] **Step 4: Rodar o teste de `Button` e confirmar que passa**

Run: `cd apps/admin-web && npx vitest run src/components/ui/button.test.tsx`
Expected: PASS (3 testes)

- [ ] **Step 5: Escrever o teste de `Dropdown` (falhando)**

Criar `apps/admin-web/src/components/ui/dropdown.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dropdown } from './dropdown';

describe('Dropdown', () => {
  it('abre o menu ao clicar no trigger e mostra os itens', () => {
    render(
      <Dropdown trigger={<span>abrir</span>} items={[{ label: 'Item 1', onClick: vi.fn() }]} />,
    );

    fireEvent.click(screen.getByText('abrir'));

    expect(screen.getByText('Item 1')).toBeInTheDocument();
  });

  it('o painel usa bg-surface (reage ao dark mode), nunca bg-white fixo', () => {
    render(
      <Dropdown trigger={<span>abrir</span>} items={[{ label: 'Item 1', onClick: vi.fn() }]} />,
    );
    fireEvent.click(screen.getByText('abrir'));

    const panel = screen.getByRole('menu');
    expect(panel.className).toMatch(/bg-surface\b/);
    expect(panel.className).not.toMatch(/bg-white/);
  });

  it('chama onClick do item e fecha o menu', () => {
    const onClick = vi.fn();
    render(<Dropdown trigger={<span>abrir</span>} items={[{ label: 'Item 1', onClick }]} />);
    fireEvent.click(screen.getByText('abrir'));

    fireEvent.click(screen.getByText('Item 1'));

    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.queryByText('Item 1')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Rodar o teste e confirmar que falha**

Run: `cd apps/admin-web && npx vitest run src/components/ui/dropdown.test.tsx`
Expected: FAIL na asserção de `bg-surface`.

- [ ] **Step 7: Corrigir `dropdown.tsx`**

Em `apps/admin-web/src/components/ui/dropdown.tsx`, trocar a classe do painel do menu:

```tsx
          className={cn(
            'absolute z-20 mt-1.5 min-w-[180px] rounded-md border border-border bg-surface p-1 shadow-popover animate-fade-in',
            align === 'end' ? 'right-0' : 'left-0',
          )}
```

- [ ] **Step 8: Rodar o teste de `Dropdown` e confirmar que passa**

Run: `cd apps/admin-web && npx vitest run src/components/ui/dropdown.test.tsx`
Expected: PASS (3 testes)

- [ ] **Step 9: Escrever o teste de `Input` (falhando)**

Criar `apps/admin-web/src/components/ui/input.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from './input';

describe('Input', () => {
  it('usa bg-surface (reage ao dark mode), nunca bg-white fixo', () => {
    const { container } = render(<Input placeholder="Buscar" />);
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input.className).toMatch(/bg-surface\b/);
    expect(input.className).not.toMatch(/bg-white/);
  });
});
```

- [ ] **Step 10: Rodar o teste e confirmar que falha; corrigir `input.tsx`**

Run: `cd apps/admin-web && npx vitest run src/components/ui/input.test.tsx` → FAIL.

Em `apps/admin-web/src/components/ui/input.tsx`, trocar a linha das classes do `<input>`:

```tsx
          'h-9 w-full rounded-md border bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle',
```

Rodar de novo: `cd apps/admin-web && npx vitest run src/components/ui/input.test.tsx` → PASS.

- [ ] **Step 11: Escrever o teste de `Select` (falhando)**

Criar `apps/admin-web/src/components/ui/select.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Select } from './select';

describe('Select', () => {
  it('usa bg-surface (reage ao dark mode), nunca bg-white fixo', () => {
    const { container } = render(
      <Select>
        <option value="a">A</option>
      </Select>,
    );
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.className).toMatch(/bg-surface\b/);
    expect(select.className).not.toMatch(/bg-white/);
  });
});
```

- [ ] **Step 12: Rodar o teste e confirmar que falha; corrigir `select.tsx`**

Run: `cd apps/admin-web && npx vitest run src/components/ui/select.test.tsx` → FAIL.

Em `apps/admin-web/src/components/ui/select.tsx`, trocar a linha das classes do `<select>`:

```tsx
          'h-9 w-full appearance-none rounded-md border bg-surface px-3 pr-8 text-sm text-ink',
```

Rodar de novo: `cd apps/admin-web && npx vitest run src/components/ui/select.test.tsx` → PASS.

- [ ] **Step 13: Escrever o teste de `DatePicker` (falhando)**

Criar `apps/admin-web/src/components/ui/date-picker.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DatePicker } from './date-picker';

describe('DatePicker', () => {
  it('usa bg-surface (reage ao dark mode), nunca bg-white fixo', () => {
    const { container } = render(<DatePicker />);
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input.className).toMatch(/bg-surface\b/);
    expect(input.className).not.toMatch(/bg-white/);
  });
});
```

- [ ] **Step 14: Rodar o teste e confirmar que falha; corrigir `date-picker.tsx`**

Run: `cd apps/admin-web && npx vitest run src/components/ui/date-picker.test.tsx` → FAIL.

Em `apps/admin-web/src/components/ui/date-picker.tsx`, trocar a linha das classes do `<input>`:

```tsx
          'h-9 w-full rounded-md border border-border-strong bg-surface pl-9 pr-3 text-sm text-ink',
```

Rodar de novo: `cd apps/admin-web && npx vitest run src/components/ui/date-picker.test.tsx` → PASS.

- [ ] **Step 15: Escrever o teste de `SearchCombobox` (falhando)**

Criar `apps/admin-web/src/components/ui/search-combobox.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { SearchCombobox } from './search-combobox';

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient();
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const baseProps = {
  queryKey: (s: string) => ['test', s] as unknown[],
  queryFn: async () => ({ items: [] as string[] }),
  getOptionValue: (item: string) => item,
  renderOption: (item: string) => item,
  getDisplayText: (item: string) => item,
  onSelect: () => {},
  onClear: () => {},
};

describe('SearchCombobox', () => {
  it('usa bg-surface no input de busca, nunca bg-white fixo', () => {
    const { container } = renderWithClient(<SearchCombobox {...baseProps} selectedItem={null} />);
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input.className).toMatch(/bg-surface\b/);
    expect(input.className).not.toMatch(/bg-white/);
  });

  it('usa bg-surface no chip de item selecionado, nunca bg-white fixo', () => {
    const { container } = renderWithClient(
      <SearchCombobox {...baseProps} selectedItem="Item selecionado" />,
    );
    const chip = container.firstChild as HTMLElement;
    expect(chip.className).toMatch(/bg-surface\b/);
    expect(chip.className).not.toMatch(/bg-white/);
  });
});
```

- [ ] **Step 16: Rodar o teste e confirmar que falha; corrigir `search-combobox.tsx`**

Run: `cd apps/admin-web && npx vitest run src/components/ui/search-combobox.test.tsx` → FAIL.

Em `apps/admin-web/src/components/ui/search-combobox.tsx`, trocar as 3 ocorrências de `bg-white`:

```tsx
      <div className="flex items-center gap-2 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm">
```

```tsx
          className={cn(
            'h-9 w-full rounded-md border bg-surface pl-9 pr-8 text-sm text-ink placeholder:text-ink-subtle',
```

```tsx
        <div className="absolute z-20 mt-1.5 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-surface shadow-popover">
```

Rodar de novo: `cd apps/admin-web && npx vitest run src/components/ui/search-combobox.test.tsx` → PASS.

- [ ] **Step 17: Escrever o teste de `Modal` (falhando)**

Criar `apps/admin-web/src/components/ui/modal.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './modal';

describe('Modal', () => {
  it('usa bg-surface (reage ao dark mode), nunca bg-white fixo', () => {
    render(
      <Modal open onClose={vi.fn()} title="Título">
        conteúdo
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toMatch(/bg-surface\b/);
    expect(dialog.className).not.toMatch(/bg-white/);
  });
});
```

- [ ] **Step 18: Rodar o teste e confirmar que falha; corrigir `modal.tsx`**

Run: `cd apps/admin-web && npx vitest run src/components/ui/modal.test.tsx` → FAIL.

Em `apps/admin-web/src/components/ui/modal.tsx`, trocar a classe do painel do diálogo:

```tsx
          'relative flex max-h-[90vh] w-full flex-col rounded-lg bg-surface shadow-lg animate-slide-up',
```

Rodar de novo: `cd apps/admin-web && npx vitest run src/components/ui/modal.test.tsx` → PASS.

- [ ] **Step 19: Escrever o teste de `Drawer` (falhando)**

Criar `apps/admin-web/src/components/ui/drawer.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Drawer } from './drawer';

describe('Drawer', () => {
  it('usa bg-surface (reage ao dark mode), nunca bg-white fixo', () => {
    render(
      <Drawer open onClose={vi.fn()} title="Título">
        conteúdo
      </Drawer>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toMatch(/bg-surface\b/);
    expect(dialog.className).not.toMatch(/bg-white/);
  });
});
```

- [ ] **Step 20: Rodar o teste e confirmar que falha; corrigir `drawer.tsx`**

Run: `cd apps/admin-web && npx vitest run src/components/ui/drawer.test.tsx` → FAIL.

Em `apps/admin-web/src/components/ui/drawer.tsx`, trocar a linha do template string:

```tsx
        className={`relative flex h-full w-full max-w-sm flex-col bg-surface shadow-lg animate-slide-in-right ${
```

Rodar de novo: `cd apps/admin-web && npx vitest run src/components/ui/drawer.test.tsx` → PASS.

- [ ] **Step 21: Escrever o teste de `SkeletonCards` (falhando)**

Criar `apps/admin-web/src/components/ui/skeleton.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SkeletonCards } from './skeleton';

describe('SkeletonCards', () => {
  it('usa bg-surface (reage ao dark mode), nunca bg-white fixo', () => {
    const { container } = render(<SkeletonCards count={1} />);
    const card = container.firstChild?.firstChild as HTMLElement;
    expect(card.className).toMatch(/bg-surface\b/);
    expect(card.className).not.toMatch(/bg-white/);
  });
});
```

- [ ] **Step 22: Rodar o teste e confirmar que falha; corrigir `skeleton.tsx`**

Run: `cd apps/admin-web && npx vitest run src/components/ui/skeleton.test.tsx` → FAIL.

Em `apps/admin-web/src/components/ui/skeleton.tsx`, na função `SkeletonCards`, trocar:

```tsx
        <div key={index} className="rounded-lg border border-border bg-surface p-5">
```

Rodar de novo: `cd apps/admin-web && npx vitest run src/components/ui/skeleton.test.tsx` → PASS.

- [ ] **Step 23: Escrever o teste de `ToastProvider` (falhando)**

Criar `apps/admin-web/src/components/ui/toast.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToastProvider, useToast } from './toast';

function Trigger() {
  const toast = useToast();
  return <button onClick={() => toast.success('Sucesso')}>disparar</button>;
}

describe('ToastProvider', () => {
  it('usa bg-surface no toast (reage ao dark mode), nunca bg-white fixo', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );

    screen.getByText('disparar').click();

    const toastEl = screen.getByRole('status');
    expect(toastEl.className).toMatch(/bg-surface\b/);
    expect(toastEl.className).not.toMatch(/bg-white/);
  });
});
```

- [ ] **Step 24: Rodar o teste e confirmar que falha; corrigir `toast.tsx`**

Run: `cd apps/admin-web && npx vitest run src/components/ui/toast.test.tsx` → FAIL.

Em `apps/admin-web/src/components/ui/toast.tsx`, trocar a linha das classes do toast:

```tsx
                'pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 shadow-popover animate-slide-up bg-surface',
```

Rodar de novo: `cd apps/admin-web && npx vitest run src/components/ui/toast.test.tsx` → PASS.

- [ ] **Step 25: Adicionar caso ao teste existente de `DataTable` (falhando)**

`apps/admin-web/src/components/ui/data-table.test.tsx` já existe (não recriar do zero) — adicionar este `it` dentro do `describe('DataTable', ...)` já existente, junto aos outros:

```tsx
  it('card mobile usa bg-surface (reage ao dark mode), nunca bg-white fixo', () => {
    const { container } = render(
      <DataTable columns={columns} data={[{ id: '1', name: 'Item 1' }]} getRowId={(r) => r.id} />,
    );
    const mobileCard = container.querySelector('.md\\:hidden > div') as HTMLElement;
    expect(mobileCard.className).toMatch(/bg-surface\b/);
    expect(mobileCard.className).not.toMatch(/bg-white/);
  });
```

- [ ] **Step 26: Rodar o teste e confirmar que falha; corrigir `data-table.tsx`**

Run: `cd apps/admin-web && npx vitest run src/components/ui/data-table.test.tsx` → FAIL no novo caso (os demais continuam passando).

Em `apps/admin-web/src/components/ui/data-table.tsx`, no card mobile, trocar:

```tsx
              'rounded-lg border border-border bg-surface p-3.5',
```

Rodar de novo: `cd apps/admin-web && npx vitest run src/components/ui/data-table.test.tsx` → PASS (todos os casos, incluindo os pré-existentes).

- [ ] **Step 27: Corrigir `app-shell.tsx` (sem teste automatizado — ver rationale)**

Em `apps/admin-web/src/components/layout/app-shell.tsx`, trocar:

```tsx
      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface lg:block">
```

`AppShell` depende de `useState` local só para o drawer mobile e renderiza `Header`/`SidebarNav` (que já têm mocks de hook pesados em outros testes) — a mudança aqui é puramente cosmética (uma classe). Cobrimos via a checagem manual da Task 3, Step 4 (já testado visualmente ali) e a checagem final da Task 13.

- [ ] **Step 28: Rodar a suíte inteira desta task + typecheck**

Run: `cd apps/admin-web && npx vitest run src/components/ui/`
Expected: todos os testes de `src/components/ui/` passam (novos e pré-existentes).

Run: `cd apps/admin-web && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 29: Commit**

```bash
git add apps/admin-web/src/components/ui/button.tsx apps/admin-web/src/components/ui/button.test.tsx \
        apps/admin-web/src/components/ui/dropdown.tsx apps/admin-web/src/components/ui/dropdown.test.tsx \
        apps/admin-web/src/components/ui/input.tsx apps/admin-web/src/components/ui/input.test.tsx \
        apps/admin-web/src/components/ui/select.tsx apps/admin-web/src/components/ui/select.test.tsx \
        apps/admin-web/src/components/ui/date-picker.tsx apps/admin-web/src/components/ui/date-picker.test.tsx \
        apps/admin-web/src/components/ui/search-combobox.tsx apps/admin-web/src/components/ui/search-combobox.test.tsx \
        apps/admin-web/src/components/ui/modal.tsx apps/admin-web/src/components/ui/modal.test.tsx \
        apps/admin-web/src/components/ui/drawer.tsx apps/admin-web/src/components/ui/drawer.test.tsx \
        apps/admin-web/src/components/ui/skeleton.tsx apps/admin-web/src/components/ui/skeleton.test.tsx \
        apps/admin-web/src/components/ui/toast.tsx apps/admin-web/src/components/ui/toast.test.tsx \
        apps/admin-web/src/components/ui/data-table.tsx apps/admin-web/src/components/ui/data-table.test.tsx \
        apps/admin-web/src/components/layout/app-shell.tsx
git commit -m "fix(admin-web): remove bg-white fixo de todo o kit base (12 componentes)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Wv4x2xvqtvydhcBVshn4ka"
```

---

### Task 8: `computeMonthOverMonthTrend` (utilitário puro)

**Files:**
- Create: `apps/admin-web/src/utils/trend.util.ts`
- Test: `apps/admin-web/src/utils/trend.util.test.ts`

**Interfaces:**
- Consumes: `DashboardChartPointEntity` (`../types/entities`, já existente: `{ month: string; value: number }`).
- Produces: `export interface Trend { value: string; direction: 'up' | 'down'; favorable: boolean }`; `export function computeMonthOverMonthTrend(series: DashboardChartPointEntity[], direction?: 'higherIsBetter' | 'lowerIsBetter'): Trend | null` — usado pela Task 12 (`dashboard/page.tsx`). O shape de `Trend` é **idêntico** a `StatCardTrend` (Task 6) por design — nenhuma conversão necessária no call site.

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `apps/admin-web/src/utils/trend.util.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeMonthOverMonthTrend } from './trend.util';

describe('computeMonthOverMonthTrend', () => {
  it('retorna null quando a série tem menos de 2 pontos', () => {
    expect(computeMonthOverMonthTrend([])).toBeNull();
    expect(computeMonthOverMonthTrend([{ month: 'Jan/26', value: 100 }])).toBeNull();
  });

  it('retorna null quando o mês anterior é zero (nunca divide por zero)', () => {
    const result = computeMonthOverMonthTrend([
      { month: 'Jan/26', value: 0 },
      { month: 'Fev/26', value: 500 },
    ]);
    expect(result).toBeNull();
  });

  it('higherIsBetter (default): alta é favorável', () => {
    const result = computeMonthOverMonthTrend([
      { month: 'Jan/26', value: 1000 },
      { month: 'Fev/26', value: 1250 },
    ]);
    expect(result).toEqual({ value: '+25.0% vs mês anterior', direction: 'up', favorable: true });
  });

  it('higherIsBetter: queda é desfavorável', () => {
    const result = computeMonthOverMonthTrend([
      { month: 'Jan/26', value: 1000 },
      { month: 'Fev/26', value: 800 },
    ]);
    expect(result).toEqual({ value: '-20.0% vs mês anterior', direction: 'down', favorable: false });
  });

  it('lowerIsBetter: alta é desfavorável mesmo com seta pra cima (ex.: despesa subindo)', () => {
    const result = computeMonthOverMonthTrend(
      [
        { month: 'Jan/26', value: 1000 },
        { month: 'Fev/26', value: 1200 },
      ],
      'lowerIsBetter',
    );
    expect(result).toEqual({ value: '+20.0% vs mês anterior', direction: 'up', favorable: false });
  });

  it('lowerIsBetter: queda é favorável (ex.: despesa caindo)', () => {
    const result = computeMonthOverMonthTrend(
      [
        { month: 'Jan/26', value: 1000 },
        { month: 'Fev/26', value: 700 },
      ],
      'lowerIsBetter',
    );
    expect(result).toEqual({ value: '-30.0% vs mês anterior', direction: 'down', favorable: true });
  });

  it('considera apenas os 2 últimos pontos mesmo com série longa', () => {
    const result = computeMonthOverMonthTrend([
      { month: 'Jan/26', value: 100 },
      { month: 'Fev/26', value: 999 },
      { month: 'Mar/26', value: 200 },
      { month: 'Abr/26', value: 100 },
    ]);
    expect(result).toEqual({ value: '-50.0% vs mês anterior', direction: 'down', favorable: false });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd apps/admin-web && npx vitest run src/utils/trend.util.test.ts`
Expected: FAIL (`./trend.util` não existe).

- [ ] **Step 3: Implementar**

Criar `apps/admin-web/src/utils/trend.util.ts`:

```ts
import type { DashboardChartPointEntity } from '../types/entities';

export interface Trend {
  value: string;
  direction: 'up' | 'down';
  favorable: boolean;
}

// Deriva "este mes vs mes anterior" a partir de uma serie mensal que a API
// JA retorna hoje (DashboardEntity.charts.monthly*) -- nunca inventa dado
// nem faz nova chamada. direction indica o significado de negocio de uma
// alta: 'higherIsBetter' (receita, viagens) ou 'lowerIsBetter' (despesas,
// custo de combustivel).
export function computeMonthOverMonthTrend(
  series: DashboardChartPointEntity[],
  direction: 'higherIsBetter' | 'lowerIsBetter' = 'higherIsBetter',
): Trend | null {
  if (series.length < 2) return null;

  const last = series[series.length - 1]?.value ?? 0;
  const previous = series[series.length - 2]?.value ?? 0;
  if (previous === 0) return null;

  const change = ((last - previous) / Math.abs(previous)) * 100;
  const rose = change >= 0;

  return {
    value: `${rose ? '+' : ''}${change.toFixed(1)}% vs mês anterior`,
    direction: rose ? 'up' : 'down',
    favorable: direction === 'higherIsBetter' ? rose : !rose,
  };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd apps/admin-web && npx vitest run src/utils/trend.util.test.ts`
Expected: PASS (7 testes)

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/utils/trend.util.ts apps/admin-web/src/utils/trend.util.test.ts
git commit -m "feat(admin-web): computeMonthOverMonthTrend a partir da série mensal já existente

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Wv4x2xvqtvydhcBVshn4ka"
```

---

### Task 9: `useCssVar` hook

**Files:**
- Create: `apps/admin-web/src/hooks/use-css-var.ts`
- Test: `apps/admin-web/src/hooks/use-css-var.test.tsx`

**Interfaces:**
- Consumes: `useTheme` (Task 2, `./use-theme`).
- Produces: `export function useCssVar(name: string, fallback: string): string` — lê uma CSS custom property de `document.documentElement` (formato `rgb(R G B)`), recalculada quando o tema muda. Usado pela Task 11 (`monthly-chart-card.tsx`).

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `apps/admin-web/src/hooks/use-css-var.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd apps/admin-web && npx vitest run src/hooks/use-css-var.test.tsx`
Expected: FAIL (`./use-css-var` não existe).

- [ ] **Step 3: Implementar**

Criar `apps/admin-web/src/hooks/use-css-var.ts`:

```ts
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
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd apps/admin-web && npx vitest run src/hooks/use-css-var.test.tsx`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/hooks/use-css-var.ts apps/admin-web/src/hooks/use-css-var.test.tsx
git commit -m "feat(admin-web): useCssVar para ler tokens de tema em contextos fora do CSS (Recharts)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Wv4x2xvqtvydhcBVshn4ka"
```

---

### Task 10: `ChartTooltip` reutilizável (Recharts)

**Files:**
- Create: `apps/admin-web/src/components/charts/chart-tooltip.tsx`
- Test: `apps/admin-web/src/components/charts/chart-tooltip.test.tsx`

**Interfaces:**
- Consumes: nada além de tipos do `recharts` (já dependência) e `cn`.
- Produces: `export function ChartTooltip(props: TooltipProps<ValueType, NameType> & { valueFormatter: (value: number) => string }): JSX.Element | null` — usado pela Task 11.

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `apps/admin-web/src/components/charts/chart-tooltip.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChartTooltip } from './chart-tooltip';

describe('ChartTooltip', () => {
  it('não renderiza nada quando inativo', () => {
    const { container } = render(
      <ChartTooltip active={false} payload={[]} label="Jan/26" valueFormatter={(v) => String(v)} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('não renderiza nada quando não há payload', () => {
    const { container } = render(
      <ChartTooltip active payload={[]} label="Jan/26" valueFormatter={(v) => String(v)} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra o rótulo (mês) e o valor formatado quando ativo', () => {
    render(
      <ChartTooltip
        active
        payload={[{ value: 1234.5, name: 'value', dataKey: 'value', color: '#4f46e5' }]}
        label="Mar/26"
        valueFormatter={(v) => `R$ ${v.toFixed(2)}`}
      />,
    );
    expect(screen.getByText('Mar/26')).toBeInTheDocument();
    expect(screen.getByText('R$ 1234.50')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd apps/admin-web && npx vitest run src/components/charts/chart-tooltip.test.tsx`
Expected: FAIL (`./chart-tooltip` não existe).

- [ ] **Step 3: Implementar**

Criar `apps/admin-web/src/components/charts/chart-tooltip.tsx`:

```tsx
'use client';

import type { TooltipProps } from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';

// Tooltip customizado compartilhado por todos os graficos Recharts do
// projeto (comeca com MonthlyChartCard, Task 11) -- estilo unico
// (bg-surface/border/shadow-popover, reage a dark mode) em vez de repetir
// contentStyle inline em cada grafico.
export function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: TooltipProps<ValueType, NameType> & {
  valueFormatter: (value: number) => string;
}): JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;

  const value = Number(payload[0]?.value ?? 0);

  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-popover">
      <p className="font-medium text-ink-muted">{label}</p>
      <p className="mt-0.5 font-semibold text-ink">{valueFormatter(value)}</p>
    </div>
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd apps/admin-web && npx vitest run src/components/charts/chart-tooltip.test.tsx`
Expected: PASS (3 testes)

- [ ] **Step 5: Rodar typecheck (tipos do Recharts)**

Run: `cd apps/admin-web && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add apps/admin-web/src/components/charts/chart-tooltip.tsx \
        apps/admin-web/src/components/charts/chart-tooltip.test.tsx
git commit -m "feat(admin-web): ChartTooltip reutilizável para gráficos Recharts

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Wv4x2xvqtvydhcBVshn4ka"
```

---

### Task 11: `MonthlyChartCard` — tooltip reutilizável + cores via `useCssVar`

**Files:**
- Modify: `apps/admin-web/src/features/dashboard/monthly-chart-card.tsx`
- Test: `apps/admin-web/src/features/dashboard/monthly-chart-card.test.tsx` (novo)

**Interfaces:**
- Consumes: `ChartTooltip` (Task 10), `useCssVar` (Task 9), `ThemeProvider` (Task 2, só no teste).
- Produces: nenhuma prop pública muda — `MonthlyChartCardProps` idêntica à atual.

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `apps/admin-web/src/features/dashboard/monthly-chart-card.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '../../lib/theme/theme-context';
import { MonthlyChartCard } from './monthly-chart-card';

describe('MonthlyChartCard', () => {
  it('renderiza o título do card', () => {
    render(
      <ThemeProvider>
        <MonthlyChartCard
          title="Receita mensal"
          data={[
            { month: 'Jan/26', value: 1000 },
            { month: 'Fev/26', value: 1200 },
          ]}
        />
      </ThemeProvider>,
    );
    expect(screen.getByText('Receita mensal')).toBeInTheDocument();
  });

  it('renderiza a descrição quando informada', () => {
    render(
      <ThemeProvider>
        <MonthlyChartCard
          title="Receita mensal"
          description="Últimos 12 meses"
          data={[{ month: 'Jan/26', value: 1000 }]}
        />
      </ThemeProvider>,
    );
    expect(screen.getByText('Últimos 12 meses')).toBeInTheDocument();
  });
});
```

Nota: `ResizeObserver` já tem stub global em `vitest.setup.ts` (necessário para `ResponsiveContainer` do Recharts) — nenhuma configuração nova de teste é necessária.

- [ ] **Step 2: Rodar o teste e confirmar que falha ou passa parcialmente**

Run: `cd apps/admin-web && npx vitest run src/features/dashboard/monthly-chart-card.test.tsx`
Expected: pode já passar com a implementação atual (o teste em si não força a troca de tooltip/cores) — **isso é esperado**: este teste é uma rede de segurança de regressão visual básica, não o mecanismo que força a mudança. A mudança real é verificada pelos Steps 3-4 (leitura de código) e pela checagem manual da Task 13.

- [ ] **Step 3: Implementar**

Substituir `apps/admin-web/src/features/dashboard/monthly-chart-card.tsx` inteiro:

```tsx
'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardHeader } from '../../components/ui/card';
import { ChartTooltip } from '../../components/charts/chart-tooltip';
import { useCssVar } from '../../hooks/use-css-var';
import type { DashboardChartPointEntity } from '../../types/entities';
import { formatCurrency, formatNumber } from '../../utils/format';

export function MonthlyChartCard({
  title,
  description,
  data,
  color = '#4f46e5',
  valueFormatter = formatCurrency,
}: {
  title: string;
  description?: string;
  data: DashboardChartPointEntity[];
  color?: string;
  valueFormatter?: (value: number) => string;
}): JSX.Element {
  const gridColor = useCssVar('--color-border', 'rgb(226 232 240)');
  const axisColor = useCssVar('--color-ink-subtle', 'rgb(148 163 184)');

  return (
    <Card>
      <CardHeader title={title} description={description} />
      <div className="h-64 px-3 py-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`gradient-${title}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={gridColor} />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: axisColor }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={48}
              tick={{ fontSize: 11, fill: axisColor }}
              tickFormatter={(value: number) => formatNumber(value)}
            />
            <Tooltip content={<ChartTooltip valueFormatter={valueFormatter} />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              fill={`url(#gradient-${title})`}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd apps/admin-web && npx vitest run src/features/dashboard/monthly-chart-card.test.tsx`
Expected: PASS (2 testes)

- [ ] **Step 5: Rodar typecheck**

Run: `cd apps/admin-web && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add apps/admin-web/src/features/dashboard/monthly-chart-card.tsx \
        apps/admin-web/src/features/dashboard/monthly-chart-card.test.tsx
git commit -m "feat(admin-web): MonthlyChartCard usa ChartTooltip e cores de tema via useCssVar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Wv4x2xvqtvydhcBVshn4ka"
```

---

### Task 12: Dashboard executivo — cards "hero" + tendência real

**Files:**
- Modify: `apps/admin-web/src/app/(app)/dashboard/page.tsx`
- Test: `apps/admin-web/src/app/(app)/dashboard/page.test.tsx` (novo)

**Interfaces:**
- Consumes: `computeMonthOverMonthTrend` (Task 8, `../../../utils/trend.util`); `StatCard` com `variant="gradient"` e `trend` (Task 6, já existente).
- Produces: nada consumido por outra task (última do sub-projeto antes da verificação final).

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `apps/admin-web/src/app/(app)/dashboard/page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DashboardPage from './page';
import { getDashboard } from '../../../lib/api/dashboard.api';

vi.mock('../../../lib/api/dashboard.api', () => ({
  getDashboard: vi.fn(),
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  return actual;
});

function buildDashboardData() {
  return {
    overview: {
      totalTrips: 120,
      activeTrips: 8,
      finishedTrips: 100,
      cancelledTrips: 12,
      totalDrivers: 20,
      activeDrivers: 15,
      totalVehicles: 30,
      availableVehicles: 22,
      maintenanceVehicles: 3,
      fuelStations: 5,
      customers: 40,
    },
    financial: {
      totalRevenue: 500000,
      approvedExpenses: 120000,
      advances: 8000,
      profit: 380000,
      netResult: 372000,
      averageTripRevenue: 4166.67,
      averageTripExpense: 1000,
      largestRevenue: 20000,
      largestExpense: 5000,
      margin: 76,
    },
    operational: {
      todayTrips: 4,
      lateTrips: 1,
      tripsInProgress: 8,
      completedToday: 3,
      kmDriven: 45000,
      averageTripDistance: 375,
    },
    fleet: {
      fuelConsumed: 12000,
      fuelCost: 60000,
      averageConsumptionKmL: 3.2,
      costPerKm: 4.5,
      maintenanceCost: 15000,
      maintenanceOpen: 2,
      maintenanceClosed: 10,
    },
    charts: {
      // Percentuais deliberadamente distintos entre si (25/15/10/5%) --
      // evita que getByText() ambíguo quebre o teste por 2 StatCards
      // mostrarem o mesmo texto de tendência.
      monthlyRevenue: [
        { month: 'Jan/26', value: 400000 },
        { month: 'Fev/26', value: 500000 },
      ],
      monthlyExpenses: [
        { month: 'Jan/26', value: 100000 },
        { month: 'Fev/26', value: 115000 },
      ],
      monthlyFuelCost: [
        { month: 'Jan/26', value: 50000 },
        { month: 'Fev/26', value: 55000 },
      ],
      monthlyTrips: [
        { month: 'Jan/26', value: 100 },
        { month: 'Fev/26', value: 105 },
      ],
    },
  };
}

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '../../../lib/theme/theme-context';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('DashboardPage', () => {
  it('mostra tendência real (derivada da série mensal) nas 4 KPIs com histórico', async () => {
    vi.mocked(getDashboard).mockResolvedValue(buildDashboardData());
    renderPage();

    expect(await screen.findByText('+25.0% vs mês anterior')).toBeInTheDocument(); // Receita: 400k -> 500k
    expect(screen.getByText('+15.0% vs mês anterior')).toBeInTheDocument(); // Despesas: 100k -> 115k
    expect(screen.getByText('+10.0% vs mês anterior')).toBeInTheDocument(); // Combustível: 50k -> 55k
    expect(screen.getByText('+5.0% vs mês anterior')).toBeInTheDocument(); // Viagens: 100 -> 105
  });

  it('Resultado líquido não mostra tendência (sem série mensal correspondente)', async () => {
    vi.mocked(getDashboard).mockResolvedValue(buildDashboardData());
    renderPage();

    await screen.findByText('Resultado líquido');
    const label = screen.getByText('Resultado líquido');
    const card = label.closest('div')?.parentElement as HTMLElement;
    expect(card.textContent).not.toMatch(/vs mês anterior/);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd apps/admin-web && npx vitest run "src/app/(app)/dashboard/page.test.tsx"`
Expected: FAIL (nenhum `trend` é passado ainda para nenhum `StatCard`).

- [ ] **Step 3: Implementar**

Em `apps/admin-web/src/app/(app)/dashboard/page.tsx`:

1. Adicionar o import do utilitário (junto aos outros de `../../../utils/`):

```tsx
import { computeMonthOverMonthTrend } from '../../../utils/trend.util';
```

2. Na seção "Visão geral", trocar o card "Viagens totais":

```tsx
              <StatCard
                label="Viagens totais"
                value={formatNumber(query.data.overview.totalTrips)}
                icon={RouteIcon}
                trend={computeMonthOverMonthTrend(query.data.charts.monthlyTrips) ?? undefined}
              />
```

3. Na seção "Financeiro", trocar os cards "Receita total" e "Despesas aprovadas" (os demais desta seção ficam como estão):

```tsx
              <StatCard
                label="Receita total"
                value={formatCurrency(query.data.financial.totalRevenue)}
                icon={TrendingUp}
                variant="gradient"
                trend={computeMonthOverMonthTrend(query.data.charts.monthlyRevenue) ?? undefined}
              />
              <StatCard
                label="Despesas aprovadas"
                value={formatCurrency(query.data.financial.approvedExpenses)}
                icon={Wallet}
                tone="danger"
                trend={
                  computeMonthOverMonthTrend(query.data.charts.monthlyExpenses, 'lowerIsBetter') ??
                  undefined
                }
              />
              <StatCard
                label="Adiantamentos"
                value={formatCurrency(query.data.financial.advances)}
                icon={Banknote}
              />
              <StatCard
                label="Resultado líquido"
                value={formatCurrency(query.data.financial.netResult)}
                icon={PiggyBank}
                variant="gradient"
              />
```

(O `tone` original do card "Resultado líquido" — que variava conforme `netResult >= 0` — deixa de fazer efeito na variante `gradient`, que sempre usa o gradiente `brand-700→900`; por isso é removido daqui. Os cards "Lucro" e "Margem" abaixo continuam sem alteração.)

4. Na seção "Frota", trocar o card "Custo com combustível":

```tsx
              <StatCard
                label="Custo com combustível"
                value={formatCurrency(query.data.fleet.fuelCost)}
                trend={
                  computeMonthOverMonthTrend(query.data.charts.monthlyFuelCost, 'lowerIsBetter') ??
                  undefined
                }
              />
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd apps/admin-web && npx vitest run "src/app/(app)/dashboard/page.test.tsx"`
Expected: PASS (2 testes)

- [ ] **Step 5: Rodar typecheck**

Run: `cd apps/admin-web && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add "apps/admin-web/src/app/(app)/dashboard/page.tsx" \
        "apps/admin-web/src/app/(app)/dashboard/page.test.tsx"
git commit -m "feat(admin-web): dashboard — KPIs hero (gradient) + tendência real vs mês anterior

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Wv4x2xvqtvydhcBVshn4ka"
```

---

### Task 13: Verificação final

**Files:** nenhum arquivo novo — apenas comandos de verificação sobre tudo que as Tasks 1-12 produziram.

- [ ] **Step 1: Suíte de testes completa do `admin-web`**

Run: `cd apps/admin-web && npx vitest run`
Expected: todos os testes passam, incluindo os pré-existentes (nenhuma asserção antiga quebrada pelas mudanças de token/`Card`/`StatCard`).

- [ ] **Step 2: Typecheck**

Run: `cd apps/admin-web && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Lint**

Run: `cd apps/admin-web && npm run lint`
Expected: sem erros (avisos pré-existentes não relacionados a este trabalho podem ficar).

- [ ] **Step 4: Build de produção**

Run: `cd apps/admin-web && npm run build`
Expected: build conclui sem erro (confirma que o Recharts/CSS vars funcionam também no bundle de produção, não só em dev).

- [ ] **Step 5: Checagem visual manual — dark mode não quebra telas fora do escopo**

Run: `cd apps/admin-web && npm run dev`, logar no admin-web e, com o `ThemeToggle` no escuro:
- Abrir `/dashboard` — confirmar que os 2 cards gradient, os cards com tendência (seta+cor coerentes) e os 4 gráficos mensais (grid/eixo/tooltip) estão legíveis.
- Abrir `/trips` (listagem) e uma página `/trips/[id]` (qualquer aba, ex. "Financeiro") — confirmar que nada ficou ilegível (texto invisível, fundo quebrado) mesmo sem terem sido tocadas nesta fase — a mudança é só na definição do token, então o risco é baixo, mas a checagem é obrigatória antes de considerar o sub-projeto fechado.
- Alternar claro → escuro → sistema → claro pelo `ThemeToggle` repetidamente — sem flash, sem erro no console do navegador.

- [ ] **Step 6: Registrar o resultado (sem commit de código nesta task)**

Se o Step 5 encontrar qualquer regressão visual fora do escopo (ex.: um componente com cor bruta não mapeada na auditoria), **não corrigir silenciosamente** — anotar o achado e decidir com o usuário se entra neste sub-projeto (fix pontual, mesmo padrão das Tasks 5-7) ou fica registrado para o próximo sub-projeto (rollout das 17 abas).

## Após a Task 13

Sub-projeto 1 completo: fundação de tema (dark/light/system com toggle) + Dashboard executivo repaginado. Próximos sub-projetos (cada um com seu próprio brainstorming → spec → plano), na ordem sugerida no spec: (1) 17 abas de `/trips/[id]`, (2) dashboards de frota/financeiro, (3) sidebar retrátil, (4) listagens CRUD restantes.
