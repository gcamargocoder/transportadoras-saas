# Repaginação visual do admin-web — Sub-projeto 1: Fundação de tema (dark mode) + Dashboard executivo

## Contexto

Pedido do usuário: elevar a UI do `admin-web` (SaaS de transportadoras) a um
padrão visual de produto profissional — cards de KPI com tendência, gráficos
modernos, tabelas operacionais, dark/light mode, responsividade mobile —
**sem alterar regra de negócio, chamadas de API ou dados**.

Auditoria prévia (ver conversa) mostrou que o `admin-web` **já tem** boa
parte da base pedida: tokens semânticos no Tailwind (`surface/border/ink/
brand/success/warning/danger/info`), 30 componentes de UI kit com bordas
arredondadas e sombras suaves, `StatCard` com prop de tendência (não usada),
gráficos Recharts com área em gradiente e tooltip customizado, e
`DataTable` que já colapsa para cards no mobile. **O gap real é dark mode
(0% implementado)** e o uso efetivo da tendência nos KPIs — o resto do
pedido (17 abas da viagem, dashboards de frota, sidebar retrátil) fica para
sub-projetos seguintes, listados na seção "Fora de escopo".

Este documento cobre **apenas o primeiro sub-projeto**, aprovado em
conversa: fundação de tema (dark mode com toggle completo) + repaginação do
Dashboard executivo (`/dashboard`).

## Objetivo

1. Introduzir suporte real a dark/light/system mode em todo o `admin-web`,
   sem quebrar nenhuma tela existente, aproveitando que a maioria dos
   componentes já usa classes semânticas (`bg-surface`, `text-ink`,
   `border-border` etc.) em vez de cor bruta.
2. Repaginar o Dashboard executivo (`/dashboard`) como vitrine da nova
   fundação: KPIs com tendência real (quando há dado), hierarquia visual
   (cards "hero" vs. secundários), gráficos com paleta/tooltip consistentes
   e dark mode.

## Não-objetivos (explícito)

- Nenhuma mudança de endpoint, DTO, entidade ou regra de negócio no backend
  ou no client de API do frontend (`src/lib/api/*`).
- Nenhum dado inventado: tendência só aparece nas 4 métricas que já têm
  série histórica mensal (`charts.monthlyRevenue/Expenses/FuelCost/Trips`);
  as demais ~36 KPIs do dashboard continuam sem selo de tendência nesta
  fase.
- Nenhuma das 17 abas de `/trips/[id]`, dashboards de frota/financeiro,
  listagens CRUD, Driver App ou sidebar retrátil — ficam para sub-projetos
  seguintes (ver "Fora de escopo").
- Nenhuma dependência nova (`next-themes` etc.) — toggle de tema escrito à
  mão (~30 linhas), reaproveitando o padrão já existente de contexto React
  do projeto (`AuthProvider`).
- Nenhuma migration, nenhuma mudança de schema.

## Arquitetura

### 1. Tokens de cor via CSS custom properties

Hoje `tailwind.config.ts` define cor como hex fixo (`surface.DEFAULT:
'#ffffff'`). Passa a definir cada tom como
`rgb(var(--color-<nome>) / <alpha-value>)`, e os valores reais (`R G B`,
sem `rgb()`) viram CSS custom properties em `globals.css`:

```css
:root {
  --color-surface: 255 255 255;
  --color-surface-subtle: 248 250 252;
  --color-surface-muted: 241 245 249;
  --color-border: 226 232 240;
  --color-border-strong: 203 213 225;
  --color-ink: 15 23 42;
  --color-ink-muted: 71 85 105;
  --color-ink-subtle: 148 163 184;
  /* brand/success/warning/danger/info: uma var por step já usado
     (50/100/500/600/700 — ver tailwind.config.ts atual) */
}

:root.dark {
  --color-surface: 15 23 28;        /* grafite escuro, não preto puro */
  --color-surface-subtle: 10 15 20;
  --color-surface-muted: 23 30 38;
  --color-border: 40 50 61;
  --color-border-strong: 55 68 82;
  --color-ink: 236 240 245;
  --color-ink-muted: 170 181 196;
  --color-ink-subtle: 110 122 138;
  /* brand/success/warning/danger/info: variantes calibradas p/ contraste
     AA sobre fundo escuro (passos 400/500 em vez de 500/600 nos textos) */
}
```

Efeito: **qualquer componente que já usa `bg-surface`, `text-ink`,
`border-border`, `bg-success-50` etc. ganha dark mode automaticamente**,
sem editar o componente. Confirmado por auditoria: `Card`, `StatCard`,
`Badge`, `Button` (variantes `secondary`/`outline`/`ghost`), `Tabs`,
`DataTable`, `Dropdown`, `Modal`, `Drawer` já seguem esse padrão.

**Exceção a corrigir uma a uma** (cor bruta encontrada na auditoria):
`Card`/`app-shell.tsx`/`header.tsx` usam `bg-white` literal em vez de
`bg-surface` (mesmo valor em claro, mas não reage ao escuro — precisa
virar `bg-surface`); `monthly-chart-card.tsx` usa hex fixo no `stroke`/
`fill` do grid e eixos do Recharts (`#e2e8f0`, `#94a3b8`) — passam a ler a
cor via `getComputedStyle`/CSS var no runtime do gráfico (Recharts não
aceita classe Tailwind em `stroke`, então lemos a var computada).

### 2. Estratégia dark mode: `darkMode: 'class'` + 3 estados (claro/escuro/sistema)

- `tailwind.config.ts`: adiciona `darkMode: 'class'`.
- Novo `src/lib/theme/theme-context.tsx`: `ThemeProvider` + hook `useTheme()`
  — mesmo padrão de `AuthProvider` (`src/lib/auth/auth-context.tsx`).
  Estado: `'light' | 'dark' | 'system'`, persistido em
  `localStorage['theme']`. Quando `'system'`, escuta
  `matchMedia('(prefers-color-scheme: dark)')` e reage a mudança em tempo
  real. Aplica/remove a classe `dark` em `document.documentElement`.
- Script bloqueante em `src/app/layout.tsx` (`<head><script
  dangerouslySetInnerHTML>`): lê `localStorage['theme']` e aplica a classe
  `dark` em `<html>` **antes do primeiro paint**, evitando flash de tema
  errado (FOUC) — mesma técnica documentada pelo próprio Next.js para dark
  mode sem lib. Roda antes de qualquer JS de React.
- `ThemeProvider` entra em `src/app/providers.tsx`, envolvendo tudo (não
  depende de auth/query).
- Novo `src/components/ui/theme-toggle.tsx`: botão no `Header` com 3
  ícones (`Sun`/`Moon`/`Monitor`, lucide-react, já é dependência do
  projeto) num `Dropdown` já existente (reaproveita o componente, não cria
  um menu novo).

### 3. Tendência nos KPIs (só onde há dado real)

Novo utilitário puro `src/utils/trend.util.ts`:

```ts
export function computeMonthOverMonthTrend(
  series: DashboardChartPointEntity[],
): { value: string; positive: boolean } | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1].value;
  const previous = series[series.length - 2].value;
  if (previous === 0) return null; // nunca divide por zero / infla %
  const change = ((last - previous) / Math.abs(previous)) * 100;
  return {
    value: `${change >= 0 ? '+' : ''}${change.toFixed(1)}% vs mês anterior`,
    positive: change >= 0,
  };
}
```

Testado isoladamente (`trend.util.spec.ts`): série vazia/1 ponto → `null`;
`previous = 0` → `null` (nunca `Infinity`/`NaN`); variação positiva/
negativa/zero. Usado em `dashboard/page.tsx` só para as 4 StatCards que já
têm `query.data.charts.monthly*` correspondente — nenhuma outra KPI ganha
`trend` nesta fase (não há série pra elas).

## Componentes afetados (kit base)

Mudança sempre aditiva — nenhuma prop existente muda de nome/tipo/
comportamento em modo claro.

- **`card.tsx`**: `bg-white` → `bg-surface`. Nova prop opcional
  `interactive?: boolean` (default `false`, não quebra nenhum uso
  existente) que adiciona `transition-shadow hover:shadow-sm` — evita
  aplicar afetivo de "hover" em cards que não reagem a nada (a maioria dos
  ~50 usos de `Card` no projeto hoje é estática, ex. seções da aba
  Financeiro).
- **`stat-card.tsx`**: `bg-white` → `bg-surface`; variante `default` passa
  `interactive` internamente (microinteração sutil só nos KPI cards, que
  são o alvo real do pedido); ajuste de tom em
  `variant="gradient"` para o par light/dark do brand (já usa
  `brand-700/900`, que funcionam nos dois temas sem alteração — só
  confirma contraste).
- **`badge.tsx`**, **`button.tsx`**: já 100% em tokens semânticos, exceto
  `button.tsx` `outline` (`bg-white` → `bg-surface`). Nenhuma outra
  mudança.
- **`data-table.tsx`**: já usa tokens; sem mudança funcional, só confirma
  dark mode visualmente (dado que já colapsa pra cards no mobile).
- **`tabs.tsx`**: confirma tokens (sem mudança esperada).
- **`app-shell.tsx`**: `bg-white` (aside) → `bg-surface`.
- **`header.tsx`**: `bg-white/85` → `bg-surface/85`; adiciona
  `<ThemeToggle />` ao lado do sino de notificações.

## Dashboard executivo (`dashboard/page.tsx`)

- As 4 seções mantêm todas as ~40 KPIs atuais (nenhuma métrica removida).
  Duas mudanças visuais:
  1. **Hero cards**: "Receita total" e "Resultado líquido" passam a usar
     `variant="gradient"` (já existe no `StatCard`, hoje sem uso) — 2
     cards de destaque por página, mesmo critério do comentário já
     existente no componente ("uso pontual, 1 métrica por dashboard",
     ajustado para 2 aqui por serem as 2 âncoras financeiras).
  2. **Trend real**: "Receita total", "Despesas aprovadas", "Custo com
     combustível" e "Viagens totais" recebem `trend={computeMonthOverMonthTrend(...)}`
     a partir da série mensal correspondente já retornada por
     `getDashboard()`.
- `monthly-chart-card.tsx`: tooltip customizado extraído para
  `src/components/charts/chart-tooltip.tsx` (reaproveitado depois por
  outros gráficos Recharts do projeto, sem duplicar estilo); grid/eixo
  lendo cor via CSS var (dark mode); mantém `AreaChart` com gradiente
  (já é o padrão certo, só ajusta cor).

## Fluxo de dados (confirmação)

Nenhuma chamada de API muda. `getDashboard()` continua devolvendo
exatamente `DashboardEntity` como hoje. `computeMonthOverMonthTrend` é uma
função pura client-side sobre um array que já chega no payload atual — não
há novo fetch, novo parâmetro de query nem novo campo de resposta.

## Arquivos

**Novos:**
- `src/lib/theme/theme-context.tsx` — `ThemeProvider` + `useTheme()`
- `src/components/ui/theme-toggle.tsx` — botão de troca de tema
- `src/components/charts/chart-tooltip.tsx` — tooltip Recharts reutilizável
- `src/utils/trend.util.ts` + `src/utils/trend.util.spec.ts`
- `src/lib/theme/theme-context.test.tsx` (persistência, `system`, aplicação da classe)
- `src/components/ui/theme-toggle.test.tsx`

**Modificados:**
- `apps/admin-web/tailwind.config.ts` — `darkMode: 'class'`, cores → `rgb(var(...) / <alpha-value>)`
- `apps/admin-web/src/app/globals.css` — CSS vars `:root` / `:root.dark`
- `apps/admin-web/src/app/layout.tsx` — script anti-FOUC no `<head>`
- `apps/admin-web/src/app/providers.tsx` — envolve com `ThemeProvider`
- `apps/admin-web/src/components/ui/card.tsx`
- `apps/admin-web/src/components/ui/stat-card.tsx`
- `apps/admin-web/src/components/ui/button.tsx`
- `apps/admin-web/src/components/layout/app-shell.tsx`
- `apps/admin-web/src/components/layout/header.tsx`
- `apps/admin-web/src/app/(app)/dashboard/page.tsx`
- `apps/admin-web/src/features/dashboard/monthly-chart-card.tsx`

Sem migration (nenhuma mudança de banco/API). Sem novo pacote no
`package.json`.

## Testes

- `trend.util.spec.ts`: casos descritos acima (unitário, sem DOM).
- `theme-context.test.tsx`: aplica/remove classe `dark`; persiste em
  `localStorage`; reage a `matchMedia` quando `system`.
- `theme-toggle.test.tsx`: alterna os 3 estados, chama o contexto certo.
- `dashboard/page.test.tsx` (já existe — se não, criar): confirma que
  `trend` aparece só nas 4 KPIs com série e é `undefined` nas demais;
  snapshot não quebra com `query.data` mockado.
- Regressão manual: alternar claro/escuro/sistema em `/dashboard` e em ao
  menos 2 outras telas (ex.: `/trips`, uma aba de `/trips/[id]`) para
  confirmar que nenhum componente do kit base ficou ilegível (contraste)
  fora do escopo desta fase — não é um teste automatizado, é checagem
  visual antes de fechar o sub-projeto.
- `tsc --noEmit`, `eslint`, build (`next build`) do `admin-web` ao final.

## Riscos e mitigação

- **Contraste insuficiente no escuro** em algum tom (`brand-50` sobre
  fundo escuro, por exemplo, usado em `Badge`/`StatCard` ícone) — mitigado
  calibrando os steps 50/100 dos tons operacionais especificamente para o
  tema escuro (não é 1:1 com o claro; ver CSS vars acima "variantes
  calibradas").
- **Recharts não lê classe Tailwind** — mitigado lendo a CSS var via
  `getComputedStyle(document.documentElement)` num pequeno hook
  (`useCssVar`) dentro de `monthly-chart-card.tsx`, recalculado quando o
  tema muda.
- **Regressão visual em telas fora do escopo** (17 abas de viagem etc.):
  como a mudança é na definição do token (não no componente em si), o
  risco é baixo, mas a checagem manual acima cobre isso antes de fechar.

## Fora de escopo (sub-projetos seguintes, cada um com seu próprio ciclo)

1. Repaginação das 17 abas de `/trips/[id]` (Financeiro, Despesas, Rota,
   Ocorrências etc.).
2. Dashboards de frota/financeiro (`/operations/fleet/*`) e
   `/customer-profitability`.
3. Sidebar retrátil no desktop (hoje fixa + drawer mobile).
4. Listagens CRUD restantes (motoristas, veículos, clientes, etc.).
5. Eventual fase de backend para série histórica "vs período anterior" nas
   demais KPIs do dashboard (fora de escopo de frontend).
