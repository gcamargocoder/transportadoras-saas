import type { Metadata } from 'next';
import 'leaflet/dist/leaflet.css';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Painel Administrativo — Transportadoras SaaS',
  description: 'Gestão de viagens, frota, pedágios e financeiro para transportadoras.',
};

export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <html lang="pt-BR">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
