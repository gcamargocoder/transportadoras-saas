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
