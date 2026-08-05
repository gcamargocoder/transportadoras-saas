import type { Metadata } from 'next';
import './globals.css';

// Layout raiz minimo. Nenhum componente de navegacao, autenticacao
// ou dashboard de negocio foi criado nesta etapa.
export const metadata: Metadata = {
  title: 'Painel Administrativo — Transportadoras SaaS',
  description: 'Fundacao do painel administrativo (em construcao)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
